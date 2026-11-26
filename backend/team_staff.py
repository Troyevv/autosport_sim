"""Dated inputs for development projects and race entries, independent of API and storage."""

from .domain import RuleError, occupant_on
from .personnel import evaluate
from .development_path import eligibility


def department_capacity(group):
    """Available qualified person-days per working day, in hundredths."""
    return (
        group["size"]
        * group["qualification"]
        * (100 - group["workload"])
        * (100 - group["fatigue"])
        // 10000
    )


def assigned_profiles(state, world, org, series, *, entry=None, wet=False):
    """Use the checkpoint for the session/project date. A vacancy yields no skills."""
    if series not in world["organizations"][org]["programs"]:
        raise RuleError("Организация не участвует в программе.")
    if entry and (
        world["entries"][entry]["org"],
        world["entries"][entry]["championship"],
    ) != (org, series):
        raise RuleError("Заявка принадлежит другой программе.")
    discipline = world["championships"][series]["discipline"]
    roster = {}
    for aid, seat in world["assignments"].items():
        if (
            seat.get("academy")
            or seat["org"] != org
            or seat["series"] not in (None, series)
            or seat["entry"] not in (None, entry)
        ):
            continue
        pid = occupant_on(state["seats"][aid], state["date"])
        if pid:
            person = state["people"][pid]
            roster[aid] = dict(
                person=pid,
                position=seat["position"],
                experience=person["experience"],
                adaptability=person["adaptability"],
                ambition=person["ambition"],
                preferences=person.get("preferences", {}),
                **evaluate(
                    person,
                    world,
                    state["date"],
                    discipline=discipline,
                    wet=wet,
                ),
            )
    return roster


def crew_for_session(state, world, entry, event, *, wet=False):
    e = world["entries"][entry]
    if (
        event["series"] != e["championship"]
        or not event["start"] <= state["date"] <= event["end"]
    ):
        raise RuleError("Сессия не соответствует заявке или игровой дате.")
    crew = [
        p
        for p in assigned_profiles(
            state, world, e["org"], e["championship"], entry=entry, wet=wet
        ).values()
        if p["position"] == "driver"
    ]
    low, high = world["championships"][e["championship"]]["crew"]
    if not low <= len(crew) <= high:
        raise RuleError("Численность экипажа не соответствует регламенту.")
    policy = world["championships"][event["series"]]["admission"]
    others = {
        ev["series"]
        for ev in world["events"]
        if ev["series"] != event["series"]
        and ev["start"] <= event["end"]
        and event["start"] <= ev["end"]
        and world["championships"][ev["series"]]["admission"].get("priority", 0)
        > policy.get("priority", 0)
    }
    busy = {
        occupant_on(state["seats"][a["id"]], state["date"])
        for a in world["assignments"].values()
        if a["position"] == "driver" and a["series"] in others
    }
    for member in crew:
        reason = eligibility(state["people"][member["person"]], policy, state["date"])
        if reason:
            raise RuleError(reason)
        if member["person"] in busy:
            raise RuleError("Совмещающий пилот занят в приоритетном чемпионате.")
    return crew
