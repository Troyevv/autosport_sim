"""A package is a set of engineering requirements, tracked to the real queues and serials."""

from math import ceil
from ..domain import RuleError
from .. import components, development, production
from ..components.catalog import OPENING
from ..components.design import LABELS
from ..components.registry import drawing_for
from ..council import agenda
from ..council.evidence import verdict
from ..development.physics import methods
from ..finance import facilities
from ..research.model import METHODS, INTERACTIONS, applicability
from . import work_year, paused, policy
from .rules import dossier, admitted_version
from .deployment import Deployment

PAIRS = {
    "floor": "suspension",
    "suspension": "floor",
    "rear-wing": "floor",
    "cooling": "chassis",
    "chassis": "cooling",
    "engine": "cooling",
    "brakes": "tyre",
    "tyre": "brakes",
    "transmission": "engine",
}


def entries_for(world, org):
    models = set()
    for _, e in sorted(world["entries"].items()):
        model = world["cars"][e["car"]]["concept"]
        if e["org"] == org and model not in models:
            models.add(model)
            yield e


def package(state, world, e, plan):
    mounted = components.mounting(state, e["id"])
    axis = plan["rule"]["slot"]
    cause = plan["rule"]["text"] if axis else None
    if not axis:
        axis = (
            "floor"
            if "floor" in mounted
            and components.design_estimate(state, mounted)["thermal_margin_kw"] > 0
            else "cooling"
        )
        cause = "Согласовать " + INTERACTIONS[axis] + "."
    goal = state["mandates"].get(e["org"], {}).get("goal")
    if not plan["rule"]["slot"] and goal == "economy":
        axis = "cooling"
        cause = "Сохранить ресурс силовой установки при ограниченном бюджете."
    if plan["strategy"] == "replace":
        axis = (
            "chassis"
            if axis in ("floor", "suspension")
            else "floor"
            if "floor" in mounted
            else "cooling"
        )
        cause = (
            "Проверить компоновку новой концепции и заново согласовать связанные узлы."
        )
    facts = [
        f
        for _, f in sorted(state["council"]["observations"].items())
        if f["entry"] == e["id"]
    ]
    if facts and plan["year"] == int(state["date"][:4]):
        f = max(facts, key=lambda f: (f["day"], f["reference"]))
        axis = drawing_for(state, f["specification"])["slot"]
        cause = f["observation"]
    # Detected faults outrank a nominal opportunity. The private latent fault stays inside metrology.
    failures = [
        p
        for p in state["development"]["projects"].values()
        if p["org"] == e["org"]
        and p["entry"] == e["id"]
        and p.get("findings")
        and p["concept"] == plan["concept"]
        and work_year(state, p) == plan["year"]
    ]
    if failures:
        failure = max(failures, key=lambda p: (p["commissioned"], p["id"]))
        axis = failure["axis"]
        cause = (
            "Устранить дефект, выявленный в протоколе " + failure["findings"][-1] + "."
        )
    axes = [axis, PAIRS[axis]]
    key = agenda.identifier(plan["id"], plan["concept"], cause, *axes).replace(
        "brief-", "package-"
    )
    deadline = next(
        (
            ev
            for ev in sorted(world["events"], key=lambda ev: (ev["start"], ev["id"]))
            if ev["series"] == e["championship"]
            and ev["start"] >= state["date"]
            and int(ev["start"][:4]) == plan["year"]
            and ev["kind"] in ("round", "testing")
            and not ev.get("org")
        ),
        None,
    )
    if key in state["programme"]["packages"]:
        return state["programme"]["packages"][key]
    return dict(
        id=key,
        plan=plan["id"],
        org=e["org"],
        concept=plan["concept"],
        entry=e["id"],
        year=plan["year"],
        axes=axes,
        goal=cause,
        stage=deadline["name"] if deadline else "Проверка допуска поколения",
        due=deadline["start"] if deadline else plan["rule"]["effective"],
        baselines={a: components.spec(state, mounted[a])["id"] for a in axes},
    )


