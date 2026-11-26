"""Two actual engineering portfolios, decisions, permissions and replay."""

from copy import deepcopy
import pytest
from . import (
    components,
    council,
    development,
    domain,
    research,
    service,
    storage,
)
from .app import programme_desk
from .catalog import LINEUP_WORLD as WORLD
from .finance import budget, facilities
from .programme import packages, rules
from .test_career import create, MCLAREN, advance
from .test_research import checkpoint, lease


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def send(c, action, **args):
    cmd = service.Command(
        revision=c["revision"],
        command_id=f"order-{c['revision']}",
        action=action,
        **{action.split("-")[0]: args},
    )
    result = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == result
    return result


def authorize(c, year, axis):
    plan = next(p for p in programme_desk(c["id"])["plans"] if p["year"] == year)
    brief = next(r for r in plan["proposals"] if r["axis"] == axis)
    return send(c, "council-decide", proposal=brief["id"], decision="approve")


def test_concurrent_generation_priority_funding_capacity_replay():
    c = lease(create())
    c = authorize(c, 2025, "floor")
    c = authorize(c, 2026, "floor")
    c = send(c, "programme-priority", allocation="next")
    c = advance(c)
    s = checkpoint(c)
    current, future = sorted(
        (p for p in s["research"]["projects"].values() if p["org"] == MCLAREN),
        key=lambda p: p["target_year"],
    )
    assert future["worked"] > 0 and current["worked"] == 0 and current["reason"]
    for p in (current, future):
        terms = s["control"]["projects"][p["id"]]["terms"]
        assert terms["generation"] == f"f1-{p['target_year']}-f1-v1"
        assert terms["amount_cents"] == p["cost_cents"]
    c = send(c, "programme-priority", allocation="stop-current")
    with pytest.raises(domain.RuleError, match="остановлено"):
        send(c, "research-commission", entry="f1-4", axis="floor", priority="high")
    c = advance(c)
    assert checkpoint(c)["research"]["projects"][current["id"]]["worked"] == 0
    c = send(c, "programme-priority", allocation="current")
    c = advance(c)
    assert checkpoint(c)["research"]["projects"][current["id"]]["worked"] > 0
    saved = service.export_save(c["id"])
    imported = service.import_save(saved)
    assert service.export_save(imported["id"]) == saved
    assert programme_desk(imported["id"]) == programme_desk(c["id"])


def test_concept_transition_paid_or_rolled_back_and_knowledge_retained():
    c = lease(create())
    c = authorize(c, 2025, "floor")
    for _ in range(14):
        c = advance(c)
        if programme_desk(c["id"])["plans"][0]["knowledge"]:
            break
    before = checkpoint(c)
    assert before["research"]["reports"]
    c = send(c, "programme-concept", entry="f1-4", year=2026, strategy="replace")
    s = checkpoint(c)
    assert s["research"]["reports"] == before["research"]["reports"]
    plan = programme_desk(c["id"])["plans"][1]
    assert (
        plan["strategy"] == "replace"
        and plan["concept"] != before["car_configurations"]["car-f1-4"]["concept"]
    )
    assert 0 < plan["knowledge"][0]["applicable"] < plan["knowledge"][0]["confidence"]
    assert len(plan["calendar"]) == 2
    assert (
        sum(p["cost_cents"] for p in plan["calendar"])
        == plan["concept_costs"]["replace"]
    )
    saved = service.export_save(c["id"])
    assert service.export_save(service.import_save(saved)["id"]) == saved
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        plan = s["control"]["plans"][MCLAREN]["2025"]
        plan["allocations"]["engineering"] = (
            budget.report(s, WORLD, MCLAREN, 2025)["actual"]["engineering"] + 180000
        )
        storage.store(db, c["id"], s)
    before = checkpoint(c)
    with pytest.raises(domain.RuleError):
        send(c, "programme-concept", entry="f1-4", year=2026, strategy="revise")
    assert checkpoint(c) == before


