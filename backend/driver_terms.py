"""Agreed sporting terms on the existing employment contract and confirmed decisions."""

from typing import Literal
from pydantic import Field
from .domain import RuleError, occupant_on
from .staff_input import Fields, Id, Day
from .personnel import active
from . import teamwork

Status = Literal["first", "second", "equal"]
LABELS = {
    "first": "Первый пилот",
    "second": "Второй пилот",
    "equal": "Равноправный пилот",
}


class Review(Fields):
    seat: Id
    status: Status
    compensation_cents: int = Field(ge=0, le=10**10)


class Decision(Fields):
    reference: Id
    date: Day
    seat: Id
    favoured_seat: Id
    resource: Literal["specification", "spare", "development", "setup", "strategy"]
    basis: Literal["allocation", "condition", "personal-setup", "pace"] = "allocation"
    reason: Id
    evidence: Id  # Information actually available to this driver
    exception: (
        Literal["damage", "logistics", "test", "shortage", "regulation", "sporting"]
        | None
    ) = None
    remedy: Id | None = None
    due: Day | None = None
    severity: int = Field(ge=1, le=3)


def initialize(state, world):
    if "lineup" in state:
        return
    state["lineup"] = dict(
        since=state["revision"],
        facts={},
        history=[],
        absences={},
        covers={},
        windows={},
    )
    for aid, seat in world["assignments"].items():
        if seat.get("duty"):
            state["seats"].setdefault(aid, [])
        elif seat["position"] == "driver":
            for row in state["seats"][aid]:
                row["driver_status"] = "equal"


def history(state, seat, pid, kind, message, **data):
    rows = state["lineup"]["history"]
    rows.append(
        dict(
            id=f"lineup-{len(rows) + 1}",
            date=state["date"],
            org=seat["org"],
            series=seat["series"],
            entry=seat["entry"],
            seat=seat["id"],
            person=pid,
            kind=kind,
            message=message,
            **data,
        )
    )


def peers(world, seat):
    entry = world["entries"][seat["entry"]]
    return (
        s
        for s in world["assignments"].values()
        if s["position"] == "driver"
        and s["entry"]
        and s["org"] == seat["org"]
        and s["series"] == seat["series"]
        and world["entries"][s["entry"]]["category"] == entry["category"]
    )


def contract(state, seat, day):
    return next((r for r in state["seats"][seat["id"]] if active(r, day)), None)


def grievances(state, person, org):
    return [
        r
        for r in state.get("lineup", {}).get("history", [])
        if r["person"] == person and r["org"] == org and r["kind"] == "grievance"
    ]


