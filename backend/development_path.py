"""Career credentials, manager mandates, and observer-specific scouting reports."""

from hashlib import sha256
from .domain import RuleError, occupant_on
from .personnel import age_on, evaluate, shifted

STYLES = ("development", "performance", "economy")


def initialize(state, world):
    state.update(reports={}, mandates={})
    for p in state["people"].values():
        if p["position"] == "manager":
            n = int.from_bytes(sha256(p["id"].encode()).digest()[:4])
            p["management"] = dict(
                style=STYLES[n % 3],
                discipline=45 + n % 50,
                youth=15 + n % 76,
                specialists=25 + (n >> 8) % 61,
            )
        if p["position"] == "driver":
            p["credentials"] = dict(licences=["international"], points=0)
    for a in world["assignments"].values():
        if a["position"] == "driver":
            rule = world["championships"][a["series"]]["admission"]
            p = state["people"][a["person"]]
            if (
                rule.get("licence")
                and rule["licence"] not in p["credentials"]["licences"]
            ):
                p["credentials"]["licences"].append(rule["licence"])
            p["credentials"]["points"] = max(
                rule.get("min_points", 0), p["credentials"]["points"]
            )
    # Fictional prior single-seater qualifications are independent of skills and backing.
    for pid in world["staff_rules"]["former_superlicence"]:
        state["people"][pid]["credentials"] = dict(
            licences=["international", "super"], points=40
        )
    for org, a in world["organizations"].items():
        if a["kind"] == "team":
            state["mandates"][org] = dict(
                limit_cents=state["accounts"][org]["payroll_cents"],
                goal="performance",
                priority="desired",
                horizon="season",
                trust=65,
                autonomy=70,
                satisfaction=70,
                owner=occupant_on(state["seats"][org + ":owner"], state["date"]),
                manager=occupant_on(state["seats"][org + ":manager"], state["date"]),
                response="Согласовано",
                history=[],
            )


def eligibility(person, rules, day, assignment="race"):
    rules = {**rules, **rules.get("assignment_rules", {}).get(assignment, {})}
    age = age_on(person, day)
    if age < rules.get("min_age", 0) or age > rules.get("max_age", 150):
        return "Возраст вне допуска чемпионата."
    credentials = person["credentials"]
    if rules.get("licence") and rules["licence"] not in credentials["licences"]:
        return "Отсутствует требуемая лицензия."
    if credentials["points"] < rules.get("min_points", 0):
        return "Недостаточно лицензионных баллов."
    return None


def set_mandate(state, args, world):
    setup = state["setup"]
    if setup["role"] != "owner":
        raise RuleError("Мандат менеджера задаёт владелец.", 403)
    org = setup["org"]
    manager = occupant_on(state["seats"][org + ":manager"], state["date"])
    if not manager:
        raise RuleError("Сначала назначьте менеджера.")
    if args["limit_cents"] > state["accounts"][org]["cash_cents"]:
        raise RuleError("Лимит превышает средства организации.")
    m = state["mandates"][org]
    p = state["people"][manager]
    if all(m[k] == v for k, v in args.items()):
        raise RuleError("Этот мандат уже действует.")
    agrees = args["goal"] == p["management"]["style"]
    change = 3 if agrees else -(5 if args["priority"] == "required" else 2)
    m.update(
        **args,
        manager=manager,
        response="Поддерживает цель" if agrees else "Просит пересмотреть приоритет",
        trust=max(0, min(100, m["trust"] + change)),
        satisfaction=max(0, min(100, m["satisfaction"] + change)),
    )
    if "growth_since" in state and not any(
        r["date"] == state["date"] for r in m["history"]
    ):
        from .professional import Activity, record

        record(
            state,
            world,
            Activity(
                person=manager,
                role="manager",
                org=org,
                kind="management",
                skills=["Координация"],
                date=state["date"],
                event_id="mandate:" + org + ":" + state["date"],
                difficulty=60,
                result="completed",
            ),
        )
    m["history"].append(
        dict(date=state["date"], manager=manager, response=m["response"], **args)
    )
    state["notices"].append(
        dict(date=state["date"], text=p["name"] + " · " + m["response"])
    )


