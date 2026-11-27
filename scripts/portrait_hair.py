"""Finish photographic hair cut off by straight source crop boundaries.

Only registered strands meeting a measurable straight crop are continued.
Texture is sampled from that same lock, upstream of its cut. The photographic
face and the complete part of the hairstyle do not enter the edit mask.
"""

import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parents[1] / "backend/art"


def finish(photo, hair, anchor):
    src = np.asarray(photo.convert("RGBA"))
    h, w = src.shape[:2]
    cx, chin, eye = np.array(anchor) * [w / 240, h / 280, w / 240]
    yy, xx = np.mgrid[:h, :w].astype("float32")
    alpha = src[:, :, 3] / 255
    prob = cv2.resize(hair, (w, h)).astype(float) / 255
    solid = alpha > 0.53
    edge = h - 1 - np.argmax(solid[::-1], axis=0)
    cols = np.arange(w)
    near = np.maximum(0, edge - round(0.11 * eye))
    valid = (
        solid.any(axis=0) & (np.abs(cols - cx) > 0.65 * eye) & (prob[near, cols] > 0.32)
    )
    valid &= (edge > chin - 1.10 * eye) & (edge < chin + 1.95 * eye)
    cut = np.zeros(w, bool)
    # Fit a straight line across a substantial run, including diagonal cuts.
    window = max(8, round(0.28 * eye))
    for x in range(0, w - window, 3):
        samples = np.arange(x, x + window)[valid[x : x + window]]
        if len(samples) < 0.9 * window:
            continue
        fit = np.polyfit(samples, edge[samples], 1)
        if (
            abs(fit[0]) > 1.45
            or np.std(edge[samples] - np.polyval(fit, samples)) > 0.016 * eye
        ):
            continue
        below = np.minimum(h - 1, edge[samples] + max(2, round(0.06 * eye)))
        if np.mean(alpha[below, samples] < 0.30) < 0.5:
            continue
        cut[samples] = True
    if cut.sum() < window:
        return None
    density = cv2.GaussianBlur(cut.astype("float32")[None], (0, 0), 0.08 * eye)[0]
    indices = np.where(valid)[0]
    ridge = np.interp(np.arange(w), indices, edge[indices])
    ridge = cv2.GaussianBlur(ridge[None], (0, 0), 1.2)[0]
    x = np.arange(w)
    # The end of a lock follows the changing direction and brightness of the
    # photographed strands. Keep neighbouring fibres together into small tufts.
    lum = src[:, :, :3] @ [0.2126, 0.7152, 0.0722]
    samples = lum[np.int32(np.clip(ridge - 0.14 * eye, 0, h - 1)), x]
    texture = cv2.GaussianBlur(samples[None], (0, 0), 0.038 * eye)[0]
    texture = np.tanh(
        (texture - cv2.GaussianBlur(samples[None], (0, 0), 0.20 * eye)[0]) / 18
    )
    rhythm = (
        np.sin((x - cx) / eye * 12.7) + 0.6 * np.sin((x - cx) / eye * 29.3 + 0.7)
    ) / 1.6
    length = (
        eye
        * np.clip(0.64 - 0.30 * (ridge - chin) / eye, 0.28, 0.88)
        * density
        * np.clip(0.68 + 0.21 * texture + 0.25 * rhythm, 0.23, 1.12)
    )
    # Pull the source tip down continuously from an undisturbed hair region.
    start = ridge - 0.29 * eye
    t = np.clip((yy - start) / np.maximum(length + 0.29 * eye, 1), 0, 1)
    disp = t * t * length
    drift = np.sign(xx - cx) * (0.065 * eye) * t * t * density
    sx = (xx + drift).astype("float32")
    sy = (yy - disp).astype("float32")
    premul = np.dstack([src[:, :, :3] * alpha[:, :, None], alpha]).astype("float32")
    extension = cv2.remap(premul, sx, sy, cv2.INTER_LINEAR)
    source_hair = cv2.remap(prob.astype("float32"), sx, sy, cv2.INTER_LINEAR)
    opacity = extension[:, :, 3] * np.clip((source_hair - 0.13) / 0.52, 0, 1)
    opacity *= np.clip((ridge + length - yy) / (0.045 * eye), 0, 1) * np.clip(
        density * 3, 0, 1
    )
    opacity *= np.clip((yy - start) / (0.15 * eye), 0, 1)
    rgb = extension[:, :, :3] / np.maximum(extension[:, :, 3:], 0.001)
    combined = opacity + alpha * (1 - opacity)
    painted = (
        rgb * opacity[:, :, None] + src[:, :, :3] * (alpha * (1 - opacity))[:, :, None]
    ) / np.maximum(combined[:, :, None], 0.001)
    return Image.fromarray(
        np.uint8(np.clip(np.dstack([painted, combined * 255]), 0, 255))
    )


