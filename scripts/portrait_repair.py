"""Restore missing lower edges of cropped studio assets, before collar registration.

Only pixels around and below a detected transverse crop are completed. The
face, hair, pose and upper jaw in the source remain registered in their own
coordinate system. Fabric is never included in the tissue sample.
"""

import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .portrait_processing import PortraitProcessor

ART = Path(__file__).resolve().parents[1] / "backend/art"
FEATURES = [33, 263, 1, 50, 280, 98, 327, 61, 291, 17, 234, 454]
W, H = 480, 560


def measure(processor, asset):
    rgba = np.asarray(Image.open(ART / asset["path"]).convert("RGBA"))
    a = rgba[:, :, 3:4] / 255
    small = cv2.resize(np.uint8(rgba[:, :, :3] * a + 119 * (1 - a)), (240, 280))
    source = processor.image(small)
    faces = processor.faces.detect(source).face_landmarks
    if len(faces) != 1:
        raise ValueError(asset["entity"])
    lm = np.array([(p.x * W, p.y * H) for p in faces[0]])
    eye = np.linalg.norm(lm[[33, 133]].mean(0) - lm[[362, 263]].mean(0))
    cx, chin = lm[152]
    central = rgba[:, round(cx - 0.23 * eye) : round(cx + 0.23 * eye), 3].mean(1)
    bottom = np.where(central > 100)[0][-1]
    # A crop severs skin in a straight line. An intact neckline has a curved
    # contour and photographed skin or clothing below the visible jaw.
    coords = lm[FEATURES]
    shape = (coords - coords[2]) / eye
    color = []
    for k in (50, 280, 98, 327, 1, 164):
        x, y = np.rint(lm[k]).astype(int)
        size = max(2, round(0.08 * eye))
        color.extend(
            np.median(
                rgba[y - size : y + size + 1, x - size : x + size + 1, :3], axis=(0, 1)
            )
        )
    return dict(
        asset=asset,
        landmarks=lm,
        eye=eye,
        depth=(bottom - chin) / eye,
        bottom=bottom,
        descriptor=np.r_[shape.flatten() * 74, np.array(color) * 0.47],
    )


def tissue(processor, record):
    rgba = np.asarray(Image.open(ART / record["asset"]["path"]).convert("RGBA"))
    alpha = rgba[:, :, 3] / 255
    small = cv2.resize(
        np.uint8(rgba[:, :, :3] * alpha[:, :, None] + 119 * (1 - alpha[:, :, None])),
        (240, 280),
    )
    masks = processor.skin.segment(processor.image(small)).confidence_masks
    prob = (masks[2].numpy_view() + masks[3].numpy_view()).copy().squeeze()
    flesh = np.clip((cv2.resize(prob, (W, H)) - 0.15) / 0.68, 0, 1) * alpha
    cx, chin = record["landmarks"][152]
    eye = record["eye"]
    # Discard fabric, sideburns and loose hair from the donor. Only neck and
    # the portion of its jaw that is actually missing in the target can enter.
    yy, xx = np.mgrid[:H, :W]
    half = 0.83 + 0.25 * np.clip((yy - chin) / eye, 0, 1.5)
    jaw = np.clip(1.14 - (yy - chin) / eye * 0.55, 0.83, 1.28)
    flesh *= np.clip((np.maximum(half, jaw) - np.abs(xx - cx) / eye) * 14, 0, 1)
    return np.dstack([rgba[:, :, :3] * flesh[:, :, None], flesh]).astype("float32")


def restore(person, donor, sample):
    target = np.asarray(Image.open(ART / person["asset"]["path"]).convert("RGBA"))
    landmarks = [33, 263, 1, 98, 327, 61, 291, 17, 234, 454]
    transform, _ = cv2.estimateAffinePartial2D(
        donor["landmarks"][landmarks], person["landmarks"][landmarks], method=cv2.LMEDS
    )
    patch = cv2.warpAffine(sample, transform, (W, H))
    da = patch[:, :, 3]
    pixels = patch[:, :, :3] / np.maximum(da[:, :, None], 0.001)
    alpha = target[:, :, 3] / 255
    eye = person["eye"]
    cx = person["landmarks"][152, 0]
    yy, xx = np.mgrid[:H, :W]
    edge = person["bottom"]
    overlap = (
        (da > 0.85)
        & (alpha > 0.9)
        & (yy > edge - eye * 0.5)
        & (yy < edge - eye * 0.04)
        & (np.abs(xx - cx) < eye * 0.75)
    )
    if overlap.sum() < 40:
        raise ValueError("Missing photographic overlap: " + person["asset"]["entity"])

    # Match local skin colour and the source's key light on both cheeks. The
    # small cross-fade is confined to the severed edge, outside the intact face.
    def difference(weights):
        return np.median(
            target[:, :, :3][weights].astype(float) - pixels[weights], axis=0
        )

    left, right = overlap & (xx < cx), overlap & (xx >= cx)
    dl = difference(left if left.sum() > 20 else overlap)
    dr = difference(right if right.sum() > 20 else overlap)
    mix = np.clip((xx - cx) / eye + 0.5, 0, 1)[:, :, None]
    pixels = np.clip(pixels + dl * (1 - mix) + dr * mix, 0, 255)
    da *= np.clip((yy - edge + eye * 0.13) / (eye * 0.10), 0, 1)
    fade = np.clip((edge - yy) / (eye * 0.085), 0, 1)
    # Retain the original silhouette, including hair outside the new skin.
    a = alpha * (1 - da * (1 - fade))
    combined = a + da * (1 - a)
    rgb = (
        target[:, :, :3] * a[:, :, None] + pixels * (da * (1 - a))[:, :, None]
    ) / np.maximum(combined[:, :, None], 0.001)
    dst = ART / person["asset"]["path"]
    Image.fromarray(np.uint8(np.clip(np.dstack([rgb, combined * 255]), 0, 255))).save(
        dst, quality=94, method=4
    )
    person["asset"]["sha256"] = hashlib.sha256(dst.read_bytes()).hexdigest()


def main():
    catalog = ART / "junior/catalog.json"
    juniors = json.loads(catalog.read_text())
    regular = [
        a
        for a in json.loads((ART / "catalog.json").read_text())
        if a["kind"] == "generated-head"
    ]
    additions = [a for a in juniors if a["kind"] == "generated-head"]
    p = PortraitProcessor()
    try:
        measured = [measure(p, a) for a in additions]
        damaged = [r for r in measured if r["depth"] < 0.76]
        donors = [measure(p, a) for a in regular[::3]]
        donors = [d for d in donors if d["depth"] > 1.18]
        cache = {}
        print("Completing", len(damaged), "cropped source assets", flush=True)
        for i, r in enumerate(damaged):
            d = min(
                donors, key=lambda d: np.linalg.norm(d["descriptor"] - r["descriptor"])
            )
            k = d["asset"]["entity"]
            if k not in cache:
                cache[k] = tissue(p, d)
            restore(r, d, cache[k])
            if i % 64 == 0:
                print(i, flush=True)
    finally:
        p.close()
    catalog.write_text(
        json.dumps(juniors, ensure_ascii=False, separators=(",", ":")) + "\n"
    )


if __name__ == "__main__":
    main()
