from copy import deepcopy
import pytest
from . import domain, employment, personnel, service, teamwork
from .catalog import WORLD
from .test_career import create
from .test_personnel import run, snapshot, GT, SEAT, terms


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_feedback_is_independent_of_pace_and_uses_private_evidence():
    state = snapshot(create())
    day = state["date"]
    pid = WORLD["entries"]["f1-4"]["crew"][0]
    pair = next(
        p
        for p in teamwork.partnerships(state, WORLD, day).values()
        if p[:2] == ("feedback", pid)
    )
    driver = state["people"][pid]
    driver["skills"]["Темп"] = 99
    driver["skills"]["Обратная связь"] = 10
    low = teamwork.professional_action(state, WORLD, pair, day, evidence=80)
    driver["skills"]["Темп"] = 20
    assert low == teamwork.professional_action(state, WORLD, pair, day, evidence=80)
    driver["skills"]["Обратная связь"] = 95
    high = teamwork.professional_action(state, WORLD, pair, day, evidence=80)
    assert (
        high["quality"] > low["quality"]
        and high["preferences"] == driver["preferences"]
    )
    race = next(e for e in WORLD["events"] if e["series"] == "f1")
    state["date"] = race["start"]
    packets = teamwork.session_inputs(
        state, WORLD, "f1-4", race, pid, evidence=85, pressure=20
    )
    strategy = next(p for p in packets if p["action"] == "strategy")
    assert strategy["decision"] in {"accept", "challenge", "decline"}
    with pytest.raises(domain.RuleError, match="назначения"):
        teamwork.session_inputs(state, WORLD, "f1-4", race, GT, evidence=80, pressure=0)
    assert all("potential" not in p for p in packets)


def test_real_course_records_evidence_and_dated_pairs_survive_transfer():
    c = create()
    c = run(c, "staff-release", seat=SEAT)
    c = run(c, "offer-send", **terms(end="2025-04-01"))
    while c["date"] < "2025-02-05":
        c = run(c, "advance")
    state = snapshot(c)
    links = [
        r
        for r in teamwork.links(state, WORLD, GT, c["date"])
        if r["kind"] == "feedback"
    ]
    assert sorted((r["active"], r["days"]) for r in links) == [(False, 4), (True, 0)]
    p = state["people"][GT]
    skill = min(p["skills"], key=p["skills"].get)
    c = run(c, "staff-train", seat=SEAT, skill=skill)
    while c["date"] < "2025-02-12":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    state = snapshot(c)
    peers = teamwork.links(state, WORLD, GT, c["date"])
    engineer = next(r for r in peers if r["active"] and r["kind"] == "feedback")
    assert engineer["days"] == 7 and len(engineer["events"]) == 1
    decision = engineer["events"][0]
    assert decision["outcome"] in {"confirmed-feedback", "unclear-feedback"}
    old = next(r for r in peers if not r["active"] and r["kind"] == "feedback")
    assert old["days"] == 4 and old["spells"][0]["end"] == "2025-02-05"
    archive = service.export_save(c["id"])
    assert service.export_save(service.import_save(archive)["id"]) == archive


def test_units_and_teammates_respond_only_to_attributed_work():
    state = snapshot(create())
    day = state["date"]
    pairs = teamwork.partnerships(state, WORLD, day)
    org = state["setup"]["org"]
    workshop = next(
        p
        for p in pairs.values()
        if p[0] == "workshop"
        and p[3] == org
        and "Механики" in state["collectives"][p[2]]["name"]
    )
    teammates = next(p for p in pairs.values() if p[0] == "teammates" and p[3] == org)
    initial = deepcopy(state["collectives"])
    response = teamwork.professional_action(state, WORLD, workshop, day, pressure=60)
    for _ in range(2):
        teamwork.record_event(
            state, WORLD, workshop[1], workshop[2], "rework", "work-order-1", day
        )
    assert len(state["cooperation_events"]) == 1
    teamwork.record_event(
        state, WORLD, workshop[1], workshop[2], "rework", "work-order-2", day
    )
    assert (
        state["collectives"][workshop[2]]["motivation"]
        < initial[workshop[2]]["motivation"]
    )
    assert all(
        g == initial[k] for k, g in state["collectives"].items() if k != workshop[2]
    )
    assert (
        teamwork.professional_action(state, WORLD, workshop, day, pressure=60)[
            "precision"
        ]
        < response["precision"]
    )
    first = teamwork.professional_action(state, WORLD, teammates, day)
    teamwork.record_event(
        state, WORLD, teammates[1], teammates[2], "conflict", "confirmed-dispute", day
    )
    assert (
        teamwork.professional_action(state, WORLD, teammates, day)["willingness"]
        < first["willingness"]
    )
    with pytest.raises(domain.RuleError, match="другим результатом"):
        teamwork.record_event(
            state,
            WORLD,
            teammates[1],
            teammates[2],
            "cooperation",
            "confirmed-dispute",
            day,
        )
    before_work = teamwork.cohesion(state["collectives"][workshop[2]])
    employment.advance(state, WORLD, personnel.shifted(day, 14))
    g = state["collectives"][workshop[2]]
    assert g["team_days"] == 14 and teamwork.cohesion(g) > before_work
