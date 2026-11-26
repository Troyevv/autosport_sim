"""The multiseason scenario lives only in tests. It supplies classified, named contributions explicitly."""

import copy
import hashlib
from datetime import date
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from . import (
    backing,
    career_choice,
    domain,
    employment,
    professional,
    service,
    staff_desk,
    storage,
)
from .app import app
from .catalog import WORLD
from .professional import Activity, age_interval, record, threshold
from .test_career import create, MCLAREN
from .test_personnel import SEAT, GT, run, snapshot, terms
from .roster_upgrade import previous_world, upgrade_personnel


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def fact(state, seat, key, kind, skills, **args):
    a = WORLD["assignments"][seat]
    return Activity(
        **(
            dict(
                event_id=key,
                person=state["seats"][seat][0]["person"],
                org=a["org"],
                role=a["position"],
                date=state["date"],
                skills=skills,
                kind=kind,
                difficulty=72,
                result="completed",
            )
            | args
        )
    )


def seats(role):
    return [k for k, v in WORLD["assignments"].items() if v["position"] == role]


def test_transactional_receipts_replay_and_visibility():
    c = create()
    state = snapshot(c)
    work = fact(
        state,
        SEAT,
        "r1",
        "race",
        ["Дождь"],
        context=dict(wet=True, series="f1", achievement="win"),
    )

    def submit(key, revision, facts):
        return service.confirm_work(c["id"], key, revision, facts)

    assert (
        TestClient(app)
        .post(
            f"/api/careers/{c['id']}/commands",
            json=dict(
                command_id="fake",
                revision=0,
                action="confirmed-work",
                staff={"facts": [work.model_dump()]},
            ),
        )
        .status_code
        == 403
    )
    first = submit("batch", 0, [work])
    assert submit("batch", 0, [work]) == first
    second = submit("redelivery", 1, [work])
    data = snapshot(second)
    assert len(data["work_log"]) == 1
    assert data["experience_by_skill"].keys() == {work.person}
    assert set(data["experience_by_skill"][work.person]) == {"Дождь"}
    assert (
        data["people"][work.person]["skills"] == state["people"][work.person]["skills"]
    )
    with pytest.raises(domain.RuleError, match="занят"):
        submit(
            "atomic",
            2,
            [
                work.model_copy(update=dict(event_id="r2")),
                work.model_copy(update=dict(difficulty=90)),
            ],
        )
    assert snapshot(c) == data
    exported = service.export_save(c["id"])
    assert service.export_save(service.import_save(exported)["id"]) == exported
    assert professional.projection(data, WORLD, work.person)["experience"]["Дождь"] > 0
    data["setup"]["org"] = next(org for org in WORLD["organizations"] if org != MCLAREN)
    visible = staff_desk.dossier(data, WORLD, work.person)
    assert (
        not visible["development"]["experience"]
        and "salary_cents" not in visible["history"][0]
    )
    assert visible["development"]["history"][0]["fact"]["context"] == dict(
        achievement="win", series="f1"
    )
    with pytest.raises(ValidationError):
        fact(state, SEAT, "dry", "race", ["Дождь"])
    with pytest.raises(ValidationError):
        fact(state, SEAT, "unrelated", "fitness", ["Топливо"])


def test_reviews_and_committed_preparation():
    c = create()
    state = snapshot(c)
    strategy = next(
        s for s in seats("strategist") if WORLD["assignments"][s]["org"] == c["org"]
    )
    bad = fact(state, strategy, "failed-call", "strategy", ["Риск"], result="failed")
    c = service.confirm_work(c["id"], "failed", 0, [bad])
    c = run(c, "prepare-program", kind="debrief")
    assert c["preparations"][0]["source"] == bad.event_id
    c = run(c, "advance")
    rows = snapshot(c)["work_log"]
    review = next(r for r in rows.values() if r["fact"]["kind"] == "debrief")
    assert (
        review["changes"]["Риск"]["xp"] > 0
        and rows[bad.person + "|failed-call"]["changes"]["Риск"]["xp"] > 0
    )
    assert review["fact"]["context"]["reviewed"] == bad.event_id
    with pytest.raises(domain.RuleError, match="исходная|разобрана"):
        service.confirm_work(
            c["id"],
            "again",
            c["revision"],
            [Activity(**(review["fact"] | {"event_id": "repeated"}))],
        )
    with pytest.raises(domain.RuleError, match="подтверждённой"):
        run(c, "prepare-program", kind="debrief")


