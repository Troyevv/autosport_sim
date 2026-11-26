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
    assert counts == {
        "f1": 20,
        "f2": 22,
        "f3": 30,
        "dtm": 24,
        "wec": 36,
        "f4-it": 41,
        "f4-gb": 21,
        "f4-es": 36,
        "freca": 30,
        "kart-ok": 98,
        "kart-okj": 89,
    }
    assert len(WORLD["events"]) == len({e["id"] for e in WORLD["events"]})
    assert WORLD["entries"]["wec-7"]["car"] != WORLD["entries"]["wec-007"]["car"]
    assert set(WORLD["entries"]["wec-36"]["crew"]) & set(
        WORLD["entries"]["dtm-48"]["crew"]
    )
    for a in WORLD["assignments"].values():
        assert a["entry"] is None or a["entry"] in WORLD["entries"]
        assert a["person"] in WORLD["profiles"]
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
        db.execute("ALTER TABLE receipt DROP COLUMN paint")
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


def test_fictional_roster_biographies_and_series_balance():
    from collections import defaultdict
    from datetime import date
    from statistics import mean

    profiles = WORLD["profiles"]
    assert len({p["name"] for p in profiles.values()}) == len(profiles)
    assert len({p["nationality"] for p in profiles.values()}) >= 20
    series_scores = defaultdict(list)
    for seat in WORLD["assignments"].values():
        person = profiles[seat["person"]]
        birth = date.fromisoformat(person["birth_date"])
        age = 2025 - birth.year - ((2, 1) < (birth.month, birth.day))
        admission = WORLD["championships"].get(seat["series"], {}).get("admission", {})
        minimum = (
            admission.get("min_age", 18) if person["id"].startswith("junior-") else 18
        )
        sporting_age = (
            2025 - birth.year if admission.get("age_basis") == "calendar_year" else age
        )
        assert minimum <= sporting_age <= 70 and 0 < person["experience"] < age
        skills = person["skills"]
        assert set(skills) == set(WORLD["positions"][seat["position"]]["skills"])
        assert person["specialization"] in skills
        assert max(skills.values()) <= person["potential"] <= 100
        if seat["position"] == "driver":
            series_scores[seat["series"]].append(mean(skills.values()))
    assert (
        mean(series_scores["f1"])
        > mean(series_scores["f2"])
        > mean(series_scores["f3"])
    )


def test_version_one_import_and_sqlite_upgrade():
    import json
    from backend.roster_upgrade import original_world

    setup = dict(
        name="Тест сохранения",
        role="manager",
        org=MCLAREN,
        series="f1",
        seed=42,
        face_pool=[
            next(f for f in WORLD["reserve"] if f.startswith("generated-paddock-"))
        ],
    )
    old = original_world()
    state = domain.new_world(old, setup)
    domain.apply(state, old, "advance")
    state["ledger"].sort(key=lambda p: (p["date"], p["org"], p["key"]))
    commands = [dict(action="advance", revision=0, command_id="first")]
    payload = dict(state=state, commands=commands)
    exported = dict(
        format="autosport-career",
        version=1,
        rules="2025-v1",
        payload=payload,
        sha256=hashlib.sha256(storage.dump(payload).encode()).hexdigest(),
    )
    imported = service.import_save(exported)
    upgraded = service.export_save(imported["id"])
    new = upgraded["payload"]["state"]
    for key in (
        "rng",
        "revision",
        "date",
        "checkpoint",
        "pending",
    ):
        assert new[key] == state[key]
    assert [p for p in new["ledger"] if p["org"] in state["accounts"]] == state[
        "ledger"
    ]
    assert state["collectives"].keys() <= new["collectives"].keys()
    for gid, original in state["collectives"].items():
        assert {k: new["collectives"][gid][k] for k in original} == original
        assert new["collectives"][gid]["team_days"] == 0
    for org, account in state["accounts"].items():
        revised = new["accounts"][org]
        for key in account.keys() - {"payroll_cents", "forecast_cents"}:
            assert revised[key] == account[key]
        assert revised["payroll_cents"] > account["payroll_cents"]
        assert (
            revised["forecast_cents"]
            == revised["cash_cents"] - revised["payroll_cents"]
        )
    assert new["people"]["player"]["face"] == state["people"]["player"]["face"]
    assert service.export_save(service.import_save(upgraded)["id"]) == upgraded
    with storage.transaction(True) as db:
        storage.store(db, "historical", state, create=True)
        db.execute(
            "INSERT INTO receipt(career,command_id,revision,action) VALUES (?,?,?,?)",
            ("historical", "first", 0, "advance"),
        )
        db.execute("ALTER TABLE receipt DROP COLUMN paint")
        db.execute("PRAGMA user_version=3")
    assert service.export_save("historical") == upgraded
    with storage.transaction() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == len(
            storage.MIGRATIONS
        )
        assert (
            json.loads(
                db.execute("SELECT state FROM career WHERE id='historical'").fetchone()[
                    0
                ]
            )["rules"]
            == WORLD["version"]
        )
