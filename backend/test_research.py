"""Research through the career command bus, actual slots and a portable technical archive."""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from . import domain, research, service, storage
from .app import app, research_desk
from .catalog import LINEUP_WORLD as WORLD
from .research.model import applicability, conclusion, evidence
from .test_career import MCLAREN, advance, create


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def command(c, action, **payload):
    field = (
        "finance"
        if action.startswith("finance-")
        else "staff"
        if action == "staff-release"
        else "research"
    )
    return service.Command(
        command_id=f"r-{c['revision']}",
        revision=c["revision"],
        action=action,
        **{field: payload},
    )


def submit(c, action, **payload):
    return service.execute(c["id"], command(c, action, **payload))


def study(c, axis, priority="normal", **extra):
    return submit(
        c, "research-commission", entry="f1-4", axis=axis, priority=priority, **extra
    )


def lease(c, units=1):
    return submit(
        c,
        "finance-lease",
        facility="shared:research",
        start=c["date"],
        days=12,
        units=units,
        mode="lease",
    )


def checkpoint(c):
    with storage.transaction() as db:
        return storage.checkpoint(db, c["id"])


def test_competing_projects_actual_budget_grants_and_private_public_sources():
    c = create()
    original = checkpoint(c)["components"]
    c = study(c, "chassis", "low")
    first = research_desk(c["id"])["projects"][0]
    cmd = command(
        c,
        "research-commission",
        entry="f1-4",
        axis="floor",
        priority="high",
        rival_entry="f1-1",
    )
    c = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == c
    projects = research_desk(c["id"])["projects"]
    assert c["account"]["development_spent_cents"] == sum(
        p["cost_cents"] for p in projects
    )
    assert research_desk(c["id"])["capacity"]["available_slots"] == 0
    c = advance(c)
    assert all(p["worked"] == 0 for p in research_desk(c["id"])["projects"])
    if c["pending"]:
        c = advance(c)
    c = lease(c)
    c = advance(c)
    active, waiting = research_desk(c["id"])["projects"]
    assert 0 < active["worked"] < active["required"] and waiting["worked"] == 0
    desk = research_desk(c["id"])
    assert desk["spent_cents"] == c["account"]["development_spent_cents"]
    assert desk["lease_spent_cents"] == desk["lease_daily_cents"] * 12
    assert active["source"]["reference"] == "f1-1"
    assert set(active["source"]) == {
        "reference",
        "kind",
        "constructor",
        "model",
        "label",
        "suppliers",
    }
    assert "quality_sum" not in active and "refinements" not in active
    # The manager can divert the very same slot before the first study is complete.
    c = submit(c, "research-priority", project=active["id"], priority="low")
    c = submit(c, "research-priority", project=first["id"], priority="high")
    c = advance(c)
    favored, paused = research_desk(c["id"])["projects"]
    assert favored["worked"] > 0 and paused["worked"] == active["worked"]
    s = checkpoint(c)
    # The player's studies cannot issue a drawing. Independently funded NPC offices can.
    current = dict(s["components"])
    revisions = current.pop("revisions")
    assert current == {k: value for k, value in original.items() if k != "revisions"}
    assert revisions and all(
        d["manufacturer"] != MCLAREN and d["reference"] in s["development"]["projects"]
        for d in revisions.values()
    )
    grants = [
        r
        for r in s["estate"]["bookings"].values()
        if r.get("purpose") == "research" and r["org"] == MCLAREN
    ]
    assert len(grants) == len({r["start"] for r in grants}) == 2
    assert all(r["units"] == 1 and r["facility"] == "shared:research" for r in grants)
    with pytest.raises(domain.RuleError):
        study(c, "tyre", rival_entry="dtm-1")
    with pytest.raises(domain.RuleError):
        study(c, "tyre", rival_entry="f1-81")
    rivals = [p for p in s["research"]["projects"].values() if p["org"] != MCLAREN]
    assert rivals and all(p["id"] in s["control"]["projects"] for p in rivals)
    assert not (
        {p["id"] for p in rivals}
        & {p["id"] for p in research_desk(c["id"])["projects"]}
    )


