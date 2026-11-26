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


def test_season_portfolios_and_entry_scoped_rights():
    from collections import Counter
    from backend.finance import rights

    c = create()
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    deals = state["market"]["contracts"]
    budgets = state["market"]["budgets"]
    registered = [(brand, org) for brand, org, *_ in market.season_deals()]
    assert len(set(registered)) == len(registered)
    assert {(d["sponsor"], d["org"]) for d in deals.values()} == set(registered)
    committed = Counter()
    coverage = set()
    for d in deals.values():
        assert d["source"].startswith("https://")
        assert set(d["program_series"]) <= set(
            WORLD["organizations"][d["org"]]["programs"]
        )
        coverage.update(d["program_series"])
        schedule = [
            r
            for r in state["finance"]["instalments"].values()
            if r["contract"] == d["id"]
        ]
        assert sum(r["amount_cents"] for r in schedule) == d["fixed_cents"]
        committed[d["sponsor"]] += d["fixed_cents"]
    assert coverage == set(WORLD["championships"])
    assert all(cents <= budgets[k] for k, cents in committed.items())
    assert sum(market.opening_budgets().values()) == sum(
        b["budget_cents"] for b in market.BRANDS.values()
    )
    tricorp = [
        d
        for d in deals.values()
        if d["sponsor"] == "tricorp" and d["org"] == "team-van-amersfoort-racing"
    ]
    assert len(tricorp) == 1 and len(tricorp[0]["program_series"]) == 4
    for b, eid in (("bwt", "dtm-22"), ("windhager", "dtm-84")):
        d = deals["partner-2025:" + b + ":team-mercedes-amg-team-landgraf"]
        assert rights.entries(state, WORLD, d) == [eid]
        assert {r["entry"] for r in rights.audit(state, WORLD, d)} == {eid}
    state["date"] = "2025-04-01"
    market.tick(state, WORLD)
    from backend.finance import settle

    settle(state)
    journal = list(state["ledger"])
    settle(state)
    assert state["ledger"] == journal


def test_calendar_year_marketing_ceiling_preserves_earned_bonus():
    from backend.finance import settle, sponsorship_spend

    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    sponsor = "seiko"
    wallet = market.payer(sponsor)
    s["market"]["budgets"][sponsor] = 10000
    t = market.Terms(
        **terms(
            sponsor=sponsor,
            fixed_cents=10000,
            advance_cents=10000,
            bonus_cents=500,
            rights=[],
            appearances=0,
        )
    )
    market.sign_sponsor(s, WORLD, t, "limited")
    settle(s)
    market.result_bonus(s, WORLD, "driver", "f1-4", "result", s["date"], 1)
    bonus = s["finance"]["instalments"]["limited:bonus:f1-4:result"]
    assert bonus["status"] == "pending"
    assert sponsorship_spend(s, wallet, "2025", include_pending=False) == 10000
    s["date"] = "2026-01-01"
    settle(s)
    settle(s)
    assert bonus["status"] == "paid"
    assert sponsorship_spend(s, wallet, "2026", include_pending=False) == 500


def test_two_future_contracts_cannot_sell_one_annual_budget_twice():
    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    s["market"]["budgets"]["seiko"] = 10000
    t = market.Terms(
        **terms(
            sponsor="seiko",
            start="2026-01-01",
            end="2026-12-31",
            fixed_cents=8000,
            advance_cents=0,
        )
    )
    market.sign_sponsor(s, WORLD, t, "first")
    with pytest.raises(domain.RuleError, match="годовой бюджет"):
        market.sign_sponsor(
            s, WORLD, t.model_copy(update={"org": "team-scuderia-ferrari"}), "second"
        )
    assert "second" not in s["market"]["contracts"]
