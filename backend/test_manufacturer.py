"""Supplier programmes, serial custody, warranty and client-scoped evidence."""

import pytest
from . import components, finance, manufacturer, service, storage
from .app import manufacturer_desk
from .catalog import LINEUP_WORLD as WORLD
from .domain import RuleError
from .finance import facilities
from .manufacturer import support
from .manufacturer.context import agreement
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


def test_serial_delivery_ledger_equality_and_warranty():
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
        manufacturer.Work(entry=ENTRY, axis="engine", year=2025, action="produce"),
    )
    iid = b["id"] + "/unit-1"
    for _ in range(15):
        factory_day(s, WORLD, {})
        if s["production"]["items"].get(iid, {}).get("status") == "stock":
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
        case="claim", decision="compensate", reason="Брак подтверждён ОТК"
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
    s0 = finance.balance(s, client)
    support.resolve(s, WORLD, MAKER, decision)
    assert (
        finance.balance(s, client) - s0
        == balance - finance.balance(s, MAKER)
        == row["compensation_cents"]
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
    r = support.diagnosis(s, WORLD, hot)
    assert r["causes"]["cooling"] == r["causes"]["integration"] == ["hot"]
    assert not r["causes"]["design"] and not r["covered"] and 0 < r["confidence"] < 100
    review(s, WORLD, MAKER, 0)
    review(s, WORLD, MAKER, 1)
    assert {r["status"] for r in s["manufacturer"]["cases"].values()} == {
        "study",
        "decline",
    }
    assert len(s["research"]["projects"]) == 1 and not s["components"]["revisions"]
    s["date"] = "2025-07-02"
    assert not support.evidence(s, WORLD, hot)
