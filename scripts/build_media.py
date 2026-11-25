"""Build a private, attributed raster pack; run as python -m scripts.build_media OUTPUT.zip."""

import argparse
import hashlib
import html
import io
import json
import re
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import cv2
import resvg_py
from PIL import Image, ImageOps

from backend.catalog import WORLD
from backend.media import validate
from .portrait_processing import PortraitProcessor
from .portrait_fit import fit_studio_source, kit_guide
import numpy as np
from . import portrait_sources as sources

ROOT = Path(__file__).resolve().parents[1]
ICONS = "https://registry.npmjs.org/simple-icons/-/simple-icons-13.21.0.tgz"
ICON_HASH = "33e4e8c92f51bac4c4e88c3b2d98ad2b4faa91a00cbfdf24c894e8691a2e63ea"


def get(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AutosportSim-local-media/1.0 (github.com/Troyevv/autosport_sim)"
        },
    )
    with urllib.request.urlopen(request, timeout=16) as response:
        data = response.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise ValueError("Источник превышает 16 МиБ")
    return data


def png(im):
    out = io.BytesIO()
    im.save(out, "PNG", optimize=True)
    return out.getvalue()


def commons_car(title):
    query = urllib.parse.urlencode(
        dict(
            action="query",
            format="json",
            prop="imageinfo",
            titles="File:" + title,
            iiprop="url|extmetadata",
        )
    )
    pages = json.loads(get("https://commons.wikimedia.org/w/api.php?" + query))[
        "query"
    ]["pages"]
    info = next(iter(pages.values()))["imageinfo"][0]
    meta = info["extmetadata"]
    license_name = meta["LicenseShortName"]["value"]
    if not re.fullmatch(r"CC (BY|BY-SA) [234]\.0|CC0|Public domain", license_name):
        raise ValueError("Нет подтверждённой совместимой лицензии")
    author = html.unescape(re.sub("<[^>]*>", "", meta["Artist"]["value"])).strip()
    url = info["url"]
    if urllib.parse.urlparse(url).hostname != "upload.wikimedia.org":
        raise ValueError("Неизвестный источник изображения")
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(get(url))))
    im.thumbnail((1200, 900))
    data = png(im)
    return (
        data,
        info["descriptionurl"],
        author,
        license_name + " " + meta.get("LicenseUrl", {}).get("value", ""),
        "Уменьшение, PNG; для портрета — маска головы.",
    )


def source_bytes(item):
    digest = item.get("sha256")
    if not digest:
        return sources.fetch(item["image"], set(item["hosts"]), 16 * 1024 * 1024)
    cache = ROOT / ".autosport/media-cache" / digest
    if cache.is_file():
        data = cache.read_bytes()
        if hashlib.sha256(data).hexdigest() == digest:
            return data
    data = sources.fetch(item["image"], {"raw.githubusercontent.com"}, 16 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Снимок источника отличается от проверенной версии")
    cache.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=cache.parent, delete=False) as stream:
        stream.write(data)
    Path(stream.name).replace(cache)
    return data


def studio_portraits(add, gaps, curated):
    """Build only the individually selected subjects in the fitting review."""
    data_dir = ROOT / "scripts/data"
    review = json.loads((data_dir / "studio-review.json").read_text(encoding="utf-8"))
    subjects = []
    for file in sorted((data_dir / "studio").glob("*.webp")):
        subjects.append(
            dict(
                entity=file.stem,
                file=file,
                source="https://github.com/Troyevv/autosport_sim/tree/issue-3-career-world/scripts/data/studio",
                author="Autosport Sim / OpenAI ImageGen",
                license="MIT (project artwork)",
            )
        )
    subjects.extend(r for r in curated if r["kind"] == "head")
    processor = PortraitProcessor()

    try:
        for record in subjects:
            pid = record["entity"]
            native = "file" in record
            try:
                raw = record["file"].read_bytes() if native else source_bytes(record)
                head, anatomy = fit_studio_source(raw, processor)
            except (ValueError, OSError, sources.Unavailable, cv2.error) as err:
                gaps.append(f"head/{pid}: {err}")
                print(f"Пропущен {pid}: {err}", flush=True)
                continue
            annotation = review.get(hashlib.sha256(raw).hexdigest())
            if annotation:
                for point, ordinate in annotation["shoulderY"].items():
                    anatomy["body"][1][int(point)] = ordinate
            attribution = (record["source"], record["author"], record["license"])
            add(
                "generated-head" if native else "head",
                pid,
                head,
                *attribution,
                "Единый масштаб кадра; сегментация лица, волос и видимой шеи.",
                anatomy=anatomy,
            )
    finally:
        processor.close()


