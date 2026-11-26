"""Dated professional relationships. Work accrues only across occupied, compatible appointments."""

from collections import defaultdict
from datetime import date
from hashlib import sha256
from itertools import combinations

from .domain import RuleError, occupant_on
from .personnel import evaluate


def bounded(value):
    return max(0, min(100, value))


def initialize(state, world):
    state.update(relationships={}, cooperation_events={})
    for p in state["people"].values():
        if p["position"] == "driver":
            sample = sha256((p["id"] + "-handling").encode()).digest()
            p["preferences"] = {
                "Баланс": sample[0] % 101,
                "Отклик на поворот": sample[1] % 101,
            }
    for group in state["collectives"].values():
        sample = sha256(group["id"].encode()).digest()
        group.update(
            precision=50 + sample[0] % 46,
            speed=50 + sample[1] % 46,
            pressure=45 + sample[2] % 51,
            motivation=65,
            atmosphere=60,
            team_days=0,
        )


def partnerships(state, world, day):
    """Only recurring professional contacts, including distinct WEC entry crews."""
    programs = defaultdict(lambda: defaultdict(list))
    for aid, seat in world["assignments"].items():
        if seat.get("academy"):
            continue
        pid = occupant_on(state["seats"][aid], day)
        if not pid:
            continue
        org = seat["org"]
        for series in (
            [seat["series"]]
            if seat["series"]
            else world["organizations"][org]["programs"]
        ):
            programs[org, series][seat["position"]].append((pid, seat["entry"]))
    groups = defaultdict(dict)
    for g in state["collectives"].values():
        groups[g["org"]][g["name"]] = g["id"]
    result = {}

    def connect(kind, a, b, org):
        if a != b:
            result[kind + "|" + a + "|" + b] = (kind, a, b, org)

    for (org, _), roles in programs.items():
        for driver, entry in roles["driver"]:
            for engineer, car in roles["race-engineer"]:
                if entry == car:
                    connect("feedback", driver, engineer, org)
            for strategist, _ in roles["strategist"]:
                connect("strategy", driver, strategist, org)
        for a, b in combinations(sorted(pid for pid, _ in roles["driver"]), 2):
            connect("teammates", a, b, org)
        for lead in (
            "aero",
            "chassis",
            "performance",
            "reliability",
            "engines",
            "transmissions",
            "tyres",
            "tyre-construction",
            "chief-analyst",
        ):
            for person, _ in roles[lead]:
                for chief, _ in roles["chief-engineer"]:
                    connect("technical", person, chief, org)
        units = groups[org]
        for lead, unit in (
            ("chief-mechanic", "Механики и пит-бригада"),
            ("aero", "Аэродинамика"),
            ("chassis", "Шасси"),
            ("performance", "Силовая установка"),
            ("reliability", "Надёжность"),
            ("chief-engineer", "Инженеры"),
            ("chief-engineer", "Производственные рабочие"),
        ):
            if unit in units:
                for person, _ in roles[lead]:
                    connect("workshop", person, units[unit], org)
        for left, right in (
            ("Аэродинамика", "Шасси"),
            ("Шасси", "Силовая установка"),
            ("Силовая установка", "Надёжность"),
            ("Инженеры", "Производственные рабочие"),
        ):
            if left in units and right in units:
                connect("handover", units[left], units[right], org)
    return result


def entry_for(pair, day):
    kind, a, b, org = pair
    return dict(
        kind=kind, a=a, b=b, org=org, days=0, trust_change=0, spells=[], first=day
    )


def work(state, world, start, end):
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    for group in state["collectives"].values():
        if group["size"] > 0 and group["workload"] > 0:
            group["team_days"] += days
    for key, pair in partnerships(state, world, start).items():
        r = state["relationships"].setdefault(key, entry_for(pair, start))
        spells = r["spells"]
        if spells and spells[-1]["end"] == start and spells[-1]["org"] == pair[3]:
            spells[-1]["end"] = end
        else:
            spells.append(dict(org=pair[3], start=start, end=end))
        r["days"] += days
        r["org"] = pair[3]


