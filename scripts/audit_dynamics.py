"""Record comparable flying laps through the installed native session, at 50 Hz."""

import argparse
import csv
import json
from pathlib import Path

import numpy as np

from backend.components.catalog import parts_for
from backend.race.layouts import Road, load_layout
from backend.race.session import Command, INDEX, Session
from backend.race.vehicles import opening_vehicle

# Hamilton Q3 telemetry, 2025 (lap 16 and 27). Unknown fuel, SoC and setup
# stay explicit experimental inputs. Other classes use a preceding run-up lap.
F1 = {
    "monza": ("monza:gp", "C5", 320.38333297777774, 26.7, 41.8),
    "monaco": ("circuit-de-monaco:gp", "C6", 279.3857115428571, 20.8, 37.5),
}
CLASSES = [
    ("f2-7", "monza:gp", "soft"),
    ("f3-3", "monza:gp", "soft"),
    ("f4-it-3", "monza:gp", "slick"),
    ("freca-27", "monza:gp", "slick"),
    ("dtm-63", "norisring:gp", "slick"),
    ("wec-51", "imola:gp", "soft"),
    ("wec-46", "imola:gp", "slick"),
    ("kart-ok-101", "kartcenter-campillos:international", "slick"),
    ("kart-okj-207", "kartcenter-campillos:international", "slick"),
]


def record(folder, key, track, car, lap=2, **conditions):
    session = Session(track, [car], **conditions)
    entry = car["entry"]
    events, rows = [], []
    for _ in range(32):
        batch = session.advance(1000, sample_every=1)
        events.extend(e for e in batch["events"] if e["kind"] == "lap")
        rows.extend(batch["rows"][entry])
        if len(events) >= lap:
            break
    else:
        raise RuntimeError(f"No complete lap: {key}")
    event = events[lap - 1]
    end = event["time_s"]
    start = end - event["elapsed_s"]
    data = np.asarray(rows)
    tick = data[:, INDEX["tick"]] * 0.02
    inside = (tick > start) & (tick <= end)
    trace = data[inside]
    time = tick[inside] - start
    road = load_layout(track).track.ribbon(Road.circuit)

    def boundary(channel, initial):
        return np.interp([start, end], tick, data[:, INDEX[channel]], left=initial)

    fuel = boundary("fuel_kg", car["start"]["fuel"])
    energy = boundary("energy_kj", car["start"]["energy"])
    distance = boundary("distance_m", 0.0)
    gates = [start, *event["split_times_s"], end]
    summary = dict(
        case=key,
        entry=entry,
        layout=track,
        compound=car["compound"],
        lap_s=end - start,
        sectors_s=np.diff(gates).tolist(),
        mean_kmh=(distance[1] - distance[0]) * 3.6 / (end - start),
        max_kmh=max(trace[:, INDEX["speed_m_s"]]) * 3.6,
        ax_min_g=min(trace[:, INDEX["ax_m_s2"]]) / 9.80665,
        ax_max_g=max(trace[:, INDEX["ax_m_s2"]]) / 9.80665,
        ay_abs_max_g=max(abs(trace[:, INDEX["ay_m_s2"]])) / 9.80665,
        fuel_start_kg=fuel[0],
        fuel_used_kg=fuel[0] - fuel[1],
        energy_start_kj=energy[0],
        energy_net_kj=energy[0] - energy[1],
    )
    if key in F1:
        channels = [
            "s_m",
            "distance_m",
            "d_m",
            "x_m",
            "y_m",
            "speed_m_s",
            "ax_m_s2",
            "ay_m_s2",
            "throttle",
            "brake",
            "steer_rad",
            "gear",
            "rpm",
            "combustion_kw",
            "electric_kw",
            "downforce_n",
            "drag_n",
            "fuel_kg",
            "energy_kj",
        ]
        channels.extend(
            c
            for c in ["profile_m_s", "profile_curvature_m_inv", "profile_offset_m"]
            if c in INDEX
        )
        with (folder / f"{key}.csv").open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["time_s", "progress", *channels])
            for t, r in zip(time, trace, strict=True):
                writer.writerow(
                    [
                        f"{x:.7f}"
                        for x in [
                            t,
                            r[INDEX["s_m"]] / road.length,
                            *[r[INDEX[c]] for c in channels],
                        ]
                    ]
                )
    return summary


