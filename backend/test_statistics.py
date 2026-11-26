import hashlib
import json
import sqlite3
from datetime import date
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from . import domain, service, storage
from .app import app
from .catalog import WORLD
from .statistics import archive, facts, telemetry
from .statistics.models import (
    Batch,
    ChannelBlock,
    Component,
    Fact,
    RecordingPolicy,
    Session,
)
from .test_career import create, MCLAREN
from .test_personnel import GT, SEAT, run, snapshot, terms
from .test_professional import fact as activity


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


DAY = "2025-02-01"
POLICY = RecordingPolicy(period_us=20_000, archive_days=None)


def session(**changes):
    return Session(
        **(
            dict(
                org=MCLAREN,
                org_name="McLaren",
                program="program",
                person="p",
                series="f1",
                season="f1-2025",
                round="round",
                session="race",
                session_kind="race",
                regulation="rules-v1",
                track="track",
                layout="layout",
                layout_version="v1",
                entry="f1-4",
                car="car-f1-4",
            )
            | changes
        )
    )


def observation(ctx, kind, access, **data):
    return Fact(
        version=1,
        day=DAY,
        access=access,
        data=dict(kind=kind, context=ctx.model_dump(), **data),
    )


def lap(n, elapsed, eligible=True, ctx=None, access="public"):
    return observation(
        ctx or session(),
        "lap",
        access,
        lap=n,
        sectors_us=[],
        elapsed_us=elapsed,
        eligible_for_record=eligible,
    )


def block(ctx=None, name="speed", offset=0, **changes):
    return ChannelBlock(
        **(
            dict(
                version=1,
                day=DAY,
                context=ctx or session(),
                channel=name,
                unit="m/s",
                first_us=offset,
                period_us=20_000,
                values=[1.0, 2.0, 3.0, 4.0],
            )
            | changes
        )
    )


def write(db, cid, *items):
    facts.record(db, cid, Batch(facts=list(items)))


def channels(db, cid, *blocks):
    telemetry.record(db, cid, telemetry.Blocks(blocks=list(blocks)))


def read(db, cid, name="speed", **changes):
    return telemetry.read(
        db,
        cid,
        **(
            dict(
                session="race", car="car-f1-4", channel=name, start_us=0, end_us=500_000
            )
            | changes
        ),
    )


def test_finalization_conflicts_and_rebuild():
    cid = create()["id"]
    ctx = session()
    result = observation(
        ctx, "entry-result", "public", place=None, status="retired", crew=["p"]
    )
    with storage.transaction(True) as db:
        for _ in range(2):
            write(db, cid, result, lap(1, 90), lap(2, 80, False), lap(3, 85))
        with pytest.raises(domain.RuleError):
            write(db, cid, lap(4, 70), lap(1, 100))
        with pytest.raises(domain.RuleError):
            write(db, cid, lap(5, 75, ctx=session(layout_version="v2")))
        expected = dict(laps=3, fastest_us=85)
        assert facts.lap_summary(db, cid, "race", "f1-4") == expected
        db.execute("UPDATE stat_laps SET laps=100, fastest_us=1")
        facts.rebuild_laps(db, cid)
        assert facts.lap_summary(db, cid, "race", "f1-4") == expected
        first = facts.page(db, cid, filters={"session": "race"}, limit=2)
        second = facts.page(
            db, cid, filters={"session": "race"}, limit=2, after=first["after"]
        )
        assert (
            len(set(r["key"] for r in first["items"] + second["items"])) == 4
            and second["after"] is None
        )
        write(
            db,
            cid,
            lap(
                1,
                70,
                ctx=session(
                    session="next-season", org_name="Renamed", owner="new-owner"
                ),
            ),
        )
        assert first["items"][0]["body"]["data"]["context"]["org_name"] == "McLaren"
    for bad in (dict(version=True), dict(version=2), dict(origin="historical")):
        with pytest.raises(ValidationError):
            Fact.model_validate(result.model_dump() | bad)


