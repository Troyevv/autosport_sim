"""Season-pinned paint designs and the independent, portable livery command."""

import csv
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .domain import RuleError

DATA = Path(__file__).with_name("data") / "garage" / "2025-v1"
Color = Annotated[str, Field(pattern=r"^#[a-fA-F0-9]{6}$")]
Unit = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Decal(StrictModel):
    asset: str = Field(max_length=40)
    zone: Literal["flank", "upper", "nose", "sill", "shoulder", "wing"]
    x: Unit
    y: Unit
    scale: float = Field(ge=0.1, le=1, allow_inf_nan=False)
    angle: float = Field(ge=-180, le=180, allow_inf_nan=False)


class Livery(StrictModel):
    version: Literal[1]
    template: str = Field(max_length=64)
    colors: list[Color] = Field(min_length=3, max_length=3)
    pattern: str = Field(max_length=40)
    number: str = Field(pattern=r"^[0-9]{1,3}$")
    decals: list[Decal] = Field(max_length=16)


class PaintOrder(StrictModel):
    entry: str = Field(max_length=48)
    livery: Livery


def garage_catalog():
    designs = json.loads((DATA / "designs.json").read_text(encoding="utf-8"))
    rows = []
    for grid in (DATA / "grid.csv", DATA.parents[1] / "2025-v4/junior-garage-grid.csv"):
        with grid.open(encoding="utf-8", newline="") as file:
            rows.extend(csv.DictReader(file))
    marks = json.loads((DATA / "decals.json").read_text(encoding="utf-8"))
    entries = {}
    for row in rows:
        layers = marks.get(row["entry"], [])
        entries[row["entry"]] = dict(
            geometry=row["geometry"],
            allowed_assets=sorted(
                {"axis", "bars", "relay"} | {layer[0] for layer in layers}
            ),
            livery=dict(
                version=1,
                template=row["template"],
                pattern=row["pattern"],
                colors=row["colors"].split(),
                number=row["number"],
                decals=[
                    dict(asset=a, zone=z, x=x, y=y, scale=s, angle=t)
                    for a, z, x, y, s, t in layers
                ],
            ),
        )
    return dict(version="2025-v4", entries=entries, **designs)


GARAGE = garage_catalog()


def install(state, world, order):
    entry = world["entries"].get(order["entry"])
    if (
        not entry
        or order["entry"] not in GARAGE["entries"]
        or entry["org"] != state["setup"]["org"]
        or state["setup"]["role"] == "manufacturer"
    ):
        raise RuleError("Ливрея доступна для сохранения только в своей команде.", 403)
    paint = order["livery"]
    base = GARAGE["entries"][entry["id"]]["livery"]
    if (
        paint["template"] != base["template"]
        or paint["pattern"] not in GARAGE["patterns"]
    ):
        raise RuleError("Шаблон или рисунок ливреи недоступен.")
    current_catalog = GARAGE
    if "market" in state:
        from .finance.rights import catalog

        current_catalog = catalog(state, world)
    for decal in paint["decals"]:
        rule = current_catalog["sponsors"].get(decal["asset"])
        if (
            decal["asset"]
            not in current_catalog["entries"][entry["id"]]["allowed_assets"]
            or decal["zone"]
            not in current_catalog["entries"][entry["id"]]
            .get("commercial_zones", {})
            .get(decal["asset"], rule["zones"] if rule else [])
            or not rule
            or decal["zone"] not in rule["zones"]
            or decal["scale"] > rule["maxScale"]
        ):
            raise RuleError("Положение или размер знака нарушает условия размещения.")
    state.setdefault("liveries", {})[entry["id"]] = paint
