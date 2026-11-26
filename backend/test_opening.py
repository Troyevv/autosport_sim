"""Production startup and replay for both editions of the 2025 catalog."""

import pytest

from backend import service, storage
from backend.catalog import SEASON, WORLD
from tests.opening_world import CASES, audit


@pytest.mark.parametrize("role", CASES)
def test_opening_and_archive(tmp_path, monkeypatch, role):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    org, series, seed = CASES[role]
    setup = service.CareerInput(
        name="Проверка", org=org, role=role, series=series, seed=seed
    )
    c = service.create(setup)
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    coverage = audit(state)
    assert coverage["supplier_stock"] > 0 and coverage["works"] > 0
    assert state["opening"] == SEASON["opening"]
    assert not state["research"]["reports"] and not state["components"]["usage"]
    assert not state["starts"]
    assert len(state["scholarships"]) >= len(state["academies"])
    for champ in ("f2", "f3", "f4-es", "f4-it", "f4-gb", "freca"):
        from backend.components.catalog import parts_for

        parts = parts_for(state)
        entries = [
            e["id"] for e in SEASON["entries"].values() if e["championship"] == champ
        ]
        assert (
            len(
                {
                    tuple(parts.stock[i]["spec"] for i in parts.installed[e].values())
                    for e in entries
                }
            )
            == 1
        )
    doc = service.export_save(c["id"])
    copy = service.import_save(doc)
    assert service.export_save(copy["id"])["sha256"] == doc["sha256"]


def test_old_entrant_survives_replay(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    org = "team-iron-dames"
    old = service.create(
        service.CareerInput(name="Архив", org=org, role="owner", series="wec", seed=61),
        catalog=WORLD,
    )
    old = service.execute(
        old["id"], service.Command(revision=0, command_id="day", action="advance")
    )
    doc = service.export_save(old["id"])
    restored = service.import_save(doc)
    assert restored["org"] == org and restored["date"] == old["date"]
    assert service.export_save(restored["id"])["sha256"] == doc["sha256"]
    assert "opening" not in doc["payload"]["state"]
    assert org not in SEASON["organizations"]
