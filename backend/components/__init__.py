"""Career component inventory, installation and verified operation (#45)."""

from hashlib import sha256
from datetime import date, timedelta
from pydantic import Field

from .. import driver_terms, lineup
from ..domain import RuleError, occupant_on
from ..finance.market import supplier_eligible
from ..staff_input import Fields, Id
from .catalog import parts_for, VERSION
from .registry import spec
from .design import assembly, development_margin, LABELS


class Install(Fields):
    entry: Id
    instance: Id


class Usage(Install):
    reference: Id
    distance_m: int = Field(ge=0, le=10**9)
    wear_ppm: int = Field(ge=0, le=10**6)
    damaged: bool


def initialize(state):
    state.setdefault(
        "components",
        dict(
            catalog="2025-parts-v3" if state.get("opening") else VERSION,
            since=state["revision"],
            date=state["date"],
            revisions={},
            admissions={},
            locked_slots={},
            inventory={},
            mounts={},
            condition={},
            history=[],
            usage={},
        ),
    )


def mounting(state, eid):
    return parts_for(state).installed[eid] | state["components"]["mounts"].get(eid, {})


def condition(state, iid):
    return state["components"]["condition"].get(
        iid, dict(distance_m=0, wear_ppm=0, damaged=False)
    )


def remaining(state, iid):
    return max(0, spec(state, iid)["life_m"] - condition(state, iid)["distance_m"])


def compatible(
    state,
    world,
    entry,
    drawing,
    *,
    year=None,
    for_review=False,
    planning=False,
    rollout=False,
):
    car = world["cars"][entry["car"]]
    slot = drawing["slot"]
    if slot in state["components"]["locked_slots"].get(entry["id"], {}):
        return False
    opening = state["car_configurations"][entry["car"]]["regulation"]
    if "programme" in state and (
        (year or int(state["date"][:4])) != 2025 or drawing.get("programme_concept")
    ):
        from ..programme.rules import dossier, admitted_version

        year = year or int(state["date"][:4])
        plan = dossier(state, world, entry, year)
        if (
            drawing["regulation"] not in (opening, plan["regulation"])
            or drawing.get("programme_concept", plan["concept"]) != plan["concept"]
        ):
            return False
        if not for_review and not admitted_version(state, world, entry, drawing, year):
            return False
    elif drawing["regulation"] != opening:
        return False
    if (
        "programme" in state
        and state["components"]["revisions"]
        and not (for_review or planning)
    ):
        from ..programme.packages import installation_dependency

        if not installation_dependency(state, entry, drawing):
            return False
    if drawing["interface"] != parts_for(state).interfaces[entry["id"]]:
        return False
    original = parts_for(state).installed[entry["id"]].get(slot)
    if not original:
        return False
    rule = parts_for(state).rules[car["regulation"]]
    certified = drawing["id"] in rule["approved"] or drawing["id"] in state[
        "components"
    ]["admissions"].get(drawing["regulation"], [])
    own_design = slot in rule["team_slots"] and drawing["manufacturer"] == entry["org"]
    if not (certified or own_design):
        return False
    fitted = mounting(state, entry["id"])
    if slot in ("transmission", "engine") and "transmission" in fitted:
        params = {
            k: (drawing if k == slot else spec(state, fitted[k]))["parameters"]
            for k in ("engine", "transmission")
        }
        if (
            params["engine"]["peak_torque_nm"]
            > params["transmission"]["input_limit_nm"]
        ):
            return False
    if slot in car["suppliers"]:
        from ..finance.market import contracted_supplier

        if "manufacturer" in state and contracted_supplier(state, entry, slot) not in (
            None,
            drawing["manufacturer"],
        ):
            return False
        if "manufacturer" in state and not (for_review or rollout):
            from ..manufacturer.rollout import market_key

            key = market_key(
                str(year or state["date"][:4]), entry, drawing["manufacturer"], slot
            )
            standard = state["manufacturer"]["standards"].get(key)
            if standard and drawing["id"] != standard:
                return False
        return supplier_eligible(
            state,
            world,
            entry,
            drawing["manufacturer"],
            slot,
            state["date"],
            (date.fromisoformat(state["date"]) + timedelta(days=1)).isoformat(),
        )
    return True


def stockroom(state, world, entry):
    org = entry["org"]
    mounted = {
        iid
        for e in world["entries"].values()
        if e["org"] == org
        for iid in mounting(state, e["id"]).values()
    }
    additions = [
        iid
        for iid, item in state["components"]["inventory"].items()
        if item["org"] == org
    ]
    return [
        iid
        for iid in [*parts_for(state).by_org.get(org, ()), *additions]
        if iid not in mounted
        and state.get("production", {})
        .get("items", {})
        .get(iid, {})
        .get("status", "stock")
        == "stock"
        and installable_revision(state, iid)
        and compatible(state, world, entry, spec(state, iid))
        and serviceable(state, iid)
    ]


