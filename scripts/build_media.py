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
import numpy as np
import resvg_py
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from backend.catalog import WORLD
from backend.media import validate

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "https://github.com/Troyevv/autosport_sim/blob/1e0eeec/reference/ui-v1/docs/ASSETS.md"
ICONS = "https://registry.npmjs.org/simple-icons/-/simple-icons-13.21.0.tgz"
ICON_HASH = "33e4e8c92f51bac4c4e88c3b2d98ad2b4faa91a00cbfdf24c894e8691a2e63ea"
PHOTOS = {
    (
        "head",
        "person-lando-norris",
    ): "Lando Norris Formula 1 Driver (49379469418) (cropped).jpg",
    ("head", "person-andrea-stella"): "Andrea Stella 2024 (cropped).jpg",
    ("car", "car-f1-4"): "2025 Japan GP - McLaren - Lando Norris - FP1 (cropped).jpg",
}
# Outlines in 200px reference coordinates, clockwise from crown; last section includes neck.
OUTLINES = {
    "keller": [
        (96, 7),
        (116, 8),
        (131, 19),
        (137, 35),
        (135, 58),
        (140, 64),
        (138, 82),
        (133, 87),
        (130, 104),
        (127, 116),
        (129, 130),
        (109, 143),
        (91, 143),
        (72, 130),
        (73, 111),
        (68, 96),
        (66, 85),
        (61, 76),
        (61, 61),
        (65, 58),
        (59, 42),
        (59, 23),
        (74, 13),
    ],
    "weber": [
        (91, 5),
        (110, 2),
        (128, 10),
        (139, 24),
        (137, 43),
        (134, 60),
        (136, 65),
        (132, 81),
        (128, 84),
        (126, 103),
        (128, 122),
        (116, 133),
        (96, 137),
        (75, 129),
        (73, 116),
        (72, 101),
        (68, 87),
        (63, 80),
        (61, 63),
        (60, 55),
        (54, 48),
        (54, 31),
        (65, 16),
    ],
    "morozova": [
        (96, 4),
        (114, 5),
        (132, 20),
        (143, 43),
        (145, 76),
        (146, 96),
        (139, 110),
        (127, 116),
        (129, 135),
        (115, 146),
        (98, 148),
        (77, 132),
        (80, 116),
        (61, 116),
        (51, 107),
        (48, 94),
        (51, 66),
        (56, 39),
        (72, 15),
    ],
    "ricci": [
        (94, 5),
        (113, 7),
        (132, 18),
        (138, 34),
        (137, 56),
        (139, 63),
        (136, 82),
        (131, 87),
        (128, 104),
        (128, 123),
        (119, 138),
        (101, 148),
        (79, 132),
        (77, 117),
        (77, 104),
        (71, 88),
        (66, 83),
        (62, 68),
        (63, 58),
        (58, 48),
        (58, 27),
        (71, 14),
    ],
}


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


