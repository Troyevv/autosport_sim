"""Prepare fixed photographic garments, panel masks and collar registration.

The RGB masks are local coordinates on the garment. Their channels encode
base cloth, inserts, and piping. The original silhouette is shared by every
colourway, personnel assignment and preview.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = Path(__file__).with_name("data") / "wardrobe"
OUTPUT = SOURCE.parents[2] / "backend/art/wardrobe"
# Collar opening and front rim, measured on each original photograph in pixels.
COLLARS = {
    "driver": (263, 389, 64),
    "mechanic": (273, 384, 55),
    "engineering": (248, 377, 80),
    "executive": (235, 344, 62),
    "advisor": (236, 368, 48),
    "neutral": (224, 372, 48),
}


def prepare(path):
    photo = Image.open(path).convert("RGBA")
    values = np.asarray(photo).astype(float)
    h, w = values.shape[:2]
    rgb, alpha = values[:, :, :3], values[:, :, 3]
    hue, sat, _ = np.moveaxis(
        np.asarray(photo.convert("RGB").convert("HSV")) / 255.0, 2, 0
    )
    # Read the artist's sewn-in blue panels and magenta piping, including the
    # antialiased boundary. Keep neutral snaps and hardware undyed.
    accent = np.clip((hue - 0.73) / 0.10, 0, 1)
    insert = np.clip((hue - 0.50) / 0.09, 0, 1) * (1 - accent)
    weights = np.stack([1 - insert - accent, insert, accent], axis=-1)
    weights *= np.clip((sat[..., None] - 0.11) / 0.15, 0, 1)
    weights[alpha < 4] = 0
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    tone = np.maximum(lum, 1)
    for i in range(3):
        sample = (weights[..., i] > 0.75) & (alpha > 220)
        if sample.any():
            # Equalise the pigments on the source panels without flattening folds.
            factor = 173 / max(15, np.percentile(lum[sample], 74))
            tone = tone + weights[..., i] * lum * (factor - 1)
    if path.stem == "neutral":
        tone = lum
        weights[:] = 0
    shade = np.clip(tone, 0, 255).astype("uint8")
    textile = Image.fromarray(np.dstack([shade, shade, shade, alpha.astype("uint8")]))
    entity = "paddock-" + path.stem
    texture_file = OUTPUT / (entity + ".webp")
    textile.save(texture_file, quality=96, method=5)
    # The two optional cut-panel layouts are authored once on this master,
    # including sleeve panels. They never affect the outline or collar.
    variants = []
    for design in ("panels", "chevron", "shoulders"):
        variant = weights.copy()
        if design != "panels":
            stencil = Image.new("L", (w, h))
            draw = ImageDraw.Draw(stencil)
            if design == "chevron":
                points = [
                    (0, 0.19),
                    (0.5, 0.37),
                    (1, 0.19),
                    (1, 0.24),
                    (0.5, 0.42),
                    (0, 0.24),
                ]
            else:
                points = [
                    (0, 0),
                    (1, 0),
                    (1, 0.26),
                    (0.76, 0.20),
                    (0.63, 0.14),
                    (0.37, 0.14),
                    (0.24, 0.20),
                    (0, 0.26),
                ]
            draw.polygon([(round(x * w), round(y * h)) for x, y in points], fill=255)
            coverage = np.asarray(stencil.filter(ImageFilter.GaussianBlur(0.65))) / 255
            switch = coverage * weights[..., 0]
            variant[..., 0] -= switch
            variant[..., 1] += switch
        variants.append(np.clip(variant * 255, 0, 255).astype("uint8"))
    mask_file = OUTPUT / (entity + "-zones.png")
    Image.fromarray(np.concatenate(variants, axis=1)).save(mask_file, optimize=True)
    left, right, front = COLLARS[path.stem]

    def asset(kind, file):
        return dict(
            kind=kind,
            entity=entity,
            path="wardrobe/" + file.name,
            sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
            source="https://github.com/Troyevv/autosport_sim",
            author="Autosport Sim / OpenAI ImageGen",
            license="MIT",
            changes="Студийная фотографическая заготовка, выделенные зоны красителя и измеренный воротник.",
        )

    cloth = asset("uniform", texture_file)
    cloth["template"] = dict(width=w, height=h, collar=[left, right, front])
    return [cloth, asset("uniform-mask", mask_file)]


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    assets = [item for path in sorted(SOURCE.glob("*.webp")) for item in prepare(path)]
    arms = OUTPUT / "paddock-forearms.webp"
    assets.append(
        dict(
            kind="skin-detail",
            entity="paddock-forearms",
            path="wardrobe/" + arms.name,
            sha256=hashlib.sha256(arms.read_bytes()).hexdigest(),
            source="https://github.com/Troyevv/autosport_sim",
            author="Autosport Sim / OpenAI ImageGen",
            license="MIT",
            changes="Фотографический слой предплечий, зарегистрированный по краю рукавов поло.",
        )
    )
    (OUTPUT / "catalog.json").write_text(
        json.dumps(assets, ensure_ascii=False, indent=2) + "\n"
    )
