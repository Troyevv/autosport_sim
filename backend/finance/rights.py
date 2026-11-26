"""Commercial inventory, placement evidence and historical display names."""

from collections import defaultdict
from math import cos, radians
from pydantic import Field
from ..domain import RuleError, occupant_on
from ..staff_input import Fields, Id
from ..livery import GARAGE
from . import market

CAR = {"flank", "upper", "nose", "sill", "shoulder", "wing"}
BASE_NAMES = {
    "team-aston-martin-aramco-f1-team": "Aston Martin F1 Team",
    "team-oracle-red-bull-racing": "Red Bull Racing",
    "team-mercedes-amg-petronas-f1-team": "Mercedes AMG F1 Team",
    "team-visa-cash-app-racing-bulls": "Racing Bulls",
    "team-bwt-alpine-f1-team": "Alpine F1 Team",
    "team-moneygram-haas-f1-team": "Haas F1 Team",
    "team-cadillac-hertz-team-jota": "Cadillac Team JOTA",
}


class Mount(Fields):
    contract: Id
    zone: market.ZONE
    x: int = Field(ge=0, le=100)
    scale: int = Field(ge=10, le=100)
    remove: bool = False


def assets(world):
    return {
        k: GARAGE["sponsors"].get(
            k, dict(name=b["name"], text=b["name"], zones=sorted(CAR), maxScale=1)
        )
        for k, b in market.participants(world).items()
    }


def entries(state, world, deal):
    return [
        eid
        for eid, e in world["entries"].items()
        if e["org"] == deal["org"]
        and e["championship"] == deal["series"]
        and (
            not deal.get("person")
            or any(
                world["assignments"][aid]["entry"] == eid
                and occupant_on(rows, state["date"]) == deal["person"]
                for aid, rows in state["seats"].items()
            )
        )
    ]


def catalog(state, world):
    day = state["date"]
    rows = state["market"]["contracts"].values()
    all_assets = assets(world)
    rights = defaultdict(set)
    zones = defaultdict(lambda: defaultdict(set))
    governed = defaultdict(set)
    for d in rows:
        for eid in entries(state, world, d):
            if eid not in GARAGE["entries"]:
                continue
            governed[eid].add(d["sponsor"])
            if market.active(d, day) and any(r["zone"] in CAR for r in d["rights"]):
                rights[eid].add(d["sponsor"])
                zones[eid][d["sponsor"]].update(
                    r["zone"] for r in d["rights"] if r["zone"] in CAR
                )
    return {
        **GARAGE,
        "sponsors": {**GARAGE["sponsors"], **all_assets},
        "entries": {
            eid: {
                **spec,
                "commercial_zones": {b: sorted(z) for b, z in zones[eid].items()},
                "allowed_assets": sorted(
                    (set(spec["allowed_assets"]) - governed[eid]) | rights[eid]
                ),
            }
            for eid, spec in GARAGE["entries"].items()
        },
    }


def start_rights(world, org, series, sponsor):
    measures = defaultdict(list)
    for eid, e in world["entries"].items():
        if e["org"] != org or e["championship"] != series:
            continue
        for d in GARAGE["entries"].get(eid, {}).get("livery", {}).get("decals", []):
            if d["asset"] == sponsor:
                measures[d["zone"]].append(d)
    # The photographed mark gives the historical zone and approximate size.
    return [
        market.Rights(
            zone=zone,
            share=max(10, int(min(d["scale"] for d in layers) * 85)),
            offset=0,
            priority=0,
            shared=True,
        )
        for zone, layers in measures.items()
    ]


def title_names(state, world, day):
    names = dict(BASE_NAMES)
    brands = market.participants(world)
    for d in state["market"]["contracts"].values():
        if d["role"] != "title" or not d["start"] <= day < min(
            d.get("ended", d["end"]), d["end"]
        ):
            continue
        org = d["org"]
        original = world["organizations"][org]["name"]
        brand = brands[d["sponsor"]]["name"]
        names[org] = (
            original
            if brand.casefold() in original.casefold()
            else names.get(org, original) + " " + brand
        )
    return names


def collision(state, world, t):
    for requested in t.rights:
        occupied = []
        for deal in state["market"]["contracts"].values():
            if (
                deal["org"] != t.org
                or deal["status"] != "signed"
                or deal["end"] <= t.start
                or t.end <= deal["start"]
            ):
                continue
            if requested.zone in CAR and (
                deal["series"] != t.series
                or (t.person and deal["person"] and t.person != deal["person"])
            ):
                continue
            occupied.extend(r for r in deal["rights"] if r["zone"] == requested.zone)
        if (
            any(
                not (requested.shared and r["shared"])
                and requested.offset < r.get("offset", 0) + r["share"]
                and r.get("offset", 0) < requested.offset + requested.share
                for r in occupied
            )
            or sum(r["share"] for r in occupied) + requested.share > 100
        ):
            return "Рекламная зона занята. Измените позицию, размер или условия совместного размещения."


