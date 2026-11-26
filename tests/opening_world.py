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
from backend.development_path import eligibility
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
        assert teams[oid]["domicile"] in world["countries"], oid
        assert teams[oid]["base_country"] in world["countries"], oid
        owned = [a for a in assets if a["owner"] == oid]
        rented = [
            s["estate"]["assets"][r["facility"]]
            for r in s["estate"]["bookings"].values()
            if r["org"] == oid
        ]
        assert {"hq", "warehouse"} <= {a["kind"] for a in owned + rented}, oid
        assert all(facilities.capacity(s, a) > 0 for a in owned), oid
        assert s["accounts"][oid]["cash_cents"] > 0
    assert all(
        s["seats"][aid] for aid, a in world["assignments"].items() if a["person"]
    )
    assert all(g["size"] > 0 for g in s["collectives"].values())
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
    for grant in s["support"]:
        deal = contracts[grant["agreement"]]
        assert grant["entry"] in deal["entries"] and grant["client"] == deal["org"]
        assert grant["employer"] == deal["sponsor"] and deal["support"]
    assert all(
        sum(shares.values()) == 10000 for shares in s["capital"]["shares"].values()
    )
    actual_crews = {}
    for aid, seat in world["assignments"].items():
        if seat["position"] == "driver" and seat["entry"]:
            actual_crews.setdefault(seat["entry"], set()).add(
                domain.occupant_on(s["seats"][aid], s["date"])
            )
    series = {}
    installed = set()
    for champ in world["championships"]:
        entries = [e for e in world["entries"].values() if e["championship"] == champ]
        orgs = {e["org"] for e in entries}
        makers = set()
        for e in entries:
            assert set(e["crew"]) == actual_crews[e["id"]]
            assert all(
                eligibility(
                    s["people"][p],
                    world["championships"][champ]["admission"],
                    s["date"],
                )
                is None
                for p in e["crew"]
            )
            assert s["capital"]["programs"][e["program"]]["status"] == "admitted"
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
            personnel=len(
                {
                    a["person"]
                    for a in world["assignments"].values()
                    if a["org"] in orgs | makers and a["person"]
                }
            ),
            collectives=sum(
                g["org"] in orgs | makers for g in s["collectives"].values()
            ),
            installed=sum(len(parts.installed[e["id"]]) for e in entries),
            specifications=len(
                {
                    parts.stock[i]["spec"]
                    for e in entries
                    for i in parts.installed[e["id"]].values()
                }
            ),
            academies=sum(
                a["org"] in orgs | makers
                for a in world["staff_rules"]["academies"].values()
            ),
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

    while c["date"] < until:
        c = step(c)
    archive = service.export_save(c["id"])
    restored = service.import_save(archive)
    assert service.export_save(restored["id"])["sha256"] == archive["sha256"]
    assert service.load(c["id"])["revision"] == c["revision"]
    with storage.transaction() as db:
        s = storage.checkpoint(db, c["id"])
        ledger = storage.postings(db, c["id"])
    balances = Counter()
    outflow = Counter()
    for row in ledger:
        if row["org"] in s["accounts"]:
            balances[row["org"]] += row["delta_cents"]
            if row["delta_cents"] < 0:
                outflow[row["source"]] -= row["delta_cents"]
    assert all(balances[o] == a["cash_cents"] for o, a in s["accounts"].items())
    assert not s["starts"]
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
                outflow_eur={k: v // 100 for k, v in outflow.items()},
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
