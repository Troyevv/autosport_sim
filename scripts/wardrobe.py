"""Colour the photographic fabric before the R3.2 per-person garment fit."""

from io import BytesIO

import numpy as np
from PIL import Image


def colorway(image, colors, role):
    pixels = np.array(image.convert("RGBA"))
    h, w = pixels.shape[:2]
    y, x = np.ogrid[:h, :w]
    # Measured garment width changes under camera framing. Define each panel in
    # its photographic plane and let the same column map warp its seams and cloth.
    side = np.abs(2 * (x + 0.5) / w - 1)
    edge = {"driver": 0.70, "staff": 0.83, "manufacturer": 0.76}[role] - 0.16 * (
        1 - y / h
    )
    panel = np.clip((side - edge) * w / 2, 0, 1)
    piping = np.clip((0.012 - np.abs(side - edge + 0.045)) * w / 2, 0, 1)
    blend = np.maximum(panel, piping)[..., None]
    primary, trim = (
        np.frombuffer(bytes.fromhex(c), dtype=np.uint8).astype(float) for c in colors
    )
    dye = primary + blend * (trim - primary)
    luminance = pixels[:, :, :3] @ np.array([0.2126, 0.7152, 0.0722]) / 255
    light = luminance[..., None]
    # Preserve zipper/ribbing shadows and specular highlights of the original textile.
    rgb = (
        np.minimum(light * 2, 1) * dye + np.maximum(light - 0.5, 0) * (255 - dye) * 1.45
    )
    pixels[:, :, :3] = np.rint(np.clip(rgb, 0, 255)).astype("uint8")
    out = BytesIO()
    Image.fromarray(pixels).save(out, "WEBP", quality=89, method=4)
    return out.getvalue()
