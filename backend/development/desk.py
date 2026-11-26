"""Management projection. Private drawing parameters and latent faults stay in the registry."""

from math import ceil

from .. import components
from ..components.design import LABELS
from ..domain import RuleError, occupant_on
from ..finance import facilities
from ..research import admitted
from ..research.model import METHODS, queue_position
from . import restriction, versions
from .physics import TESTS, methods


def projection(state, world):
    org, role = state["setup"]["org"], state["setup"]["role"]
    today = state["date"]
    if (
        occupant_on(state["seats"].get(org + ":" + role, []), today)
        != state["player_id"]
    ):
        raise RuleError("Требуется действующее назначение.", 403)
    entries, staff = [], {}
    for e in world["entries"].values():
        if e["org"] != org:
            continue
        people = components.specialists(state, world, e)
        staff.update(
            {pid: state["people"][pid]["name"] for pid in people.values() if pid}
        )
        config = state["car_configurations"][e["car"]]
        axes = []
        for axis, iid in components.mounting(state, e["id"]).items():
            role_id, _, _, hours, price = METHODS[axis]
            axes.append(
                dict(
                    id=axis,
                    label=LABELS[axis],
                    blocked=restriction(state, world, e, axis),
                    lead=people.get(role_id),
                    methods=methods(axis),
                    hours=hours + 24,
                    price=price * 3,
                    fitted=components.spec(state, iid)["id"],
                    versions=[
                        dict(
                            id=d["id"],
                            version=d["version"],
                            title=d["title"],
                            maker=world["organizations"]
                            .get(d["manufacturer"], {})
                            .get("name", world["cars"][e["car"]]["constructor"]),
                        )
                        for d in versions(state, e["id"], axis)
                    ],
                )
            )
        entries.append(
            dict(
                id=e["id"],
                title=f"№{e['number']} · {world['cars'][e['car']]['name']}",
                atr_applicable=e["championship"] == "f1",
                admitted=bool(admitted(state, e)),
                axes=axes,
                **config,
            )
        )
    tomorrow = facilities.later(today, 1)
    capacity = {}
    for kind in ("design", "cfd", "tunnel", "bench"):
        assets = [a for a in state["estate"]["assets"].values() if a["kind"] == kind]
        shared = state["estate"]["assets"]["shared:" + kind]
        capacity[kind] = dict(
            label=facilities.TYPES[kind][0],
            slots=sum(
                max(0, facilities.free(state, a, today, tomorrow, buyer=org))
                for a in assets
            ),
            owned=sum(
                a["level"]
                for a in assets
                if a["owner"] == org and a["status"] == "active"
            ),
            used=sum(
                b["units"]
                for b in state["estate"]["bookings"].values()
                if b["org"] == org
                and b["mode"] == "use"
                and b["start"] <= today < b["end"]
                and state["estate"]["assets"][b["facility"]]["kind"] == kind
            ),
            rent=facilities.quote(kind, shared["country"])["daily_cents"],
            free=facilities.free(state, shared, today, facilities.later(today, 7)),
            condition=shared["condition"],
        )
    projects = []
    data = state["development"]
    for p in sorted(
        data["projects"].values(),
        key=queue_position,
    ):
        if p["org"] != org:
            continue
        row = {
            k: p[k]
            for k in (
                "id",
                "kind",
                "axis",
                "entry",
                "program",
                "concept",
                "regulation",
                "lead",
                "priority",
                "brief",
                "method",
                "candidate",
                "baseline",
                "specification",
                "started",
                "commissioned",
                "finished",
                "cost_cents",
                "evidence",
                "participants",
                "worked",
                "required",
                "status",
                "reason",
                "forecast",
                "package_forecast",
                "test_inputs",
                "findings",
                "disposition",
                "report",
                "site_kind",
            )
            if k in p
        }
        rate = p["worked"] / p["days"] if p["days"] else 24
        projects.append(
            dict(
                **row,
                remaining_days=ceil((p["required"] - p["worked"]) / rate),
                paid=p["id"] in state["control"]["projects"],
                grants=[
                    facilities.grant(state, key).model_dump() for key in p["grants"]
                ],
                decisions=[
                    event for event in data["history"] if event["project"] == p["id"]
                ],
            )
        )
    return dict(
        entries=entries,
        projects=projects,
        staff=staff,
        capacity=capacity,
        spent_cents=sum(p["cost_cents"] for p in projects if p["paid"]),
        rent_cents=sum(
            b["cost_cents"]
            for b in state["estate"]["bookings"].values()
            if b["org"] == org
            and b["mode"] in ("lease", "outsource")
            and state["estate"]["assets"][b["facility"]]["kind"] in capacity
        ),
        tests={
            k: dict(label=v[0], site=v[1], cost=v[2], atr=v[3])
            for k, v in TESTS.items()
        },
    )
