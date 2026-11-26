"""Versioned desk-study methods and scoped evidence contracts for the engineering programme."""

from hashlib import sha256
from typing import Literal

from ..components.design import development_margin
from ..staff_input import Fields, Id

# Responsible department, skill, question, labour estimate (effective hours), EUR cents.
METHODS = {
    "floor": (
        "aero",
        "Прижим",
        "Сохранит ли днище эффективность при изменении рабочего просвета?",
        72,
        180000,
    ),
    "chassis": (
        "chassis",
        "Баланс",
        "Можно ли перераспределить массу в пределах компоновки шасси?",
        60,
        135000,
    ),
    "cooling": (
        "performance",
        "Охлаждение",
        "Хватит ли запаса охлаждения при более плотной компоновке?",
        54,
        120000,
    ),
    "tyre": (
        "reliability",
        "Диагностика",
        "Совместима ли работа шины с нагрузками выбранного шасси?",
        48,
        96000,
    ),
}
LEGACY_AXES = tuple(METHODS)
METHODS.update(
    {
        "rear-wing": (
            "aero",
            "Сопротивление",
            "Оправдан ли дополнительный прижим ценой сопротивления крыла?",
            64,
            162000,
        ),
        "suspension": (
            "chassis",
            "Подвеска",
            "Удерживает ли подвеска рабочий просвет днища?",
            56,
            128000,
        ),
        "brakes": (
            "reliability",
            "Ресурс",
            "Ограничивает ли сцепление шин полезный тормозной момент?",
            48,
            108000,
        ),
        "engine": (
            "performance",
            "Интеграция силовой установки",
            "Соответствует ли теплоотвод длительной мощности двигателя?",
            80,
            210000,
        ),
        "transmission": (
            "performance",
            "Трансмиссия",
            "Достаточен ли запас коробки по входному моменту?",
            60,
            148000,
        ),
    }
)
INTERACTIONS = {
    "rear-wing": "нагрузку на заднюю ось и сопротивление крыла",
    "floor": "карту просвета днища и жёсткость подвески",
    "chassis": "развесовку и площадь воздухозаборника",
    "suspension": "ход подвески и рабочую высоту днища",
    "brakes": "тормозной момент и сцепление шины",
    "cooling": "сечение впуска и тепловыделение двигателя",
    "engine": "тепловую нагрузку и пропускную способность системы охлаждения",
    "transmission": "входной момент и предел нагрузки коробки",
    "tyre": "деформацию шины и жёсткость подвески",
}


def design_context(state, entry, axis):
    """Constraint visible to specialists from nominal drawings, before any track evidence."""
    from ..components import mounting, nominal_drawing
    from ..components.design import assembly

    parts = {
        k: nominal_drawing(state, iid)
        for k, iid in mounting(state, entry["id"]).items()
    }
    case = assembly(parts)
    p = {k: d["parameters"] for k, d in parts.items()}
    if axis in ("engine", "cooling", "chassis"):
        return (
            "Впуск ограничивает расход воздуха через радиатор."
            if p["chassis"]["inlet_area_m2"] < p["cooling"]["inlet_area_m2"]
            else "Теплоотвод ограничен характеристикой самого радиатора."
        )
    if axis in ("rear-wing", "floor", "suspension"):
        return (
            "Расчётный просвет выше рабочего диапазона днища."
            if case["clearance_mm"] > p["floor"]["design_clearance_mm"]
            else "Под нагрузкой просвет достигает расчётной высоты днища или опускается ниже."
        )
    if axis == "transmission":
        headroom = (
            p["transmission"]["input_limit_nm"] / p["engine"]["peak_torque_nm"] - 1
        ) * 100
        return f"Номинальный запас коробки по моменту {headroom:.0f}%."
    torque_limit = p["brakes"]["total_torque_nm"] / p["tyre"]["loaded_radius_m"]
    return (
        "В расчётном режиме тормозную силу ограничивает сцепление шины."
        if case["brake_force_n"] < torque_limit - 0.01
        else "В расчётном режиме достигнут предел тормозного момента."
    )


def question_for(state, world, entry, drawing):
    from ..development import restriction

    axis = drawing["slot"]
    config = state["car_configurations"][entry["car"]]
    prior = evidence(state, entry["org"], axis, config["concept"], config["regulation"])
    coupling = INTERACTIONS[axis]
    if prior:
        last = max(
            prior,
            key=lambda r: (
                state["research"]["reports"][r["report"]]["date"],
                r["report"],
            ),
        )
        prompt = {
            "supported": "Сохранится ли вывод при изменении нагрузки?",
            "rejected": "Можно ли объяснить отвергнутую гипотезу взаимодействием узлов?",
            "inconclusive": "Поможет ли независимая проверка снять неопределённость?",
        }[last["outcome"]]
    elif restriction(state, world, entry, axis):
        prompt = "Как согласовать автомобиль с предписанной спецификацией?"
    else:
        prompt = METHODS[axis][2]
    return f"{design_context(state, entry, axis)} {prompt} Сопоставить {coupling} для {world['cars'][entry['car']]['name']}, ред. {drawing['version']}."


