"""Engineering mandates, signed minutes and execution through the existing career commands."""

from datetime import date, timedelta
from typing import Literal

from pydantic import Field

from .. import components, development, production, research
from ..domain import RuleError, occupant_on
from ..finance import budget, facilities
from ..staff_input import Fields, Id
from .agenda import topics, study
from .observations import Observation, receive


class Mandate(Fields):
    mode: Literal["manual", "partial", "full"]
    limit_cents: int = Field(ge=0, le=10**12)
    focus: Literal["balanced", "knowledge", "readiness"]
    allow_rent: bool


class Decision(Fields):
    proposal: Id
    decision: Literal["approve", "reject", "defer", "investigate", "delegate"]
    alternative: int = Field(default=0, ge=0, le=9)
    reason: str = Field(default="", max_length=400)


class Intervention(Fields):
    proposal: Id
    change: Literal["priority", "cancel"]
    reason: str = Field(min_length=1, max_length=400)


ORDERS = {
    "council-mandate": Mandate,
    "council-decide": Decision,
    "council-intervene": Intervention,
    "council-observation": Observation,
}


def initialize(state):
    state.setdefault(
        "council",
        dict(
            since=state["revision"],
            opened=state["date"],
            mandates={},
            briefs={},
            history=[],
            prepared={},
            observations={},
        ),
    )


def mandate(state, org):
    player = state["setup"]["org"] == org and state["setup"]["role"] == "manager"
    return state["council"]["mandates"].get(
        org,
        dict(
            mode="manual" if player else "full",
            limit_cents=state["accounts"][org]["development_budget_cents"],
            focus="balanced",
            allow_rent=not player,
        ),
    )


def may_rent(state, org):
    if "council" not in state:
        return state["setup"]["org"] != org or state["setup"]["role"] != "manager"
    policy = mandate(state, org)
    return policy["allow_rent"] and policy["mode"] != "manual"


def access(state, manage=False):
    org, role = state["setup"]["org"], state["setup"]["role"]
    if (manage and role != "manager") or occupant_on(
        state["seats"].get(org + ":" + role, []), state["date"]
    ) != state["player_id"]:
        raise RuleError(
            "Требуется действующее назначение с соответствующими полномочиями.", 403
        )
    return org


def refresh(state, world, org):
    briefs = state["council"]["briefs"]
    live = {}
    for row in topics(state, world, org):
        if not row:
            continue
        key = row["id"]
        stored = briefs.get(key)
        if not stored or stored["status"] in ("open", "deferred", "superseded"):
            row.update(
                status="deferred"
                if stored and stored["status"] == "deferred"
                else "open",
                date=stored["date"] if stored else state["date"],
                blocked=stored.get("blocked") if stored else None,
            )
            briefs[key] = row
            live[key] = row
    for row in briefs.values():
        if (
            row["org"] == org
            and row["status"] in ("open", "deferred")
            and row["id"] not in live
        ):
            row["status"] = "superseded"
    return live


def record(state, row, actor, code, reason, choice=None, work=None):
    events = state["council"]["history"]
    event = dict(
        id=f"council-{len(events) + 1}",
        org=row["org"],
        date=state["date"],
        person=actor,
        proposal=row["id"],
        code=code,
        reason=reason,
        choice=choice,
        work=work,
        positions=row["positions"],
        observation=row["observation"],
    )
    events.append(event)
    return event


def remit(state, person):
    from ..personnel import active, bookings

    return all(
        r.get("remit") != "supervised"
        for _, r in bookings(state, person)
        if active(r, state["date"])
    )


def launch(state, world, row, choice, actor):
    org = row["org"]
    key = row["id"] + "-work"
    action = choice["action"]
    payload = choice["payload"]
    category = "production" if action in ("produce", "repair") else "engineering"
    if action == "lease":
        category = "infrastructure"
    if choice["cost_cents"]:
        budget.authorize(
            state, world, org, category, choice["cost_cents"], state["date"]
        )
    if action == "test" and world["entries"][row["entry"]]["championship"] == "f1":
        budget.check_allowance(
            budget.scope_for(state, world, org), development.TESTS[payload["method"]][3]
        )
    if action in ("research", "design", "test", "produce"):
        module, model = {
            "research": (research, research.Commission),
            "design": (development, development.Design),
            "test": (development, development.TestOrder),
            "produce": (production, production.Order),
        }[action]
        book = (
            state["research"]["projects"]
            if action == "research"
            else state["production"]["batches"]
            if action == "produce"
            else state["development"]["projects"]
        )
        for p in book.values():
            if (
                p["org"] == org
                and not p["finished"]
                and all(
                    p.get("order", p.get("request", {})).get(k) == v
                    for k, v in payload.items()
                    if k != "priority"
                )
            ):
                return p["id"]
        module.commission(state, world, org, key, model.model_validate(payload))
        return key
    if action == "priority":
        pool = (
            state["research"]["projects"]
            if payload["project"] in state["research"]["projects"]
            else state["development"]["projects"]
        )
        project = pool[payload["project"]]
        if project["org"] != org or project["finished"]:
            raise RuleError("Проект недоступен.")
        project["priority"] = payload["priority"]
        return project["id"]
    if action == "review":
        development.review(
            state,
            world,
            state["development"]["projects"][payload["project"]],
            payload["disposition"],
            actor,
        )
        return payload["project"]
    if action == "install":
        components.install(
            state, world, components.Install.model_validate(payload), org
        )
        return state["components"]["history"][-1]["id"]
    if action == "repair":
        production.disposition(
            state, world, org, production.Disposition.model_validate(payload)
        )
        return payload["instance"]
    if action == "lease":
        facilities.act(state, world, org, key, facilities.Lease.model_validate(payload))
        return key
    return None


