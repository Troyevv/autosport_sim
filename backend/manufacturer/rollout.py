"""A common specification changes only when every contracted entry can receive a serial."""

from .. import components, production, research
from ..components.catalog import parts_for, POLICIES
from ..components.registry import drawing_for
from ..domain import RuleError
from ..supplier_engineering import agreement, equal_supply, supplier_baseline


def market_key(day, entry, org, axis):
    return "/".join((day[:4], entry["championship"], entry["category"], org, axis))


def standard(state, entry, org, axis):
    key = market_key(state["date"], entry, org, axis)
    return state["manufacturer"]["standards"].get(key) or supplier_baseline(
        entry["id"], org, axis, state
    )


def allocation(state, world, org, entry, version):
    from . import delivery_block

    drawing = drawing_for(state, version)
    axis = drawing["slot"]
    if (
        not entry
        or drawing["manufacturer"] != org
        or not equal_supply(world, entry, axis)
    ):
        raise RuleError("Для этого рынка совместное внедрение не предусмотрено.")
    if state["date"][:4] == "2025" and POLICIES[entry["championship"]] == "standard":
        raise RuleError("В стартовом монокубке предписана исходная спецификация.")
    if axis not in parts_for(state).installed[entry["id"]]:
        raise RuleError("Узел отсутствует в этой заявке.")
    if version == standard(state, entry, org, axis):
        raise RuleError("Спецификация уже предоставлена клиентам.")
    cohort = []
    for e in world["entries"].values():
        if (e["championship"], e["category"]) != (
            entry["championship"],
            entry["category"],
        ) or not research.admitted(state, e):
            continue
        terms = agreement(state, world, e, axis)
        if terms and terms["maker"] == org:
            cohort.append((e, terms))
    if not cohort or entry["id"] not in {e["id"] for e, _ in cohort}:
        raise RuleError("Нет действующего договора для выбранной программы.")
    stock = {
        i
        for i in production.inventory(state, org)
        if components.spec(state, i)["id"] == version
    }
    result = []
    space = {}
    for e, terms in sorted(cohort, key=lambda pair: pair[0]["id"]):
        client = e["org"]
        if client not in space:
            space[client] = production.storage_space(state, world, client)["free"]
        if space[client] < 1:
            raise RuleError(
                "Недостаточно складских мест у клиента "
                + world["organizations"][client]["name"]
                + "."
            )
        space[client] -= 1
        allowed = [
            i
            for i in sorted(stock)
            if not delivery_block(state, world, org, e, i, rollout=True)
        ]
        if not allowed:
            raise RuleError(
                "Для заявки "
                + e["id"]
                + " нет совместимого экземпляра этой спецификации после ОТК."
            )
        # Use earmarked stock before unrestricted serials.
        batches = state["production"]["batches"]
        iid = min(
            allowed,
            key=lambda i: (
                batches.get(state["production"]["items"][i]["batch"], {}).get(
                    "contract"
                )
                != terms["id"],
                i,
            ),
        )
        stock.remove(iid)
        result.append((e, iid))
    return result


def publish(state, world, org, entry, version):
    from . import deliver

    rows = allocation(state, world, org, entry, version)
    axis = drawing_for(state, version)["slot"]
    state["manufacturer"]["standards"][market_key(state["date"], entry, org, axis)] = (
        version
    )
    for e, iid in rows:
        deliver(state, world, org, e, iid)
