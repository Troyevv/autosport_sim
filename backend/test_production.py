"""Production acceptance through dated shifts, portable receipts and the shared garage."""

from copy import deepcopy

import pytest

from . import components, development, domain, production, service, storage
from .app import production_desk
from .catalog import LINEUP_WORLD as WORLD
from .components.registry import drawing_for
from .finance import facilities
from .production import workshop
from .production.desk import projection
from .test_career import MCLAREN, advance, create
from .test_components import order as fit
from .test_development import design, rent, send as engineering, until_finished
from .test_research import checkpoint, lease, study


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def send(c, action, **payload):
    command = service.Command(
        revision=c["revision"],
        command_id="factory-" + str(c["revision"]),
        action=action,
        production=payload,
    )
    result = service.execute(c["id"], command)
    assert service.execute(c["id"], command) == result
    return result


def version(s, slot="rear-wing"):
    return development.versions(s, "f1-4", slot)[0]["id"]


def order(c, spec, **changes):
    payload = dict(
        entry="f1-4",
        specification=spec,
        quantity=1,
        priority="normal",
        rush=False,
        outsource=False,
    )
    return send(c, "production-order", **(payload | changes))


def test_queue_cost_capacity_and_cancel():
    c = create()
    spec = version(checkpoint(c))
    c = order(c, spec, priority="low", quantity=3)
    c = order(c, spec, rush=True, priority="high")
    c = advance(c)
    fast, slow = production_desk(c["id"])["batches"]
    assert (
        fast["required"] < slow["required"] / 3
        and fast["cost_cents"] > slow["cost_cents"] / 3
    )
    assert fast["worked"] == 0 and "мощность" in fast["reason"]
    c = advance(rent(c, "factory"))
    fast, slow = production_desk(c["id"])["batches"]
    assert fast["worked"] > 0 and slow["worked"] == 0 and slow["reason"]
    iid = fast["id"] + "/unit-1"
    assert (
        components.stockroom(checkpoint(c), WORLD, WORLD["entries"]["f1-4"]).count(iid)
        == 0
    )
    before = service.export_save(c["id"])["payload"]["state"]["ledger"]
    c = send(c, "production-cancel", batch=slow["id"])
    after = service.export_save(c["id"])["payload"]["state"]["ledger"]
    assert before == after
    assert sum(r["org"] == MCLAREN and r["source"] == "production" for r in after) == 2
    with pytest.raises(domain.RuleError):
        send(c, "production-priority", batch=slow["id"], priority="high")
    c = advance(rent(c, "quality"))
    assert production_desk(c["id"])["items"][0]["batch"] == fast["id"]
    saved = service.export_save(c["id"])
    assert service.export_save(service.import_save(saved)["id"]) == saved


def test_budget_staff_outsourcing_and_npc_costs():
    s = checkpoint(create())
    e = WORLD["entries"]["f2-1"]
    org = e["org"]
    spec = components.spec(s, components.mounting(s, e["id"])["brakes"])["id"]
    request = production.Order(
        entry=e["id"],
        specification=spec,
        quantity=1,
        priority="normal",
        rush=False,
        outsource=False,
    )
    with pytest.raises(domain.RuleError, match="поставщик"):
        production.commission(s, WORLD, org, "npc-batch", request)
    external = request.model_copy(update={"outsource": True})
    s["market"]["supplies"]["different-maker"] = dict(
        org=org,
        series=e["championship"],
        product="brakes",
        sponsor="other",
        status="signed",
        start=s["date"],
        end="2026-01-01",
    )
    with pytest.raises(domain.RuleError, match="договору"):
        production.commission(s, WORLD, org, "npc-batch", external)
    del s["market"]["supplies"]["different-maker"]
    allocation = s["control"]["plans"][org]["2025"]["allocations"]
    approved = allocation["engineering"]
    allocation["engineering"] = 0
    before = deepcopy(s["accounts"][org])
    with pytest.raises(domain.RuleError, match="бюджета"):
        production.commission(s, WORLD, org, "npc-batch", external)
    assert s["accounts"][org] == before and not s["production"]["batches"]
    allocation["engineering"] = approved
    b = production.commission(s, WORLD, org, "npc-batch", external)
    assert production.commission(s, WORLD, org, "npc-batch", external) is b
    group = workshop.crew(s, org, False)
    workload = group["workload"]
    group["workload"] = 100
    workshop.fabricate(s, WORLD, b, {})
    assert "человеко-часов" in b["reason"] and not b["worked"] and not b["grants"]
    group["workload"] = workload
    for _ in range(7):
        workshop.day(s, WORLD, {})
        s["date"] = facilities.later(s["date"], 1)
    assert b["finished"] and b["facility_cents"] > 0
    iid = b["id"] + "/unit-1"
    item = s["production"]["items"][iid]
    assert (
        item["checks"] > 0
        and item["cost_cents"] == b["cost_cents"] + b["facility_cents"]
    )
    assert any(
        r["org"] == org and r["delta_cents"] < 0 and r["source"] == "infrastructure"
        for r in s["ledger"]
    )
    assert iid not in str(projection(s, WORLD))


