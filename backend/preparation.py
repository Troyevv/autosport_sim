"""Approved allocations buy a dated facility slot. Staff select the participants and complete the work."""

from .domain import RuleError
from .personnel import active, bookings, shifted
from .professional import Activity, record, assigned

# Season-one bookable facilities; costs in eurocents, elapsed days and individual workload.
PROGRAMS = {
    "bench-test": ("Инженерные испытания", "Испытательный стенд", 2, 65000, 8),
    "simulator": ("Симулятор", "Аренда симулятора", 2, 42000, 9),
    "fitness": ("Физическая подготовка", "Спортивный зал", 3, 18000, 12),
    "pit-drill": ("Отработка пит-стопов", "Тренировочный бокс", 1, 26000, 10),
    "academy": ("Практика воспитанников", "Симулятор с наставником", 3, 51000, 9),
    "debrief": ("Разбор выполненной работы", "Рабочее место анализа", 1, 8000, 3),
}


def overlaps(a, b, x, y):
    return a < y and x < b


def busy(state, pid, start, end):
    return any(
        r["status"] == "scheduled"
        and pid in r["participants"]
        and overlaps(start, end, r["start"], r["end"])
        for r in state["preparations"].values()
    )


def eligible(state, world, pid, org, start, end, academy=False):
    member = state["people"].get(pid) or state["collectives"][pid]
    if member["fatigue"] >= 60 or busy(state, pid, start, end):
        return False
    if any(
        r["advisor"] == pid and overlaps(start, end, r["start"], r["end"])
        for r in state["support"]
    ):
        return False
    assignments = [
        (world["assignments"][aid], r)
        for aid, r in bookings(state, pid)
        if active(r, start)
    ]
    if any(r["end"] and r["end"] < end for _, r in assignments):
        return False
    if member.get("position") in ("coach", "chief-mechanic") and any(
        r.get("remit") == "supervised" for _, r in assignments
    ):
        return False
    if academy and member.get("position") == "driver":
        if not any(
            s["person"] == pid
            and state["academies"][s["academy"]]["org"] == org
            and s["start"] <= start
            and s["end"] >= end
            for s in state["scholarships"].values()
        ):
            return False
    elif not any(a["org"] == org for a, _ in assignments) and member.get("org") != org:
        return False
    series = {a["series"] for a, _ in assignments if a["series"]}
    if "size" in member:
        series.update(world["organizations"][org]["programs"])
    return not any(
        e["series"] in series
        and e["kind"] in ("round", "testing")
        and e["start"] < end
        and start <= e["end"]
        for e in world["events"]
    )


def options(state):
    role = state["setup"]["role"]
    allowed = {
        "manager": ["simulator", "fitness", "pit-drill", "debrief"],
        "owner": ["debrief"],
        "manufacturer": ["debrief"],
    }[role].copy()
    if role == "owner" and any(
        a["org"] == state["setup"]["org"] for a in state["academies"].values()
    ):
        allowed.append("academy")
    if role == "manufacturer" and any(
        row["fact"]["org"] == state["setup"]["org"]
        and row["fact"]["kind"] in ("design", "diagnosis")
        for row in state["work_log"].values()
    ):
        allowed.append("bench-test")
    return [
        dict(
            id=k,
            name=PROGRAMS[k][0],
            facility=PROGRAMS[k][1],
            days=PROGRAMS[k][2],
            cost=PROGRAMS[k][3],
            load=PROGRAMS[k][4],
        )
        for k in allowed
    ]


