import hashlib
import io
import json
import stat
import zipfile

import pytest
from PIL import Image

from backend import domain, media


def pack(issue=None):
    image = io.BytesIO()
    im = Image.new("RGBA", (256, 320))
    im.putpixel((128, 80), (120, 120, 120, 255))
    im.save(image, "PNG")
    content = image.getvalue()
    a = dict(
        kind="generated-head",
        entity="generated-fixture",
        path="images/lando.png",
        author="Test",
        source="authored fixture",
        license="CC0",
        changes="",
        sha256=hashlib.sha256(content).hexdigest(),
    )
    if issue == "curve":
        a["anatomy"] = dict(
            camera=[20, 1, 180, 210], nativeWidth=300, body=[[90] * 27, [140] * 27]
        )
    if issue == "camera":
        a["anatomy"] = dict(
            camera=[20, 1, -120, 210],
            nativeWidth=300,
            body=[list(range(27)), [140] * 27],
        )
    assets = [a]
    if issue == "unknown":
        assets = [a, {**a, "path": "images/second.png", "entity": "person-missing"}]
    if issue == "checksum":
        a["sha256"] = "a" * 64
    if issue == "format":
        a["path"] = "images/wrong.jpg"
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as z:
        z.writestr(
            "manifest.json",
            json.dumps(
                dict(
                    version=2 if issue == "version" else 1,
                    world="2025-v1",
                    gaps=[],
                    assets=assets,
                )
            ),
        )
        for row in assets:
            i = zipfile.ZipInfo(row["path"])
            if issue == "link":
                i.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(i, content)
        if issue == "path":
            z.writestr("../elsewhere.png", content)
    return data.getvalue()


def test_pack_is_atomic_and_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    assert media.index() == []
    with pytest.raises(domain.RuleError):
        media.get("generated-head", "generated-fixture")
    for issue in (
        "unknown",
        "link",
        "path",
        "checksum",
        "version",
        "format",
        "curve",
        "camera",
    ):
        with pytest.raises(domain.RuleError):
            media.install(pack(issue))
        assert media.index() == []
    assert media.install(pack()) == media.install(pack()) == 1
    assert len(media.index()) == 1
    before = media.get("generated-head", "generated-fixture")
    with pytest.raises(domain.RuleError):
        media.install(pack()[:-30])
    assert media.get("generated-head", "generated-fixture") == before


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
    assert (
        len(
            {
                domain.team_color(org)
                for org in (
                    None,
                    "team-mclaren-formula-1-team",
                    "team-scuderia-ferrari",
                )
            }
        )
        == 3
    )


def test_legacy_real_photo_hidden_on_upgrade(tmp_path, monkeypatch):
    from backend import storage

    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    with storage.transaction(True) as db:
        db.execute("PRAGMA user_version=2")
        db.execute(
            "INSERT INTO media VALUES('head', 'person-louis-hamilton', '{}', X'89')"
        )
    assert media.index() == []
    with pytest.raises(domain.RuleError):
        media.get("head", "person-louis-hamilton")


def test_studio_selection_binds_exact_person_frame_and_credit(monkeypatch):
    from backend.studio_sources import StudioSource

    row = dict(
        entity="person-lando-norris",
        image="https://club.example/photo.jpg",
        source="https://club.example/roster/norris",
        publisher="club.example",
        author="Club",
        license="CC BY 4.0",
        terms="https://creativecommons.org/licenses/by/4.0/",
        sha256="a" * 64,
        category="roster-portrait",
        pose="frontal",
        lighting="even-studio",
        framing="single-head-and-shoulders",
        visibility="whole-head-face-neck-both-shoulders",
        headwear="none",
        sunglasses="none",
        adaptation="permitted",
        evidence="Official studio session for the roster.",
    )
    approved = StudioSource.model_validate(row)
    for disallowed in (
        {"category": "paddock"},
        {"category": "podium"},
        {"category": "interview"},
        {"category": "event"},
        {"framing": "full-body"},
        {"framing": "group"},
        {"pose": "profile"},
        {"lighting": "ambient"},
        {"visibility": "cropped-crown"},
        {"headwear": "cap"},
        {"sunglasses": "worn"},
        {"publisher": "other.example"},
        {"adaptation": "editorial-only"},
    ):
        with pytest.raises(ValueError):
            StudioSource.model_validate({**row, **disallowed})
    monkeypatch.setitem(media.REVIEWED, (approved.entity, approved.sha256), approved)
    asset = media.Asset.model_validate(
        dict(
            kind="head",
            entity=approved.entity,
            path="images/test.webp",
            source=approved.source,
            license=approved.license,
            author=approved.author,
            changes="R3.2",
            sha256="b" * 64,
            originalSha256=approved.sha256,
            anatomy=dict(
                camera=(10, 10, 100, 100),
                nativeWidth=480,
                body=(list(range(27)), [100] * 27),
            ),
        )
    )
    assert media.known(asset)
    for change in (
        {"originalSha256": None},
        {"originalSha256": "c" * 64},
        {"entity": "person-lance-stroll"},
        {"anatomy": None},
        {"source": "https://club.example/event"},
    ):
        assert not media.known(asset.model_copy(update=change))


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
