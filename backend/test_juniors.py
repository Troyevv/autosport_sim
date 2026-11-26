"""Acceptance checks at the career, admission, recruitment and sporting-source boundaries."""

import pytest
from fastapi.testclient import TestClient

from . import backing, domain, junior_path, service, staff_desk
from .app import app
from .catalog import WORLD
from .development_path import eligibility
from .test_career import create
from .test_personnel import run, snapshot, terms


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))


@pytest.mark.parametrize(
    "series,org,count",
    [
        ("f4-it", "team-prema-racing", 7),
        ("f4-gb", "team-hitech-tgr", 10),
        ("f4-es", "team-campos-racing", 7),
        ("freca", "team-art-grand-prix", 10),
    ],
)
def test_starting_grid_and_calendar(series, org, count):
    c = create(org, "manager", series)
    events = [
        e for e in WORLD["events"] if e["series"] == series and e["kind"] == "round"
    ]
    assert len(events) == count and [e["round"] for e in events] == list(
        range(1, count + 1)
    )
    assert all(e["layout_id"] and e["sessions"] for e in events)
    for e in WORLD["entries"].values():
        if e["championship"] != series:
            continue
        assert c["crews"][e["id"]] == e["crew"]
        assert c["garage_configurations"][e["car"]]["geometry"] == (
            "tatuus-t318" if series == "freca" else "tatuus-t421"
        )
    assert all(a["occupant"] for a in c["assignments"])
    assert service.import_save(service.export_save(c["id"]))["crews"] == c["crews"]


def test_federation_decision_intake_and_calendar_year_boundary():
    c = create()
    state = snapshot(c)
    with pytest.raises(domain.RuleError):
        create("team-prema-racing", "manager", "kart-okj")
    pid = next(iter(state["junior_reserve"]))
    assert pid not in state["people"]
    issued = dict(
        person=pid,
        licence="ITG",
        reference="asn-test-1",
        issued=c["date"],
        expires="2026-01-01",
    )
    command = service.Command(
        action="issued-licence", command_id="licence", revision=0, staff=issued
    )
    assert (
        TestClient(app)
        .post(f"/api/careers/{c['id']}/commands", json=command.model_dump())
        .status_code
        == 403
    )
    c = service.execute(c["id"], command)
    person = snapshot(c)["people"][pid]
    rule = WORLD["championships"]["kart-okj"]["admission"]
    assert eligibility(person, rule, "2025-02-01") is None
    assert eligibility(person, rule, "2026-01-01")
    assert eligibility({**person, "birth_date": "2010-12-31"}, rule, "2025-02-01")
    assert service.import_save(service.export_save(c["id"]))["revision"] == 1


def test_kart_driver_scout_scholarship_and_transfer():
    owner = create(role="owner")
    pid = "junior-kart-ok-101"
    owner = run(owner, "scout-driver", person=pid)
    owner = run(
        owner,
        "academy-enroll",
        person=pid,
        academy="mclaren-development",
        recipient="team-kr-motorsport",
        monthly_cents=80000,
        end="2025-08-01",
        option=False,
        priority=False,
    )
    assert owner["scholarships"][0]["person"] == pid and owner["crews"][
        "kart-ok-101"
    ] == [pid]
    c = create("team-prema-racing", "manager", "f4-it")
    state = snapshot(c)
    pid = next(
        p
        for p, h in state["people"].items()
        if p.startswith("junior-kart-ok-")
        and h["birth_date"] <= "2009-02-05"
        and h["loyalty"] < 65
    )
    seat = next(
        a["id"]
        for a in c["assignments"]
        if a["entry"] == "f4-it-27" and a["position"] == "driver"
    )
    c = run(c, "staff-release", seat=seat)
    offer = terms(person=pid, seat=seat, end="2025-10-14")
    with pytest.raises(domain.RuleError, match="лицензия"):
        run(c, "offer-send", **offer)
    c = run(
        c,
        "issued-licence",
        person=pid,
        licence="ITD-C",
        reference="asn-2025-01",
        issued=c["date"],
        expires="2026-01-01",
    )
    c = run(c, "offer-send", **offer)
    while c["date"] < offer["start"]:
        c = run(c, "advance")
    assert c["crews"]["f4-it-27"] == [pid]
    after = snapshot(c)
    dossier = staff_desk.dossier(after, WORLD, pid)
    assert dossier["person"]["face"] == state["people"][pid]["face"]
    assert {row["series"] for row in dossier["history"]} == {"kart-ok", "f4-it"}
    assert service.export_save(
        service.import_save(service.export_save(c["id"]))["id"]
    ) == service.export_save(c["id"])