def test_future_test_charges_actual_atr_period_only_once():
    c = create()
    s = checkpoint(c)
    e = WORLD["entries"]["f1-4"]
    axis = "floor"
    base = components.spec(s, components.mounting(s, e["id"])[axis])["id"]
    order = development.TestOrder(
        entry=e["id"], baseline=base, candidate=base, method="cfd", priority="normal"
    )
    prior = budget.scope_for(s, WORLD, MCLAREN)
    config = rules.config_for(s, WORLD, e, 2025)
    budget.project(
        s,
        WORLD,
        budget.ProjectCost(
            project="current-uses-quota",
            program=e["program"],
            target_season=config["season"],
            generation=config["generation"],
            amount_cents=1,
            due=s["date"],
            atr={"cfd_geometries": prior["limits"]["cfd_geometries"]},
        ),
    )
    p = development.commission(
        s, WORLD, MCLAREN, "successor-cfd", order, target_year=2026
    )
    for day in [s["date"], prior["period"]["end_exclusive"]]:
        s["date"] = day
        facilities.act(
            s,
            WORLD,
            MCLAREN,
            "lease-" + day,
            facilities.Lease(
                facility="shared:cfd", start=day, days=1, units=1, mode="lease"
            ),
        )
        research.work(s, WORLD, p, {})
        if day < prior["period"]["end_exclusive"]:
            assert p["id"] not in s["control"]["projects"] and not p["grants"]
    assert p["finished"] == prior["period"]["end_exclusive"] and len(p["grants"]) == 1
    posted = s["control"]["projects"][p["id"]]
    assert (
        posted["terms"]["target_season"] == "f1-2026"
        and posted["pool"] != prior["pool_id"]
    )
    assert (
        development.commission(s, WORLD, MCLAREN, p["id"], order, target_year=2026) is p
    )


def test_partial_package_and_homologation_effective_freeze_specific_serial():
    s = checkpoint(create())
    e = WORLD["entries"]["f1-4"]
    org = e["org"]
    plan = rules.dossier(s, WORLD, e, 2026)
    pkg = packages.package(s, WORLD, e, plan)
    axis = plan["rule"]["slot"]
    base = pkg["baselines"][axis]
    assert not rules.admitted_version(
        s, WORLD, e, components.registry.drawing_for(s, base), 2026
    )
    with pytest.raises(domain.RuleError):
        rules.certify(s, WORLD, e, 2026, base, s["player_id"])
    p = development.commission(
        s,
        WORLD,
        org,
        "qualification",
        development.TestOrder(
            entry=e["id"],
            baseline=base,
            candidate=base,
            method="calculation",
            priority="normal",
        ),
        target_year=2026,
    )
    facilities.act(
        s,
        WORLD,
        org,
        "design-slot",
        facilities.Lease(
            facility="shared:design", start=s["date"], days=1, units=1, mode="lease"
        ),
    )
    research.work(s, WORLD, p, {})
    assert p["report"]
    rules.certify(s, WORLD, e, 2026, base, s["player_id"])
    card = packages.evaluate_package(
        s, WORLD, e, plan, pkg, list(packages.work_for(s, WORLD, e, plan))
    )
    assert card["ready"] == 1 and len(card["parts"]) == 2
    alien = deepcopy(components.registry.drawing_for(s, base))
    alien["interface"] = "another-mount"
    assert not components.compatible(s, WORLD, e, alien, year=2026)
    s["date"] = "2026-01-01"
    assert not rules.inspection(s, WORLD, e)
    s["programme"]["certificates"].clear()
    rules.check_grid(s, WORLD)
    first = deepcopy(s["programme"]["inspections"])
    rules.check_grid(s, WORLD)
    assert s["programme"]["inspections"] == first
    assert any(
        r["entry"] == e["id"] and r["specification"] == base for r in first.values()
    )
    s["date"] = plan["rule"]["freeze"]
    with pytest.raises(domain.RuleError, match="омологации"):
        rules.certify(s, WORLD, e, 2026, base, s["player_id"])
    with pytest.raises(domain.RuleError, match="заморозил"):
        development.commission(
            s,
            WORLD,
            org,
            "frozen",
            development.Design(
                entry=e["id"], baseline=base, priority="high", brief="balanced"
            ),
        )
    with pytest.raises(domain.RuleError, match="дефекта"):
        development.commission(
            s,
            WORLD,
            org,
            "exception",
            development.Design(
                entry=e["id"], baseline=base, priority="high", brief="reliability"
            ),
        )


def test_same_staff_plans_in_delegated_and_npc_offices():
    s = checkpoint(create())
    npc = WORLD["entries"]["f1-16"]["org"]
    for org in [MCLAREN, npc]:
        s["council"]["mandates"][org] = dict(
            mode="full", limit_cents=10000000, allow_rent=True, focus="knowledge"
        )
        s["programme"]["priorities"][org + ":2025"] = "next"
        council.deliberate(s, WORLD, org)
        row = next(
            r
            for r in s["council"]["briefs"].values()
            if r["org"] == org
            and r.get("target_year") == 2026
            and r["status"] == "decided"
        )
        p = s["research"]["projects"][row["work"]]
        assert p["org"] == org and p["target_year"] == 2026 and row["chief"]
        assert s["control"]["projects"][p["id"]]["org"] == org


