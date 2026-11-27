"""Register studio faces and bake continuous-opacity skin and hair mattes.

Run with python -m scripts.wardrobe_registration after importing new artwork.
The atlas is measured from each original photograph. No artist-authored
coordinates, skin colours or overrides are stored against an individual.
"""

from concurrent.futures import ProcessPoolExecutor
from multiprocessing.util import Finalize
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .portrait_processing import PortraitProcessor

ROOT = Path(__file__).resolve().parents[1] / "backend" / "art"
ATLAS = ROOT / "wardrobe" / "mattes"
W, H = 240, 280
COLUMNS, ROWS = 4, 4
JAW = [
    234,
    93,
    132,
    58,
    172,
    136,
    150,
    149,
    176,
    148,
    152,
    377,
    400,
    378,
    379,
    365,
    397,
    288,
    361,
    323,
    454,
]


def smooth(value):
    t = np.clip(value, 0, 1)
    return t * t * (3 - 2 * t)


def registration(processor, path):
    photo = Image.open(path).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
    rgba = np.asarray(photo)
    alpha = rgba[:, :, 3].astype(float) / 255
    rgb = (rgba[:, :, :3] * alpha[:, :, None] + 119 * (1 - alpha[:, :, None])).astype(
        "uint8"
    )
    source = processor.image(rgb)
    faces = processor.faces.detect(source).face_landmarks
    if len(faces) != 1:
        raise ValueError(f"Не распознано одно лицо в {path}")
    face = np.array([(p.x * W, p.y * H) for p in faces[0]])
    cx, chin = face[152]
    eye = np.linalg.norm(face[[33, 133]].mean(0) - face[[362, 263]].mean(0))
    yy, xx = np.mgrid[:H, :W]
    masks = processor.skin.segment(source).confidence_masks
    background, hair, body, skin, shirt, accessory = [
        m.numpy_view().copy().squeeze() for m in masks
    ]
    # A real jaw and an independently measured throat meet under the mandible.
    # This preserves the two jaw angles, ear lobes and asymmetry of the source.
    jaw = face[JAW]
    jaw = jaw[np.argsort(jaw[:, 0])]
    floor = np.interp(np.arange(W), jaw[:, 0], jaw[:, 1])
    jaw_weight = smooth((floor + eye * 0.15 - yy) / (eye * 0.12))
    flesh = skin + body
    column = np.abs(xx - cx) < eye * 1.22
    band = (yy > chin + eye * 0.18) & (yy < chin + eye * 0.46)
    throat = band & column & (flesh > 0.53) & (alpha > 0.65)
    widths = throat.sum(axis=1)
    valid = widths[widths > 0.85 * eye]
    diameter = float(
        np.clip(np.median(valid) / eye if valid.size else 1.54, 1.36, 1.84)
    )
    down = (yy - chin) / eye
    # Sternocleidomastoid widens toward the clavicle; the garment covers its base.
    radius = eye * (diameter * 0.5 + 0.12 * smooth((down - 0.14) / 0.68))
    throat_weight = smooth((radius - np.abs(xx - cx)) / (eye * 0.085) + 0.5)
    skin_matte = smooth((flesh - 0.10) / 0.67) * np.maximum(jaw_weight, throat_weight)
    # Preserve the photographed alpha around the face and crown. Only clothing
    # and still-green chroma-key spill below the face must be suppressed.
    opaque_face = smooth((floor - yy) / (eye * 0.28)) * smooth(
        (1.02 - np.abs(xx - cx) / eye) / 0.15
    )
    hair_matte = smooth((hair - 0.09) / 0.67)
    green = rgb[:, :, 1].astype(float) - np.maximum(rgb[:, :, 0], rgb[:, :, 2]).astype(
        float
    )
    despill = 1 - smooth((green - 7) / 26)
    strands = hair_matte * despill
    # The junior photos sometimes end at a straight crop across flowing hair.
    # Fade only those cropped ends, according to local strand texture.
    dense = alpha > 0.52
    bottom = H - 1 - np.argmax(dense[::-1], axis=0)
    flat = np.abs(bottom - np.roll(bottom, 3)) < 2
    flatness = cv2.blur(flat.astype("float32")[None], (13, 1))[0]
    luminance = rgb @ [0.2126, 0.7152, 0.0722]
    local = luminance - cv2.GaussianBlur(luminance, (0, 0), 2)
    taper = smooth(
        (bottom - yy + 1 + np.clip(local / 15, -1, 1) * eye * 0.075) / (0.22 * eye)
    )
    cropped = smooth((flatness - 0.48) / 0.4) * smooth((down + 0.9) / 0.38)
    strands *= 1 - cropped * (1 - taper)
    head = np.maximum.reduce([skin_matte, opaque_face, strands]) * despill
    # Only reproject hair near and below the jaw above the front of the collar.
    fringe = strands * smooth((down + 0.58) / 0.35)
    support = cv2.dilate(np.uint8(alpha > 0.005), np.ones((3, 3), np.uint8))
    planes = [np.uint8(np.clip(p, 0, 1) * support * 255) for p in (head, fringe)]
    matte = Image.fromarray(np.hstack(planes))

    # Relative cheek illumination is independent of complexion.
    def cheek(i):
        x, y = np.rint(face[i]).astype(int)
        r = max(2, round(eye * 0.11))
        return np.median(
            luminance[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1]
        )

    left, right = cheek(50), cheek(280)
    lighting = float(np.clip((left - right) / max(20, left + right) * 3, -1, 1))
    return {
        "anchor": [round(float(v), 2) for v in (cx, chin, eye)],
        "neck": round(diameter, 3),
        "breadth": round(float(np.linalg.norm(face[234] - face[454]) / eye), 3),
        "keyLight": round(lighting, 3),
        "fringe": bool(np.sum(fringe * alpha > 0.5) > eye * eye * 0.025),
    }, matte


