"""Measure a rigid collar anchor and foreground hair on the existing head layer."""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .portrait_processing import PortraitProcessor

ROOT = Path(__file__).resolve().parents[1] / "backend" / "art"


def skin_sample(rgba, chin, eyes):
    h, w = rgba.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    dx = np.abs(xx * 240 / w - chin[0])
    dy = yy * 280 / h - chin[1]
    cheek = ((dx - 0.55 * eyes) / (0.18 * eyes)) ** 2 + (
        (dy + 1.10 * eyes) / (0.23 * eyes)
    ) ** 2 < 1
    samples = rgba[cheek & (rgba[:, :, 3] > 225), :3]
    if len(samples) < 6:
        return "#ab8170"
    light = samples @ np.array([0.2126, 0.7152, 0.0722])
    middle = samples[
        (light >= np.percentile(light, 35)) & (light <= np.percentile(light, 80))
    ]
    return "#" + "".join(f"{n:02x}" for n in np.median(middle, axis=0).astype(int))


def registration(processor, path):
    rgba = np.asarray(Image.open(path).convert("RGBA"))
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3:4].astype(float) / 255
    rgb = (rgba[:, :, :3] * alpha + (1 - alpha) * 120).astype("uint8")
    source = processor.image(rgb)
    faces = processor.faces.detect(source).face_landmarks
    if not faces:
        raise ValueError(f"Не распознано лицо {path}")
    face = np.array([(lm.x * 240, lm.y * 280) for lm in faces[0]])
    chin = face[152]
    eyes = np.linalg.norm(face[[33, 133]].mean(0) - face[[362, 263]].mean(0))
    metrics = {"anchor": [round(float(n), 2) for n in (*chin, eyes)]}
    metrics["skin"] = skin_sample(rgba, chin, eyes)
    masks = processor.skin.segment(source).confidence_masks
    hair = masks[1].numpy_view().copy()
    # Only strands reaching below the collar need redrawing above the garment.
    hair[: max(0, int((chin[1] - 0.18 * eyes) * h / 280))] = 0
    hair[rgba[:, :, 3] < 10] = 0
    contours, _ = cv2.findContours(
        (hair > 0.54).astype("uint8"), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    paths = []
    for contour in contours:
        if cv2.contourArea(contour) < 26:
            continue
        points = cv2.approxPolyDP(contour, 1.4, True).reshape(-1, 2)
        if len(points) >= 3:
            paths.append(
                "M"
                + " ".join(f"{x * 240 / w:.1f},{y * 280 / h:.1f}" for x, y in points)
                + "Z"
            )
    if paths:
        metrics["hair"] = "".join(paths)
    return metrics


def main():
    processor = PortraitProcessor()
    result = {}
    missing = []
    for catalog in [ROOT / "catalog.json", ROOT / "junior/catalog.json"]:
        for asset in json.loads(catalog.read_text()):
            if asset["kind"] != "generated-head":
                continue
            try:
                result[asset["entity"]] = registration(processor, ROOT / asset["path"])
            except ValueError:
                missing.append(asset["entity"])
                result[asset["entity"]] = {"unavailable": True}
    processor.close()
    (ROOT / "wardrobe/registration.json").write_text(
        json.dumps(result, separators=(",", ":")) + "\n"
    )
    print(len(result), "registered,", len(missing), "unrecognised", missing)


if __name__ == "__main__":
    main()
