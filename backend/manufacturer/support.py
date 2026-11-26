"""Case files only contain evidence that a party may actually see."""

from typing import Literal
from .. import components, finance, production
from ..domain import RuleError
from ..finance import budget
from ..staff_input import Fields, Id
from ..supply import ObservationScope, visible_channels, support_on
from .context import agreement, person
from .profile import TARGETS


class Request(Fields):
    entry: Id
    axis: Literal["engine", "transmission", "tyre"]
    kind: Literal["problem", "change", "next", "consult", "warranty"]
    objective: Id
    message: Id


class Resolve(Fields):
    case: Id
    decision: Literal["study", "advise", "decline", "repair", "replace", "compensate"]
    reason: Id


def open_case(state, world, org, key, order):
    e = world["entries"].get(order.entry)
    if not e or e["org"] != org or order.objective not in TARGETS[order.axis]:
        raise RuleError("Нет полномочий на обращение по этому узлу.", 403)
    terms = agreement(state, world, e, order.axis)
    iid = components.mounting(state, e["id"]).get(order.axis)
    if (
        not terms
        or not iid
        or components.spec(state, iid)["manufacturer"] != terms["maker"]
    ):
        raise RuleError("Договор и установленный экземпляр не совпадают.")
    cases = state["manufacturer"]["cases"]
    if any(
        r["instance"] == iid
        and r["kind"] == order.kind
        and (r["objective"] == order.objective or order.kind == "warranty")
        and (
            r["status"] == "open"
            or order.kind == "warranty"
            and r["status"] in ("repair", "replace", "compensate")
        )
        for r in cases.values()
    ):
        raise RuleError("Такое обращение по экземпляру уже зарегистрировано.", 409)
    row = dict(
        **order.model_dump(),
        id=key,
        client=org,
        supplier=terms["maker"],
        contract=terms["id"],
        date=state["date"],
        instance=iid,
        specification=components.spec(state, iid)["id"],
        status="open",
    )
    from . import history

    history.record(
        state,
        "claim-opened" if order.kind == "warranty" else "client-request",
        e["id"],
        order.axis,
        iid,
        row["specification"],
        org,
        terms["maker"],
        terms["id"],
        key,
    )
    cases[key] = row
    return row


def assigned(state, row, day):
    return next(
        (
            r
            for r in state["support"]
            if r["agreement"] == row["contract"]
            and r["employer"] == row["supplier"]
            and r.get("entry", row["entry"]) == row["entry"]
            and r["client"] == row["client"]
            and r["product"] == row["axis"]
            and r["start"] <= day < r["end"]
        ),
        None,
    )


def evidence(state, world, row):
    e = world["entries"][row["entry"]]
    terms = agreement(state, world, e, row["axis"])
    advisor = assigned(state, row, state["date"])
    if (
        not terms
        or terms["id"] != row["contract"]
        or not terms["support"]
        or not advisor
    ):
        return []
    result = []
    for fact in state["council"]["observations"].values():
        if (fact["entry"], fact["instance"], fact["specification"]) != (
            e["id"],
            row["instance"],
            row["specification"],
        ):
            continue
        grant = support_on(state, advisor["advisor"], fact["day"])
        if not grant or grant.agreement != terms["id"]:
            continue
        channel = "feedback" if fact["kind"] == "driver-feedback" else fact["channel"]
        scope = ObservationScope(
            e["org"],
            e["car"],
            fact["session"],
            fact["session_kind"],
            row["supplier"],
            row["axis"],
            row["specification"],
            row["instance"],
        )
        if visible_channels(grant, scope, fact["day"], row["supplier"], [channel]):
            result.append(
                {
                    k: fact[k]
                    for k in (
                        "reference",
                        "day",
                        "channel",
                        "value",
                        "unit",
                        "uncertainty",
                        "conditions",
                        "observation",
                    )
                }
            )
    return result


