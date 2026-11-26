"""Opening endowments, service contracts and workloads for the 2025 entry list."""

from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256

from .. import finance, teamwork
from ..finance import facilities
from ..employment import assign_support
from ..personnel import shifted
from . import VERSION

# Seasonal operating envelopes per programme (EUR), excluding parent-company turnover.
PROGRAMME_EUR = {
    "f1": 155_000_000,
    "wec": 9_000_000,
    "dtm": 3_200_000,
    "f2": 5_000_000,
    "f3": 3_300_000,
    "freca": 1_300_000,
    "f4-it": 850_000,
    "f4-es": 680_000,
    "f4-gb": 740_000,
    "kart-ok": 220_000,
    "kart-okj": 180_000,
}
WORKS = {
    "team-scuderia-ferrari": {"supplier-ferrari"},
    "team-mercedes-amg-petronas-f1-team": {"supplier-mercedes"},
    "team-oracle-red-bull-racing": {
        "supplier-honda-rbpt",
        "supplier-red-bull-technology",
    },
    "team-bwt-alpine-f1-team": {"supplier-renault"},
    "team-aston-martin-thor-team": {"supplier-aston-martin"},
    "team-toyota-gazoo-racing": {"supplier-toyota"},
    "team-ferrari-af-corse": {"supplier-ferrari"},
    "team-bmw-m-team-wrt": {"supplier-bmw"},
    "team-cadillac-hertz-team-jota": {"supplier-cadillac"},
    "team-porsche-penske-motorsport": {"supplier-porsche"},
    "team-peugeot-totalenergies": {"supplier-peugeot"},
    "team-alpine-endurance-team": {"supplier-alpine"},
    "team-crg": {"supplier-crg"},
    "team-asd-monster-k-factory-team": {"supplier-monster-k"},
    "team-parolin-motorsport": {"supplier-parolin"},
    "team-energy-corse": {"supplier-energy-corse"},
    "team-birel-art-racing": {"supplier-birel-art"},
    "team-kr-motorsport": {"supplier-kart-republic"},
    "team-tony-kart-racing-team": {"supplier-otk-kart-group", "supplier-vortex"},
}


# Factory kart operations share the manufacturer's premises and workshop.
# These are divisions with different sporting and supply duties.
SHARED_BASE = {
    "team-crg": "supplier-crg",
    "team-asd-monster-k-factory-team": "supplier-monster-k",
    "team-energy-corse": "supplier-energy-corse",
    "team-kr-motorsport": "supplier-kart-republic",
    "team-parolin-motorsport": "supplier-parolin",
    "team-birel-art-racing": "supplier-birel-art",
    "team-tony-kart-racing-team": "supplier-otk-kart-group",
    "supplier-vortex": "supplier-otk-kart-group",
}


def sample(key):
    return int.from_bytes(sha256(key.encode()).digest()[:4], "big")


def venue_plan(org, entries, academy):
    kinds = {"hq": 1, "warehouse": 1}
    series = set(org["programs"])
    if org["kind"] == "supplier":
        kinds.update(research=1, design=1, bench=2, factory=2, quality=1)
        kinds["warehouse"] = min(
            8, 1 + len({(e["category"], e["car"]) for e in entries}) // 12
        )
        if "f1" in series or len(series) > 3:
            kinds.update(research=2, design=2, factory=3, quality=2)
    elif "f1" in series:
        kinds.update(
            research=3, design=3, bench=3, factory=4, quality=2, cfd=3, simulator=2
        )
        if org["id"] not in {
            "team-moneygram-haas-f1-team",
            "team-visa-cash-app-racing-bulls",
            "team-aston-martin-aramco-f1-team",
        }:
            kinds["tunnel"] = 2
    elif any(e["category"] == "Hypercar" for e in entries):
        kinds.update(bench=2, design=1, research=1, quality=2, factory=2, simulator=1)
    elif series - {"kart-ok", "kart-okj"}:
        kinds.update(quality=1, factory=1)
        if series & {"f2", "f3", "wec", "dtm", "freca"}:
            kinds.update(simulator=1, bench=1, research=1)
        if len(series) > 2:
            kinds.update(bench=2, warehouse=2, design=1)
    else:
        # Kart engines and chassis are bought homologated. The workshop can inspect them.
        kinds["quality"] = 1
    if org["id"] == "team-moneygram-haas-f1-team":
        kinds.update(factory=2, design=2, cfd=2)
    if org["id"] in SHARED_BASE:
        del kinds["hq"]
    if org["id"] in SHARED_BASE.values():
        divisions = list(SHARED_BASE.values()).count(org["id"])
        kinds["hq"] += divisions
        kinds["factory"] += divisions
    if academy:
        kinds["academy"] = 1
    return kinds


