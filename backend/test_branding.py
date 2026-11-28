from copy import deepcopy

from fastapi.testclient import TestClient

from . import service
from .app import app
from .branding import BrandPalette, can_edit
from .catalog import LINEUP_WORLD, SEASON_LINEUP, WORLD
from .finance.capital import owner_wallet
from .livery import GARAGE, garage_catalog


def test_every_organization_has_a_valid_brand_palette():
    for world in (LINEUP_WORLD, SEASON_LINEUP):
        for organization in world["organizations"].values():
            palette = BrandPalette.model_validate(organization["brand_palette"])
            assert palette.primary == organization["color"]
    assert {o["kind"] for o in SEASON_LINEUP["organizations"].values()} == {
        "supplier",
        "team",
    }


def test_factory_paint_is_independent_of_catalog_brand_changes(monkeypatch):
    entry = next(e for e in WORLD["entries"].values() if e["championship"] == "freca")
    team = WORLD["organizations"][entry["org"]]
    palette = {"primary": "#123456", "secondary": "#123456"}
    monkeypatch.setitem(team, "color", palette["primary"])
    monkeypatch.setitem(team, "brand_palette", palette)
    assert garage_catalog() == GARAGE


def test_palette_is_scoped_persistent_and_independent_of_livery(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    client = TestClient(app)
    original = {"primary": "#03172e", "secondary": "#d7ef09"}
    changed = {"primary": "#fdfdfd", "secondary": "#160b76", "accent": "#000000"}
    setup = dict(
        role="owner",
        org="team-mclaren-formula-1-team",
        series="f1",
        name="Проверка",
        seed=42,
    )
    a = client.post("/api/careers", json={**setup, "brand_palette": original}).json()
    b = client.post("/api/careers", json=setup).json()
    url = "/api/careers/" + a["id"]

    def organization(cid):
        return client.get("/api/world", params={"career": cid}).json()["organizations"][
            setup["org"]
        ]

    assert a["can_edit_palette"] and organization(a["id"])["brand_palette"] == original
    request = dict(
        command_id="brand-1",
        action="organization-palette",
        revision=a["revision"],
        brand_palette=changed,
    )
    assert (
        client.post(
            url + "/commands",
            json={**request, "brand_palette": {**changed, "primary": "url(x)"}},
        ).status_code
        == 422
    )
    paint = client.get(url + "/garage").json()["entries"]["f1-4"]["livery"]
    saved = client.post(url + "/commands", json=request).json()
    assert saved["brand_palette"] == changed and saved["revision"] == a["revision"] + 1
    assert (
        client.post(url + "/commands", json=request).json()["revision"]
        == saved["revision"]
    )
    assert client.get(url + "/garage").json()["entries"]["f1-4"]["livery"] == paint
    paint = deepcopy(paint)
    paint["colors"][0] = "#aa4477"
    assert client.post(
        url + "/commands",
        json=dict(
            command_id="paint-2",
            action="save-livery",
            revision=saved["revision"],
            paint=dict(entry="f1-4", livery=paint),
        ),
    ).is_success
    assert organization(a["id"])["brand_palette"] == changed
    assert (
        organization(b["id"])["brand_palette"]
        == SEASON_LINEUP["organizations"][setup["org"]]["brand_palette"]
    )
    archive = service.export_save(a["id"])
    restored = service.import_save(archive)
    assert (
        restored["brand_palette"] == changed and restored["liveries"]["f1-4"] == paint
    )
    assert (
        next(row for row in service.list_careers() if row["id"] == a["id"])[
            "brand_palette"
        ]
        == changed
    )
    assert not can_edit(
        dict(
            setup=setup,
            capital={"shares": {setup["org"]: {owner_wallet(setup["org"]): 5000}}},
        )
    )
    manager = client.post("/api/careers", json={**setup, "role": "manager"}).json()
    assert not manager["can_edit_palette"]
    assert (
        client.post(
            "/api/careers/" + manager["id"] + "/commands", json=request
        ).status_code
        == 403
    )
