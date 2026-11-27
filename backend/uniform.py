"""Career wardrobe and live clothing inventory. Appearance belongs to the person."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .domain import RuleError
from .finance import market, rights

Category = Literal["driver", "engineering", "executive", "mechanic", "staff", "advisor"]
Swatch = Literal["primary", "secondary", "accent"]


class Pattern(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    design: Literal["panels", "chevron", "shoulders"] = "panels"
    base: Swatch = "primary"
    insert: Swatch = "secondary"
    piping: Swatch = "accent"
    badge: Literal["left", "right", "center", "none"] = "left"


class Placement(rights.Mount):
    zone: Literal["suit", "uniform"]


class UniformOrder(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    patterns: dict[Category, Pattern] = Field(max_length=6)
    placements: list[Placement] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def distinct_mounts(self):
        if len({(p.contract, p.zone) for p in self.placements}) != len(self.placements):
            raise ValueError("Повторное изменение одного размещения.")
        return self


def inventory(state, world):
    from .media import BY_ID
    from .livery import GARAGE

    rows = []
    market_state = state.get("market", {})
    brands = market.participants(world)
    for deal in market_state.get("contracts", {}).values():
        if not market.active(deal, state["date"]):
            continue
        for right in deal["rights"]:
            zone = right["zone"]
            if zone not in ("suit", "uniform"):
                continue
            sponsor = deal["sponsor"]
            image = GARAGE["sponsors"].get(sponsor, {}).get("image")
            if ("logo", sponsor) in BY_ID:
                image = "/api/media/logo/" + sponsor
            elif image and image.startswith("marks/"):
                image = "/assets/garage/2025-v1/" + image
            else:
                image = None
            rows.append(
                dict(
                    contract=deal["id"],
                    org=deal["org"],
                    person=deal.get("person"),
                    series=deal.get("program_series") or [deal["series"]],
                    entrant=deal.get("entrant"),
                    entries=deal.get("car_entries") or [],
                    sponsor=sponsor,
                    name=brands[sponsor]["name"],
                    right=right,
                    image=image,
                    mount=market_state.get("mounts", {}).get(deal["id"], {}).get(zone),
                )
            )
    return rows


def can_edit(state):
    from .branding import can_edit as controls_organization

    return state["setup"]["role"] == "manager" or controls_organization(state)


def update(state, world, values):
    if not can_edit(state):
        raise RuleError("Для изменения формы требуется руководство организацией.", 403)
    order = UniformOrder.model_validate(values)
    org = state["setup"]["org"]
    for p in order.placements:
        if p.remove:
            rights.mount(state, world, p.model_dump())
    for p in order.placements:
        if p.remove:
            continue
        deal = state.get("market", {}).get("contracts", {}).get(p.contract, {})
        layer = dict(zone=p.zone, x=p.x / 100, scale=p.scale / 100)
        if not any(rights.correct(layer, r, {}) for r in deal.get("rights", [])):
            raise RuleError(
                "Положение и размер знака должны соответствовать проданной площади."
            )
        rights.mount(state, world, p.model_dump())
    patterns = {
        key: spec.model_dump()
        for key, spec in order.patterns.items()
        if spec != Pattern()
    }
    wardrobes = state.setdefault("organization_uniforms", {})
    if patterns:
        wardrobes[org] = patterns
    else:
        wardrobes.pop(org, None)
