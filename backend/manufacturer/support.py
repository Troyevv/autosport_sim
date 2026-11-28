"""Case files only contain evidence that a party may actually see."""

from typing import Literal
from .. import components, finance, production
from ..domain import RuleError
from ..finance import budget
from ..staff_input import Fields, Id
from ..supply import ObservationScope, visible_channels, support_on
from ..supplier_engineering import agreement, person
from .profile import TARGETS


class Request(Fields):
    entry: Id
    axis: Literal["engine", "transmission", "tyre"]
    kind: Literal["problem", "change", "next", "consult", "warranty", "data"]
    objective: Id
    message: Id
    instance: Id | None = None
    reference: Id | None = None


class Resolve(Fields):
    case: Id
    decision: Literal["study", "advise", "decline", "repair", "replace", "compensate"]
    reason: Id


def open_case(state, world, org, key, order):
    e = world["entries"].get(order.entry)
    if not e or e["org"] != org or order.objective not in TARGETS[order.axis]:
        raise RuleError("Нет полномочий на обращение по этому узлу.", 403)
    terms = agreement(state, world, e, order.axis)
    fitted = components.mounting(state, e["id"]).get(order.axis)
    iid = order.instance or fitted
    if iid != fitted and (
        iid not in production.inventory(state, org)
        or components.spec(state, iid)["slot"] != order.axis
        or not any(
            h["entry"] == e["id"] and iid in (h["instance"], h["removed"])
            for h in state["components"]["history"]
        )
    ):
        raise RuleError("Экземпляр не обслуживался в указанной заявке.", 403)
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
        **order.model_dump(exclude={"instance"}, exclude_none=True),
        id=key,
        client=org,
        supplier=terms["maker"],
        contract=terms["id"],
        date=state["date"],
        instance=iid,
        specification=components.spec(state, iid)["id"],
        status="open",
    )
    if order.kind == "data" or order.reference:
        if not order.reference or not any(
            f["reference"] == order.reference for f in evidence(state, world, row)
        ):
            raise RuleError(
                "Для передачи нужен доступный по договору протокол этой заявки.", 403
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
    if "engineering_service" in state:
        from ..personal_engineering import appointments

        a = next(
            (
                r
                for r in appointments(state, world, row["supplier"], org)
                if r["start"] <= state["date"] < r["end"]
            ),
            None,
        )
        row["advisor"] = a["advisor"] if a else None
    cases[key] = row
    return row


def assigned(state, row, day, world=None):
    if "engineering_service" in state:
        from ..personal_engineering import grant

        entry = world["entries"][row["entry"]]
        terms = agreement(state, world, entry, row["axis"], day)
        if (
            not terms
            or terms["id"] != row["contract"]
            or terms["maker"] != row["supplier"]
        ):
            return None
        return grant(state, world, entry, row["axis"], day, terms)

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
    advisor = assigned(state, row, state["date"], world)
    if (
        not terms
        or terms["id"] != row["contract"]
        or not terms["support"]
        or not advisor
    ):
        return []
    result = []
    for fact in state["council"]["observations"].values():
        if row.get("reference") and row["reference"] != fact["reference"]:
            continue
        if (fact["entry"], fact["instance"], fact["specification"]) != (
            e["id"],
            row["instance"],
            row["specification"],
        ):
            continue
        historical = assigned(state, row, fact["day"], world)
        grant = (
            support_on({"support": [historical]}, advisor["advisor"], fact["day"])
            if historical
            else None
        )
        dated = agreement(state, world, e, row["axis"], fact["day"])
        if (
            not dated
            or dated["id"] != terms["id"]
            or ("engineering_service" in state and advisor["start"] > fact["day"])
            or not grant
            or grant.agreement != terms["id"]
        ):
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
                    k: fact.get(k)
                    for k in (
                        "reference",
                        "day",
                        "channel",
                        "value",
                        "unit",
                        "uncertainty",
                        "conditions",
                        "observation",
                        "indicator",
                        "track",
                        "layout",
                        "load_profile",
                    )
                }
            )
    return result


