"""Read models for the recruitment desk, with one identity across all programs."""

from collections import defaultdict
from . import personnel as people, employment, backing, development_path
from .domain import RuleError
from . import teamwork


def appointments(state, world):
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
    p = state["people"].get(pid)
    if not p:
        raise RuleError("Сотрудник не найден.", 404)
    history = appointments(state, world)[pid]
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
            employment.authorized(state, a)
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
    return dict(
        person=development_path.public_person(p),
        relationships=teamwork.links(state, world, pid, state["date"]),
        reports=state["reports"].get(state["setup"]["org"], {}).get(pid, []),
        financing=[r for r in state["funding"].values() if r["person"] == pid],
        scholarships=[
            dict(
                s,
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
                face=p["face"],
                origin=p["origin"],
                position=p["position"],
                age=people.age_on(p, state["date"]),
                financial=financial,
                fit=fit,
                rating=profile["rating"],
                org=seat.get("org"),
                programs=programs,
                specialty=p["specialization"],
                strength=profile["values"][p["specialization"]],
                tag=profile["traits"][0]["name"],
                end=seat.get("end"),
            )
        )
    return results
