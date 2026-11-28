"""Freeze trusted installed drawings and serials at session admission (physics v1)."""

from dataclasses import asdict, dataclass
from math import isfinite

from .drivers import career_driver, profile
from .. import components
from ..catalog import SEASON_LINEUP, lineup_for
from ..components.catalog import SEASON_PARTS
from ..manufacturer.profile import parameters
from ..programme.rules import config_for
from ..supplier_engineering import agreement


# Estimated chassis envelope, CG, driver/ballast, gear count, redline and final
# reduction. Power, drag, downforce, grip and dry mass come from the serials.
@dataclass(frozen=True)
class Chassis:
    length: float
    width: float
    height: float
    wheelbase: float
    cg_height: float
    front_weight: float
    driver_mass: float
    gears: int
    redline: int
    final_drive: float
    tank_kg: float


CLASSES = {
    "F1": Chassis(5.60, 2.0, 0.96, 3.55, 0.31, 0.455, 82, 8, 13200, 5.3, 110),
    "F2": Chassis(5.28, 1.90, 1.10, 3.14, 0.32, 0.45, 80, 6, 8750, 4.1, 95),
    "F3": Chassis(4.97, 1.89, 1.04, 2.99, 0.32, 0.45, 80, 6, 8500, 4.25, 80),
    "F4": Chassis(4.75, 1.73, 0.99, 2.75, 0.33, 0.44, 70, 6, 6900, 4.15, 42),
    "FR": Chassis(4.80, 1.85, 1.04, 2.85, 0.32, 0.44, 75, 6, 6800, 3.8, 62),
    "GT3": Chassis(4.85, 2.04, 1.22, 2.78, 0.43, 0.49, 80, 6, 8000, 4.35, 86),
    "LMGT3": Chassis(4.85, 2.04, 1.22, 2.78, 0.43, 0.49, 80, 6, 8000, 4.35, 90),
    "Hypercar": Chassis(5.05, 2.0, 1.07, 3.10, 0.36, 0.46, 80, 7, 8500, 3.8, 84),
    "OK": Chassis(1.90, 1.40, 0.68, 1.05, 0.27, 0.43, 68, 1, 16000, 8.6, 6),
    "OK-Junior": Chassis(1.90, 1.40, 0.66, 1.05, 0.26, 0.43, 69, 1, 14000, 8.9, 6),
}
CORNERS = ("fl", "fr", "rl", "rr")
# Relative to the mounted tyre drawing: peak mu, abrasion, water capacity,
# operating window shift in Celsius and usable rubber thickness in mm.
COMPOUNDS = {
    "hard": (0.96, 0.73, 0.45, 6, 3.5),
    "medium": (1.0, 1.0, 0.45, 0, 3.5),
    "soft": (1.045, 1.38, 0.45, -5, 3.5),
    "supersoft": (1.065, 1.60, 0.45, -8, 3.5),
    "slick": (1.0, 1.0, 0.45, 0, 3.5),
    "intermediate": (0.94, 1.50, 6.0, -18, 4.5),
    "wet": (0.87, 1.85, 15.0, -30, 6.0),
}
FORMULA_COMPOUNDS = {
    f"C{i + 1}": (0.94 + 0.024 * i, 0.68 + 0.19 * i, 0.45, 8 - 3 * i, 3.5)
    for i in range(6)
}
COMPOUNDS.update(FORMULA_COMPOUNDS)


def compounds(category):
    if category == "F1":
        return (*FORMULA_COMPOUNDS, "intermediate", "wet")
    if category in {"F2", "F3"}:
        return ("medium", "soft", "hard", "supersoft", "wet")
    if category == "Hypercar":
        return ("medium", "soft", "hard", "wet")
    return ("slick", "wet")