def diagnosis(state, world, row):
    if row.get("closed") and "engineering_service" in state:
        # The signed conclusion belongs to the organization. Raw measurements
        # are still read through the current worker's contract and channel grant.
        causes = row.get("grounds", {})
        return dict(
            causes=causes,
            reviewer=row.get("reviewer"),
            confidence=row.get("confidence", 0),
            covered=bool(causes.get("design") or causes.get("manufacturing")),
            reviewed_references=row.get("reviewed_references", []),
            observations=evidence(state, world, row),
        )
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
        and h.get("org") == row["supplier"]
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
        indicator = {
            "mount-out-of-tolerance": "integration",
            "coolant-flow-low": "cooling",
            "load-limit-exceeded": "overload",
            "service-procedure-deviation": "staff",
            "outside-operating-window": "operation",
        }.get(fact.get("indicator"))
        if indicator:
            causes[indicator].append(fact["reference"])
        elif (
            fact["channel"] == "temperature"
            and fact["value"] is not None
            and fact["unit"] in ("°C", "degC")
        ):
            # Conservative nominal thresholds from the drawing. A single high reading cannot isolate the installation.
            from .profile import parameters
            from ..development.physics import estimate

            nominal = parameters(row["axis"], estimate(state, d), d["life_m"])
            if fact["value"] - (fact["uncertainty"] or 0) > nominal.get(
                "window_high_c", 105
            ):
                for code in ("cooling", "integration"):
                    causes[code].append(fact["reference"])
        elif fact["channel"] == "wear" and fact["unit"] in ("%", "ppm"):
            limit = 80 if fact["unit"] == "%" else 800000
            if fact["value"] - (fact["uncertainty"] or 0) >= limit:
                causes["wear"].append(fact["reference"])
    advisor = assigned(state, row, state["date"], world)
    analyst = person(state, row["supplier"], "chief-analyst")
    reviewer = advisor["advisor"] if advisor else analyst
    confidence = 0
    if reviewer and any(causes.values()):
        from ..personnel import evaluate
        from ..teamwork import professional_action

        p = state["people"][reviewer]
        values = evaluate(p, world, state["date"])["values"]
        skill = values.get("Диагностика", values.get("Дефекты", 0))
        colleague = (
            person(state, row["client"], "chief-engineer") if advisor else analyst
        )
        review = (
            professional_action(
                state,
                world,
                (
                    "technical",
                    reviewer,
                    colleague,
                    row["client"] if advisor else row["supplier"],
                ),
                state["date"],
                evidence=skill,
            )["review_quality"]
            if colleague
            else skill
        )
        allocation = advisor["allocation_percent"] if advisor else 100
        comparable = sum(1 for f in observations if f.get("indicator"))
        confidence = min(
            90,
            (skill + review + 100 - p["fatigue"]) // 3 * allocation // 100
            + min(comparable, 3) * 2,
        )
        if not (qc or findings or comparable):
            confidence = min(confidence, 45)
    return dict(
        causes=causes,
        observations=observations,
        reviewer=reviewer,
        confidence=confidence,
        covered=bool(findings or qc),
    )


def proposal(state, world, row, report):
    from ..council import agenda
    from ..supplier_engineering import ROLES, engineering_entry, staff

    entry = engineering_entry(state, world, row["entry"], row["supplier"], row["axis"])
    engineers = staff(state, entry)
    lead = engineers.get(ROLES[row["axis"]][0])
    advisor = assigned(state, row, state["date"], world)
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
    if report["observations"] and report["reviewer"]:
        from ..research import record_work

        record_work(
            state,
            world,
            report["reviewer"],
            org,
            row["id"],
            "client-data",
            "Диагностика",
            "completed",
        )
        if (
            "engineering_service" in state
            and state["people"][report["reviewer"]]["position"] == "technical-advisor"
        ):
            from ..teamwork import record_event

            chief = person(state, row["client"], "chief-engineer")
            if chief:
                record_event(
                    state,
                    world,
                    report["reviewer"],
                    chief,
                    "verified-analysis"
                    if any(report["causes"].values())
                    else "incomplete-analysis",
                    row["id"],
                    state["date"],
                )
    if "engineering_service" in state:
        row["reviewed_references"] = [o["reference"] for o in report["observations"]]
    row["proposal"] = brief["id"]
    row.update(
        status=choice,
        reason=order.reason,
        closed=state["date"],
        reviewer=report["reviewer"],
        confidence=report["confidence"],
        grounds={k: v for k, v in report["causes"].items() if v},
    )
