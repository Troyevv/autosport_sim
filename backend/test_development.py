"""Engineering work through the career command bus and trusted component registry."""

from copy import deepcopy

import pytest

from . import development, domain, service, storage
from .app import development_desk
from .catalog import LINEUP_WORLD as WORLD
from .components import mounting
from .components.registry import drawing_for
from .research.desk import projection as research_view
from .test_career import MCLAREN, advance, create
from .test_research import checkpoint, study, lease


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def send(c, action, **args):
    cmd = service.Command(
        command_id=f"order-{c['revision']}",
        revision=c["revision"],
        action=action,
        **{"finance" if action.startswith("finance-") else "development": args},
    )
    updated = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == updated
    return updated


def rent(c, site):
    return send(
        c,
        "finance-lease",
        facility="shared:" + site,
        days=10,
        start=c["date"],
        units=1,
        mode="lease",
    )


def until_finished(c, count):
    for _ in range(12):
        if (
            sum(bool(p["finished"]) for p in development_desk(c["id"])["projects"])
            >= count
        ):
            return c
        c = advance(c)
    pytest.fail("Queue did not finish")


def design(c, baseline, priority="normal"):
    return send(
        c,
        "development-design",
        entry="f1-4",
        baseline=baseline,
        priority=priority,
        brief="balanced",
    )


def test_research_design_test_revision_and_replay():
    c = study(lease(create()), "rear-wing")
    while not research_view(checkpoint(c), WORLD)["reports"]:
        c = advance(c)
    c = rent(c, "design")
    state = checkpoint(c)
    inventory = deepcopy(state["components"]["inventory"])
    mounts = mounting(state, "f1-4")
    base = development.versions(state, "f1-4", "rear-wing")[0]["id"]
    c = design(c, base)
    p = development_desk(c["id"])["projects"][0]
    assert p["evidence"][0]["axis"] == "rear-wing" and p["forecast"]
    c = until_finished(c, 1)
    p = development_desk(c["id"])["projects"][0]
    version = p["specification"]
    assert version.endswith("/3") and not development.released(
        checkpoint(c), MCLAREN, version
    )
    assert p["grants"] and p["participants"] and p["baseline"] == base
    with pytest.raises(domain.RuleError):
        send(c, "development-review", project=p["id"], disposition="released")
    c = rent(c, "tunnel")
    args = dict(
        entry="f1-4", baseline=base, candidate=version, method="tunnel", priority="high"
    )
    original = drawing_for(checkpoint(c), version)
    for n in (2, 3):
        c = send(c, "development-test", **args)
        c = until_finished(c, n)
    d = development_desk(c["id"])
    tests = [t for t in d["projects"] if t["kind"] == "test"]
    assert len(tests) == 2 and tests[0]["report"] != tests[1]["report"]
    for t in tests:
        r = t["report"]
        assert r["b"]["raw"] / r["b"]["pressure_pa"] == pytest.approx(
            r["b"]["value"], abs=1e-6
        )
        assert r["uncertainty"] > 0 and r["interpretation"]
        assert t["grants"][0]["authorization"] == t["id"]
    s = checkpoint(c)
    assert (
        drawing_for(s, version) == original
        and s["components"]["inventory"] == inventory
    )
    assert mounting(s, "f1-4") == mounts
    assert all(
        k not in str(d) for k in ("latent_defect", "quality_sum", "'parameters'")
    )
    assert all(
        s["control"]["projects"][t["id"]]["terms"]["atr"]["runs"] == 2 for t in tests
    )
    if not next(row for row in d["projects"] if row["id"] == p["id"])["findings"]:
        c = send(c, "development-review", project=p["id"], disposition="released")
        assert development.released(checkpoint(c), MCLAREN, version)
    c = send(c, "development-review", project=p["id"], disposition="withdrawn")
    assert not development.released(checkpoint(c), MCLAREN, version)
    c = design(rent(c, "design"), version)
    c = until_finished(c, 4)
    s = checkpoint(c)
    assert s["components"]["revisions"][version[:-1] + "4"]["parent"] == version
    assert any(w["fact"]["kind"] == "component-test" for w in s["work_log"].values())
    saved = service.export_save(c["id"])
    assert any(
        row[0] == "fact" and row[1]["data"]["kind"] == "engineering-report"
        for row in saved["payload"]["statistics_v1"]
    )
    restored = service.import_save(saved)
    assert development_desk(restored["id"]) == development_desk(c["id"])
    assert service.export_save(restored["id"]) == saved


