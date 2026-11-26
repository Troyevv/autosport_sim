"""Resolve only material cited in the team's brief, for permanent minutes and later programmes."""

from ..components.catalog import parts_for
from ..components.design import LABELS


def citation(state, org, entry, key):
    def source(kind, text, section):
        return dict(id=key, kind=kind, text=text, section=section)

    report = state["research"]["reports"].get(key)
    if report and report["org"] == org:
        return source("Исследовательский отчёт", report["conclusion"], "research")
    project = state["development"]["projects"].get(key)
    if project and project["org"] == org:
        r = project.get("report")
        if r:
            return source(
                "Протокол А/Б",
                r["conditions"] + " " + r["interpretation"],
                "development",
            )
        return source(
            "Задание КБ", LABELS[project["axis"]] + " · " + project["id"], "development"
        )
    for pool, kind, section in (
        (state["research"]["projects"], "Исследование", "research"),
        (state["production"]["batches"], "Производственная партия", "production"),
    ):
        work = pool.get(key)
        if work and work["org"] == org:
            return source(
                kind,
                work.get("hypothesis") or f"Заказано {work['quantity']} экз.",
                section,
            )
    drawing = parts_for(state).specs.get(key) or state["components"]["revisions"].get(
        key
    )
    if drawing:
        return source(
            "Документация узла",
            f"{LABELS[drawing['slot']]} · редакция {drawing['version']}",
            "development",
        )
    if key == state["car_configurations"][entry["car"]]["concept"]:
        return source(
            "Концепция машины", f"Компоновка машины №{entry['number']}", "garage"
        )
    item = state["production"]["items"].get(key)
    if key in parts_for(state).stock or item:
        return source(
            "Карточка экземпляра",
            item.get("reason") or key if item else key,
            "production",
        )
    fact = state["council"]["observations"].get(key)
    return source(
        "Отчёт сессии" if fact else "Ссылка источника",
        fact["observation"] if fact and fact["org"] == org else key,
        None,
    )
