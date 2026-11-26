"""Dated absences and sporting nominations. The race director supplies registration windows."""

from typing import Literal
from pydantic import Field
from .domain import RuleError, occupant_on
from .staff_input import Fields, Id, Day
from .driver_terms import contract, history
from .personnel import bookings, active, shifted
from . import development_path, preparation


class Absence(Fields):
    reference: Id
    person: Id
    date: Day
    expected_return: Day
    reason: Literal["injury", "illness", "suspension", "other"]
    evidence: Id
    authority: Literal["medical", "stewards", "employer"]


class Clearance(Fields):
    reference: Id
    absence: Id
    date: Day
    authority: Literal["medical", "stewards", "employer"]
    evidence: Id


class DrivingTime(Fields):
    minimum_minutes: int = Field(ge=0)
    maximum_minutes: int = Field(gt=0)
    planned_minutes: int = Field(gt=0)


class Registration(Fields):
    reference: Id
    date: Day
    round: Id
    seat: Id
    regulation: Id
    deadline: Day
    phase: Literal["registration", "practice", "qualifying", "race", "closed"]
    approved: list[Id] = Field(max_length=300)
    # Championship approval is for this crew composition, class and driving-time plan.
    crew: list[Id]
    minimum_crew: int = Field(ge=1, le=8)
    driving_time_approved: bool
    # Each approved substitute has a separate complete plan for the prospective crew.
    driving_plans: dict[Id, dict[Id, DrivingTime]] = Field(default_factory=dict)
    running_minutes: int | None = Field(default=None, gt=0)
    evidence: Id


class Nomination(Fields):
    seat: Id
    round: Id
    person: Id


REASONS = {
    "injury": "Травма",
    "illness": "Заболевание",
    "suspension": "Дисквалификация",
    "other": "Временная недоступность",
}


def unavailable(state, person, day):
    return next(
        (
            r
            for r in state.get("lineup", {}).get("absences", {}).values()
            if r["person"] == person
            and r["date"] <= day
            and (not r.get("cleared") or day < r["cleared"])
        ),
        None,
    )


def participant(state, seat, day):
    principal = occupant_on(state["seats"][seat], day)
    if not principal or "lineup" not in state:
        return principal
    cover = next(
        (
            r
            for r in state["lineup"]["covers"].values()
            if r["seat"] == seat
            and r["principal"] == principal
            and r["start"] <= day < r["end"]
        ),
        None,
    )
    pid = cover["person"] if cover else principal
    return None if unavailable(state, pid, day) else pid


def event_for(world, rid):
    e = next(
        (e for e in world["events"] if e["id"] == rid and e["kind"] == "round"), None
    )
    if not e:
        raise RuleError("Этап отсутствует в календаре.")
    return e


def occupied(state, person, start, end):
    return any(
        r["person"] == person and r["start"] < end and start < r["end"]
        for r in state["lineup"]["covers"].values()
    )


