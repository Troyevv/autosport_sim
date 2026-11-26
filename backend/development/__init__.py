"""Design office orders and test sessions on the common career calendar."""

from datetime import date
from typing import Literal

from .. import components
from ..components.catalog import OPENING
from ..components.registry import drawing_for
from ..domain import RuleError, occupant_on
from ..finance import budget, facilities
from ..finance.market import contracted_supplier
from ..personnel import evaluate
from ..research import admitted, record_work
from ..research.model import METHODS, Priority, Reorder, evidence
from ..staff_input import Fields, Id
from ..manufacturer.context import ROLES, engineering_entry
from .physics import TESTS, finish_design, forecast, measure, methods


class Design(Fields):
    entry: Id
    baseline: Id
    priority: Priority
    brief: Literal["performance", "balanced", "reliability"]


class TestOrder(Fields):
    entry: Id
    baseline: Id
    candidate: Id
    priority: Priority
    method: Literal["calculation", "lab", "bench", "cfd", "tunnel"]


class Decision(Fields):
    project: Id
    disposition: Literal["released", "withdrawn"]


ORDERS = {
    "development-design": Design,
    "development-test": TestOrder,
    "development-priority": Reorder,
    "development-review": Decision,
}


def initialize(state):
    state.setdefault(
        "development",
        dict(since=state["revision"], opened=state["date"], projects={}, history=[]),
    )


def restriction(state, world, entry, axis, *, year=None, reliability=False):
    if "supplier_axis" in entry:
        from ..manufacturer.context import restriction as maker_restriction

        return maker_restriction(state, world, entry, axis, year, reliability)
    car = world["cars"][entry["car"]]
    from ..programme.rules import bulletin

    config = state["car_configurations"][entry["car"]]
    if "programme" in state:
        rule = bulletin(world, entry, year or int(state["date"][:4]))
        if rule["slot"] == axis and state["date"] >= rule["freeze"] and not reliability:
            return "Регламент заморозил разработку узла."
    rule = OPENING.rules.get(config["regulation"])
    if axis in state["components"]["locked_slots"].get(entry["id"], {}):
        return "Изменения узла заморожены."
    if axis in car["suppliers"] and car["suppliers"][axis] != entry["org"]:
        return "Чертёж принадлежит утверждённому поставщику."
    if contracted_supplier(state, entry, axis) not in (None, entry["org"]):
        return "На этот период действует договор поставки узла."
    if not rule or axis not in rule["team_slots"]:
        return "Регламент разрешает только утверждённые спецификации."
    return None


def versions(state, eid, axis):
    fitted = components.spec(state, components.mounting(state, eid)[axis])
    org = OPENING.stock[OPENING.installed[eid][axis]]["org"]
    held = {
        item["spec"]
        for item in state["components"]["inventory"].values()
        if item["org"] == org
    }
    return sorted(
        (
            d
            for pool in (OPENING.specs, state["components"]["revisions"])
            for d in pool.values()
            if d["family"] == fitted["family"]
            and (
                d["id"] in OPENING.specs
                or d["id"] == fitted["id"]
                or d["id"] in held
                or d["manufacturer"] == org
            )
        ),
        key=lambda d: d["version"],
    )


def charge(state, world, p, atr, *, reserve_only=False):
    budget.project(
        state,
        world,
        budget.ProjectCost(
            project=p["id"],
            program=p["program"],
            target_season=p["season"],
            generation=p["generation"],
            due=state["date"],
            amount_cents=p["cost_cents"],
            atr=atr,
        ),
        reserve_only=reserve_only,
    )


def test_inputs(state, org, specification):
    return [
        t["id"]
        for t in sorted(
            state["development"]["projects"].values(),
            key=lambda t: (t["finished"] or "", t["id"]),
        )
        if t["org"] == org and t.get("candidate") == specification and t.get("report")
    ]


