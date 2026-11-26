"""Driver backing and academy agreements have their own parties, terms and cash flows."""

from calendar import monthrange
from datetime import date, timedelta
from .domain import RuleError
from .personnel import active, age_on, bookings, evaluate, shifted
from .development_path import available_staff, preference


def agreement(
    key,
    pid,
    source,
    payer,
    monthly,
    start,
    end,
    *,
    portable,
    team=None,
    guarantee=False,
    minimum_starts=0,
    best_place=None,
):
    return dict(
        id=key,
        person=pid,
        source=source,
        payer=payer,
        monthly_cents=monthly,
        start=start,
        end=end,
        portable=portable,
        team=team,
        guarantee=guarantee,
        minimum_starts=minimum_starts,
        best_place=best_place,
        exit_cents=monthly if guarantee else 0,
        paid_cents=0,
        arrears={},
        status="active",
        reason=None,
    )


def initialize(state, world):
    day = state["date"]
    state.update(funding={}, backers={}, academies={}, scholarships={}, starts={})
    for key, v in world["staff_rules"]["academies"].items():
        state["academies"][key] = dict(
            id=key,
            org=v["org"],
            name=v["name"],
            budget_cents=state["accounts"][v["org"]]["budget_cents"] // 15,
            spent_cents=0,
        )
    for spec in world["staff_rules"]["backing"]:
        pid = spec["person"]
        seats = bookings(state, pid)
        org = world["assignments"][seats[0][0]]["org"] if seats else None
        source = spec["source"]
        payer = spec.get("payer") or source + "-" + pid
        key = "fund-" + payer + "-" + pid
        value = spec["monthly_cents"]
        if payer not in state["accounts"]:
            balance = value * spec.get("months_reserved", 11)
            state["backers"][payer] = balance
        state["funding"][key] = agreement(
            key,
            pid,
            source,
            payer,
            value,
            day,
            "2026-01-01",
            portable=spec["portable"],
            team=org,
            guarantee=spec.get("guarantee", False),
            minimum_starts=spec.get("minimum_starts", 0),
            best_place=spec.get("best_place"),
        )
    # An academy scholarship predates the career but covers a third-party F2 entry.
    academy = state["academies"]["ferrari-academy"]
    if day < "2025-12-01":
        enroll(
            state, world, academy, "driver-046", 120000, day, "2025-12-01", True, True
        )


def enroll(
    state, world, academy, pid, monthly, start, end, option, priority, recipient=None
):
    if recipient and world["organizations"].get(recipient, {}).get("kind") != "team":
        raise RuleError("Получателем оплаты места должна быть гоночная команда.")
    p = state["people"].get(pid)
    if not p or p["position"] != "driver" or not state["date"] <= start < end:
        raise RuleError("Проверьте пилота и срок академического договора.")
    if any(
        s["person"] == pid and s["start"] < end and s["end"] > start
        for s in state["scholarships"].values()
    ):
        raise RuleError("Период пересекается с академическим договором.")
    staff = available_staff(
        state, world, academy["org"], {"academy-director"}, academy["id"]
    )
    if not staff:
        raise RuleError("Для заключения договора нужен руководитель академии.")
    max_age = world["staff_rules"]["academies"][academy["id"]].get("max_age")
    if max_age is not None and age_on(p, start) > max_age:
        raise RuleError(
            f"Программа развития принимает воспитанников до {max_age} лет включительно."
        )
    head = staff[0]
    # Directors commit a share of the remaining program budget to each recruit.
    limit = (
        (academy["budget_cents"] - academy["spent_cents"])
        * evaluate(head, world, state["date"])["values"]["Бюджет"]
        // 100
    )
    reserve = sum(
        s["reserved_cents"]
        for s in state["scholarships"].values()
        if s["academy"] == academy["id"] and s["end"] > state["date"]
    )
    span = (date.fromisoformat(end) - date.fromisoformat(start)).days
    obligation = (monthly * span + 27) // 28
    if obligation + reserve > limit:
        raise RuleError(
            "Запрашиваемое финансирование превышает свободный бюджет академии."
        )
    key = f"{academy['id']}-{pid}-{state['revision']}"
    state["scholarships"][key] = dict(
        id=key,
        academy=academy["id"],
        person=pid,
        start=start,
        end=end,
        option=option,
        option_days=90,
        priority=priority,
        priority_until=None,
        exercised=False,
        reserved_cents=obligation,
    )
    state["funding"][key] = agreement(
        key,
        pid,
        "academy",
        academy["org"],
        monthly,
        start,
        end,
        portable=not recipient,
        team=recipient,
    )


