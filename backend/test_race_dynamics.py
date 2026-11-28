"""Physical acceptance cases through the native session boundary and the career registry."""

from copy import deepcopy
import json
from math import hypot, isfinite

import pytest
from _race_space import Body, Cursor, Road

from .catalog import SEASON_LINEUP
from .race.layouts import VERSION, load_layout
from .race.session import CHANNELS, INDEX, Command, Session
from .race.vehicles import CLASSES, CORNERS, career_vehicle, opening_vehicle
from .statistics.models import Session as Context

MONZA = "monza:gp"
CAR = "f1-1"
BY_CLASS = {e["category"]: e["id"] for e in SEASON_LINEUP["entries"].values()}


def vehicle(entry=CAR, s=350, d=0, v=55, **options):
    row = opening_vehicle(entry, **({"temp": 95.0} | options))
    row["start"].update(s=s, d=d, v=v)
    return row


def run(field, ticks, cmd, *, layout=MONZA, **weather):
    session = Session(layout, field, **weather)
    session.schedule([(0, v["entry"], cmd) for v in field])
    return session.advance(ticks, sample_every=1)


@pytest.mark.parametrize("category", list(CLASSES))
def test_all_installed_classes_complete_laps(category):
    entry = BY_CLASS[category]
    kart = category.startswith("OK")
    track = "rdby-karting-ring:international" if kart else "brands-hatch:gp"
    v = opening_vehicle(entry)
    s = Session(track, [v], water_mm=0.15)
    batch = s.advance(23000, sample_every=100)
    data = batch["rows"][entry]
    assert any(e["kind"] == "lap" and e["elapsed_s"] > 0 for e in batch["events"])
    assert all(len(row) == len(CHANNELS) and all(map(isfinite, row)) for row in data)
    assert all(0 <= r[INDEX["fuel_kg"]] <= v["start"]["fuel"] for r in data)
    assert max(r[INDEX["gear"]] for r in data) <= v["spec"]["gears"]
    assert (
        sum(r[INDEX["shift"]] for r in data) == 0
        if kart
        else max(r[INDEX["gear"]] for r in data) > 1
    )
    if not v["spec"]["motor_kw"]:
        assert all(r[INDEX["electric_kw"]] == r[INDEX["energy_kj"]] == 0 for r in data)
    assert all(
        b[INDEX["distance_m"]] >= a[INDEX["distance_m"]] for a, b in zip(data, data[1:])
    )


def test_integrated_motion_and_combined_wheel_forces():
    v = vehicle(fuel=40)
    s = Session(MONZA, [v])
    s.schedule([(0, CAR, Command(automatic=False, throttle=0.8, steer=0.03, deploy=0))])
    data = s.advance(50, sample_every=1)["rows"][CAR]
    distance = 0
    prior_speed = v["start"]["v"]
    fuel = v["start"]["fuel"]
    for row in data:
        speed = row[INDEX["speed_m_s"]]
        distance += (speed + prior_speed) * 0.01
        prior_speed = speed
        fuel -= row[INDEX["combustion_kw"]] * v["spec"]["bsfc"] * 0.02 / 3600000
        assert row[INDEX["distance_m"]] == pytest.approx(distance, abs=1e-10)
        assert row[INDEX["fuel_kg"]] == pytest.approx(fuel, abs=1e-11)
        for wheel in CORNERS:

            def get(k):
                return row[INDEX[f"{wheel}_{k}"]]

            assert hypot(get("fx_n"), get("fy_n")) <= get("mu") * get("load_n") + 1e-7


def test_cross_platform_reference_and_requested_gears():
    v = vehicle(fuel=40)
    data = run([v], 50, Command(automatic=False, throttle=0.8, steer=0.03, deploy=0))[
        "rows"
    ][CAR]
    final = data[-1]
    for key, reference in (
        ("distance_m", 57.09438686),
        ("speed_m_s", 58.28757113),
        ("fl_surface_c", 95.64512374),
    ):
        assert final[INDEX[key]] == pytest.approx(reference, abs=1e-4, rel=0)
    s = Session(MONZA, [vehicle(v=15)])
    with pytest.raises(ValueError, match="gear"):
        s.schedule([(0, CAR, Command(gear=9))])
    s.schedule([(0, CAR, Command(gear=4))])
    assert s.advance(60, sample_every=1)["rows"][CAR][-1][INDEX["gear"]] == 4