def preference(manager, candidate, rating, net_cents, day):
    """Independent sporting preference and the cost of the candidate to this manager."""
    style = manager["management"]
    youth = max(-8, min(8, (28 - age_on(candidate, day)) * (style["youth"] - 50) // 30))
    value = rating + (
        youth
        if candidate["position"] == "driver"
        else (max(candidate["skills"].values()) - rating) * style["specialists"] // 100
    )
    cost = max(-15, min(15, net_cents * style["discipline"] // 4000000))
    return max(0, min(100, value + cost * (2 if style["style"] == "economy" else 1)))


def available_staff(state, world, org, positions, academy=None):
    found = []
    for a in world["assignments"].values():
        if (
            a["org"] != org
            or a["position"] not in positions
            or (academy and a.get("academy") != academy)
        ):
            continue
        pid = occupant_on(state["seats"][a["id"]], state["date"])
        if pid and "growth_since" in state:
            from .preparation import busy

            if (
                busy(state, pid, state["date"], shifted(state["date"], 1))
                or state["people"][pid]["fatigue"] >= 60
            ):
                continue
        if pid:
            found.append(state["people"][pid])
    return found


def scout(state, world, pid):
    p = state["people"].get(pid)
    if not p or p["position"] != "driver":
        raise RuleError("Для наблюдения нужен пилот.")
    org = state["setup"]["org"]
    staff = available_staff(state, world, org, {"scout"})
    if not staff:
        raise RuleError("Для отчёта нужен действующий скаут.")
    reports = state["reports"].setdefault(org, {})
    used = {
        r["scout"]
        for records in reports.values()
        for r in records
        if r["date"] == state["date"]
    }
    last = reports.get(pid, [])
    if last and last[-1]["next"] > state["date"]:
        raise RuleError("Новое наблюдение доступно через семь дней.")
    observer = next((s for s in staff if s["id"] not in used), None)
    if not observer:
        raise RuleError("Все скауты сегодня заняты.")
    skill = evaluate(observer, world, state["date"])["values"]["Оценка потенциала"]
    analysts = available_staff(state, world, org, {"academy-analyst"})
    analysis = max(
        (evaluate(a, world, state["date"])["values"]["Точность"] for a in analysts),
        default=0,
    )
    width = max(5, 26 - skill // 7 - analysis // 25 - len(last) * 2)
    sample = int.from_bytes(
        sha256((org + pid + observer["id"] + state["date"]).encode()).digest()[:4]
    )
    low = max(0, min(100 - width, p["potential"] - sample % (width + 1)))
    report = dict(
        low=low,
        high=low + width,
        date=state["date"],
        next=shifted(state["date"], 7),
        scout=observer["id"],
    )
    reports.setdefault(pid, []).append(report)
    if "growth_since" in state:
        from .professional import Activity, record

        key = "observation:" + pid + ":" + state["date"]
        record(
            state,
            world,
            Activity(
                event_id=key,
                person=observer["id"],
                role="scout",
                org=org,
                date=state["date"],
                kind="scouting",
                skills=["Оценка потенциала", "Оценка навыков"],
                difficulty=65,
                result="completed",
            ),
        )
        previous = next(
            (r for r in reversed(last[:-1]) if r["scout"] == observer["id"]), None
        )
        if previous:
            prior = "observation:" + pid + ":" + previous["date"]
            if observer["id"] + "|" + prior in state["work_log"]:
                record(
                    state,
                    world,
                    Activity(
                        event_id=key + ":review",
                        person=observer["id"],
                        role="scout",
                        org=org,
                        date=state["date"],
                        kind="scout-review",
                        skills=["Оценка потенциала"],
                        difficulty=60,
                        result="reviewed",
                        context={"reviewed": prior},
                    ),
                )
    state["notices"].append(
        dict(date=state["date"], text="Готов скаутский отчёт · " + p["name"])
    )


def public_person(p):
    return {k: v for k, v in p.items() if k != "potential" or p["position"] != "driver"}
