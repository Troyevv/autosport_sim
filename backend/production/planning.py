"""Spare requirements signed by the current workshop and engineering leads."""

from datetime import date
from math import ceil

from ..finance.facilities import later

from .. import components, development
from ..domain import RuleError, occupant_on
from ..research.model import METHODS
from . import Order, Disposition, commission, disposition, permitted


def needs(state, world, org):
    needs_by_version = {}
    for e in world["entries"].values():
        if e["org"] != org:
            continue
        staff = components.specialists(state, world, e)
        available = components.stockroom(state, world, e)
        for axis, iid in components.mounting(state, e["id"]).items():
            fitted = components.spec(state, iid)
            engineer = staff.get(METHODS[axis][0])
            if not staff.get("chief-mechanic") or not engineer:
                continue
            released = [
                d
                for d in state["components"]["revisions"].values()
                if d["family"] == fitted["family"]
                and development.released(state, org, d["id"])
                and components.compatible(state, world, e, d)
            ]
            target = max([fitted, *released], key=lambda d: d["version"])
            key = target["id"]
            row = needs_by_version.setdefault(
                key,
                dict(
                    entry=e["id"],
                    specification=key,
                    slot=axis,
                    mechanic=staff["chief-mechanic"],
                    engineer=engineer,
                    cars=0,
                    replace=0,
                    stock=set(),
                ),
            )
            row["cars"] += 1
            row["replace"] += int(
                not components.serviceable(state, iid)
                or components.remaining(state, iid) < fitted["life_m"] // 4
                or components.condition(state, iid)["wear_ppm"] >= 750000
                or key != fitted["id"]
            )
            row["stock"].update(
                i for i in available if components.spec(state, i)["id"] == key
            )
    production = state["production"]
    for key, row in needs_by_version.items():
        row["stock"] = len(row["stock"])
        row["pending"] = sum(
            b["quantity"]
            for b in production["batches"].values()
            if b["org"] == org and b["specification"] == key and not b["finished"]
        )
        row["pending"] += sum(
            1
            for iid, item in production["items"].items()
            if world["entries"][item["entry"]]["org"] == org
            and item["status"] in ("inspection", "repair")
            and (not item.get("rejected") or item["status"] == "repair")
            and components.spec(state, iid)["id"] == key
        )
        row["quantity"] = max(
            0, row["cars"] + row["replace"] - row["stock"] - row["pending"]
        )
    return sorted(
        needs_by_version.values(),
        key=lambda r: (-r["replace"], -r["quantity"], r["specification"]),
    )


def npc_plan(state, world):
    ordinal = date.fromisoformat(state["date"]).toordinal()
    if ordinal % 3:
        return
    orgs = sorted({e["org"] for e in world["entries"].values()})
    org = orgs[ordinal // 3 % len(orgs)]
    if (
        org == state["setup"]["org"]
        and state["setup"]["role"] == "manager"
        or not occupant_on(state["seats"].get(org + ":manager", []), state["date"])
    ):
        return
    for iid, item in sorted(state["production"]["items"].items()):
        if world["entries"][item["entry"]]["org"] != org:
            continue
        if item.get("rejected") and item["status"] == "inspection":
            try:
                disposition(
                    state, world, org, Disposition(instance=iid, decision="repair")
                )
            except RuleError:
                pass
            break
    for row in needs(state, world, org):
        if row["quantity"] <= 0:
            continue
        entry = world["entries"][row["entry"]]
        drawing = components.spec(
            state, components.mounting(state, entry["id"])[row["slot"]]
        )
        outsource = drawing["manufacturer"] != org
        try:
            commission(
                state,
                world,
                org,
                f"batch-{entry['id']}-{state['date']}",
                Order(
                    entry=entry["id"],
                    specification=row["specification"],
                    quantity=min(3, row["quantity"]),
                    priority="high" if row["replace"] else "normal",
                    rush=False,
                    outsource=outsource,
                ),
            )
        except RuleError:
            continue
        break


def issue_to_car(state, world, iid, item):
    """The NPC manager acts only on an accepted, eligible replacement or released upgrade."""
    entry = world["entries"][item["entry"]]
    org = entry["org"]
    if (
        state["setup"]["org"] == org
        and state["setup"]["role"] == "manager"
        or not occupant_on(state["seats"].get(org + ":manager", []), state["date"])
    ):
        return
    d = components.spec(state, iid)
    for e in world["entries"].values():
        if e["org"] != org or not components.compatible(state, world, e, d):
            continue
        old = components.mounting(state, e["id"])[d["slot"]]
        if (
            components.serviceable(state, old)
            and components.spec(state, old)["version"] >= d["version"]
            and components.remaining(state, old)
            >= components.spec(state, old)["life_m"] // 4
            and components.condition(state, old)["wear_ppm"] < 750000
        ):
            continue
        if permitted(state, world, e, d, d["manufacturer"] != org):
            continue
        try:
            components.install(
                state, world, components.Install(entry=e["id"], instance=iid), org
            )
        except RuleError:
            continue
        break


def shortage_plan(state, org, version):
    """Only a funded open order can explain a temporary allocation difference to #44."""
    batch = next(
        (
            b
            for b in sorted(
                state.get("production", {}).get("batches", {}).values(),
                key=lambda b: b["id"],
            )
            if b["org"] == org and b["specification"] == version and not b["finished"]
        ),
        None,
    )
    if batch is None:
        return {}
    rate = batch["worked"] / batch["days"] if batch["days"] else 24
    days = ceil((batch["required"] - batch["worked"]) / rate) + batch["quantity"]
    return dict(
        exception="shortage",
        remedy=f"Установить после приёмки партии {batch['id']}.",
        due=later(state["date"], days),
    )
