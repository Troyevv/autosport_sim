"""Read models for the recruitment desk, with one identity across all programs."""

from collections import defaultdict
from . import personnel as people, employment, backing, development_path
from .domain import RuleError
from . import teamwork, media_profile


def appointments(state, world):
    from .catalog import career_catalog

    world = career_catalog(state, world)
    result = defaultdict(list)
    for aid, rows in state["seats"].items():
        a = world["assignments"][aid]
        for row in rows:
            result[row["person"]].append(
                dict(
                    seat=aid, org=a["org"], entry=a["entry"], series=a["series"], **row
                )
            )
    return result


def dossier(state, world, pid, wet=False):
    from .catalog import career_catalog

    world = career_catalog(state, world)
    p = state["people"].get(pid)
    if not p:
        raise RuleError("Сотрудник не найден.", 404)
    history = appointments(state, world)[pid]
    from .professional import projection

    for row in history:
        if row["org"] != state["setup"]["org"]:
            for private_term in ("outside_starts", "combined_duties"):
                row.pop(private_term, None)
            row.pop("driver_status", None)
            row.pop("appearance_cents", None)
            row.pop("salary_cents", None)
            row.pop("buyout_cents", None)
    current = [r for r in history if people.active(r, state["date"])]
    seat = next(
        (r for r in current if r["org"] == state["setup"]["org"]),
        next(iter(current), None),
    )
    discipline = (
        world["championships"][seat["series"]]["discipline"]
        if seat and seat["series"]
        else None
    )
    options = []
    for a in world["assignments"].values():
        if (
            a.get("duty") != "relief"
            and employment.authorized(state, a)
            and a["position"] == p["position"]
            and pid != "player"
        ):
            start = people.shifted(state["date"], 3)
            for row in sorted(state["seats"][a["id"]], key=lambda r: r["start"]):
                if row["person"] != pid and people.active(row, start):
                    start = row["end"]
                    if not start:
                        break
            options.append(
                dict(
                    id=a["id"],
                    available=start,
                    ask_cents=employment.ask(state, world, p, a),
                )
            )
    org = state["setup"]["org"]
    financing = []
    for r in state["funding"].values():
        if r["person"] != pid:
            continue
        private = (
            r["payer"] == org
            or r["team"] == org
            or (r["portable"] and any(a["org"] == org for a in current))
        )
        financing.append(
            dict(r)
            if private
            else {
                k: v
                for k, v in r.items()
                if k not in ("arrears", "paid_cents", "reserved_cents", "exit_cents")
            }
        )
    profile = development_path.public_person(p)
    if p["position"] == "driver":
        from .junior_path import licences_on, points_on

        credentials = p["credentials"]
        profile["credentials"] = dict(
            licences=sorted(licences_on(credentials, state["date"])),
            points=points_on(credentials, state["date"]),
        )
    return dict(
        person=profile,
        results=[
            dict(
                session_id=key, **{k: v for k, v in result.items() if k != "session_id"}
            )
            for key, result in state["starts"].get(pid, {}).items()
            if result.get("entry")
        ],
        lineup_history=[
            r
            for r in state.get("lineup", {}).get("history", [])
            if r["person"] == pid and r["org"] == org
        ][::-1],
        classifications=list(
            p.get("credentials", {}).get("classifications", {}).values()
        ),
        calendar_context=media_profile.calendar_context(state, world, p),
        relationships=teamwork.links(state, world, pid, state["date"]),
        reports=state["reports"].get(state["setup"]["org"], {}).get(pid, []),
        financing=financing,
        scholarships=[
            dict(
                {
                    k: v
                    for k, v in s.items()
                    if k != "reserved_cents"
                    or state["academies"][s["academy"]]["org"] == org
                },
                org=state["academies"][s["academy"]]["org"],
                name=state["academies"][s["academy"]]["name"],
            )
            for s in state["scholarships"].values()
            if s["person"] == pid
        ],
        scout_available=bool(
            development_path.available_staff(
                state, world, state["setup"]["org"], {"scout"}
            )
        ),
        development=projection(state, world, pid),
        current=seat,
        history=sorted(history, key=lambda r: r["start"]),
        age=people.age_on(p, state["date"]),
        options=options,
        support=[
            r
            for r in state["support"]
            if r["advisor"] == pid and r["employer"] == state["setup"]["org"]
        ],
        profile=people.evaluate(
            p, world, state["date"], discipline=discipline, wet=wet
        ),
    )


def directory(state, world):
    history = appointments(state, world)
    results = []
    org = state["setup"]["org"]
    mandate = state["mandates"].get(org)
    manager = state["people"].get(mandate["manager"]) if mandate else None
    target = dict(series=state["setup"]["series"], org=org)
    for p in state["people"].values():
        current = [r for r in history[p["id"]] if people.active(r, state["date"])]
        seat = next(
            (r for r in current if r["org"] == state["setup"]["org"]),
            next(iter(current), {}),
        )
        programs = sorted(
            {
                s
                for r in current
                for s in (
                    [r["series"]]
                    if r["series"]
                    else world["organizations"][r["org"]]["programs"]
                )
            }
        )
        d = (
            world["championships"][seat["series"]]["discipline"]
            if seat.get("series")
            else None
        )
        profile = people.evaluate(p, world, state["date"], discipline=d)
        financial = None
        if p["position"] == "driver":
            wage = employment.ask(state, world, p, target)
            income = backing.quote(state, p["id"], org, state["date"])
            financial = dict(
                wage_cents=wage, support_cents=income, net_cents=income - wage
            )
        fit = (
            development_path.preference(
                manager,
                p,
                profile["rating"],
                financial["net_cents"] if financial else 0,
                state["date"],
            )
            if manager
            else profile["rating"]
        )
        results.append(
            dict(
                id=p["id"],
                name=p["name"],
                country=p["country"],
                face=p["face"],
                origin=p["origin"],
                position=p["position"],
                age=people.age_on(p, state["date"]),
                financial=financial,
                fit=fit,
                rating=profile["rating"],
                org=seat.get("org"),
                kit_position=world["assignments"][seat["seat"]]["position"]
                if seat
                else None,
                kit_programs=sorted(
                    {
                        series
                        for r in current
                        if r["org"] == seat.get("org")
                        for series in (
                            [r["series"]]
                            if r["series"]
                            else world["organizations"][r["org"]]["programs"]
                        )
                    }
                ),
                active_entries=[
                    r["entry"]
                    for r in current
                    if r["org"] == seat.get("org") and r.get("entry")
                ],
                programs=programs,
                specialty=p["specialization"],
                strength=profile["values"][p["specialization"]],
                tag=profile["traits"][0]["name"]
                if profile["traits"]
                else "Без особых черт",
                end=seat.get("end"),
            )
        )
    return results