def pin_before_fit(state, world, entry, slot):
    """Preserve the reference assembly when a garage order changes the planning car."""
    if not any(e["id"] == entry["id"] for e in entries_for(world, entry["org"])):
        return
    plan = dossier(state, world, entry)
    pkg = package(state, world, entry, plan)
    if slot in pkg["axes"]:
        state["programme"]["packages"].setdefault(pkg["id"], pkg)


def work_for(state, world, e, plan):
    org = e["org"]
    model = world["cars"][e["car"]]["concept"]
    for book, kind in (
        ("research", "research"),
        ("development", "design"),
        ("production", "produce"),
    ):
        pool = state[book]["batches" if book == "production" else "projects"]
        for p in sorted(
            pool.values(),
            key=lambda p: (
                p["commissioned"],
                p.get("commission_revision", -1),
                p["id"],
            ),
        ):
            if (
                p["org"] == org
                and work_year(state, p) == plan["year"]
                and world["cars"][world["entries"][p["entry"]]["car"]]["concept"]
                == model
            ):
                yield p.get("kind", kind), p


def component(state, world, e, plan, pkg, axis, works, cars, deployment):
    """Follow the project's parent, protocol, release and batch. Never sort candidates by version."""
    base = pkg["baselines"][axis]
    relevant = [
        (k, p)
        for k, p in works
        if p.get("axis", axis) == axis
        and p.get("concept", plan["concept"]) == plan["concept"]
    ]
    studies = [p for k, p in relevant if k == "research" and p["baseline"] == base]
    designs = [p for k, p in relevant if k == "design" and p["baseline"] == base]
    # Follow a signed correction of a failed parent within the same programme.
    for kind, child in relevant:
        if (
            kind == "design"
            and child["brief"] == "reliability"
            and any(child["baseline"] == p.get("specification") for p in designs)
        ):
            designs.append(child)
    design = designs[-1] if designs else {}
    version = design.get("specification") or base
    tests = [
        p
        for k, p in relevant
        if k == "test"
        and p["candidate"] == version
        and p["baseline"] == design.get("baseline", base)
    ]
    batches = [
        p for k, p in relevant if k == "produce" and p["specification"] == version
    ]
    reports = [p for p in tests if p.get("report")]
    study = studies[-1] if studies else {}
    report = state["research"]["reports"].get("report-" + study.get("id", ""), {})
    allowed = admitted_version(
        state, world, e, drawing_for(state, version), plan["year"]
    )
    org = e["org"]
    targets = []
    inventory = {}
    fits = []
    action = None
    status = "План исследования"
    risk = "Срок зависит от доступности специалиста и мощности."
    evidence = [base]
    if study:
        evidence.append(study["id"])
    if report:
        evidence.append(report["id"])
    if design:
        evidence.append(design["id"])
    evidence += [p["id"] for p in tests + batches]
    if pkg.get("withdrawn"):
        status, risk = (
            "Внедрение отменено",
            "Поручения и оплаченные работы сохранены в календаре.",
        )
    elif pkg["concept"] != plan["concept"]:
        status, risk = (
            "Прежняя концепция",
            "Внедрение приостановлено после пересмотра концепции.",
        )
    elif paused(state, org, plan["year"]):
        status = "Развитие приостановлено"
    elif design and not design["finished"]:
        status, risk = "В конструкторском бюро", design["reason"] or risk
    elif studies and not study["finished"]:
        status, risk = "Исследование", study["reason"] or risk
    elif any(not t["finished"] for t in tests):
        status = "В очереди испытаний"
    elif design.get("disposition") == "withdrawn" or design.get("findings"):
        status, risk = "Редакция отозвана", "Использовать ранее допущенную сборку."
        if design.get("findings"):
            action = agenda.option(
                "design",
                "Исправить подтверждённый дефект",
                "Сохранить номинальные параметры.",
                "Повторная проверка обязательна.",
                dict(
                    entry=e["id"],
                    baseline=version,
                    priority="normal",
                    brief="reliability",
                ),
                "design",
                METHODS[axis][3] + 24,
                METHODS[axis][4] * 3,
            )
    elif not study and not design and not tests:
        action = agenda.study(e, axis)
    elif (
        not design
        and report.get("outcome") == "supported"
        and not development.restriction(state, world, e, axis, year=plan["year"])
    ):
        lead = components.specialists(state, world, e).get(METHODS[axis][0])
        if lead:
            status = "Направление подтверждено"
            action = agenda.design_option(
                state, world, e, axis, base, lead, config=plan
            )
    elif not reports:
        status = "Требуется проверка сборки"
        method = (
            "cfd"
            if "cfd" in methods(axis)
            else "bench"
            if "bench" in methods(axis)
            else "lab"
        )
        action = agenda.test_option(
            e, axis, design.get("baseline", base), version, method
        )
    elif design.get("disposition") == "review":
        result = verdict(reports, axis)
        release = result == "release"
        status = "Рассмотрение испытаний"
        risk = reports[-1]["report"]["interpretation"]
        action = agenda.option(
            "review",
            "Допустить спецификацию" if release else "Сохранить прежнюю спецификацию",
            risk,
            "Проверка относится к указанной сборке.",
            dict(
                project=design["id"], disposition="released" if release else "withdrawn"
            ),
        )
    elif not allowed and plan["rule"]["slot"] == axis:
        status = "Требуется омологация"
        action = agenda.option(
            "homologate",
            "Зарегистрировать спецификацию",
            "Внести проверенный чертёж в реестр сезона.",
            "Регистрация относится к этой модели и сезону.",
            dict(specification=version),
        )
    else:
        drawing = drawing_for(state, version)
        targets, fits = deployment.distribute(cars, plan, pkg, drawing)
        inventory = {
            phase: len(ids) for phase, ids in deployment.supply(version).items()
        }
        states = [r["status"] for r in targets]
        missing = sum(x in ("waiting", "priority") for x in states)
        if not missing:
            if "incompatible" in states:
                status, risk = "Несовместим", "Проверить интерфейсы обозначенных машин."
            elif "shared" in states:
                status = "Общее требование другого пакета"
            else:
                status = (
                    "Установлен"
                    if all(x == "installed" for x in states)
                    else "Готов к применению"
                )
        else:
            shortage, expected = deployment.expected(version, batches, missing)
            if shortage:
                status = "Требуется изготовление"
                outsource = drawing["manufacturer"] != org
                unit = production.quote(drawing, False, outsource)
                quantity = min(shortage, 24)
                evidence.append(f"demand:{quantity}")
                action = agenda.option(
                    "produce",
                    "Изготовить недостающие экземпляры",
                    f"Передать на контроль качества: {quantity} шт.",
                    "Возможен брак при приёмке.",
                    dict(
                        entry=e["id"],
                        specification=version,
                        quantity=quantity,
                        priority="normal",
                        rush=False,
                        outsource=outsource,
                    ),
                    "factory",
                    unit["hours"] * quantity,
                    unit["cents"] * quantity,
                )
            else:
                status = (
                    "Изготовление"
                    if expected["produce"]
                    else "Контроль качества"
                    if expected["inspection"]
                    else "Ремонт"
                )
    relevant_projects = [*studies, *designs, *tests, *batches]
    return dict(
        axis=axis,
        label=LABELS[axis],
        specification=version,
        status=status,
        risk=risk,
        ready=status in ("Готов к применению", "Установлен"),
        serials=[r["instance"] for r in targets if r["status"] == "allocated"],
        targets=targets,
        inventory=inventory,
        fits=fits,
        cost_cents=sum(expenses(state, p)[0] for p in relevant_projects),
        forecast=design.get("forecast", {}),
        next_cost_cents=action["cost_cents"] if action else 0,
        confidence=applicability(report, plan["concept"], plan["regulation"])
        if report
        else None,
        action=action,
        sources=evidence,
    )


