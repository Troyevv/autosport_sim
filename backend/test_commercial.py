from copy import deepcopy
import pytest
from backend import domain, service, storage
from backend.catalog import WORLD
from backend.finance import market
from backend.test_career import create, MCLAREN
from backend.test_finance import command
from backend.app import commercial_market, financial_statement


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def terms(org=MCLAREN, sponsor="oracle", series="f1", **kwargs):
    return dict(
        dict(
            org=org,
            sponsor=sponsor,
            series=series,
            role="partner",
            start="2025-02-01",
            end="2025-10-01",
            fixed_cents=200000,
            advance_cents=10000,
            interval=3,
            bonus_cents=4000,
            podium=3,
            rights=[dict(zone="garage", share=60)],
            exclusive=False,
            appearances=2,
            reputation=1,
            compensation_cents=12000,
        ),
        **kwargs,
    )


def test_counteroffer_and_limited_market():
    c = create()
    t = terms(fixed_cents=10**12)
    c = service.execute(c["id"], command(c, "finance-bid", terms=t))
    offer = commercial_market(c["id"])["offers"][-1]
    assert (
        offer["status"] == "counter"
        and offer["terms"]["fixed_cents"] < t["fixed_cents"]
    )
    req = command(c, "finance-bid-reply", offer=offer["id"], decision="accept")
    c = service.execute(c["id"], req)
    assert service.execute(c["id"], req) == c
    deal = next(
        d
        for d in commercial_market(c["id"])["contracts"]
        if d["id"] == offer["id"] + ":sponsor"
    )
    assert deal["id"] == offer["id"] + ":sponsor"
    assert c["account"]["cash_cents"] == sum(p["delta_cents"] for p in c["ledger"])
    assert len([p for p in c["ledger"] if p["source"] == "sponsorship"]) == 1
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    assert market.funds(state, t["sponsor"]) < state["market"]["budgets"][t["sponsor"]]
    assert any(v["fact"]["kind"] == "commercial" for v in state["work_log"].values())
    doc = service.export_save(c["id"])
    assert service.export_save(service.import_save(doc)["id"]) == doc


def test_manufacturer_partial_supply_and_subsidy():
    c = create()
    t = terms(sponsor="supplier-mercedes", role="technical")
    supply = dict(
        product="engine",
        price_cents=100000,
        discount_cents=80000,
        support=True,
        seat_cents=0,
        testing=True,
        development=True,
    )
    c = service.execute(c["id"], command(c, "finance-bid", terms=t, supply=supply))
    o = commercial_market(c["id"])["offers"][-1]
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-bid-reply",
            offer=o["id"],
            decision="accept",
            sponsorship=False,
            supply=True,
            discount=True,
            support=True,
            testing=False,
            development=True,
        ),
    )
    result = commercial_market(c["id"])
    d = result["supplies"][0]
    assert d["sale_cents"] == 20000 and "cost_cents" not in d
    assert (
        d["development"]
        and not d["testing"]
        and not any(r["id"].startswith(o["id"]) for r in result["contracts"])
    )
    assert financial_statement(c["id"])["contracts"][d["id"]] == -20000
    with storage.transaction() as db:
        out = storage.postings(db, c["id"], "supplier-mercedes")
    assert sum(p["delta_cents"] for p in out if d["id"] in p["key"]) == 20000 - 68000


def test_competing_reservations_expiry_and_rejection():
    c = create()
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    bid = "seiko"
    state["market"]["budgets"][bid] = 1000000
    first = market.Terms(**terms(sponsor=bid, fixed_cents=700000, exclusive=True))
    market.sign_sponsor(state, WORLD, first, "a")
    rival = first.model_copy(
        update={"org": "team-scuderia-ferrari", "fixed_cents": 400000}
    )
    before = deepcopy(state["finance"]["instalments"])
    with pytest.raises(domain.RuleError):
        market.sign_sponsor(state, WORLD, rival, "b")
    assert state["finance"]["instalments"] == before
    second = market.Terms(**terms(sponsor="tudor", exclusive=True))
    assert market.conflict(state, WORLD, second)
    state["date"] = first.end
    market.tick(state, WORLD)
    assert state["market"]["contracts"]["a"]["status"] == "expired"


def test_bid_cannot_spend_twice_or_change_supply_by_counterpart():
    c = create()
    t = terms(sponsor="supplier-mercedes", fixed_cents=100000)
    c = service.execute(c["id"], command(c, "finance-bid", terms=t))
    o = commercial_market(c["id"])["offers"][-1]
    with pytest.raises(domain.RuleError):
        service.execute(
            c["id"],
            command(
                c, "finance-bid-reply", offer=o["id"], decision="accept", supply=True
            ),
        )
    assert service.load(c["id"]) == c
    invalid = terms(sponsor="supplier-ferrari")
    with pytest.raises(domain.RuleError):
        service.execute(
            c["id"],
            command(
                c,
                "finance-bid",
                terms=invalid,
                supply=dict(
                    product="engine",
                    price_cents=20000,
                    discount_cents=0,
                    support=False,
                    seat_cents=0,
                    testing=True,
                    development=False,
                ),
            ),
        )
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-bid-reply",
            offer=o["id"],
            decision="counter",
            counter={"terms": {**t, "bonus_cents": 3000}},
        ),
    )
    r = commercial_market(c["id"])
    assert any(len(o["history"]) > 1 for o in r["offers"])
