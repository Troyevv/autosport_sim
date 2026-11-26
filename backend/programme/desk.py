"""Read the two portfolios and their signed decisions within the acting manager's office."""

from .. import components, council, research
from ..research.model import METHODS
from ..finance import budget, facilities
from . import policy
from .rules import dossier, inspection
from .packages import entries_for, evaluate_package, package, work_for, timing


def projection(state, world):
    org = council.access(state)
    year = int(state["date"][:4])
    live = council.refresh(state, world, org)
    board = state["programme"]
    plans = []
    for e in entries_for(world, org):
        staff = components.specialists(state, world, e)
        for target in (year, year + 1):
            plan = dossier(state, world, e, target)
            works = list(work_for(state, world, e, plan))
            pkg = package(state, world, e, plan)
            packages = {
                p["id"]: p
                for p in board["packages"].values()
                if p["plan"] == plan["id"]
            }
            packages.setdefault(pkg["id"], pkg)
            packages = [
                evaluate_package(state, world, e, plan, p, works)
                for p in packages.values()
            ]
            proposals = [
                dict(
                    id=r["id"],
                    title=r["options"][0]["title"],
                    axis=r["axis"],
                    risk=r["options"][0]["risk"],
                    cost_cents=r["options"][0]["cost_cents"],
                    blocked=r.get("blocked"),
                    status=r["status"],
                    result=r["options"][0]["result"],
                    positions=r["positions"],
                )
                for r in live.values()
                if r.get("plan") == plan["id"]
            ]
            reports = [
                dict(
                    id=r["id"],
                    axis=r["axis"],
                    confidence=r["confidence"],
                    applicable=research.applicability(
                        r, plan["concept"], plan["regulation"]
                    ),
                    conclusion=r["conclusion"],
                )
                for r in sorted(
                    state["research"]["reports"].values(), key=lambda r: r["id"]
                )
                if r["org"] == org
            ]
            calendar = [timing(state, k, p) for k, p in works]
            plans.append(
                dict(
                    **plan,
                    entry=e["id"],
                    category=e["category"],
                    series=e["championship"],
                    name=world["cars"][e["car"]]["name"],
                    staff=staff,
                    concept_costs={
                        strategy: sum(
                            METHODS[a][4]
                            for a in package(
                                state, world, e, dict(plan, strategy=strategy)
                            )["axes"]
                        )
                        for strategy in ("revise", "replace")
                    },
                    admitted=bool(research.admitted(state, e)),
                    packages=packages,
                    proposals=proposals,
                    knowledge=reports,
                    certificates=board["certificates"].get(plan["id"], {}),
                    violations=inspection(state, world, e) if target == year else [],
                    calendar=calendar,
                    spent_cents=sum(r["cost_cents"] for r in calendar),
                    reserved_cents=sum(r["reserved_cents"] for r in calendar),
                )
            )
    people = {
        pid: state["people"][pid]["name"]
        for plan in plans
        for pid in plan["staff"].values()
        if pid
    }
    history = [
        dict(
            id=h["id"],
            date=h["date"],
            person=state["people"][h["person"]]["name"],
            plan=state["council"]["briefs"][h["proposal"]].get("plan"),
            reason=h["reason"],
            title=(h.get("choice") or {}).get("title", h["observation"]),
        )
        for h in state["council"]["history"]
        if h["org"] == org
    ]
    for h in board["decisions"]:
        if h["org"] == org:
            terms = h["terms"]
            reason = (
                dict(
                    current="Приоритет текущей машины",
                    next="Приоритет следующего поколения",
                    balanced="Оба поколения",
                    **{"stop-current": "Остановка развития текущей машины"},
                ).get(terms.get("allocation"))
                or dict(
                    revise="Пересмотр компоновки",
                    replace="Переход на новую концепцию",
                    **{"continue": "Продолжение концепции"},
                ).get(terms.get("strategy"))
                or ("Срок внедрения · " + terms["due"] if terms.get("due") else None)
                or (
                    "Внедрение пакета отменено"
                    if terms.get("decision") == "withdraw"
                    else None
                )
                or terms.get("specification")
            )
            history.append(
                dict(
                    id=h["id"],
                    date=h["date"],
                    person=state["people"][h["person"]]["name"],
                    plan=h["plan"],
                    title="Решение по технической программе",
                    reason=reason,
                )
            )
    capacity = []
    for kind in ("research", "design", "cfd", "tunnel", "bench", "factory", "quality"):
        sites = [a for a in state["estate"]["assets"].values() if a["kind"] == kind]
        today = state["date"]
        capacity.append(
            dict(
                kind=kind,
                label=facilities.TYPES[kind][0],
                free=sum(
                    facilities.free(
                        state, a, today, facilities.later(today, 1), buyer=org
                    )
                    for a in sites
                ),
                used=sum(
                    b["units"]
                    for b in state["estate"]["bookings"].values()
                    if b["org"] == org
                    and b["mode"] == "use"
                    and b["start"] <= today < b["end"]
                    and state["estate"]["assets"][b["facility"]]["kind"] == kind
                ),
            )
        )
    return dict(
        year=year,
        priority=policy(state, org),
        goal=state["mandates"].get(org, {}).get("goal"),
        plans=plans,
        people=people,
        capacity=capacity,
        mandate=council.mandate(state, org),
        history=sorted(history, key=lambda h: h["date"], reverse=True),
        finance=budget.report(state, world, org, year),
        atr=budget.scope_for(state, world, org),
    )
