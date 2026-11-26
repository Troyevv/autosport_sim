"""Identity boundary for trusted specification and inventory producers.

Registration accepts a finished drawing or an existing serial. Scheduling design work,
granting homologation and making physical parts belong to their respective producers.
"""

from math import isfinite
from ..domain import RuleError
from .catalog import OPENING


def drawing_for(state, version):
    drawing = OPENING.specs.get(version) or state["components"]["revisions"].get(
        version
    )
    if drawing is None:
        raise RuleError("Неизвестная редакция чертежа.")
    return drawing


def bind(opening, additions, key, value):
    existing = opening.get(key) or additions.get(key)
    if existing is None:
        additions[key] = value
    elif existing != value:
        raise RuleError("Идентификатор уже связан с другой записью.", 409)


def register_revision(
    state,
    *,
    parent,
    version,
    title,
    parameters,
    life_m,
    visual,
    author,
    reference,
    refinement=False,
):
    base = drawing_for(state, parent)
    if type(version) is not int or version <= base["version"] or not title.strip():
        raise RuleError("Требуется новая версия спецификации.")
    if author not in state["people"] or not reference:
        raise RuleError("Для чертежа нужны ответственный специалист и основание.")
    expected = base["parameters"]
    if (
        base["manufacturer"].startswith("supplier-")
        and base["slot"] in {"engine", "tyre", "transmission"}
        and set(parameters) != set(expected)
    ):
        from ..manufacturer.profile import parameters as profile

        expected = profile(base["slot"], expected, base["life_m"])
    if (
        set(parameters) != set(expected)
        or any(
            type(v) not in (int, float) or not isfinite(v) or v <= 0
            for v in parameters.values()
        )
        or parameters.get("efficiency", 1) > 1
        or type(life_m) is not int
        or life_m <= 0
    ):
        raise RuleError("Неверные физические параметры или ресурс чертежа.")
    key = f"{base['family']}/{version}"
    drawing = dict(
        base,
        id=key,
        version=version,
        title=title,
        parameters=dict(parameters),
        life_m=life_m,
        visual=visual,
        author=author,
        reference=reference,
        parent=parent,
        refinements=base["refinements"] + int(refinement),
    )
    bind(OPENING.specs, state["components"]["revisions"], key, drawing)
    return key


def register_instance(state, *, instance, version, org, reference):
    drawing_for(state, version)
    if org not in state["accounts"] or not instance or not reference:
        raise RuleError("Требуются владелец, экземпляр и основание постановки на учёт.")
    bind(
        OPENING.stock,
        state["components"]["inventory"],
        instance,
        dict(spec=version, org=org, reference=reference),
    )


def spec(state, iid):
    item = OPENING.stock.get(iid) or state["components"]["inventory"].get(iid)
    if not item:
        raise RuleError("Неизвестный экземпляр.")
    return drawing_for(state, item["spec"])