def quote(state, pid, org, day, agreements=None):
    deals = state["funding"].values() if agreements is None else agreements
    return sum(
        r["monthly_cents"]
        for r in deals
        if r["person"] == pid
        and r["status"] == "active"
        and active(r, day)
        and (r["portable"] or r["team"] == org)
        and r["payer"] != org
    )


def cutoff(state, r, day, reason):
    r.update(end=min(r["end"], day), status="ended", reason=reason)
    if r["id"] in state["scholarships"]:
        state["scholarships"][r["id"]]["end"] = r["end"]
    state["notices"].append(
        dict(date=day, text=state["people"][r["person"]]["name"] + " · " + reason)
    )


def reassigned(state, pid, org, day, former=None):
    for r in state["funding"].values():
        if (
            r["person"] == pid
            and active(r, day)
            and (former is None or r["team"] == former)
            and not r["portable"]
            and r["team"] != org
        ):
            cutoff(state, r, day, "Поддержка прежнего места прекращена")


def can_leave(state, pid, org, day):
    if any(
        r["person"] == pid and r["team"] == org and r["guarantee"] and active(r, day)
        for r in state["funding"].values()
    ):
        raise RuleError(
            "Место гарантировано. Сначала прекратите поддержку с компенсацией."
        )


def move_money(state, payer, recipient, key, amount, source):
    from .employment import post

    if not amount or payer == recipient:
        return
    for org, delta in ((payer, -amount), (recipient, amount)):
        if org in state["accounts"]:
            post(state, org, key, delta, source)
        else:
            state["backers"][org] += delta
            state["ledger"].append(
                dict(
                    org=org,
                    key=key,
                    date=state["date"],
                    delta_cents=delta,
                    source=source,
                )
            )


def monthly(state, world):
    """Settle the earned days by employment history, including mid-month moves and exits."""
    end = date.fromisoformat(state["date"])
    first = (end - timedelta(days=1)).replace(day=1)
    days = monthrange(first.year, first.month)[1]
    for key, r in sorted(state["funding"].items()):
        left = max(first, date.fromisoformat(r["start"]))
        right = min(end, date.fromisoformat(r["end"]))
        owed = dict(r["arrears"])
        if left < right:
            seats = sorted(bookings(state, r["person"]))
            quantities = {}
            while left < right:
                day = left.isoformat()
                # One designated place receives the payment even for a dual mandate.
                employers = [
                    world["assignments"][aid]["org"]
                    for aid, row in seats
                    if active(row, day)
                ]
                org = (
                    r["team"] if r["team"] in employers else next(iter(employers), None)
                )
                if org and (r["portable"] or r["team"] == org):
                    quantities[org] = quantities.get(org, 0) + 1
                left += timedelta(days=1)
            for org, n in quantities.items():
                owed[org] = owed.get(org, 0) + r["monthly_cents"] * n // days
        r["arrears"] = {}
        for org, amount in sorted(owed.items()):
            payer = r["payer"]
            cash = (
                state["accounts"][payer]["cash_cents"]
                if payer in state["accounts"]
                else state["backers"][payer]
            )
            scholarship = state["scholarships"].get(key)
            academy = (
                state["academies"][scholarship["academy"]] if scholarship else None
            )
            if payer in state["accounts"] and payer != org:
                cash = max(0, cash - state["accounts"][payer]["payroll_cents"])
            if academy:
                cash = min(cash, academy["budget_cents"] - academy["spent_cents"])
            paid = min(cash, amount)
            move_money(
                state,
                payer,
                org,
                key + "-" + org + "-" + str(end),
                paid,
                "driver-backing",
            )
            r["paid_cents"] += paid
            if academy:
                academy["spent_cents"] += paid
                scholarship["reserved_cents"] = max(
                    0, scholarship["reserved_cents"] - paid
                )
            if paid < amount:
                r["arrears"][org] = amount - paid
                if r["status"] == "active":
                    cutoff(
                        state,
                        r,
                        state["date"],
                        "Платёж просрочен, поддержка прекращена",
                    )
        if r["status"] == "active" and r["end"] <= state["date"]:
            r.update(status="ended", reason="Срок договора истёк")


