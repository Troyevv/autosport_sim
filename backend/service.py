"""Application commands, projections and portable saves for the local player."""

import hashlib
import json
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import domain, storage
from .catalog import VERSION, WORLD
from .engineering import resource_scope, project_target


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class CareerInput(Strict):
    name: str = Field(min_length=1, max_length=64)
    role: str = Field(max_length=24)
    org: str = Field(max_length=128)
    series: str = Field(max_length=16)
    seed: int = Field(ge=0, lt=2**32)


class Command(Strict):
    command_id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    revision: int = Field(ge=0)
    action: str = Field(min_length=1, max_length=32)


def summary(cid, state):
    setup = state["setup"]
    return dict(
        id=cid,
        name=setup["name"],
        role=setup["role"],
        org=setup["org"],
        series=setup["series"],
        date=state["date"],
        revision=state["revision"],
    )


def list_careers():
    with storage.transaction() as db:
        return [
            summary(row["id"], json.loads(row["state"]))
            for row in db.execute("SELECT id,state FROM career ORDER BY rowid DESC")
        ]


def project(db, cid, state):
    org = state["setup"]["org"]
    people = []
    for aid in sorted(WORLD["assignments"]):
        assignment = WORLD["assignments"][aid]
        if assignment["org"] != org:
            continue
        person = domain.occupant_on(state["seats"].get(aid, []), state["date"])
        people.append(
            {**assignment, "person": person, "occupant": state["people"].get(person)}
        )
    history = storage.postings(db, cid, org)
    targets = [
        project_target(WORLD, program["id"], g["season"], g["id"])
        for program in WORLD["programs"].values()
        if program["org"] == org
        for g in WORLD["engineering"]["generations"].values()
        if WORLD["engineering"]["seasons"][g["season"]]["championship"]
        == program["championship"]
        and g["category"] in program["classes"]
    ]
    return dict(
        atr=resource_scope(WORLD, org, state["date"]),
        targets=targets,
        **summary(cid, state),
        rules=VERSION,
        player_id=state["player_id"],
        player_cash_cents=state["player_cash_cents"],
        account=state["accounts"][org],
        team_color=domain.team_color(org),
        assignments=people,
        ledger=history,
        collectives=[v for v in state["collectives"].values() if v["org"] == org],
        pending=state["pending"],
        next_date=domain.next_date(state, WORLD),
        checkpoint=state["checkpoint"],
        briefing_action=domain.BRIEFINGS[state["setup"]["role"]],
    )


def create(spec):
    with storage.transaction(True) as db:
        pool = [
            r[0]
            for r in db.execute(
                "SELECT entity FROM media WHERE kind='generated-head' ORDER BY entity"
            )
        ]
        setup = dict(**spec.model_dump(), face_pool=pool)
        state = domain.new_world(WORLD, setup)
        cid = str(uuid4())
        storage.store(db, cid, state, create=True)
        return project(db, cid, state)


def load(cid):
    with storage.transaction() as db:
        return project(db, cid, storage.checkpoint(db, cid))


def execute(cid, command):
    with storage.transaction(True) as db:
        state = storage.checkpoint(db, cid)
        old = db.execute(
            "SELECT revision,action FROM receipt WHERE career=? AND command_id=?",
            (cid, command.command_id),
        ).fetchone()
        if old:
            if (old["revision"], old["action"]) != (command.revision, command.action):
                raise domain.RuleError(
                    "Этот ключ команды уже использован с другими параметрами.", 409
                )
        else:
            if command.revision != state["revision"]:
                raise domain.RuleError(
                    "Карьеру изменили в другом окне. Состояние обновлено.", 409
                )
            domain.apply(state, WORLD, command.action)
            storage.store(db, cid, state)
            db.execute(
                "INSERT INTO receipt VALUES(?,?,?,?)",
                (cid, command.command_id, command.revision, command.action),
            )
        return project(db, cid, state)


def export_save(cid):
    with storage.transaction() as db:
        state = storage.checkpoint(db, cid)
        state["ledger"] = storage.postings(db, cid)
        payload = dict(state=state, commands=storage.receipts(db, cid))
        return dict(
            format="autosport-career",
            version=1,
            rules=VERSION,
            payload=payload,
            sha256=hashlib.sha256(storage.dump(payload).encode()).hexdigest(),
        )


def import_save(document):
    if (
        not isinstance(document, dict)
        or document.get("format") != "autosport-career"
        or (
            type(document.get("version")) is not int
            or document["version"] != 1
            or document.get("rules") != VERSION
        )
    ):
        raise domain.RuleError("Неизвестный формат сохранения или версия правил.")
    try:
        payload = document["payload"]
        if (
            hashlib.sha256(storage.dump(payload).encode()).hexdigest()
            != document["sha256"]
        ):
            raise ValueError
        saved = payload["state"]
        setup = dict(saved["setup"])
        pool = setup.pop("face_pool")
        if (
            not isinstance(pool, list)
            or len(pool) > 512
            or not all(
                isinstance(p, str) and p.startswith("generated-") and len(p) <= 80
                for p in pool
            )
            or pool != sorted(set(pool))
        ):
            raise ValueError
        spec = CareerInput.model_validate(setup)
        commands = payload["commands"]
        if not isinstance(commands, list) or len(commands) > 256:
            raise ValueError
        state = domain.new_world(WORLD, dict(**spec.model_dump(), face_pool=pool))
        seen = set()
        for item in commands:
            cmd = Command.model_validate(item)
            if cmd.command_id in seen or cmd.revision != state["revision"]:
                raise ValueError
            seen.add(cmd.command_id)
            domain.apply(state, WORLD, cmd.action)
        state["ledger"].sort(key=lambda p: (p["date"], p["org"], p["key"]))
        if storage.dump(state) != storage.dump(saved):
            raise ValueError
    except (KeyError, TypeError, ValueError, RecursionError, ValidationError):
        raise domain.RuleError("Файл повреждён или нарушает правила мира.") from None
    cid = str(uuid4())
    with storage.transaction(True) as db:
        storage.store(db, cid, state, create=True)
        db.executemany(
            "INSERT INTO receipt VALUES(?,?,?,?)",
            [(cid, c["command_id"], c["revision"], c["action"]) for c in commands],
        )
        return project(db, cid, state)
