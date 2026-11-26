"""Command boundary for driver contracts, confirmed sporting facts and the team desk."""

from . import driver_terms as terms, driver_availability as availability
from .domain import RuleError
from .personnel import active

PRODUCERS = {
    "driver-absence": availability.Absence,
    "driver-clearance": availability.Clearance,
    "driver-registration": availability.Registration,
    "driver-decision": terms.Decision,
    "driver-restored": terms.Restored,
}
ORDERS = {"driver-review": terms.Review, "driver-nominate": availability.Nomination}


def confirm(state, world, action, args):
    fact = PRODUCERS[action].model_validate(args)
    facts = state["lineup"]["facts"]
    payload = dict(action=action, fact=fact.model_dump())
    if fact.reference in facts:
        if facts[fact.reference] != payload:
            raise RuleError("Источник уже зарегистрирован с другими сведениями.", 409)
        return
    if fact.date != state["date"]:
        raise RuleError("Дата протокола расходится с игровой датой.")
    if action == "driver-decision":
        terms.observe(state, world, fact)
    elif action == "driver-restored":
        terms.restore(state, world, fact)
    else:
        availability.confirm(state, world, fact)
    facts[fact.reference] = payload


def command(state, world, action, args):
    if state["setup"]["role"] != "manager":
        raise RuleError("Состав согласует действующий менеджер команды.", 403)
    request = ORDERS[action].model_validate(args)
    org = state["setup"]["org"]
    if action == "driver-review":
        terms.review(state, world, request, org)
    else:
        availability.nominate(state, world, request, org)


def desk(state, world):
    org = state["setup"]["org"]
    day = state["date"]
    data = state["lineup"]
    drivers = []
    resolved = {r["decision"] for r in data["history"] if r["kind"] == "restored"}
    for seat in world["assignments"].values():
        if seat["org"] != org or seat["position"] != "driver":
            continue
        row = terms.contract(state, seat, day)
        if not row or seat.get("duty") == "relief":
            continue
        pid = row["person"]
        absence = availability.unavailable(state, pid, day)
        reports = [
            r
            for r in data["history"]
            if r["org"] == org
            and (r["person"] == pid or r.get("favoured_entry") == seat["entry"])
            and r["kind"] == "difference"
            and r["reference"] not in resolved
            and r["date"] >= row["start"]
        ]
        duties = [seat.get("duty", "race")]
        if row.get("combined_duties"):
            duties = ["reserve", "test"]
        if any(
            s["person"] == pid and active(s, day)
            for s in state["scholarships"].values()
        ):
            duties.append("academy")
        drivers.append(
            dict(
                seat=seat["id"],
                entry=seat["entry"],
                series=seat["series"],
                person=pid,
                duties=duties,
                promised=row.get("driver_status"),
                start=row["start"],
                end=row["end"],
                salary_cents=row["salary_cents"],
                absence=absence,
                simulator=next(
                    (
                        p
                        for p in state["preparations"].values()
                        if p["kind"] == "simulator"
                        and p["org"] == org
                        and pid in p["participants"]
                        and p["status"] == "scheduled"
                    ),
                    None,
                ),
                work=[
                    dict(date=f["date"], kind=f["kind"], reference=f["event_id"])
                    for r in state["work_log"].values()
                    if (f := r["fact"])["person"] == pid
                    and f["org"] == org
                    and f["kind"] in ("simulator", "practice", "track-test")
                ][-5:]
                if seat.get("duty")
                else [],
                actual=reports[-1] if reports else None,
                observed=(
                    "Приоритет этой заявки"
                    if reports[-1]["favoured_entry"] == seat["entry"]
                    else "Приоритет заявки напарника"
                )
                if reports
                else None,
                grievances=len(terms.grievances(state, pid, org)),
            )
        )
    from .employment import ask

    windows = []
    for key, window in data["windows"].items():
        seat = world["assignments"][window["seat"]]
        if seat["org"] != org:
            continue
        event = availability.event_for(world, window["round"])
        primary = terms.contract(state, seat, max(day, event["start"]))
        if (
            event["end"] < day
            or not primary
            or not availability.unavailable(
                state, primary["person"], max(day, event["start"])
            )
            and not data["covers"].get(key)
        ):
            continue
        candidates = []
        for pid in window["approved"]:
            p = state["people"][pid]
            reason = availability.candidate(state, world, seat, event, pid, window)
            paid = any(
                world["assignments"][aid]["org"] == org
                and active(r, max(day, event["start"]))
                for aid, r in availability.bookings(state, pid)
            )
            candidates.append(
                dict(
                    person=pid,
                    name=p["name"],
                    reason=reason,
                    fee=0 if paid else ask(state, world, p, seat),
                )
            )
        cover = data["covers"].get(key)
        if cover and (
            cover["end"] <= max(day, event["start"])
            or availability.unavailable(
                state, cover["person"], max(day, event["start"])
            )
        ):
            cover = None
        if not cover and not availability.unavailable(
            state, primary["person"], max(day, event["start"])
        ):
            continue
        windows.append(
            dict(
                **window,
                name=event["name"],
                candidates=candidates,
                principal=primary["person"],
                cover=cover,
            )
        )
    return dict(
        drivers=drivers,
        windows=windows,
        history=[r for r in data["history"] if r["org"] == org][::-1],
    )