def decide(state, world, row, decision, actor, index=0, reason=""):
    if row["status"] not in ("open", "deferred"):
        raise RuleError("Предложение закрыто или его основания изменились.", 409)
    if decision in ("reject", "defer"):
        row["status"] = "rejected" if decision == "reject" else "deferred"
        record(state, row, actor, decision, reason or "Решение менеджера.")
        return
    if decision == "delegate":
        actor = row["chief"] or row["lead"]
        index = row["recommended"]
        if not remit(state, actor):
            raise RuleError("Договор требует согласования менеджера.", 409)
    if decision == "investigate":
        choice = study(world["entries"][row["entry"]], row["axis"])
    elif index < len(row["options"]):
        choice = row["options"][index]
    else:
        raise RuleError("Вариант отсутствует в повестке.")
    if (
        decision == "delegate"
        and choice["cost_cents"] > mandate(state, row["org"])["limit_cents"]
    ):
        raise RuleError("Превышен лимит поручения.", 409)
    work = launch(state, world, row, choice, actor)
    row.update(status="decided", work=work, chosen=choice, blocked=None)
    record(state, row, actor, decision, reason or choice["risk"], choice, work)


def command(state, world, action, payload):
    order = ORDERS[action].model_validate(payload)
    if isinstance(order, Observation):
        receive(state, world, order)
        return
    org = access(state, True)
    if isinstance(order, Intervention):
        row = state["council"]["briefs"].get(order.proposal)
        if (
            not row
            or row["org"] != org
            or row["status"] != "decided"
            or not row.get("work")
        ):
            raise RuleError("Нет действующего поручения.", 409)
        kind = row["chosen"]["action"]
        key = row["work"]
        if order.change == "cancel" and kind == "produce":
            production.command(state, world, "production-cancel", dict(batch=key))
        elif order.change == "priority" and kind in (
            "research",
            "design",
            "test",
            "produce",
        ):
            if kind == "produce":
                production.command(
                    state, world, "production-priority", dict(batch=key, priority="low")
                )
            else:
                module = research if kind == "research" else development
                action = (
                    "research-priority"
                    if kind == "research"
                    else "development-priority"
                )
                module.command(state, world, action, dict(project=key, priority="low"))
        else:
            raise RuleError("Это вмешательство недоступно для поручения.")
        record(state, row, state["player_id"], order.change, order.reason, work=key)
        return
    if isinstance(order, Mandate):
        state["council"]["mandates"][org] = order.model_dump()
        return
    live = refresh(state, world, org)
    row = live.get(order.proposal)
    if not row:
        raise RuleError("Предложение недоступно или уже рассмотрено.", 409)
    decide(
        state,
        world,
        row,
        order.decision,
        state["player_id"],
        order.alternative,
        order.reason,
    )


def execution(state, row):
    choice = row.get("chosen")
    if not choice:
        return None
    key = row["work"]
    action = choice["action"]
    if action in ("research", "design", "test", "produce"):
        book = (
            state["research"]["projects"]
            if action == "research"
            else state["production"]["batches"]
            if action == "produce"
            else state["development"]["projects"]
        )
        p = book[key]
        report = state["research"]["reports"].get("report-" + key, {})
        result = (
            row.get("outcome", {}).get("summary")
            or report.get("conclusion")
            or p.get("specification")
            or p.get("report", {}).get("interpretation")
        )
        if action == "produce" and p["finished"]:
            result = f"Изготовлено экземпляров: {sum(i['batch'] == key for i in state['production']['items'].values())}."
        return dict(
            status=p["status"],
            worked=p["worked"],
            required=p["required"],
            reason=p["reason"],
            result=result,
            finished=p["finished"],
        )
    if action == "repair":
        item = state["production"]["items"][key]
        return dict(
            status=item["status"],
            reason=item.get("reason"),
            result="Экземпляр допущен." if item["status"] == "stock" else None,
        )
    return dict(status="complete", result=choice["result"])