def test_tyres_in_the_wet_thermal_damage_pressure_and_lockup():
    def lateral(temp=95, wear=0, compound="C3", water=0):
        v = vehicle(temp=temp, compound=compound)
        for t in v["start"]["tyres"]:
            t["wear"] = wear
        return run([v], 1, Command(automatic=False, steer=0.19), water_mm=water)[
            "rows"
        ][CAR][0][INDEX["ay_m_s2"]]

    peak = lateral()
    assert (
        peak > lateral(temp=25)
        and peak > lateral(temp=165)
        and peak > lateral(wear=0.88)
    )
    assert lateral(compound="wet", temp=70, water=2) > lateral(temp=95, water=2)
    v = vehicle(temp=145, setup={"bias": 0.68, "pressure_fl": 160})
    v["start"]["tyres"][0]["flat"] = 0.97999
    s = Session(MONZA, [v])
    s.schedule([(0, CAR, Command(automatic=False, brake=1))])
    data = s.advance(50, sample_every=1)["rows"][CAR]
    assert max(r[INDEX["fl_lock"]] for r in data) > 0
    assert data[-1][INDEX["fl_punctured"]] == 1
    assert data[-1][INDEX["fr_degradation"]] > 0 and data[-1][INDEX["fr_blister"]] > 0
    assert data[0][INDEX["fl_pressure_kpa"]] != data[0][INDEX["fr_pressure_kpa"]]
    sets = s.tyre_sets()
    next_run = Session(MONZA, [v], tyre_sets=sets)
    assert next_run.tyre_sets() == sets
    with pytest.raises(ValueError, match="compound"):
        Session(MONZA, [vehicle(compound="C1")], tyre_sets=sets)


def test_wake_changes_drag_cooling_and_cornering_at_identical_inputs():
    def forces(lead_d=None, spacing=12, v=70):
        follower = vehicle(s=350, d=-1.7, v=v)
        field = [follower]
        if lead_d is not None:
            field.append(vehicle("f1-4", s=350 + spacing, d=lead_d, v=v))
        row = run(field, 1, Command(automatic=False, steer=0.10))["rows"][CAR][0]
        return dict(zip(CHANNELS, row, strict=True))

    clean, near, side, far = forces(), forces(-1.7), forces(2.5), forces(-1.7, 120)
    assert 0 < far["wake"] < near["wake"] and side["wake"] < near["wake"]
    assert near["drag_n"] < clean["drag_n"] and near["airflow"] < clean["airflow"]
    assert (
        near["downforce_n"] < clean["downforce_n"]
        and near["ay_m_s2"] < clean["ay_m_s2"]
    )
    assert near["front_aero"] != clean["front_aero"]
    assert forces(-1.7, v=10)["wake"] < near["wake"]


def test_energy_fuel_drs_rules_and_nonhybrid_wec():
    v = vehicle(s=200, v=65)
    cmd = Command(automatic=False, throttle=1)
    data = run([v], 30, cmd)["rows"][CAR]
    assert (
        data[0][INDEX["drs"]] == 1
        and data[-1][INDEX["energy_kj"]] < v["start"]["energy"]
    )
    for weather in [dict(kind="race"), dict(water_mm=1.0), dict(drs_enabled=False)]:
        assert run([v], 1, cmd, **weather)["rows"][CAR][0][INDEX["drs"]] == 0
    outside = vehicle(s=2000)
    assert run([outside], 1, cmd)["rows"][CAR][0][INDEX["drs"]] == 0
    v["start"]["energy"] = 0
    brake = run([v], 20, Command(automatic=False, brake=0.6))["rows"][CAR]
    assert brake[-1][INDEX["energy_kj"]] > 0 and brake[-1][INDEX["electric_kw"]] < 0
    empty = vehicle(fuel=0)
    assert run([empty], 1, cmd)["rows"][CAR][0][INDEX["combustion_kw"]] == 0
    ids = [
        e["id"]
        for e in SEASON_LINEUP["entries"].values()
        if SEASON_LINEUP["cars"][e["car"]]["name"] == "Aston Martin Valkyrie"
    ]
    assert ids and all(opening_vehicle(e)["spec"]["motor_kw"] == 0 for e in ids)


