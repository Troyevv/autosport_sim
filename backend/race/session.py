"""Private, fixed-step race physics boundary. No database or Python callbacks per tick."""

from copy import deepcopy
from dataclasses import asdict, dataclass
from threading import Lock

from _race_space import Dynamics

from .layouts import VERSION, event_layout, load_layout
from .vehicles import CORNERS, career_vehicle
from ..catalog import lineup_for
from ..statistics.models import ChannelBlock, Fact

TICK_US = 20_000
BASE_CHANNELS = (
    "tick",
    "s_m",
    "d_m",
    "x_m",
    "y_m",
    "z_m",
    "heading_rad",
    "distance_m",
    "lap",
    "speed_m_s",
    "ax_m_s2",
    "ay_m_s2",
    "fuel_kg",
    "energy_kj",
    "coolant_c",
    "gear",
    "rpm",
    "combustion_kw",
    "electric_kw",
    "throttle",
    "brake",
    "steer_rad",
    "drs",
    "drag_n",
    "downforce_n",
    "front_aero",
    "airflow",
    "wake",
    "contact",
    "shift",
)
WHEEL_CHANNELS = (
    "surface_c",
    "core_c",
    "pressure_kpa",
    "wear",
    "degradation",
    "grain",
    "blister",
    "flat",
    "cycles",
    "punctured",
    "load_n",
    "mu",
    "fx_n",
    "fy_n",
    "lock",
    "slip_w",
)
CHANNELS = BASE_CHANNELS + tuple(
    f"{wheel}_{name}" for wheel in CORNERS for name in WHEEL_CHANNELS
)
INDEX = {name: i for i, name in enumerate(CHANNELS)}


@dataclass(frozen=True)
class Command:
    automatic: bool = True
    throttle: float = 0.0
    brake: float = 0.0
    steer: float = 0.0
    deploy: float = 1.0
    preference: float = 0.0
    drs: bool = True
    gear: int = 0


