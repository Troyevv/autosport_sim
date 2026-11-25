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
    # Grey racing fabric is darker than the staff polo. Use a lit sample of the
    # actual textile so the same team dye keeps its hue in both photographs.
    swatch = np.percentile(luminance[pixels[:, :, 3] > 240], 75)
    shade = np.minimum(light / swatch, 1)
    specular = np.maximum(light - swatch, 0) / (1 - swatch)
    rgb = shade * dye + specular * (255 - dye) * 0.75
    pixels[:, :, :3] = np.rint(np.clip(rgb, 0, 255)).astype("uint8")
    out = BytesIO()
    Image.fromarray(pixels).save(out, "WEBP", quality=89, method=4)
    return out.getvalue()
