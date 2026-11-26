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
Priority = Literal["high", "normal", "low"]
RANK = {"high": 0, "normal": 1, "low": 2}


class Commission(Fields):
    entry: Id
    axis: Literal["floor", "chassis", "cooling", "tyre"]
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
    concept_weight, rule_weight = weights[report["axis"]]
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
        for r in state["research"]["reports"].values()
        if r["org"] == org and r["axis"] == axis
    ]


def conclusion(seed, project):
    # The analyst may miss a promising avenue or endorse a poor hypothesis.
    fingerprint = (
        f"study-v1|{seed}|{project['id']}|{project['concept']}|{project['axis']}"
    )
    draws = sha256(fingerprint.encode()).digest()
    quality = project["quality_sum"] // project["worked"]
    margin = development_margin(
        seed, project["concept"], project["axis"], project["refinements"]
    )
    confidence = min(94, max(12, quality + draws[2] % 21 - 10))
    if draws[0] * 100 // 256 >= min(94, 30 + quality * 2 // 3):
        return (
            "inconclusive",
            confidence // 2,
            "Материалов недостаточно для вывода. Требуется независимый источник.",
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
    }[project["axis"]]
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
