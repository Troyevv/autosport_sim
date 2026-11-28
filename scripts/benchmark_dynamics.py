"""Run actual 2025 fields, independently replay checkpoints, report wall time and throughput."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.catalog import SEASON_LINEUP  # noqa: E402
from backend.race.session import Session  # noqa: E402
from backend.race.vehicles import opening_vehicle  # noqa: E402

LAYOUTS = {
    "wec": "circuit-de-la-sarthe:24h",
    "f1": "spa-francorchamps:gp",
    "kart-ok": "rdby-karting-ring:international",
}


def run(series, seconds, period, count):
    field = [
        opening_vehicle(e["id"], fuel=None, temp=75)
        for e in SEASON_LINEUP["entries"].values()
        if e["championship"] == series
    ]
    if count is not None:
        if not 1 <= count <= len(field):
            raise ValueError("Requested field exceeds available entries")
        field = field[:count]
    sim = Session(LAYOUTS[series], field)
    samples = contacts = laps = 0
    # Discard each block after reading it, as a recorder does after archiving.
    ticks = seconds * 50
    elapsed = 0
    while elapsed < ticks:
        n = min(500, ticks - elapsed)
        batch = sim.advance(n, sample_every=period)
        samples += sum(map(len, batch["rows"].values()))
        contacts += sum(e["kind"] == "contact" for e in batch["events"])
        laps += sum(e["kind"] == "lap" for e in batch["events"])
        elapsed += n
    saved = sim.checkpoint()
    replay = Session.resume(json.loads(json.dumps(saved)))
    if sim.advance(100, sample_every=10) != replay.advance(100, sample_every=10):
        raise RuntimeError("checkpoint diverged")
    digest = sha256(
        json.dumps(saved["native"], sort_keys=True, allow_nan=False).encode()
    ).hexdigest()
    return dict(
        cars=len(field),
        laps=laps,
        contact_events=contacts,
        samples=samples,
        moving=sum(s["v"] > 1 for s in saved["native"]["states"].values()),
        min_distance_m=min(s["distance"] for s in saved["native"]["states"].values()),
        digest=digest,
    )


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--series", choices=LAYOUTS, default="wec")
    cli.add_argument("--seconds", type=int, default=900)
    cli.add_argument("--sessions", type=int, default=1)
    cli.add_argument("--sample-every", type=int, default=10)
    cli.add_argument(
        "--cars", type=int, help="Limit the starting field (e.g. one kart heat)"
    )
    args = cli.parse_args()
    if (
        args.seconds <= 0
        or not 1 <= args.sessions <= 16
        or not 0 <= args.sample_every <= 1000000
    ):
        cli.error("Invalid run bounds")
    start = perf_counter()
    with ThreadPoolExecutor(max_workers=args.sessions) as pool:
        futures = [
            pool.submit(run, args.series, args.seconds, args.sample_every, args.cars)
            for _ in range(args.sessions)
        ]
        results = [job.result() for job in futures]
    elapsed = perf_counter() - start
    if any(r != results[0] for r in results):
        raise RuntimeError("concurrent runs diverged")
    print(
        json.dumps(
            dict(
                series=args.series,
                seconds=args.seconds,
                sessions=args.sessions,
                wall_s=elapsed,
                car_ticks_s=args.seconds
                * 50
                * args.sessions
                * results[0]["cars"]
                / elapsed,
                per_session=results[0],
            ),
            indent=2,
        )
    )
