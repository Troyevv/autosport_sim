"""Facility capacity and the management remit of the fictional operating company."""

from .. import council, finance
from .population import date_days, sample

# In-house capacities at the existing major F1 sites. Units are staffed work cells.
F1 = {
    "team-scuderia-ferrari": (5, 5, 5, 4, 3, 4, 3),
    "team-mclaren-formula-1-team": (4, 5, 4, 3, 2, 5, 4),
    "team-oracle-red-bull-racing": (5, 4, 5, 4, 3, 5, 3),
    "team-mercedes-amg-petronas-f1-team": (5, 5, 5, 5, 4, 4, 4),
    "team-williams-racing": (2, 3, 3, 2, 2, 2, 2),
    "team-moneygram-haas-f1-team": (1, 2, 2, 2, 1, 2, 1),
    "team-bwt-alpine-f1-team": (3, 3, 4, 3, 2, 3, 2),
    "team-aston-martin-aramco-f1-team": (3, 4, 4, 3, 3, 3, 3),
    "team-visa-cash-app-racing-bulls": (2, 3, 2, 2, 2, 3, 2),
    "team-kick-sauber-f1-team": (3, 3, 3, 2, 2, 3, 1),
}


def capacities(org, entries, levels):
    oid = org["id"]
    if oid in F1:
        levels.update(
            zip(
                (
                    "research",
                    "design",
                    "factory",
                    "bench",
                    "quality",
                    "cfd",
                    "simulator",
                ),
                F1[oid],
                strict=True,
            )
        )
    else:
        breadth = len(org["programs"])
        specialty = (
            ("bench", "quality")
            if "engine" in org["lines"]
            else ("design", "factory")
            if "chassis" in org["lines"]
            else ("simulator", "quality", "warehouse")
        )
        for kind in sorted(levels):
            if kind == "hq" or kind == "academy":
                continue
            demand = len(entries) + 3 * (breadth - 1)
            if kind in specialty:
                demand += 8
            if sample(oid + kind + "-capacity") % 30 < min(23, demand):
                levels[kind] += 1
        if (
            org["kind"] == "team"
            and "quality" in levels
            and len(entries) >= 5
            and not levels.get("factory")
            and sample(oid) % 2
        ):
            levels["bench"] = 1
    return levels


def policies(state, world):
    for oid, org in world["organizations"].items():
        candidates = finance.finance_staff(state, world, oid)
        if candidates:
            state["finance"]["officers"][oid] = max(
                candidates, key=lambda pid: (candidates[pid]["skill"], pid)
            )
        seats = state["seats"]
        chief = state["people"][seats[oid + ":chief-engineer"][0]["person"]]
        budget = state["accounts"][oid]
        contender = oid in {
            "team-scuderia-ferrari",
            "team-oracle-red-bull-racing",
            "team-mclaren-formula-1-team",
            "team-porsche-penske-motorsport",
            "team-toyota-gazoo-racing",
            "team-prema-racing",
        }
        goal = "technical"
        if org["kind"] == "team":
            m = state["mandates"][oid]
            owner = state["people"][m["owner"]]
            manager = state["people"][m["manager"]]
            style = manager["management"]
            constrained = budget["cash_cents"] < 8 * budget["payroll_cents"]
            goal = (
                "performance"
                if contender
                else "economy"
                if constrained or owner["specialization"] == "Финансовое планирование"
                else "development"
                if style["youth"] >= 65
                else "technical"
                if chief["ambition"] > 72
                else style["style"]
            )
            m.update(
                goal=goal,
                priority="required" if contender or constrained else "desired",
                horizon="long"
                if goal in ("technical", "development")
                else "intermediate"
                if constrained
                else "season",
                autonomy=35 + (manager["reputation"] + owner["loyalty"]) // 4,
                trust=40 + manager["professionalism"] // 3,
                satisfaction=45 + manager["loyalty"] // 4,
                limit_cents=budget["payroll_cents"]
                * (90 + owner["ambition"] // 4)
                // 100,
            )
        spending = (
            11
            + chief["ambition"] // 12
            + (4 if goal == "technical" else -3 if goal == "economy" else 0)
        )
        budget["development_budget_cents"] = budget["budget_cents"] * spending // 100
        parts = state["control"]["plans"][oid]["2025"]["allocations"]
        parts["personnel"] += parts["engineering"] - budget["development_budget_cents"]
        parts["engineering"] = budget["development_budget_cents"]
        current = (
            "current"
            if goal == "performance"
            else "next"
            if goal == "technical" and chief["ambition"] > 68
            else "balanced"
            if goal != "economy"
            else "current"
        )
        state["programme"]["priorities"][oid + ":2025"] = current
        player = (oid, state["setup"]["role"]) == (state["setup"]["org"], "manager")
        state["council"]["mandates"][oid] = council.Mandate(
            mode="manual"
            if player
            else "partial"
            if goal == "economy" or chief["professionalism"] < 57
            else "full",
            focus="knowledge"
            if goal in ("technical", "development")
            else "readiness"
            if goal == "performance"
            else "balanced",
            limit_cents=budget["development_budget_cents"]
            * (60 + chief["authority"] // 3)
            // 100,
            allow_rent=not player and goal != "economy",
        ).model_dump()


def regional_access(state, world):
    from .. import finance
    from ..finance import facilities

    assets = state["estate"]["assets"]
    for oid, org in sorted(world["organizations"].items()):
        if (
            org["kind"] != "team"
            or "f1" in org["programs"]
            or sample(oid + "-lease") % 3
        ):
            continue
        kind = (
            "bench" if set(org["programs"]) <= {"kart-ok", "kart-okj"} else "simulator"
        )
        if f"base:{oid}:{kind}" in assets:
            continue
        start, end = state["date"], "2025-11-01"
        options = [
            a
            for a in assets.values()
            if a["kind"] == kind
            and a["owner"] in world["organizations"]
            and a["country"] == org["base_country"]
            and facilities.free(state, a, start, end) >= 2
        ]
        if not options:
            continue
        a = min(options, key=lambda x: sample(oid + x["id"]))
        key = "regional-access:" + oid
        amount = facilities.quote(kind, a["country"])["daily_cents"] * date_days(
            start, end
        )
        state["estate"]["bookings"][key] = dict(
            id=key,
            org=oid,
            facility=a["id"],
            mode="lease",
            start=start,
            end=end,
            units=1,
            cost_cents=amount,
        )
        finance.register(
            state,
            finance.Schedule(
                installments=[
                    finance.Instalment(
                        id=key,
                        contract=key,
                        payer=oid,
                        recipient=a["owner"],
                        category="infrastructure",
                        amount_cents=amount,
                        due="2025-06-01",
                        earned=start,
                    )
                ]
            ),
        )
