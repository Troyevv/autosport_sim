"""Reinstate the missing lower contour of a studio plate from an approved restoration."""

import cv2
import numpy as np
from PIL import Image

from .portrait_processing import Unsuitable


def photographed_face(image, processor):
    rgba = np.asarray(image.convert("RGBA"))
    alpha = rgba[:, :, 3:] / 255
    rgb = np.uint8(rgba[:, :, :3] * alpha + 119 * (1 - alpha))
    source = processor.image(rgb)
    faces = processor.faces.detect(source).face_landmarks
    if len(faces) != 1:
        raise Unsuitable("Expected one identifiable studio subject")
    face = np.array([(q.x * image.width, q.y * image.height) for q in faces[0]])
    return rgba, source, face


def complete_lower_contour(archive, registered, complete, processor):
    """Keep the archived eyes, nose, mouth and crown. Align a restoration by those features."""
    old = np.array(archive.convert("RGBA"))
    _, _, target = photographed_face(registered, processor)
    donor, source, face = photographed_face(complete, processor)
    points = [33, 133, 362, 263, 1, 4, 98, 327, 61, 291]
    matrix, _ = cv2.estimateAffinePartial2D(
        face[points], target[points], method=cv2.LMEDS
    )
    if matrix is None:
        raise Unsuitable("Unable to register restored lower face")
    eye = np.linalg.norm(target[[33, 133]].mean(0) - target[[362, 263]].mean(0))
    center = target[1, 0]
    alpha = old[:, :, 3] / 255
    centre = abs(np.arange(archive.width) - center) < 0.28 * eye
    rows = np.flatnonzero(np.median(alpha[:, centre], axis=1) > 0.7)
    if not rows.size:
        raise Unsuitable("No intact central face")
    edge = rows[-1]
    probs = [
        m.numpy_view().squeeze().copy()
        for m in processor.skin.segment(source).confidence_masks
    ]
    skin = probs[2] + probs[3]
    neck = abs(np.arange(complete.width) - face[152, 0]) < 1.12 * np.linalg.norm(
        face[[33, 133]].mean(0) - face[[362, 263]].mean(0)
    )
    confidence = np.maximum(probs[1], skin * neck[None, :])
    mask = np.clip((confidence - 0.11) / 0.60, 0, 1) * donor[:, :, 3] / 255
    premul = np.dstack((donor[:, :, :3] * mask[:, :, None], mask)).astype("float32")
    patch = cv2.warpAffine(premul, matrix, archive.size)
    density = patch[:, :, 3]
    rgb = patch[:, :, :3] / np.maximum(density[:, :, None], 0.001)
    yy, xx = np.mgrid[: archive.height, : archive.width]
    # Match the two cheeks independently, using the intact band above the cut.
    overlap = (
        (alpha > 0.85)
        & (density > 0.85)
        & (abs(xx - center) < 0.67 * eye)
        & (yy < edge - 0.10 * eye)
        & (yy > edge - 0.45 * eye)
    )
    if overlap.sum() < 40:
        raise Unsuitable("Insufficient shared area for tonal registration")
    delta = old[:, :, :3].astype(float) - rgb
    sides = [
        np.median(delta[overlap & side], axis=0)
        if (overlap & side).sum() > 20
        else np.median(delta[overlap], axis=0)
        for side in [xx < center, xx >= center]
    ]
    balance = np.clip((xx - center) / eye + 0.5, 0, 1)[:, :, None]
    rgb = np.clip(rgb + sides[0] * (1 - balance) + sides[1] * balance, 0, 255)
    # The original loses its whole lower edge on precisely one scan line.
    # Feather below the lower lip and keep all intact upper features untouched.
    t = np.clip((edge - yy) / max(4, 0.25 * eye), 0, 1)
    weight = t * t * (3 - 2 * t)
    a = alpha * weight
    b = density * (1 - a) * np.clip((yy - edge + 0.50 * eye) / (0.16 * eye), 0, 1)
    combined = a + b
    output = (old[:, :, :3] * a[:, :, None] + rgb * b[:, :, None]) / np.maximum(
        combined[:, :, None], 0.001
    )
    return Image.fromarray(
        np.uint8(np.clip(np.dstack((output, combined * 255)), 0, 255))
    )


