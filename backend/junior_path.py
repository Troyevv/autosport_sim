"""Federation decisions consumed by the personnel system and replayed with the save."""

from datetime import date
from itertools import combinations
from typing import Annotated, Literal

from pydantic import Field

from .domain import RuleError
from .staff_input import Day, Fields, Id


class LicenceDecision(Fields):
    person: Id
    licence: Literal[
        "ITG",
        "ITF",
        "ITE",
        "ITD-C",
        "ITC-C",
        "ITB",
        "ITA",
        "MSUK-F4",
        "ACI-F4",
        "RFEDA-F4",
    ]
    issued: Day
    expires: Day
    reference: Id


class SeasonClassification(Fields):
    """Confirmed annual placing after the sporting authority applies its eligibility rules."""

    person: Id
    season: Id
    place: int = Field(ge=1)
    certified_points: float = Field(ge=0, le=25, multiple_of=0.1)
    first_race_starters: dict[Id, Annotated[int, Field(ge=1)]] = Field(min_length=1)
    reference: Id


def accept_once(records, key, fact):
    if key in records and records[key] != fact:
        raise RuleError("Для этого решения уже сохранён другой факт.", 409)
    records[key] = fact


def kart_grade_valid(grade, age):
    limits = {"ITG": (12, 14), "ITF": (14, 15), "ITE": (15, 150)}
    low, high = limits.get(grade, (0, 150))
    return low <= age <= high


def record(state, world, action, args):
    reserve = state.get("junior_reserve", {})
    incoming = args["person"] in reserve
    person = state["people"].get(args["person"]) or reserve.get(args["person"])
    if not person or person["position"] != "driver":
        raise RuleError("Требуется действующий профиль пилота.")
    credentials = person["credentials"]
    if action == "issued-licence":
        decision = LicenceDecision.model_validate(args)
        start, end = map(date.fromisoformat, [decision.issued, decision.expires])
        if not start <= date.fromisoformat(state["date"]) < end:
            raise RuleError("Проверьте даты выдачи и окончания лицензии.")
        year_age = start.year - int(person["birth_date"][:4])
        if not kart_grade_valid(decision.licence, year_age):
            raise RuleError("Возраст вне допуска для этой категории лицензии.")
        if incoming and decision.licence != "ITG":
            raise RuleError("Для регистрации юниора требуется допуск OK-Junior.")
        accept_once(
            credentials.setdefault("issued", {}), decision.reference, args.copy()
        )
        if incoming:
            state["people"][person["id"]] = reserve.pop(person["id"])
            state["notices"].append(
                dict(
                    date=state["date"],
                    text=person["name"] + " · зарегистрирован допуск OK-Junior",
                )
            )
        return

    standing = SeasonClassification.model_validate(args)
    season = world["engineering"]["seasons"].get(standing.season, {})
    series = season.get("championship")
    rules = world["championships"].get(series, {})
    rounds = [
        e
        for e in world["events"]
        if e["season_id"] == standing.season and e["kind"] == "round"
    ]
    if (
        not rounds
        or state["date"] < rounds[-1]["end"]
        or (not rules.get("superlicence") and series not in {"f1", "f2", "f3"})
    ):
        raise RuleError("Сезон ещё не завершён или отсутствует шкала баллов.")
    official = [e for e in rounds if e["id"] in standing.first_race_starters]
    if len(official) != len(standing.first_race_starters):
        raise RuleError("Протокол содержит этап другого сезона.")
    starts = state["starts"].get(person["id"], {}).values()
    attended = {
        e["id"]
        for e in official
        for v in starts
        if v.get("series") == series and e["start"] <= v["day"] <= e["end"]
    }
    if not attended:
        raise RuleError("В сезоне нет подтверждённых стартов пилота.")
    scale = rules.get("superlicence", [])
    maximum = scale[standing.place - 1] if standing.place <= len(scale) else 0
    karting = rules["discipline"] == "Karting"
    first_grid = min(standing.first_race_starters.values())
    factor = max(0, 10 - max(0, 16 - first_grid))
    layouts = {e.get("layout_id", e["track_id"]) for e in official}
    if not karting and (len(official) < 5 or len(layouts) < 3):
        factor = 0
    from .personnel import age_on

    if any(
        v.get("series") in {"f4-es", "f4-gb", "f4-it"}
        and 0 <= int(state["date"][:4]) - int(v["day"][:4]) <= 2
        and age_on(person, v["day"]) < 15
        for v in starts
    ):
        factor = 0
    if standing.certified_points * 10 > maximum * factor:
        raise RuleError("Баллы превышают предел итоговой классификации и допуска.")
    fact = dict(
        **args,
        version=1,
        series=series,
        rounds_attended=sorted(attended),
        complete=len(attended) * 5 >= len(official) * 4
        if series == "freca"
        else len(attended) == len(official),
        karting=karting,
        start=rounds[0]["start"],
        end=rounds[-1]["end"],
        rules_id=rules["rules_id"],
    )
    accept_once(credentials.setdefault("classifications", {}), standing.season, fact)


def licences_on(credentials, day):
    return set(credentials["licences"]) | {
        r["licence"]
        for r in credentials.get("issued", {}).values()
        if r["issued"] <= day < r["expires"]
    }


def points_on(credentials, day):
    """Keep awarded facts indefinitely. Count at most two non-overlapping series a year."""
    year = int(day[:4])
    by_year = {}
    for row in credentials.get("classifications", {}).values():
        age = year - int(row["end"][:4])
        if row["end"] <= day and age < (5 if row["karting"] else 3):
            by_year.setdefault(int(row["end"][:4]), []).append(row)
    # Retain alternatives until the cross-year limit of 12 karting points is applied.
    totals = {0: 0}
    for rows in by_year.values():
        choices = [
            (),
            *((r,) for r in rows),
            *(
                (a, b)
                for a, b in combinations(rows, 2)
                if a["end"] < b["start"] or b["end"] < a["start"]
            ),
        ]
        updated = {}
        for selection in choices:
            kart = sum(r["certified_points"] for r in selection if r["karting"])
            other = sum(r["certified_points"] for r in selection if not r["karting"])
            for previous, score in totals.items():
                capped = min(12, previous + kart)
                updated[capped] = max(updated.get(capped, 0), score + other)
        totals = updated
    return round(credentials["points"] + max(k + v for k, v in totals.items()), 1)
