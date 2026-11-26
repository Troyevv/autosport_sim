"""Engineering acceptance on the shipped grid, the normal commands and portable careers."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hashlib

import pytest
from fastapi.testclient import TestClient

from . import components as fleet, domain, service, storage
from .app import app, component_desk
from .catalog import LINEUP_WORLD as WORLD
from .components.catalog import OPENING, POLICIES
from .components.design import assembly, development_margin
from .test_career import create


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def order(c, instance, entry="f1-4", **usage):
    action = "component-usage" if usage else "component-install"
    return service.Command(
        action=action,
        revision=c["revision"],
        command_id=f"command-{c['revision']}",
        engineering=dict(instance=instance, entry=entry, **usage),
    )


def state_of(c):
    with storage.transaction() as db:
        return storage.checkpoint(db, c["id"])


def test_opening_fit_for_every_entry_and_series():
    c = create()
    state = state_of(c)
    assert set(POLICIES) == set(WORLD["championships"])
    instances = []
    for eid, entry in WORLD["entries"].items():
        mounts = fleet.mounting(state, eid)
        instances.extend(mounts.values())
        for slot, iid in mounts.items():
            spec = fleet.spec(state, iid)
            assert spec["slot"] == slot and fleet.compatible(state, WORLD, entry, spec)
            assert spec["life_m"] > 0
        assert ("transmission" in mounts) == (not eid.startswith("kart-"))
        assert ("rear-wing" in mounts) == (not eid.startswith("kart-"))
        if entry["championship"] != "f1":
            tyre = fleet.spec(state, mounts["tyre"])
            assert not fleet.compatible(
                state, WORLD, entry, dict(tyre, id=tyre["family"] + "/2", version=2)
            )
    assert len(instances) == len(set(instances))
    assert len({fleet.serial(i) for i in OPENING.stock}) == len(OPENING.stock)
    wings = [
        fleet.spec(state, i["rear-wing"])["id"]
        for e, i in OPENING.installed.items()
        if e.startswith("f2-")
    ]
    assert len(set(wings)) == 1
    foreign = fleet.spec(state, OPENING.installed["wec-5"]["engine"])
    assert not fleet.compatible(state, WORLD, WORLD["entries"]["dtm-1"], foreign)
    gt = next(e for e in WORLD["entries"].values() if e["category"] == "LMGT3")
    assert not fleet.compatible(state, WORLD, gt, foreign)
    gear = fleet.spec(state, OPENING.installed["f1-4"]["transmission"])
    weak = dict(gear, parameters=dict(gear["parameters"], input_limit_nm=100))
    assert not fleet.compatible(state, WORLD, WORLD["entries"]["f1-4"], weak)


def test_static_tradeoffs_and_hidden_saturating_concept():
    state = state_of(create())
    fitted = {k: fleet.spec(state, v) for k, v in fleet.mounting(state, "f1-4").items()}
    baseline = assembly(fitted)
    high_power = deepcopy(fitted)
    high_power["engine"]["parameters"].update(power_kw=820, heat_kw=600)
    assert (
        assembly(high_power)["sustainable_wheel_kw"] < baseline["sustainable_wheel_kw"]
    )
    low = next(
        s
        for s in OPENING.specs.values()
        if s["interface"] == "mcl39" and s["version"] == 2
    )
    alt = assembly(dict(fitted, **{"rear-wing": low}))
    assert alt["drag_area_m2"] < baseline["drag_area_m2"]
    assert alt["clearance_mm"] > baseline["clearance_mm"]
    assert alt["lift_area_m2"] != baseline["lift_area_m2"]
    curve = [development_margin(45, "concept", "floor", i) for i in range(1000)]
    assert all(a > b > 0 for a, b in zip(curve, curve[1:])) and sum(curve) < 0.32
    assert curve[0] == development_margin(45, "concept", "floor", 0)
    assert curve[0] != development_margin(45, "concept", "cooling", 0)


def test_install_condition_snapshot_receipts_and_allocation():
    c = create()
    cid = c["id"]
    start = component_desk(cid, "f1-4")
    v2 = next(p for p in start["spares"] if p["version"] == 2)["instance"]
    old = start["parts"]["rear-wing"]["instance"]
    with pytest.raises(domain.RuleError, match="договору"):
        service.execute(cid, order(c, v2, "f1-81"))
    wear = order(
        c,
        old,
        reference="verified-operation",
        distance_m=12345,
        wear_ppm=2000,
        damaged=False,
    )
    with TestClient(app) as client:
        assert (
            client.post(
                f"/api/careers/{cid}/commands", json=wear.model_dump()
            ).status_code
            == 403
        )
    c = service.execute(cid, wear)
    usage_state = state_of(c)["components"]
    c = service.execute(
        cid,
        order(
            c,
            old,
            reference="verified-operation",
            distance_m=12345,
            wear_ppm=2000,
            damaged=False,
        ),
    )
    assert state_of(c)["components"] == usage_state
    cmd = order(c, v2)
    c = service.execute(cid, cmd)
    assert service.execute(cid, cmd) == c
    assert c["garage_configurations"]["car-f1-4"]["installed"]["rear-wing"].endswith(
        "low-1"
    )
    assert c["garage_configurations"]["car-f1-81"]["installed"] == {}
    after = component_desk(cid, "f1-4")
    assert after["parts"]["rear-wing"]["distance_m"] == 0
    assert (
        next(p for p in after["spares"] if p["instance"] == old)["remaining_m"]
        == 5000000 - 12345
    )
    assert len(state_of(c)["lineup"]["facts"]) == 1
    assert after["history"][0]["assembly"] == after["assembly"]
    c = service.execute(cid, order(c, old))
    returned = component_desk(cid, "f1-4")
    assert returned["parts"]["rear-wing"]["distance_m"] == 12345
    assert returned["history"][1] == after["history"][0]
    assert returned["history"][0]["fitted"]["rear-wing"]["wear_ppm"] == 2000
    assert any(r["kind"] == "restored" for r in state_of(c)["lineup"]["history"])
    assert returned["assembly"] == start["assembly"]
    doc = service.export_save(cid)
    assert (
        len(
            [
                x
                for x in doc["payload"]["statistics_v1"]
                if x[0] == "fact" and x[1]["data"]["kind"] == "specification-change"
            ]
        )
        == 2
    )
    restored = service.import_save(doc)
    assert service.export_save(restored["id"]) == doc
    assert component_desk(restored["id"], "f1-4") == returned
    with pytest.raises(domain.RuleError):
        component_desk(cid, "f1-1")


def test_incompatible_double_install_and_atomic_failure(monkeypatch):
    c = create()
    cid = c["id"]
    instance = next(
        x["instance"]
        for x in component_desk(cid, "f1-4")["spares"]
        if x["slot"] == "suspension"
    )
    initial = service.export_save(cid)

    def fail(*args):
        raise RuntimeError("statistics unavailable")

    with monkeypatch.context() as m:
        m.setattr(fleet, "write_install_fact", fail)
        with pytest.raises(RuntimeError):
            service.execute(cid, order(c, instance))
    assert service.export_save(cid) == initial

    def install(entry):
        try:
            service.execute(
                cid, order(c, instance, entry).model_copy(update={"command_id": entry})
            )
            return True
        except domain.RuleError as err:
            assert err.status == 409
            return False

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(install, ["f1-4", "f1-81"])) == [False, True]
    state = state_of(c)
    assert len(state["components"]["history"]) == 1
    assert (
        sum(instance in fleet.mounting(state, e).values() for e in WORLD["entries"])
        == 1
    )


def test_migrate_database_and_portable_v19_on_active_revision():
    c = create()
    c = service.execute(
        c["id"], service.Command(action="advance", revision=0, command_id="advance")
    )
    saved = service.export_save(c["id"])
    saved["payload"]["state"].pop("components")
    saved["sha256"] = hashlib.sha256(
        storage.dump(saved["payload"]).encode()
    ).hexdigest()
    with storage.transaction(True) as db:
        old = storage.checkpoint(db, c["id"])
        old.pop("components")
        storage.store(db, c["id"], old)
        db.execute("PRAGMA user_version=19")
    migrated = service.load(c["id"])
    copied = service.import_save(saved)
    assert migrated["ledger"] == copied["ledger"] == c["ledger"]
    assert component_desk(c["id"], "f1-4") == component_desk(copied["id"], "f1-4")
    assert state_of(copied)["components"]["since"] == c["revision"]
    assert component_desk(c["id"], "f1-4")["since"] == c["date"]
    identical = service.export_save(migrated["id"])
    assert service.export_save(service.import_save(identical)["id"]) == identical


def test_first_driver_spare_conflict_and_homologated_crew():
    c = create()
    state = state_of(c)
    alice, bob = sorted(
        fleet.seats_for(WORLD, WORLD["entries"]["f1-4"]), key=lambda row: row["entry"]
    )
    c = service.execute(
        c["id"],
        service.Command(
            action="driver-review",
            revision=0,
            command_id="status",
            staff=dict(seat=bob["id"], status="first", compensation_cents=10000000),
        ),
    )
    for seat in (alice, bob):
        eid = seat["entry"]
        c = service.execute(
            c["id"],
            order(
                c,
                fleet.mounting(state, eid)["suspension"],
                eid,
                reference=eid + "-damage",
                distance_m=0,
                wear_ppm=2,
                damaged=True,
            ),
        )
    spare = next(
        x
        for x in component_desk(c["id"], alice["entry"])["spares"]
        if x["slot"] == "suspension"
    )
    assert spare["assigned_number"] == WORLD["entries"][bob["entry"]]["number"]
    with pytest.raises(domain.RuleError, match="договору"):
        service.execute(c["id"], order(c, spare["instance"], alice["entry"]))
    c = service.execute(c["id"], order(c, spare["instance"], bob["entry"]))
    assert any(r.get("resource") == "spare" for r in state_of(c)["lineup"]["history"])

    e = WORLD["entries"]["wec-5"]
    c = create(org=e["org"], series="wec")
    desk = component_desk(c["id"], e["id"])
    assert len(c["crews"][e["id"]]) == 3 and not desk["development"]
    iid = next(p for p in desk["spares"] if p["slot"] == "cooling")["instance"]
    c = service.execute(c["id"], order(c, iid, e["id"]))
    assert component_desk(c["id"], e["id"])["parts"]["cooling"]["instance"] == iid
    assert not state_of(c)["lineup"]["facts"]


def test_access_admission_and_zero_installation_cost():
    owner = create(role="owner")
    cid = owner["id"]
    spare = component_desk(cid, "f1-4")["spares"][0]["instance"]
    with pytest.raises(domain.RuleError, match="менеджер"):
        service.execute(cid, order(owner, spare))
    car = create()
    before = car["ledger"]
    c = service.execute(car["id"], order(car, spare))
    assert c["ledger"] == before and c["account"] == car["account"]
    s = state_of(c)
    s["capital"]["programs"][WORLD["entries"]["f1-4"]["program"]]["status"] = (
        "withdrawn"
    )
    d = fleet.desk(s, WORLD, "f1-4")
    assert d["installation_block"]
    with pytest.raises(domain.RuleError, match="допуска"):
        fleet.install(
            s,
            WORLD,
            fleet.Install(entry="f1-4", instance=d["spares"][0]["instance"]),
            c["org"],
        )


def test_immutable_revisions_and_homologation_are_independent():
    from .components.registry import register_instance, register_revision

    c = create()
    state = state_of(c)
    entry = WORLD["entries"]["f2-1"]
    original = OPENING.installed["f2-1"]["floor"]
    base = fleet.spec(state, original)
    args = dict(
        parent=base["id"],
        version=2,
        title="Изменённый профиль",
        parameters=dict(base["parameters"], design_clearance_mm=36),
        life_m=base["life_m"],
        visual=None,
        author=fleet.specialists(state, WORLD, entry)["chief-engineer"],
        reference="certified-drawing",
        refinement=True,
    )
    v2 = register_revision(state, **args)
    assert register_revision(state, **args) == v2
    with pytest.raises(domain.RuleError):
        register_revision(state, **dict(args, life_m=1200))
    with pytest.raises(domain.RuleError):
        register_revision(state, **dict(args, parameters={"mass_lb": 200}))
    item = dict(
        instance="new-floor", version=v2, org=entry["org"], reference="accepted-serial"
    )
    register_instance(state, **item)
    register_instance(state, **item)
    with pytest.raises(domain.RuleError):
        register_instance(state, **dict(item, version=base["id"]))
    assert "new-floor" not in fleet.stockroom(state, WORLD, entry)
    state["components"]["admissions"][base["regulation"]] = [v2]
    assert "new-floor" in fleet.stockroom(state, WORLD, entry)
    state["components"]["locked_slots"][entry["id"]] = {"floor": "Закрытый парк"}
    assert "new-floor" not in fleet.stockroom(state, WORLD, entry)
    assert fleet.spec(state, original) == base and base["version"] == 1