def initialize_worker():
    global processor
    cv2.setNumThreads(1)
    processor = PortraitProcessor()
    Finalize(None, processor.close, exitpriority=10)


def prepare_sheet(item):
    index, batch = item
    name = f"studio-matte-{index:03}"
    sheet = Image.new("L", (2 * W * COLUMNS, H * ROWS))
    records = {}
    for slot, asset in enumerate(batch):
        metrics, mask = registration(processor, ROOT / asset["path"])
        sheet.paste(mask, (slot % COLUMNS * 2 * W, slot // COLUMNS * H))
        metrics["matte"] = [name, slot]
        records[asset["entity"]] = metrics
    file = ATLAS / (name + ".webp")
    sheet.save(file, quality=92, method=4)
    return records, dict(
        kind="portrait-matte",
        entity=name,
        path=str(file.relative_to(ROOT)),
        sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
    )


def main():
    ATLAS.mkdir(exist_ok=True)
    records = [
        a
        for f in (ROOT / "catalog.json", ROOT / "junior/catalog.json")
        for a in json.loads(f.read_text())
        if a["kind"] == "generated-head"
    ]
    size = COLUMNS * ROWS
    batches = [(i // size, records[i : i + size]) for i in range(0, len(records), size)]
    result, assets = {}, []
    with ProcessPoolExecutor(max_workers=3, initializer=initialize_worker) as pool:
        for data, sheet in pool.map(prepare_sheet, batches):
            result.update(data)
            assets.append(sheet)
            if len(assets) % 20 == 0:
                print(len(result), "/", len(records), flush=True)
    (ATLAS / "catalog.json").write_text(
        json.dumps(assets, separators=(",", ":")) + "\n"
    )
    (ROOT / "wardrobe/registration.json").write_text(
        json.dumps(result, separators=(",", ":")) + "\n"
    )
    print(len(result), "registered")


if __name__ == "__main__":
    main()
