"""Opening ownership and remaining bank debt, without re-purchasing historic equipment."""

from .. import finance
from ..finance import capital
from .population import WORKS, SHARED_BASE, sample

HOLDINGS = {
    "team-scuderia-ferrari": ("supplier-ferrari", 10000),
    "team-toyota-gazoo-racing": ("supplier-toyota", 10000),
    "team-peugeot-totalenergies": ("supplier-peugeot", 10000),
    "team-manthey-ema": ("supplier-porsche", 5100),
    "team-bwt-alpine-f1-team": ("supplier-renault", 7600),
    "team-mercedes-amg-petronas-f1-team": ("supplier-mercedes", 3333),
    "supplier-lexus": ("supplier-toyota", 10000),
    "supplier-vortex": ("supplier-otk-kart-group", 10000),
}


def capitalize(state, world):
    for oid, org in world["organizations"].items():
        owner = capital.owner_wallet(oid)
        budget = state["accounts"][oid]["budget_cents"]
        n = sample(oid + "-ownership")
        shares = {owner: 10000}
        holder = HOLDINGS.get(oid)
        if not holder and oid in SHARED_BASE:
            holder = (SHARED_BASE[oid], 10000)
        if holder:
            principal, amount = holder
            shares = {principal: amount}
            if amount < 10000:
                shares[owner] = 10000 - amount
        elif n % 5 in (0, 1):
            stake = (15 + n % 40) * 100
            shares = {owner: 10000 - stake, capital.INVESTOR: stake}
        state["capital"]["shares"][oid] = shares
        if n % 5 == 2 and oid not in HOLDINGS:
            months = (12, 18, 24, 30, 36)[n // 5 % 5]
            principal = budget * (5 + n // 13 % 18) // 100
            rate = 395 + n % 630
            key = "opening-debt:" + oid
            # The loan was drawn before kickoff. Record only the outstanding schedule.
            capital.schedule(state, oid, key, principal, months, rate)
            state["capital"]["loans"][key] = dict(
                id=key,
                org=oid,
                principal_cents=principal,
                months=months,
                rate_bps=rate,
                start="2024-11-01",
                restructured=False,
            )
    # A works programme can receive an earmarked capital contribution from its maker.
    # An operating partner can run other, financially independent entries.
    works = {
        (e["org"], maker)
        for e in world["entries"].values()
        for maker in WORKS.get(e["entrant_id"], ())
        if maker in world["organizations"]
    }
    for org, maker in sorted(works):
        if org in SHARED_BASE or org == maker:
            continue
        amount = min(
            state["accounts"][org]["budget_cents"] // 70,
            state["accounts"][maker]["budget_cents"] // 30,
        )
        key = "works-funding:" + maker + ":" + org
        finance.register(
            state,
            finance.Schedule(
                installments=[
                    finance.Instalment(
                        id=key + date,
                        contract=key,
                        payer=maker,
                        recipient=org,
                        category="investment",
                        due=date,
                        earned=date,
                        amount_cents=amount,
                    )
                    for date in ("2025-05-01", "2025-09-01")
                ]
            ),
        )
