"""Regression cases from the independent review of the dated staffing and data rights."""

from copy import deepcopy
import json

import pytest

from . import components, domain, personnel, personal_engineering as staff
from .finance import market
from .manufacturer import support
from .statistics.telemetry import permitted
from .statistics.models import ChannelHeader
from .supplier_engineering import agreement
from .test_commercial import terms
from .test_personal_engineering import MERCEDES, WILLIAMS, engineering_career

make_career = pytest.fixture(name="career")(engineering_career)


def sign(state, world, key, client, start, end, axis="engine", maker=MERCEDES):
    bid = market.Bid(
        terms=terms(org=client, sponsor=maker, start=start, end=end),
        supply=dict(
            product=axis,
            price_cents=10000,
            discount_cents=0,
            support=True,
            seat_cents=0,
            testing=False,
            development=False,
        ),
    )
    market.sign_supply(
        state,
        world,
        bid,
        market.Reply(
            offer=key, decision="accept", sponsorship=False, supply=True, support=True
        ),
        key,
    )


def occupants(state, world, client, day):
    return [
        r["advisor"]
        for r in staff.appointments(state, world, MERCEDES, client)
        if r["start"] <= day < r["end"]
    ]


def seats(state, world):
    principal = next(
        p
        for p in world["assignments"].values()
        if p["org"] == MERCEDES and p.get("client") == WILLIAMS
    )
    reserve = world["assignments"][MERCEDES + ":technical-advisor:reserve"]
    return state["seats"][principal["id"]][0], state["seats"][reserve["id"]][0]


@pytest.mark.parametrize(
    "last_day,accepted", [("2025-06-01", True), ("2025-05-31", False)]
)
def test_partial_coverage_renewal_is_atomic(career, last_day, accepted):
    _, s, w = career
    primary, relief = seats(s, w)
    for d in s["market"]["supplies"].values():
        if (d["sponsor"], d["org"]) == (MERCEDES, WILLIAMS):
            d["end"] = "2025-03-01" if d["product"] == "engine" else "2025-04-01"
    primary["end"] = "2025-05-01"
    relief.update(start="2025-05-01", end=last_day)
    before = deepcopy(s)
    if not accepted:
        with pytest.raises(domain.RuleError):
            sign(s, w, "renew", WILLIAMS, "2025-03-01", "2025-06-01")
        assert s == before
        return
    sign(s, w, "renew", WILLIAMS, "2025-03-01", "2025-06-01")
    sign(s, w, "gear", WILLIAMS, "2025-04-01", "2025-06-01", "transmission")
    for day, person in [
        ("2025-02-28", primary),
        ("2025-03-01", primary),
        ("2025-04-30", primary),
        ("2025-05-01", relief),
        ("2025-05-31", relief),
    ]:
        assert occupants(s, w, WILLIAMS, day) == [person["person"]]
    assert not occupants(s, w, WILLIAMS, "2025-06-01")
    assert (
        s["accounts"][MERCEDES]["payroll_cents"]
        == before["accounts"][MERCEDES]["payroll_cents"]
    )


def test_termination_preserves_separate_future_commitment(career):
    _, s, w = career
    primary, relief = seats(s, w)
    primary["end"] = s["date"]
    for d in list(s["market"]["supplies"].values()):
        if (d["sponsor"], d["org"]) == (MERCEDES, WILLIAMS):
            market.end_supply(s, MERCEDES, d["id"])
    sign(s, w, "long", WILLIAMS, "2025-02-01", "2025-06-01")
    sign(s, w, "later", WILLIAMS, "2025-04-01", "2025-05-01", "transmission")
    s["date"] = "2025-03-01"
    market.end_supply(s, MERCEDES, "long")
    assert occupants(s, w, WILLIAMS, "2025-02-28") == [relief["person"]]
    assert not occupants(s, w, WILLIAMS, "2025-03-02")
    assert occupants(s, w, WILLIAMS, "2025-04-01") == [relief["person"]]
    sign(s, w, "again", WILLIAMS, "2025-05-01", "2025-06-01")
    assert occupants(s, w, WILLIAMS, "2025-05-31") == [relief["person"]]


