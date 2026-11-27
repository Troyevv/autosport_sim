"""SQLite checkpoints, posting uniqueness and command receipts share one transaction."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .domain import RuleError
from .catalog import VERSION

from .statistics.schema import DDL as STATISTICS_SCHEMA

MIGRATIONS = [
    [
        "CREATE TABLE career (id TEXT PRIMARY KEY, state TEXT NOT NULL)",
        """CREATE TABLE posting (
            career TEXT NOT NULL REFERENCES career(id), org TEXT NOT NULL, key TEXT NOT NULL,
            date TEXT NOT NULL, source TEXT NOT NULL, delta_cents INTEGER NOT NULL,
            PRIMARY KEY (career, org, key))""",
        """CREATE TABLE receipt (
            career TEXT NOT NULL REFERENCES career(id), command_id TEXT NOT NULL,
            revision INTEGER NOT NULL, action TEXT NOT NULL,
            PRIMARY KEY (career, command_id), UNIQUE(career, revision))""",
    ],
    [
        """CREATE TABLE media (
            kind TEXT NOT NULL, entity TEXT NOT NULL, metadata TEXT NOT NULL,
            content BLOB NOT NULL, PRIMARY KEY(kind,entity))"""
    ],
    # Earlier versions imported real faces without a studio review. Careers store
    # stable identities separately and keep their assigned face across this migration.
    [
        "DELETE FROM media WHERE kind='head' AND json_extract(metadata, '$.originalSha256') IS NULL"
    ],
    [],  # Fictional roster. Upgrade checkpoint data in the migration transaction.
    ["ALTER TABLE receipt ADD COLUMN paint TEXT"],
    [],  # Dated contracts and personnel activation revision.
    [],  # Add country IDs and public profiles to existing v3 careers.
    [],  # Professional event ledger and retirement of universal courses.
    [],  # Regional series and karting activation on the current game date.
    STATISTICS_SCHEMA,
    [],  # Finance opens previously unjournaled balances on the activation revision.
    [],  # Commercial market activation.
    [],  # Annual mandates and ledger-derived cost aggregates.
    [],  # facilities activation.
    [],  # capital activation.
    [],  # economy activation.
    [
        """CREATE INDEX IF NOT EXISTS career_listing ON career (
        json_extract(state,'$.setup'), json_extract(state,'$.date'),
        json_extract(state,'$.revision'), id)"""
    ],
    [],  # Independent engineering resources and conversion of former depots.
    [],  # Negotiated driver terms, support appointments and temporary lineups.
    [],  # Open the version-pinned component inventory at the current revision.
    [],  # Open the research archive on the current career date.
    [],  # Activate design and metrology at this checkpoint.
    [],  # Open the production ledger without synthesizing historic batches.
    [],  # Activate evidence-led engineering decisions at this revision.
    [],  # Open the two season portfolios at the saved revision.
    [],  # Start supplier operations at the current checkpoint.
]


def data_dir():
    return Path(
        os.environ.get(
            "AUTOSPORT_DATA_DIR", Path(__file__).resolve().parents[1] / ".autosport"
        )
    )


def dump(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )


@contextmanager
def transaction(write=False):
    root = data_dir()
    root.mkdir(parents=True, exist_ok=True)
    # Month-end settlement and fixture imports can overlap a different career's save.
    db = sqlite3.connect(root / "world.sqlite3", isolation_level=None, timeout=45)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA foreign_keys=ON")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        db.execute("BEGIN IMMEDIATE" if write or version < len(MIGRATIONS) else "BEGIN")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version > len(MIGRATIONS):
            raise RuleError("Сохранения созданы более новой версией приложения.", 409)
        for idx in range(version, len(MIGRATIONS)):
            for statement in MIGRATIONS[idx]:
                db.execute(statement)
            if idx == 3:
                from .roster_upgrade import upgrade

                for row in db.execute("SELECT id,state FROM career").fetchall():
                    state = json.loads(row["state"])
                    if state.get("rules") == "2025-v1":
                        db.execute(
                            "UPDATE career SET state=? WHERE id=?",
                            (dump(upgrade(state)), row["id"]),
                        )
            if idx == 5:
                from .roster_upgrade import upgrade_personnel

                for row in db.execute("SELECT id,state FROM career").fetchall():
                    state = json.loads(row["state"])
                    if state.get("rules") == "2025-v2":
                        db.execute(
                            "UPDATE career SET state=? WHERE id=?",
                            (dump(upgrade_personnel(state)), row["id"]),
                        )
            if idx == 6:
                from .media_profile import initialize

                for row in db.execute("SELECT id,state FROM career").fetchall():
                    state = json.loads(row["state"])
                    initialize(state)
                    db.execute(
                        "UPDATE career SET state=? WHERE id=?", (dump(state), row["id"])
                    )
            if idx == 7:
                from .professional import activate

                for row in db.execute("SELECT id,state FROM career").fetchall():
                    state = json.loads(row["state"])
                    activate(state)
                    db.execute(
                        "UPDATE career SET state=? WHERE id=?", (dump(state), row["id"])
                    )
            if idx == 8:
                from .roster_upgrade import upgrade_juniors

                for row in db.execute("SELECT id,state FROM career").fetchall():
                    state = json.loads(row["state"])
                    if state["rules"] == "2025-v3":
                        upgrade_juniors(state)
                        store(db, row["id"], state)
            if idx == 9:
                from .statistics.personnel import refresh

                for row in db.execute("SELECT id,state FROM career"):
                    refresh(db, row["id"], json.loads(row["state"]))
            if idx == 10:
                from .finance import activate
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    activate(state, WORLD, postings(db, cid))
                    store(db, cid, state)
            if idx == 11:
                from .finance import market
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    market.initialize(state, WORLD)
                    store(db, cid, state)
            if idx == 12:
                from .finance import budget
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    budget.initialize(state, WORLD, postings(db, cid))
                    store(db, cid, state)
            if idx == 13:
                from .finance import facilities
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    facilities.initialize(state, WORLD)
                    store(db, cid, state)
            if idx == 14:
                from .finance import capital
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    capital.initialize(state, WORLD)
                    store(db, cid, state)
            if idx == 15:
                from .finance import economy
                from .catalog import WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    cid = row["id"]
                    state = checkpoint(db, cid)
                    economy.initialize(state, WORLD)
                    store(db, cid, state)
            if idx == 17:
                from .finance import facilities

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    facilities.migrate(state)
                    store(db, row["id"], state)
            if idx == 18:
                from .driver_terms import initialize
                from .catalog import LINEUP_WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state, LINEUP_WORLD)
                    store(db, row["id"], state)
            if idx == 19:
                from .components import initialize

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    store(db, row["id"], state)
            if idx == 20:
                from .catalog import LINEUP_WORLD
                from .research import initialize, write_fact

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    for report in state["research"]["reports"].values():
                        write_fact(db, row["id"], LINEUP_WORLD, report)
                    store(db, row["id"], state)
            if idx == 21:
                from .catalog import LINEUP_WORLD
                from .development import initialize, write_fact

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    for event in state["development"]["history"]:
                        write_fact(db, row["id"], state, LINEUP_WORLD, event)
                    store(db, row["id"], state)
            if idx == 22:
                from .catalog import LINEUP_WORLD
                from .production import initialize, write_fact

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    for event in state["production"]["history"]:
                        write_fact(db, row["id"], state, LINEUP_WORLD, event)
                    store(db, row["id"], state)
            if idx == 23:
                from .council import initialize, write_fact
                from .catalog import LINEUP_WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    for event in state["council"]["history"]:
                        write_fact(db, row["id"], state, LINEUP_WORLD, event)
                    store(db, row["id"], state)
            if idx == 24:
                from .programme import initialize

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    store(db, row["id"], state)
            if idx == 25:
                from .manufacturer import initialize
                from .manufacturer.history import write_fact
                from .catalog import LINEUP_WORLD

                for row in db.execute("SELECT id FROM career").fetchall():
                    state = checkpoint(db, row["id"])
                    initialize(state)
                    for event in state["manufacturer"]["events"]:
                        write_fact(db, row["id"], state, LINEUP_WORLD, event)
                    store(db, row["id"], state)
            db.execute(f"PRAGMA user_version={idx + 1}")
        yield db
        db.commit()
    finally:
        db.close()  # Rolls back any uncommitted migration, posting or checkpoint.


def checkpoint(db, cid):
    row = db.execute("SELECT state FROM career WHERE id=?", (cid,)).fetchone()
    if not row:
        raise RuleError("Сохранение не найдено.", 404)
    state = json.loads(row[0])
    if state.get("rules") != VERSION:
        raise RuleError("Версия сохранённых правил недоступна.", 409)
    state["ledger"] = []
    return state


def store(db, cid, state, *, create=False):
    doc = dict(state)
    postings = doc.pop("ledger")
    if create:
        db.execute("INSERT INTO career VALUES (?, ?)", (cid, dump(doc)))
    else:
        db.execute("UPDATE career SET state=? WHERE id=?", (dump(doc), cid))
    db.executemany(
        "INSERT INTO posting(career,org,key,date,source,delta_cents) VALUES(?,?,?,?,?,?)",
        [
            (cid, p["org"], p["key"], p["date"], p["source"], p["delta_cents"])
            for p in postings
        ],
    )


def postings(db, cid, org=None):
    query = "SELECT org,key,date,source,delta_cents FROM posting WHERE career=?"
    args = [cid]
    if org:
        query += " AND org=?"
        args.append(org)
    return [dict(r) for r in db.execute(query + " ORDER BY date,org,key", args)]


def receipts(db, cid):
    rows = db.execute(
        "SELECT command_id, revision, action, paint FROM receipt WHERE career=? ORDER BY revision",
        (cid,),
    )
    commands = []
    for row in rows:
        item = dict(row)
        paint = item.pop("paint")
        if paint is not None:
            item[
                "paint"
                if item["action"] == "save-livery"
                else "brand_palette"
                if item["action"] == "organization-palette"
                else "finance"
                if item["action"].startswith("finance-")
                else "manufacturer"
                if item["action"].startswith("maker-")
                else "programme"
                if item["action"].startswith("programme-")
                else "council"
                if item["action"].startswith("council-")
                else "production"
                if item["action"].startswith("production-")
                else "development"
                if item["action"].startswith("development-")
                else "research"
                if item["action"].startswith("research-")
                else "engineering"
                if item["action"].startswith("component-")
                else "staff"
            ] = json.loads(paint)
        commands.append(item)
    return commands
