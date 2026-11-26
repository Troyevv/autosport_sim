"""Personnel commands and the dated employment ledger. All writes share the caller's transaction."""

from calendar import monthrange
from datetime import date
from . import backing, development_path, preparation, career_choice
from .domain import RuleError, occupant_on
from .personnel import (
    active,
    bookings,
    develop,
    disciplines,
    evaluate,
    shifted,
    update_payroll,
)

HORIZON = "2026-01-01"


def authorized(state, seat, actor=None):
    actor = actor or state["setup"]
    role = actor["role"]
    if role not in ("manager", "owner", "manufacturer") or seat["org"] != actor["org"]:
        return False
    if role == "owner":
        return seat["position"] == "manager" or bool(seat.get("academy"))
    return not seat.get("academy") and seat["position"] not in (
        "owner",
        "manager",
        "manufacturer",
    )


def notice(state, text, org=None):
    if org and org != state["setup"]["org"]:
        return
    state["notices"].append(dict(date=state["date"], text=text))


def post(state, org, key, amount, source):
    if not amount:
        return
    if "finance" in state:
        from . import finance

        if amount < 0 and -amount > finance.available(state, org):
            raise RuleError("Недостаточно свободных средств.", 409)
        return finance.post(state, org, key, amount, source)
    a = state["accounts"][org]
    if a["cash_cents"] + amount < 0:
        raise RuleError("Недостаточно средств для исполнения договора.", 409)
    a["cash_cents"] += amount
    a["forecast_cents"] = a["cash_cents"] - a["payroll_cents"]
    state["ledger"].append(
        dict(org=org, key=key, date=state["date"], delta_cents=amount, source=source)
    )


def monthly_pay(state, catalog):
    end = date.fromisoformat(state["date"])
    start = date.fromisoformat(shifted(state["date"], -1)).replace(day=1)
    days = monthrange(start.year, start.month)[1]
    personal = {}
    payroll = dict.fromkeys(state["accounts"], 0)
    for g in state["collectives"].values():
        payroll[g["org"]] += g["payroll_cents"]
    for aid, rows in state["seats"].items():
        for r in rows:
            left = max(
                start,
                date.fromisoformat(r["start"]),
                date.fromisoformat(state["personnel_start"]),
            )
            right = min(end, date.fromisoformat(r["end"])) if r["end"] else end
            earned = r["salary_cents"] * max(0, (right - left).days) // days
            payroll[catalog["assignments"][aid]["org"]] += earned
            if r["person"] == state["player_id"]:
                org = catalog["assignments"][aid]["org"]
                personal[org] = personal.get(org, 0) + earned
                if "finance" not in state:
                    state["player_cash_cents"] += earned
    for org, amount in payroll.items():
        if "finance" in state:
            from .finance import payroll as settle_payroll

            settle_payroll(state, org, amount, personal.get(org, 0))
            continue
        post(state, org, "payroll-" + end.strftime("%Y-%m"), -amount, "staff-payroll")


def ask(state, catalog, p, seat):
    series = seat["series"]
    discipline = catalog["championships"][series]["discipline"] if series else None
    profile = evaluate(p, catalog, state["date"], discipline=discipline)
    manager = state["people"]["player"]
    if "growth_since" in state:
        recruiter = occupant_on(
            state["seats"][seat["org"] + ":" + career_choice.office(catalog, seat)],
            state["date"],
        )
        manager = state["people"].get(recruiter) or p
    negotiation = evaluate(manager, catalog, state["date"])["values"].get(
        "Переговоры", manager["reputation"]
    )
    interest = p["ambition"] + p["loyalty"] - manager["reputation"] - negotiation
    if p["position"] == "manager":
        mandate = state["mandates"][seat["org"]]
        interest += (p["ambition"] - mandate["autonomy"]) + (70 - mandate["trust"])
        if mandate["manager"] == p["id"]:
            interest += 70 - mandate["satisfaction"]
        if mandate["goal"] != p["management"]["style"]:
            interest += 20
    return max(
        10000, (profile["rating"] * 45 + interest * 6 + p["reputation"] * 8) * 100
    )


def intersects(row, start, end):
    return row["start"] < end and (not row["end"] or row["end"] > start)


