"""Engineering commissions, transfers of custody and client decisions."""

from typing import Literal
from pydantic import Field
from .. import components, development, production, programme, research
from ..components.catalog import OPENING
from ..components.registry import drawing_for
from ..domain import RuleError
from ..staff_input import Fields, Id
from ..supplier_engineering import ROLES, agreement, engineering_entry, equal_supply
from .profile import TARGETS
from .support import Request, Resolve, open_case, resolve


class Work(Fields):
    entry: Id
    axis: Literal["engine", "transmission", "tyre"]
    year: int
    action: Literal["research", "design", "bench", "lab", "produce"]
    objective: Id = "output"
    specification: Id | None = None
    quantity: int = Field(default=1, ge=1, le=24)


class Rollout(Fields):
    entry: Id
    specification: Id


class Delivery(Fields):
    entry: Id
    instance: Id


ORDERS = {
    "maker-work": Work,
    "maker-request": Request,
    "maker-resolve": Resolve,
    "maker-deliver": Delivery,
    "maker-item": production.Disposition,
    "maker-rollout": Rollout,
    "maker-review": development.Decision,
    "maker-priority": programme.Priority,
}


def initialize(state):
    if "manufacturer" in state:
        return
    state.setdefault(
        "manufacturer",
        dict(
            since=state["revision"],
            cases={},
            deliveries={},
            reviews={},
            events=[],
            standards={},
        ),
    )

    from ..catalog import LINEUP_WORLD as world
    from ..finance.market import Homologation, homologate

    # Verified opening pairs for the factory/client scenarios. #60 owns full coverage.
    factories = {
        "team-scuderia-ferrari": "supplier-ferrari",
        "team-mercedes-amg-petronas-f1-team": "supplier-mercedes",
    }
    for entry in world["entries"].values():
        provider = factories.get(entry["org"])
        reference = f"works-2025-{entry['id']}-engine"
        if reference in state["market"].get("homologations", {}):
            continue
        if provider and entry["championship"] == "f1" and state["date"] < "2026-01-01":
            homologate(
                state,
                world,
                Homologation(
                    reference=reference,
                    provider=provider,
                    entry=entry["id"],
                    product="engine",
                    works=True,
                    regulation=world["championships"]["f1"]["rules_id"],
                    start=state["date"],
                    end="2026-01-01",
                ),
            )


def commission(state, world, org, key, order):
    e = engineering_entry(state, world, order.entry, org, order.axis)
    year = int(state["date"][:4])
    if (
        not e
        or "supplier_axis" not in e
        or order.year not in (year, year + 1)
        or order.objective not in TARGETS[order.axis]
    ):
        raise RuleError("Выберите продукт и доступный сезон программы.")
    axis = order.axis
    initial = e["supplier_baseline"]
    d = drawing_for(state, order.specification or initial)
    if d["manufacturer"] != org or d["family"] != OPENING.specs[initial]["family"]:
        raise RuleError("Редакция принадлежит другой программе.", 403)
    if order.action == "research":
        project = research.commission(
            state,
            world,
            org,
            key,
            research.Commission(entry=e["id"], axis=axis, priority="normal"),
            target_year=order.year,
        )
        if "objective" in project and (
            project["objective"] != order.objective or project["baseline"] != d["id"]
        ):
            raise RuleError("Номер исследования уже относится к другой гипотезе.", 409)
        from .profile import QUESTIONS

        project.update(
            objective=order.objective,
            hypothesis=QUESTIONS[order.objective],
            baseline=d["id"],
            source=dict(project["source"], reference=d["id"]),
            refinements=d["refinements"],
        )
        return project
    if order.action == "produce":
        return production.commission(
            state,
            world,
            org,
            key,
            production.Order(
                entry=e["id"],
                specification=d["id"],
                quantity=order.quantity,
                priority="normal",
                rush=False,
                outsource=False,
            ),
            target_year=order.year,
        )
    if order.action == "design":
        args = development.Design(
            entry=e["id"],
            baseline=d["id"],
            priority="normal",
            brief="reliability"
            if order.objective == "durability"
            and state["development"]["projects"]
            .get(d.get("reference"), {})
            .get("findings")
            else "performance",
        )
    else:
        args = development.TestOrder(
            entry=e["id"],
            baseline=d.get("parent", initial),
            candidate=d["id"],
            priority="normal",
            method=order.action,
        )
    return development.commission(
        state, world, org, key, args, target_year=order.year, objective=order.objective
    )


