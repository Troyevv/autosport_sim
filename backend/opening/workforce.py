"""Employment, sporting hierarchy and prior professional experience on the opening date."""

from collections import Counter, defaultdict

from .. import personnel, teamwork
from ..development_path import eligibility
from ..employment import leaving_mid_session
from .population import sample

SHORT = ("2025-05-01", "2025-06-01", "2025-07-01", "2025-08-01")
SEASON = ("2025-11-01", "2025-12-01", "2025-12-15", "2026-01-01")
LONG = ("2026-07-01", "2026-12-01", "2027-01-01", "2027-07-01", "2028-01-01")


def varied_profiles(state, world):
    day = state["date"]
    for pid, p in state["people"].items():
        n = sample(pid + "-profile")
        age = personnel.age_on(p, day)
        # A young driver may have started karting at six. Professionals qualify later.
        experience = min(
            p["experience"], max(0, age - (6 if p["position"] == "driver" else 18))
        )
        p["experience"] = experience
        p["reputation"] = min(
            99, (p["reputation"] * 2 + min(98, 27 + 3 * experience)) // 3
        )
        skills = p["skills"]
        specialty = p["specialization"]
        generalist = p["adaptability"] > 78 and n % 3 == 0
        for name, level in skills.items():
            skills[name] = max(
                10,
                min(
                    98,
                    level
                    + (3 if generalist else 6 if name == specialty else -2)
                    + sample(pid + name) % 7
                    - 3,
                ),
            )
        if p["position"] == "driver":
            p["reaction"] = skills["Старт"]
        p["potential"] = min(
            99, max(max(skills.values()), p["potential"] + (4 if age < 23 else -3))
        )
        traits = []
        if not generalist and n % 5 < 2:
            traits.append("specialist")
        if p["professionalism"] < 63 and n % 3:
            traits.append("inconsistent")
        if p["position"] == "driver" and skills.get("Дождь", 0) >= 75 and n % 3:
            traits.append("rain")
        if experience >= 6 and p["professionalism"] >= 72 and n % 2:
            traits.append("practiced")
        if n % 11 == 0:
            traits.append("focused")
        p["traits"] = [
            dict(
                id=t,
                start=day,
                end=personnel.shifted(day, 5 + n % 21) if t == "focused" else None,
            )
            for t in traits
        ]
        for d, old in p["adaptation"].items():
            previous = old > 0 or d == p.get("market_discipline")
            p["adaptation"][d] = (
                min(97, 51 + min(experience, 22) + p["adaptability"] // 5)
                if previous
                else 25 + n % 28
                if generalist and experience >= 4
                else 0
            )
            p["discipline_days"][d] = min(
                experience * 365,
                (experience * (180 if previous else 38) + n % 140)
                if p["adaptation"][d]
                else 0,
            )
    for key, r in state["relationships"].items():
        r["trust_change"] = sample(key + "-trust") % 31 - 14
    for key, g in state["collectives"].items():
        n = sample(key + "-cohesion")
        g.update(
            team_days=25 + n % 950,
            motivation=51 + n % 37,
            atmosphere=45 + n // 7 % 43,
            pressure=33 + n // 19 % 39,
        )


def secondary_seats(state, world):
    used = {r["person"] for rows in state["seats"].values() for r in rows}
    pool = [
        p
        for p in state["people"].values()
        if p["position"] == "driver"
        and p["id"] not in used
        and not p.get("market_discipline")
    ]
    for aid, a in sorted(world["assignments"].items()):
        if (
            a.get("duty") not in ("reserve", "test")
            or state["seats"][aid]
            or a["series"] not in ("f2", "f3", "dtm", "freca")
        ):
            continue
        if sample(aid) % (3 if a["duty"] == "reserve" else 7):
            continue
        chosen = next(
            (
                p
                for p in sorted(pool, key=lambda p: sample(aid + p["id"]))
                if eligibility(
                    p, world["championships"][a["series"]]["admission"], state["date"]
                )
                is None
            ),
            None,
        )
        if chosen:
            state["seats"][aid].append(
                dict(
                    person=chosen["id"],
                    position="driver",
                    start=state["date"],
                    end="2026-01-01",
                    salary_cents=210000 + 2500 * chosen["reputation"],
                )
            )
            pool.remove(chosen)


def race_salary(state, person, seat, negotiated):
    """Monthly guaranteed retainer, separate from seat backing and race bonuses."""
    if person["position"] != "driver" or not seat.get("entry", True):
        return negotiated
    # A junior retainer is a racing allowance. Family, academy and sponsor
    # contributions are booked separately to the racing operator.
    junior_share = {
        "kart-okj": 2,
        "kart-ok": 3,
        "f4-it": 8,
        "f4-es": 8,
        "f4-gb": 8,
        "freca": 15,
        "f3": 26,
        "f2": 52,
    }
    series = seat["series"]
    if series in junior_share:
        return max(100, negotiated * junior_share[series] // 100)
    if series not in ("f1", "wec", "dtm"):
        return negotiated
    # The top class buys scarce race seats at a different scale from GT and
    # endurance. Reputation and driving experience affect an individual's market.
    base_eur, premium = {"f1": (55000, 82), "wec": (5500, 4), "dtm": (4500, 3)}[
        seat["series"]
    ]
    standing = max(
        0,
        person["skills"]["Темп"]
        + person["reputation"]
        + min(25, person["experience"])
        - 103,
    )
    share = min(
        130,
        max(
            74,
            state["accounts"][seat["org"]]["budget_cents"]
            // (125000000 if seat["series"] == "f1" else 14000000),
        ),
    )
    if series == "wec" and seat.get("entry"):
        from ..catalog import lineup_for

        if lineup_for(state)["entries"][seat["entry"]]["category"] == "LMGT3":
            share = share * 55 // 100
    return (base_eur + premium * standing * standing) * share + negotiated


def contracts_and_people(state, world):
    varied_profiles(state, world)
    secondary_seats(state, world)
    crews = defaultdict(lambda: defaultdict(list))
    starts = Counter(pid for e in world["entries"].values() for pid in e["crew"])
    for aid, rows in state["seats"].items():
        seat = world["assignments"][aid]
        for row in rows:
            p = state["people"][row["person"]]
            n = sample(aid + "-term")
            role = seat["position"]
            key = p["professionalism"] + p["loyalty"] + min(p["experience"], 20)
            terms = (
                LONG
                if key + n % 50 > 177
                else SHORT
                if n % 9 == 0 or seat.get("duty") and n % 4 == 0
                else SEASON
            )
            row["end"] = (
                None
                if role == "owner" or p["id"] == "player"
                else terms[n % len(terms)]
            )
            while row["end"] and leaving_mid_session(world, seat, row["end"]):
                row["end"] = personnel.shifted(row["end"], 1)
            row["agreed_end"] = row["end"]
            row["salary_cents"] = (
                row["salary_cents"]
                * (50 + p["reputation"] // 2 + min(28, p["experience"]) + n % 38)
                // 100
            )
            row["salary_cents"] = race_salary(state, p, seat, row["salary_cents"])
            row["buyout_cents"] = (
                0
                if role == "owner"
                else row["salary_cents"] * ((2 if terms == LONG else 0) + n % 5)
            )
            row["remit"] = (
                "independent"
                if key >= 153
                else "supervised"
                if p["experience"] < 5 and key < 133
                else "standard"
            )
            if role != "driver":
                continue
            row["combined_duties"] = bool(seat.get("duty") and n % 3 == 0)
            row["outside_starts"] = (
                starts[p["id"]] > 1
                or bool(seat.get("duty") and n % 2)
                or seat["series"] != "f1"
                and n % 4 == 0
            )
            if seat["entry"]:
                e = world["entries"][seat["entry"]]
                crews[(seat["org"], seat["series"], e["category"])][e["id"]].append(
                    (p, row)
                )
    personnel.update_payroll(state, world, state["date"])
    return crews


def sporting_terms(state, crews):
    support = Counter()
    for f in state["funding"].values():
        support[f["person"]] += f["monthly_cents"]
    for (oid, series, category), entries in crews.items():
        m = state["mandates"][oid]
        manager = state["people"][m["manager"]]
        if (
            len(entries) < 2
            or series == "wec"
            or oid == "team-mclaren-formula-1-team"
            or sample(oid + series + category) % 100
            >= 25 + manager["management"]["discipline"] // 3
        ):
            continue

        def standing(eid):
            results = []
            for p, _ in entries[eid]:
                relationship = state["relationships"].get(
                    f"hierarchy|{p['id']}|{m['manager']}"
                )
                results.append(
                    2 * p["skills"]["Темп"]
                    + p["reputation"]
                    + p["ambition"] // 3
                    + min(22, p["experience"])
                    + min(10, support[p["id"]] // 500000)
                    + (teamwork.trust(relationship) // 6 if relationship else 0)
                )
            return sum(results) // len(results), eid

        leader = max(entries, key=standing)
        for eid, crew in entries.items():
            for _, row in crew:
                row["driver_status"] = "first" if eid == leader else "second"
