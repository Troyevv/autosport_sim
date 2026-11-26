"""Season dossiers. The opening homologation is pinned. Later bulletins are career rules."""

from ..components.catalog import OPENING, POLICIES
from ..components import mounting, spec
from ..components.design import LABELS
from ..domain import RuleError

# The simulated renewal concerns a different homologation group in each discipline.
GROUP = {"constructor": "floor", "standard": "chassis", "homologated": "brakes"}


# Dimension relative to the homologated model's opening drawing. These are simulation amendments.
LIMITS = {
    "floor": ("design_clearance_mm", "minimum", 95, "Рабочий просвет днища"),
    "chassis": ("mass_kg", "minimum", 98, "Масса шасси"),
    "brakes": ("total_torque_nm", "maximum", 105, "Суммарный тормозной момент"),
    "cooling": ("inlet_area_m2", "maximum", 105, "Сечение впуска радиатора"),
    "engine": ("peak_torque_nm", "maximum", 100, "Пиковый момент двигателя"),
}


def within_limit(entry, drawing):
    metric, bound, percent, _ = LIMITS[drawing["slot"]]
    opening = OPENING.specs[
        OPENING.stock[OPENING.installed[entry["id"]][drawing["slot"]]]["spec"]
    ]
    reference = opening["parameters"][metric] * percent / 100
    actual = drawing["parameters"][metric]
    return actual >= reference if bound == "minimum" else actual <= reference


def bulletin(world, entry, year):
    series = entry["championship"]
    mode = POLICIES[series]
    slot = (
        "engine"
        if series.startswith("kart-")
        else "cooling"
        if series == "wec"
        else GROUP[mode]
    )
    opening = world["cars"][entry["car"]]["regulation"]
    annual = f"{series}-{year}-{entry['category'].lower()}-v1"
    if year == 2025:
        return dict(
            id=opening,
            origin="Стартовый регламент",
            source=world["origin"]["sources"].get(
                {
                    "f1": "fia_rules",
                    "f2": "f2_rules",
                    "f3": "f3_rules",
                    "dtm": "dtm_rules",
                    "wec": "fia_rules",
                    "kart-ok": "kart-classes",
                    "kart-okj": "kart-classes",
                }.get(series, series)
            ),
            clarification="Допуск относится к модели, классу машины, интерфейсу и действующему договору поставки.",
            announced="2025-01-01",
            effective="2025-01-01",
            slot=None,
            freeze=None,
            mode=mode,
            text=world["championships"][series].get("technical_summary")
            or {
                "constructor": "Команда разрабатывает собственное шасси и аэродинамику. Силовая установка и шины — по договорам.",
                "standard": "Единое шасси. Команда работает с предписанными спецификациями.",
                "homologated": "Разрешены омологированные узлы заявленной модели и класса.",
            }[mode],
        )
    _, bound, percent, label = LIMITS[slot]
    threshold = "не менее" if bound == "minimum" else "не более"
    return dict(
        id="tech-" + annual + "-sim-1",
        base="tech-" + annual,
        source=None,
        clarification="Разъяснение комиссии. Протокол должен идентифицировать редакцию и целевую сборку. "
        "Для исключения по надёжности требуется диагностированный дефект зарегистрированного предшественника.",
        origin="Бюллетень симуляции",
        announced=f"{year - 1}-01-01",
        effective=f"{year}-01-01",
        freeze=f"{year}-03-01",
        slot=slot,
        mode=mode,
        text=f"{label} — {threshold} {percent}% значения в стартовом чертеже модели. {LABELS[slot]}. Обязательна регистрация спецификации для нового сезона. "
        "С 1 марта изменения зарегистрированной конструкции заморожены. "
        "Исправление выявленного дефекта допускается после проверки при сохранении номинальных характеристик.",
    )


def dossier(state, world, entry, year=None):
    year = year or int(state["date"][:4])
    opening = world["cars"][entry["car"]]
    rule = bulletin(world, entry, year)
    generation = rule.get("base", rule["id"]).removeprefix("tech-")
    key = f"{opening['concept']}@{year}"
    concepts = state.get("programme", {}).get("concepts", {})
    policy = concepts.get(key, {})
    prior = max(
        (k for k in concepts if k.startswith(opening["concept"] + "@") and k < key),
        default=None,
    )
    inherited = concepts[prior]["concept"] if prior else opening["concept"]
    return dict(
        id=key,
        year=year,
        season=f"{entry['championship']}-{year}",
        generation=generation,
        regulation=rule["id"],
        concept=policy.get("concept", inherited),
        strategy=policy.get("strategy", "continue"),
        rule=rule,
    )


