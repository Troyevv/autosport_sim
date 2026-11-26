import pytest
from backend import service, storage, domain
from backend.app import facilities_overview
from backend.catalog import WORLD
from backend.finance import facilities as f
from backend.test_career import create, MCLAREN
from backend.test_finance import command


@pytest.fixture(autouse=True)
def database(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_construction_maintenance_upgrade_and_import():
    c = create(role="owner")
    cash = c["account"]["cash_cents"]
    req = command(c, "finance-build", kind="simulator", country="IT")
    c = service.execute(c["id"], req)
    a = next(a for a in facilities_overview(c["id"])["assets"] if a["owner"] == MCLAREN)
    assert (
        a["status"] == "construction"
        and a["capacity"] == 0
        and cash - c["account"]["cash_cents"] == a["book_cents"]
    )
    assert service.execute(c["id"], req) == c
    assert facilities_overview(
        service.import_save(service.export_save(c["id"]))["id"]
    ) == facilities_overview(c["id"])
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    s["date"] = a["ready"]
    s["ledger"] = []
    f.tick(s, WORLD)
    owned = s["estate"]["assets"][a["id"]]
    assert f.capacity(s, owned) == 1
    s["date"] = "2025-05-01"
    f.tick(s, WORLD)
    assert owned["condition"] == 99 and owned["book_cents"] < a["book_cents"]
    f.act(s, WORLD, MCLAREN, "upgrade", f.Upgrade(facility=a["id"]))
    assert f.capacity(s, owned) == 0
    s["date"] = owned["ready"]
    f.tick(s, WORLD)
    assert owned["level"] == 2 and owned["condition"] == 100


def test_lease_capacity_grant_and_access_permissions():
    c = create()
    with pytest.raises(domain.RuleError):
        service.execute(c["id"], command(c, "finance-build", kind="hq", country="GB"))
    req = dict(
        facility="shared:simulator", start=c["date"], units=8, days=3, mode="lease"
    )
    c = service.execute(c["id"], command(c, "finance-lease", **req))
    with pytest.raises(domain.RuleError):
        service.execute(c["id"], command(c, "finance-lease", **req))
    args = dict(
        reference="sim-1",
        org=MCLAREN,
        facility=req["facility"],
        start=c["date"],
        days=2,
        units=7,
        program=MCLAREN + ":f1",
        purpose="engineering",
        authorization="confirmed-session",
        regulation=WORLD["championships"]["f1"]["rules_id"],
    )
    c = service.execute(c["id"], command(c, "finance-facility-access", **args))
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    assert f.grant(s, "sim-1").staffed_capacity == 8
    with pytest.raises(domain.RuleError):
        service.execute(
            c["id"],
            command(c, "finance-facility-access", **dict(args, reference="sim-2")),
        )
    assert f.training(
        s, MCLAREN, "prepare", "simulator", c["date"], f.later(c["date"], 1)
    ) == (req["facility"], None)
