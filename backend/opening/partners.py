"""Service tiers and additional, finite fictional commercial commitments."""

from collections import defaultdict

from ..domain import RuleError
from ..finance import market
from .population import sample

CONTROLLED = {"f2", "f3", "freca", "f4-it", "f4-gb", "f4-es"}


def supply_terms(deal):
    key = deal["id"]
    n = sample(key + "-service")
    status = deal["partnership"]
    if status == "client" and n % 100 < 19:
        status = "priority"
    elif status == "client" and n % 100 < 40:
        status = "technical"
    controlled = deal["series"] in CONTROLLED
    deal.update(
        partnership=status,
        support=deal["product"] != "chassis" and (status != "client" or n % 4 != 0),
        testing=status in ("works", "priority") and not controlled,
        development=not controlled
        and (status == "works" or status == "technical" and n % 4 == 0),
    )
    return {"works": 100, "priority": 9 + n % 9, "technical": 4 + n % 7, "client": 0}[
        status
    ]


def support_access(tier, maker, axis):
    channels = {"distance", "temperature", "wear", "feedback"}
    if tier not in ("works", "priority"):
        channels = (
            {"feedback", "temperature"} if axis == "engine" else {"distance", "wear"}
        )
    return frozenset(channels), 100 if tier == "works" else 35 + sample(maker) % 46


def commercial(state, world):
    brands = market.participants(world, state)
    book = state["market"]
    existing = defaultdict(set)
    for d in book["contracts"].values():
        existing[d["org"]].add(d["role"])

    def sign(org, series, sponsor, role, *, person=None, school=None, entries=None):
        key = f"model-2025:{org}:{series}:{sponsor}:{role}"
        n = sample(key)
        if key in book["contracts"]:
            return None
        limit = market.funds(state, sponsor)
        if limit < 10000:
            return None
        money = min(
            limit // 5,
            state["accounts"][org]["budget_cents"]
            * (2 + n % 8)
            // (140 if role in ("title", "principal") else 800),
        )
        if money < 10000:
            return None
        zone = {
            "title": "upper",
            "principal": "flank",
            "personal": "suit",
            "academy": "press",
            "technical": "garage",
            "partner": "hospitality",
        }[role]
        terms = market.Terms(
            sponsor=sponsor,
            org=org,
            series=series,
            role=role,
            start=state["date"],
            end=("2025-11-01", "2026-01-01", "2026-07-01")[n % 3],
            fixed_cents=money,
            advance_cents=0,
            interval=(1, 3, 6)[n % 3],
            bonus_cents=money // 24,
            podium=1 + n % 8,
            rights=[
                market.Rights(
                    zone=zone,
                    share=10,
                    offset=10 * (n % 9),
                    shared=False,
                    priority=n % 4,
                )
            ],
            exclusive=role == "title",
            appearances=n % 5,
            reputation=20 + n % 40,
            compensation_cents=money // (5 + n % 7),
            person=person,
            academy=school,
            renew=n % 5 != 0,
        )
        if market.conflict(state, world, terms, entries):
            return None
        market.validate(state, world, market.Bid(terms=terms), signing=True)
        try:
            d = market.sign_sponsor(state, world, terms, key, car_entries=entries)
        except RuleError as exc:
            # A brand can have less annual capacity than its available cash.
            if exc.status != 409:
                raise
            return None
        d.update(
            basis="simulation",
            evidence="Игровая оценка коммерческого пакета и его условий на начало сезона.",
        )
        existing[org].add(role)
        return d

    # A joint commercial programme is a signed marketing obligation in addition to the supply.
    for key, d in sorted(book["supplies"].items()):
        if (
            d["partnership"] != "client"
            or sample(key + "-marketing") % 7
            or d["product"] == "chassis"
        ):
            continue
        sponsor = sign(
            d["org"], d["series"], d["sponsor"], "technical", entries=d["entries"]
        )
        if sponsor:
            d.update(partnership="commercial", commercial_contract=sponsor["id"])
            sponsor["supply_contract"] = d["id"]
    for oid, team in world["organizations"].items():
        if team["kind"] != "team":
            continue
        roster = [e for e in world["entries"].values() if e["org"] == oid]
        for series in team["programs"]:
            entries = [e for e in roster if e["championship"] == series]
            if not entries:
                continue
            candidates = [
                brand
                for brand, b in brands.items()
                if not brand.startswith("supplier-") and series in b["series"]
            ]
            candidates.sort(key=lambda b: sample(oid + series + b))
            n = sample(oid + series + "-sponsor")
            roles = []
            if n % 4 or not existing[oid]:
                roles.append(
                    "title"
                    if n % 7 == 0 and "title" not in existing[oid]
                    else "principal"
                    if n % 3 == 0
                    else "partner"
                )
            if n % 4 == 0 or series.startswith("kart"):
                roles.append("personal")
            school = next(
                (a for a in state["academies"].values() if a["org"] == oid), None
            )
            if school and "academy" not in existing[oid]:
                roles.append("academy")
            for role in roles:
                pid = (
                    entries[n % len(entries)]["crew"][0] if role == "personal" else None
                )
                for brand in candidates:
                    deal = sign(
                        oid,
                        series,
                        brand,
                        role,
                        person=pid,
                        school=school["id"] if role == "academy" else None,
                        entries=[e["id"] for e in entries if pid in e["crew"]]
                        if pid
                        else None,
                    )
                    if deal:
                        break