Priority = Literal["high", "normal", "low"]
RANK = {"high": 0, "normal": 1, "low": 2}


def queue_position(project):
    return (
        RANK[project["priority"]],
        project["commissioned"],
        project.get("commission_revision", -1),
        project["id"],
    )


class Commission(Fields):
    entry: Id
    axis: Literal[
        "floor",
        "chassis",
        "cooling",
        "tyre",
        "rear-wing",
        "suspension",
        "brakes",
        "engine",
        "transmission",
    ]
    priority: Priority
    rival_entry: Id | None = None


class Reorder(Fields):
    project: Id
    priority: Priority


class Handover(Fields):
    report: Id
    mentor: Id
    recipient: Id


ORDERS = {
    "research-commission": Commission,
    "research-priority": Reorder,
    "research-handover": Handover,
}


def applicability(report, concept, regulation):
    """Confidence retained for this context, never an increment to vehicle performance."""
    weights = {
        "floor": (48, 42),
        "cooling": (65, 58),
        "chassis": (54, 52),
        "tyre": (72, 66),
    }
    concept_weight, rule_weight = weights.get(report["axis"], (58, 48))
    confidence = report["confidence"]
    if report["concept"] != concept:
        confidence = confidence * concept_weight // 100
    if report["regulation"] != regulation:
        confidence = confidence * rule_weight // 100
    return confidence


def evidence(state, org, axis, concept, regulation):
    """Private input for #47/#49/#50. Rejected and inconclusive studies remain citable."""
    return [
        dict(
            report=r["id"],
            project=r["project"],
            baseline=r["baseline"],
            axis=axis,
            outcome=r["outcome"],
            hypothesis=r["hypothesis"],
            source=r["source"],
            conclusion=r["conclusion"],
            concept=r["concept"],
            regulation=r["regulation"],
            confidence=applicability(r, concept, regulation),
        )
        for r in sorted(
            state["research"]["reports"].values(), key=lambda row: row["id"]
        )
        if r["org"] == org and r["axis"] == axis
    ]


def conclusion(seed, project):
    # The analyst may miss a promising avenue or endorse a poor hypothesis.
    fingerprint = (
        f"study-v1|{seed}|{project['id']}|{project['concept']}|{project['axis']}"
    )
    draws = sha256(fingerprint.encode()).digest()
    quality = project["quality_sum"] // project["worked"]
    confidence = min(94, max(12, quality + draws[2] % 21 - 10))
    context = project.get("design_context", "")
    if draws[0] * 100 // 256 >= min(94, 30 + quality * 2 // 3):
        return (
            "inconclusive",
            confidence // 2,
            "Материалов недостаточно для вывода. Требуется независимый источник."
            + (" " + context if context else ""),
        )
    if project.get("integration_study"):
        # The team can judge a fit to its package, without access to a supplier's design ceiling.
        plausible = project["comparable"]
    else:
        margin = development_margin(
            seed, project["concept"], project["axis"], project["refinements"]
        )
        plausible = margin > (
            0.085 if project["source"]["kind"] == "public-entry" else 0.07
        )
    if draws[1] * 100 // 256 < (100 - quality) // 2:
        plausible = not plausible
    followup = {
        "floor": "Сопоставить рабочие просветы днища с жёсткостью подвески.",
        "chassis": "Проверить развесовку при переносе узлов в доступном объёме шасси.",
        "cooling": "Согласовать сечение воздухозаборника с тепловой нагрузкой силовой установки.",
        "tyre": "Сопоставить вертикальную жёсткость шины и нагрузку на колесо.",
    }.get(project["axis"], "Проверить " + INTERACTIONS[project["axis"]] + ".")
    if context:
        followup = (
            context + " " + followup
            if project["comparable"]
            else "Компоновки не совпадают. Сначала проверить переносимость решения. "
            + followup
        )
        if project["source"]["kind"] == "public-entry":
            followup += " Сравнение по открытому заявочному листу."
    if project.get("integration_study"):
        if plausible:
            return (
                "supported",
                confidence,
                "Проверить интеграцию утверждённого узла в сборке. " + followup,
            )
        return (
            "rejected",
            confidence,
            "Запросить уточнение условий применения узла у изготовителя. " + followup,
        )
    if plausible:
        return (
            "supported",
            confidence,
            "Включить вариант в проработку. " + followup,
        )
    return (
        "rejected",
        confidence,
        "Сохранить текущий вариант. Перед пересмотром гипотезы: "
        + followup[0].lower()
        + followup[1:],
    )
