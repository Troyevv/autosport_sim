"""Career research queue. Each working day consumes actual infrastructure and staff time."""

from datetime import date

from .. import components, preparation, professional, teamwork
from ..domain import RuleError, occupant_on
from ..finance import budget, facilities
from ..personnel import evaluate
from ..team_staff import department_capacity
from .model import (
    METHODS,
    LEGACY_AXES,
    question_for,
    design_context,
    ORDERS,
    queue_position as queue_position,
    Commission,
    Handover,
    Reorder,
    applicability,
    conclusion,
    evidence,
)


def initialize(state):
    state.setdefault(
        "research",
        dict(
            since=state["revision"],
            opened=state["date"],
            next_work_day=state["date"],
            projects={},
            reports={},
            personal={},
            handovers={},
        ),
    )


def public_source(world, entry):
    car = world["cars"][entry["car"]]
    return dict(
        kind="public-entry",
        reference=entry["id"],
        label=f"Заявочный лист · №{entry['number']} · {car['name']}",
        constructor=car["constructor"],
        model=car["name"],
        suppliers={
            product: world["organizations"][supplier]["name"]
            for product, supplier in car["suppliers"].items()
        },
    )


def admitted(state, entry):
    program = state["capital"]["programs"].get(entry["program"])
    return (
        program and program["status"] == "admitted" and program["org"] == entry["org"]
    )


def commission(state, world, org, key, order, *, target_year=None):
    projects = state["research"]["projects"]
    if key in projects:
        if (
            projects[key]["org"] != org
            or projects[key]["order"] != order.model_dump()
            or projects[key].get("target_year") != target_year
        ):
            raise RuleError("Этот номер уже принадлежит другому поручению.", 409)
        return projects[key]
    from ..programme import paused

    year = target_year or int(state["date"][:4])
    if paused(state, org, year):
        raise RuleError("Развитие текущего поколения остановлено менеджером.", 409)
    entry = world["entries"].get(order.entry)
    if (
        not entry
        or not admitted(state, entry)
        or entry["org"] != org
        or order.axis not in components.mounting(state, order.entry)
    ):
        raise RuleError("Направление недоступно для этой заявки.", 403)
    from ..programme.rules import config_for

    config = config_for(state, world, entry, target_year)
    axis = order.axis
    role, _, question, hours, price = METHODS[axis]
    staff = components.specialists(state, world, entry)
    if not staff.get(role):
        raise RuleError("В программе нет ответственного специалиста.", 409)
    drawing = components.spec(state, components.mounting(state, entry["id"])[axis])
    source = dict(
        kind="design-file",
        reference=drawing["id"],
        label="Конструкторская документация · " + world["cars"][entry["car"]]["name"],
    )
    if "development" in state:
        question = question_for(state, world, entry, drawing, config=config)
    if "development" in state and drawing["manufacturer"] != org:
        source["label"] = (
            "Монтажная документация · " + world["cars"][entry["car"]]["name"]
        )
    comparable = True
    if order.rival_entry:
        rival = world["entries"].get(order.rival_entry)
        if (
            not rival
            or rival["org"] == org
            or (rival["championship"], rival["category"])
            != (entry["championship"], entry["category"])
        ):
            raise RuleError("Нужна публичная заявка соперника того же класса.")
        source = public_source(world, rival)
        product = {"cooling": "engine", "tyre": "tyre"}.get(axis)
        if "development" in state and axis in ("engine", "transmission"):
            product = axis
        own_car = world["cars"][entry["car"]]
        own_supplier = own_car["suppliers"].get(product)
        comparable = (
            own_supplier is not None
            and own_supplier == world["cars"][rival["car"]]["suppliers"].get(product)
            if product
            else own_car["name"] == source["model"]
        )
        supplier = source["suppliers"].get(product)
        subject = f"{source['model']} · {supplier}" if supplier else source["model"]
        question = f"{subject}. {question}"
    cost = budget.ProjectCost(
        project=key,
        program=entry["program"],
        generation=config["generation"],
        target_season=config["season"],
        due=state["date"],
        amount_cents=price,
        atr={},
    )
    budget.project(state, world, cost)
    project = dict(
        id=key,
        org=org,
        order=order.model_dump(),
        entry=entry["id"],
        program=entry["program"],
        axis=axis,
        concept=config["concept"],
        regulation=config["regulation"],
        source=source,
        hypothesis=question,
        priority=order.priority,
        commissioned=state["date"],
        allocated_on=None,
        started=None,
        finished=None,
        role=role,
        lead=staff[role],
        cost_cents=price,
        baseline=drawing["id"],
        required=hours,
        worked=0,
        quality_sum=0,
        refinements=drawing["refinements"],
        comparable=comparable,
        participants={},
        status="queued",
        reason="Ожидает распределения мощности.",
        days=0,
    )
    if "development" in state:
        project["commission_revision"] = state["revision"]
        from ..development import restriction

        project["integration_study"] = bool(restriction(state, world, entry, axis))
        project["design_context"] = design_context(state, entry, axis)
    if target_year is not None:
        project["target_year"] = target_year
    if target_year is not None:
        from ..programme.rules import pin_concept

        pin_concept(state, world, entry, target_year)
    projects[key] = project
    return project


