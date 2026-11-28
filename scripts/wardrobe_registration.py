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


def hanging_hair(rgb, alpha, hair, flesh, shirt, cx, chin, eye, yy, xx):
    """Trace photographed locks below the ears where the semantic mask loses detail."""
    sides = abs(xx - cx) / eye
    below = (yy - chin) / eye
    # Colour alone cannot distinguish black fabric from black hair. Where the
    # original plate contains a shirt, rely on its semantic hair trimap.
    if ((shirt > 0.55) & (alpha > 0.8) & (below > 0)).sum() > eye * eye * 0.2:
        return np.zeros_like(hair)
    seed = (alpha > 0.8) & (hair > 0.82) & (sides > 0.67) & (below > -3.3)
    if seed.sum() < eye * eye * 0.045:
        return np.zeros_like(hair)
    region = (alpha > 0.02) & (sides > 0.62) & (below > -3.4)
    labels = np.full(hair.shape, cv2.GC_BGD, np.uint8)
    labels[region] = cv2.GC_PR_BGD
    labels[region & (hair > 0.33)] = cv2.GC_PR_FGD
    exposed = (alpha > 0.58) & (sides > 1.13) & (below < 0.85)
    exposed &= (flesh < 0.15) & (shirt < 0.18)
    labels[exposed & region] = cv2.GC_FGD
    labels[seed] = cv2.GC_FGD
    labels[(flesh > 0.92) | (shirt > 0.35)] = cv2.GC_BGD
    if not (labels == cv2.GC_FGD).any():
        return np.zeros_like(hair)
    # The semantic classifier uses the entire portrait. A second pass using
    # the actual colours on this head follows dark braids and fair wisps alike.
    cv2.setRNGSeed(1)
    models = [np.zeros((1, 65), np.float64) for _ in range(2)]
    cv2.grabCut(rgb, labels, None, *models, 2, cv2.GC_INIT_WITH_MASK)
    locks = np.uint8(labels % 2)
    _, groups = cv2.connectedComponents(locks)
    support = seed | (exposed & (below < -0.33) & (below > -1.3))
    attached = np.unique(groups[support & (locks > 0)])
    if not attached.size:
        return np.zeros_like(hair)
    mask = np.isin(groups, attached).astype("float32")
    return cv2.GaussianBlur(mask, (3, 3), 0.55) * smooth((0.38 - shirt) / 0.25)


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
    locks = hanging_hair(rgb, alpha, hair, flesh, shirt, cx, chin, eye, yy, xx)
    strands = np.maximum(hair_matte, locks) * despill
    luminance = rgb @ [0.2126, 0.7152, 0.0722]
    # The studio plate already has a photographic alpha. A second face classifier
    # can label an earlobe between cheek and hair as background. Above the lower
    # jaw the original outer silhouette is authoritative, including both ears.
    photographed_head = smooth((chin - 0.13 * eye - yy) / (0.25 * eye))
    head = (
        np.maximum.reduce([skin_matte, opaque_face, strands, photographed_head])
        * despill
    )
    # Only reproject hair near and below the jaw above the front of the collar.
    fringe = strands * smooth((down + 0.58) / 0.35)
    support = cv2.dilate(np.uint8(alpha > 0.005), np.ones((3, 3), np.uint8))
    # A detached patch of original shirt can score as hair in the semantic
    # trimap. Retain the head component and its soft antialiased boundary.
    _, components = cv2.connectedComponents(np.uint8(head * alpha > 0.10))
    label = components[tuple(np.rint(face[1][::-1]).astype(int))]
    if label:
        attached = cv2.dilate(np.uint8(components == label), np.ones((3, 3), np.uint8))
        support *= attached
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
