"""Steady bench load cases. These are design calculations, independent of a circuit."""

from math import exp
from .profile import parameters

CASES = {
    "rated": ("Номинальный режим", 1.0, 90.0, 0.0),
    "cold": ("Холодный узел", 0.55, 40.0, 0.0),
    "wet": ("Влажное покрытие", 0.75, 65.0, 1.0),
}


def operating_point(slot, values, life_m, case):
    _, load, temperature, water = CASES[case]
    p = parameters(slot, values, life_m)
    if slot == "engine":
        shaft = p["power_kw"] * load
        fuel = shaft * p["fuel_g_kwh"] / 1000
        return dict(
            shaft_kw=shaft,
            torque_nm=p["peak_torque_nm"] * load,
            fuel_kg_h=fuel,
            thermal_efficiency=shaft / (fuel * 43 / 3.6),
            required_cooling_kw=p["heat_kw"] * load,
        )
    if slot == "transmission":
        torque = p["input_limit_nm"] * load
        return dict(
            first_output_nm=torque * p["first_ratio"] * p["efficiency"],
            top_output_nm=torque * p["top_ratio"] * p["efficiency"],
            mechanical_loss_kw=p["loss_heat_kw"] * load,
            shift_interruption_ms=p["shift_ms"] * (1 + (1 - load) * 0.12),
        )
    deviation = max(
        0, p["window_low_c"] - temperature, temperature - p["window_high_c"]
    )
    temperature_factor = exp(-deviation / 90)
    water_factor = 1 / (1 + water * 3 / max(0.01, p["water_clearance_l_s"]))
    force = (
        p["max_load_n"]
        * load
        * p["friction_coefficient"]
        * temperature_factor
        * water_factor
    )
    return dict(
        contact_force_n=force,
        tread_loss_mm_100km=p["wear_mm_100km"] * load**1.3 * (1 + deviation / 90),
        warmup_energy_kj=p["warmup_kj"] * max(0, p["window_low_c"] - temperature) / 55,
    )
