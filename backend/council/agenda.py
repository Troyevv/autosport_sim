"""Technical agenda assembled from identifiable evidence within one organization."""

from hashlib import sha256
from math import ceil

from ..domain import occupant_on

from .. import components, development, production, research, teamwork
from ..components.design import LABELS
from ..components.registry import drawing_for
from ..development.physics import TESTS, TRADE, forecast, methods
from ..finance import facilities
from ..personnel import evaluate
from ..production.planning import needs
from ..research.model import INTERACTIONS, METHODS, design_context, evidence
from .sources import citation
from .observations import analyst_for
from .evidence import preferred, protocols, replacement_due, verdict


OCCASIONS = {
    "programme": "Программа сезона",
    "direction": "Выбор направления",
    "session": "Разбор сессии",
    "study": "Заключение исследования",
    "revision": "Рассмотрение редакции",
    "withdrawal": "Разбор отзыва редакции",
    "fit": "Замена на машине",
    "resources": "Конфликт ресурсов",
    "inspection": "Брак при приёмке",
    "stock": "Заявка цеха",
}


def identifier(*parts):
    return "brief-" + sha256("|".join(parts).encode()).hexdigest()[:24]


def option(action, title, result, risk, payload=None, site=None, hours=0, cost=0):
    return dict(
        action=action,
        title=title,
        result=result,
        risk=risk,
        payload=payload or {},
        site=site,
        resource=facilities.TYPES[site][0] if site else "Штат программы",
        hours=hours,
        days=ceil(hours / 24),
        cost_cents=cost,
    )


def study(entry, axis):
    _, _, _, hours, cost = METHODS[axis]
    return option(
        "research",
        "Исследовать " + LABELS[axis].lower(),
        "От неподтверждённой гипотезы до заключения для КБ.",
        "Исследователь и слот центра заняты до заключения.",
        dict(entry=entry["id"], axis=axis, priority="normal"),
        "research",
        hours,
        cost,
    )


def keep():
    return option(
        "keep",
        "Сохранить текущую сборку",
        "Изменение спецификации и затрат — 0.",
        "Исходное ограничение остаётся в программе.",
    )


def test_option(entry, axis, base, candidate, method):
    label, site, cost, _ = TESTS[method]
    return option(
        "test",
        label + " · А/Б",
        "Одна парная проверка. Возможен результат в пределах погрешности.",
        "Вывод применим только к проверенной сборке и режиму.",
        dict(
            entry=entry["id"],
            baseline=base,
            candidate=candidate,
            method=method,
            priority="normal",
        ),
        site,
        1,
        cost,
    )


