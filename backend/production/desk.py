"""Organization-scoped workshop records. Only signed observations leave the workshop."""

from math import ceil

from .. import components, development, finance, driver_availability, driver_terms
from ..components.design import LABELS
from ..domain import RuleError, occupant_on
from ..finance import budget, facilities
from ..research.model import queue_position
from . import actions, inventory, mounted, permitted, quote, status, storage_space
from .planning import needs
from .workshop import crew


def capacity(state, org, kind):
    today = state["date"]
    end = facilities.later(today, 1)
    sites = [a for a in state["estate"]["assets"].values() if a["kind"] == kind]
    group = crew(state, org, kind == "quality") if kind != "warehouse" else None
    shared = state["estate"]["assets"]["shared:" + kind]
    return dict(
        kind=kind,
        label=facilities.TYPES[kind][0],
        daily_cents=facilities.quote(kind, shared["country"])["daily_cents"],
        rentable=facilities.free(state, shared, today, facilities.later(today, 7)),
        crew={
            k: group[k]
            for k in ("name", "size", "qualification", "workload", "fatigue")
        }
        if group
        else None,
        sites=[
            dict(
                id=a["id"],
                owned=a["owner"] == org,
                condition=a["condition"],
                slots=facilities.free(state, a, today, end, buyer=org),
                used=sum(
                    b["units"]
                    for b in state["estate"]["bookings"].values()
                    if b["facility"] == a["id"]
                    and b["org"] == org
                    and b["mode"] == "use"
                    and b["start"] <= today < b["end"]
                ),
            )
            for a in sites
            if a["owner"] in (org, facilities.PUBLIC)
            or facilities.free(state, a, today, end, buyer=org) > 0
        ],
    )


def projection(state, world):
    org, role = state["setup"]["org"], state["setup"]["role"]
    if (
        occupant_on(state["seats"].get(org + ":" + role, []), state["date"])
        != state["player_id"]
    ):
        raise RuleError("Требуется действующее назначение.", 403)
    data = state["production"]
    entries = []
    targets = {}
    for e in world["entries"].values():
        if e["org"] != org:
            continue
        available = components.stockroom(state, world, e)
        staff = components.specialists(state, world, e)
        choices = []
        for slot in components.mounting(state, e["id"]):
            for d in development.versions(state, e["id"], slot):
                choices.append(
                    dict(
                        id=d["id"],
                        slot=slot,
                        label=LABELS[slot],
                        version=d["version"],
                        title=d["title"],
                        modes=[
                            dict(
                                id=mode,
                                reason=permitted(state, world, e, d, mode == "external")
                                or (
                                    None
                                    if staff.get("chief-mechanic")
                                    else "Вакансия главного механика."
                                ),
                                normal=quote(d, False, mode == "external"),
                                rush=quote(d, True, mode == "external"),
                            )
                            for mode in ("internal", "external")
                        ],
                    )
                )
        for iid in available:
            target, _, _ = components.allocation(state, world, e, iid, available)
            reason = components.installation_block(state, e, staff)
            if target:
                reason = (
                    "По договору пилотов приоритет у машины №"
                    + world["entries"][target]["number"]
                    + "."
                )
            targets.setdefault(iid, []).append(dict(entry=e["id"], reason=reason))
        entries.append(
            dict(
                id=e["id"],
                title=f"№{e['number']} · {world['cars'][e['car']]['name']}",
                choices=choices,
                crew=[
                    dict(
                        id=participant,
                        name=state["people"][participant]["name"],
                        status=contract["driver_status"]
                        if participant == contract["person"]
                        else "relief",
                    )
                    for seat in components.seats_for(world, e)
                    if seat["entry"] == e["id"]
                    and (contract := driver_terms.contract(state, seat, state["date"]))
                    and (
                        participant := driver_availability.participant(
                            state, seat["id"], state["date"]
                        )
                    )
                ],
            )
        )
    mounts = mounted(state, world, org)
    items = []
    history = [
        event
        for event in data["history"]
        if event.get("org",world["entries"][event["entry"]]["org"]) == org
    ]
    for iid in inventory(state, org):
        item = data["items"].get(iid, {})
        phase = status(state, iid, mounts)
        drawing = components.spec(state, iid)
        items.append(
            dict(
                id=iid,
                serial=components.serial(iid),
                slot=drawing["slot"],
                label=LABELS[drawing["slot"]],
                title=drawing["title"],
                version=drawing["version"],
                specification=drawing["id"],
                batch=item.get("batch"),
                made=item.get("made"),
                cost_cents=item.get("cost_cents"),
                status=phase,
                installed=mounts.get(iid),
                rejected=item.get("rejected", False),
                reason=item.get("reason"),
                remaining_m=components.remaining(state, iid),
                **components.condition(state, iid),
                targets=targets.get(iid, []),
                actions=actions(state, iid, phase),
                repair_cents=quote(drawing, False, False)["cents"] // 3,
                fits=[
                    dict(
                        date=h["date"],
                        entry=h["entry"],
                        code="installed" if h["instance"] == iid else "removed",
                        person=h["mechanic"],
                    )
                    for h in state["components"]["history"]
                    if iid in (h["instance"], h["removed"])
                ],
            )
        )
    items.sort(key=lambda i: (i["made"] or "", i["id"]), reverse=True)
    batches = []
    for b in sorted(data["batches"].values(), key=queue_position):
        if b["org"] != org:
            continue
        days = ceil(
            (b["required"] - b["worked"])
            / (b["worked"] / b["days"] if b["days"] else 24)
        )
        row = {
            k: b[k]
            for k in (
                "id",
                "entry",
                "specification",
                "quantity",
                "priority",
                "rush",
                "outsource",
                "commissioned",
                "finished",
                "cost_cents",
                "facility_cents",
                "required",
                "worked",
                "status",
                "reason",
            )
        }
        batches.append(
            dict(
                **row,
                days=days,
                last_shift=b.get("last_shift"),
                estimated_finish=facilities.later(state["date"], max(0, days - 1)),
                grants=[facilities.grant(state, g).model_dump() for g in b["grants"]],
            )
        )
    reports = needs(state, world, org)
    people = {p for r in reports for p in (r["mechanic"], r["engineer"])}
    people.update(e["person"] for e in history)
    people.update(h["person"] for i in items for h in i["fits"])
    view = budget.report(state, world, org, state["date"][:4])
    limit = 0
    if (
        view["plan"]
        and state["capital"]["crises"].get(org, {}).get("status") != "bankrupt"
    ):
        limit = min(
            finance.available(state, org),
            view["plan"]["allocations"]["engineering"]
            - view["actual"].get("engineering", 0)
            - view["reserved"]["engineering"],
        )
        if view["cap"]:
            limit = min(limit, view["cap"]["remaining_cents"])
    return dict(
        entries=entries,
        items=items,
        batches=batches,
        needs=reports,
        history=history[::-1],
        capacity=[capacity(state, org, k) for k in ("factory", "quality", "warehouse")],
        storage=storage_space(state, world, org),
        limit_cents=max(0, limit),
        people={pid: state["people"][pid]["name"] for pid in people},
    )
