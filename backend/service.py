"""Application commands, projections and portable saves for the local player."""

import hashlib
import json
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from . import domain, storage, finance
from .finance.events import PRODUCERS
from .livery import GARAGE, PaintOrder
from .catalog import VERSION, WORLD
from .roster_upgrade import (
    original_world,
    previous_world,
    personnel_world,
    upgrade,
    upgrade_personnel,
    upgrade_juniors,
)
from .statistics import personnel as statistics_personnel
from .staff_input import ORDERS
from . import preparation, professional, junior_path
from .media_profile import COUNTRIES, initialize as initialize_identity
from .development_path import public_person
from .team_staff import department_capacity
from .engineering import resource_scope, project_target


# A regulation/concept pair identifies the historical homologation independently
# of the crew's livery. Multiple entries in a spec series share its asset.
VISUAL_CONCEPTS = {
    (
        WORLD["cars"][entry["car"]]["regulation"],
        WORLD["cars"][entry["car"]]["concept"],
    ): GARAGE["entries"][entry["id"]]["geometry"]
    for entry in WORLD["entries"].values()
    if entry["id"] in GARAGE["entries"]
}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class CareerInput(Strict):
    name: str = Field(min_length=1, max_length=64)
    role: str = Field(max_length=24)
    org: str = Field(max_length=128)
    series: str = Field(max_length=16)
    seed: int = Field(ge=0, lt=2**32)
    country: str | None = None

    @model_validator(mode="after")
    def recognized_country(self):
        if self.country is not None and self.country not in COUNTRIES:
            raise ValueError("Выберите страну из справочника.")
        return self


