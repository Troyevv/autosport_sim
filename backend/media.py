"""Atomic local raster packs. ZIP member names are never used as filesystem paths."""

import hashlib
import io
import json
import re
import stat
import zipfile
import zlib

from PIL import Image
from pydantic import Field, model_validator
from typing import Annotated, Literal

from .catalog import WORLD
from .domain import RuleError
from .service import Strict
from .studio_sources import REVIEWED
from .storage import dump, transaction

LIMIT = 64 * 1024 * 1024
ITEM_LIMIT = 4 * 1024 * 1024
Kind = Literal["head", "generated-head", "logo", "car", "sponsor-strip", "uniform"]


Coordinate = Annotated[float, Field(ge=-1024, le=2048, allow_inf_nan=False)]
Curve = Annotated[list[Coordinate], Field(min_length=27, max_length=27)]
Outline = tuple[Curve, Curve]


def check_outline(outline):
    if any(b <= a for a, b in zip(outline[0], outline[0][1:])):
        raise ValueError("Некорректные измерения плеч и воротника.")


class Anatomy(Strict):
    camera: tuple[Coordinate, Coordinate, Coordinate, Coordinate]
    body: Outline
    nativeWidth: int = Field(ge=1, le=10000)

    @model_validator(mode="after")
    def measured(self):
        check_outline(self.body)
        if not (5 <= self.camera[2] <= 512 and 5 <= self.camera[3] <= 600):
            raise ValueError("Недопустимая область кадрирования.")
        return self


class Rig(Strict):
    span: float = Field(ge=10, le=4096)
    seat: tuple[Coordinate, Coordinate]
    collar: tuple[Coordinate, Coordinate]


class Garment(Strict):
    rig: Rig
    outline: Outline

    @model_validator(mode="after")
    def measured(self):
        check_outline(self.outline)
        return self


class Asset(Strict):
    originalSha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    anatomy: Anatomy | None = None
    garment: Garment | None = None
    kind: Kind
    entity: str = Field(pattern=r"^[a-z0-9-]{1,100}$")
    path: str = Field(pattern=r"^images/[a-z0-9-]{1,130}\.(png|webp|jpg)$")
    source: str = Field(min_length=1, max_length=1000)
    author: str = Field(min_length=1, max_length=200)
    license: str = Field(min_length=1, max_length=400)
    changes: str = Field(max_length=400)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Manifest(Strict):
    version: Literal[1]
    world: Literal["2025-v1"]
    assets: list[Asset] = Field(min_length=1, max_length=800)
    gaps: list[str] = Field(max_length=1024)


def known(a):
    if a.kind == "head":
        original = REVIEWED.get((a.entity, a.originalSha256))
        return (
            a.entity in WORLD["names"]
            and original is not None
            and a.anatomy is not None
            and (a.source, a.license, a.author)
            == (original.source, original.license, original.author)
        )
    if a.kind == "generated-head":
        return re.fullmatch(r"generated-[a-z0-9-]{1,65}", a.entity)
    if a.kind == "car":
        return a.entity in WORLD["cars"]
    if a.kind == "uniform":
        role, _, org = a.entity.removeprefix("studio-").partition("-")
        if not org:
            return role in {"driver", "staff", "manufacturer", "neutral"}
        owner = WORLD["organizations"].get(org)
        return bool(
            owner
            and role
            in (
                {"manufacturer"} if owner["kind"] == "supplier" else {"driver", "staff"}
            )
        )
    if a.kind == "logo" and a.entity in WORLD["championships"]:
        return True
    return a.entity in WORLD["organizations"]


def validate(data):
    if len(data) > LIMIT:
        raise ValueError("ZIP превышает 64 МиБ.")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        items = archive.infolist()
        paths = set(archive.namelist())
        if (
            len(items) > 801
            or len(paths) != len(items)
            or sum(i.file_size for i in items) > LIMIT
        ):
            raise ValueError("Превышены ограничения архива или повторяется путь.")
        for item in items:
            if (
                item.file_size > ITEM_LIMIT
                or stat.S_ISLNK(item.external_attr >> 16)
                or (
                    item.filename != "manifest.json"
                    and not re.fullmatch(
                        r"images/[a-z0-9-]+\.(png|jpg|webp)", item.filename
                    )
                )
            ):
                raise ValueError("Недопустимый путь, тип или размер.")
        manifest = Manifest.model_validate_json(archive.read("manifest.json"))
        expected = {a.path for a in manifest.assets}
        if len(expected) != len(manifest.assets) or paths != expected | {
            "manifest.json"
        }:
            raise ValueError("Список файлов расходится с manifest.")
        keys, assets = set(), []
        for a in manifest.assets:
            key = (a.kind, a.entity)
            if key in keys or not known(a):
                raise ValueError("Неизвестный или повторяющийся ID.")
            if a.anatomy and a.kind not in {"head", "generated-head"}:
                raise ValueError("Анатомические измерения допустимы только для лица.")
            if bool(a.garment) != (
                a.kind == "uniform" and a.entity.startswith("studio-")
            ):
                raise ValueError("Для студийной ткани нужны измерения воротника.")
            keys.add(key)
            content = archive.read(a.path)
            if hashlib.sha256(content).hexdigest() != a.sha256:
                raise ValueError("Контрольная сумма изображения не совпадает.")
            with Image.open(io.BytesIO(content)) as im:
                fmt = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP"}[
                    a.path.rsplit(".", 1)[1]
                ]
                if (
                    im.format != fmt
                    or im.width * im.height > 8_000_000
                    or im.n_frames != 1
                ):
                    raise ValueError("Неподдерживаемый формат или размер изображения.")
                if a.kind in {"head", "generated-head", "uniform"} and (
                    (
                        not a.garment
                        and im.size != ((480, 560) if a.anatomy else (256, 320))
                    )
                    or im.mode != "RGBA"
                    or im.getchannel("A").getextrema() != (0, 255)
                ):
                    raise ValueError(
                        f"Некорректный размер, формат RGBA или прозрачность слоя {a.entity}."
                    )
                im.load()
            assets.append((*key, dump(a.model_dump(exclude_none=True)), content))
        return assets


def install(data):
    try:
        assets = validate(data)
    except (
        ValueError,
        KeyError,
        OSError,
        SyntaxError,
        zlib.error,
        zipfile.BadZipFile,
        RuntimeError,
        Image.DecompressionBombError,
    ) as exc:
        raise RuleError("Пакет изображений отклонён: " + str(exc)[:180]) from None
    with transaction(True) as db:
        db.executemany(
            """INSERT INTO media VALUES(?,?,?,?) ON CONFLICT(kind,entity) DO UPDATE
            SET metadata=excluded.metadata, content=excluded.content WHERE metadata != excluded.metadata""",
            assets,
        )
    return len(assets)


def index():
    with transaction() as db:
        return [
            json.loads(row[0])
            for row in db.execute("SELECT metadata FROM media ORDER BY kind,entity")
        ]


def get(kind, entity):
    with transaction() as db:
        row = db.execute(
            "SELECT metadata,content FROM media WHERE kind=? AND entity=?",
            (kind, entity),
        ).fetchone()
        if not row:
            raise RuleError("Изображение отсутствует.", 404)
        return json.loads(row[0]), row[1]
