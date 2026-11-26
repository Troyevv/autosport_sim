"""Add the season's personnel rules to the frozen v2 sporting catalog."""

import json
from hashlib import sha256
from pathlib import Path


def extend(world):
    positions = world["positions"]
    positions["tyres"] = dict(
        name="Руководитель разработки составов шин",
        skills=[
            "Составы",
            "Сцепление",
            "Температурное окно",
            "Прогрев",
            "Износ",
            "Отвод воды",
        ],
    )
    positions["tyre-construction"] = dict(
        name="Руководитель конструкции шин",
        skills=[
            "Конструкция",
            "Прочность",
            "Сопротивление качению",
            "Перегрев",
            "Испытания",
        ],
    )
    positions["scout"]["skills"].append("Оценка навыков")
    positions["chief-analyst"]["skills"] += ["Телеметрия", "Дефекты", "Точность"]
    positions["analyst"]["skills"].append("Прогноз отказов")
    path = Path(__file__).parent / "data" / world["version"] / "recruits.json"
    rules = json.loads(
        path.with_name("personnel-rules.json").read_text(encoding="utf-8")
    )
    world["staff_rules"] = rules
    positions.update(rules["academy_positions"])
    for series, championship in world["championships"].items():
        championship["admission"] = rules["admission"].get(
            series, championship.get("admission", {})
        )
    recruits = json.loads(path.read_text(encoding="utf-8"))
    for pid, extra in rules["additional_skills"].items():
        positions[pid]["skills"].extend(extra)
    professions = {
        seat["person"]: seat["position"] for seat in world["assignments"].values()
    }
    for person in [*world["profiles"].values(), *recruits]:
        for key in rules["additional_skills"].get(
            person.get("position") or professions[person["id"]], []
        ):
            sample = sha256((person["id"] + key).encode()).digest()[0]
            person["skills"][key] = min(person["potential"], 40 + sample % 51)
    for recruit in recruits:
        org = recruit.pop("org")
        pid, position, face = recruit["id"], recruit["position"], recruit["face"]
        skills = recruit["skills"]
        if set(skills) != set(positions[position]["skills"]) or not all(
            type(v) is int and 0 <= v <= recruit["potential"] <= 100
            for v in skills.values()
        ):
            raise ValueError("Неверный профиль сотрудника.")
        world["reserve"].remove(face)
        del world["reserve_ages"][face]
        world["profiles"][pid] = dict(
            recruit,
            origin="generated",
            fatigue=0,
            morale=70,
            traits=[],
            specialization=max(skills, key=skills.get),
        )
        world["names"][pid] = recruit["name"]
        if org:
            academy = recruit.get("academy")
            aid = f"{org}:{position}" + (f":{academy}" if academy else "")
            world["assignments"][aid] = dict(
                id=aid,
                org=org,
                position=position,
                entry=None,
                series=None,
                person=pid,
                academy=academy,
            )
    for key, pos in positions.items():
        weights = rules["weights"][key]
        if weights.keys() != set(pos["skills"]) or any(
            type(w) is not int or w < 1 for w in weights.values()
        ):
            raise ValueError("Веса рейтинга не соответствуют профилю.")
        pos["weights"] = weights

    for seat in world["assignments"].values():
        person = world["profiles"][seat["person"]]
        keys = positions[seat["position"]]["skills"]
        baseline = sum(person["skills"].values()) // len(person["skills"])
        person["skills"] = {k: person["skills"].get(k, baseline) for k in keys}
        if person["specialization"] not in keys:
            person["specialization"] = keys[0]
        if not all(type(n) is int and 0 <= n <= 100 for n in person["skills"].values()):
            raise ValueError("Навыки стартового состава вне шкалы 0–100.")
