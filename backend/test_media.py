import hashlib
import pytest
from PIL import Image
from backend import domain, media
from backend.catalog import WORLD


def test_bundled_artwork_complete_and_unique():
    keys = {(a["kind"], a["entity"]) for a in media.index()}
    faces = {entity for kind, entity in keys if kind == "generated-head"}
    used = [p["face"] for p in WORLD["profiles"].values()]
    assert len(keys) == len(media.index())
    assert len(used) == len(set(used))
    assert set(used).isdisjoint(WORLD["reserve"])
    from .personal_engineering import roster

    additional = {row["face"] for row in roster()}
    assert len(additional) == len(roster()) and additional.isdisjoint(
        set(used) | set(WORLD["reserve"])
    )
    assert set(used) | set(WORLD["reserve"]) | additional == faces
    assert len(WORLD["reserve"]) >= 200
    matte_slots = set()
    for a in media.index():
        path = media.ROOT / a["path"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == a["sha256"]
        if a["kind"] == "generated-head":
            atlas, slot = a["anatomy"]["matte"]
            assert ("portrait-matte", atlas) in keys
            assert 0 <= slot < 16 and (atlas, slot) not in matte_slots
            matte_slots.add((atlas, slot))
            assert a["anatomy"]["neck"] > 0 and a["anatomy"]["breadth"] > 0
            if a["entity"] not in additional:
                assert (
                    len(a["anatomy"]["body"][0]) == len(a["anatomy"]["body"][1]) == 27
                )
            else:
                assert len(a["anatomy"]["anchor"]) == 3
            with Image.open(path) as im:
                assert im.mode == "RGBA" and im.size == (
                    (240, 280) if a["entity"] in additional else (480, 560)
                )
        elif a["kind"] == "logo":
            assert a["license"] and a["author"] and a["source"].startswith("https://")
    for org in WORLD["organizations"].values():
        for role in (
            ["manufacturer"] if org["kind"] == "supplier" else ["driver", "staff"]
        ):
            assert ("uniform", "studio-" + role + "-" + org["id"]) in keys
    with pytest.raises(domain.RuleError):
        media.get("head", "unknown")


def test_effective_appointments_and_neutral_clothing():
    former = [dict(person="p", start="2025-01-01", end="2025-07-01")]
    future = [dict(person="p", start="2025-08-01", end=None)]
    assert domain.occupant_on(former, "2025-06-30") == "p"
    assert domain.occupant_on(future, "2025-06-30") is None
    assert (
        domain.occupant_on(former, "2025-07-01")
        is domain.occupant_on(future, "2025-07-01")
        is None
    )
    assert domain.occupant_on(future, "2025-08-01") == "p"
    colors = {
        WORLD["organizations"][org]["color"]
        for org in ("team-mclaren-formula-1-team", "team-scuderia-ferrari")
    }
    assert len(colors | {"#4e525c"}) == 3


def test_split_garment_has_two_shoulders():
    np = pytest.importorskip("numpy")
    pytest.importorskip("cv2")
    from scripts.portrait_fit import shoulder_panels

    mask = np.zeros((120, 180), dtype="float32")
    mask[80:115, 10:70] = 1
    mask[78:115, 115:174] = 1
    mask[75:77, 101:103] = 1
    panels = shoulder_panels(mask, center=90, chin=60, span=22)
    assert panels[95, 45] and panels[95, 144]
    assert not panels[100, 90] and not panels[75, 101]
    mask[:, 110:] = 0
    with pytest.raises(ValueError, match="оба плеча"):
        shoulder_panels(mask, center=90, chin=60, span=22)


def test_shoulders_ignore_hair_over_the_sleeve():
    pytest.importorskip("cv2")
    from scripts.portrait_fit import smooth_shoulders

    x = list(range(0, 270, 10))
    y = [185, 182, 179, 146, 173, 170] + [174] * 21
    _, corrected = smooth_shoulders([x, y])
    assert corrected[3] == 176
    assert corrected[:3] == y[:3] and corrected[4:] == y[4:]
