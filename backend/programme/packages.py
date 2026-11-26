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


def component(state, world, e, plan, pkg, axis, works):
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
    # Stock is organization-wide. A batch on the lathe or a serial awaiting acceptance is not ready.
    org = e["org"]
    stock = [
        iid
        for iid in [
            *OPENING.by_org[org],
            *(
                i
                for i, r in state["components"]["inventory"].items()
                if r["org"] == org
            ),
        ]
        if components.spec(state, iid)["id"] == version
        and components.serviceable(state, iid)
        and state["production"]["items"].get(iid, {}).get("status", "stock") == "stock"
    ]
    compatible = components.compatible(
        state, world, e, drawing_for(state, version), year=plan["year"]
    )
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
    elif not compatible:
        status, risk = "Несовместим", "Отложить внедрение до согласования интерфейсов."
    elif stock:
        status = "Готов к применению"
    elif batches and any(not b["finished"] for b in batches):
        status = "Изготовление"
    elif any(
        item["batch"] in {b["id"] for b in batches}
        and item["status"] == "inspection"
        and not item["rejected"]
        for item in state["production"]["items"].values()
    ):
        status = "Контроль качества"
    else:
        status = "Требуется изготовление"
        outsource = drawing_for(state, version)["manufacturer"] != org
        unit = production.quote(drawing_for(state, version), False, outsource)
        action = agenda.option(
            "produce",
            "Изготовить экземпляр",
            "Передать один экземпляр на контроль качества.",
            "Возможен брак при приёмке.",
            dict(
                entry=e["id"],
                specification=version,
                quantity=1,
                priority="normal",
                rush=False,
                outsource=outsource,
            ),
            "factory",
            unit["hours"],
            unit["cents"],
        )
    relevant_projects = [*studies, *designs, *tests, *batches]
    return dict(
        axis=axis,
        label=LABELS[axis],
        specification=version,
        status=status,
        risk=risk,
        ready=status == "Готов к применению",
        serials=sorted(stock) if compatible else [],
        cost_cents=sum(p["cost_cents"] for p in relevant_projects),
        forecast=design.get("forecast", {}),
        next_cost_cents=action["cost_cents"] if action else 0,
        confidence=applicability(report, plan["concept"], plan["regulation"])
        if report
        else None,
        action=action,
        sources=evidence,
    )


def evaluate_package(state, world, e, plan, pkg, works):
    parts = [component(state, world, e, plan, pkg, a, works) for a in pkg["axes"]]
    for part in parts:
        part["fits"] = []
        if not part["ready"] or plan["year"] != int(state["date"][:4]):
            continue
        axis = part["axis"]
        for car in sorted(world["entries"].values(), key=lambda x: x["id"]):
            if car["org"] != e["org"] or car["program"] != e["program"]:
                continue
            installed = components.mounting(state, car["id"]).get(axis)
            if not installed or (
                components.spec(state, installed)["id"] == part["specification"]
                and components.serviceable(state, installed)
            ):
                continue
            stock = components.stockroom(state, world, car)
            for iid in sorted(set(stock).intersection(part["serials"])):
                target, _, _ = components.allocation(state, world, car, iid, stock)
                if not target and not components.installation_block(
                    state, car, components.specialists(state, world, car)
                ):
                    part["fits"].append(
                        dict(
                            entry=car["id"],
                            instance=iid,
                            label=f"№{car['number']} · {components.serial(iid)}",
                        )
                    )
    ready = sum(p["ready"] for p in parts)
    return dict(
        pkg,
        parts=parts,
        ready=ready,
        cost_cents=sum(p["cost_cents"] for p in parts),
        advice="Допущены оба узла."
        if ready == len(parts)
        else "Возможна отдельная установка допущенного узла после проверки на выбранной машине."
        if ready
        else "Сохранить сборку до проверки и приёмки.",
    )


def topics(state, world, e, staff):
    year = int(state["date"][:4])
    for target in (year, year + 1):
        plan = dossier(state, world, e, target)
        pkg = package(state, world, e, plan)
        works = list(work_for(state, world, e, plan))
        for axis in pkg["axes"]:
            part = component(state, world, e, plan, pkg, axis, works)
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
        cost_cents=p["cost_cents"],
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