def installable_revision(state, iid):
    if "production" not in state:
        return True
    drawing = spec(state, iid)
    project = state["development"]["projects"].get(drawing.get("reference"))
    return not project or project.get("disposition") == "released"


def serviceable(state, iid):
    current = condition(state, iid)
    return (
        not state.get("production", {}).get("items", {}).get(iid, {}).get("rejected")
        and not current["damaged"]
        and current["wear_ppm"] < 10**6
        and remaining(state, iid) > 0
    )


def seats_for(world, entry):
    return [
        s
        for s in world["assignments"].values()
        if s["position"] == "driver"
        and s["entry"]
        and s["org"] == entry["org"]
        and s["series"] == entry["championship"]
        and world["entries"][s["entry"]]["category"] == entry["category"]
    ]


def allocation(state, world, entry, iid, available, *, year=None, planned_entries=None):
    seats = seats_for(world, entry)
    # Allocate access to this scarce drawing, independent of its physical trade-offs.
    drawing = spec(state, iid)
    eligible = {}
    for seat in seats:
        other = world["entries"][seat["entry"]]
        if driver_terms.contract(state, seat, state["date"]) and compatible(
            state, world, other, drawing, year=year
        ):
            eligible[other["id"]] = mounting(state, other["id"])[drawing["slot"]]
    needed = {
        eid for eid, previous in eligible.items() if not serviceable(state, previous)
    }
    resource = "spare"
    if not needed:
        resource = "specification"
        needed = {
            eid
            for eid, previous in eligible.items()
            if spec(state, previous)["family"] == drawing["family"]
            and spec(state, previous)["version"] < drawing["version"]
        }
    if planned_entries is not None:
        # A future grid has no installations yet; each eligible entered car needs a unit.
        resource = "specification"
        needed = planned_entries.intersection(eligible)
    copies = [key for key in available if spec(state, key)["id"] == drawing["id"]]
    if len(copies) >= len(needed):
        # An optional exchange cannot consume the last copy needed by a teammate.
        reserved = (
            min(needed)
            if needed and len(copies) == len(needed) and entry["id"] not in needed
            else None
        )
        return reserved, set(), resource
    options = [
        driver_terms.ResourceOption(
            instance=key,
            specification=drawing["id"],
            merit=0,
            allowed_entries=sorted(needed),
        )
        for key in copies
    ]
    awarded = driver_terms.recommend(
        state, world, [s["id"] for s in seats], options, resource=resource
    )
    redirect = None if entry["id"] in awarded else next(iter(awarded))
    return redirect, needed - awarded.keys(), resource


def specialists(state, world, entry):
    if "supplier_axis" in entry:
        from ..supplier_engineering import staff

        return staff(state, entry)
    positions = {
        "chief-engineer",
        "chief-mechanic",
        "aero",
        "chassis",
        "performance",
        "reliability",
    }
    return {
        s["position"]: occupant_on(state["seats"][s["id"]], state["date"])
        for s in world["assignments"].values()
        if s["position"] in positions
        and s["org"] == entry["org"]
        and s["series"] in (None, entry["championship"])
        and s["entry"] in (None, entry["id"])
    }


def record_distribution(state, world, entry, iid, event_id, waiting, resource):
    drawing = spec(state, iid)
    seats = [
        s
        for s in seats_for(world, entry)
        if driver_terms.contract(state, s, state["date"])
    ]
    recipient = next((s for s in seats if s["entry"] == entry["id"]), None)
    if not recipient:
        return
    from ..production.planning import shortage_plan

    plan = shortage_plan(state, entry["org"], drawing["id"])
    for seat in seats:
        if seat["entry"] not in waiting:
            continue
        lineup.confirm(
            state,
            world,
            "driver-decision",
            dict(
                reference=f"{event_id}/{seat['id']}",
                date=state["date"],
                seat=seat["id"],
                favoured_seat=recipient["id"],
                resource=resource,
                evidence=f"Наряд {event_id}, машина №{entry['number']}.",
                reason=f"Распределён дефицитный комплект «{drawing['title']}».",
                severity=1,
                **plan,
            ),
        )


