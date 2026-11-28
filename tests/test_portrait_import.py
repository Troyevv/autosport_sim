"""Run with the studio-tools extra to exercise the real segmentation models."""

from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from scripts.portrait_processing import PortraitProcessor, Unsuitable


def test_full_hair_silhouette_precedes_camera_crop():
    pytest.importorskip("mediapipe")
    root = Path(__file__).resolve().parents[1]
    master = root / "scripts/data/portrait-restoration/generated-studio-031-01.png"
    processor = PortraitProcessor()
    try:
        with Image.open(master) as image:
            width, height = image.size
            complete = Image.open(BytesIO(processor.render(master.read_bytes())))
            assert complete.size == (480, 560)
            left, top, right, bottom = complete.getchannel("A").getbbox()
            assert 0 < left < right < complete.width
            assert 0 < top < bottom <= complete.height
            crops = {
                "слева": (round(width * 0.35), 0, width, height),
                "справа": (0, 0, round(width * 0.66), height),
                "сверху": (0, round(height * 0.2), width, height),
                "снизу": (0, 0, width, round(height * 0.60)),
            }
            for side, box in crops.items():
                encoded = BytesIO()
                image.crop(box).save(encoded, format="PNG")
                with pytest.raises(Unsuitable, match="обрезана " + side):
                    processor.render(encoded.getvalue())
    finally:
        processor.close()
