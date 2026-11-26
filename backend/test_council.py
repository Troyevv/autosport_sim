"""Acceptance scenarios for the engineering staff and historical career replay."""

from copy import deepcopy
import pytest

from . import council, components, development, domain, service, storage
from .app import council_desk
from .catalog import LINEUP_WORLD as WORLD
from .council.evidence import preferred
from .council.observations import Observation, receive
from .development.physics import finish_design
from .test_career import MCLAREN, advance, create
from .test_research import checkpoint, lease


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def send(c, action, **args):
    cmd = service.Command(
        command_id=f"brief-{c['revision']}",
        revision=c["revision"],
        action="council-" + action,
        council=args,
    )
    result = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == result
    return result


def proposal(c, occasion):
    return next(
        r for r in council_desk(c["id"])["proposals"] if r["occasion"] == occasion
    )


def test_discussion_defer_request_actual_work_and_portable_minutes():
    c = create()
    p = proposal(c, "Выбор направления")
    assert {v["stance"] for v in p["positions"]} == {
        "Инициатива",
        "Возражение",
        "Заключение",
    }
    assert len({v["person"] for v in p["positions"]}) == 3
    assert "подвеск" in p["positions"][1]["argument"].lower()
    assert (
        p["options"][0]["action"] == "design"
        and p["options"][1]["action"] == "research"
    )
    c = send(
        c,
        "decide",
        proposal=p["id"],
        decision="defer",
        reason="Сначала уточнить доступ к центру.",
    )
    assert proposal(c, "Выбор направления")["status"] == "deferred"
    c = lease(c)
    c = send(c, "decide", proposal=p["id"], decision="investigate")
    chosen = proposal(c, "Выбор направления")
    assert chosen["work"] in checkpoint(c)["control"]["projects"]
    assert chosen["chosen"]["cost_cents"] == p["investigation"]["cost_cents"]
    before = service.export_save(c["id"])
    with pytest.raises(domain.RuleError):
        send(c, "decide", proposal=p["id"], decision="approve")
    assert service.export_save(c["id"]) == before
    for _ in range(12):
        c = advance(c)
        if proposal(c, "Выбор направления")["execution"]["finished"]:
            break
    done = proposal(c, "Выбор направления")
    assert (
        done["execution"]["result"]
        and done["execution"]["worked"] == done["execution"]["required"]
    )
    desk = council_desk(c["id"])
    assert len(desk["history"]) == 2 and all(h["positions"] for h in desk["history"])
    assert (
        proposal(c, "Заключение исследования")["sources"][0]
        in checkpoint(c)["research"]["reports"]
    )
    saved = service.export_save(c["id"])
    imported = service.import_save(saved)
    assert (
        council_desk(imported["id"]) == desk
        and service.export_save(imported["id"]) == saved
    )


def test_modes_budget_reject_and_atomic_statistics(monkeypatch):
    c = create()
    base = checkpoint(c)
    council.deliberate(base, WORLD, MCLAREN)
    assert not base["council"]["history"]
    p = proposal(c, "Заявка цеха")
    original = service.export_save(c["id"])
    with monkeypatch.context() as patch:

        def fail(*args):
            raise RuntimeError("archive offline")

        patch.setattr(council, "write_fact", fail)
        with pytest.raises(RuntimeError):
            send(c, "decide", proposal=p["id"], decision="approve")
    assert service.export_save(c["id"]) == original
    c = send(
        c,
        "decide",
        proposal=p["id"],
        decision="reject",
        reason="Сохраняем складской резерв.",
    )
    assert (
        proposal(c, "Заявка цеха")["status"] == "rejected"
        and not checkpoint(c)["production"]["batches"]
    )
    for mode in ["partial", "full"]:
        s = deepcopy(base)
        policy = dict(mode=mode, limit_cents=0, allow_rent=True, focus="readiness")
        s["council"]["mandates"][MCLAREN] = policy
        council.deliberate(s, WORLD, MCLAREN)
        assert not s["council"]["history"]
        policy["limit_cents"] = 10**8
        council.deliberate(s, WORLD, MCLAREN)
        h = s["council"]["history"][0]
        r = s["council"]["briefs"][h["proposal"]]
        assert h["person"] == (r["lead"] if mode == "partial" else r["chief"])
        assert h["work"] in s["production"]["batches"]
    c = send(
        c,
        "mandate",
        mode="full",
        focus="knowledge",
        limit_cents=1000000,
        allow_rent=True,
    )
    c = advance(c)
    s = checkpoint(c)
    assert any(h["org"] != MCLAREN and h["work"] for h in s["council"]["history"])
    assert all(h["org"] == MCLAREN for h in council_desk(c["id"])["history"])


