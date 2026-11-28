"""Freeze the admitted person and dated skill profile before native integration."""

from hashlib import sha256

from ..driver_availability import participant
from ..personnel import evaluate

SKILLS = dict(
    pace="Темп",
    braking="Торможение",
    cornering="Повороты",
    attack="Обгоны",
    defence="Защита",
    consistency="Стабильность",
    tyres="Шины",
    rain="Дождь",
    feedback="Обратная связь",
    endurance="Выносливость",
    launch="Старт",
    fuel_use="Топливо",
    pressure="Работа под давлением",
    judgement="Оценка риска",
)
STYLE = ("trail", "balance", "exit", "kerb", "care", "risk", "smooth", "fast_bends")


def profile(person, skills, discipline):
    # Game estimates. Style stays with the person across cars and championships.
    digest = sha256(("driver-style-v1/" + person["id"]).encode()).digest()
    return dict(
        id=person["id"],
        **{key: skills[label] / 100 for key, label in SKILLS.items()},
        **{key: digest[i] / 255 for i, key in enumerate(STYLE)},
        resolve=person.get("professionalism", 40 + digest[12] % 55) / 100,
        ambition=person.get("ambition", 40 + digest[13] % 55) / 100,
        adaptability=person.get("adaptability", 40 + digest[14] % 55) / 100,
        experience=min(1, person["experience"] / 20),
        familiarity=person.get("adaptation", {}).get(discipline, 80) / 100,
        confidence=person["morale"] / 100,
        fatigue=person["fatigue"] / 100,
    )


def career_driver(state, world, entry, requested, wet):
    day = state["date"]
    crew = [
        pid
        for seat in world["assignments"].values()
        if seat["entry"] == entry["id"] and seat["position"] == "driver"
        if (pid := participant(state, seat["id"], day))
    ]
    if not crew or (requested is not None and requested not in crew):
        raise ValueError("No eligible driver for this entry on the session date")
    person = state["people"][requested or crew[0]]
    discipline = world["championships"][entry["championship"]]["discipline"]
    skills = evaluate(person, world, day, discipline=discipline, wet=wet)["values"]
    return profile(person, skills, discipline)
