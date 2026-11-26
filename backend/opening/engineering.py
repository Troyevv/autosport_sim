"""Rated, dry design cases. Values are simulation estimates, never track measurements."""

# Brake-specific fuel consumption g/kWh, shift interruption ms, dry tyre window °C,
# tread loss mm/100 km, engine/gearbox/tyre inspection intervals km.
ENVELOPES = {
    "F1": (194, 25, 85, 115, 0.95, 5800, 6200, 170),
    "F2": (255, 64, 78, 105, 0.82, 8500, 6500, 220),
    "F3": (271, 72, 73, 98, 0.69, 9500, 7800, 260),
    "F4": (267, 92, 62, 88, 0.49, 11500, 9000, 390),
    "FR": (258, 76, 68, 94, 0.61, 10500, 8400, 330),
    "GT3": (279, 78, 64, 91, 0.48, 16500, 12500, 370),
    "LMGT3": (276, 82, 65, 92, 0.36, 22000, 17500, 610),
    "Hypercar": (225, 48, 70, 100, 0.35, 15000, 12700, 640),
    "OK": (464, 0, 47, 70, 0.77, 440, 0, 105),
    "OK-Junior": (489, 0, 43, 65, 0.62, 570, 0, 130),
}

# Relative thermal duty of rated architecture, not a ranking of constructors.
THERMAL = {
    "huracan": 1.035,
    "r8": 1.035,
    "m4": 0.975,
    "296": 0.96,
    "amg": 1.045,
    "vantage": 0.985,
    "720s": 0.98,
    "mustang": 1.04,
    "rcf": 1.03,
    "z06": 1.025,
    "valkyrie": 1.085,
    "9x8": 0.985,
    "gr010": 0.975,
    "499p": 0.965,
    "vseries": 1.06,
    "963": 1.015,
    "bmw-v8": 1.025,
    "a424": 0.985,
}
F1_ENGINES = {
    "supplier-ferrari": 0.99,
    "supplier-honda-rbpt": 1.012,
    "supplier-mercedes": 0.982,
    "supplier-renault": 1.02,
}
KART_ENGINES = {
    "supplier-iame": 1.018,
    "supplier-tm-kart": 0.987,
    "supplier-vortex": 1.006,
}
TYRES = {
    "supplier-hankook": (-3, 0.92),
    "supplier-goodyear": (-2, 0.95),
    "supplier-michelin": (2, 0.94),
}


def specification(category, interface, maker, slot, physical):
    fuel, shift, low, high, wear, engine, gears, tyre = ENVELOPES[category]
    thermal = THERMAL.get(interface, 1)
    if category == "F1":
        thermal = F1_ENGINES.get(maker, 1)
    if category.startswith("OK"):
        thermal = KART_ENGINES.get(maker, 1)
    # Tyres from the same regulated supply are identical across chassis interfaces.
    if slot == "tyre":
        delta, abrasion = TYRES.get(maker, (0, 1))
        life = round(tyre / abrasion)
        mass = physical["mass_kg"]
        physical.update(
            window_low_c=low + delta,
            window_high_c=high + delta,
            wear_mm_100km=round(wear * abrasion, 3),
            warmup_kj=round(mass * (high - low) * 1.8, 2),
            max_load_n=round(mass * (330 if category == "F1" else 265), 1),
            water_clearance_l_s=round(mass * 0.025, 3),
        )
    elif slot == "engine":
        life = round(engine / thermal)
        heat = physical["heat_kw"] * thermal
        physical.update(
            heat_kw=round(heat, 2),
            fuel_g_kwh=round(fuel * thermal, 1),
            cooling_flow_kg_s=round(heat / (4.18 * 17), 3),
        )
    elif slot == "transmission":
        life = round(gears / thermal)
        speed = (
            {
                "supplier-mercedes": 0.975,
                "supplier-ferrari": 1.018,
                "supplier-red-bull-technology": 0.99,
            }.get(maker, 1)
            if category == "F1"
            else thermal
        )
        physical.update(
            first_ratio=round(3.3 * speed, 2),
            top_ratio=round(0.86 / speed, 2),
            shift_ms=round(shift * speed, 1),
            loss_heat_kw=round(
                physical["input_limit_nm"] * 0.6 * (1 - physical["efficiency"]) * speed,
                3,
            ),
        )
    else:
        life = round(
            engine
            * {"brakes": 0.23, "cooling": 2, "suspension": 1.6, "chassis": 4}.get(
                slot, 1.35
            )
        )
        if slot == "cooling":
            physical["rejection_kw"] *= thermal
    if slot in {"tyre", "engine", "transmission"}:
        physical["design_life_km"] = life
    return life * 1000
