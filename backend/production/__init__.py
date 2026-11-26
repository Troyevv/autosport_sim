"""Batch orders, actual costs and serial-level dispositions. The car registry owns fit and wear."""

from typing import Literal

from pydantic import Field

from ..manufacturer.context import engineering_entry
from .. import components, development, finance
from ..components.catalog import OPENING
from ..components.registry import drawing_for
from ..domain import RuleError
from ..finance import budget, facilities
from ..finance.market import contracted_supplier
from ..research import admitted
from ..research.model import Priority, METHODS
from ..staff_input import Fields, Id


class Order(Fields):
    entry: Id
    specification: Id
    quantity: int = Field(ge=1, le=24)
    priority: Priority
    rush: bool
    outsource: bool


class Change(Fields):
    batch: Id
    priority: Priority


class Cancel(Fields):
    batch: Id


class Disposition(Fields):
    instance: Id
    decision: Literal["inspect", "repair", "scrap"]


ORDERS = {
    "production-order": Order,
    "production-priority": Change,
    "production-cancel": Cancel,
    "production-disposition": Disposition,
}


def initialize(state):
    state.setdefault(
        "production", dict(since=state["revision"], batches={}, items={}, history=[])
    )


def permitted(state, world, entry, drawing, outsource, *, year=None):
    if not admitted(state, entry):
        return "Нет действующего допуска программы."
    org, slot = entry["org"], drawing["slot"]
    if "supplier_axis" in entry:
        if (
            outsource
            or drawing["manufacturer"] != org
            or drawing["interface"] != OPENING.interfaces[entry["id"]]
        ):
            return "Нет прав на изготовление этой редакции."
        if drawing["id"] not in OPENING.specs and not development.released(
            state, org, drawing["id"]
        ):
            return "Чертёж ожидает выпуска или отозван."
        return None
    if not components.compatible(
        state, world, entry, drawing, year=year, planning=True
    ):
        return "Узел несовместим, заморожен или не разрешён регламентом и договором поставки."
    if drawing["id"] not in OPENING.specs and not development.released(
        state, org, drawing["id"]
    ):
        return "Редакция ожидает допуска или отозвана."
    if drawing["manufacturer"] == org:
        return development.restriction(
            state, world, entry, slot, year=year, reliability=True
        )
    if contracted_supplier(state, entry, slot) not in (None, drawing["manufacturer"]):
        return "По действующему договору узел поставляет другой изготовитель."
    if not outsource:
        return "Серийный узел изготавливает утверждённый поставщик."
    if drawing["id"] not in OPENING.rules[drawing["regulation"]]["approved"]:
        return "Подрядчику недоступна утверждённая редакция."
    return None


