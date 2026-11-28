"""Read multiple existing department projections from the same career checkpoint."""

from . import council, domain
from .catalog import lineup_for
from .development import desk as development
from .domain import RuleError
from .finance import budget, capital, facilities, market, rights
from .finance.reports import statement
from .manufacturer import desk as manufacturer
from .production import desk as production
from .programme import desk as programme
from .research import desk as research


PROJECTIONS = {
    "capital": capital.projection,
    "commercial": market.projection,
    "council": council.projection,
    "development": development.projection,
    "facilities": facilities.projection,
    "garage": rights.catalog,
    "manufacturer": manufacturer.projection,
    "production": production.projection,
    "programme": programme.projection,
    "research": research.projection,
}


def read(db, cid, state, topics):
    names = tuple(dict.fromkeys(topics))
    if set(names) - (PROJECTIONS.keys() | {"budget", "finance", "accounts", "funding"}):
        raise RuleError("Неизвестный раздел рабочего места.")
    world = lineup_for(state)
    projected = {
        name: PROJECTIONS[name](state, world) for name in names if name in PROJECTIONS
    }
    if "funding" in names:
        org = state["setup"]["org"]
        occupants = {
            domain.occupant_on(state["seats"].get(seat["id"], []), state["date"])
            for seat in world["assignments"].values()
            if seat["org"] == org
        }
        projected["funding"] = [
            fund
            for fund in state["funding"].values()
            if org in (fund["team"], fund["payer"])
            or (fund["portable"] and fund["person"] in occupants)
        ]
    if "budget" in names:
        projected["budget"] = budget.report(
            state, world, state["setup"]["org"], int(state["date"][:4])
        )
    if "finance" in names or "accounts" in names:
        root = statement(state, world, db, cid, "organization")
        projected["finance"] = root
        if "accounts" in names:
            projected["accounts"] = {
                scope: root
                if scope == root["scope"]
                else statement(state, world, db, cid, scope)
                for scope in root["scopes"]
            }
    return {"revision": state["revision"], "projections": projected}
