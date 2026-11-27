from copy import deepcopy

import pytest

from . import domain, service, uniform
from .catalog import SEASON_LINEUP
from .media import BY_ID


def test_uniform_is_replayed_and_palette_and_livery_are_independent(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    c = service.create(
        service.CareerInput(
            org="team-mclaren-formula-1-team",
            role="owner",
            name="Форма",
            seed=194,
            series="f1",
        )
    )

    def change(action, **fields):
        nonlocal c
        c = service.execute(
            c["id"],
            service.Command(
                action=action,
                revision=c["revision"],
                command_id=f"uniform-{c['revision']}",
                **fields,
            ),
        )

    before = deepcopy(c["liveries"])
    pattern = uniform.Pattern(
        design="chevron", base="secondary", badge="right"
    ).model_dump()
    change("organization-uniform", uniform={"patterns": {"mechanic": pattern}})
    change(
        "organization-palette",
        brand_palette={
            "primary": "#ffffff",
            "secondary": "#010203",
            "accent": "#01cc80",
        },
    )
    assert c["organization_uniforms"] == {c["org"]: {"mechanic": pattern}}
    restored = service.import_save(service.export_save(c["id"]))
    assert restored["organization_uniforms"] == c["organization_uniforms"]
    assert (
        restored["liveries"] == before
        and restored["brand_palette"] == c["brand_palette"]
    )
    change("organization-uniform", uniform={"patterns": {}})
    assert c["org"] not in c["organization_uniforms"]
    assert c["brand_palette"] == restored["brand_palette"]


def test_clothing_uses_active_permitted_surface_and_real_advertising_mount():
    from .finance.rights import audit
    from .uniform import inventory, update

    world = SEASON_LINEUP
    org = "team-mclaren-formula-1-team"
    deal = dict(
        id="contract-1",
        org=org,
        series="f1",
        program_series=["f1"],
        status="signed",
        start="2025-02-01",
        end="2025-03-01",
        sponsor="hp",
        person="driver-033",
        rights=[dict(zone="suit", offset=30, share=20, priority=0, shared=True)],
    )
    state = dict(
        setup=dict(org=org, role="manager"),
        date="2025-02-10",
        market=dict(contracts={deal["id"]: deal}),
    )
    order = dict(contract=deal["id"], zone="suit", x=40, scale=20)
    assert inventory(state, world)[0]["mount"] is None
    for invalid in [dict(order, zone="uniform"), dict(order, x=80)]:
        with pytest.raises(domain.RuleError):
            update(state, world, dict(patterns={}, placements=[invalid]))
    update(state, world, dict(patterns={}, placements=[order]))
    (right,) = inventory(state, world)
    assert right["image"] and right["person"] == "driver-033"
    assert right["mount"]["x"] == 0.4 and audit(state, world, deal)[0]["fulfilled"]
    state["date"] = deal["end"]
    assert inventory(state, world) == []
    with pytest.raises(domain.RuleError):
        update(state, world, dict(patterns={}, placements=[order]))


def test_all_logo_files_are_catalogued():
    from .media import ROOT

    files = {asset["path"] for (kind, _), asset in BY_ID.items() if kind == "logo"}
    assert {str(p.relative_to(ROOT)) for p in (ROOT / "logos").glob("*.png")} == files
