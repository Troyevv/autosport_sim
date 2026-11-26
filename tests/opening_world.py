"""Audit a fresh installation and advance one career through its first supply settlement."""

import argparse
from collections import Counter
import json
import os
from tempfile import TemporaryDirectory

from backend import components, domain, service, storage
from backend.catalog import SEASON_LINEUP as world
from backend.components.catalog import parts_for
from backend.finance import facilities
from backend.livery import GARAGE

CASES = {
    "manager": ("team-mclaren-formula-1-team", "f1", 42),
    "owner": ("team-af-corse", "wec", 71),
    "manufacturer": ("supplier-sadev", "f4-es", 123),
}


def audit(s):
    parts = parts_for(s)
    teams = world["organizations"]
    assert set(teams) == set(s["accounts"])
    assert len(world["championships"]) == 11
    assets = list(s["estate"]["assets"].values())
    for oid in teams:
        owned = [a for a in assets if a["owner"] == oid]
        assert {"hq", "warehouse"} <= {a["kind"] for a in owned}, oid
        assert all(facilities.capacity(s, a) > 0 for a in owned), oid
        assert s["accounts"][oid]["cash_cents"] > 0
    assert all(
        s["seats"][aid] for aid, a in world["assignments"].items() if a["person"]
    )
    contracts = s["market"]["supplies"]
    by_entry = {}
    for key, d in contracts.items():
        for eid in d["entries"]:
            assert (eid, d["product"]) not in by_entry
            by_entry[eid, d["product"]] = d
        payments = [
            i["amount_cents"]
            for i in s["finance"]["instalments"].values()
            if i["contract"] == key
        ]
        assert sum(payments) == d["sale_cents"]
        if d["partnership"] == "works":
            assert not payments
    series = {}
    installed = set()
    for champ in world["championships"]:
        entries = [e for e in world["entries"].values() if e["championship"] == champ]
        orgs = {e["org"] for e in entries}
        makers = set()
        for e in entries:
            for axis, oid in world["cars"][e["car"]]["suppliers"].items():
                assert by_entry[e["id"], axis]["sponsor"] == oid
                makers.add(oid)
            for axis, iid in parts.installed[e["id"]].items():
                assert iid not in installed
                installed.add(iid)
                assert components.compatible(s, world, e, components.spec(s, iid)), (
                    e["id"],
                    axis,
                )
        series[champ] = dict(
            entries=len(entries),
            teams=len(orgs),
            makers=len(makers),
            facilities=sum(a["owner"] in orgs | makers for a in assets),
            contracts=sum(c["series"] == champ for c in contracts.values()),
            liveries=sum(e["id"] in GARAGE["entries"] for e in entries),
        )
    return dict(
        series=series,
        organizations=Counter(o["kind"] for o in teams.values()),
        assets=len(assets),
        people=len(s["people"]),
        seats=sum(bool(x) for x in s["seats"].values()),
        collectives=len(s["collectives"]),
        academies=len(s["academies"]),
        accounts=len(s["accounts"]),
        sponsorships=len(s["market"]["contracts"]),
        supplies=len(contracts),
        instalments=len(s["finance"]["instalments"]),
        works=sum(x["partnership"] == "works" for x in contracts.values()),
        assignments=len(s["support"]),
        homologations=len(s["market"]["homologations"]),
        bookings=len(s["estate"]["bookings"]),
        relationships=len(s["relationships"]),
        programmes=len(world["programs"]),
        drawings=len(parts.specs),
        installed=len(installed),
        serials=len(parts.stock) + len(s["components"]["inventory"]),
        supplier_stock=len(s["components"]["inventory"]),
    )


def run(role, until):
    oid, series, seed = CASES[role]
    c = service.create(
        service.CareerInput(name="Аудит", org=oid, role=role, series=series, seed=seed)
    )
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    print(json.dumps(audit(s), ensure_ascii=False), flush=True)

    def step(c):
        return service.execute(
            c["id"],
            service.Command(
                command_id="step-" + str(c["revision"]),
                revision=c["revision"],
                action=c["briefing_action"] if c["pending"] else "advance",
            ),
        )

    c = step(c)
    archive = service.export_save(c["id"])
    restored = service.import_save(archive)
    assert service.export_save(restored["id"])["sha256"] == archive["sha256"]
    assert service.load(c["id"])["revision"] == c["revision"]
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
    while s["date"] < until:
        domain.apply(s, world, domain.BRIEFINGS[role] if s["pending"] else "advance")
    print(
        json.dumps(
            dict(
                role=role,
                seed=seed,
                date=s["date"],
                commands=s["revision"],
                cash_eur=sum(a["cash_cents"] for a in s["accounts"].values()) // 100,
                lowest_cash_eur=min(a["cash_cents"] for a in s["accounts"].values())
                // 100,
                instalments=Counter(
                    i.get("status") for i in s["finance"]["instalments"].values()
                ),
                negative_cash=sum(a["cash_cents"] < 0 for a in s["accounts"].values()),
                postings=Counter(p["source"] for p in s["ledger"]),
                research={
                    k: len(v)
                    for k, v in s["research"].items()
                    if isinstance(v, (list, dict))
                },
                projects=len(s["development"]["projects"]),
                batches=len(s["production"]["batches"]),
            ),
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("role", choices=CASES)
    cli.add_argument("--until", default="2025-04-01")
    args = cli.parse_args()
    with TemporaryDirectory() as temp:
        os.environ["AUTOSPORT_DATA_DIR"] = temp
        run(args.role, args.until)
