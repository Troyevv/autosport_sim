"""Read-only artwork shipped with the application. No archive or network input."""

import json
from pathlib import Path
from .domain import RuleError

ROOT = Path(__file__).with_name("art")
ASSETS = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
for asset in ASSETS:
    if asset["kind"] in {"uniform", "generated-head"}:
        asset.update(
            author="Autosport Sim / OpenAI ImageGen",
            license="MIT",
            changes="Студийная обработка R3.2",
            source="https://github.com/Troyevv/autosport_sim",
        )
BY_ID = {(asset["kind"], asset["entity"]): asset for asset in ASSETS}


def index():
    return ASSETS


def get(kind, entity):
    asset = BY_ID.get((kind, entity))
    if asset is None:
        raise RuleError("Изображение отсутствует.", 404)
    return asset, (ROOT / asset["path"]).read_bytes()