def test_pit_drill_charges_and_credits_exact_team():
    c = create()
    before = snapshot(c)
    c = run(c, "prepare-program", kind="pit-drill")
    group, chief = c["preparations"][0]["participants"]
    assert (
        c["account"]["cash_cents"] == before["accounts"][c["org"]]["cash_cents"] - 26000
    )
    c = run(c, "advance")
    s = snapshot(c)
    assert set(s["experience_by_skill"]) == {group, chief}
    assert set(s["experience_by_skill"][chief]) == {"Координация"}
    assert set(s["experience_by_skill"][group]) == {"Точность", "Скорость"}


def simulate(initial):
    s = copy.deepcopy(initial)
    specs = [
        (SEAT, 19, 98, "Дождь", 55),
        (
            next(
                k
                for k in seats("driver")
                if k != SEAT and WORLD["assignments"][k]["series"] == "f1"
            ),
            39,
            83,
            "Дождь",
            74,
        ),
        (seats("aero")[0], 34, 91, "Сопротивление", 65),
        (seats("strategist")[0], 48, 95, "Риск", 68),
        (seats("manager")[0], 55, 88, "Переговоры", 69),
        (seats("engines")[0], 40, 92, "Ресурс", 72),
    ]
    subjects = []
    for seat, age, potential, skill, base in specs:
        r = s["seats"][seat][0]
        r["end"] = None
        p = s["people"][r["person"]]
        p.update(birth_date=f"{2025 - age}-01-12", potential=potential)
        p["skills"][skill] = base
        subjects.append((seat, p, skill))
    for year in range(2025, 2033):
        for month in range(1, 13):
            day = date(year, month, 15).isoformat()
            if day < s["date"]:
                continue
            for _, p, _ in subjects:
                age_interval(s, p, s["date"], day)
            s["date"] = day
            for i, (seat, p, skill) in enumerate(subjects):
                if i < 2:
                    kind = ("race", "practice", "qualifying", "track-test")[
                        (month - 1) % 4
                    ]
                    topic = (
                        skill
                        if month % 3 != 0
                        else "Повороты"
                        if kind != "race"
                        else "Шины"
                    )
                else:
                    kind = (
                        ("cfd", "wind-tunnel", "design")[(month - 1) % 3],
                        "strategy",
                        "negotiation",
                        ("diagnosis", "bench-test", "client-data")[(month - 1) % 3],
                    )[i - 2]
                    topic = skill
                context = {"wet": topic == "Дождь", "series": "f1"} if i < 2 else {}
                f = fact(
                    s,
                    seat,
                    day,
                    kind,
                    [topic],
                    context=context,
                    result="failed" if month % 5 == 0 else "completed",
                )
                record(s, WORLD, f)
                if month % 5 == 0:
                    record(
                        s,
                        WORLD,
                        fact(
                            s,
                            seat,
                            day + "-review",
                            "debrief",
                            [topic],
                            result="reviewed",
                            context={"reviewed": day},
                        ),
                    )
    report = [
        (
            p["position"],
            p["skills"][skill],
            s["experience_by_skill"][p["id"]][skill]["work"],
            p.get("reaction"),
        )
        for _, p, skill in subjects
    ]
    return (
        report,
        hashlib.sha256(storage.dump(s["work_log"]).encode()).hexdigest(),
        len(s["work_log"]),
    )


def test_eight_seasons_reproduce_all_attributed_changes():
    state = snapshot(create())
    result = simulate(state)
    assert simulate(state) == result
    report, digest, lines = result
    print("2025–32", report, digest, lines)
    assert all(row[1] > spec for row, spec in zip(report, [55, 74, 65, 68, 69, 72]))
    assert report[0][1] - 55 > report[1][1] - 74
    assert all(row[1] <= cap for row, cap in zip(report, [98, 83, 91, 95, 88, 92]))
    assert (
        report[0][3] == state["people"][state["seats"][SEAT][0]["person"]]["reaction"]
    )
    assert lines > 600


