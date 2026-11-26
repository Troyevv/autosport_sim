"""Repeatable review of populated career data, including cross-subsystem invariants."""

from collections import Counter, defaultdict
from datetime import date
from itertools import combinations

from backend import driver_terms, finance, personnel
from backend.finance import capital
from backend.opening import VERSION


def distribution(values):
    return dict(sorted(Counter(values).items()))


def review(state, world):
    current = state.get("opening") == VERSION
    date0 = state["date"]
    people = state["people"]
    employees = []
    drivers = []
    groups = defaultdict(list)
    for aid, rows in state["seats"].items():
        seat = world["assignments"][aid]
        for row in rows:
            employees.append(row)
            if seat["position"] == "driver":
                drivers.append((seat, row))
                if seat["entry"]:
                    e = world["entries"][seat["entry"]]
                    groups[(e["org"], e["championship"], e["category"])].append(
                        (seat, row)
                    )
    for crew in groups.values():
        for (a, r), (b, t) in combinations(crew, 2):
            assert driver_terms.compatible(a, r["driver_status"], b, t["driver_status"])
    deals = state["market"]["contracts"]
    terms = state["market"]["supplies"]
    for d in terms.values():
        if d["partnership"] == "commercial":
            assert deals[d["commercial_contract"]]["supply_contract"] == d["id"]
        if current:
            assert d["list_cents"] - d["discount_cents"] == d["sale_cents"]
            if d["series"] in {"f2", "f3", "freca", "f4-it", "f4-gb", "f4-es"}:
                assert not d["testing"] and not d["development"]
    money = defaultdict(int)
    for r in state["finance"]["instalments"].values():
        if r["category"] == "sponsorship" and r["status"] == "pending":
            money[(r["payer"], r["due"][:4])] += r["amount_cents"]
    assert all(
        v <= state["market"]["budgets"][b.removeprefix("brand:")]
        for (b, _), v in money.items()
    )
    for k, loan in state["capital"]["loans"].items():
        principal = sum(
            p["amount_cents"]
            for p in state["finance"]["instalments"].values()
            if p["contract"] == k and p["category"] == "principal"
        )
        assert principal == loan["principal_cents"]
    for a in state["academies"].values():
        pupils = [s for s in state["scholarships"].values() if s["academy"] == a["id"]]
        assert sum(p["reserved_cents"] for p in pupils) <= a["budget_cents"]
        for p in pupils:
            assert p["id"] in state["funding"]
            assert (
                personnel.age_on(people[p["person"]], date0)
                <= world["staff_rules"]["academies"][a["id"]]["max_age"]
            )

    def duration(row):
        if not row["end"]:
            return "open"
        days = (date.fromisoformat(row["end"]) - date.fromisoformat(date0)).days
        return "short" if days <= 190 else "season" if days <= 365 else "multi"

    profiles = defaultdict(list)
    for a in state["estate"]["assets"].values():
        profiles[a["owner"]].append((a["kind"], a["level"]))
    funding = state["funding"].values()
    ownership = state["capital"]["shares"]

    def ownership_kind(o, shares):
        if len(shares) == 1 and capital.owner_wallet(o) in shares:
            return "sole"
        if capital.INVESTOR in shares:
            return "investor"
        return "corporate" if len(shares) == 1 else "mixed-corporate"

    from backend.council import mandate
    from backend.programme import policy

    def amounts(values):
        values = sorted(values)
        return [values[0], values[len(values) // 2], values[-1]]

    per_series = {}
    for series in world["championships"]:
        roster = [(a, row) for a, row in drivers if a["series"] == series]
        entrants = {r["person"] for a, r in roster if a["entry"]}
        per_series[series] = dict(
            main=len(entrants),
            funded=len(entrants & {f["person"] for f in funding}),
            hierarchy=distribution(
                r.get("driver_status", a.get("duty") or "equal") for a, r in roster
            ),
            sponsors=sum(
                series in d.get("program_series", [d["series"]]) for d in deals.values()
            ),
        )
    return dict(
        roles=distribution(
            r.get("driver_status", a.get("duty") or "equal") for a, r in drivers
        ),
        supplies=distribution(d["partnership"] for d in terms.values()),
        durations=distribution(duration(r) for r in employees),
        expiries=distribution(r["end"] or "open" for r in employees),
        salary_cents=amounts(r["salary_cents"] for r in employees),
        buyouts=distribution(
            str(r["buyout_cents"] // max(1, r["salary_cents"])) for r in employees
        ),
        remits=distribution(r.get("remit", "standard") for r in employees),
        outside=sum(bool(r.get("outside_starts")) for _, r in drivers),
        combined=sum(bool(r.get("combined_duties")) for _, r in drivers),
        funding=distribution(f["source"] for f in funding),
        portable=sum(f["portable"] for f in funding),
        guarantees=sum(f["guarantee"] for f in funding),
        academies=distribution(s["academy"] for s in state["scholarships"].values()),
        academy_budgets={
            a["id"]: a["budget_cents"] for a in state["academies"].values()
        },
        options=sum(s["option"] for s in state["scholarships"].values()),
        priority=sum(s["priority"] for s in state["scholarships"].values()),
        traits=distribution(t["id"] for p in people.values() for t in p["traits"]),
        profiles=len(
            {tuple(sorted(x)) for k, x in profiles.items() if k in state["accounts"]}
        ),
        f1={
            o: {k: n for k, n in sorted(profiles[o])}
            for o, r in world["organizations"].items()
            if r["kind"] == "team" and "f1" in r["programs"]
        },
        ownership=distribution(ownership_kind(o, x) for o, x in ownership.items()),
        owner_wallets=amounts(
            finance.balance(state, capital.owner_wallet(o)) for o in ownership
        ),
        loans=len(state["capital"]["loans"]),
        principal_cents=sum(
            loan["principal_cents"] for loan in state["capital"]["loans"].values()
        ),
        sponsorships=distribution(d["role"] for d in deals.values()),
        sponsored_teams=len({d["org"] for d in deals.values()}),
        sponsored_drivers=len({d["person"] for d in deals.values() if d["person"]}),
        supplier_sponsors=len(
            {
                d["sponsor"]
                for d in deals.values()
                if d["sponsor"].startswith("supplier-")
            }
        ),
        goals=distribution(m["goal"] for m in state["mandates"].values()),
        engineering=distribution(policy(state, o) for o in ownership),
        delegation=distribution(mandate(state, o)["mode"] for o in ownership),
        focuses=distribution(mandate(state, o)["focus"] for o in ownership),
        works_funding=sum(
            r["category"] == "investment"
            for r in state["finance"]["instalments"].values()
        ),
        series=per_series,
    )


def organization_rows(state, world):
    from backend.council import mandate
    from backend.programme import policy

    result = []
    for oid, org in sorted(world["organizations"].items()):
        account = state["accounts"][oid]
        assets = [a for a in state["estate"]["assets"].values() if a["owner"] == oid]
        employees = {
            r["person"]
            for aid, rows in state["seats"].items()
            if world["assignments"][aid]["org"] == oid
            for r in rows
        }
        supplies = state["market"]["supplies"].values()
        sponsors = state["market"]["contracts"].values()
        result.append(
            dict(
                id=oid,
                name=org["name"],
                type=org["kind"],
                series=" ".join(org["programs"]),
                employees=len(employees),
                collective_headcount=sum(
                    g["size"] for g in state["collectives"].values() if g["org"] == oid
                ),
                facilities=len(assets),
                levels=" ".join(
                    f"{a['kind']}={a['level']}"
                    for a in sorted(assets, key=lambda a: a["kind"])
                ),
                condition_min=min(a["condition"] for a in assets),
                condition_max=max(a["condition"] for a in assets),
                leases=sum(
                    r["org"] == oid for r in state["estate"]["bookings"].values()
                ),
                cash_cents=account["cash_cents"],
                budget_cents=account["budget_cents"],
                monthly_payroll_cents=account["payroll_cents"],
                opening_principal_cents=sum(
                    x["principal_cents"]
                    for x in state["capital"]["loans"].values()
                    if x["org"] == oid
                ),
                owner_liquidity_cents=finance.balance(state, capital.owner_wallet(oid)),
                shareholders_bps=" ".join(
                    f"{k}={v}"
                    for k, v in sorted(state["capital"]["shares"][oid].items())
                ),
                sponsors_received=sum(d["org"] == oid for d in sponsors),
                sponsors_given=sum(d["sponsor"] == oid for d in sponsors),
                supply_contracts=sum(oid in (d["org"], d["sponsor"]) for d in supplies),
                supported_drivers=len(
                    employees & {f["person"] for f in state["funding"].values()}
                ),
                board_goal=state["mandates"].get(oid, {}).get("goal", ""),
                generation=policy(state, oid),
                delegation=mandate(state, oid)["mode"],
            )
        )
    return result


def measure(catalog, projection=review):
    import os
    from tempfile import TemporaryDirectory
    from backend import service, storage
    from backend.catalog import lineup_for

    with TemporaryDirectory() as directory:
        os.environ["AUTOSPORT_DATA_DIR"] = directory
        c = service.create(
            service.CareerInput(
                name="Аудит",
                org="team-mclaren-formula-1-team",
                series="f1",
                role="manager",
                seed=42,
            ),
            catalog=catalog,
        )
        with storage.transaction() as db:
            state = storage.checkpoint(db, c["id"])
        return projection(state, lineup_for(state))


if __name__ == "__main__":
    import argparse
    import csv
    import json
    import sys
    from backend.catalog import FIRST_SEASON, SEASON

    cli = argparse.ArgumentParser()
    cli.add_argument("--organizations", action="store_true")
    if cli.parse_args().organizations:
        rows = measure(SEASON, organization_rows)
        writer = csv.DictWriter(sys.stdout, fieldnames=rows[0], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        raise SystemExit

    print(
        json.dumps(
            {"before": measure(FIRST_SEASON), "after": measure(SEASON)},
            ensure_ascii=False,
            indent=2,
        )
    )
