"""Pinned opening drawings and physical stock. IDs are scoped to one career."""

import json
from pathlib import Path
from dataclasses import dataclass
from hashlib import sha256

from ..catalog import LINEUP_WORLD as WORLD, slug
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


def build(world):
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
                life_m=250000 if slot == "tyre" else 5000000,
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
