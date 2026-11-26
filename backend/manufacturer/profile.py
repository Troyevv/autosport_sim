"""Engineering estimates at a rated load, extended for supplier-owned design cases."""

from ..development.physics import TRADE

# Each target changes a physical quantity and its coupled cost. Units are in the keys.
QUESTIONS = {
    "output": "Какой прирост производительности достижим при допустимых массе и тепловой нагрузке?",
    "thermal": "Можно ли снизить тепловую нагрузку без существенной потери отдачи?",
    "economy": "Можно ли снизить удельный расход топлива без существенного роста массы?",
    "durability": "Можно ли увеличить ресурс и сохранить номинальные характеристики?",
    "shift": "Можно ли сократить время переключения в допустимом тепловом режиме?",
    "wet": "Как отвод воды влияет на доступное сцепление на сухой поверхности?",
    "warmup": "Можно ли сократить энергию прогрева без ускорения износа?",
}
TARGETS = {
    "engine": {
        "output": TRADE["engine"],
        "thermal": ("heat_kw", -1, "power_kw", -1),
        "economy": ("fuel_g_kwh", -1, "mass_kg", 1),
        "durability": ("design_life_km", 1, "mass_kg", 1),
    },
    "transmission": {
        "output": TRADE["transmission"],
        "shift": ("shift_ms", -1, "loss_heat_kw", 1),
        "thermal": ("loss_heat_kw", -1, "mass_kg", 1),
        "durability": ("design_life_km", 1, "mass_kg", 1),
    },
    "tyre": {
        "output": TRADE["tyre"],
        "wet": ("water_clearance_l_s", 1, "friction_coefficient", -1),
        "warmup": ("warmup_kj", -1, "wear_mm_100km", 1),
        "durability": ("wear_mm_100km", -1, "friction_coefficient", -1),
    },
}


def parameters(slot, base, life_m):
    if "design_life_km" in base:
        return dict(base)
    # Original design cases retained for replay of older careers.
    mass = base["mass_kg"]
    values = {"design_life_km": life_m / 1000}
    if slot == "engine":
        values.update(fuel_g_kwh=245, cooling_flow_kg_s=base["heat_kw"] / 70)
    elif slot == "transmission":
        values.update(
            first_ratio=3.15,
            top_ratio=0.82,
            shift_ms=48,
            loss_heat_kw=base["input_limit_nm"] * 0.6 * (1 - base["efficiency"]),
        )
    else:
        values.update(
            window_low_c=75,
            window_high_c=105,
            wear_mm_100km=0.7,
            warmup_kj=mass * 80,
            max_load_n=mass * 240,
            water_clearance_l_s=mass * 0.24,
        )
    return values | base


def trade(project):
    return (
        TARGETS[project["axis"]][project["objective"]]
        if project.get("objective")
        else TRADE[project["axis"]]
    )