def candidate(state, world, seat, event, pid, window):
    """Return the first actionable reason, for both managers and NPC."""
    p = state["people"].get(pid)
    start, end = max(event["start"], state["date"]), shifted(event["end"], 1)
    org = seat["org"]
    program = (
        state.get("capital", {})
        .get("programs", {})
        .get(world["entries"][seat["entry"]]["program"])
    )
    if program and (program["status"] != "admitted" or program["org"] != org):
        return "У команды нет действующей заявки в программе."
    if not p or p["position"] != "driver":
        return "Требуется пилот."
    if (
        unavailable(state, pid, start)
        or preparation.busy(state, pid, start, end)
        or occupied(state, pid, start, end)
    ):
        return "Пилот недоступен или занят в эти даты."
    admission = world["championships"][seat["series"]]["admission"]
    reason = development_path.eligibility(
        p, admission, start, starts=state["starts"].get(pid, {}).values()
    )
    if reason:
        return reason
    reason = development_path.eligibility(
        p, admission, event["end"], starts=state["starts"].get(pid, {}).values()
    )
    if reason:
        return reason
    from .employment import intersects

    for aid, row in bookings(state, pid):
        if not intersects(row, start, end):
            continue
        job = world["assignments"][aid]
        if (
            job.get("duty")
            and job["org"] == org
            and row["start"] <= start
            and (not row["end"] or row["end"] >= end)
        ):
            continue
        if job["org"] != org and not row.get("outside_starts"):
            return "Договор с другой организацией исключает замену."
        if any(
            e["series"] == job["series"]
            and e["kind"] in ("round", "testing")
            and e["start"] < end
            and start <= e["end"]
            for e in world["events"]
        ):
            return "Конфликт календаря действующего назначения."
    from .backing import right_of_first_offer

    try:
        right_of_first_offer(state, pid, org, state["date"])
    except RuleError as exc:
        return str(exc)
    if any(
        s["person"] == pid
        and active(s, start)
        and state["academies"][s["academy"]]["org"] != org
        and s.get("priority")
        for s in state["scholarships"].values()
    ):
        return "Нужно согласие академии с приоритетными правами."
    if not window or pid not in window["approved"]:
        return "Нет подтверждения регистрации кандидата."
    if state["date"] >= event["start"] and window["date"] != state["date"]:
        return "Ожидается актуальный протокол фазы уик-энда."
    if state["date"] > window["deadline"] or window["phase"] in ("race", "closed"):
        return "Регистрация закрыта для этой фазы уик-энда."
    peers = [
        participant(state, a["id"], start)
        for a in world["assignments"].values()
        if a["position"] == "driver" and a["entry"] == seat["entry"] and a != seat
    ]
    if (
        pid in peers
        or sorted(p for p in peers if p) != sorted(window["crew"])
        or len(set([pid, *window["crew"]])) < window["minimum_crew"]
    ):
        return "Изменился экипаж или нарушена его минимальная численность."
    if seat["series"] == "wec":
        plan = window["driving_plans"].get(pid, {})
        if (
            not window["driving_time_approved"]
            or len(peers) + 1 not in world["championships"]["wec"]["crew"]
            or set(plan) != {pid, *window["crew"]}
            or any(
                not r["minimum_minutes"] <= r["planned_minutes"] <= r["maximum_minutes"]
                for r in plan.values()
            )
            or sum(r["planned_minutes"] for r in plan.values())
            != window["running_minutes"]
        ):
            return "Не подтверждён план времени за рулём для экипажа."
    return None


def nominate(state, world, req, org):
    from .employment import ask, post
    from .finance.budget import authorize

    event = event_for(world, req.round)
    seat = world["assignments"].get(req.seat)
    if (
        not seat
        or seat["org"] != org
        or seat["position"] != "driver"
        or not seat["entry"]
        or seat["series"] != event["series"]
    ):
        raise RuleError("Этап или место вне полномочий.", 403)
    start = max(state["date"], event["start"])
    end = shifted(event["end"], 1)
    primary = contract(state, seat, start)
    if start >= end or not primary or not unavailable(state, primary["person"], start):
        raise RuleError("Для этапа нет подтверждённой недоступности основного пилота.")
    if primary["end"] and primary["end"] < end:
        raise RuleError("Основное назначение заканчивается до конца этапа.")
    key = req.seat + "|" + req.round
    existing = state["lineup"]["covers"].get(key)
    if (
        existing
        and existing["end"] > start
        and not unavailable(state, existing["person"], start)
    ):
        raise RuleError("Замена на этот этап уже оформлена.")
    window = state["lineup"]["windows"].get(key)
    reason = candidate(state, world, seat, event, req.person, window)
    if reason:
        raise RuleError(reason)
    paid = any(
        world["assignments"][aid]["org"] == org and active(row, start)
        for aid, row in bookings(state, req.person)
    )
    fee = 0 if paid else ask(state, world, state["people"][req.person], seat)
    if fee > state["mandates"][org]["limit_cents"]:
        raise RuleError("Вознаграждение превышает мандат.")
    authorize(state, world, org, "signing", fee, state["date"])
    post(state, org, f"relief-{state['revision']}-{key}-{req.person}", -fee, "signing")
    if not paid:
        state["seats"][req.seat + ":relief"].append(
            dict(
                person=req.person,
                start=start,
                end=end,
                agreed_end=end,
                salary_cents=0,
                buyout_cents=0,
                offer="relief:" + window["reference"] + ":" + req.person,
                position="driver",
                remit="standard",
                duty="relief",
                appearance_cents=fee,
            )
        )
    cover = dict(
        seat=req.seat,
        person=req.person,
        principal=primary["person"],
        start=start,
        end=end,
        round=req.round,
    )
    if existing:
        # Keep the actual participant on earlier days if the substitute also becomes unavailable.
        existing["end"] = min(existing["end"], start)
        state["lineup"]["covers"][key + "|" + str(state["revision"])] = existing
    state["lineup"]["covers"][key] = cover
    history(
        state,
        seat,
        req.person,
        "replacement",
        f"Замена на этап «{event['name']}».",
        principal=primary["person"],
        round=req.round,
        start=start,
        end=end,
        compensation_cents=fee,
    )


