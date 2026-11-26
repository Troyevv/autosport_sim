import copy
import hashlib

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from . import service, storage
from .app import app
from .catalog import WORLD
from .domain import RuleError
from .livery import GARAGE, Livery


def test_all_entries_have_round_trippable_independent_paint():
    assert GARAGE["entries"].keys() == {
        eid
        for eid, e in WORLD["entries"].items()
        if WORLD["championships"][e["championship"]].get("playable", True)
    }
    for entry, spec in GARAGE["entries"].items():
        paint = Livery.model_validate(spec["livery"])
        assert Livery.model_validate_json(paint.model_dump_json()) == paint
        assert paint.pattern in GARAGE["patterns"]
        assert paint.number.lstrip("0") == WORLD["entries"][entry]["number"].lstrip("0")
        for decal in paint.decals:
            rule = GARAGE["sponsors"][decal.asset]
            assert decal.asset in spec["allowed_assets"]
            assert decal.zone in rule["zones"] and decal.scale <= rule["maxScale"]
    for series in ("f2", "f3"):
        assert (
            len(
                {
                    s["geometry"]
                    for k, s in GARAGE["entries"].items()
                    if k.startswith(series + "-")
                }
            )
            == 1
        )


@pytest.mark.parametrize(
    "patch",
    [
        {"number": 7},
        {"version": 2},
        {"colors": ["red"] * 3},
        {"number": "1234"},
        {"decals": [{"x": 1.01}]},
    ],
)
def test_reject_invalid_schema(patch):
    with pytest.raises(ValidationError):
        Livery.model_validate({**GARAGE["entries"]["f1-4"]["livery"], **patch})


def test_edit_ownership_retry_and_portable_history(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    c = service.create(
        service.CareerInput(
            name="Гараж",
            org="team-mclaren-formula-1-team",
            series="f1",
            role="manager",
            seed=8,
        )
    )
    original = GARAGE["entries"]["f1-4"]["livery"]
    paint = copy.deepcopy(original)
    paint["colors"][1] = "#776655"
    paint["decals"][0].update(x=0.7, y=0.35, angle=-24, scale=0.6)

    def order(entry, livery, revision=0, key="paint"):
        return service.Command(
            action="save-livery",
            revision=revision,
            command_id=key,
            paint={"entry": entry, "livery": livery},
        )

    cmd = order("f1-4", paint)
    first = service.execute(c["id"], cmd)
    assert service.execute(c["id"], cmd) == first
    assert service.load(c["id"])["liveries"] == {"f1-4": paint}
    # Retry with a different payload, stale revision, foreign entry and undeclared mark.
    bad = copy.deepcopy(paint)
    bad["decals"][0]["asset"] = "visa"
    for attempt in (
        order("f1-4", original),
        order("f1-81", paint, key="stale"),
        order("f1-1", paint, 1, "foreign"),
        order("f1-4", bad, 1, "brand"),
    ):
        with pytest.raises(RuleError):
            service.execute(c["id"], attempt)
    service.execute(c["id"], order("f1-81", {**paint, "number": "081"}, 1, "sister"))
    archive = service.export_save(c["id"])
    imported = service.import_save(archive)
    assert imported["liveries"]["f1-81"]["number"] == "081"
    assert service.export_save(imported["id"]) == archive
    assert GARAGE["entries"]["f1-4"]["livery"] == original
    # Recomputed checksum cannot bless an invalid coordinate in the replay.
    archive["payload"]["commands"][0]["paint"]["livery"]["decals"][0]["x"] = -0.3
    archive["sha256"] = hashlib.sha256(
        storage.dump(archive["payload"]).encode()
    ).hexdigest()
    with pytest.raises(RuleError):
        service.import_save(archive)


def test_out_of_bounds_api_leaves_no_receipt(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        c = client.post(
            "/api/careers",
            json=dict(
                name="Экипаж",
                org="team-aston-martin-thor-team",
                series="wec",
                role="manager",
                seed=7,
            ),
        ).json()
        paint = copy.deepcopy(GARAGE["entries"]["wec-007"]["livery"])
        paint["decals"][0]["x"] = 1.2
        response = client.post(
            f"/api/careers/{c['id']}/commands",
            json=dict(
                action="save-livery",
                command_id="bad",
                revision=0,
                paint=dict(entry="wec-007", livery=paint),
            ),
        )
        assert response.status_code == 422
        assert service.export_save(c["id"])["payload"]["commands"] == []


def test_registered_parts_reassemble_all_historical_silhouettes():
    import json
    from pathlib import Path

    from PIL import Image

    frontend = Path(__file__).resolve().parents[1] / "frontend"
    assets = frontend / "public/assets/garage/2025-v1"
    models = json.loads((frontend / "src/garage/geometry.json").read_text())
    assert set(models) == {v["geometry"] for v in GARAGE["entries"].values()}
    for name, geometry in models.items():
        base = Image.open(assets / f"{name}-base.webp").convert("RGBA")
        atlas = Image.open(assets / f"{name}.webp").convert("RGBA")
        combined = Image.new("RGBA", base.size)
        for slot, x, y, sx, sy, w, h in geometry["parts"]:
            tile = atlas.crop((sx, sy, sx + w, sy + h))
            # Ownership is binary, coverage is fractional. Copy antialiasing once.
            combined.paste(
                tile,
                (x, y),
                tile.getchannel("A").point(lambda alpha: 255 if alpha else 0),
            )
            if slot in geometry["variants"]:
                for variant in geometry["variants"][slot].values():
                    with Image.open(assets / f"{variant}.webp") as alternative:
                        assert alternative.size == tile.size
                        assert (
                            alternative.getchannel("A").tobytes()
                            != tile.getchannel("A").tobytes()
                        )
        assert combined.getchannel("A").tobytes() == base.getchannel("A").tobytes(), (
            name
        )
        # Lossless WebP encoders may pick arbitrary RGB for fully transparent pixels.
        visible = base.getchannel("A").point(lambda alpha: 255 if alpha else 0)
        reference = Image.new("RGBA", base.size)
        reference.paste(base, (0, 0), visible)
        assert combined.tobytes() == reference.tobytes(), name
