"""Design cases and metrology. Only the registry and trusted consumers see physical values."""

from hashlib import sha256

from ..components.catalog import parts_for
from ..components.design import assembly, development_margin
from ..components.registry import drawing_for, register_revision

# Primary physical quantity, direction of the design brief, coupled cost and direction.
TRADE = {
    "rear-wing": ("lift_area_m2", 1, "drag_area_m2", 1),
    "floor": ("lift_area_m2", 1, "design_clearance_mm", -1),
    "chassis": ("mass_kg", -1, "inlet_area_m2", -1),
    "suspension": ("wheel_rate_n_mm", 1, "mass_kg", 1),
    "cooling": ("rejection_kw", 1, "inlet_area_m2", 1),
    "brakes": ("total_torque_nm", 1, "mass_kg", 1),
    "engine": ("power_kw", 1, "heat_kw", 1),
    "transmission": ("input_limit_nm", 1, "mass_kg", 1),
    "tyre": ("friction_coefficient", 1, "mass_kg", 1),
}
# Equipment, operator fee in EUR cents, quota for one paired session in F1.
TESTS = {
    "calculation": ("Инженерный расчёт", "design", 64000, {}),
    "lab": ("Лабораторная проверка", "bench", 118000, {}),
    "bench": ("Нагрузочный стенд", "bench", 185000, {}),
    "cfd": ("CFD", "cfd", 235000, {"cfd_geometries": 2, "cfd_milli_mauh": 400}),
    "tunnel": (
        "Аэродинамическая труба",
        "tunnel",
        390000,
        {"runs": 2, "wind_on_minutes": 40, "occupancy_minutes": 120},
    ),
}
AERO = {"floor", "rear-wing"}
LAB_METRIC = {
    "rear-wing": "mass_kg",
    "floor": "design_clearance_mm",
    "chassis": "inlet_area_m2",
    "suspension": "static_clearance_mm",
    "brakes": "mass_kg",
    "cooling": "inlet_area_m2",
    "engine": "heat_kw",
    "transmission": "efficiency",
    "tyre": "vertical_rate_n_mm",
}
STRUCTURAL = {"suspension", "brakes", "engine", "tyre", "transmission", "cooling"}
ASSEMBLY_METRIC = {
    "floor": "lift_area_m2",
    "rear-wing": "lift_area_m2",
    "cooling": "thermal_margin_kw",
    "chassis": "mass_kg",
    "suspension": "clearance_mm",
    "tyre": "brake_force_n",
    "brakes": "brake_force_n",
    "engine": "sustainable_wheel_kw",
    "transmission": "sustainable_wheel_kw",
}


def methods(axis):
    candidates = ["calculation", "lab"]
    if axis in AERO:
        candidates.extend(["cfd", "tunnel"])
    if axis in STRUCTURAL:
        candidates.append("bench")
    return candidates


def sample(seed, key, channel):
    digest = sha256(f"design-1|{seed}|{key}|{channel}".encode()).digest()
    return int.from_bytes(digest[:4], "big") / 2**32


def estimate(state, base):
    if base["id"] in parts_for(state).specs:
        return base["parameters"]  # Published nominal opening drawing.
    project = (
        state.get("development", {}).get("projects", {}).get(base.get("reference"))
    )
    if not project:
        return estimate(state, drawing_for(state, base["parent"]))
    return {k: (lo + hi) / 2 for k, (lo, hi) in project["forecast"].items()}