def scopes(world):
    entries = defaultdict(list)
    for e in world["entries"].values():
        entries[e["org"]].append(e)
        for oid in set(world["cars"][e["car"]]["suppliers"].values()):
            entries[oid].append(e)
    academies = {a["org"] for a in world["staff_rules"]["academies"].values()}
    for oid, org in world["organizations"].items():
        levels = venue_plan(org, entries[oid], oid in academies)
        if world["opening"] == VERSION:
            from .operations import capacities

            capacities(org, entries[oid], levels)
        yield oid, org, entries[oid], levels


def endow(state, world):
    """Set the single opening equity posting before contracts, pocket budgets and mandates."""
    ledger = {p["org"]: p for p in state["ledger"]}
    for oid, org, entries, kinds in scopes(world):
        series_count = Counter(e["championship"] for e in entries)
        costs = sum(
            PROGRAMME_EUR[s] * (0.55 + 0.18 * n) for s, n in series_count.items()
        )
        if org["kind"] == "supplier":
            costs = costs * (0.45 if "engine" in org["lines"] else 0.16)
        elif any(e["category"] == "Hypercar" for e in entries):
            costs *= 2.8
        if world["opening"] == VERSION:
            # Operating expense follows the in-house workload, with differing
            # overhead and external engineering shares for similar-size entrants.
            from .operations import F1

            scale = (
                78 + sum(F1[oid]) if oid in F1 else 83 + sample(oid + "-overhead") % 38
            )
            costs = costs * scale / 100
        groups = [g for g in state["collectives"].values() if g["org"] == oid]
        operators = sum(level * facilities.TYPES[k][4] for k, level in kinds.items())
        staff = max(operators * 2 + len(groups), int(costs / 180000))
        raw = sum(g["size"] for g in groups)
        sizes = [max(1, staff * g["size"] // raw) for g in groups]
        sizes[0] += staff - sum(sizes)
        monthly = 0
        for g, size in zip(groups, sizes, strict=True):
            wage = g["payroll_cents"] // g["size"]
            g.update(size=size, payroll_cents=size * wage)
            monthly += size * wage
        # Small paddocks use a shared workshop; existing simulation models its staff in collectives.
        budget = max(int(costs) * 100, monthly * 17)
        cash = budget * (67 + sample(oid + "-capital") % 23) // 100
        if world["opening"] == VERSION:
            # Starting liquidity, excluding historic asset purchases and loan proceeds.
            cash = budget * (49 + sample(oid + "-liquidity") % 52) // 100
        state["accounts"][oid].update(
            budget_cents=budget,
            cash_cents=cash,
            forecast_cents=cash - monthly,
            payroll_cents=monthly,
            development_budget_cents=budget * 18 // 100,
        )
        ledger[oid]["delta_cents"] = cash


def populate(state, world):
    day = state["date"]
    assets = state["estate"]["assets"]
    for oid, org, entries, kinds in scopes(world):
        for kind, level in kinds.items():
            key = f"base:{oid}:{kind}"
            condition = 77 + sample(key) % 22
            if world["opening"] == VERSION:
                condition = 61 + sample(key + "-maintenance") % 37
            country = org["base_country"]
            value = (
                facilities.quote(kind, country)["build_cents"]
                * level
                * condition
                // 100
            )
            assets[key] = dict(
                facilities.asset(key, oid, kind, country, day, day, value, level),
                condition=condition,
                last_service=day,
            )
        if org["kind"] == "team":
            style = state["people"][state["mandates"][oid]["manager"]]["management"][
                "style"
            ]
            state["mandates"][oid].update(goal=style, autonomy=55 + sample(oid) % 31)
        state["programme"]["priorities"][oid + ":2025"] = (
            "balanced"
            if org["kind"] == "supplier" or "f1" in org["programs"]
            else "current"
        )
    for borrower, lender in [
        ("team-moneygram-haas-f1-team", "team-scuderia-ferrari"),
        ("team-visa-cash-app-racing-bulls", "team-oracle-red-bull-racing"),
        ("team-aston-martin-aramco-f1-team", "team-mercedes-amg-petronas-f1-team"),
    ]:
        # February opening access. The Silverstone tunnel enters operation later.
        facility = f"base:{lender}:tunnel"
        key = "access:" + borrower
        end = "2025-03-01" if "aston-martin" in borrower else "2026-01-01"
        fee = facilities.quote("tunnel", assets[facility]["country"])["daily_cents"] * (
            date_days(day, end)
        )
        state["estate"]["bookings"][key] = dict(
            id=key,
            org=borrower,
            facility=facility,
            mode="lease",
            start=day,
            end=end,
            units=1,
            cost_cents=fee,
        )
        finance.register(
            state,
            finance.Schedule(
                installments=[
                    finance.Instalment(
                        id=key,
                        contract=key,
                        payer=borrower,
                        recipient=lender,
                        category="infrastructure",
                        amount_cents=fee,
                        due=end,
                        earned=day,
                    )
                ]
            ),
        )
    for tenant, landlord in SHARED_BASE.items():
        for kind in ("hq", "factory"):
            key = f"shared-base:{tenant}:{kind}"
            state["estate"]["bookings"][key] = dict(
                id=key,
                org=tenant,
                facility=f"base:{landlord}:{kind}",
                mode="lease",
                start=day,
                end="2026-01-01",
                units=1,
                cost_cents=0,
            )
    for key, pair in teamwork.partnerships(state, world, day).items():
        if "player" in pair[1:3]:
            continue
        days = 7 + sample(key) % 180
        first = shifted(day, -days)
        state["relationships"][key] = dict(
            teamwork.entry_for(pair, first),
            days=days,
            spells=[dict(org=pair[3], start=first, end=day)],
        )
    if world["opening"] == VERSION:
        from .workforce import contracts_and_people

        opening_crews = contracts_and_people(state, world)
    contracts(state, world)
    # Manthey's controlling shareholder was Porsche from 2013; the 2025 opening
    # predates the later increase in its holding.
    from ..finance.capital import owner_wallet

    state["capital"]["shares"]["team-manthey-ema"] = {
        owner_wallet("team-manthey-ema"): 4900,
        "supplier-porsche": 5100,
    }
    supplier_stock(state, world)
    fund_academies(state, world)
    if world["opening"] == VERSION:
        from .operations import policies, regional_access
        from .workforce import sporting_terms
        from .investment import capitalize
        from .partners import commercial
        from .pathways import pathways

        pathways(state, world)
        sporting_terms(state, opening_crews)
        commercial(state, world)
        capitalize(state, world)
        policies(state, world)
        regional_access(state, world)


def date_days(start, end):
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def contracts(state, world):
    book = state["market"]["supplies"]
    advisors = {}
    for entry in world["entries"].values():
        eid, oid, series = entry["id"], entry["org"], entry["championship"]
        for axis, maker in world["cars"][entry["car"]]["suppliers"].items():
            works = maker in WORKS.get(entry["entrant_id"], set())
            technical = (
                series == "dtm" and maker == "supplier-mercedes" and axis != "tyre"
            )
            key = f"grid:{entry['program']}:{maker}:{axis}" + (
                ":works" if works else ""
            )
            d = book.setdefault(
                key,
                dict(
                    id=key,
                    org=oid,
                    sponsor=maker,
                    series=series,
                    product=axis,
                    status="signed",
                    entries=[],
                    partnership="works"
                    if works
                    else "technical"
                    if technical
                    else "client",
                    start=state["date"],
                    end="2026-01-01",
                    support=axis != "chassis",
                    academy_person=None,
                    seat_cents=0,
                    testing=works,
                    development=works,
                    discount_cents=0,
                    cost_cents=0,
                ),
            )
            d["entries"].append(eid)
            if world["opening"] == VERSION and len(d["entries"]) == 1:
                from .partners import supply_terms

                d["discount_percent"] = supply_terms(d)
            if d["support"] and (maker not in advisors or works):
                advisors[maker] = (entry, axis)
            if works and axis != "chassis":
                from ..finance.market import Homologation, homologate

                homologate(
                    state,
                    world,
                    Homologation(
                        reference=f"works-2025-{eid}-{axis}",
                        entry=eid,
                        product=axis,
                        provider=maker,
                        regulation=world["championships"][series]["rules_id"],
                        start=d["start"],
                        end=d["end"],
                        works=True,
                    ),
                )
    for key, d in book.items():
        share = {
            "engine": 0.028,
            "transmission": 0.009,
            "tyre": 0.006,
            "chassis": 0.012,
        }[d["product"]]
        price = int(PROGRAMME_EUR[d["series"]] * share) * 100 * len(d["entries"])
        discount = 0
        if world["opening"] == VERSION:
            discount = price * d["discount_percent"] // 100
        d.update(
            list_cents=price,
            discount_cents=discount,
            sale_cents=0 if d["partnership"] == "works" else price - discount,
        )
        price = d["sale_cents"]
        if d["sale_cents"]:
            dates = ("2025-04-01", "2025-07-01", "2025-10-01")
            # Ongoing supply rights/service, stock already on the books.
            finance.register(
                state,
                finance.Schedule(
                    installments=[
                        finance.Instalment(
                            id=f"{key}:{i}",
                            contract=key,
                            payer=d["org"],
                            recipient=d["sponsor"],
                            category="supply",
                            due=day,
                            earned=day,
                            amount_cents=price // 3 + int(i < price % 3),
                        )
                        for i, day in enumerate(dates)
                    ]
                ),
            )
    for maker, (e, axis) in sorted(advisors.items()):
        seat = world["assignments"][maker + ":technical-advisor"]
        assign_support(
            state,
            world,
            seat,
            state["seats"][seat["id"]][0],
            dict(
                start=state["date"],
                end=shifted(
                    state["date"],
                    14 if world["opening"] != VERSION else 7 + sample(maker) % 21,
                ),
                entry=e["id"],
                product=axis,
            ),
        )


def supplier_stock(state, world):
    from ..components.catalog import parts_for
    from ..components.registry import register_instance

    parts = parts_for(state)
    for eid, slots in parts.installed.items():
        for axis in ("engine", "transmission", "tyre"):
            if axis not in slots:
                continue
            version = parts.stock[slots[axis]]["spec"]
            maker = parts.specs[version]["manufacturer"]
            if world["organizations"].get(maker, {}).get("kind") != "supplier":
                continue
            serial = "opening-stock/" + version
            if serial in state["production"]["items"]:
                continue
            register_instance(
                state, instance=serial, version=version, org=maker, reference="opening"
            )
            state["production"]["items"][serial] = dict(
                entry=eid,
                batch=None,
                made=None,
                queued=state["date"],
                cost_cents=None,
                status="stock",
                checks=0,
                rejected=False,
                reason=None,
                repaired=False,
                fault=False,
            )


def fund_academies(state, world):
    from ..backing import enroll
    from ..personnel import age_on

    # Entry lists establish eligible places. Recipients and amounts are fictional.
    for academy in state["academies"].values():
        if any(s["academy"] == academy["id"] for s in state["scholarships"].values()):
            continue
        occupied = {s["person"] for s in state["scholarships"].values()}
        candidates = [
            (pid, e["org"])
            for e in world["entries"].values()
            if e["championship"] in ("f3", "f4-it", "f4-es", "f4-gb", "freca")
            for pid in e["crew"]
            if pid not in occupied and age_on(state["people"][pid], state["date"]) <= 21
        ]
        pid, team = min(candidates, key=lambda pair: sample(academy["id"] + pair[0]))
        enroll(
            state,
            world,
            academy,
            pid,
            min(360000, academy["budget_cents"] // 120),
            state["date"],
            "2025-12-01",
            True,
            False,
            team,
        )
