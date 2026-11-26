"""Dated staff reviews, sharing the same commands and queues as the playable office."""

from datetime import date
from .. import components, development, production
from ..domain import RuleError
from ..finance import facilities
from . import Work, commission, deliver, eligible_stock, lines
from .context import agreement, person
from .support import Request, Resolve, open_case, resolve, diagnosis
from .profile import TARGETS


def client_brief(state, world, e, axis):
    from ..components.design import assembly

    fitted = components.mounting(state, e["id"])
    parts = {a: components.nominal_drawing(state, i) for a, i in fitted.items()}
    case = assembly(parts)
    if components.condition(state, fitted[axis])["wear_ppm"] >= 500000:
        return (
            "durability",
            "Экземпляр выработал более половины допуска по износу. Просим оценить ресурс преемника.",
        )
    if axis == "engine":
        if case["thermal_margin_kw"] < 0.05 * parts[axis]["parameters"]["heat_kw"]:
            return (
                "thermal",
                "Расчётный запас теплоотвода менее 5%. Просим снизить тепловыделение.",
            )
        if e["category"] in ("Hypercar", "LMGT3"):
            return (
                "economy",
                "Для длинных отрезков просим улучшить удельный расход топлива.",
            )
    if axis == "transmission":
        return (
            "shift",
            "Просим сократить время переключения при сохранении допустимого момента.",
        )
    if axis == "tyre" and e["category"] in ("Hypercar", "LMGT3", "GT3"):
        return "durability", "Оценить износ состава при длительной нагрузке."
    return (
        "output",
        "Исследовать производительность в пределах текущего интерфейса и теплового бюджета.",
    )


def priority(state, world, row):
    terms = agreement(state, world, world["entries"][row["entry"]], row["axis"])
    partnership = (terms or {}).get("partnership")
    return (
        row["kind"] not in ("warranty", "problem"),
        partnership not in ("works", "priority"),
        row["date"],
        row["id"],
    )