def test_paid_and_effective_engineer_have_different_experience(career):
    _, s, w = career
    reserve = next(
        p
        for p in w["assignments"].values()
        if p.get("engineering_reserve") and s["seats"][p["id"]]
    )
    principal = next(
        p
        for p in w["assignments"].values()
        if p["org"] == reserve["org"]
        and p["position"] == "race-engineer"
        and p["entry"]
    )
    day = s["date"]
    regular = staff.working_person(s, principal, day)
    booking = s["seats"][reserve["id"]][0]
    substitute = booking["person"]
    discipline = w["championships"][principal["series"]]["discipline"]
    before = {
        pid: s["people"][pid]["discipline_days"].copy() for pid in (regular, substitute)
    }
    staff.cover_entry(
        s,
        w,
        reserve,
        booking,
        dict(entry=principal["entry"], start=day, end="2025-02-03"),
    )
    personnel.develop(s, w, "2025-02-03")
    assert s["people"][regular]["discipline_days"] == before[regular]
    assert (
        s["people"][substitute]["discipline_days"][discipline]
        == before[substitute][discipline] + 2
    )
    assert all(
        days == before[substitute][d]
        for d, days in s["people"][substitute]["discipline_days"].items()
        if d != discipline
    )
    assert staff.working_person(s, principal, "2025-02-03") == regular
    row = next(
        r
        for r in staff.entry_partners(s, w, regular)
        if r["entry"] == principal["entry"]
    )
    assert (row["principal"], row["engineer"]) == (regular, substitute)
    # Finishing a preparation must not rewrite who worked on its last occupied day.
    s["date"] = "2025-02-05"
    s["preparations"]["post-race-debrief"] = dict(
        start="2025-02-03", end="2025-02-04", status="completed", participants=[regular]
    )
    assert staff.working_person(s, principal, "2025-02-03") is None
    assert staff.working_person(s, principal, "2025-02-04") == regular


def test_product_grants_replacement_expiry_and_new_supplier(career):
    _, s, w = career
    e = next(
        e
        for e in w["entries"].values()
        if e["org"] == WILLIAMS and e["championship"] == "f1"
    )
    day = s["date"]

    def header(axis, channel, when, deal):
        iid = components.mounting(s, e["id"])[axis]
        spec = components.spec(s, iid)
        return ChannelHeader(
            version=1,
            day=when,
            context=dict(
                org=WILLIAMS,
                org_name=WILLIAMS,
                series="f1",
                season="2025",
                regulation="f1",
                round="britain",
                session="test",
                session_kind="practice",
                track="silverstone",
                layout="gp",
                layout_version="1",
                entry=e["id"],
                car=e["car"],
                contract=deal["id"],
                component=dict(
                    manufacturer=deal["maker"],
                    product=axis,
                    component=axis,
                    specification=spec["family"],
                    version=spec["id"],
                    instance=iid,
                ),
            ),
            channel=channel,
            unit="test",
            first_us=0,
            period_us=1,
        )

    def access(maker, h):
        viewer = dict(
            org=maker,
            role="manufacturer",
            day=s["date"],
            support=json.dumps(staff.telemetry_grants(s, w, maker)),
        )
        return permitted(viewer, h)

    deals = {a: agreement(s, w, e, a) for a in ("engine", "transmission", "tyre")}
    for axis, d in deals.items():
        stored = s["market"]["supplies"][d["id"]]
        stored.update(partnership="technical", support=axis != "transmission")
    engine = header("engine", "temperature", day, deals["engine"])
    tyre = header("tyre", "wear", day, deals["tyre"])
    assert access(MERCEDES, engine) and not access(MERCEDES, tyre)
    assert access(deals["tyre"]["maker"], tyre) and not access(
        deals["tyre"]["maker"], engine
    )
    assert not access(MERCEDES, header("engine", "power", day, deals["engine"]))
    assert not access(
        MERCEDES, header("transmission", "wear", day, deals["transmission"])
    )
    key = MERCEDES + ":technical-advisor:reserve"
    staff.cover(
        s,
        w,
        w["assignments"][key],
        s["seats"][key][0],
        dict(client=WILLIAMS, start="2025-02-02", end="2025-02-04"),
    )
    s["date"] = "2025-02-02"
    assert not access(MERCEDES, engine)
    during = header("engine", "temperature", s["date"], deals["engine"])
    assert access(MERCEDES, during)
    s["date"] = "2025-02-04"
    assert not access(MERCEDES, during)
    assert not access(MERCEDES, engine)
    s["date"] = "2025-02-05"
    market.end_supply(s, MERCEDES, deals["engine"]["id"])
    assert (
        staff.grant(s, w, e, "engine", "2025-02-04", deals["engine"])["end"]
        == s["date"]
    )
    assert not staff.grant(s, w, e, "engine", s["date"], deals["engine"])
    sign(s, w, "renew-data", WILLIAMS, s["date"], "2025-03-01")
    assert not access(MERCEDES, during)
    assert access(
        MERCEDES,
        header("engine", "temperature", s["date"], agreement(s, w, e, "engine")),
    )
    s["date"] = "2025-03-01"
    assert not access(
        MERCEDES,
        header(
            "engine", "temperature", "2025-02-15", dict(id="renew-data", maker=MERCEDES)
        ),
    )
    competitor = "supplier-ferrari"
    outgoing = next(
        r["client"]
        for r in staff.appointments(s, w, competitor)
        if r["start"] <= s["date"] < r["end"] and r.get("seat")
    )
    for d in list(s["market"]["supplies"].values()):
        if (d["sponsor"], d["org"], d["status"]) == (competitor, outgoing, "signed"):
            market.end_supply(s, competitor, d["id"])
    s["market"]["homologations"]["march"] = dict(
        entry=e["id"],
        provider=competitor,
        product="engine",
        start=s["date"],
        end="2025-04-01",
        works=False,
    )
    sign(s, w, "competitor", WILLIAMS, s["date"], "2025-04-01", maker=competitor)
    fresh = agreement(s, w, e, "engine")
    assert fresh["maker"] == competitor
    new_channel = header("engine", "temperature", s["date"], fresh)
    assert access(competitor, new_channel) and not access(MERCEDES, new_channel)
    assert not access(MERCEDES, engine) and not access(competitor, engine)


