"""Find linear truncations inside archived transparent plates and continue the photographed hair.

Coordinates refer to the source raster. The face and existing opaque pixels are
never resampled. All four directions use the same contour detector.
"""

import cv2
import numpy as np


def oriented(array, side):
    if side == "left":
        return array
    if side == "right":
        return array[:, ::-1]
    across = array.swapaxes(0, 1)
    return across if side == "top" else across[:, ::-1]


def truncated_runs(alpha, hair, eye, face_center, side):
    solid = alpha > 0.55
    edge = np.argmax(solid, axis=1)
    row = np.arange(len(edge))
    inset = np.clip(edge + max(2, round(eye * 0.07)), 0, alpha.shape[1] - 1)
    eligible = solid.any(axis=1) & (hair[row, inset] > 0.57)
    # Short straight pieces around an ear or a parting occur in intact hair.
    # A damaged plate has a sustained exterior line through opaque hair.
    window = max(14, round(eye * 0.72))
    if side in ("left", "right"):
        eligible &= face_center - edge > 1.24 * eye
    elif side == "bottom":
        eligible &= abs(row - face_center) > 0.64 * eye
    selected = np.zeros(len(row), bool)
    for start in range(0, len(row) - window + 1, max(2, window // 8)):
        sample = row[start : start + window][eligible[start : start + window]]
        if len(sample) < window * 0.88:
            continue
        slope, offset = np.polyfit(sample, edge[sample], 1)
        residual = np.abs(edge[sample] - (slope * sample + offset))
        if abs(slope) <= 0.23 and np.quantile(residual, 0.90) <= max(0.75, eye * 0.010):
            selected[sample] = True
    runs = np.flatnonzero(np.diff(np.r_[False, selected, False]))
    return edge, [(a, b) for a, b in runs.reshape(-1, 2) if b - a >= window]


def registered_face(original, current, center, chin, eye):
    """Disallow borrowing from incomplete archives or a differently registered photograph."""
    yy, xx = np.ogrid[: current.shape[0], : current.shape[1]]
    central = (
        (abs(xx - center) < 0.7 * eye)
        & (yy < chin - 0.2 * eye)
        & (yy > chin - 1.8 * eye)
    )
    overlap = central & (original[:, :, 3] > 230) & (current[:, :, 3] > 230)
    if overlap.sum() < 0.85 * central.sum():
        return False
    diff = abs(original[:, :, :3].astype(float) - current[:, :, :3])
    return np.median(diff[overlap]) <= 6


def continue_plate(photo, current, hair, eye, center):
    """Synthesize only missing fibres outside the measured clipping lines."""
    target = current.copy()
    changes = {}
    for side in ("left", "right", "top", "bottom"):
        raw, output, prob = [oriented(a, side) for a in (photo, target, hair)]
        h, w = raw.shape[:2]
        face_center = w - 1 - center if side == "right" else center
        edge, runs = truncated_runs(raw[:, :, 3] / 255, prob, eye, face_center, side)
        for start, stop in runs:
            # Both ends meet the surviving contour tangentially. Continuation
            # width follows the length of the cut and the local strand texture.
            pad = round(eye * 0.15)
            rows = np.arange(max(0, start - pad), min(h, stop + pad))
            phase = (rows - start + pad) / (stop - start + 2 * pad)
            profile = np.maximum(0, np.sin(np.pi * phase)) ** 0.68
            depth = min(
                (stop - start) * 0.21, eye * (0.58 if side == "bottom" else 0.40)
            )
            ridge = edge[rows]
            sample = np.minimum(w - 1, ridge + max(2, round(eye * 0.13)))
            light = raw[rows, sample, :3].astype(np.float32).mean(axis=1)
            detail = light - cv2.GaussianBlur(light[:, None], (1, 0), eye * 0.07)[:, 0]
            length = depth * profile * np.clip(1 + detail / 200, 0.75, 1.22)
            # Reflect a narrow patch of the same strands, at a varying depth to
            # avoid a visible mirror axis. Preserve tone at the original boundary.
            lo = max(0, int((ridge - length).min()) - 3)
            hi = min(w, int(ridge.max() + eye * 0.26 + 3))
            cols = np.arange(lo, hi)[None, :]
            dist = ridge[:, None] - cols
            mix = np.clip(dist / np.maximum(length[:, None], 1), 0, 1)
            sx = (ridge[:, None] + np.maximum(1, dist) * (0.86 - mix * 0.38)).astype(
                "float32"
            )
            sy = (
                rows[:, None] - (rows[:, None] - (start + stop) / 2) * 0.15 * mix
            ).astype("float32")
            strip = cv2.remap(raw, sx, sy, cv2.INTER_LINEAR)
            certainty = cv2.remap(prob, sx, sy, cv2.INTER_LINEAR)
            opacity = np.clip((length[:, None] - dist) / max(1.2, eye * 0.024), 0, 1)
            opacity *= np.clip((certainty - 0.24) / 0.50, 0, 1) * (strip[:, :, 3] / 255)
            # Bridge any missing matte on the archived side of the cut with
            # the archived pixels themselves, without changing skin or face.
            old = raw[rows[0] : rows[-1] + 1, lo:hi]
            inside = dist < 0
            color = np.where(inside[:, :, None], old[:, :, :3], strip[:, :, :3])
            opacity = np.where(
                inside,
                old[:, :, 3] / 255 * prob[rows[0] : rows[-1] + 1, lo:hi],
                opacity,
            )
            opacity *= profile[:, None] ** 0.22
            existing = output[rows[0] : rows[-1] + 1, lo:hi]
            base = existing[:, :, 3] / 255
            added = opacity * (1 - base)
            total = base + added
            rgb = (
                existing[:, :, :3] * base[:, :, None] + color * added[:, :, None]
            ) / np.maximum(total[:, :, None], 1e-8)
            existing[:, :, :3] = np.rint(np.clip(rgb, 0, 255)).astype("uint8")
            existing[:, :, 3] = np.rint(total * 255).astype("uint8")
            changes[side] = changes.get(side, 0) + int(
                ((dist >= 0) & (added > 0.25)).sum()
            )
    return target, {key: count for key, count in changes.items() if count > eye * 0.75}


def recover_original_crown(original, repaired, chin, eye):
    """Put back surviving photographic pixels removed by older silhouette trimming."""
    h, w = repaired.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    old = original[:, :, 3] / 255
    alpha = repaired[:, :, 3] / 255
    upper = yy < chin - 0.18 * eye
    lost = np.maximum(old - alpha, 0) * upper
    if (lost > 0.3).sum() < 12:
        return repaired, 0
    # An archive containing only a fragment can be followed by a new studio
    # plate on the same ID. Never borrow pixels across unregistered photographs.
    overlap = (alpha > 0.9) & (old > 0.9) & upper & (abs(xx - w / 2) < 0.85 * eye)
    rgb = original[:, :, :3].astype(float)
    if (
        overlap.sum() < eye * eye
        or np.median(abs(rgb[overlap] - repaired[:, :, :3][overlap])) > 6
    ):
        return repaired, 0
    # The colour key of an old plate is outside the photographed subject.
    spill = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    lost *= 1 - np.clip((spill - 8) / 24, 0, 1)
    result = repaired.copy()
    total = alpha + lost
    take = lost > 1 / 255
    result[:, :, :3][take] = np.rint(
        (repaired[:, :, :3][take] * alpha[take, None] + rgb[take] * lost[take, None])
        / total[take, None]
    ).astype("uint8")
    result[:, :, 3][take] = np.rint(total[take] * 255).astype("uint8")
    return result, int((lost > 0.3).sum())


def remove_key_spill(image):
    """Remove matte green reflected into perimeter strands without trimming their alpha."""
    a = np.asarray(image)
    rgb = a[:, :, :3].astype(np.float32)
    alpha = a[:, :, 3] / 255
    r, g, b = np.moveaxis(rgb, 2, 0)
    depth = cv2.distanceTransform(np.uint8(alpha > 0.8), cv2.DIST_L2, 5)
    # Natural blond highlights can have more green than blue. Chroma spill
    # also exceeds the local red/brown strand colour at the cutout boundary.
    moss = g - (r * 0.75 + b * 0.25)
    weight = np.clip((moss - 5) / 17, 0, 1) * np.clip((13 - depth) / 9, 0, 1)
    selected = (weight > 0.12) & (alpha > 0.03)
    if selected.sum() < 12:
        return a, 0
    neutral = np.clip((moss - 3), 0, 85) * weight
    clean = a.copy()
    clean[:, :, 1] = np.rint(np.clip(g - neutral, 0, 255))
    return clean, int(selected.sum())
