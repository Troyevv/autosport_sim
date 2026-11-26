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


def owner_endowment(state, world, oid):
    """Liquid personal assets in cents, exclusive of shares and company buildings."""
    org = world["organizations"][oid]
    seat = oid + (":owner" if org["kind"] == "team" else ":manufacturer")
    principal = state["people"][state["seats"][seat][0]["person"]]
    programmes = set(org["programs"])
    sample_id = sample(oid + "-personal-assets")
    if oid in HOLDINGS or oid in SHARED_BASE:
        # Appointed corporate principals have managerial savings independent of group turnover.
        euros = (principal["experience"] + 2) * (45000 + sample_id % 85000)
    elif "f1" in programmes:
        # Liquid commitments of independent F1 holding principals; equity is valued separately.
        euros = (18 + sample_id % 96) * 1000000
    elif org["kind"] == "supplier":
        euros = (2 + len(org["lines"])) * (175000 + sample_id % 2050000)
    elif programmes <= {"kart-ok", "kart-okj"}:
        euros = 55000 + principal["experience"] * 6000 + sample_id % 425000
    else:
        # Private competition operators range from family-run teams to multi-series businesses.
        euros = (1 + len(programmes)) * (205000 + sample_id % 2850000)
    return euros * 100


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