def record_result(
    state, pid, event_id, day, *, place=None, licence_points=0, world=None, entry=None
):
    """#8/#15 submit a classified result with points awarded by that event's rules."""
    if licence_points < 0 or (place is not None and place < 1):
        raise RuleError("Некорректная классификация.")
    person = state["people"][pid]
    records = state["starts"].setdefault(pid, {})
    result = dict(day=day, place=place, licence_points=licence_points)
    if entry is not None:
        car = world["entries"].get(entry) if world else None
        if not car or not any(
            world["assignments"][aid]["entry"] == entry and active(row, day)
            for aid, row in bookings(state, pid)
        ):
            raise RuleError(
                "Не подтверждено назначение в заявке на дату классификации."
            )
        result.update(org=car["org"], series=car["championship"], entry=entry)
        rules = world["championships"][car["championship"]]
        if "superlicence" in rules:
            weekend = next(
                (
                    e
                    for e in world["events"]
                    if e["series"] == car["championship"]
                    and e["kind"] == "round"
                    and e["start"] <= day <= e["end"]
                ),
                None,
            )
            if not weekend or licence_points:
                raise RuleError(
                    "Для результата нужны даты этапа. Лицензионные баллы присуждаются за сезон."
                )
            result.update(
                version=1,
                season_id=weekend["season_id"],
                round_id=weekend["id"],
                session_id=event_id,
                track_id=weekend["track_id"],
                layout_id=weekend["layout_id"],
            )
    if event_id in records:
        if records[event_id] != result:
            raise RuleError("Результат этапа уже зафиксирован.")
        return
    records[event_id] = result
    person["credentials"]["points"] += licence_points


def condition_review(state, day):
    for r in state["funding"].values():
        if r["status"] != "active":
            continue
        if r["end"] <= day:
            r.update(status="ended", reason="Срок договора истёк")
        elif r["minimum_starts"] and day == shifted(r["start"], 90):
            starts = [
                result
                for result in state["starts"].get(r["person"], {}).values()
                if r["start"] <= result["day"] <= day
            ]
            classified = [
                result["place"] for result in starts if result["place"] is not None
            ]
            if len(starts) < r["minimum_starts"] or (
                r["best_place"]
                and not any(place <= r["best_place"] for place in classified)
            ):
                cutoff(
                    state,
                    r,
                    day,
                    "Спортивные условия поддержки не выполнены",
                )


def exercise_option(state, s, day):
    """Extend the scholarship and its funding on the agreed rate, reserving the cost."""
    a = state["academies"][s["academy"]]
    funding = state["funding"][s["id"]]
    end = shifted(s["end"], s["option_days"])
    reserved = sum(
        t["reserved_cents"]
        for t in state["scholarships"].values()
        if t["academy"] == a["id"] and t["end"] > day
    )
    extra = (funding["monthly_cents"] * s["option_days"] + 27) // 28
    overlap = any(
        t["id"] != s["id"]
        and t["person"] == s["person"]
        and t["end"] > s["end"]
        and t["start"] < end
        for t in state["scholarships"].values()
    )
    if overlap or extra + reserved + a["spent_cents"] > a["budget_cents"]:
        return False
    s.update(
        exercised=True,
        end=end,
        reserved_cents=s["reserved_cents"] + extra,
        priority_until=min(end, shifted(day, 10)),
    )
    funding["end"] = end
    return True


def right_of_first_offer(state, pid, org, day):
    for s in state["scholarships"].values():
        if (
            s["person"] != pid
            or not active(s, day)
            or state["academies"][s["academy"]]["org"] == org
        ):
            continue
        if (s["exercised"] and day < s["priority_until"]) or (
            s["priority"] and (not s["priority_until"] or day < s["priority_until"])
        ):
            raise RuleError(
                "У академии приоритет переговоров. Запросите окно для ответа академии."
            )