def build(
    state,
    world,
    entry,
    staff,
    axis,
    occasion,
    sources,
    observation,
    hypothesis,
    options,
    *,
    initiator=None,
    objection=None,
    importance=2,
):
    lead = initiator or staff.get(METHODS[axis][0])
    if not lead:
        return None
    chief = staff.get("chief-engineer")
    who = state["people"][lead]
    skill = METHODS[axis][1]
    ability = evaluate(who, world, state["date"])["values"]
    confidence = (
        2 * ability.get(skill, ability[who["specialization"]])
        + who["professionalism"]
        + who["ambition"]
    ) // 4
    peer_role = (
        "chassis"
        if axis in ("floor", "rear-wing", "suspension")
        else "performance"
        if axis in ("brakes", "tyre")
        else "reliability"
    )
    peer = staff.get(peer_role)
    positions = [
        dict(
            person=lead, stance="Инициатива", argument=hypothesis, confidence=confidence
        )
    ]
    if peer and peer != lead:
        alt = next(
            (
                o
                for o in options
                if o["action"] == "research" and o["payload"]["axis"] != axis
            ),
            options[1],
        )
        positions.append(
            dict(
                person=peer,
                stance="Возражение",
                argument=(objection or f"Не проверили {INTERACTIONS[axis]}.")
                + " Предлагаю: "
                + alt["title"]
                + ".",
                confidence=evaluate(state["people"][peer], world, state["date"])[
                    "values"
                ][state["people"][peer]["specialization"]],
            )
        )
    review = (
        teamwork.professional_action(
            state,
            world,
            ("technical", lead, chief, entry["org"]),
            state["date"],
            evidence=confidence,
        )["review_quality"]
        if chief
        else 0
    )
    recommended = 0
    if (
        occasion == "direction"
        and options[0]["action"] == "design"
        and review >= 53
        and confidence < 80
    ):
        recommended = 1
        if (
            peer
            and len(options) > 2
            and state["people"][peer]["reputation"] > who["reputation"]
            and options[2]["action"] == "research"
        ):
            recommended = 2
    if chief and chief != lead:
        choice = options[recommended]
        positions.append(
            dict(
                person=chief,
                stance="Заключение",
                confidence=review,
                argument=f"{observation} {choice['title']}. Учитываю ограничение: {choice['risk']}",
            )
        )
    return dict(
        id=identifier(entry["org"], entry["id"], axis, occasion, *sources),
        org=entry["org"],
        entry=entry["id"],
        program=entry["program"],
        axis=axis,
        subject=LABELS[axis],
        kind=occasion,
        occasion=OCCASIONS[occasion],
        sources=sources,
        materials=[citation(state, entry["org"], entry, k) for k in sources],
        observation=observation,
        hypothesis=hypothesis,
        lead=lead,
        chief=chief,
        confidence=confidence,
        positions=positions,
        options=options,
        recommended=recommended,
        importance=importance,
        date=state["date"],
    )


def design_option(state, world, entry, axis, base, lead, *, config=None):
    d = drawing_for(state, base)
    config = config or state["car_configurations"][entry["car"]]
    p = dict(
        brief="performance" if state["people"][lead]["ambition"] >= 75 else "balanced",
        evidence=evidence(
            state, entry["org"], axis, config["concept"], config["regulation"]
        ),
        test_inputs=development.test_inputs(state, entry["org"], base),
        assembly={
            k: components.spec(state, i)["id"]
            for k, i in components.mounting(state, entry["id"]).items()
        },
    )
    metric = TRADE[axis][0]
    low, high = forecast(
        state,
        d,
        p,
        evaluate(state["people"][lead], world, state["date"])["values"][
            METHODS[axis][1]
        ],
    )[metric]
    return option(
        "design",
        "Заказать доработку",
        f"Прогноз {metric}: {low:g}…{high:g}.",
        "Нужно проверить " + INTERACTIONS[axis] + ".",
        dict(entry=entry["id"], baseline=base, priority="normal", brief=p["brief"]),
        "design",
        METHODS[axis][3] + 24,
        METHODS[axis][4] * 3,
    )


def topics(state, world, org):
    entries = [
        e
        for e in world["entries"].values()
        if e["org"] == org and research.admitted(state, e)
    ]
    projects = [p for p in state["development"]["projects"].values() if p["org"] == org]
    studies = [p for p in state["research"]["projects"].values() if p["org"] == org]
    staff_by_entry = {e["id"]: components.specialists(state, world, e) for e in entries}
    covered = set()
    for e in entries:
        eid = e["id"]
        staff = staff_by_entry[eid]
        fitted = components.mounting(state, eid)
        yield from opening_topics(
            state, world, e, staff, fitted, covered, studies, projects
        )
        yield from session_topics(state, world, e, staff)
        yield from research_topics(state, world, e, staff, projects)
        yield from revision_topics(state, world, e, staff, projects)
        yield from fit_topics(state, world, e, staff, fitted)
    if entries and "programme" in state:
        from ..programme.packages import entries_for, topics as programme_topics

        for e in entries_for(world, org):
            if e["id"] in staff_by_entry:
                yield from programme_topics(state, world, e, staff_by_entry[e["id"]])
    if entries:
        yield from resource_topics(state, world, org, staff_by_entry, studies, projects)
        yield from workshop_topics(state, world, org, entries, staff_by_entry)


