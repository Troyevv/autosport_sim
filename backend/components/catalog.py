"""Pinned opening drawings and physical stock. IDs are scoped to one career."""

import json
from pathlib import Path
from math import pi
from dataclasses import dataclass
from hashlib import sha256
from functools import lru_cache

from ..catalog import LINEUP_WORLD as WORLD, SEASON_LINEUP, slug
from ..opening.engineering import specification
from .design import parameters

VERSION = "2025-parts-v1"
POLICIES = {
    "f1": "constructor",
    "f2": "standard",
    "f3": "standard",
    "f4-it": "standard",
    "f4-gb": "standard",
    "f4-es": "standard",
    "freca": "standard",
    "dtm": "homologated",
    "wec": "homologated",
    "kart-ok": "homologated",
    "kart-okj": "homologated",
}


@dataclass
class Opening:
    specs: dict
    stock: dict
    installed: dict
    interfaces: dict
    by_org: dict
    rules: dict


# Total hydraulic torque at four wheels, T = 2 p A mu r per caliper.
# Rated pressure (MPa), summed one-side piston area over four calipers
# (mm²), friction coefficient and effective friction radius (m).
CARBON_BRAKES = {
    "F1": (13.0, 8800, 0.52, 0.134),
    "F2": (10.0, 7800, 0.48, 0.125),
}
# Peak shaft torque in Nm. F2 and F4 are published specifications.
# F3 and FR are estimates consistent with P = Tω at their rated power rpm.
FORMULA_TORQUE = {"F2": 570, "F3": 365, "F4": 270, "FR": 335}
# Homologated front wing planform (m²) and section-averaged lift coefficient.
FRONT_WINGS = {
    "F1": (1.45, 1.35),
    "F2": (1.14, 1.10),
    "F3": (0.95, 1.05),
    "FR": (0.80, 0.92),
    "F4": (0.68, 0.85),
}


def build(world, *, revised=False):
    specs, stock, fitted, interfaces, by_org = {}, {}, {}, {}, {}
    rules = {}
    models = json.loads(
        (
            Path(__file__).parents[1] / "data/2025-v4/component-interfaces.json"
        ).read_text(encoding="utf-8")
    )
    for e in world["entries"].values():
        eid, org, car = e["id"], e["org"], world["cars"][e["car"]]
        series, category = e["championship"], e["category"]
        interface = (
            car["suppliers"]["chassis"]
            if series in ("kart-ok", "kart-okj")
            else models[car["name"]]
        )
        interfaces[eid] = interface
        reg = car["regulation"]
        constructor = car["suppliers"].get("chassis") or "constructor-" + slug(
            car["constructor"]
        )
        open_design = POLICIES[series] == "constructor"
        rule = rules.setdefault(
            reg,
            dict(
                mode=POLICIES[series],
                team_slots=(
                    {
                        "rear-wing",
                        "floor",
                        "chassis",
                        "suspension",
                        "cooling",
                        "brakes",
                        "transmission",
                    }
                    if open_design
                    else set()
                ),
                approved=set(),
            ),
        )
        # Independent, pinned packaging, spring-platform and aerodynamic choices.
        digest = sha256(car["concept"].encode()).digest()
        choices = [b / 255 for b in digest[:3]] if open_design else [0, 0, 0]
        fitted[eid] = {}
        for slot, physical in parameters(category, *choices).items():
            maker = car["suppliers"].get(slot, org if open_design else constructor)
            family = f"{reg}/{interface}/{maker}/{slot}"
            version = family + "/1"
            if revised and category in FORMULA_TORQUE:
                torque = FORMULA_TORQUE[category]
                if slot == "engine":
                    physical["peak_torque_nm"] = torque
                if slot == "transmission":
                    physical["input_limit_nm"] = torque * 1.16
            life_m = (
                specification(category, interface, maker, slot, physical)
                if world.get("opening")
                else 250000
                if slot == "tyre"
                else 5000000
            )
            if revised and slot == "brakes" and category in CARBON_BRAKES:
                pressure, area, friction, radius = CARBON_BRAKES[category]
                physical["total_torque_nm"] = round(
                    2 * pressure * area * friction * radius, 2
                )
            if revised and slot == "chassis" and category in FRONT_WINGS:
                area, coefficient = FRONT_WINGS[category]
                lift_area = area * coefficient
                span = {"F1": 2.0, "F2": 1.9, "F3": 1.89, "F4": 1.73, "FR": 1.85}[
                    category
                ]
                physical["front_lift_area_m2"] = lift_area
                # Finite-wing induced drag at the homologated incidence.
                physical["base_drag_area_m2"] += lift_area**2 / (pi * 0.85 * span**2)
            drawing = dict(
                id=version,
                family=family,
                version=1,
                slot=slot,
                refinements=0,
                manufacturer=maker,
                regulation=reg,
                interface=interface,
                parameters=physical,
                life_m=life_m,
                visual=None,
                title="Базовая спецификация",
            )
            rule["approved"].add(version)
            if specs.setdefault(version, drawing) != drawing:
                raise ValueError(f"Conflicting opening drawing {version}")
            instance = f"{eid}/{slot}/01"
            stock[instance] = dict(spec=version, org=org)
            fitted[eid][slot] = instance
            spare = f"{org}/{family}/spare"
            stock[spare] = dict(spec=version, org=org)
            if open_design and slot == "rear-wing":
                variant = family + "/2"
                specs[variant] = dict(
                    specs[version],
                    id=variant,
                    version=2,
                    title="Низкое сопротивление",
                    parameters=dict(
                        physical,
                        lift_area_m2=physical["lift_area_m2"] * 0.78,
                        drag_area_m2=physical["drag_area_m2"] * 0.68,
                    ),
                    visual=f"2025-v1/{interface}/rear-wing/low-1",
                )
                stock[f"{org}/{variant}/spare"] = dict(spec=variant, org=org)
    for iid, item in stock.items():
        by_org.setdefault(item["org"], []).append(iid)
    return Opening(specs, stock, fitted, interfaces, by_org, rules)


OPENING = build(WORLD)
SEASON_PARTS = build(SEASON_LINEUP, revised=True)


@lru_cache(maxsize=1)
def legacy_season():
    return build(SEASON_LINEUP)


def parts_for(state):
    if not state or not state.get("opening"):
        return OPENING
    if state.get("components", {}).get("catalog") == "2025-parts-v2":
        return legacy_season()
    return SEASON_PARTS
