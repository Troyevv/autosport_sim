from copy import deepcopy
import pytest
from backend import domain, service, storage
from backend.app import career_garage, commercial_rights
from backend.catalog import WORLD
from backend.finance import market, rights
from backend.livery import GARAGE
from backend.test_career import create, MCLAREN
from backend.test_finance import command
from backend.test_commercial import terms


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_title_livery_and_off_car_inventory_roundtrip():
    c = create()
    t = terms(
        sponsor="canon",
        role="title",
        rights=[dict(zone="nose", share=30), dict(zone="press", share=40)],
    )
    c = service.execute(c["id"], command(c, "finance-bid", terms=t))
    c = service.execute(
        c["id"],
        command(c, "finance-bid-reply", offer="commercial:1", decision="accept"),
    )
    key = "commercial:1:sponsor"
    assert c["org"] == MCLAREN and c["team_names"][MCLAREN].endswith("Canon")

    def checks():
        return next(r for r in commercial_rights(c["id"]) if r["contract"] == key)[
            "items"
        ]

    assert not any(r["fulfilled"] for r in checks())
    g = career_garage(c["id"])
    assert "canon" in g["entries"]["f1-4"]["allowed_assets"]
    assert g["sponsors"]["canon"]["text"] == "Canon"
    paint = deepcopy(GARAGE["entries"]["f1-4"]["livery"])
    paint["decals"].append(
        dict(asset="canon", zone="nose", x=0.5, y=0.5, scale=0.45, angle=0)
    )
    c = service.execute(
        c["id"],
        service.Command(
            command_id="livery",
            action="save-livery",
            revision=c["revision"],
            paint=dict(entry="f1-4", livery=paint),
        ),
    )
    c = service.execute(
        c["id"], command(c, "finance-mount", contract=key, zone="press", scale=60, x=50)
    )
    assert {(r["entry"], r["fulfilled"]) for r in checks()} == {
        ("f1-4", True),
        ("f1-81", False),
        (None, True),
    }
    doc = service.export_save(c["id"])
    imported = service.import_save(doc)
    assert commercial_rights(imported["id"]) == commercial_rights(c["id"])
    c = service.execute(c["id"], command(c, "finance-end-deal", contract=key))
    assert (
        MCLAREN not in c["team_names"]
        and "canon" not in career_garage(c["id"])["entries"]["f1-4"]["allowed_assets"]
    )


def test_competing_exclusive_space_and_actual_bonus():
    c = create()
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    t = market.Terms(**terms(sponsor="canon", rights=[dict(zone="nose", share=45)]))
    d = market.sign_sponsor(state, WORLD, t, "new")
    rival = market.Terms(**terms(sponsor="seiko", rights=[dict(zone="nose", share=55)]))
    with pytest.raises(domain.RuleError):
        market.sign_sponsor(state, WORLD, rival, "rival")
    market.result_bonus(state, WORLD, "driver", "f1-4", "race", state["date"], 2)
    assert not any("due:new:bonus:" in p["key"] for p in state["ledger"])
    paint = deepcopy(GARAGE["entries"]["f1-4"]["livery"])
    paint["decals"].append(
        dict(asset="canon", zone="nose", x=0.5, y=0.5, scale=0.6, angle=0)
    )
    state["liveries"] = {"f1-4": paint}
    market.result_bonus(state, WORLD, "driver", "f1-4", "race", state["date"], 2)
    market.result_bonus(state, WORLD, "driver", "f1-4", "race", state["date"], 2)
    assert [
        p["delta_cents"]
        for p in state["ledger"]
        if p["org"] == MCLAREN and "due:new:bonus:" in p["key"]
    ] == [d["bonus_cents"]]
    paint["decals"][-1]["angle"] = 90
    assert not rights.audit(state, WORLD, d, "f1-4")[0]["fulfilled"]