def build(output):
    assets, files, gaps = [], {}, []

    def add(
        kind,
        entity,
        data,
        source,
        author,
        license,
        changes,
        extension="png",
        **geometry,
    ):
        path = f"images/{kind}-{entity}.{extension}"
        assets.append(
            dict(
                kind=kind,
                entity=entity,
                path=path,
                source=source,
                author=author,
                license=license,
                changes=changes,
                sha256=hashlib.sha256(data).hexdigest(),
                **geometry,
            )
        )
        files[path] = data
        print(f"Подготовлено {len(assets)} · {kind}/{entity}", flush=True)

    art = "https://github.com/Troyevv/autosport_sim/tree/issue-3-career-world"
    for file in sorted((ROOT / "frontend/public/assets/wardrobe").glob("*.webp")):
        add(
            "uniform",
            file.stem,
            file.read_bytes(),
            art + "/frontend/public/assets/wardrobe",
            "Autosport Sim / OpenAI ImageGen",
            "MIT (project artwork)",
            "Фотографическая текстура, маска по воротнику.",
            "webp",
        )
    # Front garment surfaces measured in their native photographic plane.
    for file in sorted((ROOT / "frontend/public/assets/studio-wardrobe").glob("*.webp")):
        with Image.open(file) as image:
            w, h = image.size
            center = w // 2
            front = int(np.flatnonzero(np.asarray(image)[:, center, 3] > 120)[0])
            rig = dict(span=w, collar=[center, front], seat=[120, 157])
            add(
                "uniform",
                "studio-" + file.stem,
                file.read_bytes(),
                art + "/frontend/public/assets/studio-wardrobe",
                "Autosport Sim / OpenAI ImageGen",
                "MIT (project artwork)",
                "Фотографическая ткань и измеренный контур переднего края.",
                "webp",
                garment=dict(rig=rig, outline=kit_guide(image, rig)),
            )
    try:
        print("Загрузка эмблем Simple Icons…", flush=True)
        raw = get(ICONS)
        if hashlib.sha256(raw).hexdigest() != ICON_HASH:
            raise ValueError("Неизвестная версия Simple Icons")
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
            for name, entities in {
                "f1": ["f1"],
                "mclaren": ["team-mclaren-formula-1-team"],
                "mercedes": ["supplier-mercedes"],
                "ferrari": ["supplier-ferrari", "team-scuderia-ferrari"],
                "bmw": ["supplier-bmw"],
                "renault": ["supplier-renault"],
                "toyota": ["supplier-toyota"],
                "porsche": ["supplier-porsche"],
                "astonmartin": ["team-aston-martin-aramco-f1-team"],
            }.items():
                svg = tar.extractfile("package/icons/" + name + ".svg").read().decode()
                raster = resvg_py.svg_to_bytes(
                    svg_string=svg.replace("<path ", "<path fill='#ededee' "),
                    width=256,
                    height=256,
                )
                for entity in entities:
                    add(
                        "logo",
                        entity,
                        raster,
                        ICONS,
                        "Simple Icons contributors / " + name,
                        "Simple Icons CC0-1.0; trademark rights retained. Local identification only.",
                        "Монохромный PNG.",
                    )
    except (OSError, ValueError) as exc:
        gaps.append("Simple Icons: " + str(exc))
    curated = json.loads(
        (ROOT / "scripts/data/photo-sources.json").read_text(encoding="utf8")
    )
    for item in curated:
        if item["kind"] != "logo":
            continue
        try:
            raw = source_bytes(item)
            if item["image"].endswith(".svg"):
                raw = resvg_py.svg_to_bytes(svg_string=raw.decode(), width=256)
            with Image.open(io.BytesIO(raw)) as im:
                im.thumbnail((256, 256))
                add(
                    "logo",
                    item["entity"],
                    png(im.convert("RGBA")),
                    item["source"],
                    item["author"],
                    item["license"],
                    "Локальная идентификация организации; растровая копия.",
                )
        except (ValueError, OSError, sources.Unavailable) as ex:
            gaps.append(item["entity"] + " · " + str(ex))
    existing_logos = {a["entity"] for a in assets if a["kind"] == "logo"}
    organizations = {**WORLD["championships"], **WORLD["organizations"]}
    logo_names = {
        "f1": "Formula One",
        "f2": "FIA Formula 2 Championship",
        "f3": "FIA Formula 3 Championship",
        "wec": "FIA World Endurance Championship",
        "dtm": "Deutsche Tourenwagen Masters",
    }
    for oid, org in organizations.items():
        if oid in existing_logos:
            continue
        try:
            for candidate in sources.organization_logos(
                logo_names.get(oid, org["name"])
            ):
                with Image.open(io.BytesIO(source_bytes(candidate))) as im:
                    im.thumbnail((256, 256))
                    add(
                        "logo",
                        oid,
                        png(im.convert("RGBA")),
                        candidate["source"],
                        candidate["author"],
                        candidate["license"],
                        "Растровая эмблема. Товарные знаки правообладателей.",
                    )
                break
        except (ValueError, KeyError, OSError, sources.Unavailable) as err:
            gaps.append(f"logo/{oid}: {err}")
    studio_portraits(add, gaps, curated)
    try:
        add(
            "car",
            "car-f1-4",
            *commons_car("2025 Japan GP - McLaren - Lando Norris - FP1 (cropped).jpg"),
        )
    except (OSError, ValueError, KeyError, IndexError) as exc:
        gaps.append(f"car/car-f1-4: {exc}")
    portrait_ids = {r["entity"] for r in curated if r["kind"] == "head"}
    present = {(a["kind"], a["entity"]) for a in assets}
    missing = 0
    for kind, entities in [
        ("head", WORLD["names"]),
        ("logo", {**WORLD["championships"], **WORLD["organizations"]}),
        ("car", WORLD["cars"]),
    ]:
        missing += sum((kind, eid) not in present for eid in entities)
        gaps.extend(
            f"{kind}/{eid}: "
            + (
                "вне контрольной подборки"
                if kind == "head"
                else "нет подготовленного разрешённого изображения"
            )
            for eid in sorted(entities)
            if (kind, eid) not in present
            and not (kind == "head" and eid in portrait_ids)
        )
    print(
        f"Портреты: реальных {sum(a[0] == 'head' for a in present)}, синтетических {sum(a[0] == 'generated-head' for a in present)}.",
        flush=True,
    )
    print("Запись и проверка ZIP…", flush=True)
    manifest = dict(version=1, world=WORLD["version"], assets=assets, gaps=gaps)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staged = Path(tmp) / "pack.zip"
        with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(
                "manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False)
            )
            for path, content in files.items():
                z.writestr(path, content)
        validate(staged.read_bytes())
        staged.replace(output)
    print(
        f"{output} · подготовлено: {len(assets)} · отсутствует: {missing} (manifest.json)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
