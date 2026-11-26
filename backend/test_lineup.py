"""Driver agreements and sporting producer handoffs, including replay of a real career."""

from copy import deepcopy

import pytest
from . import (
    service,
    driver_terms as terms,
    driver_availability as availability,
    backing,
)
from .app import command as public_command, driver_lineup
from .catalog import LINEUP_WORLD as WORLD
from .domain import RuleError
from .personnel import shifted
from .test_career import MCLAREN, create
from .test_personnel import cmd, run, snapshot


@pytest.fixture(autouse=True)
def database(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def grid(org=MCLAREN, series="f1"):
    return [
        s
        for s in WORLD["assignments"].values()
        if s["position"] == "driver"
        and s["org"] == org
        and s["series"] == series
        and s["entry"]
    ]


def absence(c, seat, reason="illness", authority="medical"):
    return dict(
        date=c["date"],
        reference="absence-1",
        person=seat["person"],
        reason=reason,
        expected_return=shifted(c["date"], 7),
        evidence="Заключение службы",
        authority=authority,
    )


def registration(c, seat, approved):
    event = next(
        e
        for e in WORLD["events"]
        if e["kind"] == "round"
        and e["series"] == seat["series"]
        and e["start"] >= c["date"]
    )
    crew = [p for p in WORLD["entries"][seat["entry"]]["crew"] if p != seat["person"]]
    return dict(
        reference="registration-1",
        seat=seat["id"],
        date=c["date"],
        deadline=event["start"],
        phase="registration",
        round=event["id"],
        regulation=WORLD["championships"][seat["series"]]["rules_id"],
        approved=approved,
        crew=crew,
        minimum_crew=len(crew) + 1,
        driving_time_approved=True,
        evidence="Протокол заявок",
    )


def test_equal_terms_actual_evidence_resolution_and_private_history():
    c = create()
    first, second = grid()
    args = dict(
        seat=first["id"],
        favoured_seat=second["id"],
        date=c["date"],
        resource="specification",
        reason="Вторая машина получила обновление.",
        evidence="Обе карты комплектации",
        severity=2,
    )
    c = run(c, "driver-decision", **dict(args, basis="condition", reference="wear"))
    assert driver_lineup(c["id"])["drivers"][0]["actual"] is None
    justified = dict(
        **args,
        reference="diff-1",
        exception="logistics",
        remedy="Поставка для второй заявки",
        due="2025-02-05",
    )
    with pytest.raises(RuleError, match="источника"):
        public_command(c["id"], cmd(c, "driver-decision", **justified))
    c = run(c, "driver-decision", **justified)
    assert driver_lineup(c["id"])["drivers"][0]["grievances"] == 0
    c = run(
        c,
        "driver-restored",
        reference="fulfilled",
        decision="diff-1",
        date=c["date"],
        evidence="Получен второй комплект",
    )
    assert driver_lineup(c["id"])["drivers"][0]["actual"] is None
    c = run(c, "driver-decision", reference="diff-2", **args)
    c = run(c, "driver-decision", reference="diff-3", **args)
    after = snapshot(c)
    c = run(c, "driver-decision", reference="diff-3", **args)
    assert snapshot(c)["people"] == after["people"]
    assert len(terms.grievances(after, first["person"], MCLAREN)) == 1
    assert any(
        r["kind"] == "hierarchy" and r["trust_change"] < 0
        for r in after["relationships"].values()
    )
    with pytest.raises(RuleError, match="другими"):
        run(c, "driver-decision", reference="diff-3", **dict(args, severity=3))
    doc = service.export_save(c["id"])
    assert service.export_save(service.import_save(doc)["id"]) == doc


def test_negotiated_status_allocation_and_refusal():
    c = create()
    first, second = grid()
    pid = second["person"]
    c = run(c, "driver-review", seat=first["id"], status="first", compensation_cents=0)
    assert driver_lineup(c["id"])["history"][0]["kind"] == "refused"
    c = run(
        c, "driver-review", seat=first["id"], status="first", compensation_cents=1000000
    )
    state = snapshot(c)
    assert any(
        p["source"] == "signing" and p["delta_cents"] < 0 for p in state["ledger"]
    )
    assert state["seats"][second["id"]][0]["driver_status"] == "second"

    def part(key, tier, allowed):
        return terms.ResourceOption(
            instance=key,
            specification="S" + str(tier),
            merit=tier,
            allowed_entries=allowed,
        )

    ids = [second["id"], first["id"]]
    entries = [first["entry"], second["entry"]]
    fast = part("one", 2, entries)
    forbidden = part("illegal", 100, [])
    skills = deepcopy(state["people"][pid]["skills"])
    assert terms.recommend(state, WORLD, ids, [forbidden, fast]) == {entries[0]: "one"}
    assert terms.recommend(state, WORLD, ids, [fast, part("two", 2, entries)]) == dict(
        zip(entries, ["one", "two"])
    )
    assert terms.recommend(state, WORLD, ids, [fast, part("old", 1, entries)]) == dict(
        zip(entries, ["one", "old"])
    )
    assert state["people"][pid]["skills"] == skills
    c = run(
        c, "driver-review", seat=first["id"], status="equal", compensation_cents=1000000
    )
    state = snapshot(c)
    state["people"][pid].update(ambition=100, loyalty=35)
    terms.review(
        state,
        WORLD,
        terms.Review(seat=first["id"], status="first", compensation_cents=1000000),
        MCLAREN,
    )
    assert (
        state["lineup"]["history"][-1]["kind"] == "refused"
        and state["seats"][second["id"]][0]["driver_status"] == "equal"
    )


def test_replacement_licence_schedule_cost_recovery_and_replay():
    org = "team-abt-sportsline"
    c = create(org, "manager", "dtm")
    seat, teammate = grid(org, "dtm")
    candidate = "agent-season25-1"
    fact = absence(c, seat, "suspension", "stewards")
    c = run(c, "driver-absence", **fact)
    w = registration(c, seat, [candidate, teammate["person"]])
    c = run(c, "driver-registration", **w)
    options = driver_lineup(c["id"])["windows"][0]["candidates"]
    assert options[0]["reason"] is None and "календаря" in options[1]["reason"]
    args = dict(seat=seat["id"], round=w["round"], person=candidate)
    before = snapshot(c)
    with pytest.raises(RuleError):
        run(c, "driver-nominate", **dict(args, person=teammate["person"]))
    request = cmd(c, "driver-nominate", **args)
    c = service.execute(c["id"], request)
    assert service.execute(c["id"], request) == c
    assert (
        c["account"]["cash_cents"]
        == before["accounts"][org]["cash_cents"] - options[0]["fee"]
    )
    state = snapshot(c)
    assert state["seats"][seat["id"]] == before["seats"][seat["id"]]
    event = availability.event_for(WORLD, w["round"])
    assert availability.participant(state, seat["id"], event["start"]) == candidate
    state["date"] = event["start"]
    backing.record_result(
        state,
        candidate,
        "race-1",
        state["date"],
        entry=seat["entry"],
        world=WORLD,
        place=4,
    )
    with pytest.raises(RuleError, match="назначение"):
        backing.record_result(
            state,
            seat["person"],
            "race-1",
            state["date"],
            entry=seat["entry"],
            world=WORLD,
            place=4,
        )
    assert state["starts"][candidate]["race-1"]["place"] == 4
    with pytest.raises(RuleError):
        run(
            c,
            "driver-clearance",
            reference="return",
            date=c["date"],
            absence=fact["reference"],
            authority="medical",
            evidence="Выписка",
        )
    c = run(
        c,
        "driver-clearance",
        reference="return",
        date=c["date"],
        absence=fact["reference"],
        authority="stewards",
        evidence="Решение коллегии",
    )
    assert seat["person"] in c["crews"][seat["entry"]]
    assert (
        availability.participant(snapshot(c), seat["id"], event["start"])
        == seat["person"]
    )
    doc = service.export_save(c["id"])
    assert service.export_save(service.import_save(doc)["id"]) == doc


def test_wec_npc_registration_crew_and_no_eligible_reserve():
    c = create()
    seat = next(
        s
        for s in WORLD["assignments"].values()
        if s["series"] == "wec" and s["position"] == "driver" and s["entry"]
    )
    candidate = "agent-season25-2"
    c = run(c, "driver-absence", **absence(c, seat, "injury"))
    w = registration(c, seat, [candidate])
    w["driving_plans"] = {
        candidate: {
            p: dict(minimum_minutes=40, maximum_minutes=180, planned_minutes=120)
            for p in [*w["crew"], candidate]
        }
    }
    w["running_minutes"] = 120 * (len(w["crew"]) + 1)
    for i, extra in enumerate(
        [
            dict(approved=[]),
            dict(driving_time_approved=False),
            dict(running_minutes=1),
            dict(crew=[]),
            dict(phase="race"),
        ]
    ):
        c = run(
            c, "driver-registration", **dict(w, **extra, reference="blocked-" + str(i))
        )
        assert not snapshot(c)["lineup"]["covers"]
    c = run(c, "driver-registration", **w)
    state = snapshot(c)
    assert availability.participant(state, seat["id"], w["deadline"]) == candidate
    assert len(state["lineup"]["covers"]) == 1
    assert (not state["starts"]) and state["seats"][seat["id"]][0]["person"] == seat[
        "person"
    ]
    assert not driver_lineup(c["id"])["history"]
    f1 = grid()[0]
    event = next(
        e for e in WORLD["events"] if e["kind"] == "round" and e["series"] == "f1"
    )
    assert availability.candidate(state, WORLD, f1, event, candidate, None) is not None


def test_paid_reserve_combined_duties_and_approved_work():
    org = "team-abt-sportsline"
    c = create(org, "manager", "dtm")
    seat = grid(org, "dtm")[0]
    pid = "agent-season25-1"
    start = shifted(c["date"], 3)
    c = run(
        c,
        "offer-send",
        seat=org + ":dtm:reserve",
        person=pid,
        start=start,
        end="2026-01-01",
        salary_cents=1000000,
        bonus_cents=0,
        combined_duties=True,
        outside_starts=True,
    )
    while c["date"] < start:
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    reserve = next(r for r in driver_lineup(c["id"])["drivers"] if r["person"] == pid)
    assert (
        reserve["duties"] == ["reserve", "test"] and reserve["salary_cents"] == 1000000
    )
    c = run(
        c,
        "confirmed-work",
        facts=[
            dict(
                event_id="test-report",
                date=c["date"],
                org=org,
                person=pid,
                role="driver",
                kind="track-test",
                skills=["Повороты"],
                difficulty=65,
                result="completed",
                context=dict(series="dtm"),
            )
        ],
    )
    assert driver_lineup(c["id"])["drivers"][-1]["work"][-1]["kind"] == "track-test"
    c = run(c, "prepare-program", kind="simulator", participant=pid)
    plan = c["preparations"][-1]
    assert plan["names"] == [WORLD["names"][pid]]
    while c["date"] < plan["end"]:
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    assert c["preparations"][-1]["status"] == "completed"
    c = run(c, "driver-absence", **absence(c, seat))
    w = registration(c, seat, [pid])
    c = run(c, "driver-registration", **w)
    cash = c["account"]["cash_cents"]
    c = run(c, "driver-nominate", seat=seat["id"], round=w["round"], person=pid)
    assert c["account"]["cash_cents"] == cash
    assert availability.participant(snapshot(c), seat["id"], w["deadline"]) == pid


def test_upgrade_of_financial_career_preserves_active_contract_and_wallet(tmp_path):
    from hashlib import sha256
    from . import storage, domain
    from .catalog import WORLD as starting_grid

    c = create()
    legacy = service.export_save(c["id"])
    state = legacy["payload"]["state"]
    state.pop("lineup")
    for aid, seat in WORLD["assignments"].items():
        if seat.get("duty"):
            del state["seats"][aid]
        elif seat["position"] == "driver":
            for row in state["seats"][aid]:
                del row["driver_status"]
    # Replay a pre-feature signing receipt before activating on its actual revision.
    pid = "driver-001"
    args = dict(seat=grid()[0]["id"])
    domain.apply(state, starting_grid, "staff-release", args)
    state["ledger"].sort(key=lambda p: (p["date"], p["org"], p["key"]))
    legacy["payload"]["commands"].append(
        dict(command_id="before", revision=0, action="staff-release", staff=args)
    )
    legacy["sha256"] = sha256(storage.dump(legacy["payload"]).encode()).hexdigest()
    migrated = service.import_save(legacy)
    after = snapshot(migrated)
    assert after["lineup"]["since"] == 1 and after["ledger"] == state["ledger"]
    assert (
        after["accounts"] == state["accounts"]
        and after["people"][pid] == state["people"][pid]
    )
    for aid, rows in state["seats"].items():
        assert [
            {k: v for k, v in r.items() if k != "driver_status"}
            for r in after["seats"][aid]
        ] == rows
    doc = service.export_save(migrated["id"])
    assert service.export_save(service.import_save(doc)["id"]) == doc


def test_manager_mandate_and_strategy_handoff():
    c = create(role="owner")
    seat = grid()[0]
    with pytest.raises(RuleError, match="менеджер"):
        run(
            c,
            "driver-review",
            seat=seat["id"],
            status="first",
            compensation_cents=100000,
        )
    state = snapshot(c)

    def priority(**changes):
        context = dict(
            seat=seat["id"],
            permitted=True,
            risk_acceptable=True,
            championship_priority=False,
        )
        return terms.strategy_priority(
            state, WORLD, terms.StrategyContext(**dict(context, **changes))
        )

    assert priority() == "equal"
    assert priority(championship_priority=True) == "championship"
    assert priority(championship_priority=True, risk_acceptable=False) == "hold"
    assert priority(permitted=False) == "hold"


def test_alternating_equal_priority_and_broken_first_driver_agreement():
    c = create()
    left, right = grid()
    args = dict(
        date=c["date"],
        resource="spare",
        reason="Выдан единственный запасной комплект.",
        evidence="Накладная",
        severity=1,
    )
    for index, (seat, peer) in enumerate(
        [(left, right), (right, left), (left, right), (right, left)]
    ):
        c = run(
            c,
            "driver-decision",
            **args,
            seat=seat["id"],
            favoured_seat=peer["id"],
            reference=f"spare-{index}",
        )
    assert not any(r["kind"] == "grievance" for r in driver_lineup(c["id"])["history"])
    c = run(
        c, "driver-review", seat=left["id"], status="first", compensation_cents=1000000
    )
    c = run(
        c,
        "driver-decision",
        **args,
        seat=left["id"],
        favoured_seat=right["id"],
        reference="spare-first",
    )
    assert driver_lineup(c["id"])["history"][0]["kind"] == "grievance"