def setup_for(category, changes=None):
    kart = category.startswith("OK")
    formula = category in {"F1", "F2", "F3", "F4", "FR"}
    # Normalised wing incidence and radiator opening. Offsets in mm, cold
    # gauge pressure in kPa and fractions for brake/roll distribution.
    settings = dict(
        wing=1.0,
        ride_mm=0.0,
        spring=1.0,
        antiroll=0.50,
        differential=1.0 if kart else 0.45,
        bias=0.0 if kart else 0.57,
        pressure=95.0 if kart else 145.0,
        cooling=1.0,
    )
    limits = {"pressure": (65, 130) if kart else (110, 185), "cooling": (0.78, 1.20)}
    if not kart:
        limits.update(
            wing=(0.72, 1.26) if formula else (0.88, 1.14),
            ride_mm=(-10.0, 15.0) if formula else (-6.0, 10.0),
            spring=(0.8, 1.25),
            antiroll=(0.35, 0.67),
            differential=(0.12, 0.88),
            bias=(0.48, 0.68),
        )
    limits.update({f"pressure_{wheel}": limits["pressure"] for wheel in CORNERS})
    for key, value in (changes or {}).items():
        if (
            key not in limits
            or type(value) not in (int, float)
            or not limits[key][0] <= value <= limits[key][1]
        ):
            raise ValueError(f"Setting outside {category} envelope: {key}")
        settings[key] = value
    pressure = settings.pop("pressure")
    settings["cold_kpa"] = [
        settings.pop(f"pressure_{wheel}", pressure) for wheel in CORNERS
    ]
    return settings


def freeze(
    entry, car, generation, parts, condition, contracts, setup, compound, fuel, temp
):
    category = entry["category"]
    chassis = CLASSES[category]
    kart = category.startswith("OK")
    choices = compounds(category)
    compound = compound or ("C3" if category == "F1" else choices[0])
    if compound not in choices:
        raise ValueError(f"Compound unavailable for {category}")
    if fuel is None:
        fuel = chassis.tank_kg * 0.40
    if not isfinite(fuel) or not 0 <= fuel <= chassis.tank_kg or not -30 <= temp <= 180:
        raise ValueError("Invalid starting fuel or tyre temperature")
    settings = setup_for(category, setup)
    p = {slot: drawing["parameters"] for slot, (_, drawing) in parts.items()}
    for slot in {"engine", "tyre", "transmission"} & p.keys():
        p[slot] = parameters(slot, p[slot], parts[slot][1]["life_m"])
    e, t = p["engine"], p["tyre"]
    box = p.get("transmission", {})
    spring = p.get("suspension", {})
    wing = p.get("rear-wing", {})
    floor = p.get("floor", {})
    gt = category in {"GT3", "LMGT3"}
    lmh = car["name"] in {"Ferrari 499P", "Toyota GR010 - Hybrid", "Peugeot 9X8"}
    hybrid = category == "Hypercar" and car["name"] != "Aston Martin Valkyrie"
    motor = 120 if category == "F1" else (200 if lmh else 50) if hybrid else 0
    grip, wear, drain, shift, tread = COMPOUNDS[compound]
    spec = asdict(chassis)
    del spec["tank_kg"]
    spec.update(
        id=entry["id"],
        dry_mass=sum(v["mass_kg"] for v in p.values()),
        power_kw=e["power_kw"],
        torque_nm=e["peak_torque_nm"],
        heat_kw=e["heat_kw"],
        bsfc=e["fuel_g_kwh"],
        flow_kg_s=e["cooling_flow_kg_s"],
        radiator_kw=p["cooling"]["rejection_kw"],
        radiator_inlet=p["cooling"]["inlet_area_m2"],
        inlet=p["chassis"]["inlet_area_m2"],
        base_drag=p["chassis"]["base_drag_area_m2"],
        front_area=p["chassis"].get("front_lift_area_m2", 0),
        wing_area=wing.get("lift_area_m2", 0),
        wing_drag=wing.get("drag_area_m2", 0),
        floor_area=floor.get("lift_area_m2", 0),
        design_mm=floor.get("design_clearance_mm", 25),
        static_mm=spring.get("static_clearance_mm", 25),
        spring_rate=spring.get("wheel_rate_n_mm", t["vertical_rate_n_mm"]),
        tyre_rate=t["vertical_rate_n_mm"],
        brake_nm=p["brakes"]["total_torque_nm"],
        radius=t["loaded_radius_m"],
        mu=t["friction_coefficient"],
        efficiency=box.get("efficiency", 0.98),
        input_nm=box.get("input_limit_nm", e["peak_torque_nm"]),
        first_ratio=box.get("first_ratio", 1.0),
        top_ratio=box.get("top_ratio", 1.0),
        shift_s=box.get("shift_ms", 0) * 0.001,
        gear_heat=box.get("loss_heat_kw", 0),
        low_c=t["window_low_c"] + shift,
        high_c=t["window_high_c"] + shift,
        wear_rate=t["wear_mm_100km"],
        warmup_kj=t["warmup_kj"],
        max_load=t["max_load_n"],
        water_flow=t["water_clearance_l_s"],
        motor_kw=motor,
        battery_kj=4000 if category == "F1" else 4800 if hybrid else 0,
        deploy_floor=190 / 3.6 if lmh else 0,
        lap_deploy_kj=4000 if category == "F1" else 0,
        lap_regen_kj=2000 if category == "F1" else 0,
        compound_grip=grip,
        compound_wear=wear,
        compound_drain=drain,
        tread_mm=tread,
        abs=gt,
        drs=category in {"F1", "F2", "F3"},
        kart=kart,
        **settings,
    )
    set_id = parts["tyre"][0]
    tyres = [
        dict(
            surface=temp,
            core=temp,
            wear=condition["wear_ppm"] / 1e6,
            degradation=0.0,
            grain=0.0,
            blister=0.0,
            flat=0.0,
            cycles=0,
            hot=False,
            punctured=condition["damaged"],
        )
        for _ in CORNERS
    ]
    manifest = {
        slot: dict(
            manufacturer=drawing["manufacturer"],
            product=slot,
            component=drawing["family"],
            specification=drawing["id"],
            version=str(drawing["version"]),
            instance=iid,
        )
        for slot, (iid, drawing) in parts.items()
    }
    return dict(
        spec=spec,
        start=dict(
            v=8.0 if kart or gt or category == "Hypercar" else 0.0,
            fuel=fuel,
            energy=spec["battery_kj"],
            heading=0.0,
            tyres=tyres,
        ),
        entry=entry["id"],
        car=car["id"],
        org=entry["org"],
        series=entry["championship"],
        category=category,
        configuration=dict(generation),
        components=manifest,
        contracts=contracts,
        tyre_set=set_id,
        wheel_ids=[f"{set_id}/{wheel}" for wheel in CORNERS],
        compound=compound,
    )