def npc(state, world):
    for w in state["lineup"]["windows"].values():
        seat = world["assignments"][w["seat"]]
        org = seat["org"]
        manager = occupant_on(state["seats"][org + ":manager"], state["date"])
        if (
            not manager
            or manager == state["player_id"]
            or w["phase"] in ("race", "closed")
            or w["deadline"] < state["date"]
        ):
            continue
        event = event_for(world, w["round"])
        start = max(state["date"], event["start"])
        primary = contract(state, seat, start)
        if not primary or not unavailable(state, primary["person"], start):
            continue

        def preference(pid):
            local = any(
                world["assignments"][aid]["org"] == org and active(row, start)
                for aid, row in bookings(state, pid)
            )
            return (not local, -state["people"][pid]["reputation"], pid)

        for pid in sorted(w["approved"], key=preference):
            try:
                nominate(
                    state,
                    world,
                    Nomination(seat=seat["id"], person=pid, round=w["round"]),
                    org,
                )
                break
            except RuleError:
                continue


def confirm(state, world, fact):
    desk = state["lineup"]
    if isinstance(fact, Registration):
        seat = world["assignments"].get(fact.seat)
        event = event_for(world, fact.round)
        if (
            not seat
            or not seat["entry"]
            or seat["position"] != "driver"
            or seat["series"] != event["series"]
            or fact.regulation != world["championships"][seat["series"]]["rules_id"]
            or fact.deadline > event["end"]
            or any(
                p not in state["people"] or state["people"][p]["position"] != "driver"
                for p in [*fact.approved, *fact.crew]
            )
        ):
            raise RuleError(
                "Протокол регистрации расходится с регламентом или составом."
            )
        desk["windows"][fact.seat + "|" + fact.round] = fact.model_dump()
    elif isinstance(fact, Absence):
        expected = {
            "injury": "medical",
            "illness": "medical",
            "suspension": "stewards",
            "other": "employer",
        }
        if (
            state["people"].get(fact.person, {}).get("position") != "driver"
            or fact.expected_return < fact.date
            or fact.authority != expected[fact.reason]
        ):
            raise RuleError("Источник или срок недоступности не подтверждён.")
        desk["absences"][fact.reference] = fact.model_dump()
        for plan in state["preparations"].values():
            if (
                plan["status"] == "scheduled"
                and fact.person in plan["participants"]
                and fact.date < plan["end"]
            ):
                plan["status"] = "interrupted"
        for aid, row in bookings(state, fact.person):
            if active(row, fact.date):
                history(
                    state,
                    world["assignments"][aid],
                    fact.person,
                    "absence",
                    REASONS[fact.reason],
                    expected_return=fact.expected_return,
                )
    else:
        absence = desk["absences"].get(fact.absence)
        if (
            not absence
            or absence.get("cleared")
            or fact.authority != absence["authority"]
        ):
            raise RuleError(
                "Допуск должен закрывать действующий период соответствующим органом."
            )
        absence["cleared"] = fact.date
        for k, cover in desk["covers"].items():
            if (
                cover["principal"] != absence["person"]
                or cover["end"] <= fact.date
                or unavailable(state, cover["principal"], fact.date)
            ):
                continue
            # A registered weekend finishes with its actual entrant. Before the weekend release the booking.
            window = desk["windows"].get(cover["seat"] + "|" + cover["round"])
            if (
                fact.date < cover["start"]
                and window
                and fact.date <= window["deadline"]
                and window["phase"] == "registration"
            ):
                cover["end"] = cover["start"]
                for r in state["seats"][cover["seat"] + ":relief"]:
                    if r["person"] == cover["person"] and r["start"] == cover["start"]:
                        r["end"] = r["start"]
        for aid, row in bookings(state, absence["person"]):
            if active(row, fact.date):
                history(
                    state,
                    world["assignments"][aid],
                    absence["person"],
                    "clearance",
                    "Получен подтверждённый допуск.",
                    reference=fact.reference,
                )
    npc(state, world)
