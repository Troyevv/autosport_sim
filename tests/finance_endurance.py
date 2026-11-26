"""Reproducible economy soak. Run from repository root: python -m tests.finance_endurance."""

from argparse import ArgumentParser
from collections import Counter
from time import monotonic
import json

from backend import domain, employment
from backend.catalog import WORLD
from backend.finance import (
    budget,
    capital,
    economy,
    facilities,
    market,
    activate,
    next_month,
    PERSONAL,
)


def wallets(s):
    return {
        **{k: v["cash_cents"] for k, v in s["accounts"].items()},
        **s["backers"],
        **s["finance"]["pockets"],
        PERSONAL: s["player_cash_cents"],
    }


def run(years, series, seed):
    org = next(
        p["org"] for p in WORLD["programs"].values() if p["championship"] == series
    )
    s = domain.new_world(
        WORLD, dict(name="Аналитик", role="owner", org=org, series=series, seed=seed)
    )
    activate(s, WORLD)
    market.initialize(s, WORLD)
    budget.initialize(s, WORLD, s["ledger"])
    facilities.initialize(s, WORLD)
    capital.initialize(s, WORLD)
    economy.initialize(s, WORLD)
    sporting_before = {k: dict(v) for k, v in s["starts"].items()}
    seen = set()
    balances = Counter()
    t = monotonic()
    total = sum(wallets(s).values())
    for i in range(12 * years):
        employment.advance(s, WORLD, next_month(s["date"]))
        for p in s["ledger"]:
            key = p["org"], p["key"]
            assert key not in seen, key
            seen.add(key)
            balances[p["org"]] += p["delta_cents"]
        s["ledger"] = []
        actual = wallets(s)
        assert all(v >= 0 and balances[k] == v for k, v in actual.items()), s["date"]
        assert sum(actual.values()) == total, (s["date"], sum(actual.values()) - total)
        assert s["starts"] == sporting_before
        if i % 12 == 11:
            states = Counter(v.get("status") for v in s["capital"]["crises"].values())
            admitted = Counter(
                p["series"]
                for p in s["capital"]["programs"].values()
                if p["status"] == "admitted"
            )
            print(
                json.dumps(
                    dict(
                        date=s["date"],
                        seconds=round(monotonic() - t, 2),
                        postings=len(seen),
                        solvent=len(s["accounts"])
                        - states["bankrupt"]
                        - states["insolvent"],
                        bankrupt=states["bankrupt"],
                        insolvent=states["insolvent"],
                        active_programs=admitted,
                        deals=len(s["market"]["contracts"]),
                        supply=len(s["market"]["supplies"]),
                        loans=len(s["capital"]["loans"]),
                        equity_deals=sum(
                            h["kind"] in ("issue", "sale")
                            for h in s["capital"]["history"]
                        ),
                        launches=sum(
                            h["kind"] == "incorporate" for h in s["capital"]["history"]
                        ),
                        licenses=len(s["economy"]["licenses"]),
                        money_cents=total,
                    )
                ),
                flush=True,
            )


if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("--years", type=int, default=10)
    p.add_argument("--series", default="f1")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    run(args.years, args.series, args.seed)
