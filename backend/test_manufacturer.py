"""Supplier programmes, serial custody, warranty and client-scoped evidence."""

import pytest
from . import components, finance, manufacturer, service, storage
from .app import manufacturer_desk
from .catalog import LINEUP_WORLD as WORLD
from .domain import RuleError
from .finance import facilities
from .manufacturer import support
from .supplier_engineering import agreement
from .manufacturer.planning import review
from .research import work
from .production.workshop import day as factory_day
from .test_career import create, advance
from .test_research import checkpoint

MAKER = "supplier-mercedes"
ENTRY = "f1-4"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def order(c, command_name, **fields):
    cmd = service.Command(
        revision=c["revision"],
        command_id="m-" + str(c["revision"]),
        action=command_name,
        manufacturer=fields,
    )
    updated = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == updated
    return updated


def next_day(s):
    s["date"] = facilities.later(s["date"], 1)


def finish(s, p):
    for _ in range(20):
        work(s, WORLD, p, {})
        if p["finished"]:
            return
        next_day(s)
    pytest.fail(str(p["reason"]))


def test_real_command_replay_generations_and_competing_resources():
    c = create(MAKER, "manufacturer")
    base = manufacturer_desk(c["id"])["catalog"][0]
    assert {"fuel_g_kwh", "power_kw", "heat_kw"} <= base["editions"][0]["values"].keys()
    with pytest.raises(RuleError):
        order(c, "maker-work", entry=ENTRY, axis="engine", year=2025, action="design")
    for axis in ("thermal", "output"):
        c = order(
            c,
            "maker-work",
            entry=ENTRY,
            axis="engine",
            year=2026,
            action="design",
            objective=axis,
        )
    c = advance(c)
    state = checkpoint(c)
    jobs = [p for p in state["development"]["projects"].values() if p["org"] == MAKER]
    assert len(jobs) == 2 and jobs[0]["finished"] and jobs[0]["lead"] == jobs[1]["lead"]
    assert jobs[1]["started"] is None or jobs[0]["finished"] < jobs[1]["started"]
    for job in jobs:
        assert state["finance"]["instalments"]["project:" + job["id"]]["payer"] == MAKER
    assert any(r["supplier"] != MAKER for r in state["manufacturer"]["cases"].values())
    view = manufacturer_desk(c["id"])
    assert "latent_defect" not in str(view)
    other = service.import_save(service.export_save(c["id"]))
    assert manufacturer_desk(other["id"]) == view
    with storage.transaction(True) as db:
        old = storage.checkpoint(db, c["id"])
        old.pop("manufacturer")
        storage.store(db, c["id"], old)
        db.execute("PRAGMA user_version=25")
    migrated = checkpoint(c)
    assert migrated["manufacturer"]["since"] == c["revision"]
    assert migrated["development"]["projects"] == state["development"]["projects"]


@pytest.mark.parametrize(
    "org,axis", [("supplier-xtrac", "transmission"), ("supplier-pirelli", "tyre")]
)
def test_profile_lead_and_bench(org, axis):
    e, _ = next((e, a) for e, a in manufacturer.lines(WORLD, org) if a == axis)
    s = checkpoint(create(org, "manufacturer", e["championship"]))
    from .manufacturer.profile import TARGETS

    objective = next(k for k in TARGETS[axis] if k != "output")
    args = dict(entry=e["id"], axis=axis, year=2025, objective=objective)
    design = manufacturer.commission(
        s, WORLD, org, "make", manufacturer.Work(action="design", **args)
    )
    assert design["lead"] in s["people"]
    finish(s, design)
    test = manufacturer.commission(
        s,
        WORLD,
        org,
        "measure",
        manufacturer.Work(
            action="bench", specification=design["specification"], **args
        ),
    )
    finish(s, test)
    assert (
        test["report"]["metric"] == TARGETS[axis][objective][0]
        and test["report"]["uncertainty"] > 0
    )
    assert test["lead"] != design["lead"]


