"""Organization colours for presentation. Livery presets and career physics are independent."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$", to_lower=True)]


class BrandPalette(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    primary: HexColor
    secondary: HexColor
    accent: HexColor | None = None


def catalog_palette(colours):
    primary, secondary = colours
    return BrandPalette(primary="#" + primary, secondary="#" + secondary).model_dump(
        exclude_none=True
    )


def effective(state, organization):
    return state.get("organization_palettes", {}).get(
        organization["id"], organization["brand_palette"]
    )


def can_edit(state):
    from .finance.capital import owner_wallet

    org = state["setup"]["org"]
    shares = state.get("capital", {}).get("shares", {}).get(org, {})
    return (
        state["setup"]["role"] in ("owner", "manufacturer")
        and shares.get(owner_wallet(org), 0) > 5000
    )


def update(state, values):
    from .domain import RuleError

    if not can_edit(state):
        raise RuleError(
            "Фирменную палитру меняет руководитель с контрольным пакетом.", 403
        )
    palette = BrandPalette.model_validate(values).model_dump(exclude_none=True)
    state.setdefault("organization_palettes", {})[state["setup"]["org"]] = palette


def world_view(world, state):
    overrides = state.get("organization_palettes")
    if not overrides:
        return world
    organizations = world["organizations"].copy()
    for key, palette in overrides.items():
        organizations[key] = dict(
            organizations[key], brand_palette=palette, color=palette["primary"]
        )
    return dict(world, organizations=organizations)
