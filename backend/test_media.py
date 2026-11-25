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
        kind="head",
        entity="person-lando-norris",
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
        media.get("head", "person-lando-norris")
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
    before = media.get("head", "person-lando-norris")
    with pytest.raises(domain.RuleError):
        media.install(pack()[:-30])
    assert media.get("head", "person-lando-norris") == before


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