@pytest.mark.parametrize("remedy", ["compensate", "repair", "replace"])
def test_serial_delivery_ledger_equality_and_warranty(remedy):
    s = checkpoint(create(MAKER, "manufacturer"))
    e = WORLD["entries"][ENTRY]
    client = e["org"]
    facilities.act(
        s,
        WORLD,
        MAKER,
        "rack",
        facilities.Lease(
            facility="shared:warehouse", start=s["date"], days=15, units=1, mode="lease"
        ),
    )
    b = manufacturer.commission(
        s,
        WORLD,
        MAKER,
        "rack-batch",
        manufacturer.Work(
            entry=ENTRY,
            axis="engine",
            year=2025,
            action="produce",
            quantity=2 if remedy == "replace" else 1,
        ),
    )
    iid = b["id"] + "/unit-1"
    for _ in range(15):
        factory_day(s, WORLD, {})
        if all(
            s["production"]["items"].get(b["id"] + f"/unit-{n}", {}).get("status")
            == "stock"
            for n in range(1, b["quantity"] + 1)
        ):
            break
        next_day(s)
    assert iid in manufacturer.eligible_stock(s, WORLD, MAKER, e, "engine")
    other_iface = next(
        x for x, a in manufacturer.lines(WORLD, MAKER) if x["org"] != client
    )
    assert manufacturer.delivery_block(s, WORLD, MAKER, other_iface, iid)
    # A signed competing agreement takes precedence over the opening installation.
    deal = dict(
        id="competing",
        org=client,
        series="f1",
        product="engine",
        sponsor="supplier-ferrari",
        start=s["date"],
        end="2025-12-31",
        status="signed",
        partnership="technical",
        support=True,
    )
    s["market"]["supplies"]["competing"] = deal
    assert manufacturer.delivery_block(s, WORLD, MAKER, e, iid)
    deal.update(status="terminated", ended=s["date"])
    assert agreement(s, WORLD, e, "engine") is None
    del s["market"]["supplies"]["competing"]
    balance = finance.balance(s, MAKER)
    manufacturer.deliver(s, WORLD, MAKER, e, iid)
    assert (
        iid in components.stockroom(s, WORLD, e)
        and finance.balance(s, MAKER) == balance
    )
    with pytest.raises(RuleError):
        manufacturer.deliver(s, WORLD, MAKER, e, iid)
    # Test fixture represents an installed, delivered serial and a later signed QC finding.
    s["components"]["mounts"].setdefault(ENTRY, {})["engine"] = iid
    row = support.open_case(
        s,
        WORLD,
        client,
        "claim",
        support.Request(
            entry=ENTRY,
            axis="engine",
            kind="warranty",
            objective="thermal",
            message="Перегрев",
        ),
    )
    s["production"]["items"][iid]["fault"] = True
    assert not support.diagnosis(s, WORLD, row)["covered"]
    decision = support.Resolve(
        case="claim", decision=remedy, reason="Брак подтверждён ОТК"
    )
    with pytest.raises(RuleError):
        support.resolve(s, WORLD, MAKER, decision)
    from .production import log

    log(
        s,
        ENTRY,
        row["specification"],
        "batch-defect",
        next(iter(b["participants"])),
        batch=b["id"],
        instance=iid,
    )
    if remedy == "repair":
        with pytest.raises(RuleError, match="снять"):
            support.resolve(s, WORLD, MAKER, decision)
        del s["components"]["mounts"][ENTRY]["engine"]
    s0 = finance.balance(s, client)
    support.resolve(s, WORLD, MAKER, decision)
    if remedy == "compensate":
        assert (
            finance.balance(s, client) - s0
            == balance - finance.balance(s, MAKER)
            == row["compensation_cents"]
        )
    elif remedy == "replace":
        assert b["id"] + "/unit-2" in components.stockroom(s, WORLD, e)
        assert finance.balance(s, client) == s0 and finance.balance(s, MAKER) == balance
    else:
        item = s["production"]["items"][iid]
        assert item["status"] == "repair" and item["service_org"] == MAKER
        assert finance.balance(s, client) == s0 and finance.balance(s, MAKER) < balance
        for _ in range(10):
            next_day(s)
            factory_day(s, WORLD, {})
            if item["status"] == "stock":
                break
        assert (
            item["status"] == "stock" and item["repaired"] and "service_org" not in item
        )

    with pytest.raises(RuleError):
        support.resolve(s, WORLD, MAKER, decision)


