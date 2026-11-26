import pytest
from backend import service, storage, domain
from backend.catalog import WORLD
from backend.finance import budget
from backend.app import budget_control
from backend.test_career import create, MCLAREN
from backend.test_finance import command


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_owner_revisions_never_mint_cash():
    c = create(role="owner")
    before = c["account"]["cash_cents"]
    c = service.execute(c["id"], command(c, "finance-budget-review"))
    v = budget_control(c["id"])
    proposal = v["requests"][-1]
    amounts = dict(proposal["allocations"])
    amounts["reserve"] += 290000
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-budget-decide",
            proposal=proposal["id"],
            response="adjust",
            allocations=amounts,
            reason="Резерв логистики",
        ),
    )
    assert (
        c["account"]["cash_cents"] == before
        and budget_control(c["id"])["plan"]["allocations"] == amounts
    )
    c = service.execute(c["id"], command(c, "finance-budget-review"))
    k = budget_control(c["id"])["requests"][-1]["id"]
    c = service.execute(
        c["id"],
        command(
            c,
            "finance-budget-decide",
            proposal=k,
            response="reject",
            reason="Достаточный резерв",
        ),
    )
    assert budget_control(c["id"])["plan"]["allocations"] == amounts
    assert service.export_save(
        service.import_save(service.export_save(c["id"]))["id"]
    ) == service.export_save(c["id"])


def test_shared_atr_and_actual_budget_expense():
    c = create()
    target = next(t for t in c["targets"] if t["target_season"] == "f1-2025")

    def project(t, key, n):
        return command(
            c,
            "finance-project-cost",
            project=key,
            program=t["program"],
            target_season=t["target_season"],
            generation=t["generation"],
            amount_cents=7023,
            due="2025-02-02",
            atr={"runs": n},
        )

    runs = c["atr"]["limits"]["runs"]
    c = service.execute(c["id"], project(target, "now", runs - 1))
    future = next(t for t in c["targets"] if t["target_season"] == "f1-2026")
    with pytest.raises(domain.RuleError, match="квоты"):
        service.execute(c["id"], project(future, "next", 2))
    c = service.execute(c["id"], project(future, "next", 1))
    assert (
        c["atr"]["used"]["runs"] == runs
        and c["account"]["development_reserved_cents"] == 14046
    )


def test_restrictions_audit_classification_and_non_f1():
    c = create()
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    s["ledger"] = []
    v = budget.report(s, WORLD, MCLAREN, 2025)
    limit = v["cap"]["limit_cents"]
    data = (
        s["control"]["actual"]
        .setdefault(MCLAREN, {})
        .setdefault("2025", dict(categories={}, relevant=0, drivers=0, staff={}))
    )
    data.update(
        relevant=limit + 100, drivers=20, staff={"a": 10, "b": 10, "c": 10, "d": 5}
    )
    assert budget.report(s, WORLD, MCLAREN, 2025)["cap"]["remaining_cents"] == -50
    with pytest.raises(domain.RuleError, match="Cost Cap"):
        budget.authorize(s, WORLD, MCLAREN, "engineering", 1, s["date"])
    budget.authorize(s, WORLD, MCLAREN, "marketing", 1, s["date"])
    s["date"] = "2026-01-01"
    budget.tick(s, WORLD)
    assert s["control"]["audits"][MCLAREN + ":2025"]["fine_cents"] == 25
    assert budget.report(s, WORLD, MCLAREN, 2026)["cap"] is None
    assert (
        budget.cap_rule(
            WORLD,
            next(
                x
                for x in s["accounts"]
                if x not in WORLD["engineering"]["atr"]["opening_rank"]
            ),
            2025,
        )
        is None
    )
    s["date"] = "2025-08-10"
    scope = budget.scope_for(s, WORLD, MCLAREN)
    assert scope["limits"] is None
    budget.determination(
        s,
        WORLD,
        budget.Ranking(
            org=MCLAREN, rank=2, period=scope["period"]["id"], reference="certified"
        ),
    )
    assert budget.scope_for(s, WORLD, MCLAREN)["percent"] == 75