def commission(state, world, org, key, order, *, target_year=None, objective=None):
    projects = state["development"]["projects"]
    if key in projects:
        prior = projects[key]
        if (
            prior["org"] != org
            or prior["order"] != order.model_dump()
            or (target_year is not None and prior.get("target_year") != target_year)
        ):
            raise RuleError("Номер поручения уже используется.", 409)
        return prior
    from ..programme import paused

    year = target_year or int(state["date"][:4])
    if paused(state, org, year):
        raise RuleError("Развитие текущего поколения остановлено менеджером.", 409)
    base = drawing_for(state, order.baseline)
    entry = engineering_entry(state, world, order.entry, org, base["slot"])
    if not entry or entry["org"] != org or not admitted(state, entry):
        raise RuleError("Нет допуска к этой программе.", 403)
    axis = base["slot"]
    if axis not in components.mounting(state, entry["id"]):
        raise RuleError("Узел отсутствует в этой заявке.")
    allowed = {d["id"] for d in versions(state, entry["id"], axis)}
    maker = "supplier_axis" in entry
    if maker:
        family = OPENING.stock[OPENING.installed[entry["id"]][axis]]["spec"].rsplit(
            "/", 1
        )[0]
        allowed = {
            d["id"]
            for pool in (OPENING.specs, state["components"]["revisions"])
            for d in pool.values()
            if d["family"] == family and d["manufacturer"] == org
        }
    from ..programme.rules import config_for

    config = config_for(state, world, entry, target_year)
    if base["id"] not in allowed or base["regulation"] not in (
        config["regulation"],
        world["cars"][entry["car"]]["regulation"],
    ):
        raise RuleError("Чертёж не принадлежит программе.", 403)
    design = isinstance(order, Design)
    if base.get("programme_concept") and base["programme_concept"] != config["concept"]:
        raise RuleError("Чертёж относится к другой концепции.")
    if not design and drawing_for(state, order.candidate).get("regulation") not in (
        base["regulation"],
        config["regulation"],
    ):
        raise RuleError("Испытуемый узел относится к другому поколению.")
    if design:
        if order.brief == "reliability":
            parent = state["development"]["projects"].get(base.get("reference"), {})
            if not parent.get("findings"):
                raise RuleError("Исправление требует выявленного дефекта.")
        reason = restriction(
            state,
            world,
            entry,
            axis,
            year=target_year,
            reliability=order.brief == "reliability",
        )
        if (
            not maker
            and config["concept"] != world["cars"][entry["car"]]["concept"]
            and not any(
                r["org"] == org
                and r["axis"] == axis
                and r["concept"] == config["concept"]
                and r["regulation"] == config["regulation"]
                for r in state["research"]["reports"].values()
            )
        ):
            raise RuleError(
                "Для новой компоновки сначала требуется заключение исследования.", 409
            )
        if reason or base["manufacturer"] != org:
            raise RuleError(reason or "Нет прав конструктора.", 403)
    elif order.method not in methods(axis) or order.candidate not in allowed:
        raise RuleError("Метод или сравниваемая редакция несовместимы с узлом.")
    role, skill, _, hours, price = METHODS[axis]
    if maker:
        role, skill = ROLES[axis] if design else ("analyst", "Испытания")
    lead = components.specialists(state, world, entry).get(role)
    if not lead:
        raise RuleError("Вакансия ответственного специалиста.", 409)
    inputs = evidence(state, org, axis, config["concept"], config["regulation"])
    p = dict(
        id=key,
        org=org,
        entry=order.entry,
        program=entry["program"],
        axis=axis,
        **config,
        kind="design" if design else "test",
        order=order.model_dump(),
        role=role,
        lead=lead,
        baseline=base["id"],
        priority=order.priority,
        evidence=inputs,
        commissioned=state["date"],
        commission_revision=state["revision"],
        started=None,
        finished=None,
        allocated_on=None,
        participants={},
        days=0,
        worked=0,
        quality_sum=0,
        comparable=True,
        status="queued",
        reason="Ожидает распределения мощности.",
        findings=[],
        required=hours + 24 if design else 1,
        cost_cents=price * 3 if design else TESTS[order.method][2],
        grants=[],
        assembly={
            slot: components.spec(state, iid)["id"]
            for slot, iid in components.mounting(state, entry["id"]).items()
        },
    )
    if maker:
        p["skill"] = skill
        p["objective"] = objective or "output"
        p["assembly"] = {
            s: OPENING.stock[i]["spec"]
            for s, i in OPENING.installed[entry["id"]].items()
        }
        if target_year is not None:
            p["target_year"] = target_year
    elif (
        target_year is not None
        or config["concept"] != world["cars"][entry["car"]]["concept"]
    ):
        p["target_year"] = target_year or year
        from ..programme.packages import assembly_for

        p["assembly"] = assembly_for(state, world, entry, p["target_year"])
    if design:
        ability = evaluate(state["people"][lead], world, state["date"])["values"][skill]
        p.update(
            brief=order.brief,
            site_kind="design",
            test_inputs=test_inputs(state, org, base["id"]),
        )
        p["forecast"] = forecast(state, base, p, ability)
        charge(state, world, p, {})
    else:
        p.update(
            method=order.method,
            candidate=order.candidate,
            site_kind=TESTS[order.method][1],
        )
        if p.get("target_year"):
            charge(state, world, p, {}, reserve_only=True)
    if target_year is not None and not maker:
        from ..programme.rules import pin_concept

        pin_concept(state, world, entry, target_year)
    projects[key] = p
    return p