def evaluate_package(state, world, e, plan, pkg, works, *, deployment=None):
    deployment = deployment or Deployment(state, world, e["org"])
    model = world["cars"][e["car"]]["concept"]
    cars = sorted(
        (
            car
            for car in world["entries"].values()
            if car["org"] == e["org"]
            and car["program"] == e["program"]
            and world["cars"][car["car"]]["concept"] == model
        ),
        key=lambda car: car["id"],
    )
    parts = [
        component(state, world, e, plan, pkg, a, works, cars, deployment)
        for a in pkg["axes"]
    ]
    ready = sum(p["ready"] for p in parts)
    installed = sum(r["status"] == "installed" for p in parts for r in p["targets"])
    required = len(cars) * len(parts)
    return dict(
        pkg,
        parts=parts,
        ready=ready,
        installed=installed,
        required=required,
        cost_cents=sum(p["cost_cents"] for p in parts),
        advice="Пакет установлен на все целевые машины."
        if installed == required
        else "Пакет частично внедрён."
        if installed
        else "Детали готовы для всех целевых машин."
        if ready == len(parts)
        else "Возможна отдельная установка допущенного узла."
        if any(p["fits"] for p in parts)
        else "Сохранить сборку до проверки и приёмки.",
    )


def portfolios(state, world, org):
    year = int(state["date"][:4])
    years = (
        (year + 1, year)
        if policy(state, org) in ("next", "stop-current")
        else (year, year + 1)
    )
    deployment = Deployment(state, world, org)
    for target in years:
        for e in entries_for(world, org):
            plan = dossier(state, world, e, target)
            works = list(work_for(state, world, e, plan))
            active = package(state, world, e, plan)
            others = sorted(
                (
                    p
                    for p in state["programme"]["packages"].values()
                    if p["plan"] == plan["id"] and p["id"] != active["id"]
                ),
                key=lambda p: (p["due"], p["id"]),
            )
            cards = [
                evaluate_package(state, world, e, plan, p, works, deployment=deployment)
                for p in [active, *others]
            ]
            yield e, plan, works, cards


