"""Frozen pre-development rules, exclusively for replay before a save migration boundary."""

from .domain import RuleError
from .personnel import active, age_on, bookings, evaluate, shifted
from . import teamwork


def train(state, catalog, person, skill):
    day = state["date"]
    end = shifted(day, catalog["staff_rules"]["training"]["days"])
    if not any(
        catalog["assignments"][aid]["org"] == state["setup"]["org"]
        and active(row, day)
        and (not row["end"] or row["end"] >= end)
        for aid, row in bookings(state, person["id"])
    ):
        raise RuleError("Контракт должен действовать до конца курса.")
    begin_course(state, catalog, person, skill)


def begin_course(state, catalog, person, skill):
    rules = catalog["staff_rules"]["training"]
    if (
        skill not in person["skills"]
        or person["training"]
        or person["fatigue"] >= rules["fatigue_limit"]
    ):
        raise RuleError(
            f"Для курса нужен профильный навык, свободное время и усталость ниже {rules['fatigue_limit']}."
        )
    if person["skills"][skill] >= person["potential"]:
        raise RuleError("Сейчас этот навык не развивается. Выберите другой навык.")
    day = state["date"]
    end = shifted(day, rules["days"])
    person["training"] = dict(skill=skill, start=day, end=end)
    person["fatigue"] = min(100, person["fatigue"] + rules["fatigue"])


def progress(state, catalog, p, start, target, days, rules):
    if p["position"] == "driver" and age_on(p, target) > max(
        rules["stamina_decline_after"], age_on(p, start)
    ):
        p["skills"]["Выносливость"] = max(0, p["skills"]["Выносливость"] - 1)
    p["fatigue"] = max(
        0, p["fatigue"] - days * (1 if p["training"] else rules["recovery"])
    )
    course = p["training"]
    if course and target == course["end"]:
        skill = course["skill"]
        value = evaluate(p, catalog, target, wet=skill == "Дождь")["values"][skill]
        gain = (
            1
            + int(age_on(p, target) < rules["early_career_age"])
            + int(
                value
                + p["professionalism"]
                + min(rules["experience_cap"], p["experience"])
                >= rules["proficiency_threshold"]
            )
        )
        p["skills"][skill] = min(
            p["potential"],
            p["skills"][skill]
            + gain
            + int(course.get("coaching", 0) >= 78)
            + teamwork.review_course(state, catalog, p, target, skill),
        )
        p["training"] = None
        p["courses"] += 1
        p["morale"] = min(100, p["morale"] + 2)
        p["traits"] = [t for t in p["traits"] if t["id"] != "focused"]
        p["traits"].append(
            dict(
                id="focused",
                skill=skill,
                start=target,
                end=shifted(target, rules["focus_days"]),
            )
        )
        if p["courses"] == 2:
            p["traits"].append(dict(id="practiced", start=target, end=None))
        state["notices"].append(
            dict(date=target, text=f"{p['name']} · курс «{skill}» завершён.")
        )
