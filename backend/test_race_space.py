"""Acceptance checks against the packaged 2025 configurations, in SI units."""

from math import dist, floor, hypot, isfinite
import pickle

import pytest
from fastapi.testclient import TestClient
from _race_space import Body, Cursor, Road, Surface

from .app import app
from .catalog import SEASON_LINEUP
from .race.layouts import (
    LINE_CLASSES,
    VERSION,
    base_lines,
    event_layout,
    layout_ids,
    load_layout,
)


def test_complete_2025_calendar():
    events = [
        event_layout(e) for e in SEASON_LINEUP["events"] if e["kind"] != "presentation"
    ]
    assert sorted(set(events)) == layout_ids()
    assert len(set(events)) == 53
    assert {
        "silverstone:gp",
        "silverstone:national",
        "donington-park:gp",
        "donington-park:national",
    } <= set(events)


@pytest.mark.parametrize("layout_id", layout_ids())
def test_configurations(layout_id):
    layout = load_layout(layout_id)
    info, track = layout.info, layout.track
    road, pit = track.ribbon(Road.circuit), track.ribbon(Road.pit)
    assert abs(road.length / info["length_m"] - 1) < 0.012
    assert 0 < track.exit < track.entry < road.length
    assert 0 < track.pit_timing < pit.length
    assert 0 < info["sectors"][0] < info["sectors"][1] < 1
    assert all(0 <= a < 1 and 0 <= b < 1 and a != b for a, b in info["drs"])
    assert info["sources"]["centreline"].startswith("https://")
    car = LINE_CLASSES["kart" if layout_id.endswith(":international") else "formula"]
    lines = base_lines(layout_id, VERSION, car)
    centres = [(i * road.length / 512, 0.0) for i in range(512)]
    frames = road.sample(centres)
    left, dry, right = (lines.offsets([(s, p) for s, _ in centres]) for p in (1, 0, -1))
    for row, left_line, mid, right_line in zip(frames, left, dry, right, strict=True):
        assert all(map(isfinite, row))
        assert hypot(*row[3:5]) == pytest.approx(1, abs=1e-11)
        assert (
            -row[8] + car.width / 2
            <= right_line
            <= mid
            <= left_line
            <= row[7] - car.width / 2
        )
        assert min(row[10:15]) >= 0
    assert road.sample([(road.length, 0)])[0] == frames[0]
    assert (
        road.surface(0, frames[0][7] + frames[0][11] + frames[0][13] + 1)
        == Surface.outside
    )
    assert layout.boxes() and len(layout.grid(32)) == 32
    assert all(
        row[15] == 0
        for row in pit.sample(layout.boxes()) + road.sample(layout.grid(32))
    )
    for s, t in ((track.entry, 0.0), (track.exit, pit.length)):
        for d in (-1.0, 0.0, 1.0):
            main = road.sample([(s, d)])[0]
            branch = pit.sample([(t, d)])[0]
            assert branch[:5] == pytest.approx(main[:5], abs=1e-9)
            assert lines.pit_offsets([(t, d)]) == pytest.approx(
                lines.offsets([(s, d)]), abs=1e-9
            )
    position = Cursor(Road.circuit, track.entry - 0.5, 17)
    whole = track.advance([(position, 0.5 + pit.length + 11.0, True)])[0]
    middle = track.advance([(position, 0.5 + track.pit_timing + 0.01, True)])[0]
    resumed = track.advance(
        [(pickle.loads(pickle.dumps(middle)), pit.length - middle.s + 11, False)]
    )[0]
    assert whole.road == resumed.road == Road.circuit
    assert whole.s == pytest.approx(track.exit + 11, abs=1e-8)
    assert resumed.s == pytest.approx(whole.s, abs=1e-8)
    assert middle.lap == whole.lap == resumed.lap == 18