def synthetic_head(name):
    im = Image.open(ROOT / "frontend/public/assets" / (name + ".webp")).convert("RGBA")
    mask = Image.new("L", im.size)
    ImageDraw.Draw(mask).polygon(
        [
            (round(x * im.width / 200), round(y * im.height / 200))
            for x, y in OUTLINES[name]
        ],
        fill=255,
    )
    im.putalpha(mask.filter(ImageFilter.GaussianBlur(1)))
    layer = im.crop(mask.getbbox())
    layer = layer.resize(
        (round(layer.width * 181 / layer.height), 181), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGBA", (256, 320))
    canvas.alpha_composite(layer, ((256 - layer.width) // 2, 18))
    return png(canvas)


def uniform(driver):
    # Reuse the photographed folds from the project's generated clothing. Blank chest badges
    # with adjacent cloth texture; the importing team's badge is an independent layer.
    name = "keller" if driver else "ricci"
    im = (
        Image.open(ROOT / "frontend/public/assets" / (name + ".webp"))
        .convert("RGB")
        .resize((400, 400))
    )
    im = ImageOps.grayscale(im)
    im.paste(im.crop((211, 350, 279, 378)), (248, 351))
    shape = (
        [
            (0, 339),
            (87, 296),
            (136, 268),
            (142, 239),
            (164, 271),
            (202, 286),
            (245, 268),
            (258, 241),
            (269, 265),
            (320, 281),
            (399, 328),
            (399, 399),
            (0, 399),
        ]
        if driver
        else [
            (0, 344),
            (74, 291),
            (134, 266),
            (147, 228),
            (158, 263),
            (203, 295),
            (245, 264),
            (260, 227),
            (278, 261),
            (332, 288),
            (399, 313),
            (399, 399),
            (0, 399),
        ]
    )
    mask = Image.new("L", im.size)
    ImageDraw.Draw(mask).polygon(shape, fill=255)
    cloth = ImageOps.colorize(im, black="#252832", white="#c9cbd0").convert("RGBA")
    cloth.putalpha(mask.filter(ImageFilter.GaussianBlur(1)))
    cloth = cloth.crop((0, 225, 400, 400)).resize((256, 138), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 320))
    canvas.alpha_composite(cloth, (0, 182))
    return png(canvas)


def cut_head(im):
    """Fit one frontal subject, remove background with a seeded foreground mask."""
    im = im.convert("RGB")
    im.thumbnail((850, 850))
    rgb = np.array(im)
    classifier = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = classifier.detectMultiScale(
        cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), 1.08, 5, minSize=(35, 35)
    )
    if len(faces) != 1:
        raise ValueError("Для этой фотографии нужна ручная проверка вырезки")
    x, y, w, h = map(int, faces[0])
    mask = np.zeros(rgb.shape[:2], np.uint8)
    center = (x + w // 2, y + h // 2)
    cv2.ellipse(
        mask, center, (int(0.69 * w), int(0.90 * h)), 0, 0, 360, cv2.GC_PR_FGD, -1
    )
    cv2.ellipse(mask, center, (int(0.36 * w), int(0.42 * h)), 0, 0, 360, cv2.GC_FGD, -1)
    cv2.setRNGSeed(1)
    cv2.grabCut(
        rgb,
        mask,
        None,
        np.zeros((1, 65), np.float64),
        np.zeros((1, 65), np.float64),
        5,
        cv2.GC_INIT_WITH_MASK,
    )
    alpha = Image.fromarray(np.where((mask == 1) | (mask == 3), 255, 0).astype("uint8"))
    im = im.convert("RGBA")
    im.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.6)))
    layer = im.crop(alpha.getbbox())
    layer.thumbnail((132, 183))
    canvas = Image.new("RGBA", (256, 320))
    canvas.alpha_composite(layer, ((256 - layer.width) // 2, 197 - layer.height))
    return png(canvas)


def commons_photo(kind, title):
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
    if kind == "head":
        data = cut_head(im)
    else:
        im.thumbnail((1200, 900))
        data = png(im)
    return (
        data,
        info["descriptionurl"],
        author,
        license_name + " " + meta.get("LicenseUrl", {}).get("value", ""),
        "Уменьшение, PNG; для портрета — маска головы.",
    )


def build(output):
    assets, files, gaps = [], {}, []

    def add(kind, entity, data, source, author, license, changes):
        path = f"images/{kind}-{entity}.png"
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
            )
        )
        files[path] = data

    for name in OUTLINES:
        add(
            "generated-head",
            "generated-" + name,
            synthetic_head(name),
            PROJECT,
            "Autosport Sim / ImageGen",
            "MIT (project artwork)",
            "Вырезка и привязка синтетической головы.",
        )
    for kind in ("driver", "staff"):
        add(
            "uniform",
            kind,
            uniform(kind == "driver"),
            PROJECT,
            "Autosport Sim / ImageGen",
            "MIT (project artwork)",
            "Маска формы, нейтральная текстура и освещение.",
        )
    try:
        raw = get(ICONS)
        if hashlib.sha256(raw).hexdigest() != ICON_HASH:
            raise ValueError("Неизвестная версия Simple Icons")
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
            for name, entities in {
                "f1": ["f1"],
                "mclaren": ["team-mclaren-formula-1-team"],
                "mercedes": ["supplier-mercedes"],
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
    for (kind, entity), title in PHOTOS.items():
        try:
            add(kind, entity, *commons_photo(kind, title))
        except (OSError, ValueError, KeyError, IndexError, cv2.error) as exc:
            gaps.append(
                f"{kind}/{entity}: https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(title)} — {exc}"
            )
    present = {(a["kind"], a["entity"]) for a in assets}
    for kind, entities in [
        ("head", WORLD["names"]),
        ("logo", {**WORLD["championships"], **WORLD["organizations"]}),
        ("car", WORLD["cars"]),
    ]:
        gaps.extend(
            f"{kind}/{eid}: нет подготовленного разрешённого изображения"
            for eid in sorted(entities)
            if (kind, eid) not in present
        )
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
        f"{output} · изображений: {len(assets)} · пробелы: {len(gaps)} (manifest.json)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
