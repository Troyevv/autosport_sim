"""Join entrant brands to operating teams and homologated packages to their suppliers."""

import csv
import json
from copy import deepcopy
from hashlib import sha256
from pathlib import Path

from . import VERSION

DATA = Path(__file__).parents[1] / "data/opening-2025"


def values(name):
    with (DATA / name).open(encoding="utf8", newline="") as stream:
        return list(csv.DictReader(stream))


def extend(original):
    from ..catalog import slug

    world = deepcopy(original)
    world["opening"] = VERSION
    orgs = world["organizations"]
    operators = json.loads((DATA / "operators.json").read_text())
    aliases = world["entrant_operators"] = {}
    for oid, (name, *brands) in operators.items():
        orgs[oid]["name"] = name
        for brand in brands:
            aliases[brand] = oid
            for series in orgs.pop(brand)["programs"]:
                if series not in orgs[oid]["programs"]:
                    orgs[oid]["programs"].append(series)

    def supplier(name, axis, series):
        oid = "supplier-" + slug(name)
        rec = orgs.setdefault(
            oid,
            dict(
                id=oid,
                name=name,
                kind="supplier",
                lines=[],
                programs=[],
                color="#647786",
            ),
        )
        if axis not in rec["lines"]:
            rec["lines"].append(axis)
        if series not in rec["programs"]:
            rec["programs"].append(series)
        return oid

    interfaces = json.loads(
        (DATA.parent / "2025-v4/component-interfaces.json").read_text()
    )
    products = {r["interface"]: r for r in values("products.csv")}
    programs = world["programs"] = {}
    for e in world["entries"].values():
        brand, series = e["org"], e["championship"]
        e["entrant"] = original["organizations"][brand]["name"]
        e["entrant_id"] = brand
        oid = e["org"] = aliases.get(brand, brand)
        e["program"] = f"{oid}:{series}"
        prog = programs.setdefault(
            e["program"],
            dict(id=e["program"], org=oid, championship=series, classes=[]),
        )
        if e["category"] not in prog["classes"]:
            prog["classes"].append(e["category"])
        car = world["cars"][e["car"]]
        package = products.get(interfaces.get(car["name"]))
        if package:
            for axis in ("engine", "transmission", "chassis"):
                car["suppliers"][axis] = supplier(package[axis], axis, series)
        if series == "f1":
            transmission = {
                "amr25": "Mercedes",
                "fw47": "Mercedes",
                "w16": "Mercedes",
                "sf25": "Ferrari",
                "vf25": "Ferrari",
                "rb21": "Red Bull Technology",
                "vcarb02": "Red Bull Technology",
            }.get(interfaces[car["name"]])
            if transmission:
                car["suppliers"]["transmission"] = supplier(
                    transmission, "transmission", series
                )
        world["engineering"]["concepts"][car["concept"]]["org"] = oid

    seats = world["assignments"]
    for aid, seat in list(seats.items()):
        if seat["org"] not in aliases:
            continue
        operator = aliases[seat["org"]]
        new_id = aid.replace(seat["org"], operator, 1)
        del seats[aid]
        seats.setdefault(new_id, dict(seat, id=new_id, org=operator))
        world["profiles"][seat["person"]]["position"] = seat["position"]

    world["entrant_names"] = {k: original["organizations"][k]["name"] for k in aliases}
    for row in values("bases.csv"):
        oid = row.pop("org")
        orgs[oid].update(row)

    # Allocate positions and distinct studio faces from the published reserve only.
    extras = []
    for oid, rec in orgs.items():
        if rec["kind"] == "supplier":
            roles = [
                "manufacturer",
                "chief-engineer",
                "chief-analyst",
                "analyst",
                "supply",
                "scout",
                "technical-advisor",
            ]
            roles.extend(
                world["products"][axis]["lead_position"] for axis in rec["lines"]
            )
            for role in roles:
                aid = f"{oid}:{role}"
                if aid not in seats:
                    extras.append((aid, oid, role, None))
            rec["playable"] = bool(set(rec["lines"]) - {"chassis"})
        elif set(rec["programs"]) - {"kart-ok", "kart-okj"}:
            if f"{oid}:supply" not in seats:
                extras.append((f"{oid}:supply", oid, "supply", None))
            for series in set(rec["programs"]) & {"f1", "wec"}:
                for duty in ("reserve", "test") if series == "f1" else ("reserve",):
                    extras.append((f"{oid}:{series}:{duty}", oid, "driver", series))

    for a in values("academies.csv"):
        oid, key = a["org"], a["id"]
        world["staff_rules"]["academies"][key] = dict(
            name=a["name"], org=oid, max_age=30, source=a["source"]
        )
        for role in world["staff_rules"]["academy_positions"]:
            extras.append((f"{oid}:{role}:{key}", oid, role, None))

    first = "Arno Dario Eli Finn Hugo Ivo Jules Kian Leon Luca Milo Niko Oskar Remy Sacha Teo Ada Alina Camille Elia Ines Iris Mara Vera".split()
    last = "Arven Belmar Corvin Derval Elmont Faber Granet Helven Isard Jorven Kerlen Lormer Morvan Norven Orsen Pellin".split()
    occupied = set(world["names"].values())
    faces = sorted(world["reserve"])
    for index, (aid, oid, role, series) in enumerate(sorted(extras)):
        raw = sha256(aid.encode()).digest()
        pid = "opening-" + raw.hex()[:16]
        skills = {
            k: 48 + sha256((aid + k).encode()).digest()[0] % 44
            for k in world["positions"][role]["skills"]
        }
        number = index
        while (
            name := first[number % len(first)]
            + " "
            + last[number // len(first) % len(last)]
        ) in occupied:
            number += 1
        occupied.add(name)
        face = faces[index]
        lo, hi = world["reserve_ages"].pop(face, (23, 40))
        age = lo + raw[0] % (hi - lo + 1)
        country = (
            orgs[oid]["base_country"]
            if raw[1] % 3
            else ("GB", "FR", "DE", "IT", "ES", "US", "JP")[raw[2] % 7]
        )
        world["reserve"].remove(face)
        world["names"][pid] = name
        world["profiles"][pid] = dict(
            id=pid,
            name=name,
            position=role,
            face=face,
            origin="generated",
            nationality=world["countries"][country],
            birth_date=f"{2024 - age}-{2 + raw[3] % 11:02d}-{2 + raw[4] % 26:02d}",
            experience=max(1, age - 19),
            potential=min(99, max(skills.values()) + raw[5] % 9),
            skills=skills,
            specialization=max(skills, key=skills.get),
            morale=70,
            fatigue=0,
            traits=[],
        )
        seat = seats[aid] = dict(
            id=aid, org=oid, series=series, entry=None, position=role, person=pid
        )
        if role == "driver":
            seat["duty"] = aid.rsplit(":", 1)[-1]
        elif role in world["staff_rules"]["academy_positions"]:
            seat["academy"] = aid.rsplit(":", 1)[-1]
    return world