def straight(entry, track, compound, kart):
    """Force-controlled transient on the main straight, independent of the profile."""
    v0, top, low = (30, 60, 25) if kart else (0, 100, 40)
    car = opening_vehicle(
        entry, compound=compound, fuel=2 if kart else 12, temp=55 if kart else 80
    )
    car["start"].update(s=0, d=0, v=v0 / 3.6)
    s = Session(track, [car])
    s.schedule([(0, entry, Command(automatic=False, throttle=1, drs=False))])
    r = np.array(s.advance(750, sample_every=1)["rows"][entry])
    v = np.r_[v0, r[:, INDEX["speed_m_s"]] * 3.6]
    i = np.flatnonzero(v >= top)[0]
    t = np.interp(top, v[i - 1 : i + 1], [(i - 1) * 0.02, i * 0.02])
    car["start"]["v"] = top / 3.6
    s = Session(track, [car])
    s.schedule([(0, entry, Command(automatic=False, brake=1, drs=False))])
    r = np.array(s.advance(500, sample_every=1)["rows"][entry])
    v = np.r_[top, r[:, INDEX["speed_m_s"]] * 3.6]
    d = np.r_[0, r[:, INDEX["distance_m"]]]
    i = np.flatnonzero(v <= low)[0]
    stop = np.interp(-low, -v[i - 1 : i + 1], d[i - 1 : i + 1])
    return dict(acceleration_s=t, braking_m=stop)


def main(folder):
    folder.mkdir(parents=True, exist_ok=True)
    summary = []
    for key, (track, compound, speed, air, asphalt) in F1.items():
        conditions = dict(kind="qualifying", ambient=air, track_c=asphalt)
        legacy = parts_for(
            {"opening": True, "components": {"catalog": "2025-parts-v2"}}
        )

        def previous(slot):
            iid = legacy.installed["f1-44"][slot]
            return legacy.specs[legacy.stock[iid]["spec"]]["parameters"]

        for variant, fuel, setup in [
            ("5kg", 5, {}),
            ("nominal", 10, {}),
            ("15kg", 15, {}),
            ("wing", 10, {"wing": 0.72 if key == "monza" else 1.26}),
            ("legacy-brakes", 10, {}),
            ("legacy-aero", 10, {}),
            ("legacy-hardware", 10, {}),
        ]:
            car = opening_vehicle(
                "f1-44", fuel=fuel, temp=95, compound=compound, setup=setup
            )
            if variant.startswith("legacy") and "front_area" not in car["spec"]:
                continue
            if variant in {"legacy-brakes", "legacy-hardware"}:
                car["spec"]["brake_nm"] = previous("brakes")["total_torque_nm"]
            if variant in {"legacy-aero", "legacy-hardware"}:
                car["spec"].update(
                    front_area=0.0, base_drag=previous("chassis")["base_drag_area_m2"]
                )
            car["start"].update(s=0.0, d=0.0, v=speed / 3.6)
            name = key if variant == "nominal" else f"{key}-{variant}"
            row = record(folder, name, track, car, 1, **conditions)
            if variant == "nominal":
                row.update(straight("f1-44", track, compound, False))
            summary.append(row)
        summary.append(
            record(
                folder, key + "-35kg", track, opening_vehicle("f1-44", temp=95, fuel=35)
            )
        )
    for entry, track, compound in CLASSES:
        kart = entry.startswith("kart")
        car = opening_vehicle(
            entry, compound=compound, fuel=2 if kart else 12, temp=55 if kart else 80
        )
        summary.append(
            record(
                folder,
                car["category"],
                track,
                car,
                kind="practice" if entry == "dtm-63" else "qualifying",
            )
            | straight(entry, track, compound, kart)
        )
    (folder / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    main(parser.parse_args().folder)