def projection(state, world):
    org = access(state)
    refresh(state, world, org)
    rows = [
        dict(
            r,
            execution=execution(state, r),
            investigation=study(world["entries"][r["entry"]], r["axis"]),
        )
        for r in state["council"]["briefs"].values()
        if r["org"] == org
    ]
    history = [h for h in state["council"]["history"] if h["org"] == org]
    people = {pos["person"] for r in [*rows, *history] for pos in r["positions"]}
    people.update(h["person"] for h in history)
    return dict(
        mandate=mandate(state, org),
        proposals=sorted(rows, key=lambda r: (-r["importance"], r["id"])),
        history=history[::-1],
        people={
            pid: dict(
                name=state["people"][pid]["name"],
                role=world["positions"][state["people"][pid]["position"]]["name"],
            )
            for pid in people
        },
    )


def deliberate(state, world, org):
    policy = mandate(state, org)
    live = refresh(state, world, org)
    if policy["mode"] == "manual":
        return

    def rank(r):
        action = r["options"][r["recommended"]]["action"]
        favored = action in (
            ("research", "test")
            if policy["focus"] == "knowledge"
            else ("repair", "install", "produce")
            if policy["focus"] == "readiness"
            else ()
        )
        return (-r["importance"] - 2 * favored, r["id"])

    for row in sorted(live.values(), key=rank):
        if row["status"] != "open":
            continue
        index = row["recommended"]
        choice = row["options"][index]
        partial = policy["mode"] == "partial"
        actor = row["lead"] if partial else row["chief"]
        if (
            not actor
            or choice["cost_cents"] > policy["limit_cents"]
            or choice["action"] == "lease"
            and not policy["allow_rent"]
            or not remit(state, actor)
        ):
            continue
        if partial and choice["action"] not in (
            "research",
            "test",
            "produce",
            "repair",
            "install",
        ):
            continue
        site = choice["site"]
        if site and choice["action"] != "lease":
            today = state["date"]
            tomorrow = facilities.later(today, 1)
            shared = state["estate"]["assets"]["shared:" + site]
            if not research.facility(state, org, today, tomorrow, site) and not (
                policy["allow_rent"]
                and facilities.free(state, shared, today, tomorrow) > 0
            ):
                row["blocked"] = (
                    "Для делегированного решения нужен доступный слот: "
                    + choice["resource"]
                    + "."
                )
                continue
        try:
            decide(
                state,
                world,
                row,
                "approve",
                actor,
                index,
                "В пределах технического мандата.",
            )
        except RuleError as error:
            row["blocked"] = str(error)
            continue
        break  # Reassess competing requests against the resulting resource commitments.


def day(state, world):
    book = state["council"]
    day = state["date"]
    yesterday = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
    # A real preparation deadline opens a programme's initial review. Afterwards only
    # new technical facts and unresolved decisions call the staff back.
    horizon = facilities.later(day, 18)
    upcoming = {
        e["series"]
        for e in world["events"]
        if not e.get("org") and day <= e["start"] <= horizon
    }
    orgs = {
        e["org"]
        for e in world["entries"].values()
        if e["championship"] in upcoming and e["program"] not in book["prepared"]
    }
    for e in world["entries"].values():
        if e["championship"] in upcoming:
            book["prepared"][e["program"]] = True
    orgs.update(
        p["org"]
        for pool in (state["development"]["projects"], state["research"]["projects"])
        for p in pool.values()
        if p["finished"] in (yesterday, day)
    )
    orgs.update(
        world["entries"][h["entry"]]["org"]
        for h in state["production"]["history"]
        if h["date"] in (yesterday, day)
        and h["code"] in ("accepted", "rejected", "batch-defect", "cancelled")
    )
    orgs.update(
        world["entries"][u["entry"]]["org"]
        for u in state["components"]["usage"].values()
        if u["date"] in (day, yesterday)
    )
    orgs.update(
        r["org"]
        for r in book["briefs"].values()
        if r["status"] == "open" and mandate(state, r["org"])["mode"] != "manual"
    )
    orgs.update(
        f["org"] for f in book["observations"].values() if f["day"] in (day, yesterday)
    )
    orgs.add(state["setup"]["org"])
    for org in sorted(orgs):
        if occupant_on(state["seats"].get(org + ":manager", []), day):
            deliberate(state, world, org)


def write_fact(db, cid, state, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch

    row = state["council"]["briefs"][event["proposal"]]
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
                        reference=row["id"],
                        code=event["code"],
                        context=dict(
                            org=row["org"],
                            org_name=world["organizations"][row["org"]]["name"],
                            program=row["program"],
                            person=event["person"],
                        ),
                    ),
                )
            ]
        ),
    )
