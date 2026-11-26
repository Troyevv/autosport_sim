import csv
from io import StringIO
from concurrent.futures import ThreadPoolExecutor
import pytest
from backend import service, storage, domain
from backend.catalog import WORLD
from backend.app import financial_statement, export_financial_statement
from backend.finance import PERSONAL
from backend.test_career import create, MCLAREN, advance


@pytest.fixture(autouse=True)
def database(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def command(c, action, **args):
    return service.Command(
        command_id=f"f-{c['revision']}",
        revision=c["revision"],
        action=action,
        finance=args,
    )


def test_transfer_retry_scopes_and_export():
    c = create(role="owner")
    program = MCLAREN + ":f1"
    req = command(
        c, "finance-transfer", payer=MCLAREN, recipient=program, amount_cents=1234567
    )
    with ThreadPoolExecutor(2) as pool:
        replies = list(pool.map(lambda _: service.execute(c["id"], req), range(2)))
    assert replies[0] == replies[1]
    r = financial_statement(c["id"], "consolidated")
    assert (
        r["cash_cents"] == c["account"]["cash_cents"]
        and r["cash_flow_cents"] == r["profit_cents"] == 0
    )
    assert financial_statement(c["id"], program)["cash_cents"] == 1234567
    rows = list(
        csv.reader(
            StringIO(
                export_financial_statement(c["id"], program).body.decode("utf-8-sig")
            )
        )
    )
    assert ["cash_cents", "1234567"] in rows
    doc = service.export_save(c["id"])
    restored = service.import_save(doc)
    assert service.export_save(restored["id"]) == doc
    assert financial_statement(restored["id"], "consolidated") == r
    m = create()
    with pytest.raises(domain.RuleError):
        financial_statement(m["id"], "group:" + MCLAREN)


def term(c, key, amount, due, earned=None, source="sponsorship", reserve=False):
    return dict(
        id=key,
        contract="partnership",
        payer=MCLAREN,
        recipient=MCLAREN + ":f1",
        amount_cents=amount,
        due=due,
        earned=earned or due,
        category=source,
        reserved=reserve,
    )


def confirm(c, *terms):
    evidence = dict(
        source="sponsor",
        reference="partnership",
        series="f1",
        regulation=WORLD["championships"]["f1"]["rules_id"],
        schedule=dict(installments=list(terms)),
    )
    return service.execute(c["id"], command(c, "finance-confirm", **evidence))


def test_advances_accrual_and_refund():
    c = create(role="owner")
    future = "2025-03-01"
    c = confirm(
        c,
        term(c, "advance", 411, c["date"], future),
        term(c, "loan", 98, c["date"], source="loan"),
    )
    program = MCLAREN + ":f1"
    before = financial_statement(c["id"], program)
    assert before["cash_cents"] == 509 and before["profit_cents"] == 0
    while c["date"] < future:
        c = advance(c)
    after = financial_statement(c["id"], program)
    assert after["profit_cents"] == 411
    req = command(c, "finance-cancel", installment="advance")
    c = service.execute(c["id"], req)
    assert service.execute(c["id"], req) == c
    after = financial_statement(c["id"], program)
    assert after["cash_cents"] == 98 and after["profit_cents"] == 0
    assert len([p for p in after["journal"] if p["key"] == "refund:advance"]) == 1


def test_insufficient_cash_preserves_debt_and_forecast_explains_deficit():
    c = create()
    amount = c["account"]["cash_cents"]
    due = "2025-03-01"
    c = confirm(c, term(c, "cost", amount + 1, due))
    report = financial_statement(c["id"])
    assert report["forecast"][0]["base_cents"] < 0
    with pytest.raises(domain.RuleError):
        confirm(
            c,
            term(c, "reserve1", amount, due, reserve=True),
            term(c, "reserve2", 1, due, reserve=True),
        )
    assert financial_statement(c["id"]) == report
    while c["date"] < due:
        c = advance(c)
    after = financial_statement(c["id"])
    assert after["overdue_cents"] == amount + 1 and not any(
        p["key"] == "due:cost" for p in after["journal"]
    )
    for wallet in [MCLAREN, PERSONAL]:
        s = financial_statement(c["id"], wallet)
        assert s["cash_cents"] == sum(row["delta_cents"] for row in s["journal"])


def test_payroll_forecast_matches_actual_and_personal_is_journaled():
    c = create()
    report = financial_statement(c["id"])
    projected = report["forecast"][0]
    while c["date"] < projected["date"]:
        c = advance(c)
    assert c["account"]["cash_cents"] == projected["base_cents"]
    assert (
        financial_statement(c["id"], PERSONAL)["journal"][-1]["delta_cents"]
        == c["player_cash_cents"]
        > 0
    )


def test_sqlite_and_portable_migration_of_financed_seat(tmp_path):
    c = create()
    with storage.transaction(True) as db:
        state = storage.checkpoint(db, c["id"])
        state.pop("finance")
        state.pop("market", None)
        db.execute(
            "DELETE FROM posting WHERE career=? AND (key='finance-opening' OR org='organizer:f3:2025:promotion' OR org LIKE 'brand:%')",
            (c["id"],),
        )
        storage.store(db, c["id"], state)
        old = service.checkpoint_document(db, c["id"])
        db.execute("PRAGMA user_version=10")
    restored = service.import_save(old)
    for cid in (c["id"], restored["id"]):
        with storage.transaction() as db:
            state = storage.checkpoint(db, cid)
            for wallet, amount in state["backers"].items():
                assert (
                    sum(p["delta_cents"] for p in storage.postings(db, cid, wallet))
                    == amount
                )
        assert service.export_save(cid)["payload"]["state"]["finance"]["since"] == 0


def test_reserved_payroll_matures_without_crediting_unpaid_salary():
    c = create()
    count = c["account"]["cash_cents"]
    c = service.execute(
        c["id"], command(c, "finance-reserve", account=MCLAREN, amount_cents=count)
    )
    while c["date"] < "2025-03-01":
        c = advance(c)
    assert c["player_cash_cents"] == 0
    report = financial_statement(c["id"])
    assert report["overdue_cents"] == c["account"]["payroll_cents"]
    assert report["profit_cents"] == -report["overdue_cents"]
    c = service.execute(
        c["id"], command(c, "finance-reserve", account=MCLAREN, amount_cents=0)
    )
    while financial_statement(c["id"])["overdue_cents"]:
        c = advance(c)
    assert c["player_cash_cents"] > 0
    archive = service.export_save(c["id"])
    assert archive == service.export_save(service.import_save(archive)["id"])


def test_in_kind_and_analyst_do_not_create_cash_or_profit():
    c = create(role="manufacturer", org="supplier-hewland", series="f2")
    r = financial_statement(c["id"])
    analyst = max(r["candidates"], key=lambda p: p["skill"])
    c = service.execute(c["id"], command(c, "finance-officer", person=analyst["id"]))
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-in-kind",
            contract="support",
            reference="delivery-1",
            payer=c["org"],
            recipient=MCLAREN,
            date=c["date"],
            description="Инструментальная диагностика",
            estimated_cents=20000,
        ),
    )
    s = financial_statement(c["id"])
    assert (
        s["width"] < r["width"]
        and s["journal"] == r["journal"]
        and s["profit_cents"] == 0
    )
    assert s["in_kind"][0]["estimated_cents"] == 20000


