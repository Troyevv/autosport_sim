from dataclasses import replace

import pytest
from backend import service
from backend.catalog import WORLD
from backend.supply import (
    ObservationScope,
    SupportAssignment,
    tyre_eligible,
    visible_channels,
)


def test_market_modes_and_world():
    rules = WORLD["championships"]["wec"]["tyre_market"]
    assert tyre_eligible(rules["Hypercar"], "supplier-michelin", homologated=True)
    assert not tyre_eligible(rules["LMGT3"], "supplier-michelin", homologated=True)
    approved = {
        "mode": "approved",
        "approved_suppliers": ["supplier-michelin", "supplier-goodyear"],
    }
    assert tyre_eligible(approved, "supplier-goodyear", homologated=True)
    assert not tyre_eligible(approved, "supplier-pirelli", homologated=True)
    assert not tyre_eligible({"mode": "open"}, "supplier-pirelli", homologated=False)
    assert tyre_eligible({"mode": "open"}, "supplier-pirelli", homologated=True)
    with pytest.raises(ValueError):
        tyre_eligible(
            {**approved, "mode": "sole"}, "supplier-goodyear", homologated=True
        )
    for e in WORLD["entries"].values():
        supplier = WORLD["cars"][e["car"]]["suppliers"]["tyre"]
        assert tyre_eligible(
            WORLD["championships"][e["championship"]]["tyre_market"][e["category"]],
            supplier,
            homologated=True,
        )


def test_manufacturer_has_advisors_and_correct_jobs(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    c = service.create(
        service.CareerInput(
            name="Ирина",
            role="manufacturer",
            org="supplier-pirelli",
            series="dtm",
            seed=9,
        )
    )
    jobs = {a["position"] for a in c["assignments"]}
    assert "tyres" in jobs and "technical-advisor" in jobs and "engines" not in jobs
    assert c["atr"] is None
    assert c["briefing_action"] == "confirm-supply"


def test_session_scope_excludes_competitors_other_clients_and_truth():
    a = SupportAssignment(
        id="a",
        advisor="advisor",
        employer="maker",
        client="team",
        agreement="support-1",
        product="tyre",
        start="2025-02-01",
        end_exclusive="2025-09-01",
        channels=frozenset(["temperature", "wear"]),
        salary_cents=300000,
        allocation_percent=50,
    )
    for kind in ["test", "practice", "qualifying", "race"]:
        o = ObservationScope(
            "team", "car", kind + "-session", kind, "maker", "tyre", "spec-v1", "set-1"
        )
        assert not visible_channels(
            a, replace(o, car=""), "2025-02-01", "maker", ["wear"]
        )
        assert visible_channels(
            a, o, "2025-02-01", "maker", ["temperature", "strategy", "failure_truth"]
        ) == {"temperature"}
        assert not visible_channels(a, o, "2025-09-01", "maker", ["temperature"])
        assert not visible_channels(a, o, "2025-02-01", "competitor", ["temperature"])
    for invalid in (
        {"end_exclusive": a.start},
        {"client": a.employer},
        {"salary_cents": -1},
        {"allocation_percent": 101},
        {"agreement": ""},
    ):
        with pytest.raises(ValueError):
            replace(a, **invalid)
    other = ObservationScope(
        "other", "car", "s", "race", "maker", "tyre", "spec-v1", "set-2"
    )
    assert not visible_channels(a, other, "2025-02-01", "maker", ["wear"])
