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


def upgrade_personnel(state):
    from .catalog import WORLD
    from .personnel import initialize

    state["rules"] = WORLD["version"]
    initialize(state, WORLD)
    return state