def test_client_conflict_diagnosis_grants_and_npc():
    c = create(MAKER, "manufacturer")
    s = checkpoint(c)
    first = WORLD["entries"][ENTRY]
    other = next(
        e for e, a in manufacturer.lines(WORLD, MAKER) if e["org"] != first["org"]
    )

    def request(e, objective, key):
        return support.open_case(
            s,
            WORLD,
            e["org"],
            key,
            support.Request(
                entry=e["id"],
                axis="engine",
                kind="next",
                objective=objective,
                message="Требование к поколению",
            ),
        )

    hot = request(first, "thermal", "first")
    request(other, "output", "other")
    grant = agreement(s, WORLD, first, "engine")
    from .employment import assign_support

    seat = WORLD["assignments"][MAKER + ":technical-advisor"]
    row = s["seats"][seat["id"]][0]
    assign_support(
        s,
        WORLD,
        seat,
        row,
        dict(entry=ENTRY, product="engine", start=s["date"], end="2025-07-01"),
    )
    assert s["support"][0]["agreement"] == grant["id"]
    fact = dict(
        entry=ENTRY,
        instance=hot["instance"],
        specification=hot["specification"],
        day=s["date"],
        reference="hot",
        channel="temperature",
        kind="track-measurement",
        session_kind="test",
        session="fixture",
        value=115,
        unit="°C",
        uncertainty=2,
        conditions="Эталон",
        observation="Высокая температура",
    )
    s["council"]["observations"].update(
        hot=fact,
        closed=dict(fact, reference="closed", channel="power"),
        another=dict(fact, reference="another", entry=other["id"]),
    )
    args = dict(
        entry=ENTRY,
        axis="engine",
        kind="data",
        objective="thermal",
        message="Протокол температур",
    )
    with pytest.raises(RuleError, match="доступный"):
        support.open_case(
            s,
            WORLD,
            first["org"],
            "forbidden",
            support.Request(**args, reference="closed"),
        )
    shared = support.open_case(
        s, WORLD, first["org"], "packet", support.Request(**args, reference="hot")
    )
    assert [f["reference"] for f in support.evidence(s, WORLD, shared)] == ["hot"]
    support.resolve(
        s,
        WORLD,
        MAKER,
        support.Resolve(
            case="packet",
            decision="advise",
            reason="Проверить расход теплоносителя и допуск креплений.",
        ),
    )
    assert shared["reviewer"] == row["person"]
    r = support.diagnosis(s, WORLD, hot)
    assert r["causes"]["cooling"] == r["causes"]["integration"] == ["hot"]
    assert not r["causes"]["design"] and not r["covered"] and 0 < r["confidence"] < 100
    review(s, WORLD, MAKER, 0)
    review(s, WORLD, MAKER, 1)
    assert {r["status"] for r in s["manufacturer"]["cases"].values()} == {
        "study",
        "decline",
        "advise",
    }
    assert len(s["research"]["projects"]) == 1 and not s["components"]["revisions"]
    s["date"] = "2025-07-02"
    assert not support.evidence(s, WORLD, hot)


def test_equal_supply_switch_requires_stock_for_every_entry():
    from .components.catalog import OPENING
    from .components.registry import register_instance, register_revision
    from .manufacturer.rollout import publish
    from .supplier_engineering import person

    org = "supplier-pirelli"
    s = checkpoint(create(org, "manufacturer", "f2"))
    cohort = [e for e, a in manufacturer.lines(WORLD, org) if e["championship"] == "f2"]
    e = cohort[0]
    author = person(s, org, "tyres")
    s["date"] = "2026-02-01"
    axis = "tyre"
    base = components.spec(s, OPENING.installed[e["id"]][axis])
    version = register_revision(
        s,
        parent=base["id"],
        version=2,
        title="Контрольная спецификация",
        parameters=base["parameters"],
        life_m=base["life_m"],
        visual=None,
        author=author,
        reference="design-case",
    )
    s["components"]["admissions"][base["regulation"]] = [version]
    s["development"]["projects"]["design-case"] = dict(
        id="design-case", org=org, disposition="released", findings=[]
    )
    s["production"]["batches"]["lot"] = dict(
        org=org, finished=s["date"], specification=version
    )

    def stock(i):
        iid = f"lot/{i}"
        register_instance(s, instance=iid, version=version, org=org, reference="lot")
        s["production"]["items"][iid] = dict(status="stock", batch="lot")
        return iid

    iid = stock(0)
    assert manufacturer.delivery_block(s, WORLD, org, e, iid)
    with pytest.raises(RuleError):
        publish(s, WORLD, org, e, version)
    assert (
        s["components"]["inventory"][iid]["org"] == org
        and not s["manufacturer"]["standards"]
    )
    for i in range(1, len(cohort)):
        stock(i)
    publish(s, WORLD, org, e, version)
    assert {r["entry"] for r in s["manufacturer"]["deliveries"].values()} == {
        c["id"] for c in cohort
    }
    assert {i["spec"] for i in s["components"]["inventory"].values()} == {version}
    assert not components.compatible(s, WORLD, e, base)
    with pytest.raises(RuleError):
        publish(s, WORLD, org, e, version)


