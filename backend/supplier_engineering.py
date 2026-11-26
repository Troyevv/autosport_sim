"""Resolve the engineering owner separately from the racing entry used for fit checks."""

from functools import lru_cache
from .components.catalog import parts_for, POLICIES
from .domain import RuleError, occupant_on
from .finance.market import supplier_eligible
from .finance.facilities import later
from .supply import entry_agreement

ROLES = {
    "engine": ("engines", "Мощность"),
    "transmission": ("transmissions", "Переключение"),
    "tyre": ("tyres", "Сцепление"),
}


def agreement(state, world, e, axis, day=None):
    day = day or state["date"]
    agreements = [
        r
        for r in state["market"]["supplies"].values()
        if r["org"] == e["org"]
        and ("entries" not in r or e["id"] in r["entries"])
        and r["series"] == e["championship"]
        and r["product"] == axis
        and r["start"] <= day
        and r["status"] in ("signed", "terminated", "expired")
    ]
    signed = next(
        (r for r in agreements if day < min(r["end"], r.get("ended") or r["end"])), None
    )
    if agreements and not signed:
        return None
    maker = (
        signed["sponsor"] if signed else world["cars"][e["car"]]["suppliers"].get(axis)
    )
    if not maker or not supplier_eligible(
        state, world, e, maker, axis, day, later(day, 1)
    ):
        return None
    works = any(
        h["works"]
        and h["entry"] == e["id"]
        and h["provider"] == maker
        and h["product"] == axis
        and h["start"] <= day < h["end"]
        for h in state["market"].get("homologations", {}).values()
    )
    return dict(
        id=signed["id"] if signed else entry_agreement(e["id"], axis),
        maker=maker,
        partnership=signed["partnership"] if signed else "works" if works else "client",
        support=signed["support"] if signed else True,
        signed=bool(signed),
    )


@lru_cache(maxsize=None)
def _baseline(eid, org, axis, edition):
    state = {"opening": edition}
    original = parts_for(state).installed[eid].get(axis)
    if not original:
        return None
    drawing = parts_for(state).specs[parts_for(state).stock[original]["spec"]]
    if drawing["manufacturer"] == org:
        return drawing["id"]
    return next(
        (
            d["id"]
            for d in parts_for(state).specs.values()
            if d["slot"] == axis
            and d["manufacturer"] == org
            and d["interface"] == drawing["interface"]
            and d["regulation"] == drawing["regulation"]
        ),
        None,
    )


def supplier_baseline(eid, org, axis, state=None):
    return _baseline(eid, org, axis, (state or {}).get("opening"))


def engineering_entry(state, world, eid, org, axis):
    entry = world["entries"].get(eid)
    if not entry or entry["org"] == org:
        return entry
    maker = world["organizations"].get(org, {})
    if (
        "manufacturer" not in state
        or maker.get("kind") != "supplier"
        or axis not in ROLES
        or axis not in maker["lines"]
    ):
        raise RuleError("Направление находится вне полномочий организации.", 403)
    base = supplier_baseline(eid, org, axis, state)
    if not base:
        raise RuleError(
            "У производителя нет исходного чертежа для этого интерфейса.", 403
        )
    return dict(
        entry,
        supplier_axis=axis,
        supplier_baseline=base,
        client_program=entry["program"],
        client=entry["org"],
        org=org,
        program=f"{org}:{entry['championship']}",
    )


def person(state, org, role):
    return occupant_on(state["seats"].get(f"{org}:{role}", []), state["date"])


def staff(state, entry):
    org = entry["org"]
    return {
        role: person(state, org, role)
        for role in (
            ROLES[entry["supplier_axis"]][0],
            "chief-engineer",
            "chief-analyst",
            "analyst",
        )
    }


def restriction(state, world, entry, axis, year, reliability):
    from .programme.rules import bulletin

    year = year or int(state["date"][:4])
    rule = bulletin(world, entry, year)
    if axis in state["components"]["locked_slots"].get(entry["id"], {}):
        return "Изменения узла заморожены."
    if reliability:
        return None
    if (
        year == 2025
        and axis == "engine"
        and entry["championship"] == "f1"
        or rule["slot"] == axis
        and state["date"] >= rule["freeze"]
    ):
        return "Разрешено только подтверждённое исправление надёжности."
    return None


def equal_supply(world, entry, axis):
    return (
        POLICIES[entry["championship"]] == "standard"
        or entry["championship"] == "f1"
        or axis == "tyre"
        and world["championships"][entry["championship"]]["tyre_market"][
            entry["category"]
        ]["mode"]
        == "sole"
    )