def opening_topics(state, world, e, staff, fitted, covered, studies, projects):
    config = state["car_configurations"][e["car"]]
    case = components.design_estimate(state, fitted)
    # Diagnose the limiting package, once per concept. No periodic new brief.
    axis = "cooling"
    if case["thermal_margin_kw"] > 0 and "floor" in fitted:
        axis = "floor"
    lead = staff.get(METHODS[axis][0])
    base = components.spec(state, fitted[axis])["id"]
    if config["concept"] not in covered and lead:
        covered.add(config["concept"])
        studies_here = [
            p for p in studies if p["program"] == e["program"] and p["baseline"] == base
        ]
        designs = [
            p for p in projects if p["baseline"] == base and p["kind"] == "design"
        ]
        if not studies_here and not designs:
            coupled_axis = "suspension" if axis == "floor" else "chassis"
            options = [study(e, axis), keep()]
            if staff.get(METHODS[coupled_axis][0]):
                options.insert(1, study(e, coupled_axis))
            if not development.restriction(state, world, e, axis):
                options.insert(0, design_option(state, world, e, axis, base, lead))
            yield build(
                state,
                world,
                e,
                staff,
                axis,
                "direction",
                [
                    base,
                    config["concept"],
                    components.spec(
                        state,
                        fitted["suspension" if axis == "floor" else "chassis"],
                    )["id"],
                ],
                design_context(state, e, axis),
                (
                    "Рабочая высота днища ограничивает прижим. Проверим его профиль при расчётной нагрузке."
                    if axis == "floor"
                    else "При плотной компоновке радиатор может ограничивать теплоотвод."
                ),
                options,
                objection=(
                    "Причина может быть в сжатии подвески. Изменение профиля днища сузит диапазон рабочих высот."
                    if axis == "floor"
                    else "Ограничение может задавать сечение впуска. Увеличение радиатора займёт объём без прироста расхода воздуха."
                ),
            )


def session_topics(state, world, e, staff):
    eid = e["id"]
    for fact in sorted(
        state["council"]["observations"].values(), key=lambda f: f["reference"]
    ):
        if fact["entry"] != eid:
            continue
        a = drawing_for(state, fact["specification"])["slot"]
        reporter = (
            fact["author"]
            if fact["kind"] != "driver-feedback"
            else next(
                (
                    occupant_on(state["seats"][s["id"]], state["date"])
                    for s in world["assignments"].values()
                    if s["position"] == "race-engineer" and s["entry"] == eid
                ),
                None,
            )
        )
        observed = fact["observation"]
        if fact["kind"] == "track-measurement":
            observed += f" {fact['value']:g} ± {fact['uncertainty']:g} {fact['unit']} · {fact['conditions']}."
        row = build(
            state,
            world,
            e,
            staff,
            a,
            "session",
            [
                fact["reference"],
                fact["session"],
                fact["specification"],
                fact["instance"],
            ],
            observed,
            "Отклик машины может зависеть от сборки. Проверить "
            + INTERACTIONS[a]
            + ".",
            [study(e, a), keep()],
            initiator=reporter,
            importance=4,
        )
        if row and (analyst := analyst_for(state, world, e, fact)):
            precision = evaluate(state["people"][analyst], world, state["date"])[
                "values"
            ]["Точность"]
            proposed = test_option(
                e,
                a,
                fact["specification"],
                fact["specification"],
                "bench" if "bench" in methods(a) else "lab",
            )
            shared_observation = (
                f"{fact['value']:g} ± {fact['uncertainty']:g} {fact['unit']}."
                if fact["kind"] == "track-measurement"
                else fact["observation"]
            )
            row["options"].append(proposed)
            row["positions"].append(
                dict(
                    person=analyst,
                    stance="Анализ данных",
                    confidence=precision,
                    argument=f"{shared_observation} Один режим не позволяет отделить интеграцию от свойств узла. Предлагаю {proposed['title']}.",
                )
            )
        yield row