def assessment(state, p, org, status, previous):
    step = {"first": 2, "equal": 1, "second": 0}
    delta = step[status] - step[previous]
    complaints = len(grievances(state, p["id"], org))
    wins = sum(
        1 for r in state["starts"].get(p["id"], {}).values() if r.get("place") == 1
    )
    manager = occupant_on(state["seats"][org + ":manager"], state["date"])
    relation = state["relationships"].get(f"hierarchy|{p['id']}|{manager}")
    resolve = ((50 - teamwork.trust(relation)) // 5 if relation else 0) + (
        p["ambition"]
        + min(12, wins * 3)
        + min(15, complaints * 5)
        - (p["loyalty"] - 50) // 4
    )
    if delta < 0 and resolve >= 86:
        return (
            -25,
            "Отказывается уступить спортивный статус с учётом своих карьерных целей.",
        )
    if complaints >= 3 and status == previous:
        return -25, "Требует пересмотра роли после повторных нарушений договорённостей."
    return delta * (5 + max(0, resolve) // 10) - min(15, complaints * 4), None


def compatible(seat, status, peer, other):
    if seat["entry"] == peer["entry"]:
        return status == other
    if "equal" in (status, other):
        return status == other
    return not (status == other == "first")


def validate_offer(state, world, seat, offer):
    status = offer.get("driver_status")
    if seat.get("duty") == "relief":
        raise RuleError("Это назначение оформляется только при временной замене.")
    if seat["position"] != "driver" and offer.get("outside_starts"):
        raise RuleError("Разрешение на выступления относится к контракту пилота.")
    if seat["position"] != "driver" or seat.get("duty"):
        if status:
            raise RuleError("Спортивный статус предусмотрен для основного пилота.")
        if offer.get("combined_duties") and not seat.get("duty"):
            raise RuleError("Совмещение относится к резерву и испытаниям.")
        return
    if offer.get("combined_duties"):
        raise RuleError("Выберите место резервного или тестового пилота.")
    status = status or "equal"
    for peer in peers(world, seat):
        if peer == seat:
            continue
        for row in state["seats"][peer["id"]]:
            if row["start"] >= offer["end"] or (
                row["end"] and row["end"] <= offer["start"]
            ):
                continue
            other = row.get("driver_status", "equal")
            if not compatible(seat, status, peer, other):
                raise RuleError(
                    "Условия расходятся с обещаниями экипажу. Согласуйте иерархию состава."
                )


def review(state, world, request, org):
    from .employment import post
    from .finance.budget import authorize

    seat = world["assignments"].get(request.seat)
    if (
        not seat
        or seat["org"] != org
        or seat["position"] != "driver"
        or not seat["entry"]
    ):
        raise RuleError("Основное место вне полномочий.", 403)
    day = state["date"]
    rows = [(s, contract(state, s, day)) for s in peers(world, seat)]
    if not contract(state, seat, day):
        raise RuleError("Место вакантно.")
    entries = sorted({s["entry"] for s, r in rows if r and s["entry"] != seat["entry"]})
    if request.status == "second" and len(entries) != 1:
        raise RuleError("Укажите экипаж, которому предлагается первый статус.")
    leader = seat["entry"] if request.status == "first" else next(iter(entries), None)
    changes = []
    for s, row in rows:
        if not row:
            continue
        new = (
            "equal"
            if request.status == "equal"
            else "first"
            if s["entry"] == leader
            else "second"
        )
        old = row.get("driver_status", "equal")
        if new == old:
            continue
        p = state["people"][row["person"]]
        score, veto = assessment(state, p, org, new, old)
        cost = max(0, -score) * row["salary_cents"] // 100
        changes.append((s, row, new, cost))
        if veto or cost > request.compensation_cents:
            message = (
                veto
                or f"Запрашивает компенсацию {cost / 100:,.2f} € за изменение условий."
            )
            history(state, s, p["id"], "refused", message, proposed=new)
            return
    if not changes:
        raise RuleError("Этот статус уже согласован.")
    # Future signed appointments must remain compatible as well.
    for s, row, new, _ in changes:
        for peer, _ in rows:
            for future in state["seats"][peer["id"]]:
                if (
                    future["start"] > day
                    and (not row["end"] or future["start"] < row["end"])
                    and not compatible(s, new, peer, future["driver_status"])
                ):
                    raise RuleError(
                        "Уже подписан будущий договор. Сначала согласуйте сроки."
                    )
    total = sum(cost for _, _, _, cost in changes)
    if total > state["mandates"][org]["limit_cents"]:
        raise RuleError("Компенсация превышает мандат менеджера.")
    authorize(state, world, org, "signing", total, day)
    post(state, org, f"status-{state['revision']}", -total, "signing")
    for s, row, new, cost in changes:
        row["driver_status"] = new
        history(
            state,
            s,
            row["person"],
            "agreed",
            "Изменение статуса согласовано.",
            status=new,
            compensation_cents=cost,
        )


class ResourceOption(Fields):
    instance: Id
    specification: Id
    merit: int  # Comparable specification tier supplied by engineering, excluding setup/pace
    allowed_entries: list[
        Id
    ]  # Homologation, equal supply, parc ferme and fit cleared upstream


def recommend(
    state, world, seats, options: list[ResourceOption], *, resource="specification"
):
    """Non-mutating handoff for #7. One physical instance per distinct entry."""
    if len({x.instance for x in options}) != len(options):
        raise RuleError("Экземпляр указан дважды.")
    entries = {}
    scope = None
    for aid in seats:
        s = world["assignments"][aid]
        if not s["entry"] or s["position"] != "driver":
            raise RuleError("Требуется гоночная заявка.")
        group = (s["org"], s["series"], world["entries"][s["entry"]]["category"])
        if scope and scope != group:
            raise RuleError("Разные программы распределения.")
        scope = group
        r = contract(state, s, state["date"])
        if r:
            prior = sum(
                1
                for h in state["lineup"]["history"]
                if h.get("favoured_entry") == s["entry"]
                and h.get("resource") == resource
            )
            entries[s["entry"]] = (r.get("driver_status") != "first", prior, s["entry"])
    available = sorted(
        options,
        key=lambda x: (
            -x.merit,
            len(set(x.allowed_entries) & entries.keys()),
            x.instance,
        ),
    )
    # Reassign an equivalent instance if it is the only legal fit for another entry.
    # Earlier priorities retain their best available specification tier.
    owners = {}

    def assign(entry, seen, required_merit=None):
        for option in sorted(
            available, key=lambda opt: (-opt.merit, opt.instance in owners)
        ):
            if (
                entry not in option.allowed_entries
                or option.instance in seen
                or required_merit is not None
                and option.merit != required_merit
            ):
                continue
            seen.add(option.instance)
            previous = owners.get(option.instance)
            if previous is None or assign(previous, seen, option.merit):
                owners[option.instance] = entry
                return True
        return False

    for entry in sorted(entries, key=entries.get):
        assign(entry, set())
    return {entry: instance for instance, entry in owners.items()}


def observe(state, world, fact):
    seat = world["assignments"].get(fact.seat)
    other = world["assignments"].get(fact.favoured_seat)
    if (
        not seat
        or not seat["entry"]
        or seat["position"] != "driver"
        or other not in peers(world, seat)
        or other["entry"] == seat["entry"]
    ):
        raise RuleError("Решение не относится к сравнимым заявкам.")
    row = contract(state, seat, fact.date)
    favoured = contract(state, other, fact.date)
    if not row or not favoured:
        raise RuleError("Факт не подтверждён назначениями.")
    if (
        bool(fact.exception) != bool(fact.remedy)
        or bool(fact.exception) != bool(fact.due)
        or (fact.due and fact.due < fact.date)
    ):
        raise RuleError("Для исключения нужны причина, план и срок устранения.")
    pid = row["person"]
    if fact.basis != "allocation":
        history(
            state,
            seat,
            pid,
            "observation",
            fact.reason,
            basis=fact.basis,
            evidence=fact.evidence,
            reference=fact.reference,
        )
        return
    resolved = {
        r["decision"] for r in state["lineup"]["history"] if r["kind"] == "restored"
    }
    previous = [
        r
        for r in state["lineup"]["history"]
        if r["person"] == pid
        and r["org"] == seat["org"]
        and r["kind"] == "difference"
        and r["reference"] not in resolved
        and r["seat"] == seat["id"]
        and r["date"] >= row["start"]
        and r["resource"] == fact.resource
        and r["status"] == row["driver_status"]
    ]
    history(
        state,
        seat,
        pid,
        "difference",
        fact.reason,
        **dict(
            resource=fact.resource,
            status=row["driver_status"],
            evidence=fact.evidence,
            favoured_entry=other["entry"],
            exception=fact.exception,
            remedy=fact.remedy,
            due=fact.due,
            reference=fact.reference,
        ),
    )
    overdue = any(
        r["due"] and r["due"] < fact.date and r["resource"] == fact.resource
        for r in previous
    )
    opportunities_received = sum(
        1
        for r in state["lineup"]["history"]
        if r["kind"] == "difference"
        and r["status"] == "equal"
        and not r["exception"]
        and r["reference"] not in resolved
        and r["resource"] == fact.resource
        and r["entry"] == other["entry"]
        and r["favoured_entry"] == seat["entry"]
        and r["date"] >= row["start"]
    )
    if (
        fact.exception
        and not overdue
        or row["driver_status"] == "second"
        or row["driver_status"] == "equal"
        and sum(
            1
            for r in previous
            if not r["exception"] and r["favoured_entry"] == other["entry"]
        )
        <= opportunities_received
        and not overdue
    ):
        return
    p = state["people"][pid]
    damage = (
        fact.severity + (p["ambition"] >= 75) + min(3, len(previous)) + int(overdue)
    )
    p["morale"] = max(0, p["morale"] - damage)
    manager = occupant_on(state["seats"][seat["org"] + ":manager"], fact.date)
    if manager:
        pair = ("hierarchy", pid, manager, seat["org"])
        rel = state["relationships"].setdefault(
            "|".join(pair[:3]), teamwork.entry_for(pair, fact.date)
        )
        rel["trust_change"] = max(-50, rel["trust_change"] - damage)
    history(
        state,
        seat,
        pid,
        "grievance",
        "Просит обсудить нарушенные условия. " + fact.reason,
        reference=fact.reference,
    )


class Restored(Fields):
    reference: Id
    date: Day
    decision: Id
    evidence: Id


def restore(state, world, fact):
    original = state["lineup"]["facts"].get(fact.decision)
    if not original or original["action"] != "driver-decision":
        raise RuleError("Не найдено исходное решение.")
    if any(r.get("decision") == fact.decision for r in state["lineup"]["history"]):
        raise RuleError("Исполнение уже подтверждено.")
    if original["fact"]["basis"] != "allocation":
        raise RuleError("Исходное наблюдение не относится к распределению ресурсов.")
    difference = next(
        r
        for r in state["lineup"]["history"]
        if r["kind"] == "difference" and r["reference"] == fact.decision
    )
    seat = world["assignments"][difference["seat"]]
    history(
        state,
        seat,
        difference["person"],
        "restored",
        "Различие устранено. " + fact.evidence,
        decision=fact.decision,
        reference=fact.reference,
    )


class StrategyContext(Fields):
    seat: Id
    permitted: bool
    risk_acceptable: bool
    championship_priority: bool


def strategy_priority(state, world, context: StrategyContext):
    seat = world["assignments"].get(context.seat)
    if not seat or seat["position"] != "driver" or not seat["entry"]:
        raise RuleError("Нет места пилота для решения стратегии.")
    row = contract(state, seat, state["date"])
    if not row or not context.permitted or not context.risk_acceptable:
        return "hold"
    if context.championship_priority:
        return "championship"
    return row["driver_status"]


def npc_review(state, world):
    """Reopen a real agreement only after new sporting evidence or a complaint."""
    cases = {}
    for pid, starts in state["starts"].items():
        for result in starts.values():
            if result.get("place") == 1 and result.get("entry"):
                cases[pid] = max(cases.get(pid, ""), result["day"])
    for r in state["lineup"]["history"]:
        if r["kind"] == "grievance":
            cases[r["person"]] = r["date"]
    if not cases:
        return
    for seat in world["assignments"].values():
        if seat["position"] != "driver" or not seat["entry"]:
            continue
        day, org = state["date"], seat["org"]
        row = contract(state, seat, day)
        if not row or row["person"] not in cases or row["driver_status"] == "first":
            continue
        manager = occupant_on(state["seats"][org + ":manager"], day)
        if (
            not manager
            or manager == state["player_id"]
            or row["start"] > cases[row["person"]]
        ):
            continue
        if any(
            h["org"] == org
            and h["kind"] in ("agreed", "refused")
            and h["date"] >= cases[row["person"]]
            for h in state["lineup"]["history"]
        ):
            continue
        mandate = state["mandates"][org]
        status = "first" if mandate["goal"] == "performance" else "equal"
        if row["driver_status"] != status:
            try:
                review(
                    state,
                    world,
                    Review(
                        seat=seat["id"],
                        status=status,
                        compensation_cents=mandate["limit_cents"],
                    ),
                    org,
                )
            except RuleError:
                continue
