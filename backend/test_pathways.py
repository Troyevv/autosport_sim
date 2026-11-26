import copy

import pytest

from . import backing, development_path, employment, personnel, service, staff_desk
from .catalog import WORLD
from .domain import RuleError
from .test_career import MCLAREN, create
from .test_personnel import run, snapshot, terms


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def test_academy_employment_scouting_and_renewal_are_independent():
    c = create(role="owner")
    pid = "driver-051"
    before = snapshot(c)
    appointment = personnel.bookings(before, pid)
    org = WORLD["assignments"][appointment[0][0]]["org"]
    c = run(c, "scout-driver", person=pid)
    with pytest.raises(RuleError, match="семь дней"):
        run(c, "scout-driver", person=pid)
    dossier = staff_desk.dossier(snapshot(c), WORLD, pid)
    (report,) = dossier["reports"]
    assert report["low"] <= before["people"][pid]["potential"] <= report["high"]
    assert report["high"] > report["low"] and "potential" not in dossier["person"]
    assert all(
        "potential" not in a["occupant"]
        for a in c["assignments"]
        if a["position"] == "driver" and a["occupant"]
    )
    c = run(
        c,
        "academy-enroll",
        academy="mclaren-development",
        person=pid,
        monthly_cents=130000,
        end="2025-05-01",
        option=True,
        priority=True,
        recipient=org,
    )
    (deal,) = c["scholarships"]
    c = run(c, "academy-right", agreement=deal["id"])
    with pytest.raises(RuleError, match="использовано"):
        run(c, "academy-right", agreement=deal["id"])
    state = snapshot(c)
    s = state["scholarships"][deal["id"]]
    f = state["funding"][deal["id"]]
    assert s["end"] == f["end"] == "2025-07-30"
    assert f["payer"] == MCLAREN and f["team"] == org and f["portable"] is False
    assert personnel.bookings(state, pid) == appointment
    assert {a["position"] for a in c["assignments"] if a.get("academy")} == {
        "academy-director",
        "coach",
        "scout",
        "academy-analyst",
    }
    c = run(c, "prepare-program", kind="academy")
    trainee, coach = c["preparations"][0]["participants"]
    while c["date"] < "2025-03-01":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    state = snapshot(c)
    assert state["experience_by_skill"][trainee]["Повороты"]["work"] > 0
    assert state["experience_by_skill"][coach]["Методика"]["work"] > 0
    assert state["academies"]["mclaren-development"]["spent_cents"] == 130000
    ledger = [
        v
        for v in state["ledger"]
        if v["source"] == "driver-backing" and deal["id"] in v["key"]
    ]
    assert {(v["org"], v["delta_cents"]) for v in ledger} == {
        (MCLAREN, -130000),
        (org, 130000),
    }
    assert personnel.bookings(state, pid) == appointment
    save = service.export_save(c["id"])
    assert save == service.export_save(service.import_save(save)["id"])
    # A competing organization sees its own scouting file and the academy's exclusive window.
    state["setup"].update(org=org, role="manager")
    assert not staff_desk.dossier(state, WORLD, pid)["reports"]
    with pytest.raises(RuleError, match="приоритет"):
        backing.right_of_first_offer(state, pid, org, "2025-02-10")
    backing.right_of_first_offer(state, pid, org, "2025-02-11")


def test_manager_interests_and_authority_change_actual_terms():
    c = create(role="owner")
    before = snapshot(c)
    manager = before["people"][c["mandate"]["manager"]]
    seat = WORLD["assignments"][MCLAREN + ":manager"]
    ask = employment.ask(before, WORLD, manager, seat)
    c = run(
        c,
        "manager-mandate",
        goal="technical",
        priority="required",
        horizon="intermediate",
        autonomy=15,
        limit_cents=500000,
    )
    assert c["mandate"]["trust"] < before["mandates"][MCLAREN]["trust"]
    assert (
        c["mandate"]["satisfaction"] < 70 and "пересмотреть" in c["mandate"]["response"]
    )
    state = snapshot(c)
    assert employment.ask(state, WORLD, manager, seat) > ask
    with pytest.raises(RuleError, match="полномочия"):
        run(c, "offer-send", **terms())
    with pytest.raises(RuleError, match="уже действует"):
        run(
            c,
            "manager-mandate",
            goal="technical",
            priority="required",
            horizon="intermediate",
            autonomy=15,
            limit_cents=500000,
        )
    state["setup"]["role"] = "manager"
    target = terms()
    state["seats"][target["seat"]] = []
    with pytest.raises(RuleError, match="лимит"):
        employment.check_terms(state, WORLD, target)
    p = state["people"]["driver-045"]
    assert development_path.preference(
        manager, p, 80, 700000, state["date"]
    ) > development_path.preference(manager, p, 80, -700000, state["date"])


