"""Record fixed-step native races and replay selected incidents from measured poses."""

import argparse
import csv
import json
import math
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.catalog import SEASON_LINEUP  # noqa: E402
from backend.race.layouts import Road, load_layout  # noqa: E402
from backend.race.session import INDEX, Session  # noqa: E402
from backend.race.vehicles import opening_vehicle  # noqa: E402

GRIDS = {
    "f1": "monza:gp",
    "f2": "red-bull-ring:gp",
    "f3": "barcelona-catalunya:gp",
    "f4-gb": "brands-hatch:gp",
    "f4-es": "motorland-aragon:gp",
    "kart-okj": "kartcenter-campillos:international",
    "freca": "imola:gp",
    "f4-it": "vallelunga:internazionale",
    "kart-ok": "rdby-karting-ring:international",
    "wec": "fuji-speedway:gp",
}
ERRORS = {
    "steering-error",
    "missed-braking",
    "spin",
    "lockup",
    "off-track",
    "aquaplaning",
}


def grid(series):
    return [
        opening_vehicle(e["id"], temp=75)
        for e in SEASON_LINEUP["entries"].values()
        if e["championship"] == series
    ]


def race(series, seconds, seed, capture):
    field = grid(series)
    sim = Session(GRIDS[series], field, seed=seed, kind="race")
    ids = [r["entry"] for r in field]
    rows = {i: [] for i in ids}
    events = []
    wall = 0
    stride = 5 if capture else 0
    columns = [
        INDEX[k]
        for k in (
            "s_m",
            "d_m",
            "x_m",
            "y_m",
            "heading_rad",
            "speed_m_s",
            "brake",
            "throttle",
            "contact",
        )
    ]
    for tick in range(0, seconds * 50, 500):
        start = perf_counter()
        batch = sim.advance(min(500, seconds * 50 - tick), sample_every=stride)
        wall += perf_counter() - start
        events.extend(batch["events"])
        for eid, block in batch["rows"].items():
            rows[eid].extend(tuple(row[i] for i in columns) for row in block)
    state = sim.checkpoint()["native"]
    counts = Counter(e["kind"] for e in events)
    pending = sum(bool(s["driver_state"]["target"]) for s in state["states"].values())
    assert (
        counts["attack"] + counts["counterattack"]
        == counts["attack-aborted"] + counts["attack-completed"] + pending
    )
    report = dict(
        series=series,
        cars=len(field),
        seconds=seconds,
        seed=seed,
        attacks=counts["attack"] + counts["counterattack"],
        completed=counts["attack-completed"],
        aborted=counts["attack-aborted"],
        pending=pending,
        defences=counts["defence"],
        counters=counts["counterattack"],
        crossovers=counts["crossover"],
        contacts=counts["contact"],
        errors=sum(counts[k] for k in ERRORS),
        blocked=counts["blocked"],
        recovered=counts["recovered"],
        laps=counts["lap"],
        min_laps=min(s["completed_laps"] for s in state["states"].values()),
        moving=sum(s["v"] > 1 for s in state["states"].values()),
        wall_s=round(wall, 3),
        car_ticks_s=round(seconds * 50 * len(field) / wall),
    )
    return report, state, events, rows, field