def quote(drawing, rush, outsource):
    # Pinned workshop estimates, per serial, excluding separately journaled facility use.
    _, _, _, hours, materials = METHODS[drawing["slot"]]
    return dict(
        hours=max(8, hours // (3 if rush else 2)),
        cents=materials * (100 + 50 * rush + 25 * outsource) // 100,
    )


def spend(state, world, org, key, cents):
    budget.authorize(state, world, org, "production", cents, state["date"])
    finance.transfer(state, org, None, key, cents, "production")


def log(state, entry, version, code, actor, *, batch=None, instance=None):
    history = state["production"]["history"]
    owner = state["production"]["batches"].get(batch, {}).get("org")
    history.append(
        dict(
            **({"org": owner} if owner and owner.startswith("supplier-") else {}),
            id=f"workshop-{len(history) + 1}",
            date=state["date"],
            entry=entry,
            version=version,
            code=code,
            person=actor,
            batch=batch,
            instance=instance,
        )
    )


def commission(state, world, org, key, order, *, target_year=None):
    batches = state["production"]["batches"]
    if key in batches:
        if (
            batches[key]["org"] == org
            and batches[key]["request"] == order.model_dump()
            and batches[key].get("target_year") == target_year
        ):
            return batches[key]
        raise RuleError("Номер партии уже использован.", 409)
    from ..programme import paused

    year = target_year or int(state["date"][:4])
    if paused(state, org, year) and target_year is not None:
        raise RuleError("Развитие текущего поколения остановлено менеджером.", 409)
    drawing = drawing_for(state, order.specification)
    entry = engineering_entry(state, world, order.entry, org, drawing["slot"])
    if not entry or entry["org"] != org:
        raise RuleError("Заявка вне полномочий команды.", 403)
    if reason := permitted(
        state, world, entry, drawing, order.outsource, year=target_year
    ):
        raise RuleError(reason)
    lead = components.specialists(state, world, entry).get(
        "chief-engineer" if "supplier_axis" in entry else "chief-mechanic"
    )
    if not lead:
        raise RuleError("Требуется назначенный главный механик.")
    if order.quantity > storage_space(state, world, org)["free"]:
        raise RuleError(
            "Недостаточно складских мест для партии. Расширьте склад или освободите резерв.",
            409,
        )
    unit = quote(drawing, order.rush, order.outsource)
    cost = unit["cents"] * order.quantity
    credit = 0
    contract = None
    if "supplier_axis" in entry:
        from ..manufacturer.context import agreement

        terms = agreement(state, world, world["entries"][order.entry], drawing["slot"])
        if terms and terms["signed"] and terms["maker"] == org:
            contract = terms["id"]
            paid = state["finance"]["instalments"].get(contract + ":production", {})
            if paid.get("status") == "paid":
                used = sum(
                    b.get("prepaid_cents", 0)
                    for b in batches.values()
                    if b.get("contract") == contract
                )
                credit = min(cost, max(0, paid["amount_cents"] - used))
    if cost > credit:
        spend(state, world, org, key, cost - credit)
    batch = dict(
        **order.model_dump(),
        id=key,
        org=org,
        request=order.model_dump(),
        commissioned=state["date"],
        commission_revision=state["revision"],
        cost_cents=cost,
        facility_cents=0,
        required=unit["hours"] * order.quantity,
        worked=0,
        days=0,
        risk_sum=0,
        status="queued",
        reason="Ожидает рабочей смены.",
        finished=None,
        grants=[],
        participants={},
    )
    if contract:
        batch.update(contract=contract, prepaid_cents=credit)
    if target_year is not None:
        batch["target_year"] = target_year
    if target_year is not None and "supplier_axis" not in entry:
        from ..programme.rules import pin_concept

        pin_concept(state, world, entry, target_year)
    batches[key] = batch
    log(state, entry["id"], drawing["id"], "ordered", lead, batch=key)
    return batch


def inventory(state, org):
    return [
        *OPENING.by_org.get(org, ()),
        *(
            iid
            for iid, item in state["components"]["inventory"].items()
            if item["org"] == org
        ),
    ]


def mounted(state, world, org):
    return {
        iid: e["id"]
        for e in world["entries"].values()
        if e["org"] == org
        for iid in components.mounting(state, e["id"]).values()
    }


def storage_space(state, world, org):
    """Opening racks plus the organization's staffed or leased warehouse capacity."""
    fitted = mounted(state, world, org)
    stock = inventory(state, org)
    used = sum(
        iid not in fitted and status(state, iid, fitted) != "scrapped" for iid in stock
    )
    reserved = sum(
        b["quantity"]
        for b in state["production"]["batches"].values()
        if b["org"] == org and not b["finished"]
    )
    # Opening racks fit the initial spares plus one replacement set for each entered car.
    base = len(OPENING.by_org.get(org, ()))
    day = state["date"]
    slots = sum(
        max(0, facilities.free(state, site, day, facilities.later(day, 1), buyer=org))
        for site in state["estate"]["assets"].values()
        if site["kind"] == "warehouse"
    )
    total = base + slots * 12
    return dict(
        total=total, used=used, reserved=reserved, free=max(0, total - used - reserved)
    )


def status(state, iid, mounts):
    if iid in mounts:
        return "installed"
    return state["production"]["items"].get(iid, {}).get("status", "stock")


def actions(state, iid, phase):
    if phase in ("installed", "scrapped"):
        return []
    item = state["production"]["items"].get(iid, {})
    result = ["scrap"]
    if phase == "stock":
        result.append("inspect")
    if (
        item.get("rejected") or components.condition(state, iid)["damaged"]
    ) and phase != "repair":
        result.append("repair")
    return result


def disposition(state, world, org, order):
    iid = order.instance
    if iid not in inventory(state, org):
        raise RuleError("Экземпляр вне полномочий команды.", 403)
    phase = status(state, iid, mounted(state, world, org))
    if order.decision not in actions(state, iid, phase):
        raise RuleError("Состояние экземпляра исключает это действие.")
    items = state["production"]["items"]
    drawing = components.spec(state, iid)
    if iid in items:
        entry = world["entries"][items[iid]["entry"]]
    else:
        entry = next(
            (
                e
                for e in world["entries"].values()
                if e["org"] == org
                and OPENING.interfaces[e["id"]] == drawing["interface"]
                and world["cars"][e["car"]]["regulation"] == drawing["regulation"]
            ),
            None,
        )
        if entry is None:
            raise RuleError("Не найдена программа обслуживания.")
    lead = components.specialists(state, world, entry).get("chief-mechanic")
    if not lead:
        raise RuleError("Требуется назначенный главный механик.")
    if order.decision == "repair":
        spend(
            state,
            world,
            org,
            f"repair-{state['revision']}-{iid}",
            quote(drawing, False, False)["cents"] // 3,
        )
    item = items.setdefault(
        iid,
        dict(
            entry=entry["id"],
            batch=None,
            made=None,
            cost_cents=None,
            fault=False,
            repaired=False,
            checks=0,
        ),
    )
    item.update(
        status={"scrap": "scrapped", "repair": "repair", "inspect": "inspection"}[
            order.decision
        ],
        reason=None,
        queued=state["date"],
    )
    log(
        state,
        entry["id"],
        drawing["id"],
        order.decision,
        lead,
        batch=item["batch"],
        instance=iid,
    )


def command(state, world, action, payload):
    if state["setup"]["role"] != "manager":
        raise RuleError("Производством распоряжается действующий менеджер.", 403)
    org = state["setup"]["org"]
    order = ORDERS[action].model_validate(payload)
    if isinstance(order, Order):
        return commission(state, world, org, f"batch-{state['revision']}", order)
    if isinstance(order, Disposition):
        return disposition(state, world, org, order)
    batch = state["production"]["batches"].get(order.batch)
    if not batch or batch["org"] != org:
        raise RuleError("Партия недоступна.", 403)
    if batch["finished"]:
        raise RuleError("Заказ уже закрыт.")
    if isinstance(order, Change):
        batch["priority"] = order.priority
    else:
        batch.update(finished=state["date"], status="cancelled", reason=None)
        log(
            state,
            batch["entry"],
            batch["specification"],
            "cancelled",
            state["player_id"],
            batch=batch["id"],
        )


def write_fact(db, cid, state, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch

    e = world["entries"][event["entry"]]
    drawing = drawing_for(state, event["version"])
    batch = state["production"]["batches"].get(event["batch"])
    if batch and batch["org"] != e["org"]:
        e = engineering_entry(state, world, e["id"], batch["org"], drawing["slot"])
    facts.record(
        db,
        cid,
        Batch(
            facts=[
                dict(
                    version=1,
                    day=event["date"],
                    access="technical",
                    data=dict(
                        kind="engineering-report",
                        source_id=event["id"],
                        code=event["code"],
                        reference=event["instance"] or event["batch"],
                        context=dict(
                            org=e["org"],
                            org_name=world["organizations"][e["org"]]["name"],
                            person=event["person"],
                            program=e["program"],
                            component=dict(
                                manufacturer=drawing["manufacturer"],
                                product=drawing["slot"],
                                component=drawing["slot"],
                                specification=drawing["family"],
                                version=drawing["id"],
                                instance=event["instance"],
                            ),
                        ),
                    ),
                )
            ]
        ),
    )