def installation_block(state, entry, staff):
    program = state["capital"]["programs"].get(entry["program"])
    if not program or program["status"] != "admitted" or program["org"] != entry["org"]:
        return "У команды нет действующего допуска этой программы."
    if not staff.get("chief-mechanic"):
        return "Для установки требуется назначенный главный механик."
    return None


def install(state, world, order, org):
    entry = world["entries"].get(order.entry)
    if not entry or entry["org"] != org:
        raise RuleError("Заявка вне полномочий команды.", 403)
    available = stockroom(state, world, entry)
    if order.instance not in available:
        raise RuleError(
            "Экземпляр занят, исчерпал ресурс или не допущен к этой машине."
        )
    staff = specialists(state, world, entry)
    reason = installation_block(state, entry, staff)
    if reason:
        raise RuleError(reason)
    data = state["components"]
    iid, drawing = order.instance, spec(state, order.instance)
    slot = drawing["slot"]
    previous = mounting(state, entry["id"])[slot]
    target, waiting, resource = allocation(state, world, entry, iid, available)
    if target:
        raise RuleError(
            "По договору пилотов этот экземпляр предназначен заявке №"
            + world["entries"][target]["number"]
            + "."
        )
    event_id = f"component-fit-{state['revision'] + 1}"
    if "production" in state:
        event_id += f"-{len(data['history']) + 1}"
    if "programme" in state and spec(state, previous)["id"] != drawing["id"]:
        from ..programme.packages import pin_before_fit

        pin_before_fit(state, world, entry, slot)
    data["mounts"].setdefault(entry["id"], {})[slot] = iid
    fitted = mounting(state, entry["id"])
    from ..programme.rules import config_for

    data["history"].append(
        dict(
            id=event_id,
            date=state["date"],
            revision=state["revision"] + 1,
            entry=entry["id"],
            car=entry["car"],
            slot=slot,
            removed=previous,
            removed_condition=dict(condition(state, previous)),
            instance=iid,
            configuration=dict(config_for(state, world, entry)),
            fitted=fitted,
            conditions={key: dict(condition(state, key)) for key in fitted.values()},
            mechanic=staff["chief-mechanic"],
            engineer=staff.get("chief-engineer"),
        )
    )
    if waiting:
        record_distribution(state, world, entry, iid, event_id, waiting, resource)
    resolve_differences(state, world, entry, slot, event_id)


def resolve_differences(state, world, entry, slot, event_id):
    data = state["lineup"]
    restored = {row["decision"] for row in data["history"] if row["kind"] == "restored"}
    installations = {
        e["id"] for e in state["components"]["history"] if e["slot"] == slot
    }
    for row in list(data["history"]):
        if row["kind"] != "difference" or entry["id"] not in (
            row["entry"],
            row["favoured_entry"],
        ):
            continue
        ref = row["reference"]
        if ref in restored or ref.split("/", 1)[0] not in installations:
            continue
        left, right = (
            mounting(state, row[k])[slot] for k in ("entry", "favoured_entry")
        )
        if (
            spec(state, left)["id"] == spec(state, right)["id"]
            and serviceable(state, left)
            and serviceable(state, right)
        ):
            lineup.confirm(
                state,
                world,
                "driver-restored",
                dict(
                    reference=f"{event_id}/restore/{ref}",
                    date=state["date"],
                    decision=ref,
                    evidence=f"По наряду {event_id} обе заявки получили одну спецификацию.",
                ),
            )


def apply_usage(state, world, usage):
    data = state["components"]
    event = dict(usage.model_dump(), date=state["date"])
    prior = data["usage"].get(usage.reference)
    if prior is not None:
        if any(prior[k] != v for k, v in usage.model_dump().items()):
            raise RuleError(
                "Протокол эксплуатации уже зарегистрирован с другими данными.", 409
            )
        return
    if (
        usage.entry not in world["entries"]
        or usage.instance not in mounting(state, usage.entry).values()
    ):
        raise RuleError("Экземпляр отсутствует в указанной сборке.")
    current = condition(state, usage.instance)
    data["condition"][usage.instance] = dict(
        distance_m=current["distance_m"] + usage.distance_m,
        wear_ppm=min(10**6, current["wear_ppm"] + usage.wear_ppm),
        damaged=current["damaged"] or usage.damaged,
    )
    data["usage"][usage.reference] = dict(event, revision=state["revision"] + 1)


def snapshot(state, fitted):
    return assembly({slot: spec(state, iid) for slot, iid in fitted.items()})


def visual_parts(state, eid):
    return {
        slot: spec(state, iid)["visual"]
        for slot, iid in state["components"]["mounts"].get(eid, {}).items()
        if spec(state, iid)["visual"]
    }