def research_topics(state, world, e, staff, projects):
    org, eid = e["org"], e["id"]
    for r in state["research"]["reports"].values():
        if (
            r["org"] != org
            or state["research"]["projects"][r["project"]].get("target_year")
            or state["research"]["projects"][r["project"]]["entry"] != eid
        ):
            continue
        a, b = r["axis"], r["baseline"]
        if not staff.get(METHODS[a][0]) or any(
            p["baseline"] == b
            and (p.get("kind") == "design" or p.get("candidate") == b)
            for p in projects
        ):
            continue
        options = [test_option(e, a, b, b, "calculation"), keep()]
        if r["outcome"] == "supported" and not development.restriction(
            state, world, e, a
        ):
            options.insert(
                0, design_option(state, world, e, a, b, staff[METHODS[a][0]])
            )
        elif r["outcome"] == "rejected":
            options.reverse()
        yield build(
            state,
            world,
            e,
            staff,
            a,
            "study",
            [r["id"], b],
            r["conclusion"],
            r["hypothesis"],
            options,
        )


def revision_topics(state, world, e, staff, projects):
    eid = e["id"]
    for p in projects:
        if (
            p["entry"] != eid
            or p.get("target_year")
            or not p.get("specification")
            or (p["disposition"] == "withdrawn" and not p["findings"])
        ):
            continue
        a, b, v = p["axis"], p["baseline"], p["specification"]
        if p["disposition"] == "withdrawn":
            if any(t["kind"] == "design" and t["baseline"] == v for t in projects):
                continue
            options = [keep(), study(e, a)]
            if staff.get(METHODS[a][0]) and not development.restriction(
                state, world, e, a
            ):
                options.insert(
                    0, design_option(state, world, e, a, v, staff[METHODS[a][0]])
                )
            findings = [state["development"]["projects"][ref] for ref in p["findings"]]
            yield build(
                state,
                world,
                e,
                staff,
                a,
                "withdrawal",
                [p["id"], v, *p["findings"]],
                " ".join(
                    t["report"]["finding"]
                    for t in findings
                    if t.get("report") and t["report"]["finding"]
                )
                or "Редакция отозвана по протоколу проверки.",
                "Отклонение повторится, если воспроизвести исходный чертёж. Проверим конструкцию и посадку узла.",
                options,
                importance=5,
            )
            continue
        if any(t.get("candidate") == v and not t["finished"] for t in projects):
            continue
        reports = protocols(state, e, b, v)
        result = verdict(reports, a)
        if p["disposition"] == "released" and result not in (
            "withdraw",
            "conflict",
        ):
            continue
        signs = [r["report"] for r in reports]
        observed = (
            " ".join(
                f"{r['metric']}: Δ {r['difference']:g} ± {r['uncertainty']:g}. {r['finding'] or ''}"
                for r in signs
            )
            or "КБ передало чертёж. Парной проверки ещё нет."
        )

        def review(release):
            return option(
                "review",
                "Допустить спецификацию" if release else "Отозвать спецификацию",
                "Открыть производство."
                if release
                else "Сохранить проверенный вариант.",
                "Допуск не гарантирует выигрыш на трассе."
                if release
                else "Возможен отказ от полезного решения.",
                dict(
                    project=p["id"],
                    disposition="released" if release else "withdrawn",
                ),
            )

        left = [
            m
            for m in ["calculation", "bench", "tunnel", "lab"]
            if m in methods(a) and m not in {t["method"] for t in reports}
        ]
        options = [review(False), keep()]
        if result == "release":
            options = [review(True), review(False)]
        elif (
            result == "withdraw"
            and staff.get(METHODS[a][0])
            and not development.restriction(state, world, e, a)
        ):
            options.insert(
                1, design_option(state, world, e, a, v, staff[METHODS[a][0]])
            )
        elif result != "withdraw" and left:
            options.insert(0, test_option(e, a, b, v, left[0]))
        diagnosis = (
            {
                "release": "Измеренный выигрыш превышает неопределённость. Проверить переносимость на эту машину.",
                "withdraw": "Проверка указывает на недостаток редакции. Сохранить исходную сборку до устранения причины.",
                "conflict": "Протоколы расходятся. Различие может возникать при взаимодействии узлов в сборке.",
                "uncertain": "Различие может объясняться погрешностью. Нужна независимая проверка.",
            }[result]
            if reports
            else "Собранный узел может отклониться от прогноза КБ."
        )
        dissent = (
            (
                f"Измерение охватывает {reports[-1]['report']['metric']}. Оно не исключает компромисса: "
                + INTERACTIONS[a]
                + "."
            )
            if reports
            else "Прогноз получен до испытаний; сопоставим его с результатом пары А/Б."
        )
        yield build(
            state,
            world,
            e,
            staff,
            a,
            "revision",
            [p["id"], v, *[t["id"] for t in reports]],
            observed,
            diagnosis,
            options,
            objection=dissent,
            importance=4,
        )


