"""Fleet coverage follows serials, signed specifications and workshop receipts."""

import pytest

from . import components, development, research, service
from .app import programme_desk
from .catalog import LINEUP_WORLD as WORLD
from .production import workshop
from .programme import packages, rules
from .test_career import advance, create
from .test_components import order as fit
from .test_development import design, rent, until_finished
from .test_production import order as manufacture
from .test_programme import send
from .test_research import checkpoint


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_rollout_two_cars_shortage_fit_removal_workshop_and_portable_save(monkeypatch):
    # First inspection misses a serial defect, reinspection detects it (#48).
    monkeypatch.setattr(
        workshop,
        "draw",
        lambda state, key, purpose: {
            "serial": 0,
            "inspection-1": 900,
            "inspection-2": 0,
        }.get(purpose, 999),
    )
    c = rent(create(), "design")
    card = programme_desk(c["id"])["plans"][0]["packages"][0]
    pkg = card["id"]
    base = card["baselines"]["floor"]
    c = until_finished(design(c, base), 1)
    project = next(
        p
        for p in checkpoint(c)["development"]["projects"].values()
        if p["baseline"] == base
    )
    version = project["specification"]
    for count, (baseline, candidate) in enumerate(
        [
            (base, version),
            (card["baselines"]["suspension"], card["baselines"]["suspension"]),
        ],
        2,
    ):
        c = send(
            c,
            "development-test",
            entry="f1-4",
            baseline=baseline,
            candidate=candidate,
            priority="normal",
            method="calculation",
        )
        c = until_finished(c, count)
    c = send(c, "development-review", project=project["id"], disposition="released")
    c = rent(rent(c, "factory"), "quality")

    def coverage(c):
        plan = programme_desk(c["id"])["plans"][0]
        card = next(p for p in plan["packages"] if p["id"] == pkg)
        return card, next(p for p in card["parts"] if p["axis"] == "floor")

    def produce_one(c):
        c = manufacture(c, version)
        for _ in range(8):
            c = advance(c)
            _, part = coverage(c)
            if part["serials"]:
                return c, part
        pytest.fail(str(part))

    card, part = coverage(c)
    assert card["installed"] == 2 and card["required"] == 4
    assert part["action"]["payload"]["quantity"] == 2
    c, part = produce_one(c)
    first = part["serials"][0]
    assert not part["ready"] and part["action"]["payload"]["quantity"] == 1
    assert [(f["entry"], f["instance"]) for f in part["fits"]] == [("f1-4", first)]
    c = service.execute(c["id"], fit(c, first))
    card, part = coverage(c)
    assert (
        card["installed"] == 3 and card["ready"] == 1 and "частично" in card["advice"]
    )
    assert part["serials"] == part["fits"] == [] and part["inventory"] == {
        "installed": 1
    }
    assert [r["status"] for r in part["targets"]] == ["installed", "waiting"]
    assert part["action"]["payload"]["quantity"] == 1
    saved = service.export_save(c["id"])
    restored = service.import_save(saved)
    assert service.export_save(restored["id"]) == saved
    assert coverage(restored) == (card, part)
    c, part = produce_one(restored)
    second = part["serials"][0]
    assert second != first and part["ready"] and not part["action"]
    assert [f["entry"] for f in part["fits"]] == ["f1-81"]
    c = service.execute(c["id"], fit(c, second, "f1-81"))
    card, part = coverage(c)
    assert card["installed"] == card["required"] == 4 and card["ready"] == 2
    assert [r["instance"] for r in part["targets"]] == [first, second]
    assert not part["fits"] and not part["serials"]
    old = components.parts_for(checkpoint(c)).installed["f1-4"]["floor"]
    c = service.execute(c["id"], fit(c, old))
    card, part = coverage(c)
    assert card["installed"] == 3 and part["serials"] == [first]
    c = send(c, "production-disposition", instance=first, decision="inspect")
    _, part = coverage(c)
    assert (
        part["status"] == "Контроль качества"
        and not part["serials"]
        and not part["action"]
    )
    c = advance(c)
    assert checkpoint(c)["production"]["items"][first]["rejected"]
    c = send(c, "production-disposition", instance=first, decision="repair")
    _, part = coverage(c)
    assert part["status"] == "Ремонт" and not part["ready"] and not part["fits"]
    c = send(c, "production-disposition", instance=first, decision="scrap")
    _, part = coverage(c)
    assert part["inventory"] == {"scrapped": 1, "installed": 1}
    assert not part["serials"] and part["action"]["payload"]["quantity"] == 1
    assert coverage(service.import_save(service.export_save(c["id"]))) == coverage(c)


