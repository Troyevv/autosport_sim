"""2025-v1 engineering design envelopes. Values are game estimates in SI units.

The static load case is a design calculation, independent of any track or session.
"""

from hashlib import sha256

from ..domain import RuleError

# Component groups account for an unfuelled assembly without driver or ballast.
# chassis includes bodywork, cockpit and ancillary systems; tyre is a matched set.
# Total mass kg, power kW, design heat rejection kW, wing lift area m².
ENVELOPES = {
    "F1": (720, 735, 340, 1.35),
    "F2": (720, 456, 240, 1.08),
    "F3": (635, 283, 165, 0.95),
    "F4": (505, 132, 80, 0.58),
    "FR": (600, 200, 115, 0.78),
    "GT3": (1290, 390, 215, 0.68),
    "LMGT3": (1310, 375, 210, 0.68),
    "Hypercar": (1030, 500, 260, 0.87),
    "OK": (82, 31, 17, 0),
    "OK-Junior": (76, 23, 14, 0),
}
LABELS = {
    "rear-wing": "Заднее антикрыло",
    "chassis": "Шасси и кузов",
    "floor": "Днище",
    "suspension": "Подвеска",
    "cooling": "Система охлаждения",
    "engine": "Силовая установка",
    "transmission": "Трансмиссия",
    "tyre": "Комплект шин",
    "brakes": "Тормоза",
}


def parameters(category, packaging, platform, aero):
    mass, power, heat, wing = ENVELOPES[category]
    kart = wing == 0
    cooling = heat * (1.08 - packaging * 0.04)
    torque = power * 1.15 if not kart else power * 0.77
    parts = {
        "chassis": dict(
            mass_kg=mass * 0.46,
            base_drag_area_m2=0.46 if not kart else 0.32,
            inlet_area_m2=(heat / 1700) * (1 - packaging * 0.05),
        ),
        "cooling": dict(
            mass_kg=mass * 0.055, rejection_kw=cooling, inlet_area_m2=heat / 1700
        ),
        "engine": dict(
            mass_kg=mass * 0.21, power_kw=power, heat_kw=heat, peak_torque_nm=torque
        ),
        "tyre": dict(
            mass_kg=mass * 0.055,
            vertical_rate_n_mm=mass * 0.95,
            loaded_radius_m=0.14 if kart else 0.33,
            friction_coefficient=1.4,
        ),
        "brakes": dict(
            mass_kg=mass * 0.035, total_torque_nm=mass * (1.5 if kart else 6)
        ),
    }
    if kart:
        parts["chassis"]["mass_kg"] += mass * 0.185
        return parts
    parts.update(
        {
            "rear-wing": dict(
                mass_kg=mass * 0.015,
                lift_area_m2=wing * (1 + 0.08 * aero),
                drag_area_m2=wing * 0.21,
            ),
            "floor": dict(
                mass_kg=mass * 0.04,
                lift_area_m2=wing * (1.8 - 0.1 * aero),
                design_clearance_mm=32 if category in ("F1", "F2", "F3") else 52,
            ),
            "suspension": dict(
                mass_kg=mass * 0.055,
                wheel_rate_n_mm=mass * (0.35 + 0.1 * platform),
                static_clearance_mm=(54 if category in ("F1", "F2", "F3") else 74),
            ),
            "transmission": dict(
                mass_kg=mass * 0.075, efficiency=0.96, input_limit_nm=torque * 1.16
            ),
        }
    )
    return parts


def assembly(parts):
    """Equivalent whole-vehicle rates, nominal q=1.5 kPa and full cooling airflow."""
    p = {slot: spec["parameters"] for slot, spec in parts.items()}
    chassis, engine, radiator = p["chassis"], p["engine"], p["cooling"]
    flow = min(1, chassis["inlet_area_m2"] / radiator["inlet_area_m2"])
    rejection = radiator["rejection_kw"] * flow
    result = dict(
        mass_kg=sum(v["mass_kg"] for v in p.values()),
        thermal_margin_kw=rejection - engine["heat_kw"],
        sustainable_wheel_kw=engine["power_kw"]
        * min(1, rejection / engine["heat_kw"])
        * p.get("transmission", {}).get("efficiency", 1),
        drag_area_m2=chassis["base_drag_area_m2"] + chassis["inlet_area_m2"] * 0.55,
    )
    if "rear-wing" in p:
        wing, floor, spring = p["rear-wing"], p["floor"], p["suspension"]
        load = 1500 * (wing["lift_area_m2"] + floor["lift_area_m2"])
        compression = load * (
            1 / spring["wheel_rate_n_mm"] + 1 / p["tyre"]["vertical_rate_n_mm"]
        )
        clearance = spring["static_clearance_mm"] - compression
        factor = max(
            0,
            1
            - abs(clearance - floor["design_clearance_mm"])
            / floor["design_clearance_mm"],
        )
        result.update(
            clearance_mm=clearance,
            lift_area_m2=wing["lift_area_m2"] + floor["lift_area_m2"] * factor,
            drag_area_m2=result["drag_area_m2"] + wing["drag_area_m2"],
        )
    normal_load = result["mass_kg"] * 9.80665 + 1500 * result.get("lift_area_m2", 0)
    result["brake_force_n"] = min(
        p["brakes"]["total_torque_nm"] / p["tyre"]["loaded_radius_m"],
        normal_load * p["tyre"]["friction_coefficient"],
    )
    return {k: round(v, 4) for k, v in result.items()}


def development_margin(seed, concept, axis, completed_steps):
    """Increment of the dimensionless design envelope, for a future R&D producer."""
    if axis not in LABELS or type(completed_steps) is not int or completed_steps < 0:
        raise RuleError("Некорректное направление или глубина развития.")
    digest = sha256(f"potential-v1|{seed}|{concept}|{axis}".encode()).digest()
    ceiling = 0.08 + 0.24 * int.from_bytes(digest[:2], "big") / 65535
    return ceiling / ((completed_steps + 1) * (completed_steps + 2))