def command(state, world, action, args):
    org = state["setup"]["org"]
    day = state["date"]
    if action == "academy-enroll":
        a = state["academies"].get(args["academy"])
        if state["setup"]["role"] != "owner" or not a or a["org"] != org:
            raise RuleError("Договор заключает владелец программы.", 403)
        enroll(
            state,
            world,
            a,
            args["person"],
            args["monthly_cents"],
            day,
            args["end"],
            args["option"],
            args["priority"],
            args.get("recipient") or None,
        )
    elif action == "manufacturer-backing":
        p = state["people"].get(args["person"])
        client = args["recipient"]
        supplied = any(
            e["org"] == client and org in world["cars"][e["car"]]["suppliers"].values()
            for e in world["entries"].values()
        )
        if state["setup"]["role"] != "manufacturer" or not supplied:
            raise RuleError(
                "Производитель может заключить договор по заявке своего клиента.", 403
            )
        if (
            not p
            or p["position"] != "driver"
            or args["end"] <= day
            or args["monthly_cents"] > state["accounts"][org]["cash_cents"]
        ):
            raise RuleError("Проверьте пилота, сумму и срок финансирования.")
        if any(
            r["payer"] == org and r["person"] == p["id"] and active(r, day)
            for r in state["funding"].values()
        ):
            raise RuleError("У производителя уже есть договор с пилотом.")
        if args["guarantee"] and not any(
            world["assignments"][aid]["org"] == client
            and active(row, day)
            and (not row["end"] or row["end"] >= args["end"])
            for aid, row in bookings(state, p["id"])
        ):
            raise RuleError(
                "Для гарантии требуется контракт с командой на весь срок поддержки."
            )
        key = f"factory-{state['revision']}"
        state["funding"][key] = agreement(
            key,
            p["id"],
            "manufacturer",
            org,
            args["monthly_cents"],
            day,
            args["end"],
            portable=args["portable"],
            team=client,
            guarantee=args["guarantee"],
        )
    elif action == "academy-right":
        s = state["scholarships"].get(args["agreement"])
        if not s or not active(s, day):
            raise RuleError("Нет действующего договора.")
        a = state["academies"][s["academy"]]
        if (
            a["org"] == org
            and state["setup"]["role"] in ("owner", "manager")
            and s["option"]
            and not s["exercised"]
        ):
            if not exercise_option(state, s, day):
                raise RuleError(
                    "Для продления нужны свободный период и бюджет академии."
                )
        elif (
            a["org"] != org
            and s["priority"]
            and not s["priority_until"]
            and state["setup"]["role"] == "manager"
        ):
            s["priority_until"] = min(s["end"], shifted(day, 5))
            manager = state["people"].get(state["mandates"][a["org"]]["manager"])
            p = state["people"][s["person"]]
            rating = evaluate(p, world, day)["rating"]
            net = quote(state, p["id"], a["org"], day) - rating * 4500
            if (
                s["option"]
                and manager
                and preference(manager, p, rating, net, day) >= 75
            ):
                exercise_option(state, s, day)
            state["notices"].append(
                dict(
                    date=day,
                    text=a["name"]
                    + " · "
                    + (
                        "использует опцион"
                        if s["exercised"]
                        else "рассматривает запрос"
                    )
                    + " до "
                    + s["priority_until"],
                )
            )
        else:
            raise RuleError("Право уже использовано или недоступно.")
    elif action == "funding-end":
        r = state["funding"].get(args["agreement"])
        if not r or r["status"] != "active" or not active(r, day):
            raise RuleError("Договор поддержки недоступен.")
        current = {
            world["assignments"][aid]["org"]
            for aid, row in bookings(state, r["person"])
            if active(row, day)
        }
        if r["source"] == "academy":
            allowed = r["payer"] == org and state["setup"]["role"] == "owner"
        else:
            allowed = (
                org in current
                and (r["portable"] or r["team"] == org)
                and state["setup"]["role"] == "manager"
            ) or (org == r["payer"] and state["setup"]["role"] == "manufacturer")
        if not allowed:
            raise RuleError("Нужны полномочия стороны договора.", 403)
        move_money(
            state,
            org,
            (r["team"] if org == r["payer"] else r["payer"]),
            "exit-" + r["id"],
            r["exit_cents"],
            "backing-exit",
        )
        cutoff(state, r, day, "Договор поддержки расторгнут")
    elif action == "academy-course":
        s = state["scholarships"].get(args["agreement"])
        if (
            not s
            or not active(s, day)
            or state["academies"][s["academy"]]["org"] != org
            or state["setup"]["role"] != "owner"
        ):
            raise RuleError("Нужен действующий договор собственной академии.", 403)
        coaches = available_staff(state, world, org, {"coach"}, s["academy"])
        if not coaches:
            raise RuleError("Нужен тренер академии.")
        p = state["people"][s["person"]]
        from .legacy_courses import begin_course

        course_end = shifted(day, world["staff_rules"]["training"]["days"])
        if course_end > s["end"] or any(
            (q.get("training") or {}).get("coach") == coaches[0]["id"]
            for q in state["people"].values()
        ):
            raise RuleError("Тренер занят или курс выходит за срок договора.")
        begin_course(state, world, p, args["skill"])
        p["training"].update(
            coach=coaches[0]["id"],
            coaching=evaluate(coaches[0], world, day)["values"]["Методика"],
        )