def finish_silhouette(image, probability, anchor):
    rgba = np.array(image.convert("RGBA"))
    opacity = rgba[:, :, 3].astype(float) / 255
    h, w = opacity.shape
    hair = cv2.resize(probability, (w, h)).astype(float) / 255
    cx, chin, eye = np.array(anchor) * [w / 240, h / 280, w / 240]
    keep = np.ones((h, w), dtype=float)
    lum = rgba[:, :, :3] @ [0.2126, 0.7152, 0.0722]

    def trim(alpha, prob, lit, result, first, last):
        opaque = alpha > 0.52
        edges = np.argmax(opaque, axis=1)
        rows = np.arange(len(edges))
        p = prob[rows, np.minimum(alpha.shape[1] - 1, edges + 2)]
        eligible = (rows >= first) & (rows <= last) & (p > 0.5) & opaque.any(axis=1)
        if not eligible.any():
            return
        boundary = np.percentile(edges[eligible], 4)
        straight = eligible & (abs(edges - boundary) < max(1.5, eye * 0.026))
        if straight.sum() < 0.60 * eye:
            return
        segments = np.split(
            np.where(straight)[0],
            np.where(np.diff(np.where(straight)[0]) > max(2, 0.12 * eye))[0] + 1,
        )
        for run in segments:
            if len(run) < 0.49 * eye:
                continue
            lo, hi = run[0], run[-1]
            extent = hi - lo + 1
            for r in range(
                max(0, round(lo - eye * 0.17)),
                min(len(rows), round(hi + eye * 0.17) + 1),
            ):
                t = np.clip((r - lo) / extent, 0, 1)
                weight = np.clip(
                    min((r - lo) / (0.17 * eye) + 1, (hi - r) / (0.17 * eye) + 1), 0, 1
                )
                tuft = (
                    0.038 * eye * (np.sin(r / eye * 29) + 0.45 * np.sin(r / eye * 61))
                )
                edge = boundary + weight * (
                    eye * (0.045 + 0.25 * (2 * t - 1) ** 2) + tuft
                )
                detail = np.clip(
                    (
                        lit[r]
                        - np.median(
                            lit[
                                r,
                                max(0, round(boundary)) : round(boundary + eye * 0.18)
                                + 1,
                            ]
                        )
                    )
                    / 30,
                    -1,
                    1,
                )
                fade = np.clip(
                    (np.arange(alpha.shape[1]) - edge + detail * eye * 0.032)
                    / (eye * 0.034),
                    0,
                    1,
                )
                result[r] *= 1 - prob[r] * (1 - fade)

    trim(opacity, hair, lum, keep, chin - 4.8 * eye, chin + 1.3 * eye)
    trim(
        opacity[:, ::-1],
        hair[:, ::-1],
        lum[:, ::-1],
        keep[:, ::-1],
        chin - 4.8 * eye,
        chin + 1.3 * eye,
    )
    trim(opacity.T, hair.T, lum.T, keep.T, cx - 1.65 * eye, cx + 1.65 * eye)
    if np.sum((1 - keep) * opacity) < eye * 0.5:
        return None
    rgba[:, :, 3] = np.uint8(opacity * keep * 255)
    return Image.fromarray(rgba)


def hair_probability(processor, image):
    rgba = np.array(image.convert("RGBA").resize((240, 280)))
    alpha = rgba[:, :, 3:4] / 255
    rgb = np.uint8(rgba[:, :, :3] * alpha + 119 * (1 - alpha))
    masks = processor.skin.segment(processor.image(rgb)).confidence_masks
    return np.uint8(masks[1].numpy_view().copy().squeeze() * 255)


def main():
    from .portrait_processing import PortraitProcessor

    processor = PortraitProcessor()
    reg = json.loads((ART / "wardrobe/registration.json").read_text())
    count = 0
    for file in (ART / "catalog.json", ART / "junior/catalog.json"):
        records = json.loads(file.read_text())
        for asset in records:
            if asset["kind"] != "generated-head":
                continue
            r = reg[asset["entity"]]
            path = ART / asset["path"]
            image = Image.open(path)
            hair = hair_probability(processor, image)
            result = finish(image, hair, r["anchor"])
            silhouette = finish_silhouette(result or image, hair, r["anchor"])
            result = silhouette or result
            if result is None:
                continue
            result.save(path, quality=95, method=4)
            asset["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            count += 1
        if file.parent == ART:
            lines = (
                json.dumps(a, ensure_ascii=False, separators=(",", ":"))
                for a in records
            )
            file.write_text("[\n" + ",\n".join(lines) + "\n]\n")
        else:
            file.write_text(
                json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
    processor.close()
    print(count, "photographic hair edges finished")


if __name__ == "__main__":
    cv2.setNumThreads(1)
    main()