def leaving_mid_session(catalog, seat, day):
    return seat["entry"] and any(
        e["series"] == seat["series"] and e["start"] < day <= e["end"]
        for e in catalog["events"]
    )


def check_terms(state, catalog, offer):
    seat = catalog["assignments"].get(offer["seat"])
    p = state["people"].get(offer["person"])
    day, end = offer["start"], offer["end"]
    if (
        not seat
        or not authorized(state, seat, offer.get("actor"))
        or not p
        or p["id"] == "player"
        or p["position"] != seat["position"]
    ):
        raise RuleError("Должность, профессия или полномочия не подходят.")
    if "actor" in offer:
        actor = offer["actor"]
        if (
            occupant_on(
                state["seats"][actor["org"] + ":" + actor["role"]], state["date"]
            )
            != actor["person"]
        ):
            raise RuleError("Полномочия отправителя прекращены.")
    if not state["date"] <= day < end:
        raise RuleError("Окончание договора должно быть позже его начала.")
    if p["position"] == "driver":
        entry = catalog["entries"][seat["entry"]]
        rules = catalog["championships"][seat["series"]]
        reason = development_path.eligibility(
            p, rules["admission"], day, starts=state["starts"].get(p["id"], {}).values()
        )
        if reason:
            raise RuleError(reason)
        backing.right_of_first_offer(state, p["id"], seat["org"], state["date"])
        if entry["category"] not in rules["classes"]:
            raise RuleError("Возраст или класс заявки не допускают назначение.")
    if any(
        r["person"] != p["id"] and intersects(r, day, end)
        for r in state["seats"][seat["id"]]
    ):
        raise RuleError(
            "Место занято в запрошенный период. Сначала освободите его.", 409
        )
    previous = []
    if leaving_mid_session(catalog, seat, day) or leaving_mid_session(
        catalog, seat, end
    ):
        raise RuleError("Смена экипажа во время уик-энда недоступна.")
    for aid, row in bookings(state, p["id"]):
        if not intersects(row, day, end):
            continue
        if row["start"] > state["date"] or row.get("transfer_on"):
            raise RuleError("У сотрудника уже есть обязательство на этот период.", 409)
        if leaving_mid_session(catalog, catalog["assignments"][aid], day):
            raise RuleError("Действующий экипаж занят на этапе.")
        if (
            p["position"] == "driver"
            and catalog["assignments"][aid]["org"] != seat["org"]
        ):
            backing.can_leave(state, p["id"], catalog["assignments"][aid]["org"], day)
        previous.append((aid, row))
    if any(
        r["advisor"] == p["id"]
        and r["end"] > day
        and (r["employer"] != seat["org"] or r["end"] > end)
        for r in state["support"]
    ):
        raise RuleError("Консультант занят по договору поддержки.")
    if "growth_since" in state and preparation.busy(state, p["id"], day, end):
        raise RuleError("Сотрудник занят в утверждённой программе.")
    if p.get("training") and p["training"]["end"] > day:
        raise RuleError("Курс подготовки пересекается с началом договора.")
    if (
        offer.get("actor", state["setup"])["role"] == "manager"
        and offer.get("salary_cents", 0) > state["mandates"][seat["org"]]["limit_cents"]
    ):
        raise RuleError("Оклад превышает лимит, делегированный владельцем.")
    return seat, p, previous


def transfer_costs(catalog, previous, org):
    return [
        (catalog["assignments"][aid]["org"], row["buyout_cents"], aid)
        for aid, row in previous
        if catalog["assignments"][aid]["org"] != org
    ]


def quote(state, catalog, terms):
    seat, _, previous = check_terms(state, catalog, terms)
    costs = transfer_costs(catalog, previous, seat["org"])
    return sum(value for _, value, _ in costs)