def test_works_and_independent_client_prepaid_manufacturing():
    from .finance import market
    from .test_commercial import terms

    s = checkpoint(create(MAKER, "manufacturer"))
    factory = next(
        e
        for e, a in manufacturer.lines(WORLD, MAKER)
        if agreement(s, WORLD, e, a)["partnership"] == "works"
    )
    customer = WORLD["entries"][ENTRY]
    assert agreement(s, WORLD, customer, "engine")["partnership"] == "client"
    facilities.act(
        s,
        WORLD,
        MAKER,
        "rack",
        facilities.Lease(
            facility="shared:warehouse", start=s["date"], days=10, units=1, mode="lease"
        ),
    )
    for e in (factory, customer):
        bid = market.Bid(
            terms=terms(org=e["org"], sponsor=MAKER),
            supply=dict(
                product="engine",
                price_cents=500000,
                discount_cents=0,
                support=True,
                seat_cents=0,
                testing=False,
                development=True,
            ),
        )
        key = "signed-" + e["id"]
        market.sign_supply(
            s,
            WORLD,
            bid,
            market.Reply(
                offer=key,
                decision="accept",
                supply=True,
                sponsorship=False,
                support=True,
            ),
            key,
        )
        finance.settle(s)
        assert (key + ":delivery" in s["finance"]["instalments"]) == (e == customer)
        balance = finance.balance(s, MAKER)
        batch = manufacturer.commission(
            s,
            WORLD,
            MAKER,
            key + "/part",
            manufacturer.Work(
                entry=e["id"], year=2025, axis="engine", action="produce"
            ),
        )
        assert (
            batch["prepaid_cents"] == batch["cost_cents"]
            and finance.balance(s, MAKER) == balance
        )
        assert not any(k.startswith(key) for k in s["market"]["contracts"])


def test_controlled_load_cases_use_physical_profile():
    from .manufacturer.operating import operating_point
    from .components.catalog import OPENING

    tyre = next(d for d in OPENING.specs.values() if d["slot"] == "tyre")
    cases = [
        operating_point("tyre", tyre["parameters"], tyre["life_m"], mode)
        for mode in ("rated", "cold", "wet")
    ]
    rated, cold, wet = cases
    assert cold["warmup_energy_kj"] > rated["warmup_energy_kj"] == 0
    assert wet["contact_force_n"] / 0.75 < rated["contact_force_n"]


def test_npc_runs_repeated_research_design_validation_and_delivery():
    org = "supplier-xtrac"
    state = checkpoint(create())
    for day in range(65):
        review(state, WORLD, org, day)
        used = {}
        for subsystem in ("research", "development"):
            for project in state[subsystem]["projects"].values():
                if project["org"] == org and not project["finished"]:
                    work(state, WORLD, project, used)
        factory_day(state, WORLD, used)
        next_day(state)
    programs = [p for p in state["development"]["projects"].values() if p["org"] == org]
    assert any(p.get("report") for p in programs)
    assert any(p.get("disposition") == "withdrawn" for p in programs)
    assert any(p["kind"] == "design" and p["finished"] for p in programs)
    assert any(
        d["supplier"] == org for d in state["manufacturer"]["deliveries"].values()
    )