def diagnosis(state, world, row):
    # Only metrology findings and recorded QC decisions can substantiate a maker defect.
    d = components.registry.drawing_for(state, row["specification"])
    parent = state["development"]["projects"].get(d.get("reference"), {})
    findings = (
        list(parent.get("findings", [])) if parent.get("org") == row["supplier"] else []
    )
    batch = state["production"]["items"].get(row["instance"], {}).get("batch")
    qc = [
        h["id"]
        for h in state["production"]["history"]
        if h["instance"] == row["instance"]
        and h["code"] in ("rejected", "batch-defect", "quarantine")
        and batch
        and state["production"]["batches"][batch]["org"] == row["supplier"]
    ]
    observations = evidence(state, world, row)
    causes = {
        "design": findings,
        "manufacturing": qc,
        "wear": [],
        "integration": [],
        "cooling": [],
        "operation": [],
        "overload": [],
        "staff": [],
    }
    for fact in observations:
        for code in {
            "temperature": ("cooling", "integration"),
            "wear": ("wear", "overload"),
            "mode": ("operation", "staff"),
        }.get(fact["channel"], ()):
            causes[code].append(fact["reference"])
    advisor = assigned(state, row, state["date"])
    analyst = person(state, row["supplier"], "chief-analyst")
    reviewer = advisor["advisor"] if advisor else analyst
    confidence = 0
    if reviewer and any(causes.values()):
        from ..personnel import evaluate
        from ..teamwork import professional_action

        p = state["people"][reviewer]
        values = evaluate(p, world, state["date"])["values"]
        skill = values.get("Диагностика", values.get("Дефекты", 0))
        review = (
            professional_action(
                state,
                world,
                ("technical", reviewer, analyst, row["supplier"]),
                state["date"],
                evidence=skill,
            )["review_quality"]
            if analyst
            else skill
        )
        confidence = min(90, (skill + review + 100 - p["fatigue"]) // 3)
    return dict(
        causes=causes,
        observations=observations,
        reviewer=reviewer,
        confidence=confidence,
        covered=bool(findings or qc),
    )


def proposal(state, world, row, report):
    from ..council import agenda
    from .context import ROLES, engineering_entry, staff

    entry = engineering_entry(state, world, row["entry"], row["supplier"], row["axis"])
    engineers = staff(state, entry)
    lead = engineers.get(ROLES[row["axis"]][0])
    advisor = assigned(state, row, state["date"])
    peer = advisor["advisor"] if advisor else engineers.get("chief-analyst")
    for role in ("performance", "reliability"):
        engineers[role] = peer
    conflicts = [
        r
        for r in state["manufacturer"]["cases"].values()
        if r["supplier"] == row["supplier"]
        and r["id"] != row["id"]
        and r["kind"] in ("next", "change")
        and r["axis"] == row["axis"]
        and r["objective"] != row["objective"]
        and r["status"] in ("open", "study")
    ]
    observation = row["message"]
    objection = (
        "Другие клиенты запросили иной компромисс. Сопоставить стендовые характеристики."
        if conflicts
        else "Для изменения конструкции требуется измеримая разница в испытании."
    )
    return agenda.build(
        state,
        world,
        entry,
        engineers,
        row["axis"],
        "client",
        [row["id"], row["specification"]],
        observation,
        "Проверить требование на образцах одной спецификации.",
        [agenda.study(entry, row["axis"]), agenda.keep()],
        initiator=lead,
        objection=objection,
        importance=5 if report["covered"] else 3,
    )


def resolve(state, world, org, order):
    from . import Work, commission, deliver, eligible_stock

    row = state["manufacturer"]["cases"].get(order.case)
    if not row or row["supplier"] != org or row["status"] != "open":
        raise RuleError("Обращение недоступно для решения.", 403)
    e = world["entries"][row["entry"]]
    terms = agreement(state, world, e, row["axis"])
    choice = order.decision
    report = diagnosis(state, world, row)
    if not person(state, org, "chief-engineer"):
        raise RuleError("Требуется руководитель инженерного штаба.")
    if choice != "decline" and (not terms or terms["id"] != row["contract"]):
        raise RuleError("Договор обслуживания больше не действует.")
    brief = proposal(state, world, row, report)
    if not brief:
        raise RuleError("Не назначен профильный руководитель.")
    if choice == "study":
        p = commission(
            state,
            world,
            org,
            row["id"] + "/study",
            Work(
                entry=e["id"],
                axis=row["axis"],
                action="research",
                year=int(state["date"][:4]) + int(row["kind"] == "next"),
                objective=row["objective"],
            ),
        )
        row["project"] = p["id"]
    if choice in ("repair", "replace", "compensate"):
        if row["kind"] != "warranty" or not report["covered"]:
            raise RuleError("Гарантийное основание ещё не подтверждено.")
        iid = row["instance"]
        drawing = components.spec(state, iid)
        cost = production.quote(drawing, False, False)["cents"]
        if choice == "replace":
            options = eligible_stock(state, world, org, e, row["axis"])
            if not options:
                raise RuleError("Нет допущенной замены на складе.")
            deliver(state, world, org, e, options[0], warranty=True)
        elif choice == "repair":
            if iid in production.mounted(state, world, row["client"]):
                raise RuleError("Клиент должен снять экземпляр для ремонта.")
            item = state["production"]["items"].get(iid)
            if not item or item["status"] in ("repair", "scrapped"):
                raise RuleError("Экземпляр недоступен для ремонта.")
            production.spend(state, world, org, row["id"] + "/repair", cost // 3)
            item.update(
                service_org=org, status="repair", queued=state["date"], reason=None
            )
        else:
            budget.authorize(state, world, org, "repairs", cost, state["date"])
            finance.transfer(
                state, org, row["client"], row["id"] + "/compensation", cost, "repairs"
            )
            row["compensation_cents"] = cost
    from ..council import record

    decision = (
        brief["options"][0]
        if choice == "study"
        else dict(brief["options"][1], result=order.reason)
    )
    brief.update(
        status="decided", work=row.get("project"), chosen=decision, blocked=None
    )
    state["council"]["briefs"][brief["id"]] = brief
    actor = state["player_id"] if state["setup"]["org"] == org else brief["chief"]
    record(state, brief, actor, choice, order.reason, decision, row.get("project"))
    from . import history

    history.record(
        state,
        choice,
        row["entry"],
        row["axis"],
        row["instance"],
        row["specification"],
        row["client"],
        org,
        row["contract"],
        row["id"],
    )
    row["proposal"] = brief["id"]
    row.update(
        status=choice,
        reason=order.reason,
        closed=state["date"],
        reviewer=report["reviewer"],
        confidence=report["confidence"],
        grounds={k: v for k, v in report["causes"].items() if v},
    )
