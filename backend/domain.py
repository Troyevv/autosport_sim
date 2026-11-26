"""Career rules. World and checkpoint inputs are ordinary Python values; no I/O."""

from datetime import date

START = "2025-02-01"
ROLES = {"manager": "team", "owner": "team", "manufacturer": "supplier"}
BRIEFINGS = {
    "manager": "confirm-team",
    "owner": "confirm-program",
    "manufacturer": "confirm-supply",
}


class RuleError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def draw(state, low, high):
    # Numerical Recipes LCG, frozen for the 2025-v1 ruleset.
    state["rng"] = (1664525 * state["rng"] + 1013904223) & 0xFFFFFFFF
    return low + state["rng"] * (high - low + 1) // 2**32


def assign_face(person, people, pool, selector=0):
    if person["origin"] != "generated" or person.get("face"):
        return
    occupied = {p.get("face") for p in people.values()}
    available = sorted(set(pool) - occupied)
    person["face"] = available[selector % len(available)] if available else None


def occupant_on(appointments, day):
    """Half-open appointment intervals also support a future signing or a free seat."""
    return next(
        (
            a["person"]
            for a in appointments
            if a["start"] <= day and (a["end"] is None or day < a["end"])
        ),
        None,
    )


def player_face(catalog, setup):
    seat = catalog["assignments"][setup["org"] + ":" + setup["role"]]
    birth = catalog["profiles"][seat["person"]]["birth_date"]
    age = 2025 - int(birth[:4]) - int(birth[5:] > "02-01")
    pool = [
        face
        for face, (low, high) in catalog["reserve_ages"].items()
        if low <= age <= high
    ]
    faces = pool or catalog["reserve"]
    return faces[setup["seed"] % len(faces)]


def new_world(catalog, setup):
    role, org, series = setup["role"], setup["org"], setup["series"]
    rec = catalog["organizations"].get(org)
    if (
        not catalog["championships"].get(series, {}).get("playable", True)
        or not rec
        or not rec.get("playable", True)
        or ROLES.get(role) != rec["kind"]
        or series not in rec["programs"]
    ):
        raise RuleError("Должность или программа недоступна для этой организации.")
    if catalog["version"] != "2025-v1" and "player_face" not in setup:
        setup = {**setup, "player_face": player_face(catalog, setup)}
    state = dict(
        rules=catalog["version"],
        setup=setup,
        date=START,
        revision=0,
        rng=setup["seed"],
        player_id="player",
        player_cash_cents=0,
        people={},
        seats={},
        collectives={},
        accounts={},
        pending=[],
        ledger=[],
        checkpoint="start",
    )
    state["car_configurations"] = {
        cid: {
            key: car[key] for key in ("season", "generation", "concept", "regulation")
        }
        for cid, car in catalog["cars"].items()
    }
    if catalog["version"] == "2025-v1":
        from .legacy_people import populate

        populate(catalog, setup, state)
    else:
        profiles = catalog["profiles"]
        state["people"] = {
            pid: {**profile, "skills": profile["skills"].copy(), "traits": []}
            for pid, profile in profiles.items()
        }
        office = catalog["assignments"][org + ":" + role]
        incumbent = profiles[office["person"]]
        face = setup["player_face"]
        player = {
            **incumbent,
            "id": "player",
            "name": setup["name"],
            "face": face,
            "skills": incumbent["skills"].copy(),
            "traits": [],
        }
        state["people"]["player"] = player
        for aid, assignment in catalog["assignments"].items():
            pid = "player" if aid == office["id"] else assignment["person"]
            state["seats"][aid] = [dict(person=pid, start=START, end=None)]
        # Freeze the independent finance/collective stream from the published 2025
        # rules. Old ledgers and opening balances replay exactly after migration.
        for _ in range(2312):
            draw(state, 0, 1)
    for oid, organization in catalog["organizations"].items():
        team = organization["kind"] == "team"
        groups = (
            [
                "Аэродинамика",
                "Шасси",
                "Надёжность",
                "Силовая установка",
                "Механики и пит-бригада",
            ]
            if team
            else ["Инженеры", "Производственные рабочие"]
        )
        group_sizes = (4, 24)
        if team and all(
            catalog["championships"][s].get("superlicence")
            for s in organization["programs"]
        ):
            if any(
                catalog["championships"][s]["playable"]
                for s in organization["programs"]
            ):
                groups, group_sizes = (
                    ["Инженеры программы", "Гоночные механики"],
                    (2, 8),
                )
            else:
                groups, group_sizes = ["Картинговые механики"], (1, 4)
        monthly = 0
        for i, name in enumerate(groups):
            size = draw(state, *group_sizes)
            payroll = size * draw(state, 280000, 600000)
            cid = f"{oid}-group-{i + 1}"
            state["collectives"][cid] = dict(
                id=cid,
                org=oid,
                name=name,
                size=size,
                qualification=draw(state, 55, 90),
                workload=50,
                fatigue=0,
                payroll_cents=payroll,
            )
            monthly += payroll
        cash = monthly * 18
        state["accounts"][oid] = dict(
            currency="EUR",
            cash_cents=cash,
            budget_cents=monthly * 12,
            forecast_cents=cash - monthly,
            payroll_cents=monthly,
            development_budget_cents=monthly * 3,
            development_spent_cents=0,
            development_reserved_cents=0,
        )
        state["ledger"].append(
            dict(org=oid, key="opening", date=START, delta_cents=cash, source="opening")
        )
    if catalog["version"] in ("2025-v3", "2025-v4"):
        from .personnel import initialize

        initialize(state, catalog)
        from .professional import activate

        activate(state)
        if catalog["version"] == "2025-v4":
            state["junior_since"] = 0
            state["junior_reserve"] = {
                p: state["people"].pop(p)
                for p, v in catalog["profiles"].items()
                if v.get("prospect")
            }
            for prospect in state["junior_reserve"].values():
                prospect["credentials"]["licences"] = []
    return state


