"""Read models for existing domain evidence. Only these rows are rebuilt on migration/import."""

from dataclasses import dataclass
from itertools import islice

from ..catalog import WORLD
from ..storage import dump
from .facts import INSERT, row


def assignments(state):
    for seat, history in state["seats"].items():
        for booking in history:
            yield (
                (seat, booking["person"], booking["start"], booking.get("offer")),
                booking,
            )


@dataclass(frozen=True)
class SourceOffsets:
    appointment_ends: dict
    scholarship_ends: dict
    work_count: int


def mutable_state(state):
    # Only the end of an appointment/scholarship can change in these index rows.
    return SourceOffsets(
        {key: b["end"] for key, b in assignments(state)},
        {k: s["end"] for k, s in state["scholarships"].items()},
        len(state["work_log"]),
    )


def refresh(db, cid, state, previous=None, action=None, args=None):
    from ..domain import START, occupant_on

    def emit(kind, key, day, ctx, data, access="public", origin="simulation"):
        if ctx.get("org"):
            ctx = dict(ctx, org_name=WORLD["organizations"][ctx["org"]]["name"])
        return row(
            cid,
            "domain",
            [kind, *key],
            kind,
            day,
            origin,
            access,
            ctx.get("org"),
            ctx,
            {"version": 1, "context": ctx, "data": data},
        )

    def result(pid, session, data):
        # Older checkpoints do not identify the catalog active at this publication.
        # Keep only explicit source links where the expansion date is ambiguous.
        entry = (
            {}
            if state.get("junior_migrated")
            else WORLD["entries"].get(data.get("entry"), {})
        )
        series = WORLD["championships"].get(data.get("series"), {}) if entry else {}
        car = WORLD["cars"].get(entry.get("car"), {})
        ctx = dict(
            person=pid,
            org=data.get("org"),
            series=data.get("series"),
            session=session,
            season=data.get("season_id", car.get("season")),
            round=data.get("round_id"),
            track=data.get("track_id"),
            layout=data.get("layout_id"),
            car=entry.get("car"),
            entry=data.get("entry"),
            program=entry.get("program"),
            regulation=series.get("rules_id"),
            technical_regulation=car.get("regulation"),
            layout_version=WORLD["version"] if data.get("layout_id") else None,
        )
        return emit("driver-result", [pid, session], data["day"], ctx, data)

    def records():
        for term in state.get("finance", {}).get("instalments", {}).values():
            for side in ("payer", "recipient"):
                account = term[side]
                if not account:
                    continue
                owner = account.removeprefix("group:").split(":")[0]
                if owner in WORLD["organizations"]:
                    ctx = dict(org=owner, contract=term["contract"])
                    yield emit(
                        "financial-obligation",
                        [term["id"], side],
                        term["due"],
                        ctx,
                        term,
                        access="internal",
                    )

        for key, b in assignments(state):
            if (
                previous
                and key in previous.appointment_ends
                and b["end"] == previous.appointment_ends[key]
            ):
                continue
            seat, pid, start, offer = key
            a = WORLD["assignments"][seat]
            ctx = dict(
                person=pid,
                org=a["org"],
                seat=seat,
                series=a["series"],
                contract=offer or dump(key),
            )
            yield emit(
                "appointment",
                key,
                start,
                ctx,
                dict(
                    position=b.get("position", a["position"]),
                    end=b.get("agreed_end", b["end"]),
                ),
                origin="simulation" if offer else "initial",
            )
            if b["end"] and b["end"] != b.get("agreed_end", b["end"]):
                yield emit(
                    "appointment-end-change",
                    [*key, b["end"]],
                    b["end"],
                    ctx,
                    dict(original_end=b["agreed_end"], effective_end=b["end"]),
                )

        for key, s in state["scholarships"].items():
            if (
                previous
                and key in previous.scholarship_ends
                and s["end"] == previous.scholarship_ends[key]
            ):
                continue
            ctx = dict(
                academy=s["academy"],
                org=state["academies"][s["academy"]]["org"],
                person=s["person"],
                contract=key,
            )
            seeded = key == "ferrari-academy-driver-046-" + str(
                state["personnel_since"]
            )
            yield emit(
                "scholarship",
                [key],
                s["start"],
                ctx,
                dict(end=s["end"]),
                "internal",
                "initial" if seeded else "simulation",
            )

        log = state["work_log"]
        keys = (
            islice(reversed(log), len(log) - previous.work_count)
            if previous
            else log.keys()
        )
        for key in keys:
            line = log[key]
            f = line["fact"]
            pid, event = f["person"], f["event_id"]
            ctx = dict(person=pid, org=f["org"], series=f["context"].get("series"))
            if f["org"]:
                yield emit(
                    "work",
                    [pid, event],
                    f["date"],
                    ctx,
                    dict(
                        event=event,
                        role=f["role"],
                        activity=f["kind"],
                        result=f.get("result"),
                    ),
                    "internal",
                )
            achievement = f["context"].get("achievement")
            if achievement:
                public = achievement in {"win", "podium", "pole", "title"}
                yield emit(
                    "achievement",
                    [pid, event],
                    f["date"],
                    ctx,
                    dict(achievement=achievement, event=event),
                    "public" if public else "internal",
                )
            if previous and f["context"].get("entry"):
                yield result(pid, event, state["starts"][pid][event])
        if not previous:
            for pid, starts in state["starts"].items():
                for event, data in starts.items():
                    yield result(pid, event, data)

        if previous and action in ("issued-licence", "season-classification"):
            people = [(args["person"], state["people"][args["person"]])]
        else:
            people = () if previous else state["people"].items()
        for pid, p in people:
            credentials = p.get("credentials", {})
            for licence in credentials.get("licences", []):
                yield emit(
                    "starting-licence",
                    [pid, licence],
                    state["personnel_start"],
                    dict(person=pid),
                    dict(licence=licence),
                    origin="initial",
                )
            for ref, decision in credentials.get("issued", {}).items():
                entry = WORLD["entries"].get(ref.removesuffix("-admitted-2025"), {})
                initial = (
                    ref.endswith("-admitted-2025")
                    and pid in entry.get("crew", ())
                    and decision["issued"] == START
                )
                yield emit(
                    "licence",
                    [pid, ref],
                    decision["issued"],
                    dict(person=pid),
                    decision,
                    origin="initial" if initial else "simulation",
                )
            for season, standing in credentials.get("classifications", {}).items():
                ctx = dict(
                    person=pid,
                    season=season,
                    series=standing["series"],
                    regulation=standing["rules_id"],
                )
                yield emit(
                    "season-classification",
                    [pid, season],
                    standing["end"],
                    ctx,
                    standing,
                )

        for org, reports in state["reports"].items():
            if previous:
                if action != "scout-driver" or org != state["setup"]["org"]:
                    continue
                persons = [(args["person"], reports[args["person"]][-1:])]
            else:
                persons = reports.items()
            for pid, items in persons:
                for r in items:
                    yield emit(
                        "scout-estimate",
                        [org, pid, r["date"]],
                        r["date"],
                        dict(org=org, person=pid),
                        dict(
                            low=r["low"],
                            high=r["high"],
                            quantity="potential",
                            unit="points/100",
                            scout=r["scout"],
                        ),
                        "estimate",
                    )

    org = state["setup"]["org"]
    office = org + ":" + state["setup"]["role"]
    if occupant_on(state["seats"].get(office, []), state["date"]) != state["player_id"]:
        org = None
    db.execute(
        """INSERT INTO stat_reader VALUES(?,?,?,?,?) ON CONFLICT(career)
        DO UPDATE SET org=excluded.org,role=excluded.role,day=excluded.day,support=excluded.support""",
        (
            cid,
            org,
            state["setup"]["role"],
            state["date"],
            dump(
                [
                    assignment
                    for assignment in state["support"]
                    if assignment["employer"] == org
                    and assignment["start"] <= state["date"] < assignment["end"]
                ]
            ),
        ),
    )
    if previous is None:
        db.execute("DELETE FROM stat_fact WHERE career=? AND source='domain'", (cid,))
    db.executemany(
        INSERT + """ ON CONFLICT(career,source,key) DO UPDATE SET body=excluded.body""",
        records(),
    )
