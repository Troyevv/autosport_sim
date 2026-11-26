import pytest
from backend import service, storage, domain
from backend.app import capital_overview, financial_statement
from backend.finance import capital as m, Instalment, Schedule, register, settle
from backend.catalog import WORLD
from backend.test_career import create, MCLAREN
from backend.test_finance import command


@pytest.fixture(autouse=True)
def database(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_capital_sources_loan_restructure_and_payoff():
    c = create(role="owner")
    cash = c["account"]["cash_cents"]
    c = service.execute(
        c["id"], command(c, "finance-invest", source="owner", amount_cents=15000)
    )
    c = service.execute(
        c["id"], command(c, "finance-loan", principal_cents=1234567, months=5)
    )
    d = capital_overview(c["id"])["loans"][0]
    assert (
        c["account"]["cash_cents"] == cash + 15000 + 1234567
        and financial_statement(c["id"])["profit_cents"] == 0
    )
    c = service.execute(c["id"], command(c, "finance-restructure", loan=d["id"]))
    c = service.execute(c["id"], command(c, "finance-repay", loan=d["id"]))
    assert capital_overview(c["id"])["loans"][0]["remaining_cents"] == 0
    c = service.execute(
        c["id"], command(c, "finance-equity", basis_points=1200, issue=True)
    )
    assert capital_overview(c["id"])["shares"][m.INVESTOR] == 1200
    c = service.execute(c["id"], command(c, "finance-dividend", amount_cents=123))
    assert financial_statement(c["id"])["profit_cents"] == 0
    doc = service.export_save(c["id"])
    assert service.export_save(service.import_save(doc)["id"]) == doc


def test_asset_program_sale_replacement_keeps_identity():
    c = create(role="owner")
    c = service.execute(
        c["id"], command(c, "finance-build", kind="logistics", country="ES")
    )
    a = capital_overview(c["id"])["assets"][0]
    c = service.execute(
        c["id"], command(c, "finance-asset", asset=a["id"], side="sell")
    )
    c = service.execute(c["id"], command(c, "finance-asset", asset=a["id"], side="buy"))
    p = capital_overview(c["id"])["programs"][0]
    c = service.execute(
        c["id"], command(c, "finance-program-sale", program=p["id"], side="sell")
    )
    assert capital_overview(c["id"])["programs"][0]["org"] == m.INVESTOR
    c = service.execute(
        c["id"], command(c, "finance-program-sale", program=p["id"], side="buy")
    )
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-program-admission",
            program=p["id"],
            organization=MCLAREN,
            decision="admit",
            regulation=WORLD["championships"]["f1"]["rules_id"],
            reference="licence-1",
        ),
    )
    assert capital_overview(c["id"])["programs"][0]["id"] == p["id"]
    assert capital_overview(c["id"])["programs"][0]["status"] == "admitted"


def test_default_has_real_consequences_and_cannot_fund_another_team():
    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    s["ledger"] = []
    amt = s["accounts"][MCLAREN]["cash_cents"] + 10
    register(
        s,
        Schedule(
            installments=[
                Instalment(
                    id="unpaid",
                    contract="supplier",
                    payer=MCLAREN,
                    recipient=m.BANK,
                    amount_cents=amt,
                    category="supply",
                    earned=s["date"],
                    due=s["date"],
                )
            ]
        ),
    )
    settle(s)
    s["date"] = "2025-04-01"
    m.tick(s, WORLD)
    assert m.projection(s, WORLD)["crisis"]["status"] == "insolvent"
    assert any(
        r.get("exit_reason") == "insolvency"
        for rows in s["seats"].values()
        for r in rows
    )
    s["date"] = "2025-10-01"
    m.tick(s, WORLD)
    assert (
        m.projection(s, WORLD)["crisis"]["status"] == "bankrupt" and s["ledger"] == []
    )
    assert all(p["status"] == "closed" for p in m.projection(s, WORLD)["programs"])
    with pytest.raises(domain.RuleError):
        m.act(s, WORLD, MCLAREN, "loan", m.Loan(principal_cents=5, months=2))
