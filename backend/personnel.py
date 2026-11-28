"""Time-dependent personnel skills shared by the staff desk, R&D and sessions."""

from datetime import date, timedelta
from hashlib import sha256

from .domain import RuleError, START


def shifted(day, days):
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


def age_on(person, day):
    return (
        int(day[:4])
        - int(person["birth_date"][:4])
        - (day[5:] < person["birth_date"][5:])
    )


def active(row, day):
    return row["start"] <= day and (not row["end"] or day < row["end"])


def bookings(state, person):
    return [
        (aid, row)
        for aid, rows in state["seats"].items()
        for row in rows
        if row["person"] == person
    ]


def initialize(state, catalog):
    state.update(
        personnel_since=state["revision"],
        personnel_start=state["date"],
        offers={},
        notices=[],
        support=[],
    )
    disciplines_in_world = {r["discipline"] for r in catalog["championships"].values()}
    roles = {a["person"]: a["position"] for a in catalog["assignments"].values()}
    roles["player"] = state["setup"]["role"]
    for aid, seat in catalog["assignments"].items():
        if aid not in state["seats"]:
            state["seats"][aid] = [
                dict(person=seat["person"], start=state["date"], end=None)
            ]
    for pid, profile in catalog["profiles"].items():
        if pid not in state["people"]:
            person = dict(profile)
            if person["face"] == state["people"]["player"]["face"]:
                used = {p["face"] for p in state["people"].values()}
                person["face"] = next(
                    (f for f in catalog["reserve"] if f not in used), None
                )
            state["people"][pid] = person
    for pid, person in state["people"].items():
        pos = roles.get(pid) or person["position"]
        initialize_person(state, catalog, person, pos, disciplines_in_world)
    counts = {}
    for seat in catalog["assignments"].values():
        counts[seat["org"]] = counts.get(seat["org"], 0) + 1
    for aid, rows in state["seats"].items():
        seat = catalog["assignments"][aid]
        org = seat["org"]
        per_seat = state["accounts"][org]["payroll_cents"] // (2 * counts[org])
        for row in rows:
            p = state["people"][row["person"]]
            row["salary_cents"] = min(
                per_seat, (sum(p["skills"].values()) // len(p["skills"])) * 3500
            )
            if state.get("opening"):
                programmes = catalog["organizations"][org]["programs"]
                scale = (
                    4.5
                    if "f1" in programmes
                    else 1.8
                    if set(programmes) & {"wec", "dtm"}
                    else 1.0
                )
                weight = {
                    "driver": 2.6,
                    "manager": 2.0,
                    "chief-engineer": 1.6,
                    "manufacturer": 1.8,
                    "owner": 0.6,
                }.get(seat["position"], 1.0)
                if seat.get("duty") in ("test", "reserve"):
                    weight *= 0.45
                row["salary_cents"] = round(row["salary_cents"] * scale * weight)
            row["buyout_cents"] = row["salary_cents"] * 2
            # Ownership and the player's mandate are open-ended.
            if (
                not row["end"]
                and row["person"] != "player"
                and seat["position"] != "owner"
            ):
                row["end"] = "2026-01-01"
            for d in disciplines(catalog, seat):
                p["adaptation"][d] = 80
                p["discipline_days"][d] = p["experience"] * 365
    update_payroll(state, catalog, state["date"])
    from . import backing, development_path

    development_path.initialize(state, catalog)
    backing.initialize(state, catalog)
    from . import teamwork

    teamwork.initialize(state, catalog)
    from .media_profile import initialize as initialize_identity

    initialize_identity(state)


def initialize_person(state, catalog, person, pos, disciplines_in_world):
    pid = person["id"]
    profile = catalog["positions"][pos]["skills"]
    baseline = sum(person["skills"].values()) // len(person["skills"])
    seed_id = (
        catalog["assignments"][state["setup"]["org"] + ":" + pos]["person"]
        if pid == "player"
        else pid
    )
    seed_profile = catalog["profiles"].get(seed_id, {})
    person["skills"] = {
        k: person["skills"].get(k, seed_profile.get("skills", {}).get(k, baseline))
        for k in profile
    }
    if person["specialization"] not in profile:
        person["specialization"] = profile[0]
    digest = sha256(pid.encode()).digest()
    person.update(
        position=pos,
        adaptation=dict.fromkeys(disciplines_in_world, 0),
        discipline_days=dict.fromkeys(disciplines_in_world, 0),
        worked_days=0,
        training=None,
        courses=0,
    )
    for i, k in enumerate(
        ("ambition", "loyalty", "professionalism", "adaptability", "reputation")
    ):
        person[k] = 40 + digest[i] % 55
    traits = ["specialist" if digest[0] % 4 else "inconsistent"]
    if pos == "driver" and (person["specialization"] == "Дождь" or digest[1] % 3 == 0):
        traits.append("rain")
    person["traits"] = [dict(id=t, start=START, end=None) for t in traits]


def disciplines(catalog, seat):
    programs = (
        [seat["series"]]
        if seat["series"]
        else catalog["organizations"][seat["org"]]["programs"]
    )
    return {catalog["championships"][s]["discipline"] for s in programs}


def update_payroll(state, catalog, day):
    from .catalog import career_catalog

    catalog = career_catalog(state, catalog)
    totals = dict.fromkeys(state["accounts"], 0)
    for group in state["collectives"].values():
        totals[group["org"]] += group["payroll_cents"]
    for aid, rows in state["seats"].items():
        totals[catalog["assignments"][aid]["org"]] += sum(
            r["salary_cents"] for r in rows if active(r, day)
        )
    for org, total in totals.items():
        account = state["accounts"][org]
        account.update(
            payroll_cents=total, forecast_cents=account["cash_cents"] - total
        )


def evaluate(person, catalog, day, *, discipline=None, wet=False):
    """Canonical ordered skill profile, one additive pass, then a single clamp."""
    keys = catalog["positions"][person["position"]]["skills"]
    base = person["skills"]
    if set(base) != set(keys) or any(
        type(v) is not int or not 0 <= v <= 100 for v in base.values()
    ):
        raise RuleError("Профиль навыков не соответствует должности.")
    readiness = (person["morale"] - 70) // 15 - person["fatigue"] // 10
    familiarity = (person["adaptation"][discipline] - 80) // 10 if discipline else 0
    values = {k: base[k] + readiness + familiarity for k in keys}
    effects = []
    for t in person["traits"]:
        code = t["id"]
        trait = catalog["staff_rules"]["traits"][code]
        applies = active(t, day) and (code != "rain" or wet)
        skill = t.get("skill", "Дождь" if code == "rain" else person["specialization"])
        if applies:
            values[skill] += trait["delta"]
        effects.append(
            dict(
                t,
                **trait,
                skill=skill,
                active=applies,
            )
        )
    values = {k: min(100, max(0, v)) for k, v in values.items()}
    weights = catalog["positions"][person["position"]]["weights"]
    score = sum(values[k] * weights[k] for k in keys)
    return dict(
        values=values,
        weights=weights,
        traits=effects,
        readiness=readiness,
        familiarity=familiarity,
        rating=(score + sum(weights.values()) // 2) // sum(weights.values()),
    )


def develop(state, catalog, target):
    from .catalog import career_catalog

    catalog = career_catalog(state, catalog)
    rules = catalog["staff_rules"]["training"]
    interval = rules["adaptation_days"]
    start = state["date"]
    days = (date.fromisoformat(target) - date.fromisoformat(start)).days
    from . import teamwork

    teamwork.work(state, catalog, start, target)
    employed = set()
    practiced = set()
    actual_duties = "duty_since" in state.get("engineering_service", {})
    if actual_duties:
        from .personal_engineering import practice_by_duty

        for pid, disciplines_worked in practice_by_duty(state, catalog, start).items():
            employed.add(pid)
            practiced.update((pid, discipline) for discipline in disciplines_worked)
    for aid, rows in state["seats"].items():
        seat = catalog["assignments"][aid]
        for r in rows:
            if not active(r, start):
                continue
            pid = r["person"]
            if actual_duties and seat["position"] in (
                "race-engineer",
                "technical-advisor",
            ):
                continue
            employed.add(pid)
            if "lineup" in state and seat["position"] == "driver":
                from .driver_availability import unavailable

                if unavailable(state, pid, start):
                    employed.discard(pid)
                    continue
            if seat.get("duty"):
                continue
            practiced.update((pid, d) for d in disciplines(catalog, seat))
    for pid, discipline in practiced:
        p = state["people"][pid]
        old = p["discipline_days"][discipline]
        p["discipline_days"][discipline] += days
        p["adaptation"][discipline] = min(
            100,
            p["adaptation"][discipline] + (old + days) // interval - old // interval,
        )
    for pid in sorted(state["people"]):
        p = state["people"][pid]
        if pid in employed:
            p["worked_days"] += days
            years, p["worked_days"] = divmod(p["worked_days"], 365)
            p["experience"] += years
        if "growth_since" in state:
            from .professional import age_interval

            age_interval(state, p, start, target)
            p["fatigue"] = max(0, p["fatigue"] - days * rules["recovery"])
        else:
            from .legacy_courses import progress

            progress(state, catalog, p, start, target, days, rules)
    if "growth_since" in state:
        for g in state["collectives"].values():
            g["fatigue"] = max(0, g["fatigue"] - days * rules["recovery"])
