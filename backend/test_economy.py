import pytest
from backend import service, domain, storage, employment
from backend.app import economy_overview, commercial_market
from backend.catalog import WORLD
from backend.finance import economy, capital, market
from backend.test_career import create, MCLAREN, advance
from backend.test_commercial import terms
from backend.test_finance import command


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_sold_units_regional_evidence_and_loss_are_reconciled():
    c = create()
    driver = next(a["person"] for a in c["assignments"] if a["position"] == "driver")
    req = command(
        c,
        "finance-regional-receipt",
        reference="broadcast",
        person=driver,
        org=MCLAREN,
        country="GB",
        day=c["date"],
        kind="interview",
        source="editorial-publication",
        reach=55000,
    )
    c = service.execute(c["id"], req)
    assert service.execute(c["id"], req) == c
    c = service.execute(
        c["id"],
        command(
            c, "finance-distribution", region="GB", offer="standard", unit_cents=1129
        ),
    )
    while c["date"] < "2025-03-01":
        c = advance(c)
    data = economy_overview(c["id"])
    r = data["sales"]["2025"]
    assert r["units"] > 0 and r["cost_cents"] - r["revenue_cents"] == r["units"]
    with storage.transaction() as db:
        postings = storage.postings(db, c["id"], MCLAREN)
        indexed = db.execute(
            "select access from stat_fact where career=? and kind='financial-year' and owner=?",
            (c["id"], MCLAREN),
        ).fetchall()
    assert any(
        p["delta_cents"] == -r["units"] and p["source"] == "marketing" for p in postings
    )
    assert len(indexed) == 1 and indexed[0]["access"] == "internal"
    doc = service.export_save(c["id"])
    assert doc == service.export_save(service.import_save(doc)["id"])


def test_supplier_costs_and_partial_package_evidence():
    c = create()
    t = terms(sponsor="supplier-mercedes", role="technical")
    order = command(
        c,
        "finance-bid",
        terms=t,
        supply=dict(
            product="engine",
            price_cents=100000,
            discount_cents=80000,
            support=True,
            seat_cents=0,
            testing=False,
            development=False,
        ),
    )
    c = service.execute(c["id"], order)
    offer = commercial_market(c["id"])["offers"][-1]
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-bid-reply",
            offer=offer["id"],
            decision="accept",
            sponsorship=False,
            supply=True,
            support=True,
            discount=True,
        ),
    )
    key = offer["id"] + ":supply"
    args = dict(
        reference="claim",
        contract=key,
        category="warranty",
        amount_cents=2500,
        day=c["date"],
        units=2,
        authorization="accepted-claim",
    )
    c = service.execute(c["id"], command(c, "finance-supplier-work", **args))
    with pytest.raises(domain.RuleError):
        service.execute(
            c["id"],
            command(
                c,
                "finance-supplier-work",
                **dict(args, reference="design", category="research"),
            ),
        )
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    margin = economy.supplier_projection(s, "supplier-mercedes")[0]
    assert (
        margin["margin_cents"] == -50500
        and margin["units"] == 2
        and margin["service_costs"]["warranty"] == 2500
    )
    policy = market.Homologation(
        reference="disabled",
        provider="supplier-goodyear",
        entry="f1-4",
        product="tyre",
        regulation=WORLD["championships"]["f1"]["rules_id"],
        start=c["date"],
        end="2026-01-01",
    )
    with pytest.raises(domain.RuleError):
        market.homologate(s, WORLD, policy)


def test_registered_program_waits_for_admission():
    c = create(role="owner")
    key = MCLAREN + ":junior-test"
    data = dict(
        program=key,
        organization=MCLAREN,
        regulation=WORLD["championships"]["f3"]["rules_id"],
    )
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-program-register",
            **data,
            reference="registration",
            series="f3",
            capital_cents=34000,
        ),
    )
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    assert (
        s["capital"]["programs"][key]["status"] == "withdrawn"
        and s["finance"]["pockets"][key] == 34000
    )
    capital.integration(
        s, WORLD, capital.Admission(**data, reference="admission", decision="admit")
    )
    assert s["capital"]["programs"][key]["status"] == "admitted"


def test_monthly_command_does_not_create_sporting_results():
    c = create(role="owner")
    with pytest.raises(domain.RuleError):
        service.execute(c["id"], command(c, "finance-month"))
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    s["ledger"] = []
    employment.advance(s, WORLD, "2026-01-01")
    before = {k: dict(v) for k, v in s["starts"].items()}
    domain.apply(s, WORLD, "finance-month", {})
    assert s["date"] == "2026-02-01" and s["starts"] == before and not s["pending"]