def correct(layer, r, paint):
    if r.get("color") and paint.get("colors", [""])[0].lower() != r["color"].lower():
        return False
    if layer["zone"] != r["zone"]:
        return False
    # Effective projected horizontal width after rotation and clipping at the zone boundary.
    width = 100 * layer["scale"] * abs(cos(radians(layer.get("angle", 0))))
    x = 100 * layer["x"]
    left = max(0, x - width / 2)
    right = min(100, x + width / 2)
    offset = r.get("offset", 0)
    return right - left + 1e-6 >= r["share"] and (
        not offset or left <= offset + 1 and right >= offset + r["share"] - 1
    )


def audit(state, world, deal, only_entry=None):
    if not market.active(deal, state["date"]):
        return []
    result = []
    for r in deal["rights"]:
        if r["zone"] in CAR:
            for eid in [only_entry] if only_entry else entries(state, world, deal):
                paint = state.get("liveries", {}).get(
                    eid, GARAGE["entries"].get(eid, {}).get("livery", {})
                )
                layers = paint.get("decals", [])
                matches = [
                    (i, d)
                    for i, d in enumerate(layers)
                    if d["asset"] == deal["sponsor"] and correct(d, r, paint)
                ]
                ok = any(
                    i >= r.get("priority", 0)
                    and not any(
                        upper["zone"] == r["zone"]
                        and abs(upper["x"] - d["x"]) < (upper["scale"] + d["scale"]) / 4
                        and abs(upper["y"] - d["y"]) < 0.15
                        for upper in layers[i + 1 :]
                    )
                    for i, d in matches
                )
                result.append(dict(**r, entry=eid, fulfilled=ok))
        else:
            layer = state["market"].get("mounts", {}).get(deal["id"], {}).get(r["zone"])
            result.append(
                dict(**r, entry=None, fulfilled=bool(layer and correct(layer, r, {})))
            )
    return result


def mount(state, world, args, *, org=None):
    order = Mount.model_validate(args)
    d = state["market"]["contracts"].get(order.contract)
    if (
        not d
        or d["org"] != (org or state["setup"]["org"])
        or not market.active(d, state["date"])
    ):
        raise RuleError("Размещение доступно действующей команде рекламодателя.", 403)
    if order.zone in CAR or not any(r["zone"] == order.zone for r in d["rights"]):
        raise RuleError(
            "Проверьте рекламную поверхность. Для машины используйте редактор ливреи."
        )
    surfaces = state["market"].setdefault("mounts", {}).setdefault(d["id"], {})
    if order.remove:
        surfaces.pop(order.zone, None)
    else:
        for key, rows in state["market"]["mounts"].items():
            other = state["market"]["contracts"][key]
            if (
                key == d["id"]
                or other["org"] != d["org"]
                or not market.active(other, state["date"])
            ):
                continue
            layer = rows.get(order.zone)
            if (
                layer
                and abs(layer["x"] - order.x / 100)
                < (layer["scale"] + order.scale / 100) / 2
            ):
                raise RuleError("Выбранное место перекрывает установленный знак.")
        surfaces[order.zone] = dict(
            asset=d["sponsor"],
            zone=order.zone,
            x=order.x / 100,
            scale=order.scale / 100,
            date=state["date"],
        )


def projection(state, world):
    org = state["setup"]["org"]
    return [
        dict(
            contract=d["id"],
            sponsor=d["sponsor"],
            org=d["org"],
            end=d["end"],
            items=audit(state, world, d),
            mounts=state["market"].get("mounts", {}).get(d["id"], {}),
        )
        for d in state["market"]["contracts"].values()
        if org in (d["org"], d["sponsor"]) and market.active(d, state["date"])
    ]


def release_payment(state, term):
    """First agreed advance is unconditional. Other fixed tranches require observed placement."""
    deal = state.get("market", {}).get("contracts", {}).get(term["contract"])
    if (
        not deal
        or term["id"].startswith(deal["id"] + ":bonus:")
        or not deal["rights"]
        or (deal["advance_cents"] and term["id"] == deal["id"] + ":0")
    ):
        return True
    from ..catalog import WORLD

    if not market.active(deal, state["date"]):
        term.update(status="cancelled", cancelled=state["date"])
        return False
    checks = audit(state, WORLD, deal)
    passed = bool(checks) and all(r["fulfilled"] for r in checks)
    if not passed:
        if "withheld" not in term:
            term["withheld"] = state["date"]
            if deal["org"] == state["setup"]["org"]:
                state["notices"].append(
                    dict(
                        date=state["date"],
                        text="Выплата приостановлена: проверьте размещение рекламы.",
                    )
                )
        return False
    term.pop("withheld", None)
    return True