@pytest.mark.parametrize("source", ["serial", "batch"])
def test_blind_quality_control_repair_and_scrap(source, monkeypatch):
    c = rent(rent(create(), "factory"), "quality")
    s = checkpoint(c)
    spec = version(s)
    truth = deepcopy(drawing_for(s, spec))
    request = production.Order(
        entry="f1-4",
        specification=spec,
        quantity=2,
        priority="normal",
        rush=True,
        outsource=False,
    )
    b = production.commission(s, WORLD, MCLAREN, "run", request)

    # Exercise the actual inspection decision intervals on the same imperfect serial.
    def sample(state, key, purpose):
        return {
            source: 0,
            "inspection-1": 900,
            "inspection-2": 999,
            "inspection-3": 0,
            "inspection-4": 0,
        }.get(purpose, 999)

    monkeypatch.setattr(workshop, "draw", sample)
    for _ in range(5):
        workshop.fabricate(s, WORLD, b, {})
        if b["finished"]:
            break
        s["date"] = facilities.later(s["date"], 1)
    iid = "run/unit-1"
    item = s["production"]["items"][iid]
    assert any(workshop.physical_faults(s, iid))

    def shift():
        s["date"] = facilities.later(s["date"], 1)
        workshop.service_item(s, WORLD, iid, item, {})

    def act(decision):
        production.disposition(
            s, WORLD, MCLAREN, production.Disposition(instance=iid, decision=decision)
        )

    shift()
    assert item["status"] == "stock" and not item["rejected"]
    public = projection(s, WORLD)
    assert all(
        key not in str(public)
        for key in (
            "batch_fault",
            "'fault'",
            "risk_sum",
            "batch-defect",
            "'rejected': True",
        )
    )
    act("inspect")
    shift()
    assert s["production"]["history"][-1]["code"] == "additional"
    shift()
    protocol = [h for h in s["production"]["history"] if h["instance"] == iid][-1]
    sibling = s["production"]["items"]["run/unit-2"]
    assert sibling["rejected"] == (source == "batch")
    assert protocol["code"] == ("batch-defect" if source == "batch" else "rejected")
    assert iid not in components.stockroom(s, WORLD, WORLD["entries"]["f1-4"])
    s["components"]["condition"][iid] = dict(distance_m=123, wear_ppm=456, damaged=True)
    act("repair")
    shift()
    assert item["status"] == "inspection" and not any(workshop.physical_faults(s, iid))
    shift()
    assert components.condition(s, iid) == dict(
        distance_m=123, wear_ppm=456, damaged=False
    )
    assert iid in components.stockroom(s, WORLD, WORLD["entries"]["f1-4"])
    act("scrap")
    assert iid not in components.stockroom(s, WORLD, WORLD["entries"]["f1-4"])
    with pytest.raises(domain.RuleError):
        act("inspect")
    assert drawing_for(s, spec) == truth


def test_full_research_release_repeated_production_fit_and_transfer():
    c = study(lease(create()), "rear-wing")
    while not checkpoint(c)["research"]["reports"]:
        c = advance(c)
    baseline = version(checkpoint(c))
    c = until_finished(design(rent(c, "design"), baseline), 1)
    project = next(
        p
        for p in checkpoint(c)["development"]["projects"].values()
        if p["org"] == MCLAREN
    )
    v = project["specification"]
    with pytest.raises(domain.RuleError, match="допуска"):
        order(c, v)
    c = engineering(
        rent(c, "tunnel"),
        "development-test",
        entry="f1-4",
        baseline=baseline,
        candidate=v,
        priority="high",
        method="tunnel",
    )
    c = until_finished(c, 2)
    c = engineering(
        c, "development-review", project=project["id"], disposition="released"
    )
    c = rent(rent(c, "factory"), "quality")
    c = order(order(c, v), v)
    for _ in range(9):
        desk = production_desk(c["id"])
        ready = [
            i
            for i in desk["items"]
            if i["specification"] == v and i["status"] == "stock"
        ]
        if len(ready) == 2:
            break
        for i in desk["items"]:
            if i["specification"] == v and "repair" in i["actions"]:
                c = send(
                    c, "production-disposition", instance=i["id"], decision="repair"
                )
        c = advance(c)
    assert len(ready) == 2 and ready[0]["id"] != ready[1]["id"]
    for i, eid in zip(ready, ("f1-81", "f1-4")):
        c = service.execute(c["id"], fit(c, i["id"], eid))
    s = checkpoint(c)
    assert (
        len(
            [
                p
                for p in s["development"]["projects"].values()
                if p["org"] == MCLAREN and p["kind"] == "design"
            ]
        )
        == 1
    )
    assert {components.mounting(s, eid)["rear-wing"] for eid in ("f1-81", "f1-4")} == {
        i["id"] for i in ready
    }
    saved = service.export_save(c["id"])
    assert service.export_save(service.import_save(saved)["id"]) == saved


