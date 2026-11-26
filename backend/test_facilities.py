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


def test_engineering_queues_and_staffed_throughput():
    c = create(role="owner")
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    day = s["date"]
    end = f.later(day, 2)
    for kind, process in (
        ("research", "research"),
        ("design", "development"),
        ("factory", "production"),
    ):
        f.act(
            s,
            WORLD,
            MCLAREN,
            "lease-" + kind,
            f.Lease(
                facility="shared:" + kind, start=day, days=2, units=1, mode="lease"
            ),
        )
        req = f.Access(
            reference="job-" + kind,
            org=MCLAREN,
            facility="shared:" + kind,
            start=day,
            days=2,
            units=1,
            purpose=process,
            program=MCLAREN + ":f1",
            regulation=WORLD["championships"]["f1"]["rules_id"],
            authorization="order-" + kind,
        )
        assert f.capacity_window(s, MCLAREN, process, day, end).available_slots == 1
        f.access(s, WORLD, req)
        f.access(s, WORLD, req)
        window = f.capacity_window(s, MCLAREN, process, day, end)
        assert window.confirmed_queue == [req.reference] and window.available_slots == 0
        assert (
            f.grant(s, req.reference).effective_person_days_x100
            == f.TYPES[kind][4] * 100
        )
        with pytest.raises(domain.RuleError):
            f.access(s, WORLD, req.model_copy(update={"reference": "extra"}))
        with pytest.raises(domain.RuleError):
            f.access(s, WORLD, req.model_copy(update={"purpose": "storage"}))

    a = f.asset("owned", MCLAREN, "design", "IT", day, day, 0, level=4)
    s["estate"]["assets"][a["id"]] = a
    groups = [g for g in s["collectives"].values() if g["org"] == MCLAREN]
    for g in groups:
        g.update(size=0)
    engineer = groups[0]
    engineer.update(size=10, qualification=80, workload=0, fatigue=0)
    assert f.resources(s, a) == (2, 800)
    a["condition"] = 50
    assert f.resources(s, a) == (2, 400)
    engineer.update(qualification=40, workload=50)
    assert f.resources(s, a) == (1, 100)
    engineer["workload"] = 100
    assert f.resources(s, a) == (0, 0)


def test_convert_depot_with_open_lease_and_paid_construction(monkeypatch):
    from pydantic import ValidationError
    from backend.finance import market
    from backend import finance
    from backend.test_finance import command

    with monkeypatch.context() as patch:
        for module in (market, f):
            initialize = module.initialize
            patch.setattr(
                module, "initialize", lambda s, w, fn=initialize: fn(s, w, legacy=True)
            )
        c = create(role="owner")
        # The archived build order is read with the schema-17 spelling.
        c = service.execute(
            c["id"], command(c, "finance-build", kind="warehouse", country="ES")
        )
        c = service.execute(
            c["id"],
            command(
                c,
                "finance-lease",
                facility="shared:logistics",
                start=c["date"],
                days=8,
                units=2,
                mode="lease",
            ),
        )
    with storage.transaction(True) as db:
        db.execute(
            "UPDATE receipt SET paint=replace(paint,'warehouse','logistics') WHERE career=? AND action='finance-build'",
            (c["id"],),
        )
        old = service.checkpoint_document(db, c["id"])
        db.execute("PRAGMA user_version=17")
    new = service.export_save(c["id"])
    migrated = service.import_save(old)
    assert service.export_save(migrated["id"]) == new
    assert service.export_save(service.import_save(new)["id"]) == new
    a, b = (doc["payload"]["state"] for doc in (old, new))
    assert a["ledger"] == b["ledger"] and a["market"] == b["market"]
    assert finance.balance(a, MCLAREN) == finance.balance(b, MCLAREN)
    assert a["estate"]["bookings"] == b["estate"]["bookings"]
    for key, asset in a["estate"]["assets"].items():
        updated = b["estate"]["assets"][key]
        assert updated == dict(
            asset, kind="warehouse" if asset["kind"] == "logistics" else asset["kind"]
        )
    with pytest.raises(ValidationError):
        command(c, "finance-build", kind="logistics", country="ES")