def crossings(road):
    """Intersect non-neighbouring plan chords, then compare their interpolated heights."""
    count = round(road.length / 4)
    step = road.length / count
    rows = road.sample([(i * step, 0) for i in range(count)])
    cells = {}

    def determinant(a, b):
        return a[0] * b[1] - a[1] * b[0]

    for i, (a, b) in enumerate(zip(rows, rows[1:] + rows[:1], strict=True)):
        x, y = a[:2]
        v = (b[0] - x, b[1] - y)
        boxes = [
            (k, j)
            for k in range(floor(min(x, b[0]) / 32), floor(max(x, b[0]) / 32) + 1)
            for j in range(floor(min(y, b[1]) / 32), floor(max(y, b[1]) / 32) + 1)
        ]
        for j in {j for box in boxes for j in cells.get(box, ())}:
            if i - j in {1, count - 1}:
                continue
            c, d = rows[j], rows[(j + 1) % count]
            w = (d[0] - c[0], d[1] - c[1])
            den = determinant(v, w)
            if abs(den) < 1e-9:
                continue
            q = (c[0] - x, c[1] - y)
            u, t = determinant(q, w) / den, determinant(q, v) / den
            if 0 < u < 1 and 0 < t < 1:
                yield (i + u) * step, (j + t) * step
        for box in boxes:
            cells.setdefault(box, []).append(i)


@pytest.mark.parametrize("layout_id", layout_ids())
def test_plan_topology(layout_id):
    track = load_layout(layout_id).track
    road = track.ribbon(Road.circuit)
    hits = list(crossings(road))
    if layout_id != "suzuka:gp":
        assert not hits
        return
    ((upper, lower),) = hits
    points = [r[:3] for r in road.sample([(upper, 0), (lower, 0)])]
    assert dist(points[0][:2], points[1][:2]) < 0.1
    assert points[0][2] - points[1][2] > 5
    assert [p[0] for p in road.project(points)] == pytest.approx(
        [upper, lower], abs=0.01
    )
    assert not track.overlaps(
        [
            Body(str(i), Cursor(Road.circuit, s, 1), 0, 5.6, 2, 1)
            for i, s in enumerate((upper, lower))
        ]
    )


def test_spatial_replay_and_side_by_side():
    layout = load_layout("suzuka:gp")
    track, road = layout.track, layout.track.ribbon(Road.circuit)
    lines = base_lines("suzuka:gp", VERSION, LINE_CLASSES["formula"])
    a, b = [Cursor(Road.circuit, road.length - 10, 0) for _ in range(2)]
    for _ in range(120):
        a, b = track.advance([(a, 7.0, False), (b, 7.0, False)])
        assert a.s == b.s
        assert a.lap == b.lap
        bodies = [Body("a", a, -1.7, 5.6, 2.0, 1.0), Body("b", b, 1.7, 5.6, 2.0, 1.0)]
        assert track.overlaps(bodies) == []
        bodies[1] = Body("b", b, -1.2, 5.6, 2.0, 1.0)
        assert track.overlaps(bodies) == track.overlaps(bodies[::-1]) == [("a", "b")]
    assert lines.transitions(
        [(a.s, -1, 1, 0, 30), (a.s, -1, 1, 30, 30)]
    ) == pytest.approx(lines.offsets([(a.s, -1), (a.s, 1)]))
    assert road.length == pytest.approx(5809.62870261, abs=0.001)
    assert road.sample([(1234.5, 1.25)])[0][:3] == pytest.approx(
        [56.335498, -410.969388, 29.175401], abs=0.001
    )
    with pytest.raises(ValueError):
        track.advance([(a, float("nan"), False)])


def test_event_geometry_api():
    client = TestClient(app)
    events = SEASON_LINEUP["events"]
    formula = next(e for e in events if e["series"] == "f1" and e["kind"] == "round")
    shared = next(
        e
        for e in events
        if e["series"] == "f2" and event_layout(e) == event_layout(formula)
    )

    def request(event):
        return client.get(
            f"/api/race/events/{event['id']}/geometry", params={"samples": 64}
        )

    a, b = request(formula).json(), request(shared).json()
    assert a["id"] == b["id"] == event_layout(formula)
    assert a["circuit"] == b["circuit"]
    assert len(a["circuit"]) == 64
    assert a["contract_version"] == 1 and a["version"] == VERSION
    assert a["grid_coordinates_m"] and a["box_coordinates_m"]
    assert len(a["pit_line_offsets_m"]["dry"]) == len(a["pit"])
    assert a["line_offsets_m"]["dry"] != b["line_offsets_m"]["dry"]
    assert (
        request(next(e for e in events if e["kind"] == "presentation")).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/race/events/{formula['id']}/geometry?samples=10000"
        ).status_code
        == 422
    )