def test_detection_gap_carries_to_drs_activation():
    road = load_layout(MONZA).track.ribbon(Road.circuit)
    start = load_layout(MONZA).info["drs"][0][0] * road.length
    gate = (start - 150) % road.length
    field = [vehicle(s=gate - 17, v=55), vehicle("f1-4", s=gate - 5, v=55)]
    session = Session(MONZA, field, kind="race")
    cp = session.checkpoint()
    for state in cp["native"]["states"].values():
        state["lap"] = 2
        state["completed_laps"] = 1
        state["last_gate_index"] = 2
    session = Session.resume(cp)
    session.schedule(
        [(0, v["entry"], Command(automatic=False, throttle=0.2)) for v in field]
    )
    b = session.advance(200, sample_every=1)
    assert any(r[INDEX["drs"]] for r in b["rows"][CAR])
    assert not any(r[INDEX["drs"]] for r in b["rows"]["f1-4"])


def test_stable_order_checkpoint_queue_and_sampling():
    field = [vehicle(s=197, v=45), vehicle("f1-4", s=210, v=49)]
    orders = [
        (85, CAR, Command(automatic=False, brake=0.4)),
        (105, CAR, Command(preference=0.12)),
    ]
    a = Session(MONZA, field, seed=123)
    b = Session(MONZA, field[::-1], seed=123)
    a.schedule(orders)
    b.schedule(orders[::-1])
    first = a.advance(73, sample_every=5)
    restored = Session.resume(json.loads(json.dumps(a.checkpoint())))
    last = a.advance(427, sample_every=5)
    assert last == restored.advance(427, sample_every=5)
    whole = b.advance(500, sample_every=5)
    for e in (CAR, "f1-4"):
        assert first["rows"][e] + last["rows"][e] == whole["rows"][e]
    assert a.checkpoint()["native"] == b.checkpoint()["native"]
    restored.advance(1, sample_every=0)
    b.advance(1, sample_every=1)
    assert restored.checkpoint()["native"] == b.checkpoint()["native"]
    before = b.checkpoint()
    with pytest.raises(ValueError):
        b.schedule([(700, CAR, Command()), (700, CAR, Command())])
    assert b.checkpoint() == before


def test_contacts_resolve_in_order_before_passing_the_leader():
    field = [vehicle(s=320, v=100), vehicle("f1-4", s=326, v=8)]
    b = run(field, 1, Command(automatic=False))
    (hit,) = b["events"]
    assert hit["kind"] == "contact" and 0 < hit["time_s"] < 0.02
    rows = [b["rows"][v["entry"]][0] for v in field]
    assert rows[0][INDEX["speed_m_s"]] < 100 and rows[1][INDEX["speed_m_s"]] > 8
    assert rows[0][INDEX["s_m"]] < rows[1][INDEX["s_m"]]
    with pytest.raises(ValueError, match="overlapping"):
        Session(MONZA, [vehicle(s=100), vehicle("f1-4", s=103)])
    with pytest.raises(ValueError, match="envelope"):
        Session(MONZA, [vehicle(d=15)])


def test_grid_full_dimensions_and_rotation():
    road = load_layout(MONZA).track
    f = road.ribbon(Road.circuit).sample([(320, 0)])[0]
    # The centre and half-width fit, the sideways car's nose does not.
    d = f[7] - 1.1
    (offset,) = road.grid_offsets(
        [Body("A", Cursor(Road.circuit, 320, 0), d, 5.6, 2.0, 1.0, 1.57)]
    )
    assert offset < d - 1.4


