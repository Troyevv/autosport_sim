"""Management choices over the common engineering queues."""

from typing import Literal
from ..staff_input import Fields, Id, Day
from ..domain import RuleError
from .rules import dossier


def initialize(state):
    state.setdefault(
        "programme",
        dict(
            since=state["revision"],
            priorities={},
            manager_allocations={},
            packages={},
            concepts={},
            certificates={},
            decisions=[],
            inspections={},
        ),
    )


class Priority(Fields):
    allocation: Literal["balanced", "current", "next", "stop-current"]


class Concept(Fields):
    entry: Id
    year: int
    strategy: Literal["continue", "revise", "replace"]


class Deployment(Fields):
    entry: Id
    year: int
    package: Id
    decision: Literal["defer", "withdraw"]
    due: Day | None = None


class Homologation(Fields):
    entry: Id
    year: int
    specification: Id


ORDERS = {
    "programme-priority": Priority,
    "programme-concept": Concept,
    "programme-homologate": Homologation,
    "programme-deployment": Deployment,
}


def policy(state, org):
    return (
        state.get("programme", {})
        .get("priorities", {})
        .get(org + ":" + state["date"][:4], "balanced")
    )


def allocate(state, org, allocation, *, manager):
    key = org + ":" + state["date"][:4]
    state["programme"]["priorities"][key] = allocation
    if manager:
        state["programme"]["manager_allocations"][key] = True


def paused(state, org, year):
    return policy(state, org) == "stop-current" and year == int(state["date"][:4])


def work_year(state, p):
    return p.get("target_year") or int(
        (p.get("season") or p["commissioned"][:4]).split("-")[-1]
    )


def queue_key(state, p):
    from ..research.model import queue_position

    priority = policy(state, p["org"])
    current = work_year(state, p) == int(state["date"][:4])
    return (
        int(
            priority == "current"
            and not current
            or priority in ("next", "stop-current")
            and current
        ),
        *queue_position(p),
    )


def command(state, world, action, payload):
    from ..council import access
    from ..research import admitted
    from .rules import certify

    org = access(state, True)
    order = ORDERS[action].model_validate(payload)
    data = state["programme"]
    key = None
    if isinstance(order, Priority):
        if policy(state, org) == order.allocation:
            return
        allocate(state, org, order.allocation, manager=True)
    else:
        entry = world["entries"].get(order.entry)
        today = int(state["date"][:4])
        if (
            not entry
            or entry["org"] != org
            or not admitted(state, entry)
            or order.year not in (today, today + 1)
        ):
            raise RuleError("Программа вне полномочий или периода планирования.", 403)
        plan = dossier(state, world, entry, order.year)
        key = plan["id"]
        if isinstance(order, Deployment):
            from .packages import package

            pkg = data["packages"].get(order.package) or package(
                state, world, entry, plan
            )
            if (
                pkg["id"] != order.package
                or pkg["plan"] != key
                or pkg["concept"] != plan["concept"]
            ):
                raise RuleError("Пакет не принадлежит выбранной программе.", 403)
            if order.decision == "defer" and (
                not order.due or order.due <= max(pkg["due"], state["date"])
            ):
                raise RuleError("Укажите более позднюю дату внедрения.")
            if pkg.get("withdrawn"):
                raise RuleError("Внедрение пакета уже отменено.")
            if order.decision == "withdraw":
                pkg["withdrawn"] = True
            else:
                pkg.update(due=order.due, stage="Согласованный срок внедрения")
            data["packages"][pkg["id"]] = pkg
        elif isinstance(order, Concept):
            if plan["strategy"] == order.strategy:
                return
            if paused(state, org, order.year):
                raise RuleError("Развитие этого поколения остановлено.")
            # Preserve signed studies and drawings. A changed brief commissions new work on both interacting axes.
            concept = (
                plan["concept"]
                if order.strategy == "continue"
                else f"{key}/{order.strategy}/{state['revision']}"
            )
            from ..finance import cancel
            from .packages import work_for

            for kind, p in work_for(state, world, entry, plan):
                term_id = "project:" + p["id"]
                term = state["finance"]["instalments"].get(term_id, {})
                if (
                    kind == "test"
                    and p["concept"] == plan["concept"]
                    and not p["finished"]
                    and term.get("awaiting_capacity")
                ):
                    cancel(state, term_id)
                    p.update(
                        status="cancelled",
                        finished=state["date"],
                        reason="Сборка заменена. Резерв испытания освобождён.",
                    )
            data["concepts"][key] = dict(concept=concept, strategy=order.strategy)
            if order.strategy != "continue":
                from .. import research
                from .packages import package

                plan = dossier(state, world, entry, order.year)
                pkg = package(state, world, entry, plan)
                data["packages"][pkg["id"]] = pkg
                for axis in pkg["axes"]:
                    research.commission(
                        state,
                        world,
                        org,
                        f"concept-{state['revision']}-{axis}",
                        research.Commission(
                            entry=entry["id"], axis=axis, priority="normal"
                        ),
                        target_year=order.year,
                    )
        else:
            certify(
                state, world, entry, order.year, order.specification, state["player_id"]
            )
    data["decisions"].append(
        dict(
            id=f"programme-{state['revision']}",
            org=org,
            plan=key,
            date=state["date"],
            person=state["player_id"],
            action=action,
            terms=order.model_dump(),
        )
    )


def write_fact(db, cid, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch

    org = event["org"]
    entry = world["entries"].get(event["terms"].get("entry"))
    context = dict(
        org=org, org_name=world["organizations"][org]["name"], person=event["person"]
    )
    if entry:
        context["program"] = entry["program"]
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
                        reference=event["plan"] or org,
                        code=event["action"],
                        context=context,
                    ),
                )
            ]
        ),
    )