def opening_vehicle(entry_id, *, setup=None, compound=None, fuel=None, temp=25.0):
    """Technical inspection of published starting serials without opening a career."""
    entry = SEASON_LINEUP["entries"][entry_id]
    car = SEASON_LINEUP["cars"][entry["car"]]
    parts = {
        slot: (iid, SEASON_PARTS.specs[SEASON_PARTS.stock[iid]["spec"]])
        for slot, iid in SEASON_PARTS.installed[entry_id].items()
    }
    config = {k: car[k] for k in ("season", "generation", "regulation", "concept")}
    result = freeze(
        entry,
        car,
        config,
        parts,
        dict(wear_ppm=0, damaged=False),
        {},
        setup,
        compound,
        fuel,
        temp,
    )

    person = SEASON_LINEUP["profiles"][entry["crew"][0]]
    result["driver"] = profile(person, person["skills"], None)
    return result


def career_vehicle(
    state,
    entry_id,
    *,
    setup=None,
    compound=None,
    fuel=None,
    temp=25.0,
    driver=None,
    wet=False,
):
    """Admit the fitted configuration on the date of the authoritative career state."""
    world = lineup_for(state)
    entry = world["entries"][entry_id]
    fitted = components.mounting(state, entry_id)
    parts = {slot: (iid, components.spec(state, iid)) for slot, iid in fitted.items()}
    contracts = {}
    for slot, (iid, drawing) in parts.items():
        if (
            not components.compatible(state, world, entry, drawing)
            or components.condition(state, iid)["damaged"]
        ):
            raise ValueError(f"Ineligible fitted serial {iid}")
        if slot in {"engine", "tyre", "transmission"} and "market" in state:
            contract = agreement(state, world, entry, slot)
            if contract and contract["maker"] == drawing["manufacturer"]:
                contracts[slot] = contract["id"]
    result = freeze(
        entry,
        world["cars"][entry["car"]],
        config_for(state, world, entry),
        parts,
        components.condition(state, fitted["tyre"]),
        contracts,
        setup,
        compound,
        fuel,
        temp,
    )
    result["driver"] = career_driver(state, world, entry, driver, wet)
    result["day"] = state["date"]
    return result
