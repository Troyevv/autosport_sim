import copy
from concurrent.futures import ThreadPoolExecutor

import pytest

from . import domain, employment, personnel, service, staff_desk, team_staff
from .catalog import WORLD
from .test_career import MCLAREN, create

GT = WORLD["entries"]["dtm-1"]["crew"][0]
SEAT = next(
    a["id"]
    for a in WORLD["assignments"].values()
    if a["position"] == "driver" and a["entry"] == "f1-4"
)


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


def cmd(c, action, **staff):
    return service.Command(
        action=action,
        staff=staff or None,
        revision=c["revision"],
        command_id=f"cmd-{c['revision']}",
    )


def run(c, action, **staff):
    return service.execute(c["id"], cmd(c, action, **staff))


def snapshot(c):
    return service.export_save(c["id"])["payload"]["state"]


def terms(**overrides):
    return dict(
        dict(
            person=GT,
            seat=SEAT,
            start="2025-02-05",
            end="2025-02-20",
            salary_cents=2000000,
            bonus_cents=1000,
        ),
        **overrides,
    )


def test_counter_transfer_and_partial_month_settlement():
    c = create()
    before = snapshot(c)
    person = before["people"][GT]
    old_seat, old = personnel.bookings(before, GT)[0]
    old_org = WORLD["assignments"][old_seat]["org"]
    with pytest.raises(domain.RuleError, match="занято"):
        run(c, "offer-send", **terms())
    c = run(c, "staff-release", seat=SEAT)
    assert not c["crews"]["f1-4"]
    target = employment.ask(before, WORLD, person, WORLD["assignments"][SEAT])
    c = run(c, "offer-send", **terms(salary_cents=target * 4 // 5))
    assert c["offers"][0]["status"] == "sent"
    c = run(c, "advance")
    offer = c["offers"][0]
    assert offer["status"] == "countered"
    balance = c["account"]["cash_cents"]
    accept = cmd(c, "offer-accept", offer=offer["id"])
    with ThreadPoolExecutor(2) as workers:
        first, second = workers.map(
            lambda _: service.execute(c["id"], accept), range(2)
        )
    assert first == second
    c = first
    with pytest.raises(domain.RuleError, match="закрыты"):
        run(c, "offer-accept", offer=offer["id"])
    assert (
        c["account"]["cash_cents"]
        == balance - old["buyout_cents"] - offer["bonus_cents"]
    )
    state = snapshot(c)
    assert (
        state["accounts"][old_org]["cash_cents"]
        == before["accounts"][old_org]["cash_cents"] + old["buyout_cents"]
    )
    assert staff_desk.dossier(state, WORLD, GT)["current"]["org"] == old_org
    c = run(c, "advance")
    state = snapshot(c)
    dossier = staff_desk.dossier(state, WORLD, GT)
    assert c["date"] == "2025-02-05"
    assert dossier["person"]["face"] == person["face"] and dossier["person"]["id"] == GT
    assert len(dossier["history"]) == 2 and dossier["current"]["org"] == MCLAREN
    assert (
        dossier["person"]["adaptation"]["Formula"] > 0
        and dossier["person"]["adaptation"]["GT"] >= 80
    )
    assert c["crews"]["f1-4"] == [GT] and GT not in c["crews"]["dtm-1"]
    assert c["offers"][0]["status"] == "accepted"
    while c["date"] < "2025-03-01":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    state = snapshot(c)
    assert staff_desk.dossier(state, WORLD, GT)["current"] is None
    payroll = [r for r in c["ledger"] if r["source"] == "staff-payroll"]
    base_salary = before["seats"][SEAT][0]["salary_cents"]
    assert [r["delta_cents"] for r in payroll] == [
        -(
            before["accounts"][MCLAREN]["payroll_cents"]
            - base_salary
            + offer["salary_cents"] * 15 // 28
        )
    ]
    archive = service.export_save(c["id"])
    assert service.export_save(service.import_save(archive)["id"]) == archive


def test_traits_training_dates_recovery_and_save():
    c = create()
    pid = WORLD["assignments"][SEAT]["person"]
    original = snapshot(c)["people"][pid]
    skill = min(original["skills"], key=original["skills"].get)
    c = run(c, "staff-train", seat=SEAT, skill=skill)
    stored = service.export_save(c["id"])
    loaded = service.import_save(stored)
    assert stored == service.export_save(loaded["id"])
    assert snapshot(c)["people"][pid]["fatigue"] == 18
    for _ in range(2):
        c = run(c, "advance")
        if (
            snapshot(c)["people"][pid]["courses"] == 1
            and not snapshot(c)["people"][pid]["training"]
        ):
            assert c["date"] == "2025-02-08"
            c = run(c, "staff-train", seat=SEAT, skill=skill)
    while c["date"] < "2025-02-15":
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    p = snapshot(c)["people"][pid]
    assert p["courses"] == 2 and p["training"] is None
    assert p["skills"][skill] > original["skills"][skill]
    assert p["skills"][skill] <= p["potential"]
    assert {"focused", "practiced"} <= {t["id"] for t in p["traits"]}
    test_person = copy.deepcopy(p)
    test_person.update(
        specialization="Дождь",
        morale=70,
        fatigue=0,
        traits=[
            dict(id="specialist", start="2025-02-01", end=None),
            dict(id="rain", start="2025-02-01", end=None),
            dict(id="focused", skill="Дождь", start="2025-02-15", end="2025-02-25"),
        ],
    )
    test_person["skills"]["Дождь"] = 90

    def rain(day, wet=False):
        return personnel.evaluate(test_person, WORLD, day, wet=wet)["values"]["Дождь"]

    assert (
        rain("2025-02-14"),
        rain("2025-02-15"),
        rain("2025-02-24", True),
        rain("2025-02-25"),
    ) == (93, 97, 100, 93)
    assert test_person["skills"]["Дождь"] == 90
    for bad in (101, -1, True, 42.5):
        test_person["skills"][skill] = bad
        with pytest.raises(domain.RuleError):
            personnel.evaluate(test_person, WORLD, c["date"])


@pytest.mark.parametrize("factor,status", [(1, "rejected"), (80, "expired")])
def test_decline_or_expire_without_charge(factor, status):
    c = run(create(), "staff-release", seat=SEAT)
    state = snapshot(c)
    ask = employment.ask(state, WORLD, state["people"][GT], WORLD["assignments"][SEAT])
    c = run(c, "offer-send", **terms(salary_cents=ask * factor // 100, bonus_cents=0))
    c = run(c, "advance")
    if status == "expired":
        assert c["offers"][0]["status"] == "countered"
        c = run(c, "advance")
        assert c["date"] == c["offers"][0]["deadline"]
    assert c["offers"][0]["status"] == status and c["notices"]
    assert snapshot(c)["seats"] == state["seats"]
    assert c["account"] == state["accounts"][MCLAREN]


def test_regulation_mid_round_and_manufacturer_assignments():
    c = run(create(), "staff-release", seat=SEAT)
    with pytest.raises(domain.RuleError, match="уик-энда|этапе"):
        run(c, "offer-send", **terms(start="2025-03-15", end="2025-05-01"))
    supplier = "supplier-goodyear"
    c = create(supplier, "manufacturer", "wec")
    role = "technical-advisor"
    aid = supplier + ":" + role
    seats = {a["position"] for a in c["assignments"]}
    assert {"tyres", "tyre-construction", "analyst", role} <= seats
    assert not {"engines", "transmissions"} & seats
    entry = next(
        e
        for e in WORLD["entries"].values()
        if WORLD["cars"][e["car"]]["suppliers"]["tyre"] == supplier
    )
    payload = dict(
        seat=aid, product="tyre", entry=entry["id"], start=c["date"], end="2025-02-12"
    )
    c = run(c, "advisor-assign", **payload)
    with pytest.raises(domain.RuleError, match="занят"):
        run(c, "advisor-assign", **payload)
    c = run(
        c, "advisor-assign", **{**payload, "start": payload["end"], "end": "2025-02-13"}
    )
    from .supply import support_on, visible_channels, ObservationScope

    saved = snapshot(c)
    assert len(saved["support"]) == 2
    advisor = WORLD["assignments"][aid]["person"]
    active_assignment = support_on(saved, advisor, "2025-02-12")
    assert active_assignment.start == "2025-02-12"
    assert support_on(saved, advisor, "2025-02-13") is None
    observation = ObservationScope(
        entry["org"],
        entry["car"],
        "practice-1",
        "practice",
        supplier,
        "tyre",
        "v1",
        "set-1",
    )
    assert visible_channels(
        active_assignment, observation, "2025-02-12", supplier, {"wear", "setup"}
    ) == {"wear"}
    with pytest.raises(domain.RuleError, match="обязательство"):
        run(c, "staff-release", seat=aid)
    c = run(c, "staff-release", seat=supplier + ":analyst")
    other = WORLD["assignments"]["supplier-michelin:analyst"]["person"]
    c = run(c, "offer-send", **terms(person=other, seat=supplier + ":analyst"))
    c = run(run(c, "advance"), "advance")
    state = snapshot(c)
    profile = team_staff.assigned_profiles(state, WORLD, supplier, "wec")[
        supplier + ":analyst"
    ]
    assert profile["person"] == other and "Дефекты" in profile["values"]
    assert len(c["collectives"]) == 2 and all(
        g["capacity"] > 0 for g in c["collectives"]
    )
    assert not any(
        p["position"] in {"mechanic", "worker"} for p in state["people"].values()
    )


def test_season_replay_including_simultaneous_expiries():
    c = create()
    while c["next_date"] or c["pending"]:
        c = run(c, c["briefing_action"] if c["pending"] else "advance")
    assert c["date"] == employment.HORIZON
    archive = service.export_save(c["id"])
    assert service.export_save(service.import_save(archive)["id"]) == archive


def test_session_uses_crew_seat_role_and_weather_and_projects_use_the_same_skills():
    c = create()
    state = snapshot(c)
    round_ = next(
        e for e in WORLD["events"] if e["kind"] == "round" and e["series"] == "dtm"
    )
    state["date"] = round_["start"]
    dry = team_staff.crew_for_session(state, WORLD, "dtm-1", round_)[0]
    wet = team_staff.crew_for_session(state, WORLD, "dtm-1", round_, wet=True)[0]
    assert dry["person"] == wet["person"] == GT
    assert wet["values"]["Дождь"] > dry["values"]["Дождь"]
    assert {"Старт", "Оценка риска", "Топливо", "Обратная связь"} <= wet[
        "values"
    ].keys()
    assert wet["preferences"] == state["people"][GT]["preferences"]
    with pytest.raises(domain.RuleError, match="соответствует"):
        team_staff.crew_for_session(state, WORLD, "f1-4", round_)
    state["seats"][
        next(
            a["id"]
            for a in WORLD["assignments"].values()
            if a["entry"] == "dtm-1" and a["position"] == "driver"
        )
    ][0]["end"] = state["date"]
    with pytest.raises(domain.RuleError, match="Численность"):
        team_staff.crew_for_session(state, WORLD, "dtm-1", round_)
    roles = team_staff.assigned_profiles(state, WORLD, MCLAREN, "f1")
    assert "Прижим" in roles[MCLAREN + ":aero:f1"]["values"]
    assert all(r["position"] != "driver" for r in roles.values())


def test_midmonth_v2_migration_does_not_create_retroactive_wages():
    from .roster_upgrade import previous_world, upgrade_personnel

    world = previous_world()
    state = domain.new_world(
        world, dict(name="Тест", seed=42, org=MCLAREN, role="manager", series="f1")
    )
    domain.apply(state, world, "advance")
    opening = state["accounts"][MCLAREN]["payroll_cents"]
    upgrade_personnel(state)
    individual = sum(
        r["salary_cents"] * 16 // 28
        for a, rows in state["seats"].items()
        if WORLD["assignments"][a]["org"] == MCLAREN
        for r in rows
    )
    employment.advance(state, WORLD, "2025-03-01")
    posting = next(
        r
        for r in state["ledger"]
        if r["org"] == MCLAREN and r["source"] == "staff-payroll"
    )
    assert posting["delta_cents"] == -(opening + individual)


def test_birthday_decay_fatigue_and_potential_ceiling():
    state = snapshot(create())
    p = state["people"][GT]
    p["birth_date"] = "1988-02-02"
    p["skills"]["Дождь"] = p["potential"] - 1
    p["training"] = dict(start="2025-02-01", end="2025-02-08", skill="Дождь")
    p["fatigue"] = 18
    stamina = p["skills"]["Выносливость"]
    employment.advance(state, WORLD, "2025-02-08")
    assert p["skills"]["Выносливость"] == stamina - 1
    assert p["skills"]["Дождь"] == p["potential"] and p["fatigue"] == 11
    employment.advance(state, WORLD, "2025-02-18")
    assert (
        p["fatigue"] == 0
        and not personnel.evaluate(p, WORLD, "2025-02-18")["traits"][-1]["active"]
    )


def test_next_season_signing_reserves_only_the_future_slot():
    c = create()
    original = c["crews"]["f1-4"]
    offer = terms(start="2026-01-01", end="2028-01-01")
    c = run(c, "offer-send", **offer)
    c = run(c, "advance")
    assert (
        c["offers"][0]["status"] == "accepted" and c["offers"][0]["buyout_cents"] == 0
    )
    assert c["crews"]["f1-4"] == original
    with pytest.raises(domain.RuleError, match="занято"):
        run(
            c,
            "offer-send",
            **{**offer, "person": WORLD["entries"]["dtm-33"]["crew"][0]},
        )
    with pytest.raises(domain.RuleError, match="обязательство"):
        run(c, "offer-send", **offer)
    assert domain.occupant_on(snapshot(c)["seats"][SEAT], "2026-01-01") == GT
