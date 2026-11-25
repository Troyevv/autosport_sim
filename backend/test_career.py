import copy
import hashlib
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from backend import domain, service, storage
from backend.app import app
from backend.catalog import WORLD
from backend.engineering import atr_period, project_target, resource_scope

MCLAREN = "team-mclaren-formula-1-team"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def create(org=MCLAREN, role="manager", series="f1"):
    return service.create(
        service.CareerInput(name="Алекс", role=role, org=org, series=series, seed=42)
    )


def order(c, action="advance", key=None):
    return service.Command(
        revision=c["revision"], action=action, command_id=key or str(c["revision"])
    )


def advance(c):
    return service.execute(
        c["id"], order(c, c["briefing_action"] if c["pending"] else "advance")
    )


def test_seed_integrity():
    from collections import Counter

    counts = Counter(e["championship"] for e in WORLD["entries"].values())
    assert counts == dict(f1=20, f2=22, f3=30, dtm=24, wec=36)
    assert len(WORLD["events"]) == len({e["id"] for e in WORLD["events"]})
    assert WORLD["entries"]["wec-7"]["car"] != WORLD["entries"]["wec-007"]["car"]
    assert "person-jules-gounon" in WORLD["entries"]["wec-36"]["crew"]
    assert "person-jules-gounon" in WORLD["entries"]["dtm-48"]["crew"]
    for a in WORLD["assignments"].values():
        assert a["entry"] is None or a["entry"] in WORLD["entries"]
        assert a["person"] is None or a["person"] in WORLD["names"]
    for e in WORLD["entries"].values():
        r = WORLD["championships"][e["championship"]]
        assert r["crew"][0] <= len(e["crew"]) <= r["crew"][1]
        assert e["category"] in r["classes"]
        assert e["org"] in WORLD["organizations"]
        assert (
            WORLD["cars"][e["car"]]["generation"] in WORLD["engineering"]["generations"]
        )
    for job, seat in WORLD["assignments"].items():
        if seat["org"] == "supplier-hewland":
            assert seat["position"] != "engines"


def test_role_and_required_decision():
    with pytest.raises(domain.RuleError):
        create(MCLAREN, "manufacturer")
    c = advance(create())
    assert c["date"] == "2025-02-13" and c["pending"] == ["mcl39-reveal"]
    for action, status in [("confirm-program", 403), ("advance", 409)]:
        with pytest.raises(domain.RuleError) as err:
            service.execute(c["id"], order(c, action))
        assert err.value.status == status
    assert service.load(c["id"]) == c
    assert advance(c)["pending"] == []


def test_atomic_month_end_replay_and_import():
    a, b = create(), create()
    while a["date"] < "2025-03-01":
        prev = a
        a, b = advance(a), advance(b)
    assert a["account"]["cash_cents"] == sum(p["delta_cents"] for p in a["ledger"])
    assert (
        a["account"]["cash_cents"]
        == prev["account"]["cash_cents"] - a["account"]["payroll_cents"]
    )
    assert (
        a["account"]["forecast_cents"]
        == a["account"]["cash_cents"] - a["account"]["payroll_cents"]
    )
    assert len(a["ledger"]) == 2
    assert service.execute(a["id"], order(prev)) == a
    with pytest.raises(domain.RuleError):
        service.execute(a["id"], order(prev, "confirm-team"))
    archive = service.export_save(a["id"])
    assert archive == service.export_save(b["id"])
    imported = service.import_save(archive)
    assert imported["id"] != a["id"] and service.export_save(imported["id"]) == archive
    for c in [a, imported]:
        advance(c)
    assert service.export_save(a["id"]) == service.export_save(imported["id"])


def test_partial_failure_rolls_back_all_tables():
    c = create("team-abt-sportsline", "owner", "dtm")
    while c["next_date"] < "2025-03-01":
        c = advance(c)
    original = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("""CREATE TRIGGER reject_command BEFORE INSERT ON receipt
                    BEGIN SELECT RAISE(ABORT, 'test disk failure'); END""")
    with pytest.raises(sqlite3.IntegrityError):
        advance(c)
    assert service.export_save(c["id"]) == original