def fit_topics(state, world, e, staff, fitted):
    eid = e["id"]
    for a, iid in fitted.items():
        d = components.spec(state, iid)
        target = preferred(state, world, e, d)
        cond = components.condition(state, iid)
        if target["id"] == d["id"] and not replacement_due(state, iid):
            continue
        stock = sorted(
            components.stockroom(state, world, e),
            key=lambda instance: (
                components.condition(state, instance)["wear_ppm"],
                components.condition(state, instance)["distance_m"],
                instance,
            ),
        )
        spare = next(
            (
                i
                for i in stock
                if not replacement_due(state, i)
                and components.spec(state, i)["id"] == target["id"]
                and not components.allocation(state, world, e, i, stock)[0]
            ),
            None,
        )
        if spare:
            yield build(
                state,
                world,
                e,
                staff,
                a,
                "fit",
                [iid, spare],
                f"На машине №{e['number']} износ {cond['wear_ppm'] / 10000:g}%. На складе допущен {components.serial(spare)}.",
                "Замена восстановит доступный ресурс или вернёт согласованную сборку.",
                [
                    option(
                        "install",
                        "Установить со склада",
                        "Одна замена на указанной машине.",
                        "Свободный запас сократится.",
                        dict(entry=eid, instance=spare),
                    ),
                    keep(),
                ],
                initiator=staff.get("chief-mechanic"),
                importance=6,
            )


def resource_topics(state, world, org, staff_by_entry, studies, projects):
    for p in [*studies, *projects]:
        if (
            p["finished"]
            or not p["reason"]
            or not p["allocated_on"]
            or p["entry"] not in staff_by_entry
        ):
            continue
        e = world["entries"][p["entry"]]
        site = p.get("site_kind", "research")
        shared = state["estate"]["assets"]["shared:" + site]
        days = max(1, ceil((p["required"] - p["worked"]) / 24))
        peers = [
            q["id"]
            for q in [*studies, *projects]
            if q["id"] != p["id"]
            and not q["finished"]
            and (q["lead"] == p["lead"] or q.get("site_kind", "research") == site)
        ]

        if "слот" in p["reason"] and not research.facility(
            state, org, state["date"], facilities.later(state["date"], 1), site
        ):
            fee = facilities.quote(site, shared["country"])["daily_cents"] * days
            options = [
                option(
                    "lease",
                    "Арендовать рабочий слот",
                    f"До {days} рабочих смен.",
                    "При занятости специалиста часть аренды может остаться неиспользованной.",
                    dict(
                        facility=shared["id"],
                        start=state["date"],
                        days=days,
                        units=1,
                        mode="lease",
                    ),
                    site,
                    days * 24,
                    fee,
                ),
                keep(),
            ]
        elif peers and p["priority"] != "high":
            options = [
                option(
                    "priority",
                    "Дать работе высокий приоритет",
                    "Распределить следующую доступную смену по новой очереди.",
                    "Другой проект может завершиться позже.",
                    dict(project=p["id"], priority="high"),
                ),
                keep(),
            ]
        else:
            continue
        yield build(
            state,
            world,
            e,
            staff_by_entry[p["entry"]],
            p["axis"],
            "resources",
            [p["id"], *sorted(peers)],
            p["reason"],
            "Для завершения работы нужны ответственный специалист и "
            + facilities.TYPES[site][0].lower()
            + ".",
            options,
            importance=3,
            objection="Цена переноса зависит от оставшегося объёма: "
            + str(p["required"] - p["worked"])
            + " ч.",
        )


