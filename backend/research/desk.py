"""Organization-scoped reading room, queue and dated context for management decisions."""

from math import ceil

from .. import components
from ..components.design import LABELS
from ..domain import RuleError, occupant_on
from ..finance import facilities
from . import admitted, public_source
from .model import METHODS, RANK, applicability


def projection(state, world):
    org = state["setup"]["org"]
    office = org + ":" + state["setup"]["role"]
    if occupant_on(state["seats"].get(office, []), state["date"]) != state["player_id"]:
        raise RuleError(
            "Доступ к архиву требует действующего назначения в организации.", 403
        )
    data = state["research"]
    today = state["date"]
    tomorrow = facilities.later(today, 1)
    entries = []
    names = {}
    targets = []
    for entry in world["entries"].values():
        if entry["org"] != org:
            continue
        config = state["car_configurations"][entry["car"]]
        if any(
            e["concept"] == config["concept"]
            and e["regulation"] == config["regulation"]
            for e in entries
        ):
            continue
        staff = components.specialists(state, world, entry)
        names.update(
            {pid: state["people"][pid]["name"] for pid in staff.values() if pid}
        )
        title = world["cars"][entry["car"]]["name"]
        entries.append(
            dict(
                id=entry["id"],
                title=title,
                admitted=bool(admitted(state, entry)),
                **config,
                staff={role: pid for role, pid in staff.items() if pid},
                axes=[
                    a for a in METHODS if a in components.mounting(state, entry["id"])
                ],
                rivals=[
                    public_source(world, other)
                    for other in world["entries"].values()
                    if other["org"] != org
                    and other["championship"] == entry["championship"]
                    and other["category"] == entry["category"]
                ],
            )
        )
        targets.append(
            dict(
                id=config["concept"],
                concept=config["concept"],
                regulation=config["regulation"],
                title=title,
            )
        )
        for g in world["engineering"]["generations"].values():
            if (
                g["category"] == entry["category"]
                and g["season"] > config["season"]
                and g["season"].startswith(entry["championship"] + "-")
            ):
                if not any(t["id"] == g["id"] for t in targets):
                    targets.append(
                        dict(
                            id=g["id"],
                            concept=None,
                            regulation=g["regulation"],
                            title=f"{g['category']} · {g['season'][-4:]} · новая концепция",
                        )
                    )
    projects = []
    for p in data["projects"].values():
        if p["org"] != org:
            continue
        rate = p["worked"] / p["days"] if p["days"] else 0
        projects.append(
            dict(
                **{
                    k: p[k]
                    for k in (
                        "id",
                        "entry",
                        "axis",
                        "priority",
                        "concept",
                        "regulation",
                        "source",
                        "hypothesis",
                        "commissioned",
                        "allocated_on",
                        "started",
                        "finished",
                        "lead",
                        "cost_cents",
                        "required",
                        "worked",
                        "participants",
                        "status",
                        "reason",
                    )
                },
                remaining_days=ceil((p["required"] - p["worked"]) / rate)
                if rate
                else None,
            )
        )
    projects.sort(key=lambda p: (RANK[p["priority"]], p["commissioned"], p["id"]))
    reports = []
    for r in data["reports"].values():
        if r["org"] != org:
            continue
        reports.append(
            dict(
                r,
                applicability={
                    t["id"]: applicability(r, t["concept"], t["regulation"])
                    for t in targets
                },
                readers={
                    pid: records[r["id"]]
                    for pid, records in data["personal"].items()
                    if pid in names and r["id"] in records
                },
            )
        )
    reports.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    center = state["estate"]["assets"]["shared:research"]
    return dict(
        opened=data["opened"],
        projects=projects,
        reports=reports,
        entries=entries,
        targets=targets,
        staff=names,
        handovers=[h for h in data["handovers"].values() if h["org"] == org],
        capacity=facilities.capacity_window(
            state, org, "research", today, tomorrow
        ).model_dump(),
        spent_cents=sum(
            state["finance"]["instalments"]["project:" + p["id"]]["amount_cents"]
            for p in projects
            if state["finance"]["instalments"]["project:" + p["id"]]["status"] == "paid"
        ),
        lease_spent_cents=sum(
            b["cost_cents"]
            for b in state["estate"]["bookings"].values()
            if b["org"] == org
            and b["mode"] in ("lease", "outsource")
            and state["estate"]["assets"][b["facility"]]["kind"] == "research"
        ),
        lease_daily_cents=facilities.quote("research", center["country"])[
            "daily_cents"
        ],
        shared_free=facilities.free(state, center, today, facilities.later(today, 7)),
        methods={
            a: dict(
                label=LABELS[a],
                role=m[0],
                hypothesis=m[2],
                hours=m[3],
                cost_cents=m[4],
                planned_days=ceil(m[3] / 24),
            )
            for a, m in METHODS.items()
        },
    )