def test_closed_diagnosis_keeps_organizational_conclusion(career):
    _, s, w = career
    e = w["entries"]["f1-4"]
    from .council.observations import receive, Observation

    iid = components.mounting(s, e["id"])["engine"]
    engineer = next(
        a
        for a in w["assignments"].values()
        if a["entry"] == e["id"] and a["position"] == "race-engineer"
    )
    receive(
        s,
        w,
        Observation(
            reference="cooling-protocol",
            org=e["org"],
            entry=e["id"],
            session="practice",
            session_kind="practice",
            day=s["date"],
            instance=iid,
            specification=components.spec(s, iid)["id"],
            kind="track-measurement",
            author=staff.working_person(s, engineer, s["date"]),
            observation="Расход охлаждающей жидкости ниже допуска.",
            channel="temperature",
            value=109.3,
            unit="°C",
            uncertainty=0.4,
            conditions="Контрольная серия",
            indicator="coolant-flow-low",
        ),
    )
    req = support.open_case(
        s,
        w,
        e["org"],
        "archive",
        support.Request(
            entry=e["id"],
            axis="engine",
            kind="consult",
            objective="thermal",
            message="Проверить охлаждение.",
        ),
    )
    support.resolve(
        s,
        w,
        MERCEDES,
        support.Resolve(case=req["id"], decision="advise", reason="Проверить датчики."),
    )
    reviewer = req["reviewer"]
    assert reviewer
    market.end_supply(s, MERCEDES, req["contract"])
    report = support.diagnosis(s, w, req)
    assert report["reviewer"] == reviewer and report["confidence"] == req["confidence"]
    assert not report["observations"]
    assert report["reviewed_references"] == ["cooling-protocol"]
    assert report["causes"]["cooling"] == ["cooling-protocol"]
    assert req["reviewer"] + "|archive" in s["work_log"]


def test_voluntary_cover_of_an_employee_assigned_by_supply_contract(career):
    from . import employment
    from .catalog import lineup_for

    _, s, w = career
    primary, relief = seats(s, w)
    primary["end"] = s["date"]
    for d in list(s["market"]["supplies"].values()):
        if (d["sponsor"], d["org"]) == (MERCEDES, WILLIAMS):
            market.end_supply(s, MERCEDES, d["id"])
    sign(s, w, "replacement-service", WILLIAMS, s["date"], "2025-06-01")
    w = lineup_for(s)
    reserve = w["assignments"][MERCEDES + ":technical-advisor:reserve:2"]
    employee = s["people"][primary["person"]]
    employment.sign(
        s,
        w,
        dict(
            id="second-relief",
            person=employee["id"],
            seat=reserve["id"],
            start=s["date"],
            end="2025-06-01",
            salary_cents=employment.ask(s, w, employee, reserve),
            bonus_cents=0,
        ),
    )
    staff.cover(
        s,
        w,
        reserve,
        s["seats"][reserve["id"]][0],
        dict(client=WILLIAMS, start="2025-03-01", end="2025-04-01"),
    )
    assert occupants(s, w, WILLIAMS, "2025-02-28") == [relief["person"]]
    assert occupants(s, w, WILLIAMS, "2025-03-01") == [employee["id"]]
    assert occupants(s, w, WILLIAMS, "2025-04-01") == [relief["person"]]
    assert [
        (r["person"], r["start"], r["end"])
        for r in staff.desk(s, w, MERCEDES, True)
        if r["client"] == WILLIAMS and r.get("temporary")
    ] == [(employee["id"], "2025-03-01", "2025-04-01")]
