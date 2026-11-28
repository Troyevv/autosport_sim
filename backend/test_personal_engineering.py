from collections import Counter
from copy import deepcopy

import pytest

from . import (
    domain,
    employment,
    personal_engineering as engineering,
    service,
    storage,
    teamwork,
)
from .catalog import lineup_for
from .finance import market
from .supplier_engineering import agreement

MERCEDES = "supplier-mercedes"
WILLIAMS = "team-williams-racing"


@pytest.fixture
def career(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    c = service.create(
        service.CareerInput(
            name="Испытания", role="manufacturer", org=MERCEDES, series="f1", seed=64
        )
    )
    with storage.transaction() as db:
        state = storage.checkpoint(db, c["id"])
    return c, state, lineup_for(state)


def current(s, w, day):
    return [r for r in engineering.appointments(s, w) if r["start"] <= day < r["end"]]


def test_complete_opening_and_distinct_employers(career):
    c, s, w = career
    seats = [
        a
        for a in w["assignments"].values()
        if a["position"] == "race-engineer" and a["entry"]
    ]
    assert Counter(a["entry"] for a in seats) == dict.fromkeys(w["entries"], 1)
    engineers = [engineering.working_person(s, a, s["date"]) for a in seats]
    assert len(engineers) == len(set(engineers)) == 447 and None not in engineers
    expected = {(d["sponsor"], d["org"]) for d in s["market"]["supplies"].values()}
    links = current(s, w, s["date"])
    assert Counter((r["employer"], r["client"]) for r in links) == dict.fromkeys(
        expected, 1
    )
    assert len({r["advisor"] for r in links}) == len(expected) == 377
    employed = {
        r["person"]: a["org"]
        for a in w["assignments"].values()
        for r in s["seats"][a["id"]]
        if r["start"] <= s["date"] and (not r["end"] or s["date"] < r["end"])
    }
    assert all(employed[r["advisor"]] == r["employer"] for r in links)
    assert all(r["salary_cents"] > 0 for r in links)
    assert not set(engineers) & {r["advisor"] for r in links}
    by_face = [p["face"] for p in s["people"].values()]
    assert None not in by_face and len(by_face) == len(set(by_face))


def test_cover_exclusive_rights_payroll_and_replay(career):
    c, s, w = career
    day = s["date"]
    entries = [
        e
        for e in w["entries"].values()
        if e["org"] == WILLIAMS and e["championship"] == "f1"
    ]
    reserve = MERCEDES + ":technical-advisor:reserve"
    relief = s["seats"][reserve][0]["person"]
    initial = engineering.grant(
        s, w, entries[0], "engine", day, agreement(s, w, entries[0], "engine")
    )
    payload = dict(
        seat=reserve,
        entry=entries[0]["id"],
        product="engine",
        start=day,
        end="2025-02-04",
    )
    cmd = service.Command(
        command_id="cover", revision=0, action="advisor-assign", staff=payload
    )
    service.execute(c["id"], cmd)
    service.execute(c["id"], cmd)
    saved = service.export_save(c["id"])
    s = saved["payload"]["state"]
    assert s["accounts"][MERCEDES]["payroll_cents"] == c["account"]["payroll_cents"]
    for e in entries:
        for axis in ("engine", "transmission"):
            t = agreement(s, w, e, axis)
            assert t["maker"] == MERCEDES
            r = engineering.grant(s, w, e, axis, day, t)
            assert (
                r["advisor"] == relief
                and r["agreement"] == t["id"]
                and r["product"] == axis
            )
            assert (
                engineering.grant(s, w, e, axis, payload["end"], t)["advisor"]
                == initial["advisor"]
            )
            assert engineering.grant(s, w, e, axis, day, dict(t, support=False)) is None
    other = next(
        e
        for e in w["entries"].values()
        if e["org"] != WILLIAMS
        and w["cars"][e["car"]]["suppliers"].get("engine") == MERCEDES
    )
    with pytest.raises(domain.RuleError, match="занят"):
        employment.command(s, w, "advisor-assign", dict(payload, entry=other["id"]))
    desk_grants = engineering.telemetry_grants(s, w, MERCEDES)
    assert all(r["client"] == WILLIAMS for r in desk_grants if r["advisor"] == relief)
    assert len([r for r in s["support"] if r.get("pair")]) == 1
    assert service.export_save(service.import_save(saved)["id"]) == saved
    for d in s["market"]["supplies"].values():
        if d["sponsor"] == MERCEDES and d["org"] == WILLIAMS:
            market.end_supply(s, WILLIAMS, d["id"])
    assert not any(
        r["client"] == WILLIAMS and r["employer"] == MERCEDES
        for r in current(s, w, day)
    )


def test_vacancy_hire_and_temporary_crew_engineer(career):
    _, s, w = career
    e = next(
        e
        for e in w["entries"].values()
        if e["championship"] == "wec" and len(e["crew"]) == 3
    )
    org = e["org"]
    s["setup"].update(org=org, role="manager")
    post = w["assignments"][org + ":race-engineer:reserve"]
    crew_seat = next(
        a
        for a in w["assignments"].values()
        if a["entry"] == e["id"] and a["position"] == "race-engineer"
    )
    regular = engineering.working_person(s, crew_seat, s["date"])
    used = {r["person"] for rows in s["seats"].values() for r in rows}
    candidate = next(
        p
        for p in s["people"].values()
        if p["position"] == "race-engineer" and p["id"] not in used
    )
    amount = employment.ask(s, w, candidate, post)
    offer = dict(
        id="test-offer",
        seat=post["id"],
        person=candidate["id"],
        start=s["date"],
        end="2025-05-01",
        salary_cents=amount,
        bonus_cents=1000,
    )
    payroll = s["accounts"][org]["payroll_cents"]
    employment.sign(s, w, offer)
    assert s["accounts"][org]["payroll_cents"] == payroll + amount
    payload = dict(seat=post["id"], entry=e["id"], start=s["date"], end="2025-02-08")
    employment.command(s, w, "engineer-cover", payload)
    with pytest.raises(domain.RuleError, match="заняты"):
        employment.command(s, w, "engineer-cover", payload)
    pairs = teamwork.partnerships(s, w, s["date"]).values()
    assert {
        a for kind, a, b, _ in pairs if kind == "feedback" and b == candidate["id"]
    } == set(e["crew"])
    assert engineering.working_person(s, crew_seat, "2025-02-08") == regular
    employment.command(s, w, "staff-release", dict(seat=crew_seat["id"]))
    assert engineering.working_person(s, crew_seat, "2025-02-08") is None
    assert engineering.working_person(s, crew_seat, s["date"]) == candidate["id"]
    assert s["seats"][crew_seat["id"]][0]["person"] == regular


def test_old_checkpoint_is_upgraded_at_saved_date(tmp_path, monkeypatch):
    """Exercise the actual portable archive and SQLite upgrade paths after a command."""
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    activate = engineering.activate
    with monkeypatch.context() as m:
        m.setattr(engineering, "activate", lambda state: None)
        c = service.create(
            service.CareerInput(
                name="Старый штаб",
                org=MERCEDES,
                role="manufacturer",
                series="f1",
                seed=61,
            )
        )
    c = service.execute(
        c["id"], service.Command(command_id="first", revision=0, action="advance")
    )
    original = service.export_save(c["id"])
    copied = service.import_save(deepcopy(original))
    migrated = service.export_save(copied["id"])
    assert migrated["payload"]["commands"] == original["payload"]["commands"]
    state = migrated["payload"]["state"]
    before = original["payload"]["state"]
    assert state["engineering_service"]["since"] == c["revision"]
    for key in ("support", "relationships", "ledger", "work_log", "rng"):
        assert state[key] == before[key]
    assert all(state["seats"][k] == v for k, v in before["seats"].items())
    activate(state)
    assert service.export_save(service.import_save(migrated)["id"]) == migrated
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=26")
    assert service.export_save(c["id"]) == migrated


def test_client_growth_reserves_one_employee_before_posting_charges(career):
    from .test_commercial import terms
    from . import finance

    _, s, w = career
    today, end = s["date"], "2025-05-01"
    pairs = {(r["employer"], r["client"]) for r in current(s, w, today)}
    clients = sorted(
        {
            e["org"]
            for e in w["entries"].values()
            if e["championship"] == "f1" and (MERCEDES, e["org"]) not in pairs
        }
    )[:2]
    assert len(clients) == 2
    reserve = MERCEDES + ":technical-advisor:reserve"
    relief = s["seats"][reserve][0]["person"]

    def negotiate(client):
        key = "growth/" + client
        bid = market.Bid(
            terms=terms(org=client, sponsor=MERCEDES, start=today, end=end),
            supply=dict(
                product="engine",
                price_cents=500000,
                discount_cents=0,
                support=True,
                seat_cents=0,
                testing=False,
                development=False,
            ),
        )
        reply = market.Reply(
            offer=key, decision="accept", sponsorship=False, supply=True, support=True
        )
        market.sign_supply(s, w, bid, reply, key)
        finance.settle(s)

    for client in clients:
        for deal in list(s["market"]["supplies"].values()):
            if (
                deal["org"] == client
                and deal["series"] == "f1"
                and deal["product"] == "engine"
            ):
                market.end_supply(s, client, deal["id"])
        for e in w["entries"].values():
            if e["org"] == client and e["championship"] == "f1":
                s["market"]["homologations"]["cert/" + e["id"]] = dict(
                    entry=e["id"],
                    provider=MERCEDES,
                    product="engine",
                    start=today,
                    end=end,
                    works=False,
                )
    negotiate(clients[0])
    assert [
        r["advisor"]
        for r in current(s, w, today)
        if (r["employer"], r["client"]) == (MERCEDES, clients[0])
    ] == [relief]
    assert (
        s["finance"]["instalments"]["growth/" + clients[0] + ":production"][
            "amount_cents"
        ]
        > 0
    )
    assert engineering.client_post(MERCEDES, clients[0]) in lineup_for(s)["assignments"]
    before = deepcopy(s["finance"]["instalments"])
    with pytest.raises(domain.RuleError, match="свободный штатный консультант"):
        negotiate(clients[1])
    assert before == s["finance"]["instalments"]
    assert "growth/" + clients[1] not in s["market"]["supplies"]

    post = w["assignments"][reserve + ":2"]
    used = {
        r["person"]
        for rows in s["seats"].values()
        for r in rows
        if not r["end"] or today < r["end"]
    }
    candidate = next(
        p
        for p in s["people"].values()
        if p["position"] == "technical-advisor" and p["id"] not in used
    )
    salary = employment.ask(s, w, candidate, post)
    employment.sign(
        s,
        w,
        dict(
            id="hire-growth",
            seat=post["id"],
            person=candidate["id"],
            start=today,
            end=end,
            salary_cents=salary,
            bonus_cents=1000,
        ),
    )
    negotiate(clients[1])
    assert [
        r["advisor"]
        for r in current(s, w, today)
        if (r["employer"], r["client"]) == (MERCEDES, clients[1])
    ] == [candidate["id"]]


def test_briefing_feedback_diagnostic_evidence_and_expiring_access(career):
    from . import components
    from .council.observations import Observation, receive, observation_grant
    from .manufacturer import support

    _, s, w = career
    e = w["entries"]["f1-4"]
    s["setup"].update(org=e["org"], role="manager")
    event = next(
        v
        for v in w["events"]
        if v["series"] == "f1" and v.get("org") in (None, e["org"])
    )

    def crew():
        return next(
            r for r in engineering.briefing(s, w, event["id"]) if r["entry"] == e["id"]
        )

    before = crew()
    assert before["feedback"][0]["decision"] == "await-feedback"
    iid = components.mounting(s, e["id"])["engine"]
    spec = components.spec(s, iid)["id"]
    report = Observation(
        reference="thermal-feedback",
        entry=e["id"],
        org=e["org"],
        session="practice-1",
        session_kind="practice",
        day=s["date"],
        instance=iid,
        specification=spec,
        kind="driver-feedback",
        author=before["drivers"][0],
        observation="Пилот сообщает о нагреве двигателя.",
    )
    receive(s, w, report)
    dated = s["council"]["observations"][report.reference]
    g = observation_grant(s, w, e, dated)
    assert g.product == "engine" and g.employer == MERCEDES
    request = support.open_case(
        s,
        w,
        e["org"],
        "thermal",
        support.Request(
            entry=e["id"],
            axis="engine",
            kind="consult",
            objective="thermal",
            message="Проверить тепловой режим двигателя по сообщению пилота.",
            reference=report.reference,
        ),
    )
    after = crew()
    assert request["advisor"] == g.advisor
    assert after["feedback"][0]["reports"] == [report.reference]
    reviewer = next(a for a in after["consultants"] if a["person"] == g.advisor)
    assert request["id"] in reviewer["cases"] and "review_quality" in reviewer
    assert support.evidence(s, w, request)[0]["reference"] == report.reference
    s["date"] = "2025-02-02"
    key = MERCEDES + ":technical-advisor:reserve"
    engineering.cover(
        s,
        w,
        w["assignments"][key],
        s["seats"][key][0],
        dict(client=e["org"], start=s["date"], end="2025-02-03"),
    )
    assert observation_grant(s, w, e, dated) is None
    assert not support.evidence(s, w, request)
    s["date"] = "2025-02-03"
    assert observation_grant(s, w, e, dated) is None