def topics(state, world, org, staff_by_entry):
    year = int(state["date"][:4])
    for e, plan, _, cards in portfolios(state, world, org):
        staff = staff_by_entry.get(e["id"])
        if not staff:
            continue
        target = plan["year"]
        pkg = cards[0]
        for part in pkg["parts"]:
            axis = part["axis"]
            choice = part["action"]
            if not choice or not staff.get(METHODS[axis][0]):
                continue
            flow = policy(state, e["org"])
            preferred = (
                target == year + 1
                and flow in ("next", "stop-current")
                or target == year
                and flow == "current"
            )
            # A qualifying or financial concern changes the proposal, leaving its signed predecessor intact.
            from ..finance import budget

            if choice["cost_cents"]:
                try:
                    budget.authorize(
                        state,
                        world,
                        e["org"],
                        "production"
                        if choice["action"] == "produce"
                        else "engineering",
                        choice["cost_cents"],
                        state["date"],
                    )
                except RuleError as exc:
                    choice = agenda.option(
                        "keep",
                        "Отложить финансирование",
                        str(exc),
                        "Внедрение переносится до пересмотра сметы.",
                    )
            row = agenda.build(
                state,
                world,
                e,
                staff,
                axis,
                "programme",
                [pkg["id"], *part["sources"], choice["action"]],
                pkg["goal"],
                f"{LABELS[axis]} · {target}. {part['status']}. {choice['title']}.",
                [choice, agenda.keep()],
                importance=5 if preferred else 1,
            )
            if row:
                row.update(
                    target_year=target,
                    package=pkg["id"],
                    plan=plan["id"],
                    concept=plan["concept"],
                    occasion=f"Программа {target} · {part['label']}",
                )
                yield row


def expenses(state, p):
    if "request" in p:
        return p["cost_cents"] + p["facility_cents"], 0
    term = state["finance"]["instalments"].get("project:" + p["id"], {})
    return (
        term.get("amount_cents", 0) if term.get("status") == "paid" else 0,
        term.get("amount_cents", 0) if term.get("status") == "pending" else 0,
    )


def timing(state, kind, p):
    remaining = p["required"] - p["worked"]
    rate = p["worked"] / p["days"] if p["days"] else 24
    return dict(
        id=p["id"],
        label=LABELS.get(
            p.get("axis") or drawing_for(state, p["specification"])["slot"]
        ),
        kind=kind,
        lead=p.get("lead"),
        status=p["status"],
        reason=p["reason"],
        cost_cents=expenses(state, p)[0],
        reserved_cents=expenses(state, p)[1],
        start=p["commissioned"],
        worked=p["worked"],
        required=p["required"],
        finished=p["finished"],
        forecast_end=p["finished"]
        or facilities.later(state["date"], max(0, ceil(remaining / rate) - 1)),
    )


