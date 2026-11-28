"""Resolve existing calendar identities to immutable native spatial configurations."""

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path

from _race_space import Body, Cursor, CONTRACT_VERSION, Lines, Road, Track

from .vehicles import CLASSES

VERSION = "2025.1"
DATA = Path(__file__).with_name("data")
ALIASES = {
    "circuit-zandvoort-nl": "zandvoort:gp",
    "red-bull-ring-a": "red-bull-ring:gp",
    "circuit-de-la-sarthe": "circuit-de-la-sarthe:24h",
    "dekra-lausitzring": "dekra-lausitzring:dtm",
    "nurburgring": "nurburgring:sprint",
}
SAMPLE_COLUMNS = (
    "x_m",
    "y_m",
    "z_m",
    "tangent_x",
    "tangent_y",
    "curvature_per_m",
    "grade",
    "width_left_m",
    "width_right_m",
    "crossfall",
    "roughness_rms_m",
    "kerb_left_m",
    "kerb_right_m",
    "runoff_left_m",
    "runoff_right_m",
    "surface",
)


# Planning envelopes in metres. A vehicle can supply its own specification.
@dataclass(frozen=True)
class LineSpec:
    width: float
    clearance: float
    lookahead: float


LINE_CLASSES = {
    "formula": LineSpec(2.0, 0.25, 18),
    "junior": LineSpec(1.75, 0.22, 12),
    "gt": LineSpec(2.05, 0.28, 14),
    "prototype": LineSpec(2.0, 0.28, 21),
    "kart": LineSpec(1.4, 0.12, 5),
}


def envelope(spec):
    return spec.length, spec.width, spec.height


# Geometry previews use the largest representative for the selected line class.
GRID_ENVELOPES = {
    key: envelope(CLASSES[category])
    for key, category in {
        "formula": "F1",
        "junior": "F2",
        "gt": "GT3",
        "prototype": "Hypercar",
        "kart": "OK",
    }.items()
}


def event_layout(event):
    if event["kind"] == "presentation":
        return None
    track = event["track_id"]
    return event.get("layout_id") or ALIASES.get(track, track + ":gp")


@lru_cache
def _files(version):
    if version != VERSION:
        raise KeyError(version)
    return {p.stem.replace("--", ":"): p for p in (DATA / version).glob("*.json")}


def layout_ids(version=VERSION):
    return sorted(_files(version))


@dataclass(frozen=True)
class Layout:
    info: dict
    track: Track

    def grid(self, count, envelopes=None):
        """Grid centres on the circuit, in grid order; pole is position one."""
        if not 0 <= count <= 128:
            raise ValueError("invalid grid size")
        grid = self.info["grid"]
        road = self.track.ribbon(Road.circuit)
        centres = [
            (
                (grid["first_m"] - i * grid["pitch_m"]) % road.length,
                grid["offset_m"] * (1 if i % 2 == 0 else -1),
            )
            for i in range(count)
        ]

        if envelopes is None:
            envelopes = [
                GRID_ENVELOPES[
                    "kart" if self.info["id"].endswith(":international") else "formula"
                ]
            ] * count
        bodies = [
            Body(str(i), Cursor(Road.circuit, s, 0), d, *size)
            for i, ((s, d), size) in enumerate(zip(centres, envelopes, strict=True))
        ]
        offsets = self.track.grid_offsets(bodies)
        return [(s, d) for (s, _), d in zip(centres, offsets, strict=True)]

    def boxes(self):
        """Stable physical bay positions on the service side of the pit road."""
        road = self.track.ribbon(Road.pit)
        box = self.info["boxes"]
        start = box["start_fraction"] * road.length
        end = box["end_fraction"] * road.length
        if "count" in box:
            count = box["count"]
            spacing = (end - start) / count
        else:
            spacing = box["spacing_m"]
            count = int((end - start) / spacing)
        centres = [start + (i + 0.5) * spacing for i in range(count)]
        sections = road.sample([(s, 0) for s in centres])
        return [
            (s, box["side"] * (row[7] if box["side"] > 0 else row[8]) * 0.72)
            for s, row in zip(centres, sections, strict=True)
        ]


@lru_cache(maxsize=64)
def load_layout(layout_id, version=VERSION):
    data = json.loads(_files(version)[layout_id].read_bytes())
    if (data["contract_version"], data["id"], data["version"]) != (
        CONTRACT_VERSION,
        layout_id,
        version,
    ):
        raise ValueError("geometry identity or version mismatch")
    sectors = data["sectors"]
    if sorted(set(sectors)) != sectors or not all(0 < gate < 1 for gate in sectors):
        raise ValueError("invalid split order")
    track = Track(
        CONTRACT_VERSION,
        data.pop("stations"),
        data.pop("pit_stations"),
        data["pit_entry"],
        data["pit_exit"],
        data["pit_timing"],
    )
    return Layout(data, track)


@lru_cache(maxsize=128)
def base_lines(layout_id, version, specification):
    track = load_layout(layout_id, version).track
    return Lines(
        track, specification.width, specification.clearance, specification.lookahead
    )


def geometry_snapshot(
    layout_id, version, series, vehicle_class, samples, grid_count=20
):
    """One batched read of the authoritative representation, including both roads."""
    if not 32 <= samples <= 8192:
        raise ValueError("sample count outside 32..8192")
    layout = load_layout(layout_id, version)
    track = layout.track
    circuit, pit = (track.ribbon(r) for r in (Road.circuit, Road.pit))
    distance = [i * circuit.length / samples for i in range(samples)]
    lines = base_lines(layout_id, version, LINE_CLASSES[vehicle_class])
    offsets = lines.offsets([(s, p) for p in (-1, 0, 1) for s in distance])
    pit_count = max(8, round(samples * pit.length / circuit.length))
    pit_distances = [i * pit.length / pit_count for i in range(pit_count)] + [
        pit.length
    ]
    return {
        **layout.info,
        "vehicle_class": vehicle_class,
        "drs": layout.info["drs"] if series in {"f1", "f2", "f3"} else [],
        "sample_columns": SAMPLE_COLUMNS,
        "circuit_length_m": circuit.length,
        "pit_length_m": pit.length,
        "pit_entry_m": track.entry,
        "pit_exit_m": track.exit,
        "pit_timing_m": track.pit_timing,
        "sector_gates_m": [s * circuit.length for s in layout.info["sectors"]],
        "circuit": circuit.sample([(s, 0) for s in distance]),
        "pit": pit.sample([(s, 0) for s in pit_distances]),
        "line_offsets_m": {
            key: offsets[i * samples : (i + 1) * samples]
            for i, key in enumerate(("right", "dry", "left"))
        },
        "pit_line_offsets_m": {
            name: lines.pit_offsets([(s, p) for s in pit_distances])
            for p, name in ((-1, "right"), (0, "dry"), (1, "left"))
        },
        "grid_coordinates_m": layout.grid(
            grid_count, [GRID_ENVELOPES[vehicle_class]] * grid_count
        ),
        "box_coordinates_m": layout.boxes(),
    }