def test_concurrent_commands():
    c = create()
    barrier = Barrier(2)

    def submit(key):
        barrier.wait()
        try:
            service.execute(c["id"], order(c, key=key))
            return 200
        except domain.RuleError as err:
            return err.status

    with ThreadPoolExecutor(2) as workers:
        assert sorted(workers.map(submit, ["first", "second"])) == [200, 409]
    assert service.load(c["id"])["revision"] == 1


def test_invalid_import_cannot_change_save():
    c = create()
    original = service.export_save(c["id"])
    changed = copy.deepcopy(original)
    changed["payload"]["state"]["rng"] += 1
    changed["sha256"] = hashlib.sha256(
        storage.dump(changed["payload"]).encode()
    ).hexdigest()
    with TestClient(app) as client:
        for content in (
            b"{invalid",
            storage.dump({**original, "version": 2}).encode(),
            storage.dump(changed).encode(),
        ):
            assert (
                client.post("/api/careers/import", content=content).status_code == 422
            )
    assert service.list_careers() == [
        service.summary(c["id"], original["payload"]["state"])
    ]
    assert service.export_save(c["id"]) == original


def test_additive_schema_upgrade_preserves_checkpoint(tmp_path):
    c = create()
    with sqlite3.connect(tmp_path / "world.sqlite3") as db:
        db.execute("DROP TABLE media")
        db.execute("PRAGMA user_version=1")
    assert service.load(c["id"]) == c
    with sqlite3.connect(tmp_path / "world.sqlite3") as db:
        assert db.execute("SELECT count(*) FROM media").fetchone() == (0,)
        db.execute("PRAGMA user_version=30")
    with pytest.raises(domain.RuleError):
        service.load(c["id"])


def test_technical_seasons_and_shared_atr():
    c = create()
    assert {t["target_season"] for t in c["targets"]} == {"f1-2025", "f1-2026"}
    assert {t["budget_owner"] for t in c["targets"]} == {MCLAREN}
    assert len({t["generation"] for t in c["targets"]}) == 2
    rule = WORLD["engineering"]["atr"]
    for n, start in enumerate(rule["period_starts"], 1):
        assert atr_period(rule, start)["number"] == n
    assert not atr_period(rule, "2026-01-01")
    assert resource_scope(WORLD, MCLAREN, "2025-03-02")["limits"]["runs"] == 224
    assert resource_scope(WORLD, MCLAREN, "2025-03-03")["period"]["number"] == 2
    assert resource_scope(WORLD, MCLAREN, "2025-06-23")["percent"] is None
    assert resource_scope(WORLD, MCLAREN, "2025-06-23", 2)["percent"] == 75
    assert not resource_scope(WORLD, "team-abt-sportsline", "2025-03-03")
    with pytest.raises(domain.RuleError):
        project_target(WORLD, MCLAREN + ":f1", "dtm-2025", "f1-2026-f1-v1")
    exported = service.export_save(c["id"])
    car = exported["payload"]["state"]["car_configurations"]["car-f1-4"]
    assert (
        car["season"] == "f1-2025"
        and car["regulation"] == c["targets"][0]["regulation"]
    )
    assert (
        WORLD["engineering"]["cost_cap"]["currency"] == "USD"
        and c["account"]["currency"] == "EUR"
    )


def test_generated_faces_keep_identity_and_never_replace_real_people():
    real = dict(id="real", origin="real", face=None)
    person = dict(id="new", origin="generated", face=None)
    people = {"other": {"face": "generated-a"}}
    domain.assign_face(real, people, ["generated-b"])
    assert real["face"] is None
    domain.assign_face(person, people, ["generated-a", "generated-b"])
    assert person["face"] == "generated-b"
    people["new"] = person
    domain.assign_face(person, people, ["generated-c"])
    assert person["face"] == "generated-b"
    exhausted = dict(origin="generated", face=None)
    domain.assign_face(exhausted, people, ["generated-a", "generated-b"])
    assert exhausted["face"] is None