def reserve(state, world, kind):
    from .employment import post, HORIZON

    org = state["setup"]["org"]
    start = state["date"]
    if kind not in {o["id"] for o in options(state)}:
        raise RuleError("Программа вне полномочий.", 403)
    _, facility, days, cost, load = PROGRAMS[kind]
    end = shifted(start, days)
    if end > HORIZON:
        raise RuleError("Слот выходит за календарь сезона.")
    if any(
        r["org"] == org and r["facility"] == facility and r["status"] == "scheduled"
        for r in state["preparations"].values()
    ):
        raise RuleError("Ресурс уже зарезервирован.")
    roster = {
        p
        for aid, rows in state["seats"].items()
        if world["assignments"][aid]["org"] == org
        for r in rows
        if active(r, start)
        for p in [r["person"]]
    }
    prior = None
    mentor = None
    if kind in ("debrief", "bench-test"):
        used = {
            (r["participants"][0], r["source"])
            for r in state["preparations"].values()
            if r["kind"] == kind and r["org"] == org
        }
        if kind == "debrief":
            used.update(
                (r["fact"]["person"], r["fact"]["context"]["reviewed"])
                for r in state["work_log"].values()
                if r["fact"]["context"].get("reviewed")
            )
        facts = sorted(
            state["work_log"].values(),
            key=lambda r: (
                r["fact"]["date"],
                r["fact"]["event_id"],
                r["fact"]["person"],
            ),
            reverse=True,
        )
        prior = next(
            (
                r["fact"]
                for r in facts
                if r["fact"]["person"] in roster
                and r["fact"]["org"] == org
                and r["fact"]["kind"] not in ("debrief", "age", "scout-review")
                and (r["fact"]["person"], r["fact"]["event_id"]) not in used
                and (
                    kind != "bench-test"
                    or (
                        r["fact"]["kind"] in ("design", "diagnosis")
                        and r["fact"]["role"]
                        in (
                            "engines",
                            "transmissions",
                            "tyres",
                            "tyre-construction",
                            "chief-engineer",
                        )
                    )
                )
                and eligible(state, world, r["fact"]["person"], org, start, end)
            ),
            None,
        )
        if not prior:
            raise RuleError(
                "Нет доступного участника с подтверждённой работой для разбора."
            )
        candidates = [prior["person"]]
    elif kind == "pit-drill":
        candidates = [
            g["id"]
            for g in state["collectives"].values()
            if g["org"] == org
            and g["name"] == "Механики и пит-бригада"
            and g["workload"] < 100
        ]
        mentor = next(
            (
                p
                for p in sorted(roster)
                if state["people"][p]["position"] == "chief-mechanic"
                and eligible(state, world, p, org, start, end)
            ),
            None,
        )
    elif kind == "academy":
        candidates = [
            s["person"]
            for s in state["scholarships"].values()
            if state["academies"][s["academy"]]["org"] == org and active(s, start)
        ]
        mentor = next(
            (
                p
                for p in sorted(roster)
                if state["people"][p]["position"] == "coach"
                and eligible(state, world, p, org, start, end)
            ),
            None,
        )
    else:
        candidates = [p for p in roster if state["people"][p]["position"] == "driver"]
    if kind in ("academy", "pit-drill") and not mentor:
        raise RuleError("Нет доступного наставника или руководителя бригады.")
    candidates = [
        p
        for p in candidates
        if eligible(state, world, p, org, start, end, kind == "academy")
    ]
    if not candidates:
        raise RuleError(
            "Нет свободного участника с действующим назначением на весь слот."
        )

    def priority(pid):
        person = state["people"].get(pid) or state["collectives"][pid]
        return (
            sum(
                pid in r["participants"]
                for r in state["preparations"].values()
                if r["kind"] == kind
            ),
            person["fatigue"],
            pid,
        )

    pid = min(candidates, key=priority)
    key = f"prep-{state['revision'] + 1}"
    post(state, org, key, -cost, "staff-preparation")
    participants = [pid] + ([mentor] if mentor else [])
    state["preparations"][key] = dict(
        id=key,
        org=org,
        kind=kind,
        facility=facility,
        cost=cost,
        start=start,
        end=end,
        participants=participants,
        status="scheduled",
        source=prior["event_id"] if prior else None,
        skills=prior["skills"] if prior else None,
    )
    for person in participants:
        p = state["people"].get(person) or state["collectives"][person]
        p["fatigue"] = min(100, p["fatigue"] + load)


def finish(state, world, day):
    for r in state["preparations"].values():
        if r["status"] != "scheduled" or r["end"] != day:
            continue
        pid, *staff = r["participants"]
        org = r["org"]
        kind = r["kind"]
        p = state["people"].get(pid) or state["collectives"][pid]
        role = p.get("position", "mechanics")
        # A check at the last occupied day also covers contracts ending at midnight.
        work_day = shifted(day, -1)
        if not assigned(state, world, pid, role, org, work_day) or any(
            not assigned(state, world, m, state["people"][m]["position"], org, work_day)
            for m in staff
        ):
            r["status"] = "interrupted"
            continue
        if kind == "bench-test":
            r["status"] = "awaiting-result"
            continue
        skills = {
            "simulator": ["Стабильность", "Торможение"],
            "academy": ["Стабильность", "Повороты"],
            "fitness": ["Выносливость"],
            "pit-drill": ["Точность", "Скорость"],
        }.get(kind, r["skills"])
        context = dict(mentor=staff[0] if staff else None, reviewed=r["source"])

        def credit(person, role, activity, skills, context):
            record(
                state,
                world,
                Activity(
                    event_id=r["id"],
                    org=org,
                    person=person,
                    role=role,
                    kind=activity,
                    skills=skills,
                    date=day,
                    difficulty=60,
                    result="reviewed" if activity == "debrief" else "completed",
                    context=context,
                ),
                assignment_day=work_day,
            )

        credit(pid, role, "simulator" if kind == "academy" else kind, skills, context)
        if staff:
            m = state["people"][staff[0]]
            credit(
                m["id"],
                m["position"],
                "coaching" if kind == "academy" else "pit-drill",
                ["Методика"] if kind == "academy" else ["Координация"],
                {},
            )
        r["status"] = "completed"
        state["notices"].append(
            dict(date=day, text=PROGRAMS[kind][0] + " · работа завершена")
        )