def check_rental(state, world, p, entry):
    """An NPC buys a testing slot only if it can pay for and authorize the paired run."""
    from ..finance import available

    org, day = p["org"], state["date"]
    site = state["estate"]["assets"]["shared:" + p["site_kind"]]
    fee = facilities.quote(site["kind"], site["country"])["daily_cents"]
    reservation = "project:" + p["id"] if p.get("target_year") else None
    budget.authorize(
        state, world, org, "engineering", p["cost_cents"], day, ignore=reservation
    )
    if entry["championship"] == "f1":
        budget.check_allowance(
            budget.scope_for(state, world, org), TESTS[p["method"]][3]
        )
    total = fee + p["cost_cents"]
    if total > available(state, org, ignore=reservation):
        raise RuleError("Недостаточно средств на аренду и испытание.", 409)


def book_test(state, world, p, site, key):
    entry = world["entries"][p["entry"]]
    series = entry["championship"]
    atr = TESTS[p["method"]][3] if series == "f1" else {}
    # Only an allocated day spends the session fee and that period's ATR allowance.
    try:
        charge(state, world, p, atr)
    except RuleError as error:
        p["reason"] = str(error)
        return False
    facilities.access(
        state,
        world,
        facilities.Access(
            reference=key,
            org=p["org"],
            facility=site["id"],
            start=state["date"],
            days=1,
            units=1,
            program=p["program"],
            regulation=world["championships"][series]["rules_id"],
            purpose=facilities.PROCESS[site["kind"]],
            authorization=p["id"],
        ),
    )

    return True


def complete(state, world, p):
    quality = p["quality_sum"] // p["worked"]
    if p["kind"] == "design":
        finish_design(state, p, quality)
    else:
        p["report"] = measure(state, p, quality)
        if p["report"]["detected"]:
            source = state["development"]["projects"][
                drawing_for(state, p["candidate"])["reference"]
            ]
            if source["disposition"] == "released":
                review(state, world, source, "withdrawn", p["lead"])
    p.update(finished=state["date"], status="complete", reason=None)
    for pid, contribution in p["participants"].items():
        record_work(
            state,
            world,
            pid,
            p["org"],
            p["id"],
            "design" if p["kind"] == "design" else "component-test",
            contribution["skill"],
            "completed",
            contribution["last"],
        )
    log(state, p, "issued" if p["kind"] == "design" else "measured")


def log(state, p, code, actor=None):
    events = state["development"]["history"]
    events.append(
        dict(
            id=f"engineering-{len(events) + 1}",
            date=state["date"],
            code=code,
            project=p["id"],
            person=actor or p["lead"],
        )
    )


def command(state, world, action, payload):
    if state["setup"]["role"] != "manager":
        raise RuleError("Поручения утверждает действующий менеджер команды.", 403)
    order = ORDERS[action].model_validate(payload)
    org = state["setup"]["org"]
    if isinstance(order, (Design, TestOrder)):
        commission(state, world, org, f"engineering-order-{state['revision']}", order)
        return
    p = state["development"]["projects"].get(order.project)
    if not p or p["org"] != org:
        raise RuleError("Проект недоступен.", 403)
    if isinstance(order, Reorder):
        if p["finished"]:
            raise RuleError("Работа завершена.")
        p["priority"] = order.priority
    else:
        review(state, world, p, order.disposition, state["player_id"])


def review(state, world, p, disposition, actor):
    if not p.get("specification") or p["disposition"] == disposition:
        raise RuleError("Редакция недоступна для такого решения.")
    if disposition == "released" and (
        p["findings"]
        or not any(
            t.get("candidate") == p["specification"] and t.get("report") and (not p.get("objective") or t["org"] == p["org"] and t["regulation"] == p["regulation"])
            for t in state["development"]["projects"].values()
        )
    ):
        raise RuleError("Выпуск требует испытанной редакции без выявленных дефектов.")
    if disposition == "released":
        entry = engineering_entry(state, world, p["entry"], p["org"], p["axis"])
        drawing = drawing_for(state, p["specification"])
        if (
            not admitted(state, entry)
            or restriction(
                state,
                world,
                entry,
                p["axis"],
                year=p.get("target_year"),
                reliability=p.get("brief") == "reliability",
            )
            or "supplier_axis" not in entry
            and not components.compatible(
                state, world, entry, drawing, year=p.get("target_year"), for_review=True
            )
        ):
            raise RuleError(
                "Редакция не соответствует действующей программе и допуску узла."
            )
    if disposition == "released" and "supplier_axis" in entry:
        from ..programme.rules import bulletin, within_limit

        year = p.get("target_year") or int(state["date"][:4])
        rule = bulletin(world, entry, year)
        if rule["slot"] == p["axis"] and not within_limit(entry, drawing):
            raise RuleError("Чертёж превышает ограничение сезонного бюллетеня.")
        approved = state["components"]["admissions"].setdefault(
            drawing["regulation"], []
        )
        if drawing["id"] not in approved:
            approved.append(drawing["id"])
    p["disposition"] = disposition
    log(state, p, disposition, actor)