def record_work(
    state, world, pid, org, key, kind, skill, result, assignment_day=None, mentor=None
):
    person = state["people"][pid]
    professional.record(
        state,
        world,
        professional.Activity(
            event_id=key,
            person=pid,
            role=person["position"],
            org=org,
            kind=kind,
            skills=[skill],
            difficulty=65,
            result=result,
            date=state["date"],
            context=professional.Context(mentor=mentor),
        ),
        assignment_day=assignment_day,
    )


def handover(state, world, org, order):
    data = state["research"]
    report = data["reports"].get(order.report)
    if not report or report["org"] != org:
        raise RuleError("Отчёт недоступен.", 403)
    mentor, recipient = order.mentor, order.recipient
    entry = world["entries"][data["projects"][report["project"]]["entry"]]
    current = set(components.specialists(state, world, entry).values()) - {None}
    if not {mentor, recipient} <= current or mentor == recipient:
        raise RuleError("Для передачи нужны два действующих специалиста программы.")
    if report["id"] not in data["personal"].get(mentor, {}):
        raise RuleError("Наставник не участвовал в работе с этим материалом.")
    if report["id"] in data["personal"].get(recipient, {}):
        raise RuleError("Специалист уже знаком с материалом.", 409)
    today = state["date"]
    tomorrow = facilities.later(today, 1)
    if any(
        not available_person(state, p, today, tomorrow) for p in (mentor, recipient)
    ):
        raise RuleError(
            "Для передачи дел требуется свободное время обоих специалистов.", 409
        )
    key = f"brief-{state['revision']}"
    skill = state["people"][recipient]["specialization"]
    record_work(
        state,
        world,
        recipient,
        org,
        key,
        "research-handover",
        skill,
        "completed",
        mentor=mentor,
    )
    data["personal"].setdefault(recipient, {})[report["id"]] = "briefed"
    data["handovers"][key] = dict(
        id=key,
        org=org,
        date=today,
        mentor_name=state["people"][mentor]["name"],
        recipient_name=state["people"][recipient]["name"],
        **order.model_dump(),
    )


def command(state, world, action, payload):
    if state["setup"]["role"] != "manager":
        raise RuleError("Исследованиями распоряжается менеджер команды.", 403)
    org = state["setup"]["org"]
    order = ORDERS[action].model_validate(payload)
    if isinstance(order, Commission):
        commission(state, world, org, f"study-{state['revision']}", order)
    elif isinstance(order, Reorder):
        project = state["research"]["projects"].get(order.project)
        if not project or project["org"] != org or project["finished"]:
            raise RuleError("Проект недоступен для изменения.", 409)
        project["priority"] = order.priority
    elif isinstance(order, Handover):
        handover(state, world, org, order)


def available_person(state, pid, day, end):
    return (
        state["people"][pid]["fatigue"] < 60
        and not preparation.busy(state, pid, day, end)
        and not any(
            r["advisor"] == pid and r["start"] < end and r["end"] > day
            for r in state["support"]
        )
    )


def facility(state, org, day, end, kind="research"):
    assets = (a for a in state["estate"]["assets"].values() if a["kind"] == kind)
    return next(
        (
            a
            for a in sorted(assets, key=lambda a: (a["owner"] != org, a["id"]))
            if facilities.free(state, a, day, end, buyer=org) > 0
        ),
        None,
    )


def complete(state, world, p):
    data = state["research"]
    outcome, confidence, text = conclusion(state["setup"]["seed"], p)
    p.update(finished=state["date"], status="complete", reason=None)
    key = "report-" + p["id"]
    data["reports"][key] = dict(
        id=key,
        project=p["id"],
        date=state["date"],
        outcome=outcome,
        confidence=confidence,
        conclusion=text,
        **{
            k: p[k]
            for k in (
                "org",
                "program",
                "axis",
                "concept",
                "regulation",
                "source",
                "baseline",
                "hypothesis",
                "participants",
                "lead",
            )
        },
    )
    for pid, contribution in p["participants"].items():
        data["personal"].setdefault(pid, {})[key] = "author"
        record_work(
            state,
            world,
            pid,
            p["org"],
            key,
            "research",
            contribution["skill"],
            "failed" if outcome == "inconclusive" else "completed",
            contribution["last"],
        )