def test_level_and_individual_age_curves_are_partition_invariant():
    s = snapshot(create())
    p = s["people"][s["seats"][SEAT][0]["person"]]
    p["birth_date"] = "1970-02-02"
    other = copy.deepcopy(s)
    q = other["people"][p["id"]]
    start = s["date"]
    end = "2035-02-01"
    age_interval(s, p, start, end)
    for year in range(2025, 2035):
        age_interval(other, q, f"{year}-02-01", f"{year + 1}-02-01")
    assert p == q and s["work_log"] == other["work_log"]
    assert threshold(93) > threshold(60)
    values = []
    for level in (55, 90):
        work = copy.deepcopy(s)
        participant = work["people"][p["id"]]
        participant["potential"] = 99
        participant["skills"]["Шины"] = level
        for i in range(9):
            record(
                work,
                WORLD,
                fact(work, SEAT, str(i), "race", ["Шины"], difficulty=level),
            )
        values.append(participant["skills"]["Шины"] - level)
    assert values[0] > values[1]
    assert (
        len(
            {
                professional.curve("driver", "Реакция", x)
                for x in s["people"].values()
                if x["position"] == "driver"
            }
        )
        > 3
    )


def test_public_evidence_priorities_and_common_hiring_rules():
    s = snapshot(create())
    other_seat = next(
        a
        for a in seats("driver")
        if WORLD["assignments"][a]["series"] == "f1"
        and WORLD["assignments"][a]["org"] != MCLAREN
    )
    pid = s["seats"][other_seat][0]["person"]
    p = s["people"][pid]
    p.update(ambition=95, professionalism=80)
    offer = terms(person=pid)
    assert not career_choice.assess(s, WORLD, p, offer)["veto"]
    for seat, place in ((SEAT, 15), (other_seat, 2)):
        for eid in ("classified-1", "classified-2"):
            backing.record_result(
                s,
                s["seats"][seat][0]["person"],
                eid,
                s["date"],
                world=WORLD,
                entry=WORLD["assignments"][seat]["entry"],
                place=place,
            )
    employment.command(s, WORLD, "staff-release", {"seat": SEAT})
    employment.propose(s, WORLD, offer, MCLAREN, "manager")
    o = next(iter(s["offers"].values()))
    employment.resolve(s, WORLD, o)
    assert o["status"] == "rejected" and "Спортивные" in o["message"]
    p["ambition"] = 48
    s["revision"] += 1
    employment.propose(s, WORLD, offer, MCLAREN, "manager")
    o = list(s["offers"].values())[-1]
    employment.resolve(s, WORLD, o)
    assert o["status"] == "accepted" and o["assessment"]["priority"] == "security"
    engineer = seats("race-engineer")[0]
    e = s["people"][s["seats"][engineer][0]["person"]]
    e.update(ambition=88, professionalism=83)
    proposal = terms(person=e["id"], seat=engineer, remit="supervised")
    assert "полномочия" in career_choice.assess(s, WORLD, e, proposal)["veto"]
    assert not career_choice.assess(s, WORLD, e, proposal | dict(remit="independent"))[
        "veto"
    ]


def test_migration_after_completed_and_open_courses():
    setup = snapshot(create())["setup"]
    s = upgrade_personnel(domain.new_world(previous_world(), setup), historical=True)
    pid = s["seats"][SEAT][0]["person"]
    skill = min(s["people"][pid]["skills"], key=s["people"][pid]["skills"].get)
    commands = []
    for action, args in [
        ("staff-train", dict(seat=SEAT, skill=skill)),
        ("advance", None),
        ("staff-train", dict(seat=SEAT, skill=skill)),
    ]:
        commands.append(
            dict(
                action=action,
                command_id=str(s["revision"]),
                revision=s["revision"],
                staff=args,
            )
        )
        from .roster_upgrade import personnel_world

        domain.apply(s, personnel_world(), action, args)
    s["ledger"].sort(key=lambda row: (row["date"], row["org"], row["key"]))
    payload = dict(state=s, commands=commands)
    old = dict(
        format="autosport-career",
        version=1,
        rules=s["rules"],
        payload=payload,
        sha256=hashlib.sha256(storage.dump(payload).encode()).hexdigest(),
    )
    c = service.import_save(old)
    exported = service.export_save(c["id"])
    new = exported["payload"]["state"]
    assert new["people"][pid]["skills"] == s["people"][pid]["skills"]
    assert new["legacy_preparation"][pid]["cancelled"] == s["people"][pid]["training"]
    assert new["legacy_preparation"][pid]["completed"] == 1 and not new["work_log"]
    assert service.export_save(service.import_save(exported)["id"]) == exported
    with pytest.raises(domain.RuleError, match="курсы завершены"):
        run(c, "staff-train", seat=SEAT, skill=skill)


