"""SQLite checkpoints, posting uniqueness and command receipts share one transaction."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .domain import RuleError
from .catalog import VERSION

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
    db = sqlite3.connect(root / "world.sqlite3", isolation_level=None, timeout=10)
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
            item["paint" if item["action"] == "save-livery" else "staff"] = json.loads(
                paint
            )
        commands.append(item)
    return commands