def test_sqlite_v9_and_replay_preserve_personnel(tmp_path, monkeypatch):
    c = create()
    pid = snapshot(c)["seats"][SEAT][0]["person"]
    race = activity(
        snapshot(c),
        SEAT,
        "race-publication",
        "race",
        ["Шины"],
        context=dict(entry="f1-4", series="f1", place=1, achievement="win"),
    )
    for i in range(2):
        c = service.confirm_work(c["id"], f"result-{i}", c["revision"], [race])
    c = run(c, "scout-driver", person=GT)
    c = run(c, "staff-release", seat=SEAT)
    c = run(c, "offer-send", **terms())
    while c["date"] < "2025-02-05":
        c = run(c, "advance")
    document = service.export_save(c["id"])
    old = tmp_path / "old"
    old.mkdir()
    db = sqlite3.connect(old / "world.sqlite3")
    with db:
        for migration in storage.MIGRATIONS[:9]:
            for sql in migration:
                db.execute(sql)
        db.execute("PRAGMA user_version=9")
        storage.store(db, c["id"], document["payload"]["state"], create=True)
        for item in document["payload"]["commands"]:
            cmd = service.Command.model_validate(item)
            db.execute(
                "INSERT INTO receipt VALUES(?,?,?,?,?)",
                (
                    c["id"],
                    cmd.command_id,
                    cmd.revision,
                    cmd.action,
                    storage.dump(cmd.payload()) if cmd.payload() is not None else None,
                ),
            )
    db.close()
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(old))
    assert service.export_save(c["id"]) == document
    clone = service.import_save(document)
    for cid in (c["id"], clone["id"]):
        with storage.transaction() as db:

            def rows(kind, person):
                return [
                    r["body"]
                    for r in facts.page(
                        db, cid, filters={"kind": kind, "person": person}
                    )["items"]
                ]

            (win,) = rows("driver-result", pid)
            assert win["data"]["place"] == 1 and win["context"]["org"] == MCLAREN
            assert len(rows("work", pid)) == len(rows("achievement", pid)) == 1
            (estimate,) = rows("scout-estimate", GT)
            assert estimate["data"]["low"] < estimate["data"]["high"]
            assert {r["context"]["org"] for r in rows("appointment", GT)} >= {
                MCLAREN,
                WORLD["entries"]["dtm-1"]["org"],
            }
            assert rows("appointment", pid)[0]["data"]["end"] > DAY
            assert (
                rows("appointment-end-change", pid)[0]["data"]["effective_end"] == DAY
            )
            assert all(r["org"] == MCLAREN for r in facts.ledger(db, cid))
            assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_raw_ranges_retention_and_portable_archive():
    cid = create()["id"]
    with storage.transaction(True) as db:
        telemetry.configure(db, cid, POLICY)
        race = observation(
            session(), "entry-result", "public", status="finished", place=1, crew=["p"]
        )
        write(db, cid, lap(1, 82), race)
        channels(db, cid, block(), block(offset=80_000), block(name="rpm", unit="rpm"))
        channels(db, cid, block())
        with pytest.raises(domain.RuleError):
            channels(db, cid, block(offset=160_000), block(offset=60_000))
        with pytest.raises(domain.RuleError):
            channels(db, cid, block(period_us=30_000))
        result = read(db, cid, start_us=19_999, end_us=100_001, limit=1)
        assert (
            result["blocks"][0]["values"] == [2.0, 3.0, 4.0]
            and result["next_us"] == 80_000
        )
        assert read(db, cid, start_us=80_000, end_us=100_001)["blocks"][0][
            "values"
        ] == [1.0, 2.0]
        assert read(db, cid, name="rpm")["blocks"][0]["unit"] == "rpm"
        assert read(db, cid, start_us=160_000)["blocks"] == []
    client = TestClient(app)
    backup = client.get(f"/api/careers/{cid}/export")
    assert backup.content.startswith(archive.MAGIC)
    cloned = client.post("/api/careers/import", content=backup.content)
    assert cloned.status_code == 201
    clone = cloned.json()["id"]
    assert service.export_save(cid) == service.export_save(clone)
    lines = backup.content.splitlines(keepends=True)
    lines[-1] = b'["end","invalid"]\n'
    assert (
        client.post("/api/careers/import", content=b"".join(lines)).status_code == 422
    )
    assert len(service.list_careers()) == 2
    with storage.transaction(True) as db:
        assert (
            telemetry.prune(
                db,
                cid,
                date(2025, 2, 2),
                RecordingPolicy(period_us=20_000, archive_days=0),
            )
            == 3
        )
        channels(db, cid, block())
        assert read(db, cid)["blocks"] == []
        facts.rebuild_laps(db, cid)
        assert facts.lap_summary(db, cid, "race", "f1-4") == dict(laps=1, fastest_us=82)
        assert (
            facts.page(db, cid, filters={"kind": "entry-result"})["items"][0]["body"][
                "data"
            ]["place"]
            == 1
        )
        assert len(read(db, clone)["blocks"]) == 2
    after = archive.read_file(BytesIO(client.get(f"/api/careers/{cid}/export").content))
    with storage.transaction(True) as db:
        channels(db, after["id"], block())
        assert read(db, after["id"])["blocks"] == []
    # Recomputed outer checksum cannot bless invalid channel bytes.
    doc = service.export_save(clone)
    next(r for r in doc["payload"]["statistics_v1"] if r[0] == "channel")[4] = "AAAA"
    doc["sha256"] = hashlib.sha256(storage.dump(doc["payload"]).encode()).hexdigest()
    with pytest.raises(domain.RuleError):
        service.import_save(doc)


