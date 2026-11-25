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

from backend.catalog import DISPLAY_NAMES, WORLD
from .media_report import coverage
from .wardrobe import colorway
from backend.studio_sources import REVIEWED
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
    data = sources.fetch(
        item["image"],
        set(item.get("hosts", ["raw.githubusercontent.com"])),
        16 * 1024 * 1024,
    )
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Снимок источника отличается от проверенной версии")
    cache.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=cache.parent, delete=False) as stream:
        stream.write(data)
    Path(stream.name).replace(cache)
    return data


def collect_portraits(add, gaps):
    directory = ROOT / "scripts/data"
    review = json.loads((directory / "studio-review.json").read_text(encoding="utf-8"))
    research = json.loads(
        (directory / "official-search.json").read_text(encoding="utf-8")
    )
    results = {}
    processor = PortraitProcessor()

    def prepare(entity, raw, source, author, license, original=None):
        digest = hashlib.sha256(raw).hexdigest()
        if original and digest != original:
            raise ValueError("Проверенный оригинал изменился.")
        head, anatomy = fit_studio_source(raw, processor)
        for point, y in review.get(digest, {}).get("shoulderY", {}).items():
            anatomy["body"][1][int(point)] = y
        if original and anatomy["nativeWidth"] < 300:
            raise ValueError("Недостаточное разрешение лица в оригинале.")
        encoded = io.BytesIO()
        with Image.open(io.BytesIO(head)) as pixels:
            pixels.save(encoded, "WEBP", quality=95, method=4)
        add(
            "head" if original else "generated-head",
            entity,
            encoded.getvalue(),
            source,
            author,
            license,
            "R3.2: сегментация, измерения головы, воротника и плеч.",
            extension="webp",
            anatomy=anatomy,
            **({"originalSha256": digest} if original else {}),
        )

    try:
        for file in sorted((directory / "studio").glob("*.webp")):
            try:
                prepare(
                    file.stem,
                    file.read_bytes(),
                    "https://github.com/Troyevv/autosport_sim/tree/issue-3-career-world/scripts/data/studio",
                    "Autosport Sim / OpenAI ImageGen",
                    "MIT (project artwork)",
                )
            except (ValueError, OSError, IndexError, cv2.error) as err:
                gaps.append(f"generated-head/{file.stem}: {err}")
        for index, (pid, name) in enumerate(sorted(DISPLAY_NAMES.items()), start=1):
            print(f"Портрет {index}/{len(DISPLAY_NAMES)} · {name}", flush=True)
            status = results[pid] = {**research[pid], "prepared": False, "attempts": []}
            for item in (s for s in REVIEWED.values() if s.entity == pid):
                try:
                    raw = source_bytes(
                        {
                            **item.model_dump(),
                            "hosts": [urllib.parse.urlsplit(item.image).hostname],
                        }
                    )
                    prepare(
                        pid, raw, item.source, item.author, item.license, item.sha256
                    )
                except (
                    ValueError,
                    OSError,
                    IndexError,
                    cv2.error,
                    sources.Unavailable,
                ) as err:
                    status["attempts"].append(
                        {"source": item.source, "reason": str(err)}
                    )
                    continue
                status.update(prepared=True, source=item.source)
                break
            if not status["prepared"]:
                gaps.append(
                    f"head/{pid}: "
                    + (
                        status["attempts"][-1]["reason"]
                        if status["attempts"]
                        else status["reason"]
                    )
                )
    finally:
        processor.close()
    return results


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
    palettes = json.loads(
        (ROOT / "scripts/data/kit-colors.json").read_text(encoding="utf-8")
    )
    for folder in ("wardrobe", "studio-wardrobe"):
        for file in sorted((ROOT / "frontend/public/assets" / folder).glob("*.webp")):
            name = ("studio-" if folder == "studio-wardrobe" else "") + file.stem
            geometry = {}
            with Image.open(file) as image:
                if folder == "studio-wardrobe":
                    center = image.width // 2
                    front = int(
                        np.flatnonzero(np.asarray(image)[:, center, 3] > 120)[0]
                    )
                    rig = dict(
                        span=image.width, collar=[center, front], seat=[120, 157]
                    )
                    geometry["garment"] = dict(rig=rig, outline=kit_guide(image, rig))
                credit = (
                    art + "/frontend/public/assets/" + folder,
                    "Autosport Sim / OpenAI ImageGen",
                    "MIT (project artwork)",
                    "Фотографическая ткань, цветовые панели и отделка.",
                    "webp",
                )
                add("uniform", name, file.read_bytes(), *credit, **geometry)
                for org, colors in palettes.items():
                    roles = (
                        {"manufacturer"}
                        if WORLD["organizations"][org]["kind"] == "supplier"
                        else {"staff", "driver"}
                    )
                    if file.stem in roles:
                        add(
                            "uniform",
                            name + "-" + org,
                            colorway(image, colors, file.stem),
                            *credit,
                            **geometry,
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
    logo_files = {
        "dtm": "DTM logo.svg",
        "f2": "FIA Formula 2 Championship logo.svg",
        "f3": "FIA Formula 3 Championship logo.svg",
        "team-toyota-gazoo-racing": "Toyota Gazoo Racing logo.svg",
        "supplier-mecachrome": "Nouveau logo Mecachrome.png",
    }
    for oid, org in organizations.items():
        if oid in existing_logos:
            continue
        try:
            for candidate in sources.organization_logos(
                logo_names.get(oid, org["name"]), logo_files.get(oid)
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
    attempts = collect_portraits(add, gaps)
    try:
        add(
            "car",
            "car-f1-4",
            *commons_car("2025 Japan GP - McLaren - Lando Norris - FP1 (cropped).jpg"),
        )
    except (OSError, ValueError, KeyError, IndexError) as exc:
        gaps.append(f"car/car-f1-4: {exc}")
    present = {(a["kind"], a["entity"]) for a in assets}
    missing = 0
    for kind, entities in [
        ("head", WORLD["names"]),
        ("logo", {**WORLD["championships"], **WORLD["organizations"]}),
        ("car", WORLD["cars"]),
    ]:
        missing += sum((kind, eid) not in present for eid in entities)
        gaps.extend(
            f"{kind}/{eid}: нет подготовленного разрешённого изображения"
            for eid in sorted(entities)
            if kind != "head" and (kind, eid) not in present
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
        report = coverage(assets, attempts, gaps, staged.stat().st_size)
        report_path = output.with_name(output.stem + "-report.json")
        temp_report = Path(tmp) / "report.json"
        temp_report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        staged.replace(output)
        temp_report.replace(report_path)
    print(
        "Покрытие по чемпионатам: "
        + json.dumps(report["championships"], ensure_ascii=False)
    )
    print("Отчёт:", report_path)
    print(
        f"{output} · подготовлено: {len(assets)} · отсутствует: {missing} (manifest.json)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