def test_manufacturer_test_requires_actual_measurement():
    c = create(org="supplier-goodyear", role="manufacturer", series="wec")
    seat = next(s["id"] for s in c["assignments"] if s["position"] == "tyres")
    design = fact(
        snapshot(c),
        seat,
        "compound-design",
        "design",
        ["Износ"],
        context={"achievement": "validated-design"},
    )
    c = service.confirm_work(c["id"], "design", 0, [design])
    c = run(c, "prepare-program", kind="bench-test")
    c = run(c, "advance")
    (plan,) = c["preparations"]
    assert plan["status"] == "awaiting-result" and len(snapshot(c)["work_log"]) == 1
    test = fact(
        snapshot(c),
        seat,
        "compound-test",
        "bench-test",
        ["Износ"],
        context={"program": plan["id"]},
        result="failed",
    )
    c = service.confirm_work(c["id"], "measured", c["revision"], [test])
    assert c["preparations"][0]["status"] == "completed"
    assert (
        snapshot(c)["work_log"][test.person + "|compound-test"]["changes"]["Износ"][
            "xp"
        ]
        > 0
    )


def test_npc_fills_a_real_opening_through_employment_and_preserves_contributor_history():
    s = snapshot(create())
    agent = next(
        p
        for p in s["people"].values()
        if p["position"] == "analyst"
        and not any(
            r["person"] == p["id"] for rows in s["seats"].values() for r in rows
        )
    )
    seat = seats("analyst")[0]
    incumbent = s["seats"][seat][0]
    activity = fact(s, seat, "analysis", "client-data", ["Точность"])
    row = record(s, WORLD, activity)
    incumbent["end"] = "2025-02-02"
    employment.advance(s, WORLD, "2025-03-05")
    offer = next(o for o in s["offers"].values() if o["seat"] == seat)
    assert offer["actor"]["person"] != "player" and offer["status"] == "accepted"
    assert offer["person"] in {agent["id"], incumbent["person"]}
    assert offer["assessment"]["priority"] in ("security", "development", "autonomy")
    s["setup"]["org"] = activity.org
    # Future profession/retirement changes can update the current profile independently of its archive.
    s["people"][activity.person]["position"] = "chief-analyst"
    history = professional.projection(s, WORLD, activity.person)
    assert (
        history["history"][0]["fact"] == row["fact"]
        and row["fact"]["role"] == "analyst"
    )


def test_verified_classification_and_repeat_across_transactions():
    c = create()
    classified = fact(
        snapshot(c),
        SEAT,
        "classified-race",
        "race",
        ["Шины"],
        context={
            "entry": "f1-4",
            "series": "f1",
            "place": 2,
            "licence_points": 2,
            "achievement": "podium",
        },
    )
    before = snapshot(c)["people"][classified.person]["credentials"]["points"]
    for i in range(2):
        c = service.confirm_work(
            c["id"], "publication-" + str(i), c["revision"], [classified]
        )
    s = snapshot(c)
    assert s["people"][classified.person]["credentials"]["points"] == before + 2
    assert s["starts"][classified.person]["classified-race"]["entry"] == "f1-4"
    assert len(s["work_log"]) == 1


def test_verified_contributions_follow_transfer_and_contract_end():
    c = create()
    origin = next(
        s
        for s in seats("driver")
        if WORLD["assignments"][s]["person"] == GT
        and WORLD["assignments"][s]["series"] == "dtm"
    )
    old = fact(
        snapshot(c),
        origin,
        "old-practice",
        "practice",
        ["Шины"],
        context={"series": "dtm"},
    )
    c = service.confirm_work(c["id"], "before-transfer", c["revision"], [old])
    c = run(c, "staff-release", seat=SEAT)
    c = run(c, "offer-send", **terms())
    while c["date"] < "2025-02-05":
        c = run(c, "advance")
    new = Activity(
        **(
            old.model_dump()
            | dict(
                event_id="new-practice",
                org=c["org"],
                date=c["date"],
                context={"series": "f1"},
            )
        )
    )
    c = service.confirm_work(c["id"], "after-transfer", c["revision"], [new])
    while c["date"] < "2025-02-20":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    s = snapshot(c)
    for org, activity, discipline in ((old.org, old, "GT"), (new.org, new, "Formula")):
        s["setup"]["org"] = org
        d = staff_desk.dossier(s, WORLD, GT)
        assert len(d["history"]) == 2 and not d["current"]
        (row,) = d["development"]["history"]
        assert (row["fact"]["event_id"], row["discipline"]) == (
            activity.event_id,
            discipline,
        )
    archive = service.export_save(c["id"])
    assert archive == service.export_save(service.import_save(archive)["id"])
