"""Judgements over published nominal drawings and authorized A/B protocols."""

from .. import components
from ..components.catalog import OPENING
from ..components.registry import drawing_for
from ..development.physics import TRADE


def protocols(state, entry, baseline, candidate):
    assembly = {
        axis: components.spec(state, iid)["id"]
        for axis, iid in components.mounting(state, entry["id"]).items()
    }
    config = state["car_configurations"][entry["car"]]
    return sorted(
        (
            p
            for p in state["development"]["projects"].values()
            if p["org"] == entry["org"]
            and p.get("report")
            and p["baseline"] == baseline
            and p.get("candidate") == candidate
            and p["regulation"] == config["regulation"]
            and p["concept"] == config["concept"]
            and all(
                assembly.get(k) == v for k, v in p["assembly"].items() if k != p["axis"]
            )
        ),
        key=lambda p: (p["finished"], p["id"]),
    )


def verdict(reports, axis):
    primary, sign, _, _ = TRADE[axis]
    gains, losses = [], []
    for p in reports:
        r = p["report"]
        if r["detected"]:
            return "withdraw"
        direction = {
            primary: sign,
            "mass_kg": -1,
            "drag_area_m2": -1,
            "sustainable_wheel_kw": 1,
            "thermal_margin_kw": 1,
            "brake_force_n": 1,
        }.get(r["metric"])
        if direction is None:
            continue
        delta = direction * r["difference"]
        if delta < -r["uncertainty"]:
            losses.append(p)
        if delta > r["uncertainty"] and (
            r["metric"] == primary or p["method"] == "calculation"
        ):
            gains.append(p)
    if gains and losses:
        return "conflict"
    return "release" if gains else "withdraw" if losses else "uncertain"


def preferred(state, world, entry, fitted):
    """Keep installed hardware until a directly comparable protocol supports a change."""
    from .. import development

    org = entry["org"]
    source = state["development"]["projects"].get(fitted.get("reference"), {})
    if source.get("disposition") == "withdrawn" or source.get("findings"):
        base = drawing_for(state, source["baseline"])
        while base["id"] not in OPENING.specs and not development.released(
            state, org, base["id"]
        ):
            base = drawing_for(state, base["parent"])
        if components.compatible(state, world, entry, base):
            return base
    for project in sorted(
        (
            p
            for p in state["development"]["projects"].values()
            if p.get("disposition") == "released"
            and p["baseline"] == fitted["id"]
            and p["org"] == org
        ),
        key=lambda p: p["id"],
    ):
        candidate = project["specification"]
        if (
            not project["findings"]
            and verdict(
                protocols(state, entry, fitted["id"], candidate), fitted["slot"]
            )
            == "release"
        ):
            drawing = drawing_for(state, candidate)
            if components.compatible(state, world, entry, drawing):
                return drawing
    return fitted


def replacement_due(state, iid):
    """The workshop sees mileage, wear and signed rejection, not the simulated design life of a prototype."""
    drawing = components.spec(state, iid)
    nominal_life = OPENING.specs[drawing["family"] + "/1"]["life_m"]
    condition = components.condition(state, iid)
    return (
        condition["damaged"]
        or condition["wear_ppm"] >= 750000
        or condition["distance_m"] * 4 >= nominal_life * 3
        or state["production"]["items"].get(iid, {}).get("rejected", False)
    )