def test_negative_paired_reading_overrides_design_forecast_and_latent_truth():
    s = checkpoint(create())
    entry = WORLD["entries"]["f1-4"]
    base = components.spec(s, components.mounting(s, entry["id"])["floor"])
    design = development.commission(
        s,
        WORLD,
        MCLAREN,
        "case-design",
        development.Design(
            entry=entry["id"],
            baseline=base["id"],
            priority="normal",
            brief="performance",
        ),
    )
    finish_design(s, design, 63)
    design.update(finished=s["date"], status="complete")
    v = design["specification"]
    test = development.commission(
        s,
        WORLD,
        MCLAREN,
        "case-test",
        development.TestOrder(
            entry=entry["id"],
            baseline=base["id"],
            candidate=v,
            priority="normal",
            method="tunnel",
        ),
    )
    # Isolate decision logic from instrument sampling: a signed loss, including its uncertainty.
    test.update(
        finished=s["date"],
        report=dict(
            metric="lift_area_m2",
            difference=-0.2,
            a=dict(value=2.5),
            b=dict(value=2.3),
            conditions="Одинаковая сборка",
            interpretation="У варианта Б значение ниже.",
            uncertainty=0.01,
            detected=False,
            finding=None,
        ),
    )
    p = next(
        r for r in council.refresh(s, WORLD, MCLAREN).values() if v in r["sources"]
    )
    assert p["options"][p["recommended"]]["payload"]["disposition"] == "withdrawn"
    assert test["id"] in p["sources"]
    original = deepcopy(p)
    design["latent_defect"] = not design["latent_defect"]
    s["components"]["revisions"][v]["parameters"]["lift_area_m2"] *= 2
    assert council.refresh(s, WORLD, MCLAREN)[p["id"]] == original
    assert not {
        "latent_defect",
        "parameters",
        "quality_sum",
        "batch_fault",
        "fault",
    }.intersection(str(p).split("'"))
    development.review(s, WORLD, design, "released", p["lead"])
    assert preferred(s, WORLD, entry, base) == base
    council.decide(s, WORLD, p, "delegate", s["player_id"])
    assert (
        design["disposition"] == "withdrawn"
        and preferred(s, WORLD, entry, base) == base
    )

    assert (
        preferred(s, WORLD, entry, s["components"]["revisions"][v])["id"] == base["id"]
    )
    design["findings"] = [test["id"]]
    test["report"].update(detected=True, finding="Обнаружена деформация панели.")
    followup = next(
        r
        for r in council.refresh(s, WORLD, MCLAREN).values()
        if r["kind"] == "withdrawal"
    )
    assert (
        followup["options"][0]["payload"]["baseline"] == v
        and "деформация" in followup["observation"]
    )


def test_available_opening_alternative_requires_comparable_evidence():
    s = checkpoint(create())
    e = WORLD["entries"]["f1-4"]
    base, alternative = development.versions(s, e["id"], "rear-wing")
    assert preferred(s, WORLD, e, base) == base
    trial = development.commission(
        s,
        WORLD,
        MCLAREN,
        "signed-comparison",
        development.TestOrder(
            entry=e["id"],
            baseline=base["id"],
            candidate=alternative["id"],
            priority="normal",
            method="tunnel",
        ),
    )
    trial.update(
        finished=s["date"],
        report=dict(
            metric="lift_area_m2",
            difference=0.18,
            uncertainty=0.05,
            detected=False,
            a=dict(value=1.5),
        ),
    )
    assert preferred(s, WORLD, e, base) == alternative
    trial["report"]["uncertainty"] = 0.2
    assert preferred(s, WORLD, e, base) == base
    trial["report"]["uncertainty"] = 0.05
    trial["concept"] = "different-assembly"
    assert preferred(s, WORLD, e, base) == base


def test_conflicting_protocols_call_another_method():
    from .council.evidence import verdict

    def report(method, metric, delta):
        return dict(
            method=method,
            report=dict(
                metric=metric, difference=delta, uncertainty=0.02, detected=False
            ),
        )

    assert verdict([report("tunnel", "lift_area_m2", 0.01)], "floor") == "uncertain"
    assert (
        verdict(
            [
                report("tunnel", "lift_area_m2", 0.1),
                report("calculation", "lift_area_m2", -0.12),
            ],
            "floor",
        )
        == "conflict"
    )


def test_contention_and_scoped_future_observations():
    from . import research
    from .test_research import study

    c = study(study(create(), "floor"), "rear-wing")
    s = checkpoint(c)
    for p in s["research"]["projects"].values():
        research.work(s, WORLD, p, {})
    r = next(
        r
        for r in council.refresh(s, WORLD, MCLAREN).values()
        if r["occasion"] == "Конфликт ресурсов"
    )
    assert len(r["sources"]) == 2 and r["options"][0]["action"] == "lease"
    before = len(s["estate"]["bookings"])
    council.decide(s, WORLD, r, "approve", s["player_id"])
    assert len(s["estate"]["bookings"]) == before + 1
    eid = "f1-4"
    iid = components.mounting(s, eid)["floor"]
    driver = next(
        domain.occupant_on(s["seats"][a["id"]], s["date"])
        for a in WORLD["assignments"].values()
        if a["entry"] == eid and a["position"] == "driver"
    )
    fact = Observation(
        reference="feedback-source",
        org=MCLAREN,
        entry=eid,
        session="session-test",
        day=s["date"],
        instance=iid,
        specification=components.spec(s, iid)["id"],
        kind="driver-feedback",
        author=driver,
        observation="Пилот сообщил о чувствительности баланса к просвету.",
    )
    receive(s, WORLD, fact)
    receive(s, WORLD, fact)
    r = next(
        r
        for r in council.refresh(s, WORLD, MCLAREN).values()
        if fact.reference in r["sources"]
    )
    assert (
        s["people"][r["lead"]]["position"] == "race-engineer"
        and r["observation"] == fact.observation
    )
    with pytest.raises(domain.RuleError):
        receive(s, WORLD, fact.model_copy(update={"org": "another-org"}))


