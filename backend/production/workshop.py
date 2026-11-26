"""Calendar-driven factory, repair and metrology shifts."""

from hashlib import sha256
from datetime import date
from typing import NamedTuple

from .. import components
from ..components.registry import register_instance, drawing_for
from ..domain import RuleError
from ..finance import facilities
from ..personnel import evaluate
from ..research import available_person, record_work, admitted
from ..research.model import queue_position
from ..team_staff import department_capacity
from . import permitted, log


def draw(state, key, purpose):
    sample = sha256(
        f"factory-v1/{state['setup']['seed']}/{key}/{purpose}".encode()
    ).digest()
    return int.from_bytes(sample[:4], "big") % 1000


def crew(state, org, inspection):
    name = "Надёжность" if inspection else "Механики и пит-бригада"
    return next(
        (
            g
            for g in state["collectives"].values()
            if g["org"] == org and g["name"] == name
        ),
        None,
    )


def booked_site(state, org, kind, day, end, contractor):
    """Assign one paid slot-day; other users of the capacity may have older unlinked grants."""
    bookings = state["estate"]["bookings"]
    sites = sorted(
        (a for a in state["estate"]["assets"].values() if a["kind"] == kind),
        key=lambda a: (a["owner"] != org, a["id"]),
    )
    for site in sites:
        if facilities.free(state, site, day, end, buyer=org) < 1:
            continue
        if site["owner"] == org:
            if not contractor:
                return site, None
            continue
        records = [
            r
            for r in bookings.values()
            if r["facility"] == site["id"]
            and r["org"] == org
            and r["start"] <= day < r["end"]
            and r.get("purpose") != "preparation"
        ]
        uses = [r for r in records if r["mode"] == "use"]
        unlinked = sum(r["units"] for r in uses if not r.get("rental"))
        for rental in sorted(
            (r for r in records if r["mode"] in ("lease", "outsource")),
            key=lambda r: (r["end"], r["id"]),
        ):
            remaining = rental["units"] - sum(
                r["units"] for r in uses if r.get("rental") == rental["id"]
            )
            consumed = min(unlinked, remaining)
            unlinked -= consumed
            if remaining > consumed and (rental["mode"] == "outsource") == contractor:
                return site, rental
    return None, None