def delivery_block(state, world, org, e, iid, *, rollout=False):
    item = state["components"]["inventory"].get(iid)
    if not item or item["org"] != org or not e:
        return "Экземпляр отсутствует на складе производителя."
    drawing = drawing_for(state, item["spec"])
    axis = drawing["slot"]
    if drawing["manufacturer"] != org:
        return "Спецификация принадлежит другому производителю."
    terms = agreement(state, world, e, axis)
    if not terms or terms["maker"] != org or not research.admitted(state, e):
        return "Отсутствует действующий договор или спортивный допуск."
    batch = state["production"]["batches"].get(
        state["production"]["items"].get(iid, {}).get("batch"), {}
    )
    if batch.get("contract") and batch["contract"] != terms["id"]:
        return "Экземпляр изготовлен по другому договору."
    if state["production"]["items"].get(iid, {}).get(
        "status"
    ) != "stock" or not components.serviceable(state, iid):
        return "Экземпляр не прошёл контроль качества."
    if not components.compatible(
        state, world, e, drawing, rollout=rollout
    ) or not components.installable_revision(state, iid):
        return "Спецификация не допущена для этой машины."
    from .rollout import standard

    if (
        not rollout
        and equal_supply(world, e, axis)
        and drawing["id"] != standard(state, e, org, axis)
    ):
        return "Обязательна единая омологированная спецификация для всех клиентов."
    return None


def eligible_stock(state, world, org, e, axis):
    return sorted(
        i
        for i in production.inventory(state, org)
        if components.spec(state, i)["slot"] == axis
        and not delivery_block(state, world, org, e, i)
    )


def deliver(state, world, org, e, iid, *, warranty=False):
    if reason := delivery_block(state, world, org, e, iid):
        raise RuleError(reason)
    terms = agreement(state, world, e, components.spec(state, iid)["slot"])
    if production.storage_space(state, world, e["org"])["free"] < 1:
        raise RuleError("На складе клиента нет места.", 409)
    from . import history

    d = components.spec(state, iid)
    history.record(
        state,
        "warranty-delivery" if warranty else "delivery",
        e["id"],
        d["slot"],
        iid,
        d["id"],
        e["org"],
        org,
        terms["id"],
        iid,
    )
    state["components"]["inventory"][iid]["org"] = e["org"]
    state["production"]["items"][iid]["entry"] = e["id"]
    state["manufacturer"]["deliveries"][iid] = dict(
        instance=iid,
        entry=e["id"],
        client=e["org"],
        supplier=org,
        contract=terms["id"],
        date=state["date"],
        warranty=warranty,
    )


def command(state, world, action, payload):
    from ..council import access

    org = access(state)
    role = state["setup"]["role"]
    order = ORDERS[action].model_validate(payload)
    key = f"maker-{state['revision']}"
    if isinstance(order, Request) and role == "manager":
        return open_case(state, world, org, key, order)
    if role != "manufacturer":
        raise RuleError("Требуется назначение руководителя производителя.", 403)
    if isinstance(order, Work):
        return commission(state, world, org, key, order)
    if isinstance(order, production.Disposition):
        return production.disposition(state, world, org, order)
    if isinstance(order, Rollout):
        from .rollout import publish

        return publish(
            state, world, org, world["entries"].get(order.entry), order.specification
        )
    if isinstance(order, Delivery):
        return deliver(
            state, world, org, world["entries"].get(order.entry), order.instance
        )
    if isinstance(order, Resolve):
        return resolve(state, world, org, order)
    if isinstance(order, programme.Priority):
        return programme.allocate(state, org, order.allocation, manager=True)
    if isinstance(order, development.Decision):
        p = state["development"]["projects"].get(order.project)
        if p and p["org"] == org:
            return development.review(
                state, world, p, order.disposition, state["player_id"]
            )
    raise RuleError("Нет полномочий на решение.", 403)


def day(state, world):
    from .planning import plan

    plan(state, world)


def lines(world, org, state=None):
    from ..supplier_engineering import supplier_baseline

    for e in world["entries"].values():
        for axis, maker in world["cars"][e["car"]]["suppliers"].items():
            if axis not in ROLES or axis not in OPENING.installed[e["id"]]:
                continue
            if maker == org:
                yield e, axis
            elif state and supplier_baseline(e["id"], org, axis):
                terms = agreement(state, world, e, axis)
                if terms and terms["maker"] == org:
                    yield e, axis