def test_aero_concepts_exchange_advantage_between_tracks():
    # Shipped Ferrari and Aston Martin serials, same fuel, compound and controls.
    def flying_lap(track, entry, setup=None):
        s = Session(track, [opening_vehicle(entry, setup=setup, temp=95, fuel=35)])
        return [
            e["elapsed_s"]
            for e in s.advance(15000, sample_every=0)["events"]
            if e["kind"] == "lap"
        ][1]

    # A change in layout alters the difference between these two concepts.
    # The identity of the winning constructor is not a physics invariant.
    gaps = [
        flying_lap(track, "f1-44") - flying_lap(track, "f1-18")
        for track in (MONZA, "circuit-de-monaco:gp")
    ]
    assert abs(gaps[0] - gaps[1]) > 0.01
    # Spec F3 chassis isolates the physical wing setup.
    entry = BY_CLASS["F3"]
    low, high = {"wing": 0.72}, {"wing": 1.26}
    assert flying_lap(MONZA, entry, low) < flying_lap(MONZA, entry, high)
    assert flying_lap("circuit-de-monaco:gp", entry, low) > flying_lap(
        "circuit-de-monaco:gp", entry, high
    )


def test_short_run_and_long_stint_have_different_compound_optima():
    def stint(compound):
        v = opening_vehicle(CAR, compound=compound, temp=95.0, fuel=95.0)
        return [
            e["elapsed_s"]
            for e in Session(MONZA, [v]).advance(150000, sample_every=0)["events"]
            if e["kind"] == "lap"
        ]

    hard, soft = stint("C1"), stint("C5")
    assert soft[0] < hard[0] and sum(soft[:20]) > sum(hard[:20])
    assert len(hard) >= 20 and len(soft) >= 20


def test_dated_installed_assembly_and_archive_source(tmp_path, monkeypatch):
    from . import components, storage
    from .test_career import create
    from .statistics import telemetry
    from .statistics.models import RecordingPolicy

    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    cid = create()["id"]
    with storage.transaction() as db:
        state = storage.checkpoint(db, cid)
        row = career_vehicle(state, "f1-4")
        fitted = components.mounting(state, row["entry"])
        assert row["spec"]["dry_mass"] == pytest.approx(
            sum(
                components.spec(state, i)["parameters"]["mass_kg"]
                for i in fitted.values()
            )
        )
        s = Session(MONZA, [row], kind="practice")
        batch = s.advance(16, sample_every=4)
        ctx = Context(
            org=row["org"],
            org_name="McLaren",
            series=row["series"],
            season="f1-2025",
            regulation=row["configuration"]["regulation"],
            round="monza",
            session="practice-1",
            session_kind="practice",
            track="monza",
            layout=MONZA,
            layout_version=VERSION,
            entry=row["entry"],
            car=row["car"],
        )
        blocks = list(s.channel_blocks(batch, {ctx.entry: ctx}, period_ticks=4))
        engine = next(b for b in blocks if b.channel == "power")
        assert engine.context.component.instance == fitted["engine"]
        assert engine.values == [
            r[INDEX["combustion_kw"]] for r in batch["rows"][ctx.entry]
        ]
        wheels = [b for b in blocks if b.channel == "wear"]
        assert {b.context.component.instance for b in wheels} == set(row["wheel_ids"])
        telemetry.configure(
            db, cid, RecordingPolicy(period_us=80000, archive_days=None)
        )
        for _ in range(2):
            for i in range(0, len(blocks), 32):
                telemetry.record(db, cid, telemetry.Blocks(blocks=blocks[i : i + 32]))
        assert db.execute(
            "SELECT COUNT(*) FROM stat_channel WHERE career=?", (cid,)
        ).fetchone()[0] == len(blocks)
        lap_facts = list(
            s.event_facts(s.advance(18000, sample_every=0), {ctx.entry: ctx})
        )
        laps = [fact.data for fact in lap_facts if fact.data.kind == "lap"]
        assert laps and laps[0].lap == 1
        assert all(
            len(lap.sectors_us) == 3 and sum(lap.sectors_us) == lap.elapsed_us
            for lap in laps
        )
        from .statistics import facts
        from .statistics.models import Batch

        facts.record(db, cid, Batch(facts=lap_facts))
        facts.record(db, cid, Batch(facts=lap_facts))
        from .catalog import lineup_for

        ev = next(
            e
            for e in lineup_for(state)["events"]
            if e["series"] == "f1" and e["kind"] == "round"
        )
        dated = dict(state, date=ev["start"])
        admitted = Session.for_event(dated, ev["id"], [ctx.entry])
        assert admitted.checkpoint()["config"]["field"][0]["day"] == ev["start"]
        # Installing a different serial affects the next admission only.
        revised = deepcopy(state)
        spare = next(
            i
            for i in components.parts_for(state).by_org[row["org"]]
            if "/rear-wing/2/spare" in i
        )
        revised["components"]["mounts"][row["entry"]] = {"rear-wing": spare}
        new = career_vehicle(revised, row["entry"])
        assert new["spec"]["wing_area"] < row["spec"]["wing_area"]
        assert (
            s.checkpoint()["config"]["field"][0]["components"]["rear-wing"]
            == row["components"]["rear-wing"]
        )