class Session:
    """All identities, setups and installed versions are frozen before the first tick."""

    def __init__(
        self,
        layout_id,
        field,
        *,
        seed=0,
        ambient=22.0,
        track_c=30.0,
        water_mm=0.0,
        drs_enabled=True,
        kind="test",
        layout_version=VERSION,
        tyre_sets=None,
    ):
        if kind not in {"test", "practice", "qualifying", "sprint", "race"}:
            raise ValueError("Unknown session kind")
        layout = load_layout(layout_id, layout_version)
        field = deepcopy(field)
        envelopes = [
            tuple(row["spec"][k] for k in ("length", "width", "height"))
            for row in field
        ]
        grid = layout.grid(len(field), envelopes)
        for row, (s, d) in zip(field, grid, strict=True):
            saved = (tyre_sets or {}).get(row["tyre_set"])
            if saved is not None:
                if (saved["specification"], saved["compound"], saved["wheel_ids"]) != (
                    row["components"]["tyre"]["specification"],
                    row["compound"],
                    row["wheel_ids"],
                ):
                    raise ValueError("Mounted set identity or compound mismatch")
                row["start"]["tyres"] = deepcopy(saved["tyres"])
            row["start"].setdefault("s", s)
            row["start"].setdefault("d", d)
        serials = [
            part["instance"] for row in field for part in row["components"].values()
        ]
        if len(serials) != len(set(serials)):
            raise ValueError("Physical serial belongs to two entries")
        self._lock = Lock()
        self._config = dict(
            layout_id=layout_id,
            layout_version=layout_version,
            field=field,
            seed=seed,
            ambient=ambient,
            track_c=track_c,
            water_mm=water_mm,
            drs_enabled=drs_enabled,
            kind=kind,
        )
        conditions = dict(
            ambient=ambient,
            track_c=track_c,
            water_mm=water_mm,
            drs_enabled=drs_enabled,
            unrestricted_drs=kind not in {"race", "sprint"},
            zones=layout.info["drs"],
            sectors=layout.info["sectors"],
        )
        self._native = Dynamics(layout.track, conditions, field)

    @classmethod
    def for_event(cls, state, event_id, entries, *, options=None, **conditions):
        """Resolve the calendar layout and admit dated career serials in grid order."""
        world = lineup_for(state)
        event = next((e for e in world["events"] if e["id"] == event_id), None)
        if (
            not event
            or not event_layout(event)
            or not event["start"] <= state["date"] <= event["end"]
        ):
            raise ValueError("No circuit session on the career date for this event")
        field = []
        for entry in entries:
            if world["entries"][entry]["championship"] != event["series"]:
                raise ValueError("Entry is outside event series")
            field.append(career_vehicle(state, entry, **(options or {}).get(entry, {})))
        conditions.setdefault("seed", state["setup"]["seed"])
        return cls(event_layout(event), field, **conditions)

    def tyre_sets(self):
        """Carry the measured state of each mounted set across session boundaries."""
        with self._lock:
            states = self._native.checkpoint()["states"]
            return {
                v["tyre_set"]: dict(
                    specification=v["components"]["tyre"]["specification"],
                    compound=v["compound"],
                    wheel_ids=list(v["wheel_ids"]),
                    tyres=states[v["entry"]]["tyres"],
                )
                for v in self._config["field"]
            }

    def schedule(self, orders):
        """Each (absolute tick, entry, command) takes effect before integration."""
        with self._lock:
            self._native.enqueue(
                [
                    dict(tick=tick, entry=entry, command=asdict(cmd))
                    for tick, entry, cmd in orders
                ]
            )

    def advance(self, ticks, *, sample_every=5):
        with self._lock:
            batch = self._native.advance(ticks, sample_every)
            batch["period_ticks"] = sample_every
            return batch

    def checkpoint(self):
        with self._lock:
            return dict(
                version=1,
                config=deepcopy(self._config),
                native=self._native.checkpoint(),
            )

    @classmethod
    def resume(cls, saved):
        if saved["version"] != 1:
            raise ValueError("Unsupported race physics checkpoint")
        result = cls(**saved["config"])
        result._native.restore(saved["native"])
        return result

    def _check_context(self, vehicle, context):
        if "day" not in vehicle:
            raise ValueError("Statistics require a dated career admission")
        if (
            context.car,
            context.entry,
            context.org,
            context.series,
            context.regulation,
            context.layout,
            context.layout_version,
            context.session_kind,
        ) != (
            vehicle["car"],
            vehicle["entry"],
            vehicle["org"],
            vehicle["series"],
            vehicle["configuration"]["regulation"],
            self._config["layout_id"],
            self._config["layout_version"],
            self._config["kind"],
        ):
            raise ValueError("Telemetry context differs from frozen admission")

    def event_facts(self, batch, contexts):
        """Timed laps and observed contacts. Record certification belongs to race control."""
        entries = {v["entry"]: v for v in self._config["field"]}
        for event in batch["events"]:
            entry = event["entry"]
            vehicle = entries[entry]
            context = contexts[entry]
            self._check_context(vehicle, context)
            end_us = round(event["time_s"] * 1e6)
            if event["kind"] == "lap":
                start = round((event["time_s"] - event["elapsed_s"]) * 1e6)
                gates = [
                    start,
                    *[round(t * 1e6) for t in event["split_times_s"]],
                    end_us,
                ]
                data = dict(
                    kind="lap",
                    lap=event["lap"],
                    elapsed_us=end_us - start,
                    sectors_us=[b - a for a, b in zip(gates, gates[1:])],
                    eligible_for_record=False,
                )
            else:
                data = dict(
                    kind="incident",
                    source_id=f"{entry}/{event['other']}/{end_us}",
                    at_us=end_us,
                    related_event=None,
                    code="vehicle-contact",
                )
            yield Fact(
                version=1,
                day=vehicle["day"],
                access="public",
                data=dict(data, context=context),
            )

    def channel_blocks(self, batch, contexts, *, period_ticks):
        """Emit #35 blocks with frozen component ownership and dated supply rights."""
        if period_ticks < 1 or period_ticks != batch["period_ticks"]:
            raise ValueError("Positive recording period required")
        entries = {c["entry"]: c for c in self._config["field"]}
        for entry, rows in batch["rows"].items():
            vehicle = entries[entry]
            context = contexts[entry]
            self._check_context(vehicle, context)
            if any(b[0] - a[0] != period_ticks for a, b in zip(rows, rows[1:])):
                raise ValueError("Samples have a different recording period")
            for index, col in enumerate(CHANNELS[1:], 1):
                slot, name, unit = channel_identity(col)
                if slot == "transmission" and vehicle["spec"]["kart"]:
                    continue
                if (
                    col in {"energy_kj", "electric_kw"}
                    and not vehicle["spec"]["motor_kw"]
                ):
                    continue
                if col == "drs" and not vehicle["spec"]["drs"]:
                    continue
                ctx = context.model_dump()
                part = vehicle["components"].get(slot)
                if slot == "tyre":
                    wheel, quantity = col.split("_", 1)
                    part = dict(
                        part, instance=vehicle["wheel_ids"][CORNERS.index(wheel)]
                    )
                    name = {"surface_c": "temperature"}.get(quantity, quantity)
                ctx.update(component=part, contract=vehicle["contracts"].get(slot))
                for i in range(0, len(rows), 4096):
                    chunk = rows[i : i + 4096]
                    yield ChannelBlock(
                        version=1,
                        day=vehicle["day"],
                        context=ctx,
                        channel=name,
                        unit=unit,
                        first_us=int(chunk[0][0]) * TICK_US,
                        period_us=period_ticks * TICK_US,
                        values=[row[index] for row in chunk],
                    )


def channel_identity(col):
    if col == "coolant_c":
        return "engine", "temperature", "degC"
    if col == "combustion_kw":
        return "engine", "power", "kW"
    if col == "gear":
        return "transmission", "mode", "gear"
    if col in {"rpm", "fuel_kg", "energy_kj", "electric_kw"}:
        slot = "engine"
    elif col in {"gear", "shift"}:
        slot = "transmission"
    elif col.split("_", 1)[0] in CORNERS:
        slot = "tyre"
    else:
        slot = None
    units = {
        "m": "m",
        "m_s": "m/s",
        "m_s2": "m/s²",
        "rad": "rad",
        "kg": "kg",
        "kj": "kJ",
        "kw": "kW",
        "n": "N",
        "kpa": "kPa",
        "w": "W",
        "c": "degC",
        "rpm": "rpm",
    }
    unit = next(
        (
            value
            for suffix, value in units.items()
            if col == suffix or col.endswith("_" + suffix)
        ),
        "1",
    )
    return slot, col, unit