def test_migrate_v24_at_actual_revision_then_replay():
    c = create()
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        del s["programme"]
        storage.store(db, c["id"], s)
    c = advance(c)
    legacy = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=24")
    assert checkpoint(c)["programme"]["since"] == c["revision"]
    restored = service.import_save(legacy)
    assert service.export_save(restored["id"]) == service.export_save(c["id"])


def test_successor_drawing_through_test_release_factory_and_garage_admission():
    from . import production
    from .development.physics import measure
    from .production.workshop import day as factory_day

    s = checkpoint(create())
    e = WORLD["entries"]["f1-4"]
    org = e["org"]
    eid = e["id"]
    base = components.spec(s, components.mounting(s, eid)["suspension"])["id"]
    plan = rules.dossier(s, WORLD, e, 2026)
    actor = s["player_id"]
    s["council"]["mandates"][org] = dict(
        mode="full", limit_cents=10**8, allow_rent=True, focus="balanced"
    )
    p = development.commission(
        s,
        WORLD,
        org,
        "future-suspension",
        development.Design(
            entry=eid, baseline=base, brief="balanced", priority="normal"
        ),
        target_year=2026,
    )

    def work(project):
        for _ in range(40):
            research.work(s, WORLD, project, {})
            s["date"] = facilities.later(s["date"], 1)
            if project["finished"]:
                return
        pytest.fail(project["reason"])

    work(p)
    v = p["specification"]
    d = components.registry.drawing_for(s, v)
    assert (
        d["regulation"] == plan["regulation"]
        and d["programme_concept"] == plan["concept"]
    )
    assert not components.compatible(s, WORLD, e, d)
    test = development.commission(
        s,
        WORLD,
        org,
        "future-calculation",
        development.TestOrder(
            entry=eid,
            baseline=base,
            candidate=v,
            method="calculation",
            priority="normal",
        ),
        target_year=2026,
    )
    work(test)
    assert test["report"] and not test["findings"]
    development.review(s, WORLD, p, "released", actor)
    batch = production.commission(
        s,
        WORLD,
        org,
        "successor-production",
        production.Order(
            entry=eid,
            specification=v,
            quantity=1,
            priority="normal",
            rush=False,
            outsource=False,
        ),
        target_year=2026,
    )
    for _ in range(40):
        factory_day(s, WORLD, {})
        s["date"] = facilities.later(s["date"], 1)
        if batch["finished"]:
            break
    assert batch["finished"] and batch["target_year"] == 2026
    serial = batch["id"] + "/unit-1"
    assert components.spec(s, serial)["id"] == v
    assert serial not in components.stockroom(s, WORLD, e)
    with pytest.raises(domain.RuleError):
        components.install(
            s, WORLD, components.Install(entry=eid, instance=serial), org
        )
    s["date"] = "2026-01-01"
    assert components.compatible(s, WORLD, e, d)
    # Only the installed companion can satisfy the tested interface.
    coupled = dict(d, requires={"floor": "incompatible-qualified-floor"})
    assert not components.compatible(s, WORLD, e, coupled)
    assert measure(s, test, 75)["metric"] == test["report"]["metric"]


def test_package_reschedule_cancel_and_series_specific_publications():
    c = create()
    p = programme_desk(c["id"])["plans"][0]
    pkg = p["packages"][0]
    args = dict(entry=p["entry"], year=p["year"], package=pkg["id"])
    c = send(c, "programme-deployment", **args, decision="defer", due="2025-05-01")
    assert programme_desk(c["id"])["plans"][0]["packages"][0]["due"] == "2025-05-01"
    c = send(c, "programme-deployment", **args, decision="withdraw")
    plan = programme_desk(c["id"])["plans"][0]
    assert not plan["proposals"] and all(
        part["status"] == "Внедрение отменено" for part in plan["packages"][0]["parts"]
    )
    assert not checkpoint(c)["research"]["projects"]
    for series, slot in (
        ("f1", "floor"),
        ("f2", "chassis"),
        ("f3", "chassis"),
        ("dtm", "brakes"),
        ("wec", "cooling"),
        ("kart-ok", "engine"),
    ):
        e = next(e for e in WORLD["entries"].values() if e["championship"] == series)
        original = rules.bulletin(WORLD, e, 2025)
        later = rules.bulletin(WORLD, e, 2026)
        assert original["source"] and later["base"] != later["id"]
        assert (
            later["slot"] == slot
            and later["announced"] < later["effective"] <= later["freeze"]
        )