def assembly_for(state, world, entry, year):
    """Use the mounted baseline and the staff's tested, released selections for this programme."""
    plan = dossier(state, world, entry, year)
    selected = {
        a: components.spec(state, i)["id"]
        for a, i in components.mounting(state, entry["id"]).items()
    }
    for h in state["development"]["history"]:
        if h["code"] != "released":
            continue
        p = state["development"]["projects"][h["project"]]
        if (
            p["org"] != entry["org"]
            or p["concept"] != plan["concept"]
            or p["regulation"] != plan["regulation"]
            or p.get("disposition") != "released"
            or p.get("findings")
        ):
            continue
        d = drawing_for(state, p["specification"])
        if d["interface"] == OPENING.interfaces[entry["id"]] and d["slot"] in selected:
            selected[d["slot"]] = d["id"]
    return selected


def installation_dependency(state, entry, drawing):
    """Check a changed interface against the assembly used for its qualification."""
    coupled = drawing.get("requires", {})
    fitted = components.mounting(state, entry["id"])
    for axis, version in coupled.items():
        if axis not in fitted or components.spec(state, fitted[axis])["id"] != version:
            return False
    for axis, iid in fitted.items():
        if axis != drawing["slot"]:
            expected = (
                components.spec(state, iid).get("requires", {}).get(drawing["slot"])
            )
            if expected and expected != drawing["id"]:
                return False
    return True


def allocation_topic(state, world, entry, staff):
    """Reconsider shared staff only when two live portfolios actually compete."""
    org = entry["org"]
    year = int(state["date"][:4])
    active = [
        p
        for book in ("research", "development")
        for p in state[book]["projects"].values()
        if p["org"] == org and not p["finished"] and p.get("lead")
    ]
    current = [p for p in active if work_year(state, p) == year]
    future = [p for p in active if work_year(state, p) == year + 1]
    conflicts = [
        (a, b)
        for a in current
        for b in future
        if a["lead"] == b["lead"]
        or a.get("site_kind", "research") == b.get("site_kind", "research")
    ]
    if not conflicts or policy(state, org) == "stop-current":
        return
    a, b = min(conflicts, key=lambda pair: (pair[0]["id"], pair[1]["id"]))
    events = [
        ev["start"]
        for ev in world["events"]
        if ev["series"] == entry["championship"]
        and ev["kind"] == "round"
        and ev["start"] >= state["date"]
    ]
    remaining = bool(events)
    urgent = remaining and (
        min(events) <= facilities.later(state["date"], 14)
        or any(
            f["org"] == org and f["day"] >= a["commissioned"]
            for f in state["council"]["observations"].values()
        )
    )
    focus = "current" if urgent else "next"
    if policy(state, org) == focus:
        return
    # A manager's explicit allocation is binding. A new mandate can delegate the next decision.
    if org + ":" + str(year) in state["programme"]["manager_allocations"]:
        return
    target = year if urgent else year + 1
    p = a if urgent else b
    entry = world["entries"][p["entry"]]
    staff = components.specialists(state, world, entry)
    plan = dossier(state, world, entry, target)
    choice = agenda.option(
        "allocate",
        f"Дать приоритет машине {target} года",
        "Изменить порядок доступа к общим специалистам и площадкам.",
        "Второй портфель может пропустить плановый срок.",
        dict(allocation=focus),
    )
    row = agenda.build(
        state,
        world,
        entry,
        staff,
        p["axis"],
        "programme",
        [a["id"], b["id"], focus],
        "Оба поколения претендуют на один ресурс. "
        + (
            f"Ближайший этап {min(events)}."
            if remaining
            else "Сезонный календарь пройден."
        ),
        "Сначала обеспечить ближайший этап."
        if urgent
        else "Направить свободные смены на подготовку следующего поколения.",
        [choice, agenda.keep()],
        importance=5,
    )
    if row:
        row.update(plan=plan["id"], occasion="Распределение между поколениями")
        yield row