@pytest.mark.parametrize("kind", sorted(f.TYPES))
def test_facility_lifecycle_and_first_service(kind):
    c = create(role="owner")
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    q = f.quote(kind, "ES")
    # Isolate the facility lifecycle from the separately tested mandate approval.
    plan = s["control"]["plans"][MCLAREN][s["date"][:4]]
    plan["allocations"]["facilities"] += 2 * q["build_cents"]
    f.act(s, WORLD, MCLAREN, "build", f.Build(kind=kind, country="ES"))
    a = s["estate"]["assets"]["build"]
    s["date"] = a["ready"]
    f.tick(s, WORLD)
    assert a["status"] == "active" and f.capacity(s, a) == 1
    from backend.finance import next_month

    s["date"] = next_month(s["date"])
    f.tick(s, WORLD)
    upkeep = [
        r
        for r in s["finance"]["instalments"].values()
        if r["contract"] == "build" and r["due"] == s["date"]
    ]
    assert len(upkeep) == 1 and upkeep[0]["amount_cents"] == q["monthly_cents"]
    f.tick(s, WORLD)
    assert (
        len(
            [
                r
                for r in s["finance"]["instalments"].values()
                if r["contract"] == "build" and r["due"] == s["date"]
            ]
        )
        == 1
    )


def test_f1_testing_requires_the_corresponding_equipment_allocation():
    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    day = s["date"]
    program = MCLAREN + ":f1"
    from backend.finance import budget

    target = next(t for t in c["targets"] if t["target_season"] == "f1-2025")
    for key, quota in (
        ("cfd-project", {"cfd_geometries": 1}),
        ("tunnel-project", {"runs": 1}),
    ):
        budget.project(
            s,
            WORLD,
            budget.ProjectCost(
                project=key,
                program=program,
                target_season=target["target_season"],
                generation=target["generation"],
                amount_cents=7000,
                due="2025-02-02",
                atr=quota,
            ),
        )
    f.act(
        s,
        WORLD,
        MCLAREN,
        "rent",
        f.Lease(facility="shared:tunnel", start=day, units=1, days=1, mode="lease"),
    )
    use = f.Access(
        reference="slot",
        org=MCLAREN,
        facility="shared:tunnel",
        start=day,
        days=1,
        units=1,
        purpose="testing",
        authorization="cfd-project",
        program=program,
        regulation=WORLD["championships"]["f1"]["rules_id"],
    )
    with pytest.raises(domain.RuleError, match="Квота проекта"):
        f.access(s, WORLD, use)
    f.access(s, WORLD, use.model_copy(update={"authorization": "tunnel-project"}))
    issued = f.grant(s, "slot")
    assert (issued.org, issued.program) == (MCLAREN, program)
    s["date"] = c["atr"]["period"]["end_exclusive"]
    with pytest.raises(domain.RuleError, match="период квоты"):
        f.access(
            s, WORLD, use.model_copy(update={"reference": "later", "start": s["date"]})
        )


def test_leased_slots_cannot_double_book_after_operator_capacity_drops():
    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    day = s["date"]
    facility = s["estate"]["assets"]["shared:research"]
    other = "team-williams-racing"
    order = f.Lease(facility=facility["id"], start=day, days=3, units=3, mode="lease")
    for buyer in (MCLAREN, other):
        f.act(s, WORLD, buyer, "rent:" + buyer, order)
    facility["level"] = 3
    end = f.later(day, 3)
    f.consume(s, other, "confirmed", facility, day, end, 2, "research", "project")
    assert f.free(s, facility, day, end, buyer=MCLAREN) == 1
    with pytest.raises(domain.RuleError):
        f.consume(s, MCLAREN, "second", facility, day, end, 2, "research", "project-2")
    assert f.free(s, facility, end, f.later(end, 1)) == 3