def test_backend_visibility_and_contract_channels():
    supplier = "supplier-goodyear"
    c = create(supplier, "manufacturer", "wec")
    entry = next(
        e
        for e in WORLD["entries"].values()
        if WORLD["cars"][e["car"]]["suppliers"].get("tyre") == supplier
    )
    c = run(
        c,
        "advisor-assign",
        seat=supplier + ":technical-advisor",
        product="tyre",
        entry=entry["id"],
        start=DAY,
        end="2025-02-12",
    )
    ctx = session(
        org=entry["org"],
        org_name="Client",
        contract=f"2025:{entry['id']}:tyre",
        entry=entry["id"],
        car=entry["car"],
        component=Component(
            component="front-left",
            manufacturer=supplier,
            product="tyre",
            specification="tyre-spec",
            version="v1",
            instance="set-1",
        ),
    )
    cid = c["id"]
    with storage.transaction(True) as db:
        telemetry.configure(db, cid, POLICY)
        channels(
            db, cid, block(ctx, "temperature", unit="K"), block(ctx, "hidden-grip")
        )
        channels(db, cid, block(ctx.model_copy(update={"contract": "other"}), "wear"))
        write(db, cid, lap(1, 99, ctx=ctx), lap(2, 88, ctx=ctx, access="technical"))
        for kind, access in [
            ("technical-event", "technical"),
            ("strategy", "internal"),
        ]:
            write(
                db,
                cid,
                observation(ctx, kind, access, source_id=kind, at_us=0, code="private"),
            )
        assert facts.lap_summary(db, cid, "race", ctx.entry) == dict(
            laps=1, fastest_us=99
        )
        assert all(r["org"] == supplier for r in facts.ledger(db, cid))
    client = TestClient(app)
    path = f"/api/careers/{cid}/statistics"
    params = dict(
        session="race",
        car=ctx.car,
        instance="set-1",
        start_us=0,
        end_us=70_000,
        org=ctx.org,
    )
    for channel in ("hidden-grip", "wear", "temperature"):
        r = client.get(path + "/telemetry", params=params | dict(channel=channel))
        assert r.status_code == 200 and bool(r.json()["blocks"]) == (
            channel == "temperature"
        )
    assert [
        r["kind"]
        for r in client.get(path, params={"org": ctx.org, "session": "race"}).json()[
            "items"
        ]
    ] == ["lap"]
    assert client.post(path, json={"role": "manager"}).status_code == 405
    assert (
        client.get(path, params={"after": json.dumps(["bad", 2**65])}).status_code
        == 422
    )