def sign(state, catalog, offer):
    seat, p, previous = check_terms(state, catalog, offer)
    org, key = seat["org"], offer["id"]
    costs = transfer_costs(catalog, previous, org)
    cash = state["accounts"][org]["cash_cents"]
    if "finance" in state:
        from .finance import available

        cash = available(state, org)
    if (
        offer["bonus_cents"] + sum(v for _, v, _ in costs) + offer["salary_cents"]
        > cash
    ):
        raise RuleError("Средств на бонус, выкуп и первый оклад недостаточно.", 409)
    if "control" in state:
        from .finance.budget import authorize

        authorize(
            state,
            catalog,
            org,
            "signing",
            offer["bonus_cents"] + sum(v for _, v, _ in costs),
            state["date"],
        )
    post(state, org, key + "-bonus", -offer["bonus_cents"], "signing")
    for old_org, value, aid in costs:
        if old_org != org:
            post(state, org, key + "-buy-" + aid, -value, "buyout")
            post(state, old_org, key + "-sell-" + aid, value, "buyout")
    for _, row in previous:
        row.update(end=offer["start"], transfer_on=offer["start"])
    state["seats"][seat["id"]].append(
        dict(
            person=p["id"],
            start=offer["start"],
            end=offer["end"],
            salary_cents=offer["salary_cents"],
            buyout_cents=offer["salary_cents"] * 2,
            offer=key,
        )
    )
    if "growth_since" in state:
        state["seats"][seat["id"]][-1].update(
            position=seat["position"],
            remit=offer.get("remit", "standard"),
            agreed_end=offer["end"],
        )
    offer.update(
        status="accepted", message="Договор подписан. Назначение с " + offer["start"]
    )
    notice(
        state,
        p["name"] + " · " + offer["message"],
        catalog["assignments"][offer["seat"]]["org"],
    )
    update_payroll(state, catalog, state["date"])