def next_date(state, catalog):
    dates = [e["start"] for e in catalog["events"]]
    if "personnel_since" in state:
        from .employment import HORIZON, dates as personnel_dates

        dates.extend(d for d in personnel_dates(state) if d <= HORIZON)
        dates.append(HORIZON)
        if (
            "production" in state
            and state["setup"]["role"] == "manager"
            and state["date"] < HORIZON
        ):
            from .finance.facilities import later

            book = state["production"]
            org = state["setup"]["org"]
            if any(
                b["org"] == org and not b["finished"] for b in book["batches"].values()
            ) or any(
                catalog["entries"][i["entry"]]["org"] == org
                and i["status"] in ("inspection", "repair")
                and (not i.get("rejected") or i["status"] == "repair")
                for i in book["items"].values()
            ):
                dates.append(later(state["date"], 1))
        if (
            state["setup"]["role"] == "manager"
            and state["date"] < HORIZON
            and any(
                p["org"] == state["setup"]["org"] and not p["finished"]
                for p in state.get("development", {}).get("projects", {}).values()
            )
        ):
            from .finance.facilities import later

            dates.append(later(state["date"], 1))
        if (
            state["setup"]["role"] == "manager"
            and state["date"] < HORIZON
            and any(
                p["org"] == state["setup"]["org"] and not p["finished"]
                for p in state.get("research", {}).get("projects", {}).values()
            )
        ):
            from .research import facility
            from .finance.facilities import later

            tomorrow = later(state["date"], 1)
            if facility(state, state["setup"]["org"], state["date"], tomorrow):
                dates.append(tomorrow)
    return min((d for d in dates if d > state["date"]), default=None)


def post_payroll(state, target):
    previous = date.fromisoformat(state["date"])
    month = previous.replace(day=1)
    while True:
        month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
        if month.isoformat() > target:
            break
        for org, account in state["accounts"].items():
            pay = account["payroll_cents"]
            if pay > account["cash_cents"]:
                raise RuleError("Недостаточно средств на выплату.", 409)
            account["cash_cents"] -= pay
            account["forecast_cents"] = account["cash_cents"] - pay
            state["ledger"].append(
                dict(
                    org=org,
                    key="payroll-" + month.strftime("%Y-%m"),
                    date=month.isoformat(),
                    delta_cents=-pay,
                    source="payroll",
                )
            )