def replay(series, events, rows, field, output):
    from PIL import Image, ImageDraw, ImageFont

    ids = list(rows)
    road = load_layout(GRIDS[series]).track.ribbon(Road.circuit)
    samples = road.sample([(i * road.length / 1200, 0) for i in range(1200)])
    sections = [(s[0], s[1], s[3], s[4], s[7], s[8]) for s in samples]
    font = ImageFont.load_default(size=16)
    small = ImageFont.load_default(size=12)
    xmin, xmax = min(p[0] for p in sections), max(p[0] for p in sections)
    ymin, ymax = min(p[1] for p in sections), max(p[1] for p in sections)
    map_scale = min(136 / (xmax - xmin), 83 / (ymax - ymin))

    def overview(x, y):
        return 507 + (x - xmin) * map_scale, 144 - (y - ymin) * map_scale

    outline = [overview(p[0], p[1]) for p in sections]
    clips = [("start", 0, ids[0], "")]
    for label, kinds in [
        ("duel", {"attack-completed"}),
        ("defence", {"defence"}),
        ("crossover", {"crossover"}),
        ("error", ERRORS),
        ("contact", {"contact"}),
        ("recovery", {"recovered"}),
    ]:
        e = next((e for e in events if e["kind"] in kinds and e["time_s"] > 3), None)
        if e:
            clips.append((e["kind"], e["time_s"], e["entry"], e["other"]))
    specs = {c["entry"]: c for c in field}
    frames = []
    for label, at, eid, other in clips:
        first = max(0, int((at - 2.5) * 10))
        end = min(len(rows[eid]), int((at + (6 if label == "start" else 3.6)) * 10))
        for j in range(first, end):
            im = Image.new("RGB", (660, 374), "#10171d")
            d = ImageDraw.Draw(im)
            s, _, x, y, yaw, v, brake, gas, _ = rows[eid][j]
            cs, sn = math.cos(yaw), math.sin(yaw)
            scale = 8 if series.startswith("kart") else 4

            def project(px, py):
                dx, dy = px - x, py - y
                return (
                    265 + scale * (dx * cs + dy * sn),
                    196 - scale * (-dx * sn + dy * cs),
                )

            center = int(s / road.length * 1200)
            edges = [[], []]
            for n in range(center - 100, center + 101):
                px, py, tx, ty, left, right = sections[n % 1200]
                edges[0].append(project(px - ty * left, py + tx * left))
                edges[1].append(project(px + ty * right, py - tx * right))
            d.polygon(edges[0] + edges[1][::-1], fill="#34434e")
            for edge in edges:
                d.line(edge, fill="#a8b2ba", width=2)
            for car in ids:
                _, _, px, py, angle, _, _, _, hit = rows[car][j]
                cx, cy = project(px, py)
                if not (-30 < cx < 690 and 46 < cy < 332):
                    continue
                spec = specs[car]["spec"]
                a, b = math.cos(angle), math.sin(angle)
                box = [
                    project(
                        px + a * longitudinal - b * width,
                        py + b * longitudinal + a * width,
                    )
                    for longitudinal, width in [
                        (k * spec["length"] / 2, h * spec["width"] / 2)
                        for k, h in [(-1, -1), (1, -1), (1, 1), (-1, 1)]
                    ]
                ]
                color = (
                    "#ff684f"
                    if hit
                    else "#f4ce63"
                    if car == eid
                    else "#56cdc0"
                    if car == other
                    else "#cb9ce1"
                    if specs[car]["category"] == "LMGT3"
                    else "#87a6ce"
                )
                d.polygon(box, fill=color)
                d.text((cx - 4, cy + 7), car.split("-")[-1], font=small, fill="white")
            d.rectangle((498, 48, 659, 152), fill="#182129")
            d.line(outline + [outline[0]], fill="#73858f", width=1)
            for car in ids:
                px, py = overview(*rows[car][j][2:4])
                d.ellipse((px - 1, py - 1, px + 1, py + 1), fill="#c2d2df")
            px, py = overview(x, y)
            d.ellipse((px - 2, py - 2, px + 2, py + 2), fill="#f4ce63")
            d.rectangle((0, 0, 660, 47), fill="#10171d")
            d.rectangle((0, 326, 660, 374), fill="#10171d")
            d.text(
                (15, 6),
                f"{series.upper()}   {GRIDS[series]}   |   {label}  {at:.2f} s",
                font=font,
                fill="white",
            )
            d.text(
                (15, 28),
                f"{(j + 1) / 10:.1f} s   ·   {eid}   {(' / ' + other) if other else ''}",
                font=small,
                fill="#f4ce63",
            )
            d.text(
                (15, 340),
                f"{v * 3.6:5.1f} km/h     throttle {gas:.2f}     brake {brake:.2f}     station {s:.0f} m",
                font=font,
                fill="white",
            )
            frames.append(im)
    frames[0].save(
        output / f"{series}.webp",
        save_all=True,
        append_images=frames[1:],
        duration=100,
        loop=0,
        quality=72,
        method=2,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--series", choices=GRIDS, nargs="+", default=list(GRIDS))
    ap.add_argument("--seconds", type=int, default=360)
    ap.add_argument("--seed", type=int, default=1808)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--film", action="store_true")
    ap.add_argument("--parallel", action="store_true")
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    reports = []
    for series in args.series:
        film = args.film and series in {"f1", "f2", "kart-ok", "wec"}
        report, state, events, rows, field = race(series, args.seconds, args.seed, film)
        if args.parallel:
            start = perf_counter()
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = [
                    pool.submit(race, series, args.seconds, args.seed, False)
                    for _ in range(2)
                ]
                for job in jobs:
                    _, other, observed, _, _ = job.result()
                    if state != other or events != observed:
                        raise RuntimeError("Parallel replay diverged")
            report["two_headless_wall_s"] = round(perf_counter() - start, 3)
        if film:
            replay(series, events, rows, field, args.output)
        print(json.dumps(report), flush=True)
        reports.append(report)
    with (args.output / "measurements.csv").open(
        "w", newline="", encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=reports[0], lineterminator="\n")
        writer.writeheader()
        writer.writerows(reports)


if __name__ == "__main__":
    main()