def resolve(state, catalog, offer):
    p = state["people"][offer["person"]]
    target = ask(state, catalog, p, catalog["assignments"][offer["seat"]])
    duration = (
        date.fromisoformat(offer["end"]) - date.fromisoformat(offer["start"])
    ).days
    equivalent = offer["salary_cents"] + offer["bonus_cents"] * 30 // max(30, duration)
    if "growth_since" in state:
        assessment = career_choice.assess(state, catalog, p, offer)
        offer["assessment"] = assessment
        if assessment["veto"]:
            offer.update(status="rejected", message=assessment["veto"])
            notice(
                state,
                p["name"] + " · " + offer["message"],
                catalog["assignments"][offer["seat"]]["org"],
            )
            return
        target = max(10000, target * (100 - assessment["score"]) // 100)
    if equivalent >= target:
        try:
            sign(state, catalog, offer)
            return
        except RuleError as exc:
            message = str(exc)
    elif equivalent * 4 >= target * 3:
        offer.update(
            status="countered",
            salary_cents=target,
            message="Кандидат запросил другой оклад.",
        )
        notice(
            state,
            p["name"] + " · " + offer["message"],
            catalog["assignments"][offer["seat"]]["org"],
        )
        return
    else:
        message = "Вознаграждение ниже ожиданий кандидата."
    offer.update(status="rejected", message=message)
    notice(
        state, p["name"] + " · " + message, catalog["assignments"][offer["seat"]]["org"]
    )


def dates(state):
    for offer in state.get("market", {}).get("offers", {}).values():
        if offer["status"] in ("offered", "counter"):
            yield shifted(offer["date"], 1)
            yield shifted(offer["deadline"], 1)
    for row in state.get("finance", {}).get("instalments", {}).values():
        if row["status"] == "pending":
            yield row["due"]
    for r in state["funding"].values():
        if r["status"] == "active":
            yield r["end"]
            if r["minimum_starts"]:
                yield shifted(r["start"], 90)
    for s in state["scholarships"].values():
        if s["priority_until"]:
            yield s["priority_until"]
    for offer in state["offers"].values():
        if offer["status"] == "sent":
            yield offer["response"]
        elif offer["status"] == "countered":
            yield offer["deadline"]
    for r in state.get("preparations", {}).values():
        if r["status"] == "scheduled":
            yield r["end"]
    for p in state["people"].values():
        if p.get("training"):
            yield p["training"]["end"]
    for rows in state["seats"].values():
        for row in rows:
            if row.get("offer"):
                yield row["start"]
            if row["end"]:
                yield row["end"]


def advance(state, catalog, target):
    # Settle the previous calendar month before activating today's appointments.
    while state["date"] < target:
        current = date.fromisoformat(state["date"])
        month = date(
            current.year + current.month // 12, current.month % 12 + 1, 1
        ).isoformat()
        day = min([month, target, *(d for d in dates(state) if d > state["date"])])
        develop(state, catalog, day)
        state["date"] = day
        if "growth_since" in state:
            preparation.finish(state, catalog, day)
        if day == month:
            backing.monthly(state, catalog)
            monthly_pay(state, catalog)
            if "growth_since" in state and shifted(day, 3) < HORIZON:
                fill_vacancies(state, catalog)
        if "finance" in state:
            from .finance import settle

            settle(state)
        if "market" in state:
            from .finance import market

            market.tick(state, catalog)
        if "control" in state:
            from .finance import budget

            budget.tick(state, catalog)
        backing.condition_review(state, day)
        for offer in sorted(
            state["offers"].values(),
            key=lambda o: tuple(int(n) for n in o["id"].split("-")[1:]),
        ):
            if offer["status"] == "sent" and offer["response"] == day:
                resolve(state, catalog, offer)
                actor = offer.get("actor")
                if (
                    actor
                    and actor["person"] != "player"
                    and offer["status"] == "countered"
                    and offer["salary_cents"]
                    <= state["accounts"][actor["org"]]["forecast_cents"]
                ):
                    try:
                        reply(
                            state,
                            catalog,
                            offer["id"],
                            True,
                            actor["org"],
                            actor["role"],
                        )
                    except RuleError:
                        reply(
                            state,
                            catalog,
                            offer["id"],
                            False,
                            actor["org"],
                            actor["role"],
                        )
                if (
                    "growth_since" in state
                    and actor
                    and assigned_actor(state, actor, day)
                ):
                    from .professional import Activity, record

                    record(
                        state,
                        catalog,
                        Activity(
                            event_id=offer["id"] + ":response",
                            person=actor["person"],
                            role=actor["role"],
                            org=actor["org"],
                            kind="negotiation",
                            skills=[
                                "Оценка руководителей"
                                if actor["role"] == "owner"
                                else "Переговоры"
                            ],
                            difficulty=75 if offer["buyout_cents"] else 48,
                            result="failed"
                            if offer["status"] == "rejected"
                            else "completed",
                            date=day,
                        ),
                    )
            elif offer["status"] == "countered" and day >= offer["deadline"]:
                offer.update(
                    status="expired", message="Срок встречного предложения истёк."
                )
                notice(
                    state,
                    state["people"][offer["person"]]["name"] + " · " + offer["message"],
                )
        for aid in sorted(state["seats"]):
            rows = state["seats"][aid]
            seat = catalog["assignments"][aid]
            for row in rows:
                if row.get("offer") and row["start"] == day:
                    p = state["people"][row["person"]]
                    for d in disciplines(catalog, seat):
                        p["adaptation"][d] = max(
                            p["adaptation"][d], p["adaptability"] // 2
                        )
                    notice(state, p["name"] + " · приступил к работе.", seat["org"])
                if (
                    row["end"] == day
                    and seat["position"] == "driver"
                    and not any(
                        catalog["assignments"][other]["org"] == seat["org"]
                        and active(deal, day)
                        for other, deal in bookings(state, row["person"])
                    )
                ):
                    backing.reassigned(
                        state, row["person"], None, day, former=seat["org"]
                    )
                if (
                    row["end"] == day
                    and seat["org"] == state["setup"]["org"]
                    and not row.get("transfer_on")
                ):
                    notice(
                        state,
                        state["people"][row["person"]]["name"]
                        + " · завершён контракт.",
                    )
    for org, m in state["mandates"].items():
        current = occupant_on(state["seats"][org + ":manager"], target)
        if current != m["manager"]:
            m.update(
                manager=current, trust=65, satisfaction=70, response="Новый мандат"
            )
    update_payroll(state, catalog, target)


def assigned_actor(state, actor, day):
    return (
        occupant_on(state["seats"][actor["org"] + ":" + actor["role"]], day)
        == actor["person"]
    )


def propose(state, catalog, args, org, role):
    day = state["date"]
    if day >= HORIZON:
        raise RuleError("Календарь сезона завершён.")
    if args["start"] < shifted(day, 2):
        raise RuleError("На рассмотрение предложения нужно два дня.")
    if "growth_since" in state:
        from .staff_input import Offer

        Offer.model_validate(args)
        actor = occupant_on(state["seats"].get(org + ":" + role, []), day)
        if not actor:
            raise RuleError("Нет действующего руководителя.")
        args = {**args, "actor": dict(org=org, role=role, person=actor)}
    buyout = quote(state, catalog, args)
    if any(
        o["person"] == args["person"] and o["status"] in ("sent", "countered")
        for o in state["offers"].values()
    ):
        raise RuleError("Переговоры с кандидатом уже идут.", 409)
    key = f"offer-{state['revision'] + 1}"
    if key in state["offers"]:
        key += "-" + str(len(state["offers"]))

    state["offers"][key] = dict(
        **args,
        id=key,
        status="sent",
        buyout_cents=buyout,
        sent=day,
        response=shifted(day, 1),
        deadline=min(args["start"], shifted(day, 8)),
        message="Кандидат изучает условия.",
    )
    return


def fill_vacancies(state, catalog):
    """A hiring officer reviews actual vacancies at monthly settlement, using public profiles and their own budget."""
    day = state["date"]
    start = shifted(day, 3)
    occupied = {
        r["person"]
        for rows in state["seats"].values()
        for r in rows
        if not r["end"] or r["end"] > day
    }
    for seat in catalog["assignments"].values():
        role = career_choice.office(catalog, seat)
        org = seat["org"]
        recruiter = occupant_on(state["seats"].get(org + ":" + role, []), day)
        if (
            not recruiter
            or recruiter == "player"
            or not authorized(state, seat, dict(org=org, role=role))
        ):
            continue
        if any(intersects(row, day, HORIZON) for row in state["seats"][seat["id"]]):
            continue
        if any(
            o["seat"] == seat["id"] and o["status"] in ("sent", "countered")
            for o in state["offers"].values()
        ):
            continue
        staff = state["people"][recruiter]
        candidates = []
        for p in state["people"].values():
            if (
                p["position"] != seat["position"]
                or p["id"] in occupied
                or p["id"] == "player"
            ):
                continue
            wage = ask(state, catalog, p, seat)
            if wage > state["accounts"][org]["forecast_cents"]:
                continue
            rating = evaluate(p, catalog, day)["rating"]
            support = (
                backing.quote(state, p["id"], org, start)
                if p["position"] == "driver"
                else 0
            )
            rank = (
                development_path.preference(staff, p, rating, support - wage, day)
                if role == "manager"
                else rating
            )
            candidates.append((-rank, p["id"], wage))
        for _, pid, wage in sorted(candidates):
            try:
                propose(
                    state,
                    catalog,
                    dict(
                        person=pid,
                        seat=seat["id"],
                        start=start,
                        end=HORIZON,
                        salary_cents=wage,
                        bonus_cents=0,
                    ),
                    org,
                    role,
                )
            except RuleError:
                continue
            occupied.add(pid)
            break


def reply(state, catalog, offer_id, accept, org, role):
    day = state["date"]
    offer = state["offers"].get(offer_id)
    if (
        not offer
        or not authorized(
            state, catalog["assignments"][offer["seat"]], dict(org=org, role=role)
        )
        or catalog["assignments"][offer["seat"]]["org"] != org
        or offer["status"] not in ("sent", "countered")
    ):
        raise RuleError("Переговоры уже закрыты.", 409)
    if accept:
        if offer["status"] != "countered" or day >= offer["deadline"]:
            raise RuleError("Нет действующего встречного предложения.", 409)
        sign(state, catalog, offer)
    else:
        offer.update(status="rejected", message="Предложение отозвано организацией.")
    return


def command(state, catalog, action, args):
    day = state["date"]
    if "growth_since" in state and action in ("staff-train", "academy-course"):
        raise RuleError("Универсальные курсы завершены. Доступны программы подготовки.")
    if action == "prepare-program" and "growth_since" in state:
        return preparation.reserve(state, catalog, args["kind"])
    if action == "scout-driver":
        return development_path.scout(state, catalog, args["person"])
    if action == "manager-mandate":
        return development_path.set_mandate(state, args, catalog)
    if action in {
        "academy-enroll",
        "academy-course",
        "academy-right",
        "funding-end",
        "manufacturer-backing",
    }:
        return backing.command(state, catalog, action, args)
    if action == "offer-send":
        return propose(
            state, catalog, args, state["setup"]["org"], state["setup"]["role"]
        )
    if action in ("offer-accept", "offer-withdraw"):
        return reply(
            state,
            catalog,
            args["offer"],
            action == "offer-accept",
            state["setup"]["org"],
            state["setup"]["role"],
        )
    seat = catalog["assignments"].get(args["seat"])
    if not seat or not authorized(state, seat):
        raise RuleError("Недостаточно полномочий для этой должности.", 403)
    row = next((r for r in state["seats"][seat["id"]] if active(r, day)), None)
    if not row or row["person"] == "player":
        raise RuleError("Нет действующего сотрудника.", 409)
    p = state["people"][row["person"]]
    if action == "staff-train":
        until = shifted(day, catalog["staff_rules"]["training"]["days"])
        if any(
            r["advisor"] == p["id"] and intersects(r, day, until)
            for r in state["support"]
        ):
            raise RuleError("Консультант занят во время курса.")
        if until > HORIZON:
            raise RuleError("Курс выходит за границы сезона.")
        from .legacy_courses import train

        train(state, catalog, p, args["skill"])
    elif action == "staff-release":
        backing.can_leave(state, p["id"], seat["org"], day)
        if (
            (
                "growth_since" in state
                and preparation.busy(state, p["id"], day, shifted(day, 1))
            )
            or row.get("transfer_on")
            or leaving_mid_session(catalog, seat, day)
            or any(r["advisor"] == p["id"] and r["end"] > day for r in state["support"])
        ):
            raise RuleError("Действующее обязательство препятствует расторжению.")
        post(
            state,
            seat["org"],
            f"release-{state['revision']}",
            -row["buyout_cents"],
            "severance",
        )
        row["end"] = day
        backing.reassigned(state, p["id"], None, day, former=seat["org"])
        if seat["position"] == "manager":
            state["mandates"][seat["org"]]["manager"] = None
        if "training" in p:
            p["training"] = None
        notice(state, p["name"] + " · контракт расторгнут.")
        update_payroll(state, catalog, day)
    elif action == "advisor-assign":
        assign_support(state, catalog, seat, row, args)


def assign_support(state, catalog, seat, row, args):
    from .supply import SupportAssignment, entry_agreement
    from dataclasses import asdict

    start, end = args["start"], args["end"]
    entry = catalog["entries"].get(args["entry"])
    product = args["product"]
    if (
        not entry
        or seat["position"] != "technical-advisor"
        or catalog["cars"][entry["car"]]["suppliers"].get(product) != seat["org"]
    ):
        raise RuleError("Выберите клиента по действующей поставке.")
    if not state["date"] <= start < end <= min(row["end"] or HORIZON, HORIZON):
        raise RuleError("Период поддержки должен входить в договор сотрудника.")
    if any(
        r["advisor"] == row["person"] and intersects(r, start, end)
        for r in state["support"]
    ):
        raise RuleError("Консультант занят в этот период.", 409)
    if "growth_since" in state and preparation.busy(state, row["person"], start, end):
        raise RuleError("Назначение пересекается с утверждённой программой.")
    course = state["people"][row["person"]].get("training")
    if course and intersects(course, start, end):
        raise RuleError("Период поддержки пересекается с курсом.")
    assignment = SupportAssignment(
        f"support-{state['revision']}",
        row["person"],
        seat["org"],
        entry["org"],
        entry_agreement(entry["id"], product),
        product,
        start,
        end,
        frozenset({"distance", "temperature", "wear", "feedback"}),
        row["salary_cents"],
        100,
    )
    data = asdict(assignment)
    state["support"].append(
        dict(data, channels=sorted(data["channels"]), start=start, end=end)
    )
    notice(
        state,
        state["people"][row["person"]]["name"]
        + " · назначен клиенту "
        + catalog["organizations"][entry["org"]]["name"],
    )