def test_authorship_transfer_departure_scope_and_replay():
    c = study(lease(create()), "floor")
    for _ in range(8):
        c = advance(c)
        if research_desk(c["id"])["reports"]:
            break
    desk = research_desk(c["id"])
    report = desk["reports"][0]
    lead = report["lead"]
    specialist = desk["entries"][0]["staff"]["chassis"]
    assert set(report["participants"]) == {
        lead,
        desk["entries"][0]["staff"]["chief-engineer"],
    }
    assert 0 < min(report["applicability"].values()) < report["confidence"]
    assert applicability(report, "new", report["regulation"]) < report["confidence"]
    assert applicability(report, report["concept"], "new") < report["confidence"]
    args = dict(report=report["id"], mentor=lead, recipient=specialist)
    cmd = command(c, "research-handover", **args)
    c = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == c
    with pytest.raises(domain.RuleError, match="уже знаком"):
        submit(c, "research-handover", **args)
    c = advance(c)
    c = submit(c, "staff-release", seat=MCLAREN + ":aero:f1")
    d = research_desk(c["id"])
    after = d["reports"][0]
    assert (
        after["participants"] == report["participants"]
        and after["conclusion"] == report["conclusion"]
    )
    assert lead not in after["readers"] and after["readers"][specialist] == "briefed"
    s = checkpoint(c)
    assert s["research"]["personal"][lead][report["id"]] == "author"
    assert any(
        r["fact"]["kind"] == "research-handover" and r["fact"]["person"] == specialist
        for r in s["work_log"].values()
    )
    inputs = evidence(s, MCLAREN, "floor", report["concept"], report["regulation"])
    assert inputs[0]["baseline"] and inputs[0]["confidence"] == report["confidence"]
    assert not evidence(s, MCLAREN, "tyre", report["concept"], report["regulation"])
    saved = service.export_save(c["id"])
    assert any(
        row[0] == "fact"
        and row[1]["data"]["kind"] == "research-report"
        and row[1]["access"] == "technical"
        for row in saved["payload"]["statistics_v1"]
    )
    restored = service.import_save(saved)
    assert (
        research_desk(restored["id"]) == d
        and service.export_save(restored["id"]) == saved
    )


def test_duplicate_lead_and_atomic_completion(monkeypatch):
    c = study(study(lease(create(), units=2), "floor", "high"), "floor", "low")
    c = advance(c)
    a, b = research_desk(c["id"])["projects"]
    assert a["worked"] and not b["worked"] and "специалист" in b["reason"]

    write_fact = research.write_fact

    def fail(db, cid, world, report):
        if report["org"] == MCLAREN:
            raise RuntimeError("statistics offline")
        write_fact(db, cid, world, report)

    with monkeypatch.context() as patch:
        patch.setattr(research, "write_fact", fail)
        for _ in range(6):
            before = service.export_save(c["id"])
            try:
                c = advance(c)
            except RuntimeError:
                assert service.export_save(c["id"]) == before
                break
        else:
            pytest.fail("Expected a report write")
    c = advance(c)
    assert len(research_desk(c["id"])["reports"]) == 1


def test_pre_research_v20_opens_at_current_date_in_storage_and_import():
    c = create()
    # Advance with the v20 producers, producing a real historical calendar receipt.
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        s.pop("research")
        domain.apply(s, WORLD, "advance")
        storage.store(db, c["id"], s)
        db.execute(
            "INSERT INTO receipt(career, command_id,revision,action) VALUES(?,?,?,?)",
            (c["id"], "old", 0, "advance"),
        )
    legacy = service.export_save(c["id"])
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=20")
    imported = service.import_save(legacy)
    for cid in (imported["id"], c["id"]):
        d = research_desk(cid)
        assert d["opened"] == s["date"] and not d["projects"] and not d["reports"]
        assert service.export_save(cid)["payload"]["state"]["research"]["since"] == 1
    assert service.export_save(imported["id"]) == service.export_save(c["id"])


