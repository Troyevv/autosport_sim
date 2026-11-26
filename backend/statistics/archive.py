"""Portable backup: a replayable legacy document followed by bounded, versioned records."""

import base64
import hashlib
import json
import os
import re
import struct
import zlib
from tempfile import TemporaryFile

from .. import service, storage
from ..domain import RuleError
from . import facts, telemetry
from .models import Batch, ChannelBlock, ChannelHeader, Fact, RecordingPolicy

MAGIC = b"AUTOSPORT-STATISTICS-1\n"
CORE_LIMIT = 128 * 1024 * 1024
ROW_LIMIT = 1024 * 1024


def file_limit():
    return int(os.environ.get("AUTOSPORT_ARCHIVE_LIMIT_BYTES", 4 * 1024**3))


def records(db, cid):
    policy = telemetry.get_policy(db, cid)
    if policy:
        yield ["policy", policy.model_dump()]
    for r in db.execute(
        """SELECT source,day,access,origin,body,
            (SELECT body FROM stat_context WHERE id=context_id) AS context FROM stat_fact
            WHERE career=? AND source='producer' ORDER BY key""",
        (cid,),
    ):
        yield ["fact", facts.body(r)]
    for r in db.execute(
        """SELECT meta,end_us,first_us,digest,samples FROM stat_channel WHERE career=?
            ORDER BY session,car,channel,instance,first_us""",
        (cid,),
    ):
        meta = json.loads(r["meta"])
        count = (r["end_us"] - r["first_us"]) // meta["period_us"]
        yield [
            "channel",
            meta,
            count,
            r["digest"],
            base64.b64encode(r["samples"]).decode("ascii")
            if r["samples"] is not None
            else None,
        ]


def restore(db, cid, entries):
    try:
        for item in entries:
            match item:
                case ["policy", policy]:
                    telemetry.configure(db, cid, RecordingPolicy.model_validate(policy))
                case ["fact", data]:
                    facts.record(db, cid, Batch(facts=[Fact.model_validate(data)]))
                case ["channel", meta, count, digest, encoded]:
                    header = ChannelHeader.model_validate(meta)
                    if (
                        type(count) is not int
                        or not 1 <= count <= 4096
                        or not re.fullmatch("[a-f0-9]{64}", digest)
                    ):
                        raise ValueError
                    blob = None
                    if encoded is not None:
                        blob = base64.b64decode(encoded, validate=True)
                        values = telemetry.unpack(blob, count)
                        ChannelBlock(**meta, values=values)
                        if (
                            hashlib.sha256(
                                struct.pack(f"<{count}d", *values)
                            ).hexdigest()
                            != digest
                        ):
                            raise ValueError
                    if not telemetry.get_policy(db, cid):
                        raise ValueError
                    telemetry.store_block(db, cid, header, count, digest, blob)
                case _:
                    raise ValueError
    except (TypeError, ValueError, zlib.error, RecursionError):
        raise RuleError("Повреждён архив статистики.") from None


def write_file(cid):
    """Spool one consistent database snapshot before handing it to a slow downloader."""
    file = TemporaryFile()
    try:
        with storage.transaction() as db:
            core = service.checkpoint_document(db, cid)
            extra = records(db, cid)
            first = next(extra, None)
            header = storage.dump(core).encode()
            if len(header) + 1 > CORE_LIMIT:
                raise RuleError("Снимок карьеры превышает допустимый размер.", 413)
            if first is None:
                file.write(header)
            else:
                file.write(MAGIC)
                file.write(header + b"\n")
                checksum = hashlib.sha256(header + b"\n")
                item = first
                while item is not None:
                    line = storage.dump(item).encode() + b"\n"
                    if len(line) > ROW_LIMIT or file.tell() + len(line) > file_limit():
                        raise RuleError("Превышен лимит файла архива.", 413)
                    file.write(line)
                    checksum.update(line)
                    item = next(extra, None)
                file.write(storage.dump(["end", checksum.hexdigest()]).encode() + b"\n")
            if file.tell() > file_limit():
                raise RuleError("Превышен лимит файла архива.", 413)
        file.seek(0)
        return file, first is not None
    except BaseException:
        file.close()
        raise


def read_file(file):
    def line(limit):
        data = file.readline(limit + 1)
        if len(data) > limit:
            raise RuleError("Запись сохранения превышает допустимый размер.", 413)
        return data

    try:
        if file.read(len(MAGIC)) != MAGIC:
            file.seek(0)
            raw = file.read(CORE_LIMIT + 1)
            if len(raw) > CORE_LIMIT:
                raise RuleError("Превышен размер JSON сохранения.", 413)
            return service.import_save(json.loads(raw))
        core = line(CORE_LIMIT)
        checksum = hashlib.sha256(core)

        def checked_records():
            while True:
                data = line(ROW_LIMIT)
                item = json.loads(data)
                if item == ["end", checksum.hexdigest()]:
                    if file.read(1):
                        raise ValueError
                    return
                checksum.update(data)
                yield item

        return service.import_save(
            json.loads(core), statistics_records=checked_records()
        )
    except RuleError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise RuleError("Не удалось прочитать сохранение.") from None