def forecast(state, base, project, ability):
    values = dict(estimate(state, base))
    # Later revisions start from the engineer's estimate and available measurements.
    for ref in project["test_inputs"]:
        protocol = state["development"]["projects"][ref]
        report = protocol["report"]
        if protocol["method"] != "calculation" and report["metric"] in values:
            values[report["metric"]] = report["b"]["value"]
    evidence, brief = project["evidence"], project["brief"]
    from ..manufacturer.profile import trade, parameters

    primary, sign, coupled, penalty = (
        trade(project) if project.get("objective") else TRADE[base["slot"]]
    )
    if project.get("objective"):
        values = parameters(base["slot"], values, base["life_m"])
    belief = max((r["confidence"] for r in evidence), default=0)
    effort = (0.04 if brief == "performance" else 0.018) / (1 + base["refinements"])
    attitude = {"supported": 1, "inconclusive": 0, "rejected": -1}
    if evidence:
        effort *= 1 + sum(
            attitude[r["outcome"]] * r["confidence"] for r in evidence
        ) / (300 * len(evidence))
    model = {
        k: {"parameters": estimate(state, drawing_for(state, v))}
        for k, v in project["assembly"].items()
    }

    def response(step):
        trial = dict(values)
        trial[primary] *= 1 + sign * step
        trial[coupled] *= 1 + penalty * step * 0.65
        return assembly(model | {base["slot"]: {"parameters": trial}})

    before, trial = response(0), response(effort)
    # Check collateral losses against the current package, independently of the headline metric.
    adverse = max(
        0.0,
        (before["sustainable_wheel_kw"] - trial["sustainable_wheel_kw"])
        / before["sustainable_wheel_kw"],
        (before.get("lift_area_m2", 0) - trial.get("lift_area_m2", 0))
        / max(0.01, before.get("lift_area_m2", 0)),
        (trial["drag_area_m2"] - before["drag_area_m2"]) / before["drag_area_m2"],
    )
    integration = 1 / (1 + (18 if brief == "balanced" else 5) * adverse)
    effort *= integration
    project["integration"] = integration
    project["package_forecast"] = {
        k: round(v - before[k], 5)
        for k, v in response(effort).items()
        if v != before[k]
    }
    width = (0.016 + (100 - ability) / 1400) * (1 - belief / 300)
    result = {}
    for metric, value in values.items():
        change = {primary: sign * effort, coupled: penalty * effort * 0.65}.get(
            metric, 0
        )
        center = value * (1 + change)
        result[metric] = [
            round(center * (1 - width), 6),
            round(center * (1 + width), 6),
        ]
    if brief == "reliability":
        project["package_forecast"] = {}
        return {
            metric: [round(value * (1 - width), 6), round(value * (1 + width), 6)]
            for metric, value in values.items()
        }
    return result


def finish_design(state, project, quality):
    base = drawing_for(state, project["baseline"])
    seed, axis, key = state["setup"]["seed"], project["axis"], project["id"]
    margin = development_margin(seed, project["concept"], axis, base["refinements"])
    from ..manufacturer.profile import trade, parameters

    primary, sign, coupled, penalty = trade(project)
    risk = project["brief"] == "performance"
    effect = margin * (quality / 100 + sample(seed, key, "solution") * 1.25 - 0.85)
    effect *= project["integration"]
    previous = state["development"]["projects"].get(base.get("reference"), {})
    diagnosed = any(
        state["development"]["projects"][ref]["report"]["detected"]
        for ref in project["test_inputs"]
    )
    # Unrecognised parent defects can persist. A documented diagnosis guides the redesign.
    inherited = previous.get("latent_defect", False) and sample(
        seed, key, "inherit"
    ) < (0.12 if diagnosed else 0.72)
    defect = inherited or sample(seed, key, "defect") < (110 - quality) / (
        210 if risk else 420
    )
    nominal_life = drawing_for(state, base["family"] + "/1")["life_m"]
    params = dict(base["parameters"])
    if project.get("objective"):
        params = parameters(axis, params, base["life_m"])
    params[primary] *= 1 + sign * (
        effect * (1 if risk else 0.6) - defect * margin * 0.65
    )
    params[coupled] *= 1 + penalty * margin * (
        0.28 + sample(seed, key, "packaging")
    ) * (1 if risk else 0.45)
    version = 1 + max(
        d["version"]
        for pool in (parts_for(state).specs, state["components"]["revisions"])
        for d in pool.values()
        if d["family"] == base["family"]
    )
    result = register_revision(
        state,
        parent=base["id"],
        version=version,
        title=f"Проектная редакция {version}",
        parameters=params,
        life_m=round(
            params.get("design_life_km", nominal_life / 1000)
            * 1000
            * (0.82 if defect else 1)
        ),
        visual=base["visual"],
        author=project["lead"],
        reference=key,
        refinement=True,
    )
    if project.get("target_year") or project["regulation"] != base["regulation"]:
        drawing = state["components"]["revisions"][result]
        drawing.update(
            regulation=project["regulation"], programme_concept=project["concept"]
        )
        from ..programme.packages import PAIRS

        if "skill" in project:
            drawing.pop("programme_concept", None)
        dependency = project["assembly"].get(PAIRS[axis])
        if dependency in state["components"]["revisions"]:
            drawing["requires"] = {PAIRS[axis]: dependency}
    if project["brief"] == "reliability":
        drawing = state["components"]["revisions"][result]
        drawing.update(parameters=dict(base["parameters"]), reliability_fix=True)
    project.update(specification=result, disposition="review", latent_defect=defect)