def test_promotion_prize_rolls_down_to_eligible_f2_drivers_only():
    from backend.finance.series import F3_FUND, award, PromotionAwards

    c = create()
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    entries = [
        (aid, s["person"])
        for aid, s in WORLD["assignments"].items()
        if s["series"] == "f2" and s["position"] == "driver"
    ][:5]
    state["date"] = "2026-02-01"
    for place, (aid, pid) in enumerate(entries, 2):
        state["people"][pid]["credentials"].setdefault("classifications", {})[
            "f3-2025"
        ] = {"place": place}
        state["seats"][aid][-1]["end"] = "2027-01-01"
    order = PromotionAwards(
        classification="published-2025", successor_entries=[pid for _, pid in entries]
    )
    award(state, WORLD, order)
    award(state, WORLD, order)
    assert state["finance"]["pockets"][F3_FUND] == 0
    assert state["finance"]["pockets"]["driver:" + entries[0][1]] == 30000000
    assert sum(p["delta_cents"] for p in state["ledger"]) == 0


def test_operating_categories_and_capital_use_the_same_settlement():
    from typing import get_args
    from backend.finance import Category, CAPITAL

    c = create(role="owner")
    keys = list(get_args(Category))
    c = confirm(c, *(term(c, k, 59, c["date"], source=k) for k in keys))
    r = financial_statement(c["id"], MCLAREN + ":f1")
    assert r["cash_cents"] == 59 * len(keys)
    assert r["profit_cents"] == 59 * len(set(keys) - CAPITAL)
    assert r["net_financial_assets_cents"] == r["cash_cents"]
    assert financial_statement(c["id"], "consolidated")["profit_cents"] == 0
