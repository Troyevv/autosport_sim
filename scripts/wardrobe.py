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
# Front lip of each photographed collar, traced from left seam to right seam
# at regular horizontal intervals. Distances are fractions of the measured depth.
# The last value seats the lip below the chin, in interocular distances.
NECKLINES = {
    "driver": ([0.22, 0.61, 0.80, 0.91, 0.97, 1, 0.97, 0.91, 0.80, 0.61, 0.22], 0.60),
    "mechanic": (
        [0.23, 0.58, 0.74, 0.84, 0.91, 1.12, 0.91, 0.84, 0.74, 0.58, 0.23],
        0.68,
    ),
    "engineering": (
        [0.15, 0.49, 0.67, 0.81, 0.91, 1, 0.91, 0.81, 0.67, 0.49, 0.15],
        0.94,
    ),
    "executive": (
        [0.18, 0.46, 0.62, 0.77, 0.9, 1.03, 0.90, 0.77, 0.62, 0.46, 0.18],
        0.90,
    ),
    "advisor": ([0.23, 0.60, 0.81, 0.92, 0.97, 1, 0.97, 0.92, 0.81, 0.60, 0.23], 0.62),
    "neutral": ([0.10, 0.56, 0.77, 0.91, 0.97, 1, 0.97, 0.91, 0.77, 0.56, 0.10], 1.00),
}


def front_lip(luminance, left, right, depth, guide):
    """Trace the actual seam where the dark inner collar meets the front cloth."""
    smooth_luma = np.asarray(
        Image.fromarray(np.uint8(luminance)).filter(ImageFilter.GaussianBlur(1.3)),
        dtype=float,
    )
    slope = np.gradient(smooth_luma, axis=0)
    columns = np.arange(left, right + 1)
    expected = np.interp(
        columns, np.linspace(left, right, len(guide)), np.array(guide) * depth
    )
    measured = []
    for x, y in zip(columns, expected):
        rows = np.arange(max(0, int(y - 0.13 * depth)), int(y + 0.23 * depth + 4))
        strongest = np.argmax(slope[rows, x] - 0.03 * np.abs(rows - y))
        measured.append(rows[strongest] + 1.3)
    padded = np.pad(measured, 2, mode="edge")
    seam = np.median(np.lib.stride_tricks.sliding_window_view(padded, 5), axis=1)
    samples = np.interp(np.linspace(left, right, 33), columns, seam)
    return np.round(samples / depth, 4).tolist()


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
    lip, drop = NECKLINES[path.stem]
    # Chest breadth at the level of the armholes, measured on the fixed master.
    cols = np.flatnonzero(alpha[round(0.28 * h)] > 127)
    cloth["template"] = dict(
        width=w,
        height=h,
        collar=[left, right, front],
        lip=front_lip(lum, left, right, front, lip),
        drop=drop,
        chest=int(cols[-1] - cols[0]),
    )
    return [cloth, asset("uniform-mask", mask_file)]


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    assets = [item for path in sorted(SOURCE.glob("*.webp")) for item in prepare(path)]
    (OUTPUT / "catalog.json").write_text(
        json.dumps(assets, ensure_ascii=False, indent=2) + "\n"
    )