def measure(state, p, quality):
    method, axis = p["method"], p["axis"]
    seed, key = state["setup"]["seed"], p["id"]
    from ..manufacturer.profile import trade, parameters

    primary = trade(p)[0]
    parts = {
        slot: drawing_for(state, version) for slot, version in p["assembly"].items()
    }
    # Both specimens use this frozen assembly and one calibration. For aero, divide
    # the two measured loads by their respective q to compare equivalent lift areas.
    output = {}
    tolerance = (0.008 + (100 - quality) / 1400) * (
        1.35 if method == "calculation" else 1
    )
    calibration = (sample(seed, key, "calibration") - 0.5) * tolerance
    for label, version in (("a", p["baseline"]), ("b", p["candidate"])):
        drawing = drawing_for(state, version)
        parts[axis] = drawing
        metric = primary
        values = drawing["parameters"]
        if p.get("objective"):
            values = parameters(axis, values, drawing["life_m"])
        value = values[primary]
        q = None
        if method == "calculation":
            metric = ASSEMBLY_METRIC[axis]
            value = assembly(parts)[metric]
        elif method == "lab":
            metric = LAB_METRIC[axis]
            value = drawing["parameters"][metric]
        elif method in ("cfd", "tunnel"):
            q = 1480 + round(40 * sample(seed, key, label + "pressure"))
        error = (sample(seed, key, label) * 2 - 1) * tolerance + calibration
        raw = value * (q or 1) * (1 + error)
        output[label] = dict(
            specification=version,
            raw=round(raw, 6),
            pressure_pa=q,
            value=round(raw / (q or 1), 6),
        )
    delta = output["b"]["value"] - output["a"]["value"]
    uncertainty = tolerance * (abs(output["a"]["value"]) + abs(output["b"]["value"]))
    # The signed raw readings remain available when the engineer over- or underestimates resolution.
    resolution = uncertainty * (
        1 + (sample(seed, key, "analysis") * 2 - 1) * (100 - quality) / 100
    )
    interpretation = (
        "Различие в пределах погрешности."
        if abs(delta) <= resolution
        else "У варианта Б значение выше."
        if delta > 0
        else "У варианта Б значение ниже."
    )
    source = state["development"]["projects"].get(drawing.get("reference"))
    detected = bool(
        source
        and source["latent_defect"]
        and method in ("bench", "lab", "tunnel")
        and sample(seed, key, "diagnosis") < quality / 100
    )
    if detected:
        source["findings"].append(key)
    return dict(
        **output,
        metric=metric,
        difference=round(delta, 6),
        uncertainty=round(uncertainty, 6),
        interpretation=interpretation,
        detected=detected,
        finding=(
            {
                "rear-wing": "Недостаточная жёсткость крепления крыла под нагрузкой.",
                "floor": "Деформация панели нарушает рабочий просвет.",
                "chassis": "Локальное превышение напряжения в силовом элементе.",
                "suspension": "Недостаточный запас прочности рычага.",
                "cooling": "Нестабильный теплоотвод при расчётном расходе.",
                "brakes": "Тепловая деформация при нагрузочном цикле.",
                "transmission": "Недостаточный запас прочности при пиковом моменте.",
            }.get(axis, "Сниженный запас ресурса в расчётном режиме.")
            if detected
            else None
        ),
        conditions=(
            "Один макет и конфигурация. Нагрузка приведена к площади по скоростному напору."
            if q
            else "Одна конфигурация и номинальный расчётный режим."
            if method == "calculation"
            else "Одинаковые крепления, калибровка и температура 20 °C."
        ),
    )
