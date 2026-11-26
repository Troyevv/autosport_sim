"""Run from repository root: python -m tests.statistics_load. Uses a disposable SQLite database."""

import json
import math
import os
import resource
import sqlite3
import statistics
import tempfile
from pathlib import Path
from time import perf_counter

from backend import storage
from backend.statistics import facts, telemetry
from backend.statistics.models import (
    Batch,
    ChannelBlock,
    Fact,
    Lap,
    RecordingPolicy,
    Result,
    Session,
)

SEASONS, SERIES, ROUNDS, CARS, LAPS = 20, 8, 12, 24, 4
DAY = "2044-01-01"


def context(year, series, stage, car):
    return Session(
        org=f"org-{series}-{car // 2}",
        org_name=f"Team {series}/{car // 2}",
        program=f"program-{series}-{car // 2}",
        person=f"person-{year}-{series}-{car}",
        series=f"series-{series}",
        season=f"{year}-{series}",
        regulation=f"rules-{year}-{series}",
        round=f"{year}-{series}-{stage}",
        session=f"race-{year}-{series}-{stage}",
        session_kind="race",
        track=f"track-{stage}",
        layout=f"layout-{stage}",
        layout_version="1",
        entry=f"entry-{series}-{car}",
        car=f"car-{year}-{series}-{car}",
    )


def run(directory):
    os.environ["AUTOSPORT_DATA_DIR"] = directory
    cid = "load-test"
    with storage.transaction(True) as db:
        # Only relational storage is profiled. No simulated checkpoint is constructed.
        db.execute("INSERT INTO career VALUES(?,?)", (cid, "{}"))
        db.execute(
            "INSERT INTO stat_reader VALUES(?,?,?,?,?)",
            (cid, "org-0-0", "manager", DAY, "[]"),
        )
        telemetry.configure(
            db, cid, RecordingPolicy(period_us=20_000, archive_days=None)
        )

    start = perf_counter()
    for year in range(2025, 2025 + SEASONS):
        for series in range(SERIES):
            for stage in range(ROUNDS):
                batch = []
                for car in range(CARS):
                    ctx = context(year, series, stage, car)
                    data = [
                        Result(
                            kind="entry-result",
                            context=ctx,
                            status="classified",
                            place=car + 1,
                            crew=[ctx.person],
                        )
                    ]
                    for lap in range(1, LAPS + 1):
                        sector = 24_000_000 + 37 * lap + car
                        data.append(
                            Lap(
                                kind="lap",
                                context=ctx,
                                lap=lap,
                                elapsed_us=3 * sector,
                                sectors_us=[sector] * 3,
                                eligible_for_record=True,
                            )
                        )
                    batch.extend(
                        Fact(
                            version=1,
                            day=f"{year}-{stage + 1:02}-01",
                            access="public",
                            data=d,
                        )
                        for d in data
                    )
                with storage.transaction(True) as db:
                    facts.record(db, cid, Batch(facts=batch))
    fact_time = perf_counter() - start
    path = Path(directory, "world.sqlite3")
    history_bytes = path.stat().st_size
    # Ten minutes at 50 Hz on 192 cars. Independent channel blocks of one minute.
    start = perf_counter()
    samples = 0
    for series in range(SERIES):
        for car in range(CARS):
            ctx = context(2044, series, 0, car)
            with storage.transaction(True) as db:
                for minute in range(10):
                    blocks = []
                    for i, (channel, unit) in enumerate(
                        [("speed", "m/s"), ("rpm", "1/min"), ("throttle", "%")]
                    ):
                        values = [
                            round(
                                50
                                + 30 * math.sin((n + minute * 3000 + car) / (85 + i)),
                                3,
                            )
                            for n in range(3000)
                        ]
                        blocks.append(
                            ChannelBlock(
                                version=1,
                                day=DAY,
                                context=ctx,
                                channel=channel,
                                unit=unit,
                                first_us=minute * 60_000_000,
                                period_us=20_000,
                                values=values,
                            )
                        )
                        samples += len(values)
                    telemetry.record(db, cid, telemetry.Blocks(blocks=blocks))
    telemetry_time = perf_counter() - start
    ctx = context(2044, 0, 0, 0)

    def measure(call):
        times = []
        for _ in range(150):
            t = perf_counter()
            assert call()
            times.append((perf_counter() - t) * 1000)
        return [round(statistics.median(times), 3), round(sorted(times)[142], 3)]

    with storage.transaction(True) as db:
        summary = measure(
            lambda: facts.lap_summary(db, cid, ctx.session, ctx.entry)["laps"] == LAPS
        )
        page = measure(
            lambda: len(facts.page(db, cid, filters={"season": ctx.season})["items"])
            == 50
        )
        channel = measure(
            lambda: len(
                telemetry.read(
                    db,
                    cid,
                    session=ctx.session,
                    car=ctx.car,
                    channel="speed",
                    start_us=75_000_000,
                    end_us=77_000_000,
                )["blocks"][0]["values"]
            )
            == 100
        )
        blob_bytes = db.execute(
            "SELECT sum(length(samples)) FROM stat_channel"
        ).fetchone()[0]
        t = perf_counter()
        facts.rebuild_laps(db, cid)
        rebuild = perf_counter() - t
        assert facts.lap_summary(db, cid, ctx.session, ctx.entry)["laps"] == LAPS
    return dict(
        sqlite=sqlite3.sqlite_version,
        facts=SEASONS * SERIES * ROUNDS * CARS * (LAPS + 1),
        history_seconds=fact_time,
        history_bytes=history_bytes,
        samples=samples,
        compressed_sample_bytes=blob_bytes,
        telemetry_seconds=telemetry_time,
        total_bytes=path.stat().st_size,
        rss_peak_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        p50_p95_ms=dict(summary=summary, page=page, channel=channel),
        rebuild_seconds=rebuild,
    )


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as directory:
        print(json.dumps(run(directory), indent=2))