class Command(Strict):
    command_id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    revision: int = Field(ge=0)
    action: str = Field(min_length=1, max_length=32)
    paint: PaintOrder | None = None
    staff: dict | None = None
    finance: dict | None = None

    @model_validator(mode="after")
    def check_action_payload(self):
        if (self.action == "save-livery") != (self.paint is not None):
            raise ValueError("Неверные параметры команды ливреи.")
        orders = {
            **ORDERS,
            "confirmed-work": professional.Batch,
            "issued-licence": junior_path.LicenceDecision,
            "season-classification": junior_path.SeasonClassification,
        }
        if (self.action in orders) != (self.staff is not None):
            raise ValueError("Неверные параметры кадровой команды.")
        if self.staff is not None:
            orders[self.action].model_validate(self.staff)
        finance_orders = {**finance.ORDERS, **PRODUCERS}
        if (self.action in finance_orders) != (self.finance is not None):
            raise ValueError("Неверные параметры финансовой команды.")
        if self.finance is not None:
            finance_orders[self.action].model_validate(self.finance)
        return self

    def payload(self):
        return (
            self.paint.model_dump()
            if self.paint
            else self.finance
            if self.finance is not None
            else self.staff
        )


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
    from . import teamwork

    org = state["setup"]["org"]
    people = []
    for aid in sorted(WORLD["assignments"]):
        assignment = WORLD["assignments"][aid]
        if assignment["org"] != org:
            continue
        person = domain.occupant_on(state["seats"].get(aid, []), state["date"])
        occupant = state["people"].get(person)
        people.append(
            {
                **assignment,
                "person": person,
                "occupant": public_person(occupant) if occupant else None,
            }
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
    crews = {eid: [] for eid in WORLD["entries"]}
    for aid, assignment in WORLD["assignments"].items():
        if assignment["position"] == "driver":
            pid = domain.occupant_on(state["seats"][aid], state["date"])
            if pid:
                crews[assignment["entry"]].append(pid)
    contacts = teamwork.partnerships(state, WORLD, state["date"])
    return dict(
        crews=crews,
        mandate=state["mandates"].get(org),
        academies=[a for a in state["academies"].values() if a["org"] == org],
        scholarships=[
            s
            for s in state["scholarships"].values()
            if state["academies"][s["academy"]]["org"] == org
        ],
        offers=[
            o
            for o in state["offers"].values()
            if WORLD["assignments"][o["seat"]]["org"] == org
        ],
        preparation_options=preparation.options(state),
        preparations=[
            dict(
                r,
                names=[
                    (state["people"].get(pid) or state["collectives"][pid])["name"]
                    for pid in r["participants"]
                ],
            )
            for r in state["preparations"].values()
            if r["org"] == org
        ],
        notices=state["notices"][-50:],
        liveries=state.get("liveries", {}),
        garage_configurations={
            car_id: dict(
                regulation=config["regulation"],
                concept=config["concept"],
                geometry=VISUAL_CONCEPTS.get((config["regulation"], config["concept"])),
                installed=config.get("visual_parts", {}),
            )
            for car_id, config in state["car_configurations"].items()
        },
        atr=resource_scope(WORLD, org, state["date"]),
        targets=targets,
        **summary(cid, state),
        rules=VERSION,
        player_id=state["player_id"],
        player_cash_cents=state["player_cash_cents"],
        account=state["accounts"][org],
        available_cents=finance.available(state, org),
        team_color=WORLD["organizations"][org]["color"],
        assignments=people,
        ledger=history,
        collectives=[
            dict(
                v,
                development=professional.projection(state, WORLD, v["id"]),
                capacity=department_capacity(v),
                **teamwork.group_view(state, WORLD, v, contacts),
            )
            for v in state["collectives"].values()
            if v["org"] == org
        ],
        pending=state["pending"],
        next_date=domain.next_date(state, WORLD),
        checkpoint=state["checkpoint"],
        briefing_action=domain.BRIEFINGS[state["setup"]["role"]],
    )


def create(spec):
    with storage.transaction(True) as db:
        setup = spec.model_dump(exclude_none=True)
        state = domain.new_world(WORLD, setup)
        finance.activate(state, WORLD)
        cid = str(uuid4())
        storage.store(db, cid, state, create=True)
        statistics_personnel.refresh(db, cid, state)
        return project(db, cid, state)


def load(cid):
    with storage.transaction() as db:
        return project(db, cid, storage.checkpoint(db, cid))


def execute(cid, command):
    args = command.payload()
    stored_args = storage.dump(args) if args is not None else None
    with storage.transaction(True) as db:
        state = storage.checkpoint(db, cid)
        old = db.execute(
            "SELECT revision,action,paint FROM receipt WHERE career=? AND command_id=?",
            (cid, command.command_id),
        ).fetchone()
        if old:
            if (old["revision"], old["action"], old["paint"]) != (
                command.revision,
                command.action,
                stored_args,
            ):
                raise domain.RuleError(
                    "Этот ключ команды уже использован с другими параметрами.", 409
                )
        else:
            if command.revision != state["revision"]:
                raise domain.RuleError(
                    "Карьеру изменили в другом окне. Состояние обновлено.", 409
                )
            previous = statistics_personnel.mutable_state(state)
            domain.apply(state, WORLD, command.action, args)
            statistics_personnel.refresh(db, cid, state, previous, command.action, args)
            if command.action == "advance":
                from datetime import date
                from .statistics.telemetry import get_policy, prune

                policy = get_policy(db, cid)
                if policy:
                    prune(db, cid, date.fromisoformat(state["date"]), policy)
            storage.store(db, cid, state)
            db.execute(
                "INSERT INTO receipt(career,command_id,revision,action,paint) VALUES(?,?,?,?,?)",
                (
                    cid,
                    command.command_id,
                    command.revision,
                    command.action,
                    stored_args,
                ),
            )
        return project(db, cid, state)


def confirm_work(cid, command_id, revision, facts):
    """Trusted producer entry point. Facts and the command receipt commit in the same SQLite transaction."""
    batch = professional.Batch(facts=facts)
    return execute(
        cid,
        Command(
            command_id=command_id,
            revision=revision,
            action="confirmed-work",
            staff=batch.model_dump(),
        ),
    )


def checkpoint_document(db, cid):
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


def export_save(cid):
    # In-memory convenience for legacy callers. File exports stream the same records.
    from .statistics.archive import records

    with storage.transaction() as db:
        doc = checkpoint_document(db, cid)
        extra = []
        size = 0
        for item in records(db, cid):
            size += len(storage.dump(item).encode())
            if size > 16 * 1024**2:
                raise domain.RuleError(
                    "Для большого архива используйте файловый экспорт.", 413
                )
            extra.append(item)
        if extra:
            doc["payload"]["statistics_v1"] = extra
            doc["sha256"] = hashlib.sha256(
                storage.dump(doc["payload"]).encode()
            ).hexdigest()
        return doc


def import_save(document, *, statistics_records=None):
    if (
        not isinstance(document, dict)
        or document.get("format") != "autosport-career"
        or (
            type(document.get("version")) is not int
            or document["version"] != 1
            or document.get("rules") not in ("2025-v1", "2025-v2", "2025-v3", VERSION)
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
        legacy = document["rules"] == "2025-v1"
        if legacy:
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
            appearance = {"face_pool": pool}
        else:
            face = setup.pop("player_face")
            if face not in previous_world()["reserve"]:
                raise ValueError
            appearance = {"player_face": face}
        spec = CareerInput.model_validate(setup)
        activation = saved.get("personnel_since")
        modern = document["rules"] in ("2025-v3", VERSION)
        expanded = document["rules"] == VERSION
        native = expanded and not saved.get("junior_migrated")
        junior_since = saved.get("junior_since")
        if expanded and (
            type(junior_since) is not int or not 0 <= junior_since <= saved["revision"]
        ):
            raise ValueError
        if modern and (
            type(activation) is not int or not 0 <= activation <= saved["revision"]
        ):
            raise ValueError
        finance_since = saved.get("finance", {}).get("since")
        if finance_since is not None and (
            type(finance_since) is not int
            or not expanded
            or not junior_since <= finance_since <= saved["revision"]
        ):
            raise ValueError
        growth = saved.get("growth_since")
        if growth is not None and (
            not modern
            or type(growth) is not int
            or not activation <= growth <= saved["revision"]
        ):
            raise ValueError
        from .professional import activate

        catalog = WORLD if native else original_world() if legacy else previous_world()
        commands = payload["commands"]
        if not isinstance(commands, list):
            raise ValueError
        state = domain.new_world(
            catalog, dict(**spec.model_dump(exclude_none=True), **appearance)
        )
        seen = set()
        receipts = []

        def apply_migrations():
            nonlocal catalog
            if not native and modern and activation == state["revision"]:
                upgrade_personnel(state, historical=True)
                catalog = personnel_world()
            if modern and growth == state["revision"]:
                activate(state)
            if expanded and not native and junior_since == state["revision"]:
                upgrade_juniors(state)
                catalog = WORLD
            if finance_since == state["revision"]:
                finance.activate(state, catalog, state["ledger"])

        for item in commands:
            apply_migrations()
            cmd = Command.model_validate(item)
            if cmd.command_id in seen or cmd.revision != state["revision"]:
                raise ValueError
            seen.add(cmd.command_id)
            args = cmd.payload()
            domain.apply(state, catalog, cmd.action, args)
            receipts.append(
                (
                    cmd.command_id,
                    cmd.revision,
                    cmd.action,
                    storage.dump(args) if args else None,
                )
            )
        apply_migrations()
        state["ledger"].sort(key=lambda p: (p["date"], p["org"], p["key"]))
        if modern and "identity_schema" not in saved:
            saved = json.loads(storage.dump(saved))
            initialize_identity(saved)
        if storage.dump(state) != storage.dump(saved):
            raise ValueError
        if modern and growth is None:
            activate(state)
        if legacy:
            state = upgrade(state)
        if not modern:
            state = upgrade_personnel(state)
        if not expanded:
            upgrade_juniors(state)
        finance.activate(state, WORLD, state["ledger"])
    except (KeyError, TypeError, ValueError, RecursionError, ValidationError):
        raise domain.RuleError("Файл повреждён или нарушает правила мира.") from None
    cid = str(uuid4())
    with storage.transaction(True) as db:
        storage.store(db, cid, state, create=True)
        statistics_personnel.refresh(db, cid, state)
        db.executemany(
            "INSERT INTO receipt(career,command_id,revision,action,paint) VALUES(?,?,?,?,?)",
            [(cid, *row) for row in receipts],
        )
        from .statistics.archive import restore

        if statistics_records is not None and "statistics_v1" in payload:
            raise domain.RuleError("Два архива статистики в одном сохранении.")
        if "statistics_v1" in payload and not isinstance(
            payload["statistics_v1"], list
        ):
            raise domain.RuleError("Некорректный формат статистики.")
        restore(
            db,
            cid,
            payload.get("statistics_v1", [])
            if statistics_records is None
            else statistics_records,
        )
        return project(db, cid, state)