def test_restrictions_capacity_priorities_and_funding():
    c = create()
    s = checkpoint(c)
    for axis in ("engine", "tyre"):
        with pytest.raises(domain.RuleError, match="поставщик"):
            design(c, development.versions(s, "f1-4", axis)[0]["id"])
    # A dated supplier obligation also binds an otherwise open constructor slot.
    s["market"]["supplies"]["gearbox-contract"] = dict(
        org=MCLAREN,
        series="f1",
        product="transmission",
        sponsor="supplier-hewland",
        status="signed",
        start=s["date"],
        end="2025-03-01",
    )
    gearbox = development.versions(s, "f1-4", "transmission")[0]["id"]
    with pytest.raises(domain.RuleError, match="договор поставки"):
        development.commission(
            s,
            WORLD,
            MCLAREN,
            "customer-gearbox",
            development.Design(
                entry="f1-4", baseline=gearbox, priority="normal", brief="balanced"
            ),
        )
    other = WORLD["entries"]["dtm-1"]
    base = development.versions(s, other["id"], "brakes")[0]["id"]
    with pytest.raises(domain.RuleError, match="утверждённые"):
        development.commission(
            s,
            WORLD,
            other["org"],
            "homologated",
            development.Design(
                entry=other["id"], baseline=base, priority="normal", brief="balanced"
            ),
        )
    c = rent(c, "design")
    floor = development.versions(s, "f1-4", "floor")[0]["id"]
    rear = development.versions(s, "f1-4", "rear-wing")[0]["id"]
    c = design(design(c, floor, "low"), rear, "high")
    c = advance(c)
    fast, waiting = development_desk(c["id"])["projects"]
    assert (
        fast["worked"] > 0
        and waiting["worked"] == 0
        and "специалист" in waiting["reason"]
    )
    with pytest.raises(domain.RuleError, match="несовместимы"):
        send(
            c,
            "development-test",
            entry="f1-4",
            baseline=floor,
            candidate=rear,
            method="cfd",
            priority="normal",
        )
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        s["control"]["plans"][MCLAREN]["2025"]["allocations"]["engineering"] = 0
        storage.store(db, c["id"], s)
    before = service.export_save(c["id"])
    with pytest.raises(domain.RuleError, match="бюджета"):
        design(c, rear)
    assert service.export_save(c["id"]) == before


def test_v21_replay_uses_original_research_questions_and_opens_office_on_migration():
    c = create()
    with storage.transaction(True) as db:
        old = storage.checkpoint(db, c["id"])
        old.pop("development")
        domain.apply(
            old,
            WORLD,
            "research-commission",
            dict(entry="f1-4", axis="floor", priority="normal"),
        )
        args = dict(entry="f1-4", axis="floor", priority="normal")
        db.execute(
            "INSERT INTO receipt VALUES(?,?,?,?,?)",
            (c["id"], "legacy", 0, "research-commission", storage.dump(args)),
        )
        storage.store(db, c["id"], old)
    saved = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=21")
    imported = service.import_save(saved)
    assert checkpoint(imported)["development"]["since"] == 1
    assert service.export_save(imported["id"]) == service.export_save(c["id"])


def test_exhausted_atr_waits_without_a_fee_or_a_grant_then_retries():
    from .finance import budget
    from .research import advance as work_days

    c = rent(create(), "cfd")
    s = checkpoint(c)
    base = development.versions(s, "f1-4", "rear-wing")[0]["id"]
    config = s["car_configurations"]["car-f1-4"]
    terms = dict(
        project="other-program-work",
        program=WORLD["entries"]["f1-4"]["program"],
        due=s["date"],
        generation=config["generation"],
        target_season=config["season"],
        amount_cents=100,
        atr={
            "cfd_geometries": budget.scope_for(s, WORLD, MCLAREN)["limits"][
                "cfd_geometries"
            ]
        },
    )
    budget.project(s, WORLD, budget.ProjectCost(**terms))
    p = development.commission(
        s,
        WORLD,
        MCLAREN,
        "validation",
        development.TestOrder(
            entry="f1-4", baseline=base, candidate=base, method="cfd", priority="normal"
        ),
    )
    today = s["date"]
    from .finance.facilities import later

    work_days(s, WORLD, later(today, 1))
    assert (
        "квоты ATR" in p["reason"]
        and not p["grants"]
        and p["id"] not in s["control"]["projects"]
    )
    # A new ATP starts with its own quota. The old charge and allowance remain in history.
    next_period = budget.scope_for(s, WORLD, MCLAREN)["period"]["end_exclusive"]
    s["date"] = next_period
    from .finance import facilities

    facilities.act(
        s,
        WORLD,
        MCLAREN,
        "next-period-slot",
        facilities.Lease(
            facility="shared:cfd", mode="lease", start=next_period, days=1, units=1
        ),
    )
    work_days(s, WORLD, later(next_period, 1))
    assert p["finished"] == next_period
    assert (
        s["control"]["projects"][p["id"]]["pool"]
        != s["control"]["projects"][terms["project"]]["pool"]
    )