def trust(r):
    return bounded(50 + min(18, r["days"] // 7) + r["trust_change"])


# Each source describes an observed interaction. A finishing position alone cannot attribute fault.
EVENTS = {
    "confirmed-feedback": ("feedback", 3),
    "unclear-feedback": ("feedback", -1),
    "sound-advice": ("strategy", 4),
    "missed-warning": ("strategy", -4),
    "cooperation": ("teammates", 3),
    "conflict": ("teammates", -5),
    "successful-work": ("workshop", 3),
    "rework": ("workshop", -3),
    "verified-analysis": ("technical", 3),
    "incomplete-analysis": ("technical", -2),
    "accepted-handover": ("handover", 3),
    "incomplete-handover": ("handover", -3),
}


def record_event(state, world, actor, peer, outcome, source_id, day):
    if outcome not in EVENTS or not source_id:
        raise RuleError("Нужен подтверждённый результат совместной работы.")
    kind, change = EVENTS[outcome]
    if kind == "teammates":
        actor, peer = sorted((actor, peer))
    key = "|".join((kind, actor, peer))
    receipt = key + "|" + source_id
    event = dict(date=day, outcome=outcome, pair=key, source=source_id)
    previous = state["cooperation_events"].get(receipt)
    if previous:
        if any(previous[k] != v for k, v in event.items()):
            raise RuleError("Событие работы уже учтено с другим результатом.")
        return
    pair = partnerships(state, world, day).get(key)
    if not pair:
        raise RuleError("Сотрудники не работают вместе в указанную дату.")
    r = state["relationships"].setdefault(key, entry_for(pair, day))
    r["trust_change"] = max(-50, min(50, r["trust_change"] + change))
    state["cooperation_events"][receipt] = dict(event, org=pair[3])
    morale_change = change
    if kind == "teammates" and change < 0:
        manager = occupant_on(state["seats"][pair[3] + ":manager"], day)
        if manager:
            leader = evaluate(state["people"][manager], world, day)["values"]
            morale_change += (
                leader["Разрешение конфликтов"] + leader["Лидерство"]
            ) // 65
    for member in (actor, peer):
        if member in state["collectives"]:
            g = state["collectives"][member]
            g["motivation"] = bounded(g["motivation"] + change)
            g["atmosphere"] = bounded(g["atmosphere"] + (2 if change > 0 else -3))
        elif kind == "teammates":
            p = state["people"][member]
            p["morale"] = bounded(p["morale"] + morale_change)


def links(state, world, member, day, current=None):
    current = partnerships(state, world, day) if current is None else current
    keys = {
        key for key, r in state["relationships"].items() if member in (r["a"], r["b"])
    }
    keys.update(key for key, (_, a, b, _) in current.items() if member in (a, b))
    rows = []
    for key in sorted(keys):
        r = state["relationships"].get(key) or entry_for(current[key], day)
        peer = r["b"] if member == r["a"] else r["a"]
        entity = state["people"].get(peer) or state["collectives"][peer]
        observed = state["setup"]["org"] == (
            current[key][3] if key in current else r["org"]
        )
        rows.append(
            dict(
                kind=r["kind"],
                peer=peer,
                name=entity["name"],
                days=r["days"],
                active=key in current,
                trust=trust(r) if observed else None,
                spells=r["spells"],
                events=[
                    e
                    for e in state["cooperation_events"].values()
                    if e["pair"] == key and e["org"] == state["setup"]["org"]
                ],
            )
        )
    return rows


def cohesion(group):
    return bounded(40 + group["team_days"] // 5 + group["motivation"] - 65)


def professional_action(state, world, pair, day, *, evidence=50, pressure=0):
    """Professional inputs for one interaction; evidence is the actor's observation quality (0–100)."""
    if not all(type(v) is int and 0 <= v <= 100 for v in (evidence, pressure)):
        raise RuleError("Качество наблюдения и давление должны быть в пределах шкалы.")
    kind, a, b, org = pair
    r = state["relationships"].get("|".join((kind, a, b))) or entry_for(pair, day)
    familiarity = min(100, r["days"] * 2)
    confidence = trust(r)

    def skills(pid):
        return evaluate(state["people"][pid], world, day)["values"]

    if kind == "feedback":
        d, e = skills(a), skills(b)
        quality = (
            2 * d["Обратная связь"]
            + e["Коммуникация"]
            + e["Понимание пилота"]
            + evidence
            + confidence
            + familiarity
        ) // 7
        return dict(
            quality=quality,
            decision="endorse" if quality >= 62 else "seek-evidence",
            preferences=state["people"][a]["preferences"],
        )
    if kind == "strategy":
        d, s = skills(a), skills(b)
        clarity = (s["Прогнозирование"] + s["Анализ данных"] + evidence) // 3
        acceptance = bounded(
            (
                2 * confidence
                + clarity
                + d["Работа под давлением"]
                + state["people"][a]["loyalty"]
            )
            // 5
            - pressure // 5
            - max(0, 50 - evidence) * d["Оценка риска"] // 300
        )
        return dict(
            advice_confidence=clarity,
            order_acceptance=acceptance,
            initiative=state["people"][a]["ambition"],
            adaptability=state["people"][b]["adaptability"],
            decision="accept"
            if acceptance >= 60
            else "challenge"
            if acceptance >= 40
            else "decline",
        )
    if kind == "teammates":
        return dict(
            willingness=bounded(
                (
                    confidence * 2
                    + state["people"][a]["morale"]
                    + state["people"][b]["morale"]
                )
                // 4
            )
        )
    if kind == "workshop":
        g = state["collectives"][b]
        leader = skills(a)
        coordination = leader.get(
            "Координация", leader[state["people"][a]["specialization"]]
        )
        return dict(
            work_speed=(
                2 * g["speed"] + confidence + familiarity + coordination + cohesion(g)
            )
            // 6,
            precision=bounded(
                (2 * g["precision"] + g["qualification"] + g["motivation"]) // 4
                - pressure * (100 - g["pressure"]) // 200
            ),
        )
    if kind == "handover":
        return dict(
            handover_quality=(
                confidence
                + familiarity
                + state["collectives"][a]["precision"]
                + state["collectives"][b]["atmosphere"]
                + evidence
            )
            // 5
        )
    if kind == "technical":
        return dict(
            review_quality=(
                skills(b)["Координация"] + evidence + confidence + familiarity
            )
            // 4
        )
    raise RuleError("Неизвестный вид совместной работы.")


def review_course(state, world, p, day, skill):
    if p["position"] != "driver":
        return 0
    for pair in partnerships(state, world, day).values():
        if pair[0] == "feedback" and pair[1] == p["id"]:
            observation = evaluate(p, world, day)["values"][skill]
            review = professional_action(state, world, pair, day, evidence=observation)
            endorsed = review["decision"] == "endorse"
            record_event(
                state,
                world,
                pair[1],
                pair[2],
                "confirmed-feedback" if endorsed else "unclear-feedback",
                "course-" + p["id"] + "-" + day,
                day,
            )
            return int(endorsed)
    return 0


def group_view(state, world, g, current):
    day = state["date"]
    contacts = links(state, world, g["id"], day, current)
    return dict(
        cohesion=cohesion(g),
        relationships=contacts,
    )


def session_inputs(state, world, entry, event, actor, *, evidence, pressure):
    """Private inputs for the assigned actor during this entry's session (#7–9)."""
    e = world["entries"][entry]
    if (
        event["series"] != e["championship"]
        or not event["start"] <= state["date"] <= event["end"]
    ):
        raise RuleError("Сессия не соответствует дате и заявке.")
    program = world["assignments"]
    assigned = {
        occupant_on(state["seats"][aid], state["date"])
        for aid, s in program.items()
        if s["org"] == e["org"]
        and not s.get("academy")
        and s["entry"] in (entry, None)
        and s["series"] in (None, event["series"])
    }
    if actor not in assigned or actor not in state["people"]:
        raise RuleError("У сотрудника нет назначения в этой заявке.")
    results = []
    for pair in partnerships(state, world, state["date"]).values():
        kind, a, b, org = pair
        if org != e["org"] or actor not in (a, b):
            continue
        if kind in ("feedback", "strategy") and a not in assigned:
            continue
        results.append(
            dict(
                action=kind,
                colleague=b if a == actor else a,
                **professional_action(
                    state,
                    world,
                    pair,
                    state["date"],
                    evidence=evidence,
                    pressure=pressure,
                ),
            )
        )
    return results