def test_v23_activation_preserves_historical_autonomous_receipts():
    c = create()
    with storage.transaction(True) as db:
        state = storage.checkpoint(db, c["id"])
        del state["council"]
        storage.store(db, c["id"], state)
    c = advance(c)
    legacy = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=23")
    restored = service.import_save(legacy)
    assert checkpoint(c)["council"]["since"] == c["revision"]
    assert service.export_save(restored["id"]) == service.export_save(c["id"])


def test_analyst_uses_only_granted_client_channel_and_trusted_producer():
    from fastapi.testclient import TestClient
    from .app import app
    from .employment import assign_support

    c = create()
    s = checkpoint(c)
    eid = "f1-4"
    iid = components.mounting(s, eid)["engine"]
    drawing = components.spec(s, iid)
    engineer = next(
        a
        for a in WORLD["assignments"].values()
        if a["entry"] == eid and a["position"] == "race-engineer"
    )
    fact = Observation(
        reference="sensor-1",
        org=MCLAREN,
        entry=eid,
        session="bench-to-track",
        session_kind="practice",
        day=s["date"],
        instance=iid,
        specification=drawing["id"],
        kind="track-measurement",
        author=domain.occupant_on(s["seats"][engineer["id"]], s["date"]),
        observation="Отчёт датчика температуры.",
        channel="temperature",
        value=89.4,
        unit="°C",
        uncertainty=0.4,
        conditions="Контрольная серия",
    )
    request = service.Command(
        revision=c["revision"],
        command_id="source-sample",
        action="council-observation",
        council=fact.model_dump(),
    )
    with TestClient(app) as client:
        assert (
            client.post(
                f"/api/careers/{c['id']}/commands", json=request.model_dump()
            ).status_code
            == 403
        )
    c = service.execute(c["id"], request)
    r = proposal(c, "Разбор сессии")
    assert not any(pos["stance"] == "Анализ данных" for pos in r["positions"])
    assert council_desk(
        service.import_save(service.export_save(c["id"]))["id"]
    ) == council_desk(c["id"])
    s = checkpoint(c)
    seat = next(
        a
        for a in WORLD["assignments"].values()
        if a["org"] == drawing["manufacturer"] and a["position"] == "technical-advisor"
    )
    assign_support(
        s,
        WORLD,
        seat,
        s["seats"][seat["id"]][0],
        dict(start=s["date"], end="2025-02-10", product="engine", entry=eid),
    )
    r = council.refresh(s, WORLD, MCLAREN)[r["id"]]
    analyst = next(pos for pos in r["positions"] if pos["stance"] == "Анализ данных")
    assert (
        s["people"][analyst["person"]]["position"] == "analyst"
        and "89.4" in analyst["argument"]
    )
    s["support"][0]["channels"] = ["wear"]
    assert not any(
        pos["stance"] == "Анализ данных"
        for pos in council.refresh(s, WORLD, MCLAREN)[r["id"]]["positions"]
    )


def test_rejected_hypothesis_and_wrong_specialist_forecast_do_not_change_the_car():
    from .components.registry import drawing_for
    from .development.physics import TRADE

    s = checkpoint(create())
    p = next(
        r
        for r in council.refresh(s, WORLD, MCLAREN).values()
        if r["occasion"] == "Выбор направления"
    )
    # Same observation, different risk tolerance: ask for a drawing, then evaluate the actual design.
    d = next(o for o in p["options"] if o["action"] == "design")
    e = WORLD["entries"][p["entry"]]
    original = deepcopy(components.mounting(s, e["id"]))
    baseline = drawing_for(s, d["payload"]["baseline"])
    metric, sign, *_ = TRADE[p["axis"]]
    for i in range(24):
        project = development.commission(
            s,
            WORLD,
            MCLAREN,
            f"forecast-{i}",
            development.Design.model_validate(d["payload"]),
        )
        finish_design(s, project, 45)
        actual = drawing_for(s, project["specification"])["parameters"][metric]
        if (actual - baseline["parameters"][metric]) * sign < 0:
            assert project["forecast"][metric][1] > baseline["parameters"][metric]
            assert (
                preferred(s, WORLD, e, baseline) == baseline
                and components.mounting(s, e["id"]) == original
            )
            break
    else:
        pytest.fail("Expected an unsuccessful design from the production physics.")
