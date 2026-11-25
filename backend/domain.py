"""Career rules. World and checkpoint inputs are ordinary Python values; no I/O."""

from datetime import date
from hashlib import sha256

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


def new_world(catalog, setup):
    role, org, series = setup["role"], setup["org"], setup["series"]
    rec = catalog["organizations"].get(org)
    if not rec or ROLES.get(role) != rec["kind"] or series not in rec["programs"]:
        raise RuleError("Должность или программа недоступна для этой организации.")
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
    positions = {}
    for aid, assignment in catalog["assignments"].items():
        pid = assignment["person"]
        if pid:
            positions.setdefault(pid, set()).add(assignment["position"])
        if assignment["org"] == org and assignment["position"] == role:
            pid = "player"
        state["seats"][aid] = [dict(person=pid, start=START, end=None)] if pid else []
    positions["player"] = {role}
    for pid, jobs in sorted(positions.items()):
        profile_rng = {"rng": setup["seed"]} if pid == "player" else state
        skills = {
            skill: draw(profile_rng, 55, 94)
            for job in sorted(jobs)
            for skill in catalog["positions"][job]["skills"]
        }
        person = dict(
            id=pid,
            name=setup["name"] if pid == "player" else catalog["names"][pid],
            origin="generated" if pid == "player" else "real",
            face=None if pid == "player" else pid,
            skills=skills,
            potential=draw(profile_rng, max(skills.values()), 100),
            morale=70,
            fatigue=0,
            traits=[],
        )
        assign_face(person, state["people"], setup["face_pool"], setup["seed"])
        state["people"][pid] = person
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
        monthly = 0
        for i, name in enumerate(groups):
            size = draw(state, 4, 24)
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
    return state


def next_date(state, catalog):
    return next(
        (e["start"] for e in catalog["events"] if e["start"] > state["date"]), None
    )


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


def apply(state, catalog, action):
    setup = state["setup"]
    office = setup["org"] + ":" + setup["role"]
    if occupant_on(state["seats"][office], state["date"]) != state["player_id"]:
        raise RuleError("Действующее назначение не даёт полномочий.", 403)
    if action == "advance":
        if state["pending"]:
            raise RuleError("Сначала подтвердите обязательный брифинг.", 409)
        target = next_date(state, catalog)
        if target is None:
            raise RuleError("Календарь сезона пройден.", 409)
        post_payroll(state, target)
        state["date"] = target
        programs = catalog["organizations"][setup["org"]]["programs"]
        state["pending"] = [
            e["id"]
            for e in catalog["events"]
            if e["start"] == target
            and e["series"] in programs
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


def team_color(organization):
    # Interface palette for team apparel; also stable for independent teams.
    colors = {
        "team-aston-martin-aramco-f1-team": "#00795e",
        "team-williams-racing": "#1463be",
        "team-toyota-gazoo-racing": "#3a3b3d",
        "supplier-pirelli": "#e7b820",
        "supplier-michelin": "#235799",
        "supplier-goodyear": "#183e81",
        "team-oracle-red-bull-racing": "#242d54",
        "team-mclaren-formula-1-team": "#eb8818",
        "team-scuderia-ferrari": "#ae293c",
        "team-mercedes-amg-petronas-f1-team": "#268c83",
    }
    palette = ["#733847", "#254963", "#365449", "#444057", "#766245"]
    if not organization:
        return "#4e525c"
    return colors.get(
        organization, palette[sha256(organization.encode()).digest()[0] % len(palette)]
    )