def test_results_and_season_awards_are_distinct_and_idempotent():
    c = create()
    s = snapshot(c)
    pid = "junior-kart-ok-101"
    entry = "kart-ok-101"
    assert not s["starts"]

    def finish(points):
        backing.record_result(
            s,
            pid,
            "campillos-final",
            "2025-04-06",
            world=WORLD,
            entry=entry,
            place=1,
            licence_points=points,
        )

    with pytest.raises(domain.RuleError):
        finish(3)
    finish(0)
    finish(0)
    row = s["starts"][pid]["campillos-final"]
    assert (
        row["round_id"] == "2025-kart-ok-r01"
        and row["layout_id"] == "kartcenter-campillos:international"
    )
    final = dict(
        person=pid,
        season="kart-ok-2025",
        place=1,
        certified_points=3,
        first_race_starters={
            e["id"]: 36 for e in WORLD["events"] if e["series"] == "kart-ok"
        },
        reference="classified-2025",
    )
    with pytest.raises(domain.RuleError):
        junior_path.record(s, WORLD, "season-classification", final)
    s["date"] = "2025-08-03"
    fewer = final | dict(first_race_starters={"2025-kart-ok-r01": 15})
    with pytest.raises(domain.RuleError):
        junior_path.record(s, WORLD, "season-classification", fewer)
    junior_path.record(s, WORLD, "season-classification", final)
    junior_path.record(s, WORLD, "season-classification", final)
    with pytest.raises(domain.RuleError):
        junior_path.record(
            s, WORLD, "season-classification", final | dict(certified_points=4)
        )
    cred = s["people"][pid]["credentials"]
    assert (
        junior_path.points_on(cred, s["date"]) == 3
        and junior_path.points_on(cred, "2030-01-01") == 0
    )


def test_pr26_sqlite_and_export_upgrade_with_paint_and_scouting():
    import hashlib

    from . import storage
    from .livery import GARAGE
    from .roster_upgrade import personnel_world

    old = personnel_world()
    setup = dict(
        name="Проверка",
        role="manager",
        org="team-mclaren-formula-1-team",
        series="f1",
        seed=17,
        player_face=old["reserve"][0],
    )
    state = domain.new_world(old, setup)
    commands = [
        dict(
            action="save-livery",
            paint=dict(
                entry="f1-4",
                livery={**GARAGE["entries"]["f1-4"]["livery"], "number": "073"},
            ),
        ),
        dict(
            action="scout-driver", staff={"person": old["entries"]["dtm-1"]["crew"][0]}
        ),
        dict(action="advance"),
    ]
    for revision, cmd in enumerate(commands):
        cmd.update(revision=revision, command_id=f"v3-{revision}")
        domain.apply(
            state, old, cmd["action"], service.Command.model_validate(cmd).payload()
        )
    state["ledger"].sort(key=lambda p: (p["date"], p["org"], p["key"]))
    payload = dict(state=state, commands=commands)
    archive = dict(
        format="autosport-career",
        version=1,
        rules="2025-v3",
        payload=payload,
        sha256=hashlib.sha256(storage.dump(payload).encode()).hexdigest(),
    )
    upgraded = service.export_save(service.import_save(archive)["id"])
    new = upgraded["payload"]["state"]
    for key in ("date", "rng", "reports", "liveries", "pending", "revision"):
        assert new[key] == state[key]
    assert new["junior_since"] == len(commands)
    assert service.export_save(service.import_save(upgraded)["id"]) == upgraded
    with storage.transaction(True) as db:
        storage.store(db, "pr26", state, create=True)
        for row in commands:
            cmd = service.Command.model_validate(row)
            args = cmd.payload()
            db.execute(
                "INSERT INTO receipt(career,command_id,revision,action,paint) VALUES (?,?,?,?,?)",
                (
                    "pr26",
                    cmd.command_id,
                    cmd.revision,
                    cmd.action,
                    storage.dump(args) if args else None,
                ),
            )
        db.execute("PRAGMA user_version=8")
    assert service.export_save("pr26") == upgraded