def test_stable_truth_negative_solutions_and_detected_defects():
    from .development.physics import finish_design, measure
    from .components import nominal_drawing
    from .components.registry import register_instance

    s = checkpoint(create())
    base = development.versions(s, "f1-4", "floor")[0]
    signs = set()
    for n in range(60):
        key = f"prototype-{n}"
        p = development.commission(
            s,
            WORLD,
            MCLAREN,
            key,
            development.Design(
                entry="f1-4",
                baseline=base["id"],
                priority="normal",
                brief="performance",
            ),
        )
        finish_design(s, p, 50)
        version = p["specification"]
        truth = deepcopy(drawing_for(s, version))
        signs.add(
            truth["parameters"]["lift_area_m2"] > base["parameters"]["lift_area_m2"]
        )
        if not p["latent_defect"]:
            continue
        trial = development.commission(
            s,
            WORLD,
            MCLAREN,
            "inspection-" + key,
            development.TestOrder(
                entry="f1-4",
                baseline=base["id"],
                candidate=version,
                priority="normal",
                method="lab",
            ),
        )
        report = measure(s, trial, 90)
        if report["detected"]:
            assert report["finding"] and p["findings"] == [trial["id"]]
            with pytest.raises(domain.RuleError, match="дефектов"):
                development.review(s, WORLD, p, "released", p["lead"])
            assert drawing_for(s, version) == truth
            # Future producer #48 will see a different interface from the manager's garage.
            register_instance(
                s,
                instance="future-stock",
                version=version,
                org=MCLAREN,
                reference="test-only",
            )
            assert (
                nominal_drawing(s, "future-stock")["parameters"] != truth["parameters"]
            )
            if len(signs) == 2:
                break
    else:
        pytest.fail("Expected both a regression and a detected defect")


def test_each_component_has_a_scoped_study_and_a_matching_test():
    from . import research
    from .development.desk import projection
    from .development.physics import methods
    from .finance import facilities

    c = create()
    s = checkpoint(c)
    entry = WORLD["entries"]["f1-4"]
    axes = mounting(s, entry["id"])
    assert set(axes) == research.METHODS.keys()
    for axis in axes:
        study = research.commission(
            s,
            WORLD,
            MCLAREN,
            "study-" + axis,
            research.Commission(entry=entry["id"], axis=axis, priority="normal"),
        )
        assert study["integration_study"] == (axis in ("engine", "tyre"))
        assert (
            study["baseline"] in study["source"]["reference"]
            and study["design_context"] in study["hypothesis"]
        )
    for site in ("design", "cfd", "tunnel", "bench"):
        facilities.act(
            s,
            WORLD,
            MCLAREN,
            "lease-" + site,
            facilities.Lease(
                facility="shared:" + site,
                mode="lease",
                start=s["date"],
                days=12,
                units=2,
            ),
        )
    for axis in axes:
        version = development.versions(s, entry["id"], axis)[0]["id"]
        protocol = (
            "calculation"
            if axis in ("floor", "chassis")
            else "lab"
            if axis == "rear-wing"
            else "bench"
        )
        assert protocol in methods(axis)
        development.commission(
            s,
            WORLD,
            MCLAREN,
            "test-" + axis,
            development.TestOrder(
                entry=entry["id"],
                baseline=version,
                candidate=version,
                priority="high",
                method=protocol,
            ),
        )
    research.advance(s, WORLD, facilities.later(s["date"], 10))
    reports = projection(s, WORLD)["projects"]
    assert {p["axis"] for p in reports if p.get("report")} == set(axes)
    assert s["components"]["inventory"] == {}
    assert not any(
        p.get("org") == MCLAREN and p["kind"] == "design"
        for p in s["development"]["projects"].values()
    )


def test_atomic_test_completion_and_expired_authority(monkeypatch):
    from .development.desk import projection

    c = rent(create(), "bench")
    base = development.versions(checkpoint(c), "f1-4", "brakes")[0]["id"]
    c = send(
        c,
        "development-test",
        entry="f1-4",
        baseline=base,
        candidate=base,
        method="bench",
        priority="normal",
    )
    original = service.export_save(c["id"])
    with monkeypatch.context() as patch:

        def fail(*args):
            raise RuntimeError("statistics unavailable")

        patch.setattr(development, "write_fact", fail)
        with pytest.raises(RuntimeError):
            advance(c)
    assert service.export_save(c["id"]) == original
    c = advance(c)
    s = checkpoint(c)
    assert projection(s, WORLD)["projects"][0]["report"]
    s["seats"][MCLAREN + ":manager"][0]["end"] = s["date"]
    with pytest.raises(domain.RuleError, match="назначение"):
        projection(s, WORLD)
