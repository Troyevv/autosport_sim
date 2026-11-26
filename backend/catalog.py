"""Immutable, version-pinned sporting facts. Save-specific estimates live in domain."""

import csv
import json
from hashlib import sha256
import re
import unicodedata
from pathlib import Path

from .engineering import technical_catalog
from .supply import tyre_eligible

VERSION = "2025-v4"
JUNIORS = Path(__file__).with_name("data") / VERSION
DATA = Path(__file__).with_name("data") / "2025-v1"
ROSTER = DATA.parent / "2025-v2"


def slug(text):
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub("[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def rows(name, directory=DATA):
    with (directory / name).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def load_catalog(*, legacy=False, previous=False, personnel=False):
    version = (
        "2025-v1"
        if legacy
        else ("2025-v2" if previous else "2025-v3" if personnel else VERSION)
    )
    expanded = version == VERSION
    palette = (
        {}
        if legacy
        else json.loads((ROSTER / "kit-colors.json").read_text(encoding="utf-8"))
    )
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    rules = json.loads((DATA / "rules.json").read_text(encoding="utf-8"))
    if expanded:
        products["chassis"] = dict(name="Шасси", lead_position="chassis")
        rules.update(json.loads((JUNIORS / "rules.json").read_text()))
        palette.update(json.loads((JUNIORS / "colors.json").read_text()))
    positions = json.loads((DATA / "positions.json").read_text(encoding="utf-8"))
    organizations, names, entries, cars, events, assignments = {}, {}, {}, {}, [], {}
    programs = {}

    def organization(name, kind, series, line=None):
        oid = kind + "-" + slug(name)
        org = organizations.setdefault(
            oid, dict(id=oid, name=name, kind=kind, programs=[], lines=[])
        )
        if not legacy:
            org["color"] = "#" + palette[oid][0]
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

    grid = rows("entries.csv", DATA if legacy else ROSTER)
    if expanded:
        grid.extend(rows("entries.csv", JUNIORS))
    for row in grid:
        series, number = row["championship"], row["number"]
        eid = series + "-" + number
        org = organization(row["entrant"], "team", series)
        components = {
            key: organization(row[key], "supplier", series, key)
            for key in products
            if row.get(key)
        }
        if "superlicence" in rules[series]:
            constructor = {
                "KR": "Kart Republic",
                "LN": "OTK Kart Group",
                "Tony Kart": "OTK Kart Group",
                "Exprit": "OTK Kart Group",
                "Monster Kart": "Monster K",
                "Birel Art": "Birel ART",
            }.get(row["constructor"], row["constructor"])
            components["chassis"] = organization(
                constructor, "supplier", series, "chassis"
            )
        policy = rules[series]["tyre_market"][row["class"]]
        if not tyre_eligible(policy, components["tyre"], homologated=True):
            raise ValueError(f"Недопустимый поставщик шин для {eid}")
        pid = org + ":" + series
        programs.setdefault(pid, dict(id=pid, org=org, championship=series, classes=[]))
        if row["class"] not in programs[pid]["classes"]:
            programs[pid]["classes"].append(row["class"])
        crew = (
            [identify(n) for n in row["crew"].split("|")]
            if legacy
            else row["crew"].split("|")
        )
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
        seat(
            org,
            "chief-mechanic"
            if rules[series].get("playable") is False
            else "race-engineer",
            series=series,
            entry=eid,
        )

    for org, rec in organizations.items():
        if rec["lines"] == ["chassis"]:
            rec["playable"] = False
        if rec["kind"] == "team":
            for pos in ("manager", "owner", "chief-engineer", "scout"):
                seat(org, pos)
            for series in rec["programs"]:
                if rules[series].get("playable") is False:
                    continue
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
    for row in rows("staff.csv") if legacy else ():
        eid = row["entry"]
        seat(
            row["org"],
            row["position"],
            identify(row["name"]),
            entries[eid]["championship"] if eid else None,
            eid or None,
        )

    profiles = {}
    if not legacy:
        profiles = json.loads((ROSTER / "people.json").read_text(encoding="utf-8"))
        for key, assignment in assignments.items():
            if assignment["person"] is None:
                assignment["person"] = "staff-" + sha256(key.encode()).hexdigest()[:12]
        if expanded:
            profiles.update(json.loads((JUNIORS / "people.json").read_text()))
        names = {pid: p["name"] for pid, p in profiles.items()}
        expected = {a["person"] for a in assignments.values()}
        if expected != names.keys():
            raise ValueError("Штатные назначения расходятся с каталогом людей")
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
    calendar = rows("calendar.csv")
    if expanded:
        calendar.extend(rows("calendar.csv", JUNIORS))
        events.extend(json.loads((JUNIORS / "invitational.json").read_text()))
    for row in calendar:
        series = row["series"]
        if "layout" in row:
            row["name"] = row["circuit"] + " · " + row["layout"]
            row["layout_id"] = slug(row["circuit"]) + ":" + slug(row["layout"])
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
            id=series, season_id=f"{series}-2025", rules_id=f"{version}-{series}"
        )
    if not legacy:
        for ser, rule in rules.items():
            rule.setdefault("governing_body", "DMSB" if ser == "dtm" else "FIA")
        rules["dtm"]["organizer"] = "ADAC"
        rules["wec"]["organizer"] = "ACO"
    origin = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
    if not legacy:
        for historic_staff_source in ("staff", "wec_staff"):
            origin["sources"].pop(historic_staff_source, None)
    world = dict(
        version=version,
        profiles=profiles,
        reserve_ages={}
        if legacy
        else json.loads((ROSTER / "reserve-ages.json").read_text(encoding="utf-8")),
        reserve=[]
        if legacy
        else json.loads((ROSTER / "reserve.json").read_text(encoding="utf-8")),
        engineering=engineering,
        products=products,
        origin=origin,
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

    if expanded:
        for prospect in json.loads((JUNIORS / "intake.json").read_text()):
            world["profiles"][prospect["id"]] = prospect
            world["names"][prospect["id"]] = prospect["name"]
    if version in ("2025-v3", VERSION):
        from .staff_catalog import extend

        extend(world)
    if expanded:
        world["origin"]["sources"].update(
            json.loads((JUNIORS / "sources.json").read_text())
        )
        world["staff_rules"]["backing"].extend(
            json.loads((JUNIORS / "backing.json").read_text())
        )
    return world


WORLD = load_catalog()


def lineup_catalog(world):
    """Optional posts belong to a career, separately from the published starting grid."""
    assignments = dict(world["assignments"])
    for program in world["programs"].values():
        for duty in ("reserve", "test"):
            aid = f"{program['id']}:{duty}"
            if aid in assignments:
                continue
            assignments[aid] = dict(
                id=aid,
                position="driver",
                org=program["org"],
                series=program["championship"],
                entry=None,
                person=None,
                duty=duty,
            )
    for seat in world["assignments"].values():
        if seat["position"] == "driver" and seat["entry"]:
            aid = seat["id"] + ":relief"
            assignments[aid] = dict(
                seat, id=aid, entry=None, person=None, duty="relief"
            )
    return dict(world, assignments=assignments)


LINEUP_WORLD = lineup_catalog(WORLD)


from .opening.catalog import extend as opening_catalog  # noqa: E402

SEASON = opening_catalog(WORLD)
SEASON_LINEUP = lineup_catalog(SEASON)


def base_catalog(state):
    return SEASON if state.get("opening") else WORLD


def lineup_for(state):
    return SEASON_LINEUP if state.get("opening") else LINEUP_WORLD


def career_catalog(state, world):
    if "lineup" in state:
        return lineup_for(state)
    return world
