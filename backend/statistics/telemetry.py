"""Lossless, little-endian float64 channel blocks with a shared uniform sample clock."""

import hashlib
import json
import struct
import zlib
from datetime import date, timedelta
from typing import Annotated

from pydantic import Field

from ..domain import RuleError
from ..staff_input import Fields
from ..storage import dump
from ..supply import ObservationScope, entry_agreement, support_on, visible_channels
from .facts import atomic, bind_context, reader
from .models import ChannelBlock, ChannelHeader, RecordingPolicy


class Blocks(Fields):
    blocks: Annotated[list[ChannelBlock], Field(min_length=1, max_length=32)]


def unpack(blob, count):
    codec = zlib.decompressobj()
    raw = codec.decompress(blob, 8 * count + 1)
    if len(raw) != 8 * count or not codec.eof or codec.unused_data:
        raise ValueError("Повреждён блок телеметрии.")
    return list(struct.unpack(f"<{count}d", raw))


def store_block(db, cid, header, count, digest, blob):
    ctx = header.context
    bind_context(db, cid, "simulation", ctx)
    stream = (
        cid,
        ctx.session,
        ctx.car,
        header.channel,
        ctx.component.instance if ctx.component and ctx.component.instance else "",
    )
    start = header.first_us
    end = start + count * header.period_us
    if not 1 <= count <= 4096 or end > 2**53:
        raise ValueError("Недопустимая длина блока.")
    meta = dump(header.model_dump())
    prev = db.execute(
        """SELECT first_us,end_us,meta,digest FROM stat_channel
        WHERE (career,session,car,channel,instance)=(?,?,?,?,?) AND first_us<?
        ORDER BY first_us DESC LIMIT 1""",
        (*stream, end),
    ).fetchone()
    if prev and prev["end_us"] > start:
        if tuple(prev) == (start, end, meta, digest):
            return  # Includes an expired chunk whose compact receipt remains.
        raise RuleError("Пересечение блоков или конфликт содержимого телеметрии.", 409)
    db.execute(
        "INSERT INTO stat_channel VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (*stream, start, end, header.day, meta, digest, blob),
    )


def get_policy(db, cid):
    row = db.execute(
        "SELECT period_us,archive_days FROM stat_policy WHERE career=?", (cid,)
    ).fetchone()
    return RecordingPolicy(**dict(row)) if row else None


def configure(db, cid, policy: RecordingPolicy):
    with atomic(db):
        day = date.fromisoformat(reader(db, cid)["day"])
        db.execute(
            """INSERT INTO stat_policy VALUES(?,?,?) ON CONFLICT(career)
            DO UPDATE SET period_us=excluded.period_us,archive_days=excluded.archive_days""",
            (cid, policy.period_us, policy.archive_days),
        )
        prune(db, cid, day, policy)


def record(db, cid, batch: Blocks):
    policy = get_policy(db, cid)
    if not policy:
        raise RuleError("Источник должен указать частоту и глубину архива.")
    today = date.fromisoformat(reader(db, cid)["day"])
    with atomic(db):
        for block in batch.blocks:
            block = ChannelBlock.model_validate(block.model_dump())
            if block.period_us != policy.period_us:
                raise RuleError("Частота блока расходится с настройкой записи.")
            raw = struct.pack(f"<{len(block.values)}d", *block.values)
            header = ChannelHeader.model_validate(block.model_dump(exclude={"values"}))
            store_block(
                db,
                cid,
                header,
                len(block.values),
                hashlib.sha256(raw).hexdigest(),
                zlib.compress(raw),
            )
        prune(db, cid, today, policy)


def prune(db, cid, day: date, policy: RecordingPolicy):
    """Expire raw samples only, by game day. NULL depth keeps the full archive."""
    if policy.archive_days is None:
        return 0
    cutoff = day - timedelta(days=min(policy.archive_days, day.toordinal() - 1))
    with atomic(db):
        return db.execute(
            """UPDATE stat_channel SET samples=NULL
            WHERE career=? AND day<? AND samples IS NOT NULL""",
            (cid, cutoff.isoformat()),
        ).rowcount


def permitted(viewer, header):
    ctx = header.context
    if viewer["org"] == ctx.org:
        return True
    part = ctx.component
    if (
        viewer["role"] != "manufacturer"
        or not part
        or not part.instance
        or not ctx.contract
    ):
        return False
    scope = ObservationScope(
        ctx.org,
        ctx.car,
        ctx.session,
        ctx.session_kind,
        part.manufacturer,
        part.product,
        part.version,
        part.instance,
    )
    for assignment in json.loads(viewer["support"]):
        if (
            assignment["agreement"] != ctx.contract
            or (
                assignment["entry"] != ctx.entry
                if "entry" in assignment
                else ctx.contract != entry_agreement(ctx.entry, part.product)
            )
            or not assignment["start"] <= viewer["day"] < assignment["end"]
            or header.day > viewer["day"]
        ):
            continue
        grant = support_on({"support": [assignment]}, assignment["advisor"], header.day)
        if visible_channels(grant, scope, header.day, viewer["org"], [header.channel]):
            return True
    return False


def read(db, cid, *, session, car, channel, start_us, end_us, instance="", limit=8):
    """One selected channel/instance, half-open range. Continue from next_us."""
    viewer = reader(db, cid)
    if not 0 <= start_us < end_us <= 2**53 or not 1 <= limit <= 32:
        raise RuleError("Некорректный интервал или размер страницы.")
    stream = (cid, session, car, channel, instance)
    where = "(career,session,car,channel,instance)=(?,?,?,?,?)"
    first = db.execute(
        f"""SELECT first_us FROM stat_channel WHERE {where} AND first_us<=?
        ORDER BY first_us DESC LIMIT 1""",
        (*stream, start_us),
    ).fetchone()
    samples = []
    rows = db.execute(
        f"""SELECT first_us,end_us,meta FROM stat_channel WHERE {where}
        AND first_us>=? AND first_us<? AND end_us>? AND samples IS NOT NULL ORDER BY first_us""",
        (*stream, first[0] if first else start_us, end_us, start_us),
    )
    for r in rows:
        header = ChannelHeader.model_validate_json(r["meta"])
        if not permitted(viewer, header):
            continue
        if len(samples) == limit:
            return dict(blocks=samples, next_us=r["first_us"])
        blob = db.execute(
            f"SELECT samples FROM stat_channel WHERE {where} AND first_us=?",
            (*stream, r["first_us"]),
        ).fetchone()[0]
        period = header.period_us
        first_idx = max(0, (start_us - r["first_us"] + period - 1) // period)
        stop = (end_us - r["first_us"] + period - 1) // period
        values = unpack(blob, (r["end_us"] - r["first_us"]) // period)[first_idx:stop]
        if values:
            samples.append(
                dict(
                    first_us=r["first_us"] + first_idx * period,
                    period_us=period,
                    unit=header.unit,
                    unit_version=header.unit_version,
                    version=header.version,
                    values=values,
                )
            )
    return dict(blocks=samples, next_us=None)
