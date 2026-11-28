from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..catalog import SEASON_LINEUP
from .layouts import VERSION, event_layout, geometry_snapshot

router = APIRouter(prefix="/api/race")
EVENTS = {e["id"]: e for e in SEASON_LINEUP["events"] if event_layout(e)}


@router.get("/events/{event_id}/geometry")
def geometry(
    event_id: str,
    samples: int = Query(default=512, ge=32, le=8192),
    vehicle_class: Literal["formula", "junior", "gt", "prototype", "kart"]
    | None = None,
):
    event = EVENTS.get(event_id)
    if event is None:
        raise HTTPException(404, "Гоночная конфигурация события не найдена")
    series = event["series"]
    default = {
        "f1": "formula",
        "dtm": "gt",
        "wec": "prototype",
        "kart-ok": "kart",
        "kart-okj": "kart",
    }.get(series, "junior")
    return geometry_snapshot(
        event_layout(event), VERSION, series, vehicle_class or default, samples
    )
