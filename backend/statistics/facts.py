"""Store a producer batch in the caller's write transaction. Reads use the saved player."""

import json
import sqlite3
from contextlib import contextmanager
from itertools import islice

from ..domain import RuleError
from ..storage import dump
from .models import Batch, Fact, Lap, Result, Session

COLUMNS = "career,source,key,kind,day,origin,access,owner,person,org,series,season,layout,session,program,manufacturer,track,layout_version,context_id,body"
INSERT = f"INSERT INTO stat_fact({COLUMNS}) VALUES({','.join('?' for _ in COLUMNS.split(','))})"
FILTERS = (
    "person",
    "org",
    "series",
    "season",
    "layout",
    "session",
    "kind",
    "origin",
    "program",
    "manufacturer",
    "track",
    "layout_version",
)


@contextmanager
def atomic(db):
    if not db.in_transaction:
        raise RuntimeError("Statistics writes require a career transaction")
    db.execute("SAVEPOINT statistics_batch")
    try:
        yield
    except BaseException:
        db.execute("ROLLBACK TO statistics_batch")
        raise
    finally:
        db.execute("RELEASE statistics_batch")


def row(
    cid, source, key, kind, day, origin, access, owner, context, body, context_id=None
):
    return (
        cid,
        source,
        dump(key),
        kind,
        day,
        origin,
        access,
        owner,
        *(
            context.get(k)
            for k in ("person", "org", "series", "season", "layout", "session")
        ),
        context.get("program"),
        context.get("manufacturer")
        or (context.get("component") or {}).get("manufacturer"),
        context.get("track"),
        context.get("layout_version"),
        context_id,
        dump(body),
    )


SESSION_FIELDS = {
    "series",
    "season",
    "regulation",
    "round",
    "session_kind",
    "track",
    "layout",
    "layout_version",
}


def bind_context(db, cid, origin, ctx):
    if ctx.component and ctx.component.instance:
        part = ctx.component
        identity = dump(part.model_dump(exclude={"instance"}))
        key = (cid, origin, part.instance)
        known = db.execute(
            "SELECT identity FROM stat_instance WHERE (career,origin,instance)=(?,?,?)",
            key,
        ).fetchone()
        if known is None:
            db.execute("INSERT INTO stat_instance VALUES(?,?,?,?)", (*key, identity))
        elif known[0] != identity:
            raise RuleError("Экземпляр уже связан с другой спецификацией.", 409)
    if not isinstance(ctx, Session):
        return

    scope = dump(ctx.model_dump(include=SESSION_FIELDS))
    key = (cid, origin, ctx.session)
    saved = db.execute(
        "SELECT scope FROM stat_session WHERE career=? AND origin=? AND session=?", key
    ).fetchone()
    if saved is None:
        db.execute("INSERT INTO stat_session VALUES(?,?,?,?)", (*key, scope))
    elif saved[0] != scope:
        raise RuleError("Идентификатор сессии связан с другим этапом или версией.", 409)

    key = (cid, origin, ctx.session, ctx.entry)
    dimensions = (ctx.car, ctx.org, ctx.program)
    existing = db.execute(
        "SELECT car,org,program FROM stat_entry WHERE (career,origin,session,entry)=(?,?,?,?)",
        key,
    ).fetchone()
    if existing is None:
        try:
            db.execute(
                "INSERT INTO stat_entry VALUES(?,?,?,?,?,?,?)", (*key, *dimensions)
            )
        except sqlite3.IntegrityError:
            raise RuleError(
                "Автомобиль уже зарегистрирован в другой заявке этой сессии.", 409
            ) from None
    elif tuple(existing) != dimensions:
        raise RuleError("Изменились машина или организация подтверждённой заявки.", 409)


def fact_row(db, cid, fact, contexts):
    data = fact.data
    ctx = data.context
    if isinstance(data, (Lap, Result)):
        identity = [ctx.session, ctx.entry]
        if isinstance(data, Lap):
            identity.append(data.lap)
    else:
        identity = [data.source_id]
    context = ctx.model_dump(exclude_none=True)
    encoded = dump(context)
    cache_key = (fact.origin, encoded)
    if cache_key not in contexts:
        bind_context(db, cid, fact.origin, ctx)
        found = db.execute(
            "SELECT id FROM stat_context WHERE career=? AND body=?", (cid, encoded)
        ).fetchone()
        contexts[cache_key] = (
            found[0]
            if found
            else db.execute(
                "INSERT INTO stat_context(career,body) VALUES(?,?)", (cid, encoded)
            ).lastrowid
        )
    return row(
        cid,
        "producer",
        [fact.origin, data.kind, *identity],
        data.kind,
        fact.day,
        fact.origin,
        fact.access,
        ctx.org,
        context,
        data.model_dump(exclude={"context"}),
        contexts[cache_key],
    )


