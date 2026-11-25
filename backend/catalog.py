"""Immutable, version-pinned sporting facts. Save-specific estimates live in domain."""

import csv
import json
import re
import unicodedata
from pathlib import Path

from .engineering import technical_catalog
from .supply import tyre_eligible

VERSION = "2025-v1"
DATA = Path(__file__).with_name("data") / VERSION


def slug(text):
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub("[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def rows(name):
    with (DATA / name).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def load_catalog():
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    rules = json.loads((DATA / "rules.json").read_text(encoding="utf-8"))
    positions = json.loads((DATA / "positions.json").read_text(encoding="utf-8"))
    organizations, names, entries, cars, events, assignments = {}, {}, {}, {}, [], {}
    programs = {}

    def organization(name, kind, series, line=None):
        oid = kind + "-" + slug(name)
        org = organizations.setdefault(
            oid, dict(id=oid, name=name, kind=kind, programs=[], lines=[])
        )
        if series not in org["programs"]:
            org["programs"].append(series)
        if line and line not in org["lines"]:
            org["lines"].append(line)
        return oid

    def seat(org, position, person=None, series=None, entry=None):
        key = ":".join(
            filter(
                None,
                [
                    org,
                    position,
                    series,
                    entry,
                    person if position == "driver" else None,
                ],
            )
        )
        if org not in organizations or position not in positions:
            raise ValueError(f"Неизвестная организация или должность: {key}")
        assignments[key] = dict(
            id=key,
            org=org,
            position=position,
            series=series,
            entry=entry,
            person=person,
        )

    def identify(name):
        pid = "person-" + slug(name)
        names[pid] = name
        return pid

    for row in rows("entries.csv"):
        series, number = row["championship"], row["number"]
        eid = series + "-" + number
        org = organization(row["entrant"], "team", series)
        components = {
            key: organization(row[key], "supplier", series, key)
            for key in products
            if row.get(key)
        }
        policy = rules[series]["tyre_market"][row["class"]]
        if not tyre_eligible(policy, components["tyre"], homologated=True):
            raise ValueError(f"Недопустимый поставщик шин для {eid}")
        pid = org + ":" + series
        programs.setdefault(pid, dict(id=pid, org=org, championship=series, classes=[]))
        if row["class"] not in programs[pid]["classes"]:
            programs[pid]["classes"].append(row["class"])
        crew = [identify(n) for n in row["crew"].split("|")]
        entries[eid] = dict(
            id=eid,
            championship=series,
            program=pid,
            org=org,
            number=number,
            crew=crew,
            car="car-" + eid,
            category=row["class"],
        )
        cars["car-" + eid] = dict(
            id="car-" + eid,
            name=row["model"],
            constructor=row["constructor"],
            suppliers=components,
        )
        for driver in crew:
            seat(org, "driver", driver, series, eid)
        seat(org, "race-engineer", series=series, entry=eid)

    for org, rec in organizations.items():
        if rec["kind"] == "team":
            for pos in ("manager", "owner", "chief-engineer", "scout"):
                seat(org, pos)
            for series in rec["programs"]:
                for pos in (
                    "aero",
                    "chassis",
                    "reliability",
                    "performance",
                    "strategist",
                    "chief-mechanic",
                ):
                    seat(org, pos, series=series)
        else:
            for pos in [
                "manufacturer",
                "chief-engineer",
                "chief-analyst",
                "analyst",
                "supply",
                "scout",
                "technical-advisor",
                *(products[line]["lead_position"] for line in rec["lines"]),
            ]:
                seat(org, pos)
    for row in rows("staff.csv"):
        eid = row["entry"]
        seat(
            row["org"],
            row["position"],
            identify(row["name"]),
            entries[eid]["championship"] if eid else None,
            eid or None,
        )

    config = json.loads((DATA / "engineering.json").read_text(encoding="utf-8"))
    engineering = technical_catalog(rules, entries, cars, config)
    for item in config["preseason"]:
        events.append(
            dict(
                **item,
                season_id=item["series"] + "-2025",
                track_id=slug(item["circuit"]),
                sessions=[
                    "Презентация"
                    if item["kind"] == "presentation"
                    else "Тестовые заезды"
                ],
            )
        )
    rounds = dict.fromkeys(rules, 0)
    for row in rows("calendar.csv"):
        series = row["series"]
        rounds[series] += 1
        events.append(
            dict(
                **row,
                kind="round",
                sessions=rules[series]["sessions"][row["format"]],
                id=f"2025-{series}-r{rounds[series]:02}",
                round=rounds[series],
                track_id=slug(row["circuit"]),
                season_id=f"{series}-2025",
            )
        )
    for series, rule in rules.items():
        rule.update(
            id=series, season_id=f"{series}-2025", rules_id=f"{VERSION}-{series}"
        )
    return dict(
        version=VERSION,
        engineering=engineering,
        products=products,
        origin=json.loads((DATA / "sources.json").read_text(encoding="utf-8")),
        championships=rules,
        organizations=organizations,
        programs=programs,
        names=names,
        positions=positions,
        entries=entries,
        cars=cars,
        assignments=assignments,
        events=sorted(events, key=lambda e: (e["start"], e["id"])),
    )


WORLD = load_catalog()

# Version 1 replays the published name and ID byte-for-byte. Display the
# corrected spelling without changing a saved world, the RNG or the photo ID.
DISPLAY_NAMES = {**WORLD["names"], "person-louis-hamilton": "Lewis Hamilton"}
