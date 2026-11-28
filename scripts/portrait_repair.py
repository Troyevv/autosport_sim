"""Restore missing jaw/neck pixels from each person's own reviewed studio reference.

Supply the earliest archived plate tree and a separate candidate directory.
The interactive game only loads the resulting catalogued images.
"""

import argparse
import json
from pathlib import Path

from PIL import Image

from .portrait_completion import complete_lower_contour, soften_archived_join
from .portrait_edges import remove_key_spill
from .portrait_processing import PortraitProcessor

ART = Path(__file__).resolve().parents[1] / "backend/art"
MASTERS = Path(__file__).with_name("data") / "portrait-restoration"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--masters", type=Path, default=MASTERS)
    args = parser.parse_args()
    if args.output.resolve() in (ART.resolve(), args.archive.resolve()):
        parser.error("Use a separate review directory")
    args.output.mkdir(parents=True, exist_ok=True)
    registration = json.loads((ART / "wardrobe/registration.json").read_text())
    records = json.loads((ART / "junior/catalog.json").read_text())
    processor = PortraitProcessor()
    try:
        for asset in records:
            if asset["kind"] != "generated-head":
                continue
            key = asset["entity"]
            current = Image.open(ART / asset["path"]).convert("RGBA")
            source = Image.open(args.archive / asset["path"]).convert("RGBA")
            master = args.masters / (key + ".webp")
            if master.exists():
                result = complete_lower_contour(
                    source, current, Image.open(master), processor
                )
                changed = True
            else:
                pixels, changed = soften_archived_join(
                    source, current, registration[key]["anchor"]
                )
                result = Image.fromarray(pixels)
            pixels, spill = remove_key_spill(result)
            if changed or spill:
                Image.fromarray(pixels).save(args.output / (key + ".png"))
    finally:
        processor.close()


if __name__ == "__main__":
    main()