def test_wec_crews_and_overlapping_packages_share_serials_once():
    s = checkpoint(create("team-ferrari-af-corse", series="wec"))
    e = WORLD["entries"]["wec-50"]
    org = e["org"]
    s["council"]["mandates"][org] = dict(
        mode="full", limit_cents=10**8, allow_rent=True, focus="balanced"
    )
    plan = rules.dossier(s, WORLD, e, 2025)
    pkg = packages.package(s, WORLD, e, plan)
    axis = pkg["axes"][0]
    version = pkg["baselines"][axis]
    test = development.commission(
        s,
        WORLD,
        org,
        "qualify",
        development.TestOrder(
            entry=e["id"],
            baseline=version,
            candidate=version,
            method="calculation",
            priority="normal",
        ),
    )
    research.work(s, WORLD, test, {})
    assert test["report"]
    other = dict(pkg, id="package-second-rollout", goal="Второй этап внедрения")
    s["programme"]["packages"][other["id"]] = other

    def books():
        return next(
            cards
            for _, dossier, _, cards in packages.portfolios(s, WORLD, org)
            if dossier["year"] == 2025
        )

    active, overlap = books()
    first, second = active["parts"][0], overlap["parts"][0]
    assert set(r["entry"] for r in first["targets"]) == {"wec-50", "wec-51"}
    assert (
        len(WORLD["entries"]["wec-50"]["crew"])
        == len(WORLD["entries"]["wec-51"]["crew"])
        == 3
    )
    assert (
        active["required"] == 4
        and active["installed"] == 2
        and not overlap["installed"]
    )
    assert all(
        r["status"] == "shared" and r["package"] == pkg["id"] for r in second["targets"]
    )
    assert not second["serials"] and not second["fits"] and not second["action"]
    # Make both mounted assemblies unserviceable; only the one real spare is eligible.
    for r in first["targets"]:
        iid = r["instance"]
        s["components"]["condition"][iid] = dict(
            components.condition(s, iid), damaged=True
        )
    active, overlap = books()
    first, second = active["parts"][0], overlap["parts"][0]
    assert not active["installed"] and not overlap["installed"]
    assert (
        len(first["serials"]) == len(first["fits"]) == 1
        and first["action"]["payload"]["quantity"] == 1
    )
    assert (
        not second["ready"]
        and not second["serials"]
        and not second["fits"]
        and not second["action"]
    )
    assert books() == [active, overlap]


def test_one_spare_between_seasons_follows_portfolio_and_driver_priority():
    from . import driver_terms
    from .finance.facilities import later

    s = checkpoint(create())
    e = WORLD["entries"]["f1-4"]
    org = e["org"]
    s["council"]["mandates"][org] = dict(
        mode="full", limit_cents=10**8, allow_rent=True, focus="balanced"
    )
    version = components.spec(s, components.mounting(s, e["id"])["suspension"])["id"]
    for seat in components.seats_for(WORLD, e):
        contract = driver_terms.contract(s, seat, s["date"])
        if contract:
            contract["driver_status"] = (
                "first" if seat["entry"] == "f1-81" else "second"
            )
    for eid in ("f1-4", "f1-81"):
        iid = components.mounting(s, eid)["suspension"]
        s["components"]["condition"][iid] = dict(
            components.condition(s, iid), damaged=True
        )
    for year in (2025, 2026):
        p = development.commission(
            s,
            WORLD,
            org,
            f"qualification-{year}",
            development.TestOrder(
                entry=e["id"],
                baseline=version,
                candidate=version,
                method="calculation",
                priority="normal",
            ),
            target_year=year,
        )
        research.work(s, WORLD, p, {})
        assert p["report"]
        s["date"] = later(s["date"], 1)
    for priority, awarded in (("current", 2025), ("next", 2026)):
        s["programme"]["priorities"][org + ":2025"] = priority
        books = {
            plan["year"]: next(
                p for p in cards[0]["parts"] if p["axis"] == "suspension"
            )
            for _, plan, _, cards in packages.portfolios(s, WORLD, org)
        }
        winner = books[awarded]
        loser = books[2026 if awarded == 2025 else 2025]
        assert len(winner["serials"]) == 1 and loser["serials"] == []
        assert [(r["entry"], r["status"]) for r in winner["targets"]] == [
            ("f1-4", "priority"),
            ("f1-81", "allocated"),
        ]
        assert len(winner["fits"]) == int(awarded == 2025)
        assert winner["action"]["payload"]["quantity"] == 1
        assert not loser["ready"] and loser["action"]["payload"]["quantity"] == 2
