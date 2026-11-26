"""Map version-one appointments to the fictional roster without restarting a career."""

from functools import lru_cache
from . import domain
from .catalog import load_catalog


@lru_cache(maxsize=1)
def original_world():
    return load_catalog(legacy=True)


@lru_cache(maxsize=1)
def previous_world():
    return load_catalog(previous=True)


def upgrade(state):
    roster = previous_world()
    old = original_world()
    setup = dict(state["setup"])
    setup.pop("face_pool")
    previous = state["people"]["player"].get("face")
    setup["player_face"] = (
        previous if previous in roster["reserve"] else domain.player_face(roster, setup)
    )
    fresh = domain.new_world(roster, setup)
    identities = {"player": "player"}
    seats = {}
    for eid, entry in old["entries"].items():
        identities.update(
            zip(entry["crew"], roster["entries"][eid]["crew"], strict=True)
        )
    for key, seat in old["assignments"].items():
        target = key
        if seat["position"] == "driver":
            target = key.rsplit(":", 1)[0] + ":" + identities[seat["person"]]
        seats[key] = target
        if seat["person"]:
            identities.setdefault(
                seat["person"], roster["assignments"][target]["person"]
            )
    for key, history in state["seats"].items():
        if history:
            target = seats[key]
            fresh["seats"][target] = [
                {
                    **a,
                    "person": roster["assignments"][target]["person"]
                    if a["person"] is not None
                    and a["person"] == old["assignments"][key]["person"]
                    else identities.get(a["person"]),
                }
                for a in history
            ]
    # Keep the old timeline, accounting, technical state, RNG and revision.
    return {
        **state,
        "rules": roster["version"],
        "setup": setup,
        "people": fresh["people"],
        "seats": fresh["seats"],
    }


def upgrade_personnel(state, *, historical=False):
    catalog = personnel_world()
    from .personnel import initialize

    state["rules"] = catalog["version"]
    initialize(state, catalog)
    if not historical:
        from .professional import activate

        activate(state)
    return state


@lru_cache(maxsize=1)
def personnel_world():
    return load_catalog(personnel=True)


def upgrade_juniors(state):
    """Install the expansion on the current game date, preserving all existing appointments."""
    from .catalog import WORLD
    from .personnel import update_payroll

    if "junior_since" in state:
        return state
    fresh = domain.new_world(WORLD, state["setup"])
    day = state["date"]
    state["junior_reserve"] = fresh["junior_reserve"]
    new_orgs = fresh["accounts"].keys() - state["accounts"].keys()
    state.setdefault("ledger", []).extend(
        {**p, "date": day} for p in fresh["ledger"] if p["org"] in new_orgs
    )
    for field in (
        "accounts",
        "collectives",
        "people",
        "car_configurations",
        "mandates",
    ):
        for key, row in fresh[field].items():
            state[field].setdefault(key, row)
    for person in state["people"].values():
        person["adaptation"].setdefault("Karting", 0)
        person["discipline_days"].setdefault("Karting", 0)
    for aid, rows in fresh["seats"].items():
        if aid not in state["seats"]:
            state["seats"][aid] = [
                {**row, "start": day}
                for row in rows
                if not row["end"] or row["end"] > day
            ]
    for key, fund in fresh["funding"].items():
        if fund["person"] not in personnel_world()["profiles"] and fund["end"] > day:
            state["funding"][key] = {**fund, "start": day}
            if fund["payer"] in fresh["backers"]:
                state["backers"][fund["payer"]] = fresh["backers"][fund["payer"]]
    state.update(
        rules=WORLD["version"], junior_since=state["revision"], junior_migrated=True
    )
    update_payroll(state, WORLD, day)
    return state