def workshop_topics(state, world, org, entries, staff_by_entry):
    for iid, item in state["production"]["items"].items():
        if (
            item["entry"] not in staff_by_entry
            or not item.get("rejected")
            or item["status"] != "inspection"
        ):
            continue
        e = world["entries"][item["entry"]]
        d = components.spec(state, iid)
        yield build(
            state,
            world,
            e,
            staff_by_entry[e["id"]],
            d["slot"],
            "inspection",
            [iid, item["batch"] or d["id"]],
            item.get("reason") or "ОТК отклонил экземпляр.",
            "Возможен дефект изготовления. Вывод о конструкции требует отдельной проверки.",
            [
                option(
                    "repair",
                    "Передать в ремонт",
                    "После ремонта — повторная приёмка.",
                    "Экземпляр может повторно не пройти контроль.",
                    dict(instance=iid, decision="repair"),
                    "factory",
                    8,
                    production.quote(d, False, False)["cents"] // 3,
                ),
                keep(),
            ],
            initiator=staff_by_entry[e["id"]].get("chief-mechanic"),
            importance=5,
        )
    for row in needs(state, world, org):
        if row["quantity"] <= 0 or row["entry"] not in staff_by_entry:
            continue
        e = world["entries"][row["entry"]]
        v = row["specification"]
        d = drawing_for(state, v)
        external = d["manufacturer"] != org
        if production.permitted(state, world, e, d, external):
            continue
        n = min(3, row["quantity"])
        unit = production.quote(d, False, external)
        # A new need may arise after a real installation or cancellation.
        previous = sorted(
            [
                (p["commissioned"], p["commission_revision"], p["id"])
                for p in state["production"]["batches"].values()
                if p["org"] == org and p["specification"] == v
            ]
        )
        sources = [v, *[p[2] for p in previous[-1:]]]
        if row["replace"]:
            sources.extend(
                sorted(
                    iid
                    for car in entries
                    for iid in components.mounting(state, car["id"]).values()
                    if components.spec(state, iid)["family"] == d["family"]
                    and replacement_due(state, iid)
                )
            )
        key = identifier(org, e["id"], row["slot"], "stock", *sources)
        if state["council"]["briefs"].get(key, {}).get("status") in (
            "rejected",
            "decided",
        ):
            continue
        yield build(
            state,
            world,
            e,
            staff_by_entry[e["id"]],
            row["slot"],
            "stock",
            sources,
            f"Машин {row['cars']}, запас {row['stock']}, в работе {row['pending']}, требуется замен {row['replace']}.",
            "При необходимости замены имеющегося запаса может не хватить.",
            [
                option(
                    "produce",
                    "Заказать партию",
                    f"После ОТК от 0 до {n} пригодных экз.",
                    "Партия занимает складские места и смены приёмки.",
                    dict(
                        entry=e["id"],
                        specification=v,
                        quantity=n,
                        priority="high" if row["replace"] else "normal",
                        rush=False,
                        outsource=external,
                    ),
                    "factory",
                    unit["hours"] * n,
                    unit["cents"] * n,
                ),
                keep(),
            ],
            objection=f"План уже учитывает {row['pending']} ожидаемых экземпляров. Для новой партии ещё нужны цех и приёмка.",
            initiator=row["mechanic"],
            importance=5 if row["replace"] else 1,
        )
        break