def work(state, world, p, used):
    org, day = p["org"], state["date"]
    end = facilities.later(day, 1)
    entry = world["entries"][p["entry"]]
    staff = components.specialists(state, world, entry)
    lead = staff.get(p["role"])
    p.update(lead=lead, status="queued", allocated_on=day)
    if not admitted(state, entry):
        p["reason"] = "Допуск программы приостановлен."
        return
    if not lead or lead in used or not available_person(state, lead, day, end):
        p["reason"] = "Вакансия или занят ответственный специалист."
        return
    from .. import development

    kind = p.get("site_kind", "research")
    from ..programme import paused, work_year
    from ..programme.rules import config_for

    if paused(state, org, work_year(state, p)):
        p["reason"] = "Работа приостановлена до перераспределения ресурсов."
        return
    if "kind" in p or p.get("target_year"):
        config = config_for(state, world, entry, p.get("target_year"))
        if config["regulation"] != p["regulation"] or config["concept"] != p["concept"]:
            p["reason"] = "Изменились концепция или регламент программы."
            return
        if p.get("kind") == "design" and (
            reason := development.restriction(
                state,
                world,
                entry,
                p["axis"],
                year=p.get("target_year"),
                reliability=p.get("brief") == "reliability",
            )
        ):
            p["reason"] = reason
            return
    site = facility(state, org, day, end, kind)
    from ..council import may_rent

    if not site and may_rent(state, org):
        # The manager rents only for a day on which the assigned specialist can work.
        try:
            if p.get("kind") == "test":
                development.check_rental(state, world, p, entry)
            facilities.act(
                state,
                world,
                org,
                p["id"] + "/lease/" + day,
                facilities.Lease(
                    facility="shared:" + kind, start=day, days=1, units=1, mode="lease"
                ),
            )
            site = state["estate"]["assets"]["shared:" + kind]
        except RuleError as error:
            p["reason"] = str(error)
            return
    if not site:
        p["reason"] = (
            "Нет свободного слота исследовательского центра."
            if kind == "research"
            else "Нет свободного слота: " + facilities.TYPES[kind][0] + "."
        )
        return
    axis = p["axis"]
    skill = METHODS[axis][1]
    person = state["people"][lead]
    ability = evaluate(person, world, day)["values"][skill]
    prior = (
        p["evidence"]
        if "evidence" in p
        else evidence(state, org, axis, p["concept"], p["regulation"])
    )
    familiarity = max((r["confidence"] for r in prior), default=0)
    # Private experience travels with the specialist, without copying a former employer's reports.
    personal = state["research"]["personal"].get(lead, {})
    personal_insight = max(
        (
            applicability(report, p["concept"], p["regulation"])
            // (15 if origin == "author" else 25)
            for key, origin in personal.items()
            if (report := state["research"]["reports"][key])["axis"] == axis
        ),
        default=0,
    )
    chief = staff.get("chief-engineer")
    review = 0
    department = {
        "aero": "Аэродинамика",
        "chassis": "Шасси",
        "performance": "Силовая установка",
        "reliability": "Надёжность",
    }[p["role"]]
    group = next(
        (
            g
            for g in state["collectives"].values()
            if g["org"] == org and g["name"] == department
        ),
        None,
    )
    staff_hours = max(1, 8 * (100 - person["fatigue"]) // 100)
    contributors = [(lead, skill, staff_hours)]
    if chief and used.get(chief, 0) <= 6 and available_person(state, chief, day, end):
        review = teamwork.professional_action(
            state, world, ("technical", lead, chief, org), day, evidence=ability
        )["review_quality"]
        contributors.append((chief, "Координация", 2))
    key = f"{p['id']}/{day}"
    if p.get("kind") == "test":
        if not development.book_test(state, world, p, site, key):
            return
    else:
        facilities.consume(
            state,
            org,
            key,
            site,
            day,
            end,
            1,
            "development" if kind == "design" else "research",
            p["id"],
            program=p["program"],
            regulation=p["regulation"],
        )
    if "grants" in p:
        p["grants"].append(key)
    grant = facilities.grant(state, key)
    support_hours = grant.effective_person_days_x100 * 8 // 100
    # Site operators and the team's own department must both have time for analysis.
    peer = None
    if group:
        remaining_capacity = (
            department_capacity(group) - used.get(group["id"], 0)
            if "programme" in state
            else department_capacity(group)
        )
        support_hours = min(support_hours, max(0, remaining_capacity) * 8 // 100)
    if "kind" in p and group:
        peer_name = {
            "aero": "Шасси",
            "chassis": "Аэродинамика",
            "reliability": "Силовая установка",
            "performance": "Надёжность",
        }[p["role"]]
        peer = next(
            (
                g
                for g in state["collectives"].values()
                if g["org"] == org and g["name"] == peer_name
            ),
            None,
        )
        if peer:
            handover = teamwork.professional_action(
                state,
                world,
                ("handover", peer["id"], group["id"], org)
                if p["role"] in ("reliability", "chassis")
                else ("handover", group["id"], peer["id"], org),
                day,
                evidence=ability,
            )["handover_quality"]
            review = (review + handover) // 2
            remaining_capacity = (
                department_capacity(peer) - used.get(peer["id"], 0)
                if "programme" in state
                else department_capacity(peer)
            )
            support_hours = min(support_hours, max(0, remaining_capacity) * 8 // 100)
    if "programme" in state:
        for crew in (group, peer):
            if crew:
                used[crew["id"]] = (
                    used.get(crew["id"], 0) + (support_hours * 100 + 7) // 8
                )
    hours = sum(h for _, _, h in contributors)
    quality = min(
        96,
        (2 * ability + grant.condition + review + (100 - person["fatigue"])) // 5
        - (0 if p["comparable"] else 8)
        + familiarity // 20
        + personal_insight,
    )
    work_done = min(
        p["required"] - p["worked"], max(1, (hours + support_hours) * quality // 100)
    )
    for pid, attribute, attended in contributors:
        used[pid] = used.get(pid, 0) + attended
        record = p["participants"].setdefault(
            pid, dict(hours=0, skill=attribute, name=state["people"][pid]["name"])
        )
        record.update(hours=record["hours"] + attended, last=day)
    p.update(
        started=p["started"] or day,
        status="active",
        reason=None,
        days=p["days"] + 1,
        worked=p["worked"] + work_done,
        quality_sum=p["quality_sum"] + quality * work_done,
    )
    if p["worked"] == p["required"]:
        if "kind" in p:
            development.complete(state, world, p)
        else:
            complete(state, world, p)
        if "council" in state:
            from ..council.outcomes import completed

            completed(state, world, p)


def npc_plan(state, world):
    # Stagger reviews across the grid. Every team reaches the same commissioning and booking paths.
    day = state["date"]
    ordinal = date.fromisoformat(day).toordinal()
    if ordinal % 4:
        return
    orgs = sorted({p["org"] for p in world["programs"].values()})
    org = orgs[(ordinal // 4) % len(orgs)]
    if org == state["setup"]["org"] and state["setup"]["role"] == "manager":
        return
    if not occupant_on(state["seats"].get(org + ":manager", []), day):
        return
    data = state["research"]
    if any(p["org"] == org and not p["finished"] for p in data["projects"].values()):
        return
    entry = next(e for _, e in sorted(world["entries"].items()) if e["org"] == org)
    topics = METHODS if "development" in state else LEGACY_AXES
    axes = [a for a in topics if a in components.mounting(state, entry["id"])]
    axis = axes[(ordinal // 4 + ordinal // (4 * len(orgs))) % len(axes)]
    key = f"study-{org}-{day}"
    try:
        commission(
            state,
            world,
            org,
            key,
            Commission(entry=entry["id"], axis=axis, priority="normal"),
        )
    except RuleError:
        return


def advance(state, world, end):
    """Run elapsed research days before the next dated career transition."""
    start = state["date"]
    try:
        state["date"] = max(start, state["research"]["next_work_day"])
        while state["date"] < end:
            day = state["date"]
            tomorrow = facilities.later(day, 1)
            if "council" in state:
                from ..council import day as council_day

                council_day(state, world)
            else:
                npc_plan(state, world)
            queues = [state["research"]["projects"]]
            if "development" in state:
                from .. import development

                if "council" not in state:
                    development.npc_plan(state, world)
                queues.append(state["development"]["projects"])
            used = {}
            from ..programme import queue_key

            pending = sorted(
                (p for queue in queues for p in queue.values() if not p["finished"]),
                key=lambda p: queue_key(state, p),
            )
            for p in pending:
                work(state, world, p, used)
            if "production" in state:
                from ..production.workshop import day as workshop_day

                workshop_day(state, world, used)
            state["date"] = tomorrow
            state["research"]["next_work_day"] = tomorrow
    finally:
        state["date"] = start


def write_fact(db, cid, world, report):
    from ..statistics import facts
    from ..statistics.models import Batch

    facts.record(
        db,
        cid,
        Batch(
            facts=[
                dict(
                    version=1,
                    day=report["date"],
                    access="technical",
                    data=dict(
                        kind="research-report",
                        source_id=report["id"],
                        code=report["outcome"],
                        reference=report["concept"],
                        context=dict(
                            org=report["org"],
                            org_name=world["organizations"][report["org"]]["name"],
                            person=report["lead"],
                            program=report["program"],
                        ),
                    ),
                )
            ]
        ),
    )