def blend_transverse_seam(rgb, edge, eye, center):
    """Remove the coherent horizontal colour step at an archival scan boundary."""
    h, w = rgb.shape[:2]
    radius = max(3, round(eye * 0.16))
    if edge < radius + 2 or edge + radius + 2 >= h:
        return rgb
    rows = np.arange(edge - radius, edge + radius + 1)
    t = (rows - rows[0]) / (2 * radius)
    upper = np.median(rgb[rows[0] - 1 : rows[0] + 2], axis=0)
    lower = np.median(rgb[rows[-1] - 1 : rows[-1] + 2], axis=0)
    bridge = upper[None] * (1 - t[:, None, None]) + lower[None] * t[:, None, None]
    # Keep original pores. Only the low-frequency strip carries the old seam.
    band = rgb[rows].astype("float32")
    low = cv2.GaussianBlur(band, (0, 0), max(1, eye * 0.035))
    grain = np.clip(band - low, -3, 3)
    sides = np.clip((1.00 - abs(np.arange(w) - center) / eye) / 0.20, 0, 1)
    mix = np.sin(np.pi * t)[:, None, None] ** 0.65 * sides[None, :, None]
    out = rgb.copy()
    out[rows] = band * (1 - mix) + (bridge + grain) * mix
    return out


def soften_archived_join(archive, fitted, anchor):
    """Match the missing skin immediately below a transverse cut to the surviving scanlines."""
    src = np.asarray(archive.convert("RGBA"))
    current = np.asarray(fitted.convert("RGBA"))
    h, w = src.shape[:2]
    center, chin, eye = np.array(anchor) * [w / 240, h / 280, w / 240]
    yy, xx = np.mgrid[:h, :w]
    central = abs(xx[0] - center) < eye * 0.30
    opaque = src[:, :, 3] > 180
    occupied = np.flatnonzero(np.median(opaque[:, central], axis=1))
    if not occupied.size:
        return current, False
    edge = occupied[-1]
    if not chin - 0.40 * eye < edge < chin + 0.52 * eye:
        return current, False
    valid = (opaque[edge - 3]) & (~opaque[edge + 3]) & (current[edge + 4, :, 3] > 190)
    valid &= abs(xx[0] - center) < eye * 1.05
    if valid.sum() < 0.65 * eye:
        return current, False
    rgb = current[:, :, :3].astype(np.float32)
    down = (yy - edge) / eye
    # Correct a scanline only when it is a measured outlier. Blending an
    # already smooth beard-to-neck transition drags beard pixels into skin.
    band = np.median(rgb[edge - 5 : edge + 6, valid], axis=1)
    jumps = np.mean(abs(np.diff(band, axis=0)), axis=1)
    local_step = float(max(jumps[4:7]))
    abrupt = local_step > max(4.5, 2.2 * np.median(jumps))
    # The older replacement can have a completely different complexion. A
    # matching scanline at the seam alone leaves the rest of the neck pale.
    cheeks = opaque & (abs(xx - center) > 0.32 * eye) & (abs(xx - center) < 0.67 * eye)
    cheeks &= (yy > chin - 1.65 * eye) & (yy < chin - 1.25 * eye)
    neck = (abs(xx - center) < 0.40 * eye) & (current[:, :, 3] > 190)
    neck &= (yy > max(edge, chin + 0.35 * eye)) & (yy < chin + 0.75 * eye)
    tone = np.zeros(3)
    if cheeks.sum() > 30 and neck.sum() > 30:
        cheek_tone = np.median(rgb[cheeks], axis=0)
        neck_tone = np.median(rgb[neck], axis=0)
        desired = 0.88 * cheek_tone
        if (
            neck_tone.mean() > desired.mean() + 8
            or abs((neck_tone[0] - neck_tone[1]) - (desired[0] - desired[1])) > 12
        ):
            tone = np.clip(desired - neck_tone, -65, 45)
    if not abrupt and np.max(abs(tone)) < 1:
        return current, False
    depth = np.clip((down + 0.09) / 0.40, 0, 1)
    colour = rgb + tone * depth[:, :, None]
    if abrupt:
        colour = blend_transverse_seam(colour, edge, eye, center)
    repaired = current.copy()
    repaired[:, :, :3] = np.rint(np.clip(colour, 0, 255))
    return repaired, True