def shift(state, world, entry, used, kind, key, *, contractor=False, repair=False):
    org, day = entry["org"], state["date"]
    tomorrow = facilities.later(day, 1)
    inspection = kind == "quality"
    role = "reliability" if inspection else "chief-mechanic"
    lead = components.specialists(state, world, entry).get(role)
    if not admitted(state, entry):
        raise RuleError("Допуск программы приостановлен.")
    supervision = 4
    if (
        not lead
        or used.get(lead, 0) + supervision > 8
        or not available_person(state, lead, day, tomorrow)
    ):
        raise RuleError("Вакансия или занят ответственный специалист.")
    group = crew(state, org, inspection)
    available_crew = (
        department_capacity(group) - used.get(group["id"], 0) if group else 0
    )
    if available_crew < 100:
        raise RuleError("Недостаточно доступных человеко-часов подразделения.")
    site, rental = booked_site(state, org, kind, day, tomorrow, contractor)
    fee = 0
    from ..council import may_rent

    if not site and (contractor or may_rent(state, org)):
        site = state["estate"]["assets"]["shared:" + kind]
        facilities.act(
            state,
            world,
            org,
            key + "/hire",
            facilities.Lease(
                facility=site["id"],
                start=day,
                days=1,
                units=1,
                mode="outsource" if contractor else "lease",
            ),
        )
        rental = state["estate"]["bookings"][key + "/hire"]
    if not site:
        raise RuleError(
            "Требуется свободная мощность: " + facilities.TYPES[kind][0] + "."
        )
    active = sum(
        b["units"]
        for b in state["estate"]["bookings"].values()
        if b["facility"] == site["id"]
        and b["mode"] == "use"
        and b["start"] <= day < b["end"]
    )
    facilities.consume(
        state,
        org,
        key,
        site,
        day,
        tomorrow,
        1,
        facilities.PROCESS[kind],
        key.rsplit("/", 1)[0],
        program=entry["program"],
        regulation=state["car_configurations"][entry["car"]]["regulation"],
    )
    if rental:
        state["estate"]["bookings"][key]["rental"] = rental["id"]
        days = (
            date.fromisoformat(rental["end"]) - date.fromisoformat(rental["start"])
        ).days
        fee = rental["cost_cents"] // (days * rental["units"])
    grant = facilities.grant(state, key)
    skill = "Диагностика" if inspection else "Ремонт" if repair else "Сборка"
    ability = evaluate(state["people"][lead], world, day)["values"][skill]
    load = (group["workload"] + active * 100 // grant.staffed_capacity) // 2
    quality = (ability + group["qualification"] + grant.condition + (100 - load)) // 4
    support = min(grant.effective_person_days_x100, available_crew)
    hours = max(1, (supervision + support * 8 // 100) * quality // 100)
    used[lead] = used.get(lead, 0) + supervision
    used[group["id"]] = used.get(group["id"], 0) + support
    return lead, quality, hours, fee


class ManufacturingFaults(NamedTuple):
    serial: bool
    batch: bool


def physical_faults(state, iid) -> ManufacturingFaults:
    """Trusted serial-level input for future physics. Never used in a management projection."""
    item = state["production"]["items"].get(iid, {})
    if item.get("repaired"):
        return ManufacturingFaults(False, False)
    batch = state["production"]["batches"].get(item.get("batch"), {})
    return ManufacturingFaults(bool(item.get("fault")), bool(batch.get("batch_fault")))


def fabricate(state, world, batch, used):
    if batch["finished"]:
        return
    batch["last_shift"] = state["date"]
    entry = world["entries"][batch["entry"]]
    version, key = batch["specification"], batch["id"]
    reason = permitted(
        state, world, entry, drawing_for(state, version), batch["outsource"]
    )
    if reason:
        batch.update(status="queued", reason=reason)
        return
    shift_id = key + "/" + state["date"]
    if shift_id in state["estate"]["bookings"]:
        return
    try:
        lead, quality, rate, fee = shift(
            state,
            world,
            entry,
            used,
            "factory",
            shift_id,
            contractor=batch["outsource"],
        )
    except RuleError as error:
        batch.update(status="queued", reason=str(error))
        return
    hours = min(rate, batch["required"] - batch["worked"])
    batch["grants"].append(shift_id)
    batch["participants"][lead] = state["date"]
    batch.update(
        worked=batch["worked"] + hours,
        days=batch["days"] + 1,
        reason=None,
        status="active",
        facility_cents=batch["facility_cents"] + fee,
        risk_sum=batch["risk_sum"] + hours * (100 - quality + 18 * batch["rush"]),
    )
    if batch["worked"] < batch["required"]:
        return
    risk = batch["risk_sum"] // batch["required"]
    batch["batch_fault"] = draw(state, key, "batch") < risk
    unit, remainder = divmod(
        batch["cost_cents"] + batch["facility_cents"], batch["quantity"]
    )
    for n in range(batch["quantity"]):
        iid = f"{key}/unit-{n + 1}"
        register_instance(
            state, instance=iid, version=version, org=batch["org"], reference=key
        )
        state["production"]["items"][iid] = dict(
            entry=entry["id"],
            batch=key,
            made=state["date"],
            queued=state["date"],
            cost_cents=unit + int(n < remainder),
            status="inspection",
            checks=0,
            rejected=False,
            reason=None,
            repaired=False,
            fault=draw(state, iid, "serial") < risk * 3,
        )
        log(state, entry["id"], version, "manufactured", lead, batch=key, instance=iid)
    batch.update(status="complete", finished=state["date"])
    for person, day in batch["participants"].items():
        record_work(
            state,
            world,
            person,
            batch["org"],
            key,
            "assembly",
            "Сборка",
            "completed",
            day,
        )


def service_item(state, world, iid, item, used):
    if (
        item["status"] not in ("repair", "inspection")
        or item["status"] == "inspection"
        and item.get("rejected")
    ):
        return
    repair = item["status"] == "repair"
    entry = world["entries"][item["entry"]]
    key = f"{iid}/{item['status']}/{state['date']}"
    if key in state["estate"]["bookings"]:
        return
    try:
        lead, quality, _, _ = shift(
            state,
            world,
            entry,
            used,
            "factory" if repair else "quality",
            key,
            repair=repair,
        )
    except RuleError as error:
        item["reason"] = str(error)
        return
    if repair:
        item.update(
            repaired=True, status="inspection", rejected=False, queued=state["date"]
        )
        state["components"]["condition"][iid] = dict(
            components.condition(state, iid), damaged=False
        )
        code = "repaired"
    else:
        item["checks"] += 1
        serial, batch = physical_faults(state, iid)
        sample = draw(state, iid, f"inspection-{item['checks']}")
        if components.condition(state, iid)["damaged"] or (
            (serial or batch) and sample < 350 + quality * 6
        ):
            code = "batch-defect" if batch else "rejected"
            item["rejected"] = True
        elif sample >= 910 + quality // 2:
            code = "additional"
        else:
            code = "accepted"
            item.update(status="stock", rejected=False)
    item["reason"] = None
    record_work(
        state,
        world,
        lead,
        entry["org"],
        key,
        "assembly" if repair else "diagnosis",
        "Ремонт" if repair else "Диагностика",
        "completed",
    )
    log(
        state,
        entry["id"],
        components.spec(state, iid)["id"],
        code,
        lead,
        batch=item["batch"],
        instance=iid,
    )
    if code == "batch-defect":
        for other_id, other in sorted(state["production"]["items"].items()):
            if (
                other_id == iid
                or other["batch"] != item["batch"]
                or other.get("repaired")
                or other.get("rejected")
                or other["status"] in ("scrapped", "repair")
            ):
                continue
            other.update(
                status="inspection",
                rejected=True,
                queued=state["date"],
                reason="Партия отклонена по протоколу контроля качества.",
            )
            log(
                state,
                other["entry"],
                components.spec(state, other_id)["id"],
                "quarantine",
                lead,
                batch=item["batch"],
                instance=other_id,
            )
    if code == "accepted" and "council" not in state:
        from .planning import issue_to_car

        issue_to_car(state, world, iid, item)


def day(state, world, used):
    from .planning import npc_plan

    if "council" not in state:
        npc_plan(state, world)
    data = state["production"]
    for iid, item in sorted(
        data["items"].items(), key=lambda pair: (pair[1]["queued"], pair[0])
    ):
        if (
            item["status"] == "repair"
            or item["status"] == "inspection"
            and not item.get("rejected")
        ):
            service_item(state, world, iid, item, used)
    for batch in sorted(
        (b for b in data["batches"].values() if not b["finished"]), key=queue_position
    ):
        fabricate(state, world, batch, used)