def serial(iid):
    return sha256(iid.encode()).hexdigest()[:12].upper()


def nominal_drawing(state, iid):
    from ..development.physics import estimate

    drawing = spec(state, iid)
    return dict(drawing, parameters=estimate(state, drawing))


def design_estimate(state, fitted):
    return assembly({slot: nominal_drawing(state, iid) for slot, iid in fitted.items()})


def describe(state, iid):
    drawing = spec(state, iid)
    return dict(
        instance=iid,
        serial=serial(iid),
        specification=drawing["id"],
        version=drawing["version"],
        title=drawing["title"],
        slot=drawing["slot"],
        parameters=nominal_drawing(state, iid)["parameters"],
        remaining_m=remaining(state, iid),
        **condition(state, iid),
    )


def concept_view(state, entry, staff, fitted):
    concept = state["car_configurations"][entry["car"]]["concept"]
    chief = state["people"].get(staff.get("chief-engineer"))
    regulation = state["car_configurations"][entry["car"]]["regulation"]
    if not chief or not parts_for(state).rules[regulation]["team_slots"]:
        return {}
    # The staff report can distinguish coarse bands only. Never project the latent ceiling.
    width = 0.05 if chief["skills"].get("Технические знания", 0) >= 75 else 0.1
    report = {}
    for slot in ("rear-wing", "floor", "suspension", "cooling", "chassis"):
        drawing = spec(state, fitted[slot])
        gain = development_margin(
            state["setup"]["seed"], concept, slot, drawing["refinements"]
        )
        low = int(gain / width) * width
        report[slot] = [round(100 * low), round(100 * (low + width))]
    return report


def desk(state, world, eid):
    entry = world["entries"].get(eid)
    if (
        not entry
        or entry["org"] != state["setup"]["org"]
        or state["setup"]["role"] == "manufacturer"
    ):
        raise RuleError("Технический паспорт доступен своей команде.", 403)
    fitted = mounting(state, eid)
    staff = specialists(state, world, entry)
    choices = []
    available = stockroom(state, world, entry)
    for iid in available:
        target, _, _ = allocation(state, world, entry, iid, available)
        choices.append(
            dict(
                **describe(state, iid),
                assigned_number=world["entries"][target]["number"]
                if target and target != eid
                else None,
            )
        )
    data = state["components"]
    events = [e for e in reversed(data["history"]) if e["entry"] == eid]
    return dict(
        parts={
            slot: dict(**describe(state, iid), label=LABELS[slot])
            for slot, iid in fitted.items()
        },
        spares=choices,
        installation_block=installation_block(state, entry, staff),
        locked_slots=data["locked_slots"].get(eid, {}),
        development=concept_view(state, entry, staff, fitted),
        policy=parts_for(state).rules[
            state["car_configurations"][entry["car"]]["regulation"]
        ]["mode"],
        assembly=design_estimate(state, fitted),
        since=data["date"],
        specialists={
            role: state["people"][pid]["name"] if pid else None
            for role, pid in staff.items()
        },
        history=[
            dict(
                date=e["date"],
                id=e["id"],
                slot=e["slot"],
                instance=e["instance"],
                removed=e["removed"],
                removed_condition=e["removed_condition"],
                fitted={
                    k: dict(
                        instance=v,
                        serial=serial(v),
                        version=spec(state, v)["version"],
                        title=spec(state, v)["title"],
                        **e["conditions"][v],
                    )
                    for k, v in e["fitted"].items()
                },
                mechanic=state["people"][e["mechanic"]]["name"],
                assembly=design_estimate(state, e["fitted"]),
            )
            for e in events
        ],
        usage=[e for e in data["usage"].values() if e["instance"] in fitted.values()],
    )


def write_install_fact(db, cid, state, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch

    entry = world["entries"][event["entry"]]
    drawing = spec(state, event["instance"])
    context = dict(
        org=entry["org"],
        org_name=world["organizations"][entry["org"]]["name"],
        person=event["mechanic"],
        program=entry["program"],
        component=dict(
            manufacturer=drawing["manufacturer"],
            product=drawing["slot"],
            component=drawing["slot"],
            specification=drawing["family"],
            version=drawing["id"],
            instance=event["instance"],
        ),
    )
    facts.record(
        db,
        cid,
        Batch(
            facts=[
                dict(
                    version=1,
                    day=event["date"],
                    access="technical",
                    data=dict(
                        kind="specification-change",
                        context=context,
                        source_id=event["id"],
                        code="installed",
                        reference=event["car"],
                    ),
                )
            ]
        ),
    )
