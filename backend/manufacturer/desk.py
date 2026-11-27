"""One office projection. Internal documents stay with their engineering owner."""

from .. import components, programme, production
from ..components.catalog import parts_for
from ..council import access
from ..development.physics import estimate
from . import eligible_stock
from ..supplier_engineering import (
    ROLES,
    agreement,
    equal_supply,
    person,
    engineering_entry,
    restriction,
    supplier_baseline,
)
from .operating import CASES, operating_point
from .profile import parameters, TARGETS
from .support import diagnosis, proposal, evidence


def projection(state, world):
    org = access(state)
    maker = state["setup"]["role"] == "manufacturer"
    office = state["manufacturer"]
    clients = []
    catalog = {}
    for e in world["entries"].values():
        if not maker and e["org"] != org:
            continue
        for axis in ROLES:
            terms = agreement(state, world, e, axis)
            if axis not in parts_for(state).installed[e["id"]]:
                continue
            start = supplier_baseline(e["id"], org, axis, state) if maker else None
            if (
                maker
                and start
                and start not in catalog
                and (
                    parts_for(state).specs[
                        parts_for(state).stock[
                            parts_for(state).installed[e["id"]][axis]
                        ]["spec"]
                    ]["manufacturer"]
                    == org
                    or terms
                    and terms["maker"] == org
                )
            ):
                y = int(state["date"][:4])
                ctx = engineering_entry(state, world, e["id"], org, axis)
                editions = []
                for d in [
                    parts_for(state).specs[start],
                    *(
                        d
                        for d in state["components"]["revisions"].values()
                        if d["family"] == parts_for(state).specs[start]["family"]
                    ),
                ]:
                    p = state["development"]["projects"].get(d.get("reference"), {})
                    editions.append(
                        dict(
                            id=d["id"],
                            version=d["version"],
                            title=d["title"],
                            status=p.get("disposition", "opening"),
                            values=parameters(
                                axis,
                                estimate(state, d),
                                parts_for(state).specs[start]["life_m"],
                            ),
                            forecast=p.get("forecast"),
                            calculations=[
                                dict(
                                    label=values[0],
                                    results=operating_point(
                                        axis,
                                        estimate(state, d),
                                        parts_for(state).specs[start]["life_m"],
                                        case,
                                    ),
                                )
                                for case, values in CASES.items()
                                if axis == "tyre" or case != "wet"
                            ],
                        )
                    )
                catalog[start] = dict(
                    entry=e["id"],
                    axis=axis,
                    title=world["cars"][e["car"]]["name"],
                    series=e["championship"],
                    editions=editions,
                    years={
                        year: restriction(state, world, ctx, axis, year, False)
                        for year in (y, y + 1)
                    },
                )
            if not terms or maker and terms["maker"] != org:
                continue
            shareable = []
            if not maker and state["council"]["observations"]:
                iid = components.mounting(state, e["id"])[axis]
                scope = dict(
                    entry=e["id"],
                    axis=axis,
                    instance=iid,
                    specification=components.spec(state, iid)["id"],
                    supplier=terms["maker"],
                    contract=terms["id"],
                    client=e["org"],
                )
                shareable = [
                    dict(reference=f["reference"], label=f["observation"], day=f["day"])
                    for f in evidence(state, world, scope)
                ]
            clients.append(
                dict(
                    entry=e["id"],
                    org=e["org"],
                    name=world["organizations"][e["org"]]["name"],
                    series=e["championship"],
                    car=world["cars"][e["car"]]["name"],
                    axis=axis,
                    terms=terms,
                    shareable=shareable,
                    equal=equal_supply(world, e, axis),
                    stock=eligible_stock(state, world, org, e, axis) if maker else [],
                )
            )
    cases = []
    for r in reversed(list(office["cases"].values())):
        if org not in (r["supplier"], r["client"]):
            continue
        row = dict(r)
        if maker:
            row["diagnosis"] = diagnosis(state, world, r)
            brief = state["council"]["briefs"].get(r.get("proposal"))
            if not brief and r["status"] == "open":
                brief = proposal(state, world, r, row["diagnosis"])
            row["positions"] = [
                dict(
                    name=state["people"][p["person"]]["name"],
                    argument=p["argument"],
                    stance=p["stance"],
                )
                for p in (brief or {}).get("positions", [])
            ]
        else:
            row.pop("grounds", None)
        cases.append(row)
    projects = []
    for subsystem in ("research", "development", "production"):
        pool = "batches" if subsystem == "production" else "projects"
        for p in state[subsystem][pool].values():
            if p["org"] != org or not maker:
                continue
            projects.append(
                dict(
                    id=p["id"],
                    action=p.get("kind", subsystem),
                    year=programme.work_year(state, p),
                    axis=p.get("axis")
                    or components.registry.drawing_for(state, p["specification"])[
                        "slot"
                    ],
                    entry=p["entry"],
                    status=p["status"],
                    reason=p["reason"],
                    lead=state["people"].get(p.get("lead"), {}).get("name"),
                    cost=p["cost_cents"],
                    worked=p["worked"],
                    required=p["required"],
                    report=p.get("report"),
                    conclusion=state["research"]["reports"]
                    .get("report-" + p["id"], {})
                    .get("conclusion"),
                    disposition=p.get("disposition"),
                    specification=p.get("specification"),
                )
            )
    advisor = person(state, org, "technical-advisor") if maker else None
    return dict(
        inventory=[
            dict(
                id=iid,
                serial=components.serial(iid),
                axis=drawing["slot"],
                title=drawing["title"],
                version=drawing["version"],
                specification=drawing["id"],
                status=item["status"],
                rejected=item["rejected"],
                checks=item["checks"],
                reason=item["reason"],
                decisions=production.actions(state, iid, item["status"]),
            )
            for iid in production.inventory(state, org)
            if maker and (item := state["production"]["items"].get(iid))
            and (drawing := components.spec(state, iid))
        ],
        catalog=list(catalog.values()),
        clients=clients,
        cases=cases,
        projects=projects[::-1],
        targets={k: list(v) for k, v in TARGETS.items()},
        allocation=programme.policy(state, org),
        advisor=dict(
            name=state["people"][advisor]["name"], seat=org + ":technical-advisor"
        )
        if advisor
        else None,
        assignments=[
            dict(
                name=state["people"][a["advisor"]]["name"],
                client=a["client"],
                product=a["product"],
                start=a["start"],
                end=a["end"],
                channels=a["channels"],
                load=a["allocation_percent"],
            )
            for a in state["support"]
            if org in (a["employer"], a["client"])
        ],
        history=[
            r
            for r in reversed(list(office["deliveries"].values()))
            if org in (r["client"], r["supplier"])
        ],
        review=office["reviews"].get(org),
    )