def record(db, cid, batch: Batch):
    with atomic(db):
        contexts = {}
        for fact in batch.facts:
            fact = Fact.model_validate(fact.model_dump())
            values = fact_row(db, cid, fact, contexts)
            inserted = db.execute(
                INSERT + " ON CONFLICT(career,source,key) DO NOTHING", values
            )
            if inserted.rowcount == 0:
                old = db.execute(
                    "SELECT day,access,context_id,body FROM stat_fact WHERE career=? AND source=? AND key=?",
                    values[:3],
                ).fetchone()
                if tuple(old) != (fact.day, fact.access, *values[-2:]):
                    raise RuleError("Ключ факта уже связан с другими данными.", 409)
            elif isinstance(fact.data, Lap):
                lap = fact.data
                db.execute(
                    """INSERT INTO stat_laps VALUES(?,?,?,?,?,?,1,?)
                    ON CONFLICT(career,session,entry,origin,access,owner) DO UPDATE SET
                    laps=laps+1, fastest_us=CASE WHEN fastest_us IS NULL OR excluded.fastest_us < fastest_us
                        THEN excluded.fastest_us ELSE fastest_us END""",
                    (
                        cid,
                        lap.context.session,
                        lap.context.entry,
                        fact.origin,
                        fact.access,
                        lap.context.org,
                        lap.elapsed_us if lap.eligible_for_record else None,
                    ),
                )


def rebuild_laps(db, cid):
    with atomic(db):
        db.execute("DELETE FROM stat_laps WHERE career=?", (cid,))
        db.execute(
            """INSERT INTO stat_laps
            SELECT f.career,session,json_extract(c.body,'$.entry'),origin,access,owner,
                   count(*),min(CASE WHEN json_extract(f.body,'$.eligible_for_record')
                                     THEN json_extract(f.body,'$.elapsed_us') END)
            FROM stat_fact f JOIN stat_context c ON c.id=f.context_id
            WHERE f.career=? AND kind='lap' AND source='producer'
            GROUP BY 1,2,3,4,5,6""",
            (cid,),
        )


def reader(db, cid):
    result = db.execute("SELECT * FROM stat_reader WHERE career=?", (cid,)).fetchone()
    if result is None:
        raise RuleError("Сохранение не найдено.", 404)
    return result


def body(r):
    data = json.loads(r["body"])
    if r["source"] == "domain":
        return data
    return dict(
        version=1,
        day=r["day"],
        access=r["access"],
        origin=r["origin"],
        data=dict(data, context=json.loads(r["context"])),
    )


def page(db, cid, *, filters=None, after=None, limit=50):
    org = reader(db, cid)["org"]
    where = ["career=?", "(access='public' OR owner=?)"]
    args = [cid, org]
    if not 1 <= limit <= 200:
        raise RuleError("Размер страницы вне диапазона.")
    for name, value in (filters or {}).items():
        if name not in FILTERS:
            raise RuleError("Неизвестный фильтр.")
        where.append(name + "=?")
        args.append(value)
    if after is not None:
        if (
            not isinstance(after, (tuple, list))
            or len(after) != 2
            or not isinstance(after[0], str)
            or type(after[1]) is not int
            or not 0 <= after[1] < 2**63
        ):
            raise RuleError("Некорректный курсор страницы.")
        where.append("(day,id)>(?,?)")
        args.extend(after)
    rows = db.execute(
        "SELECT id,day,source,key,kind,origin,access,owner,body,(SELECT body FROM stat_context WHERE id=context_id) AS context FROM stat_fact WHERE "
        + " AND ".join(where)
        + " ORDER BY day,id LIMIT ?",
        [*args, limit + 1],
    )
    items = []
    cursor = None
    for r in islice(rows, limit):
        cursor = [r["day"], r["id"]]
        visible = body(r)
        if r["source"] == "producer" and (org is None or r["owner"] != org):
            # A public classification can reference a private technical snapshot.
            for field in ("component", "contract"):
                visible["data"]["context"].pop(field, None)
        items.append(
            {k: r[k] for k in ("day", "source", "key", "kind", "origin", "access")}
            | {"body": visible}
        )
    return dict(items=items, after=cursor if rows.fetchone() is not None else None)


def lap_summary(db, cid, session, entry, origin="simulation"):
    org = reader(db, cid)["org"]
    return dict(
        db.execute(
            """SELECT coalesce(sum(laps),0) AS laps,min(fastest_us) AS fastest_us
        FROM stat_laps WHERE career=? AND session=? AND entry=? AND origin=?
        AND (access='public' OR owner=?)""",
            (cid, session, entry, origin, org),
        ).fetchone()
    )


def ledger(db, cid, *, after=("", ""), limit=50):
    if not 1 <= limit <= 200:
        raise RuleError("Размер страницы вне диапазона.")
    org = reader(db, cid)["org"]
    return [
        dict(r)
        for r in db.execute(
            """SELECT org,date,key,source,delta_cents FROM posting
        WHERE career=? AND org=? AND (date,key)>(?,?) ORDER BY date,key LIMIT ?""",
            (cid, org, *after, limit),
        )
    ]