def released(state, org, specification):
    """#48 can order a released drawing without materialising inventory here."""
    drawing = drawing_for(state, specification)
    p = state["development"]["projects"].get(drawing.get("reference"))
    return bool(
        p and p["org"] == org and p["disposition"] == "released" and not p["findings"]
    )


def npc_plan(state, world):
    ordinal = date.fromisoformat(state["date"]).toordinal()
    if ordinal % 5:
        return
    # Alternate constructor portfolios with verification programmes on homologated grids.
    constructor_turn = ordinal // 5 % 2 == 0
    entries = {
        e["org"]: e
        for e in world["entries"].values()
        if (e["championship"] == "f1") == constructor_turn
    }
    org = sorted(entries)[ordinal // 10 % len(entries)]
    if org == state["setup"]["org"] and state["setup"]["role"] == "manager":
        return
    if not occupant_on(state["seats"].get(org + ":manager", []), state["date"]):
        return
    entries_for_org = [
        p for p in state["development"]["projects"].values() if p["org"] == org
    ]
    if any(not p["finished"] for p in entries_for_org):
        return
    actor = occupant_on(state["seats"][org + ":manager"], state["date"])
    for project in entries_for_org:
        if project.get("disposition") != "review":
            continue
        protocol = next(
            (
                t
                for t in entries_for_org
                if t.get("candidate") == project["specification"] and t.get("report")
            ),
            None,
        )
        if protocol:
            # Check eligibility again after a suspension or a change of regulation.
            entry = world["entries"][project["entry"]]
            eligible = (
                admitted(state, entry)
                and not restriction(state, world, entry, project["axis"])
                and components.compatible(
                    state, world, entry, drawing_for(state, project["specification"])
                )
            )
            review(
                state,
                world,
                project,
                "withdrawn" if project["findings"] or not eligible else "released",
                actor,
            )
    entry = entries[org]
    previous = next(
        (
            p
            for p in sorted(
                entries_for_org,
                key=lambda x: (x["commissioned"], x["id"]),
                reverse=True,
            )
            if p.get("specification")
            and not any(
                t.get("candidate") == p["specification"] for t in entries_for_org
            )
        ),
        None,
    )
    if previous:
        order = TestOrder(
            entry=previous["entry"],
            baseline=previous["baseline"],
            candidate=previous["specification"],
            method="lab",
            priority="normal",
        )
    elif not constructor_turn:
        slots = sorted(components.mounting(state, entry["id"]))
        axis = slots[ordinal // 10 % len(slots)]
        base = components.spec(state, components.mounting(state, entry["id"])[axis])
        order = TestOrder(
            entry=entry["id"],
            baseline=base["id"],
            candidate=base["id"],
            method="bench" if "bench" in methods(axis) else "calculation",
            priority="normal",
        )
    else:
        axes = [
            a
            for a in sorted(components.mounting(state, entry["id"]))
            if not restriction(state, world, entry, a)
        ]
        if not axes:
            return
        source = versions(state, entry["id"], axes[ordinal // 5 % len(axes)])[-1]
        order = Design(
            entry=entry["id"],
            baseline=source["id"],
            priority="normal",
            brief="balanced",
        )
    try:
        commission(state, world, org, f"engineering-{org}-{state['date']}", order)
    except RuleError:
        return


def write_fact(db, cid, state, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch

    p = state["development"]["projects"][event["project"]]
    version = p.get("specification") or p["candidate"]
    d = drawing_for(state, version)
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
                        reference=p["id"],
                        context=dict(
                            org=p["org"],
                            org_name=world["organizations"][p["org"]]["name"],
                            program=p["program"],
                            person=event["person"],
                            component=dict(
                                manufacturer=d["manufacturer"],
                                product=p["axis"],
                                component=p["axis"],
                                specification=d["family"],
                                version=version,
                            ),
                        ),
                    ),
                )
            ]
        ),
    )
