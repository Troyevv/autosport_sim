from copy import deepcopy
import hashlib
import sqlite3
import pytest
from pydantic import ValidationError
from . import media_profile, personnel, service, staff_desk, storage
from .catalog import WORLD
from .test_career import MCLAREN, create
from .test_personnel import GT, SEAT, terms, run, snapshot


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_country_selection_is_portable_and_has_no_skill_effect():
    def make(country):
        return service.create(
            service.CareerInput(
                name="Alex",
                country=country,
                role="manager",
                org=MCLAREN,
                series="f1",
                seed=200,
            )
        )

    a, b = make("AR"), make("JP")
    sa, sb = snapshot(a), snapshot(b)
    assert (
        sa["people"]["player"]["country"] == "AR"
        and sb["people"]["player"]["country"] == "JP"
    )
    assert personnel.evaluate(
        sa["people"]["player"], WORLD, a["date"]
    ) == personnel.evaluate(sb["people"]["player"], WORLD, a["date"])
    assert all(
        WORLD["countries"][p["country"]] == p["nationality"]
        for p in sa["people"].values()
    )
    with pytest.raises(ValidationError):
        make("ZZ")
    before = sa["people"][GT]
    a = run(run(a, "staff-release", seat=SEAT), "offer-send", **terms())
    while a["date"] < "2025-02-05":
        a = run(a, "advance")
    saved = service.export_save(a["id"])
    loaded = service.import_save(saved)
    assert saved == service.export_save(loaded["id"])
    assert snapshot(loaded)["people"][GT]["country"] == before["country"]
    assert saved["payload"]["state"]["people"]["player"]["country"] == "AR"
    # Appointments and their roles reference the same durable identity.
    sa["setup"]["role"] = "owner"
    media_profile.initialize(sa)
    assert sa["people"]["player"]["country"] == "AR"


def test_home_event_changes_attention_and_personal_response_only():
    s = snapshot(create())
    pid = next(
        p["id"]
        for p in s["people"].values()
        if p["position"] == "driver"
        and any(e["home"] for e in media_profile.calendar_context(s, WORLD, p))
    )
    p = s["people"][pid]
    race = next(
        e for e in staff_desk.dossier(s, WORLD, pid)["calendar_context"] if e["home"]
    )
    event = next(e for e in WORLD["events"] if e["id"] == race["event"])
    assert (
        race["country"] == event["country"] == p["country"] and event["kind"] == "round"
    )
    original = deepcopy(p)
    audience = media_profile.context(p, race["country"])
    noisy = media_profile.context(p, race["country"], scrutiny=95, trust=20)
    assert (
        noisy["attention"] > audience["attention"]
        and noisy["openness"] < audience["openness"]
    )
    assert p == original
    calm = deepcopy(p)
    calm["skills"]["Работа под давлением"] = 100
    calm["media_traits"].update(temper=0, diplomacy=100)
    assert (
        media_profile.context(calm, race["country"], scrutiny=95)["pressure"]
        < noisy["pressure"]
    )
    assert "loyalty" not in p["media_traits"]
    assert any(
        x["popularity"] > 80 and x["reputation"] < 55 for x in s["people"].values()
    )
    assert any(
        v > p["regional_popularity"][p["country"]]
        for p in s["people"].values()
        for v in p["regional_popularity"].values()
    )
    assert all(e["country"] in WORLD["countries"] for e in WORLD["events"])


def test_pre_identity_v3_save_and_database_upgrade():
    c = run(create(), "advance")
    archive = service.export_save(c["id"])
    state = archive["payload"]["state"]
    del state["identity_schema"]
    for p in state["people"].values():
        for field in (
            "country",
            "authority",
            "popularity",
            "regional_popularity",
            "media_traits",
        ):
            del p[field]
    archive["sha256"] = hashlib.sha256(
        storage.dump(archive["payload"]).encode()
    ).hexdigest()
    imported = service.import_save(archive)
    migrated = snapshot(imported)
    assert (
        migrated["people"]["player"]["nationality"]
        == state["people"]["player"]["nationality"]
    )
    assert (
        migrated["seats"] == state["seats"]
        and migrated["relationships"] == state["relationships"]
    )
    connection = sqlite3.connect(storage.data_dir() / "world.sqlite3")
    with connection:
        connection.execute("PRAGMA user_version=6")
        old = dict(state)
        old.pop("ledger")
        connection.execute(
            "UPDATE career SET state=? WHERE id=?", (storage.dump(old), c["id"])
        )
    connection.close()
    assert snapshot(c) == migrated