def test_estimate_finance_access_and_shared_command_rollback():
    from .statistics.models import Context

    c = create()
    cid = c["id"]
    before = service.export_save(cid)
    orgs = (MCLAREN, "team-scuderia-ferrari")
    with storage.transaction(True) as db:
        for org in orgs:
            ctx = Context(org=org, org_name=org, person=GT)
            write(
                db,
                cid,
                observation(
                    ctx,
                    "estimate",
                    "estimate",
                    source_id=org,
                    quantity="potential",
                    unit="points/100",
                    low=55,
                    high=72,
                ),
                observation(
                    ctx,
                    "financial-event",
                    "internal",
                    source_id=org,
                    code="settled",
                    reference="posting-1",
                ),
            )
        with pytest.raises(ValidationError):
            observation(
                ctx,
                "financial-event",
                "public",
                source_id="leak",
                code="settled",
                reference="posting-1",
            )
    client = TestClient(app)
    for kind in ("estimate", "financial-event"):
        records = client.get(
            f"/api/careers/{cid}/statistics", params={"kind": kind}
        ).json()["items"]
        assert (
            len(records) == 1
            and records[0]["body"]["data"]["context"]["org"] == MCLAREN
        )
        assert not client.get(
            f"/api/careers/{cid}/statistics", params={"kind": kind, "org": orgs[1]}
        ).json()["items"]
    with pytest.raises(sqlite3.IntegrityError):
        with storage.transaction(True) as db:
            state = storage.checkpoint(db, cid)
            domain.apply(state, WORLD, "advance", None)
            storage.store(db, cid, state)
            write(db, cid, lap(1, 88))
            telemetry.configure(db, cid, POLICY)
            channels(db, cid, block())
            db.execute("INSERT INTO receipt VALUES(?,NULL,0,'advance',NULL)", (cid,))
    with storage.transaction() as db:
        assert facts.lap_summary(db, cid, "race", "f1-4")["laps"] == 0
        assert read(db, cid)["blocks"] == []
    assert service.export_save(cid)["payload"]["state"] == before["payload"]["state"]


def test_advancing_game_day_applies_persisted_policy():
    c = create()
    with storage.transaction(True) as db:
        telemetry.configure(
            db, c["id"], RecordingPolicy(period_us=20_000, archive_days=0)
        )
        channels(db, c["id"], block())
        assert len(read(db, c["id"])["blocks"]) == 1
    c = run(c, "advance")
    with storage.transaction(True) as db:
        channels(db, c["id"], block())
        assert read(db, c["id"])["blocks"] == []


def test_large_file_backup_round_trip_and_selective_last_block():
    from random import Random

    cid = create()["id"]
    values = [Random(35 + i).random() for i in range(4096)]
    count = 440
    stride = len(values) * POLICY.period_us
    with storage.transaction(True) as db:
        telemetry.configure(db, cid, POLICY)
        for i in range(0, count, 8):
            channels(
                db,
                cid,
                *(block(offset=n * stride, values=values) for n in range(i, i + 8)),
            )
    source, extended = archive.write_file(cid)
    with source:
        assert extended and source.seek(0, 2) > 16 * 1024**2
        source.seek(0)
        response = TestClient(app).post(
            "/api/careers/import", content=iter(lambda: source.read(65536), b"")
        )
    assert response.status_code == 201
    with storage.transaction() as db:
        start = (count - 1) * stride
        loaded = read(db, response.json()["id"], start_us=start, end_us=start + 40_000)
        assert loaded["blocks"][0]["values"] == values[:2]


def test_concurrent_publications_use_a_single_result_and_raw_block():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    cid = create()["id"]
    barrier = Barrier(2)
    with storage.transaction(True) as db:
        telemetry.configure(db, cid, POLICY)

    def publish():
        barrier.wait()
        with storage.transaction(True) as db:
            write(db, cid, lap(1, 82))
            channels(db, cid, block())

    with ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(publish) for _ in range(2)]
        for job in jobs:
            job.result()
    with storage.transaction() as db:
        assert facts.lap_summary(db, cid, "race", "f1-4") == dict(laps=1, fastest_us=82)
        assert len(read(db, cid)["blocks"]) == 1


def test_ended_mandate_retains_history_and_closes_private_reads():
    from .statistics import personnel

    c = create()
    cid = c["id"]
    with storage.transaction(True) as db:
        state = storage.checkpoint(db, cid)
        write(db, cid, lap(1, 91), lap(2, 88, access="technical"))
        telemetry.configure(db, cid, POLICY)
        channels(db, cid, block())
        state["seats"][MCLAREN + ":manager"][0]["end"] = DAY
        personnel.refresh(db, cid, state)
        assert facts.lap_summary(db, cid, "race", "f1-4") == dict(laps=1, fastest_us=91)
        assert not read(db, cid)["blocks"]
        assert not facts.ledger(db, cid)
        assert facts.page(db, cid, filters={"kind": "appointment", "org": MCLAREN})[
            "items"
        ]
