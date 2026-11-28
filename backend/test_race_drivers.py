"""Driver acceptance on the native session boundary, with real installed cars."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from math import hypot

import pytest

from .race.session import Command, INDEX, Session
from .test_race_dynamics import MONZA, vehicle
from .race.vehicles import opening_vehicle
from .catalog import SEASON_LINEUP


def mind(session, entry="f1-1"):
    return session.checkpoint()["native"]["states"][entry]["driver_state"]


def test_occlusion_private_controls_and_attention():
    a = vehicle(s=200, d=0, v=45)
    blocker = vehicle("f1-4", s=219, d=0, v=44)
    hidden = vehicle("f1-44", s=242, d=0, v=48)

    def observation(field, command=None):
        sim = Session(MONZA, field, seed=31)
        if command:
            sim.schedule([(0, "f1-4", command)])
        sim.advance(1, sample_every=0)
        result = mind(sim)
        result.pop("position")  # classification belongs to timing
        return result

    baseline = observation([a, blocker])
    assert observation([a, blocker, hidden]) == baseline
    assert observation([a, blocker], Command(automatic=False, brake=1)) == baseline
    far = deepcopy(hidden)
    far["start"]["s"] += 900
    assert observation([a, far]) == observation([a])
    assert observation([a])["gap"] > baseline["gap"]


def test_bumper_clearance_and_replay_during_attack():
    a = vehicle(s=300, d=-2.6, v=55)
    b = vehicle("f1-4", s=325, d=1.8, v=35)
    sim = Session(MONZA, [a, b], seed=42)
    sim.schedule([(0, b["entry"], Command(automatic=False, throttle=0.1))])
    first = sim.advance(24, sample_every=1)
    assert any(e["kind"] == "attack" for e in first["events"])
    save = json.loads(json.dumps(sim.checkpoint()))
    assert mind(sim)["target"] == b["entry"]
    same = Session.resume(save)
    tail = sim.advance(500, sample_every=1)
    assert tail == same.advance(500, sample_every=1)
    event = next(e for e in tail["events"] if e["kind"] == "attack-completed")
    index = round(event["time_s"] * 50) - 25
    u, v = (tail["rows"][e][index] for e in (a["entry"], b["entry"]))
    assert (
        u[INDEX["s_m"]] - v[INDEX["s_m"]]
        >= (a["spec"]["length"] + b["spec"]["length"]) * 0.49
    )
    alongside = [
        (u, v)
        for u, v in zip(tail["rows"][a["entry"]], tail["rows"][b["entry"]], strict=True)
        if abs(u[1] - v[1]) < 1.0
    ]
    assert alongside and all(
        abs(u[2] - v[2]) > 1.95 or u[INDEX["contact"]] for u, v in alongside
    )
    for eid, rows in tail["rows"].items():
        for u, v in zip(rows, rows[1:]):
            assert hypot(v[3] - u[3], v[4] - u[4]) < max(u[9], v[9]) * 0.023 + 0.08


def test_pressure_resources_and_profiles_affect_actuators():
    a = vehicle(s=450, d=0, v=56)
    b = vehicle("f1-4", s=438, d=-2.6, v=57)

    def evaluate(field):
        sim = Session(MONZA, field, seed=123)
        batch = sim.advance(100, sample_every=1)
        return mind(sim), batch["rows"][a["entry"]]

    exposed, _ = evaluate([a, b])
    calm, normal = evaluate([a])
    assert exposed["tension"] > calm["tension"]
    other = deepcopy(a)
    other["driver"].update(
        trail=0, braking=0.1, exit=0, balance=0, adaptability=0.1, familiarity=0.1
    )
    changed, rows = evaluate([other])
    assert changed["brake_preview"] > calm["brake_preview"]
    assert (
        changed["familiarity"] > 0.01 and changed["familiarity"] < calm["familiarity"]
    )
    assert rows[0][INDEX["throttle"]] != normal[0][INDEX["throttle"]]
    hot = deepcopy(a)
    for tyre in hot["start"]["tyres"]:
        tyre["surface"] = 150
    hot["start"]["energy"] = 300
    managed, _ = evaluate([hot])
    assert (
        managed["pedal_limit"] < calm["pedal_limit"]
        and managed["deploy"] < calm["deploy"]
    )


@pytest.mark.parametrize(
    ("series", "layout", "launch"),
    [("f1", MONZA, "standing-start"), ("wec", "fuji-speedway:gp", "rolling-start")],
)
def test_formation_grid_release_and_restart(series, layout, launch):
    ids = [
        e["id"]
        for e in SEASON_LINEUP["entries"].values()
        if e["championship"] == series
    ][:2]
    sim = Session(
        layout, [opening_vehicle(i) for i in ids], kind="race", formation=True, seed=41
    )
    events = []
    for _ in range(60):
        events.extend(sim.advance(500, sample_every=0)["events"])
        if all(mind(sim, i)["started"] for i in ids):
            break
    assert Counter(e["kind"] for e in events)[launch] == 2
    assert all(
        v["distance"] > 1000 for v in sim.checkpoint()["native"]["states"].values()
    )
    assert not any(e["kind"] == "lap" for e in events)
    tick = sim.checkpoint()["native"]["tick"]
    sim.schedule(
        [(tick, i, Command(flag=1)) for i in ids]
        + [(tick + 180, i, Command()) for i in ids]
    )
    tail = sim.advance(240, sample_every=0)
    assert sum(e["kind"] == "restart-signal" for e in tail["events"]) == 2


def test_push_start_needs_work_and_a_clear_path():
    eid = next(
        e["id"] for e in SEASON_LINEUP["entries"].values() if e["category"] == "OK"
    )
    car = opening_vehicle(eid)
    car["start"].update(v=0, s=100, d=0)

    def drive(manual):
        session = Session("rdby-karting-ring:international", [car])
        if manual:
            session.schedule([(0, eid, Command(automatic=False, throttle=1))])
        return session.advance(600, sample_every=1)

    batch = drive(False)
    events = [e["kind"] for e in batch["events"]]
    assert events.index("blocked") < events.index("recovered")
    rows = batch["rows"][eid]
    assert max(r[INDEX["push_force_n"]] for r in rows) > 100
    assert rows[-1][INDEX["speed_m_s"]] > 5
    assert max(r[INDEX["combustion_kw"]] for r in drive(True)["rows"][eid]) == 0


def test_parallel_accelerated_partition_and_pending_command():
    ids = ["f1-1", "f1-4", "f1-44", "f1-18"]
    sim = Session(MONZA, [opening_vehicle(i) for i in ids], seed=91, kind="race")
    sim.schedule([(177, ids[0], Command(flag=1)), (255, ids[0], Command())])
    first = sim.advance(131, sample_every=0)
    assert any(e["kind"] == "standing-start" for e in first["events"])
    checkpoint = sim.checkpoint()

    def run(chunk, stride):
        s = Session.resume(checkpoint)
        events = []
        for i in range(0, 1300, chunk):
            events.extend(
                s.advance(min(chunk, 1300 - i), sample_every=stride)["events"]
            )
        return s.checkpoint(), events

    with ThreadPoolExecutor(3) as pool:
        jobs = [pool.submit(run, c, p) for c, p in [(1, 1), (37, 6), (1300, 0)]]
        assert jobs[0].result() == jobs[1].result() == jobs[2].result()


@pytest.mark.parametrize(("seed", "error"), [(3, "false-start"), (25, "engine-stall")])
def test_launch_error_evidence(seed, error):
    car = opening_vehicle("f1-1")
    car["driver"].update(consistency=0, risk=1, launch=0, familiarity=0)
    s = Session(MONZA, [car], kind="race", seed=seed)
    b = s.advance(300, sample_every=1)
    e = next(e for e in b["events"] if e["kind"] == error)
    if error == "false-start":
        assert (
            e["time_s"] < 2
            and b["rows"]["f1-1"][round(e["time_s"] * 50) - 1][INDEX["speed_m_s"]]
            > 0.01
        )
    else:
        assert (
            next(e["time_s"] for e in b["events"] if e["kind"] == "standing-start")
            > e["time_s"] + 0.8
        )


def test_legacy_checkpoint_and_invalid_opponent():
    car = opening_vehicle("f1-1")
    s = Session(MONZA, [car])
    s.advance(150)
    cp = s.checkpoint()
    cp["native"]["states"]["f1-1"]["driver_state"]["target"] = "missing"
    with pytest.raises(ValueError, match="opponent"):
        Session.resume(cp)
    cp["native"]["version"] = 1
    cp["physics_revision"] = 2
    del cp["config"]["field"][0]["driver"]
    del cp["native"]["states"]["f1-1"]["driver_state"]
    old = Session.resume(cp)
    assert (
        old.checkpoint()["native"]["states"]["f1-1"]["distance"]
        == cp["native"]["states"]["f1-1"]["distance"]
    )
    assert old.advance(80)["rows"]["f1-1"]


def test_grid_wrap_and_reverse_engagement():
    from .race.layouts import Road, load_layout

    length = load_layout(MONZA).track.ribbon(Road.circuit).length
    front = vehicle(s=2, d=2, v=0)
    rear = vehicle("f1-4", s=length - 6, d=-2, v=0)
    s = Session(MONZA, [rear, front], kind="race")
    s.schedule([(0, "f1-4", Command(automatic=False, reverse=True, throttle=0.3))])
    rows = s.advance(50, sample_every=1)["rows"]["f1-4"]
    assert mind(s)["position"] == 1
    assert (
        rows[-1][INDEX["gear"]] == -1 and rows[-1][INDEX["s_m"]] < rows[0][INDEX["s_m"]]
    )


def test_vallelunga_survey_join_preserves_archived_map():
    from .race.layouts import Road, load_layout

    track = "vallelunga:internazionale"
    old = load_layout(track, "2025.1").track.ribbon(Road.circuit)
    revised = load_layout(track).track.ribbon(Road.circuit)
    points = [(s, 0) for s in range(1425, 1470)]
    assert max(abs(f[5]) for f in old.sample(points)) > 1
    assert max(abs(f[5]) for f in revised.sample(points)) < 0.01


def test_lapping_traffic_and_cooling_decisions():
    lead = vehicle(s=300, d=0, v=40)
    rear = vehicle("f1-4", s=286, d=2, v=44)

    def decision(lap_advantage):
        s = Session(MONZA, [lead, rear])
        cp = s.checkpoint()
        cp["native"]["states"]["f1-4"]["lap"] = lap_advantage
        cp["native"]["states"]["f1-1"]["distance"] = 150
        restored = Session.resume(cp)
        restored.advance(1)
        return mind(restored)

    ordinary = decision(0)
    blue = decision(1)
    assert ordinary["defended"] == "f1-4" and not blue["defended"]
    assert ordinary["deploy"] > blue["deploy"]
    observer = vehicle(s=290, d=0, v=45)
    leader = vehicle("f1-4", s=342, d=0, v=45)

    def air(temp):
        cp = Session(MONZA, [observer, leader]).checkpoint()
        cp["native"]["states"]["f1-1"]["coolant"] = temp
        sim = Session.resume(cp)
        sim.advance(6)
        return mind(sim)

    assert abs(air(105)["lane"]) > abs(air(75)["lane"])


def test_pack_facts_have_stable_driver_identity_and_access():
    from .statistics.models import Session as Context
    from .race.layouts import VERSION

    field = [vehicle(s=300, d=-2.6, v=55), vehicle("f1-4", s=325, d=1.8, v=35)]
    contexts = {}
    for row in field:
        row["day"] = "2025-03-16"
        contexts[row["entry"]] = Context(
            org=row["org"],
            org_name=row["org"],
            series=row["series"],
            season="f1-2025",
            regulation=row["configuration"]["regulation"],
            round="monza",
            session="heat-18",
            session_kind="test",
            track="monza",
            layout=MONZA,
            layout_version=VERSION,
            entry=row["entry"],
            car=row["car"],
        )
    sim = Session(MONZA, field, seed=42)
    sim.schedule([(0, "f1-4", Command(automatic=False, throttle=0.1))])
    batch = sim.advance(500, sample_every=10)
    facts = list(sim.event_facts(batch, contexts))
    assert facts == list(sim.event_facts(batch, contexts))
    assert any(f.data.kind == "strategy" and f.access == "internal" for f in facts)
    assert any(f.data.kind == "position" and f.access == "public" for f in facts)
    codes = [f.data.source_id for f in facts]
    assert len(codes) == len(set(codes))
    people = {r["entry"]: r["driver"]["id"] for r in field}
    for f in facts:
        assert f.data.context.person == people[f.data.context.entry]


@pytest.mark.parametrize(
    ("series", "track"), [("f1", MONZA), ("kart-ok", "rdby-karting-ring:international")]
)
def test_full_grid_tactics_and_progress(series, track):
    field = [
        opening_vehicle(e["id"], temp=75)
        for e in SEASON_LINEUP["entries"].values()
        if e["championship"] == series
    ]
    sim = Session(track, field, kind="race", seed=1808)
    counts = Counter()
    for _ in range(60):
        counts.update(e["kind"] for e in sim.advance(500, sample_every=0)["events"])
    states = sim.checkpoint()["native"]["states"]
    assert all(v["completed_laps"] >= 1 for v in states.values())
    assert (
        counts["attack-completed"]
        and counts["attack-aborted"]
        and counts["counterattack"]
    )
    assert counts["defence"] and counts["crossover"]
    assert counts["blocked"] == counts["recovered"]
    pending = sum(bool(v["driver_state"]["target"]) for v in states.values())
    assert (
        counts["attack"] + counts["counterattack"]
        == counts["attack-completed"] + counts["attack-aborted"] + pending
    )