def test_talent_finances_portability_guarantee_and_salary():
    pid = "driver-045"
    org = WORLD["entries"]["f2-4"]["org"]
    c = create(org, "manager", "f2")
    state = snapshot(c)
    seats = {a["person"]: a["id"] for a in WORLD["assignments"].values()}
    rich = state["people"]["driver-048"]
    poor = next(
        p
        for p in state["people"].values()
        if p["position"] == "driver"
        and p["potential"] == rich["potential"]
        and not any(f["person"] == p["id"] for f in state["funding"].values())
    )
    assert rich["potential"] == poor["potential"] >= 90
    market = {r["id"]: r for r in staff_desk.directory(state, WORLD)}
    assert market[rich["id"]]["financial"]["support_cents"] > 0
    assert market[poor["id"]]["financial"]["support_cents"] == 0
    assert all("potential" not in market[p["id"]] for p in [poor, rich])
    with pytest.raises(RuleError, match="гарантировано"):
        run(c, "staff-release", seat=seats["driver-047"])
    fixed = next(r for r in state["funding"].values() if r["person"] == "driver-047")
    c = run(c, "funding-end", agreement=fixed["id"])
    assert (
        c["account"]["cash_cents"]
        == state["accounts"][org]["cash_cents"] - fixed["exit_cents"]
    )
    c = run(c, "staff-release", seat=seats["driver-047"])
    c = run(
        c, "offer-send", **terms(person=pid, seat=seats["driver-047"], end="2025-04-01")
    )
    while c["date"] < "2025-03-01":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    assert c["offers"][0]["status"] == "accepted"
    state = snapshot(c)
    old = WORLD["assignments"][seats[pid]]["org"]
    family = next(r for r in state["funding"].values() if r["person"] == pid)
    incoming = {
        r["org"]: r["delta_cents"]
        for r in state["ledger"]
        if family["id"] in r["key"] and r["delta_cents"] > 0
    }
    assert incoming == {org: 420000 * 24 // 28, old: 420000 * 4 // 28}
    assert family["paid_cents"] == sum(incoming.values())
    assert state["seats"][seats["driver-047"]][-1]["salary_cents"] == 2000000
    assert state["funding"][fixed["id"]]["status"] == "ended"
    assert any(
        r["source"] == "staff-payroll" and r["delta_cents"] < 0 for r in c["ledger"]
    )


def test_result_conditions_licence_rules_and_default():
    state = snapshot(create())
    pid = "driver-049"
    grant = next(r for r in state["funding"].values() if r["person"] == pid)
    day = personnel.shifted(grant["start"], 90)
    for event, place in (("round-a", 11), ("round-b", 12)):
        for _ in range(2):
            backing.record_result(
                state, pid, event, "2025-02-12", place=place, licence_points=2
            )
    assert state["people"][pid]["credentials"]["points"] == 4
    good = copy.deepcopy(state)
    backing.record_result(good, pid, "round-c", "2025-03-12", place=10)
    backing.condition_review(good, day)
    assert good["funding"][grant["id"]]["status"] == "active"
    backing.condition_review(state, day)
    assert grant["status"] == "ended"
    junior = dict(
        state["people"][pid],
        birth_date="2012-03-12",
        credentials={"licences": ["junior"], "points": 4},
    )
    rules = dict(
        min_age=12,
        max_age=14,
        licence="junior",
        min_points=5,
        assignment_rules={"test": {"min_points": 0}},
    )
    assert "баллов" in development_path.eligibility(junior, rules, day)
    assert development_path.eligibility(junior, rules, day, "test") is None
    assert "Возраст" in development_path.eligibility(
        junior, rules, "2027-03-12", "test"
    )
    c = create()
    while c["date"] < "2025-04-01":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    exhausted = next(
        r for r in snapshot(c)["funding"].values() if r["person"] == "driver-050"
    )
    assert (
        exhausted["paid_cents"] == 100000
        and exhausted["status"] == "ended"
        and sum(exhausted["arrears"].values()) == 100000
    )


def test_factory_agreement_client_authority_and_exclusive_negotiation_window():
    state = snapshot(create(role="manufacturer", org="supplier-ferrari", series="f1"))
    pid = WORLD["entries"]["f1-16"]["crew"][0]
    org = WORLD["entries"]["f1-16"]["org"]
    terms = dict(
        person=pid,
        recipient=org,
        monthly_cents=77000,
        end="2025-11-01",
        portable=False,
        guarantee=True,
    )
    backing.command(state, WORLD, "manufacturer-backing", terms)
    fund = next(r for r in state["funding"].values() if r["person"] == pid)
    with pytest.raises(RuleError, match="гарантировано"):
        backing.can_leave(state, pid, org, state["date"])
    backing.command(state, WORLD, "funding-end", dict(agreement=fund["id"]))
    backing.can_leave(state, pid, org, state["date"])
    with pytest.raises(RuleError, match="гарантии"):
        backing.command(
            state, WORLD, "manufacturer-backing", {**terms, "person": "driver-051"}
        )
    state = snapshot(create())
    s = next(v for v in state["scholarships"].values() if v["person"] == "driver-046")
    backing.command(state, WORLD, "academy-right", dict(agreement=s["id"]))
    with pytest.raises(RuleError, match="приоритет"):
        backing.right_of_first_offer(state, s["person"], MCLAREN, state["date"])
    backing.right_of_first_offer(state, s["person"], MCLAREN, s["priority_until"])