def test_hypotheses_uncertainty_context_and_manager_permissions():
    c = create(role="owner")
    with TestClient(app) as client:
        response = client.post(
            f"/api/careers/{c['id']}/commands",
            json=command(
                c, "research-commission", entry="f1-4", axis="floor", priority="high"
            ).model_dump(),
        )
        assert response.status_code == 403 and research_desk(c["id"])["projects"] == []
    base = dict(
        id="project-a",
        concept="A",
        axis="cooling",
        refinements=0,
        source={"kind": "public-entry"},
        worked=100,
        quality_sum=7000,
    )
    outcomes = {conclusion(seed, base)[0] for seed in range(500)}
    assert outcomes == {"supported", "rejected", "inconclusive"}
    assert any(
        conclusion(seed, base)[0] != conclusion(seed, dict(base, concept="B"))[0]
        for seed in range(500)
    )
    assert conclusion(42, base) == conclusion(42, base)


def test_elapsed_day_replay_and_equipment_staff_inputs():
    c = study(lease(create()), "floor")
    base = checkpoint(c)
    p = next(iter(base["research"]["projects"].values()))
    order = research.Commission.model_validate(p["order"])
    assert research.commission(base, WORLD, MCLAREN, p["id"], order) is p
    with pytest.raises(domain.RuleError, match="номеру|номер"):
        research.commission(
            base, WORLD, MCLAREN, p["id"], order.model_copy(update={"axis": "tyre"})
        )
    slow = deepcopy(base)
    slow["estate"]["assets"]["shared:research"]["condition"] = 35
    person = slow["people"][p["lead"]]
    person["skills"]["Прижим"] = 25
    person["fatigue"] = 45
    end = research.facilities.later(base["date"], 1)
    for state in (base, slow):
        research.advance(state, WORLD, end)
        before = storage.dump(state)
        research.advance(state, WORLD, end)
        assert storage.dump(state) == before
    slower = slow["research"]["projects"][p["id"]]
    assert 0 < slower["worked"] < p["worked"]
    assert slower["quality_sum"] / slower["worked"] < p["quality_sum"] / p["worked"]


def test_concurrent_commissions_and_exhausted_budget_leave_one_receipt():
    from concurrent.futures import ThreadPoolExecutor

    c = create()

    def try_study(axis):
        cmd = command(
            c, "research-commission", entry="f1-4", axis=axis, priority="normal"
        )
        try:
            service.execute(c["id"], cmd.model_copy(update={"command_id": axis}))
        except domain.RuleError as error:
            assert error.status == 409
            return False
        return True

    with ThreadPoolExecutor(2) as workers:
        assert sorted(workers.map(try_study, ["floor", "cooling"])) == [False, True]
    c = service.load(c["id"])
    desk = research_desk(c["id"])
    assert (
        len(desk["projects"]) == 1
        and desk["spent_cents"] == desk["projects"][0]["cost_cents"]
    )
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        s["control"]["plans"][MCLAREN]["2025"]["allocations"]["engineering"] = desk[
            "spent_cents"
        ]
        storage.store(db, c["id"], s)
    before = service.export_save(c["id"])
    with pytest.raises(domain.RuleError, match="бюджета"):
        study(c, "chassis")
    assert service.export_save(c["id"]) == before


def test_archive_requires_a_current_appointment():
    c = study(create(), "chassis")
    with storage.transaction(True) as db:
        s = storage.checkpoint(db, c["id"])
        s["seats"][MCLAREN + ":manager"][0]["end"] = s["date"]
        storage.store(db, c["id"], s)
    with TestClient(app) as client:
        response = client.get(f"/api/careers/{c['id']}/research")
        assert response.status_code == 403 and "projects" not in response.json()
    assert checkpoint(c)["research"]["projects"]