def review(state, world, org, ordinal):
    office = state["manufacturer"]
    clients = [
        (e, a)
        for e, a in lines(world, org)
        if (d := agreement(state, world, e, a)) and d["maker"] == org
    ]
    if not clients:
        clients = list(lines(world, org))
    if not clients or not person(state, org, "chief-engineer"):
        return
    e, axis = clients[(ordinal // 7) % len(clients)]
    now = int(state["date"][:4])
    key = f"maker/{org}/{state['date']}"
    requests = sorted(
        (
            r
            for r in office["cases"].values()
            if r["supplier"] == org and r["status"] == "open"
        ),
        key=lambda r: priority(state, world, r),
    )
    projects = [
        p
        for pool in (state["research"]["projects"], state["development"]["projects"])
        for p in pool.values()
        if p["org"] == org
    ]
    active = [p for p in projects if not p["finished"]]
    if requests:
        r = requests[0]
        if r["kind"] in ("consult", "problem", "warranty"):
            report = diagnosis(state, world, r)
            choice = (
                "compensate"
                if r["kind"] == "warranty" and report["covered"]
                else "decline"
                if r["kind"] == "warranty"
                else "advise"
            )
            reason = (
                "Протокол контроля подтверждает основание компенсации."
                if choice == "compensate"
                else "Проверить крепления, охлаждение и режим нагрузки. Для вывода о причине нужны сопоставимые измерения."
            )
        elif active:
            choice, reason = (
                "decline",
                "Ответственные специалисты заняты утверждённой программой. Запрос можно пересмотреть после испытания.",
            )
        else:
            choice, reason = (
                "study",
                "Проверить требование по исходному чертежу и оценить связанные потери.",
            )
        resolve(
            state, world, org, Resolve(case=r["id"], decision=choice, reason=reason)
        )
        return
    if active:
        return
    last = max(
        projects,
        key=lambda p: (p["finished"] or "", p["commission_revision"], p["id"]),
        default=None,
    )
    action, version, objective, year = "research", None, "output", now
    if last:
        e, axis = world["entries"][last["entry"]], last["axis"]
        year = max(now, last.get("target_year", now))
        objective = last.get("objective", "output")
        if last.get("kind") == "design":
            action, version = "bench", last["specification"]
        elif last.get("kind") == "test":
            design = next(
                (p for p in projects if p.get("specification") == last["candidate"]),
                None,
            )
            if design and design["disposition"] == "review":
                report = last["report"]
                direction = TARGETS[axis][objective][1]
                accept = (
                    not report["detected"]
                    and direction * report["difference"] > report["uncertainty"]
                )
                development.review(
                    state,
                    world,
                    design,
                    "released" if accept else "withdrawn",
                    person(state, org, "chief-engineer"),
                )
            # Build for outstanding client demand, using proven hardware.
            action = "produce"
            version = (
                design["specification"]
                if design and design["disposition"] == "released" and year == now
                else None
            )
            year = now
        else:
            action = "design"
            objective = next(
                (
                    r["objective"]
                    for r in office["cases"].values()
                    if r.get("project") == last["id"]
                ),
                objective,
            )
            if axis == "engine" and e["championship"] == "f1" and year == 2025:
                year += 1
    if action == "produce":
        for client, product in clients:
            if stock := eligible_stock(state, world, org, client, product):
                deliver(state, world, org, client, stock[0])
                return
        batches = [
            b for b in state["production"]["batches"].values() if b["org"] == org
        ]
        if any(not b["finished"] for b in batches):
            return
        if any(b.get("protocol") == last["id"] for b in batches):
            e, axis = clients[(ordinal // 7) % len(clients)]
            action, version, objective = "research", None, "output"
        elif not production.storage_space(state, world, org)["free"]:
            facilities.act(
                state,
                world,
                org,
                key + "/warehouse",
                facilities.Lease(
                    facility="shared:warehouse",
                    start=state["date"],
                    days=14,
                    units=1,
                    mode="lease",
                ),
            )
    work = commission(
        state,
        world,
        org,
        key,
        Work(
            entry=e["id"],
            axis=axis,
            year=year,
            action=action,
            objective=objective,
            specification=version,
        ),
    )
    if action == "produce":
        work["protocol"] = last["id"]


def plan(state, world):
    ordinal = date.fromisoformat(state["date"]).toordinal()
    makers = sorted(
        org
        for org, row in world["organizations"].items()
        if row["kind"] == "supplier" and set(row["lines"]) & TARGETS.keys()
    )
    org = makers[ordinal % len(makers)]
    clients = list(lines(world, org))
    # At a review, consult two distinct client programmes. Reopen briefs only for a new season.
    seen = {
        r["client"]
        for r in state["manufacturer"]["cases"].values()
        if r["supplier"] == org
        and r["date"][:4] == state["date"][:4]
        and r["id"].startswith("client/")
    }
    if not seen:
        for e, axis in clients:
            if e["org"] in seen or e["org"] == state["setup"]["org"]:
                continue
            terms = agreement(state, world, e, axis)
            if not terms or terms["maker"] != org:
                continue
            target, message = client_brief(state, world, e, axis)
            try:
                open_case(
                    state,
                    world,
                    e["org"],
                    f"client/{e['id']}/{axis}/{state['date']}",
                    Request(
                        entry=e["id"],
                        axis=axis,
                        kind="next",
                        objective=target,
                        message=message,
                    ),
                )
            except RuleError:
                continue
            seen.add(e["org"])
            if len(seen) >= 2:
                break
    if org == state["setup"]["org"] and state["setup"]["role"] == "manufacturer":
        return
    try:
        review(state, world, org, ordinal)
    except RuleError as error:
        state["manufacturer"]["reviews"][org] = dict(
            date=state["date"], reason=str(error)
        )