def apply(state, catalog, action, payload=None):
    from . import lineup

    if "lineup" in state:
        from .catalog import LINEUP_WORLD

        catalog = LINEUP_WORLD
        if action in ("component-install", "component-usage") and "components" in state:
            from . import components

            if action == "component-install":
                if state["setup"]["role"] != "manager":
                    raise RuleError("Установку согласует менеджер команды.", 403)
                if (
                    "production" in state
                    and occupant_on(
                        state["seats"][state["setup"]["org"] + ":manager"],
                        state["date"],
                    )
                    != state["player_id"]
                ):
                    raise RuleError("Назначение менеджера завершено.", 403)
                components.install(
                    state,
                    catalog,
                    components.Install.model_validate(payload),
                    state["setup"]["org"],
                )
            else:
                components.apply_usage(
                    state, catalog, components.Usage.model_validate(payload)
                )
            state["revision"] += 1
            return
        if action in lineup.PRODUCERS:
            lineup.confirm(state, catalog, action, payload)
            state["revision"] += 1
            return
    if (
        action in ("issued-licence", "season-classification")
        and "junior_since" in state
    ):
        from .junior_path import record

        record(state, catalog, action, payload)
        state["revision"] += 1
        return
    if action == "confirmed-work" and "growth_since" in state:
        from .professional import Batch, record

        for event in Batch.model_validate(payload).facts:
            record(state, catalog, event)
        state["revision"] += 1
        return
    from .finance.events import PRODUCERS, confirm

    if action in PRODUCERS and "finance" in state:
        confirm(state, catalog, action, payload)
        state["revision"] += 1
        return
    setup = state["setup"]
    office = setup["org"] + ":" + setup["role"]
    if occupant_on(state["seats"][office], state["date"]) != state["player_id"]:
        raise RuleError("Действующее назначение не даёт полномочий.", 403)
    from .finance import market, budget

    from .finance import facilities

    from . import research

    from . import development, production, council

    from . import programme

    if action in programme.ORDERS and "programme" in state:
        programme.command(state, catalog, action, payload)
        state["revision"] += 1
        return

    if action in council.ORDERS and "council" in state:
        council.command(state, catalog, action, payload)
        state["revision"] += 1
        return

    if action in production.ORDERS and "production" in state:
        production.command(state, catalog, action, payload)
        state["revision"] += 1
        return

    if action in development.ORDERS and "development" in state:
        development.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    if action in research.ORDERS and "research" in state:
        research.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    if action in lineup.ORDERS and "lineup" in state:
        lineup.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    if action in facilities.ORDERS and "estate" in state:
        facilities.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    from .finance import capital

    if action in capital.ORDERS and "capital" in state:
        capital.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    from .finance import economy

    if action in economy.ORDERS and "economy" in state:
        economy.command(state, catalog, action, payload)
        state["revision"] += 1
        return
    if action in budget.ORDERS and "control" in state:
        budget.command(state, catalog, action, payload)
    elif action == "finance-mount" and "market" in state:
        from .finance.rights import mount

        mount(state, catalog, payload)
    elif action in market.ORDERS and "market" in state:
        market.command(state, catalog, action, payload)
    elif action.startswith("finance-") and "finance" in state:
        from .finance import command

        command(state, catalog, action, payload)
    elif action == "save-livery" and payload is not None:
        from .livery import install

        install(state, catalog, payload)
    elif (
        action
        in (
            "offer-send",
            "offer-withdraw",
            "offer-accept",
            "staff-release",
            "staff-train",
            "advisor-assign",
            "scout-driver",
            "manager-mandate",
            "academy-enroll",
            "academy-course",
            "prepare-program",
            "academy-right",
            "funding-end",
            "manufacturer-backing",
        )
        and "personnel_since" in state
    ):
        from .employment import command

        command(state, catalog, action, payload)
    elif payload is not None:
        raise RuleError("Лишние параметры команды.")
    elif action == "advance":
        if state["pending"]:
            raise RuleError("Сначала подтвердите обязательный брифинг.", 409)
        target = next_date(state, catalog)
        if target is None:
            raise RuleError("Календарь сезона пройден.", 409)
        if "personnel_since" in state:
            from .employment import advance

            advance(state, catalog, target)
        else:
            post_payroll(state, target)
            state["date"] = target
        programs = catalog["organizations"][setup["org"]]["programs"]
        state["pending"] = [
            e["id"]
            for e in catalog["events"]
            if e["start"] == target
            and e["kind"] != "invitational"
            and e["series"] in programs
            and catalog["championships"][e["series"]].get("playable", True)
            and (not e.get("org") or e["org"] == setup["org"])
        ]
        state["checkpoint"] = "weekend:" + target
    elif action == BRIEFINGS[setup["role"]]:
        if not state["pending"]:
            raise RuleError("Нет ожидающего брифинга.", 409)
        state["checkpoint"] = "briefing:" + state["pending"].pop(0)
    else:
        raise RuleError("У этой должности нет полномочий на команду.", 403)
    state["revision"] += 1