def test_corner_profile_and_braking_on_same_flying_lap():
    # Map vertices in Curva Grande used to generate several false braking zones.
    car = opening_vehicle("f1-44", fuel=10, temp=95, compound="C5")
    car["start"].update(s=0, d=0, v=320.3833 / 3.6)
    session = Session(MONZA, [car], kind="qualifying", ambient=26.7, track_c=41.8)
    rows = session.advance(2300, sample_every=1)["rows"]["f1-44"]
    first_stop = [r for r in rows if 500 < r[INDEX["s_m"]] < 900]
    assert min(r[INDEX["ax_m_s2"]] for r in first_stop) < -3 * 9.80665
    bend = [r for r in rows if 1280 < r[INDEX["s_m"]] < 1720]
    assert bend and max(r[INDEX["brake"]] for r in bend) < 0.05
    assert all(abs(r[INDEX["d_m"]] - r[INDEX["profile_offset_m"]]) < 1 for r in bend)


@pytest.mark.parametrize("category", ["F2", "F3", "F4", "FR"])
def test_opening_engine_can_deliver_rated_power_through_fitted_gearbox(category):
    entry = BY_CLASS[category]
    car = opening_vehicle(entry, temp=85)
    delivered = []
    for speed in range(48, 81, 4):
        car["start"].update(s=100, d=0, v=speed)
        row = run([car], 1, Command(automatic=False, throttle=1))["rows"][entry][0]
        delivered.append(row[INDEX["combustion_kw"]])
    assert max(delivered) >= 0.99 * car["spec"]["power_kw"]
    assert max(delivered) <= car["spec"]["power_kw"] + 1e-9


def test_opening_drawings_preserve_saved_catalogue_and_aero_owner():
    from .components.catalog import parts_for

    def drawing(catalog, slot):
        parts = parts_for({"opening": True, "components": {"catalog": catalog}})
        serial = parts.installed["f1-44"][slot]
        return parts.specs[parts.stock[serial]["spec"]]["parameters"]

    assert drawing("2025-parts-v2", "brakes")["total_torque_nm"] == 4320
    assert "front_lift_area_m2" not in drawing("2025-parts-v2", "chassis")
    car = opening_vehicle("f1-44")["spec"]
    assert car["brake_nm"] == drawing("2025-parts-v3", "brakes")["total_torque_nm"]
    assert (
        car["front_area"] == drawing("2025-parts-v3", "chassis")["front_lift_area_m2"]
    )
    assert car["base_drag"] == drawing("2025-parts-v3", "chassis")["base_drag_area_m2"]