def test_migrate_v22_checkpoint_after_real_install():
    c = create()
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        del s["production"]
        storage.store(db, c["id"], s)
    spare = components.stockroom(s, WORLD, WORLD["entries"]["f1-4"])[0]
    c = service.execute(c["id"], fit(c, spare))
    old = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=22")
    imported = service.import_save(old)
    assert checkpoint(c)["production"]["since"] == c["revision"]
    assert checkpoint(imported)["components"] == checkpoint(c)["components"]
    assert service.export_save(imported["id"]) == service.export_save(c["id"])


def test_concurrent_retry_and_rollback_of_production_facts(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    c = create()
    spec = version(checkpoint(c))
    before = service.export_save(c["id"])
    cmd = service.Command(
        revision=0,
        command_id="duplicate",
        action="production-order",
        production=dict(
            entry="f1-4",
            specification=spec,
            quantity=2,
            priority="high",
            rush=False,
            outsource=False,
        ),
    )

    def fail(*args):
        raise RuntimeError("technical archive unavailable")

    with monkeypatch.context() as patch:
        patch.setattr(production, "write_fact", fail)
        with pytest.raises(RuntimeError):
            service.execute(c["id"], cmd)
    assert service.export_save(c["id"]) == before
    with ThreadPoolExecutor(2) as pool:
        outcomes = list(pool.map(lambda _: service.execute(c["id"], cmd), range(2)))
    assert outcomes[0] == outcomes[1]
    state = service.export_save(c["id"])["payload"]["state"]
    assert len(state["production"]["batches"]) == 1
    assert (
        sum(
            r["org"] == MCLAREN and r["source"] == "production" for r in state["ledger"]
        )
        == 1
    )


def test_paid_outsource_slot_was_already_purchased():
    c = create()
    s = checkpoint(c)
    day = s["date"]
    facilities.act(
        s,
        WORLD,
        MCLAREN,
        "reserved",
        facilities.Lease(
            facility="shared:factory", start=day, days=2, units=1, mode="outsource"
        ),
    )
    b = production.commission(
        s,
        WORLD,
        MCLAREN,
        "external",
        production.Order(
            entry="f1-4",
            specification=version(s),
            quantity=1,
            priority="normal",
            rush=False,
            outsource=True,
        ),
    )
    before = len(s["ledger"])
    workshop.fabricate(s, WORLD, b, {})
    assert len(s["ledger"]) == before
    assert s["estate"]["bookings"][b["grants"][0]]["rental"] == "reserved"
    assert b["facility_cents"] == s["estate"]["bookings"]["reserved"]["cost_cents"] // 2
    snapshot = deepcopy(b)
    workshop.fabricate(s, WORLD, b, {})
    assert b == snapshot


def test_endurance_crew_uses_one_car_and_standard_drawings():
    e = WORLD["entries"]["wec-5"]
    c = create(org=e["org"], series="wec")
    s = checkpoint(c)
    desk = projection(s, WORLD)
    entry = next(car for car in desk["entries"] if car["id"] == e["id"])
    assert len(entry["crew"]) == len(e["crew"]) > 1
    d = next(d for d in entry["choices"] if d["slot"] == "brakes")
    assert d["modes"][0]["reason"] and not d["modes"][1]["reason"]
    request = production.Order(
        entry=e["id"],
        specification=d["id"],
        quantity=1,
        priority="normal",
        rush=False,
        outsource=True,
    )
    other = version(s)
    with pytest.raises(domain.RuleError, match="несовместим"):
        production.commission(
            s,
            WORLD,
            e["org"],
            "illegal",
            request.model_copy(update={"specification": other}),
        )
    production.commission(s, WORLD, e["org"], "endurance", request)
    need = next(
        r for r in projection(s, WORLD)["needs"] if r["specification"] == d["id"]
    )
    assert need["cars"] == sum(
        any(draw["id"] == d["id"] for draw in car["choices"]) for car in desk["entries"]
    )
    assert need["pending"] == 1


def test_warehouse_reserves_capacity_before_spending_and_releases_on_cancel():
    c = create()
    s = checkpoint(c)
    start = production.storage_space(s, WORLD, MCLAREN)
    assert 0 < start["free"] <= 24
    spec = version(s)
    c = order(c, spec, quantity=start["free"])
    booked = production_desk(c["id"])
    assert (
        booked["storage"]["reserved"] == start["free"]
        and booked["storage"]["free"] == 0
    )
    saved = service.export_save(c["id"])
    with pytest.raises(domain.RuleError, match="складских мест"):
        order(c, spec)
    assert service.export_save(c["id"]) == saved
    c = rent(c, "warehouse")
    assert production_desk(c["id"])["storage"]["free"] == 12
    c = order(c, spec, quantity=2)
    c = send(c, "production-cancel", batch=booked["batches"][0]["id"])
    assert production_desk(c["id"])["storage"]["reserved"] == 2
    assert production_desk(c["id"])["storage"]["free"] == start["free"] + 10