def pin_concept(state, world, entry, year):
    plan = dossier(state, world, entry, year)
    state["programme"]["concepts"].setdefault(
        plan["id"], dict(concept=plan["concept"], strategy=plan["strategy"])
    )


def config_for(state, world, entry, year=None):
    if "supplier_axis" in entry:
        plan = dossier(state, world, entry, year)
        return dict(
            season=plan["season"],
            generation=plan["generation"],
            regulation=plan["regulation"],
            concept=f"{entry['org']}/{entry['supplier_axis']}/{OPENING.interfaces[entry['id']]}",
        )
    if "programme" not in state or (
        year is None
        and state["date"][:4] == "2025"
        and not state["programme"]["concepts"]
    ):
        return state["car_configurations"][entry["car"]]
    plan = dossier(state, world, entry, year)
    return {key: plan[key] for key in ("season", "generation", "regulation", "concept")}


def admitted_version(state, world, entry, drawing, year):
    plan = dossier(state, world, entry, year)
    rule = plan["rule"]
    base_rule = world["cars"][entry["car"]]["regulation"]
    if drawing["regulation"] not in (base_rule, plan["regulation"]):
        return False
    if (
        drawing.get("programme_concept")
        and drawing["programme_concept"] != plan["concept"]
    ):
        return False
    if drawing.get("reference") in state.get("development", {}).get("projects", {}):
        project = state["development"]["projects"][drawing["reference"]]
        if project.get("findings") or project.get("disposition") == "withdrawn":
            return False
    if drawing["slot"] != rule["slot"]:
        return True
    return drawing["id"] in state["programme"]["certificates"].get(plan["id"], {})


def certify(state, world, entry, year, version, actor):
    from ..components.registry import drawing_for
    from ..development import released

    plan = dossier(state, world, entry, year)
    rule = plan["rule"]
    d = drawing_for(state, version)
    if d["slot"] != rule["slot"] or d["interface"] != OPENING.interfaces[entry["id"]]:
        raise RuleError("Сертификат не относится к указанному узлу.")
    base_rule = world["cars"][entry["car"]]["regulation"]
    if not within_limit(entry, d):
        raise RuleError("Спецификация нарушает размерное ограничение бюллетеня.")
    original = d["id"] in OPENING.rules[base_rule]["approved"]
    tested = any(
        p["org"] == entry["org"]
        and p.get("candidate") == version
        and p.get("report")
        and p["regulation"] == plan["regulation"]
        and p["concept"] == plan["concept"]
        and (
            not d.get("reliability_fix")
            or p.get("method") in ("lab", "bench", "tunnel")
        )
        and not p["report"]["detected"]
        for p in state["development"]["projects"].values()
    )
    if not tested or not (
        original
        or (released(state, entry["org"], version) and d["regulation"] == rule["id"])
    ):
        raise RuleError(
            "Для омологации требуется допущенный чертёж и протокол проверки в целевой сборке."
        )
    certificates = state["programme"]["certificates"].get(plan["id"], {})
    if version in certificates:
        return
    if state["date"] >= rule["freeze"] and not (
        d.get("reliability_fix") and d.get("parent") in certificates
    ):
        raise RuleError(
            "Срок омологации истёк. Разрешено подтверждённое исправление надёжности."
        )
    state["programme"]["certificates"].setdefault(plan["id"], {})[version] = dict(
        date=state["date"], person=actor, regulation=rule["id"]
    )


def inspection(state, world, entry):
    """Eligibility for the future session producer, derived from the actual installed serials."""
    year = int(state["date"][:4])
    rule = bulletin(world, entry, year)
    return [
        dict(
            entry=entry["id"],
            instance=iid,
            specification=d["id"],
            rule=rule["id"],
            decision="Недопуск узла до предъявления разрешённой спецификации",
        )
        for iid in mounting(state, entry["id"]).values()
        if not admitted_version(state, world, entry, (d := spec(state, iid)), year)
    ]


def check_grid(state, world):
    """Record a technical exclusion once for the specific fitted serial and rule."""
    if state["date"][:4] == "2025":
        return
    from ..research import admitted

    book = state["programme"]["inspections"]
    for eid, entry in sorted(world["entries"].items()):
        if not admitted(state, entry):
            continue
        for failure in inspection(state, world, entry):
            key = failure["rule"] + "/" + eid + "/" + failure["instance"]
            if key not in book:
                book[key] = dict(**failure, date=state["date"], org=entry["org"])
