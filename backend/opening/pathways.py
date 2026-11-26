"""Fictional scholarships and seat funding at distinct levels of the racing ladder."""

from collections import defaultdict
from datetime import date

from .. import backing, finance
from ..personnel import age_on
from .population import sample

# Typical monthly seat contribution in EUR, subject to an individual award.
CONTRIBUTION = {
    "kart-okj": 1400,
    "kart-ok": 2400,
    "f4-es": 5700,
    "f4-it": 7200,
    "f4-gb": 6400,
    "freca": 12000,
    "f3": 26000,
    "f2": 49000,
    "dtm": 21000,
    "wec": 34000,
}
ACADEMY_PLACES = {
    "red-bull-juniors": 12,
    "ferrari-academy": 8,
    "mclaren-development": 7,
    "mercedes-juniors": 8,
    "alpine-academy": 9,
    "williams-academy": 7,
    "aston-young-driver": 4,
}
LADDER = (
    ("kart-okj", "kart-ok"),
    ("f4-es", "f4-it", "f4-gb"),
    ("freca", "f3"),
    ("f2",),
)


def pathways(state, world):
    day = state["date"]
    drivers = {}
    for e in world["entries"].values():
        for pid in e["crew"]:
            if e["championship"] in CONTRIBUTION:
                drivers.setdefault(pid, e)
    members = {s["person"] for s in state["scholarships"].values()}
    for aid, school in sorted(state["academies"].items()):
        places = ACADEMY_PLACES[aid]
        # A share of the parent's operating envelope. Contracts reserve the
        # allowance. Issuing a scholarship does not credit a second account.
        envelope = state["accounts"][school["org"]]["budget_cents"]
        school["budget_cents"] = envelope * (10 + 4 * places) // 1000
        candidates = [
            pid
            for pid in drivers
            if 12
            <= age_on(state["people"][pid], day)
            <= min(23, world["staff_rules"]["academies"][aid].get("max_age", 23))
        ]
        candidates.sort(key=lambda p: sample(aid + p))
        for i in range(
            sum(s["academy"] == aid for s in state["scholarships"].values()), places
        ):
            levels = LADDER[i % len(LADDER)]
            pid = next(
                (
                    p
                    for p in candidates
                    if p not in members and drivers[p]["championship"] in levels
                ),
                None,
            )
            if not pid:
                pid = next((p for p in candidates if p not in members), None)
            if not pid:
                break
            e = drivers[pid]
            n = sample(aid + pid)
            monthly = min(
                school["budget_cents"] // (places * 70),
                CONTRIBUTION[e["championship"]] * (36 + n % 45),
            )
            backing.enroll(
                state,
                world,
                school,
                pid,
                monthly,
                day,
                ("2025-11-01", "2026-01-01", "2026-07-01")[n % 3],
                n % 4 != 0,
                n % 3 == 0,
                e["org"] if n % 4 else None,
            )
            members.add(pid)
    supported = {d["person"] for d in state["funding"].values()}
    offers = defaultdict(list)
    for pid, e in sorted(drivers.items()):
        series = e["championship"]
        n = sample(pid + "-seat-finance")
        chance = (
            70
            if series.startswith("kart")
            else 58
            if series.startswith("f4")
            else 39
            if series in ("freca", "f2", "f3")
            else 21
            if e["category"] != "Hypercar"
            else 3
        )
        if pid in supported or n % 100 >= chance:
            continue
        # Financing depends on the market and family resources, independently of pace.
        source = ("family", "family", "national", "manufacturer", "family", "sponsor")[
            n // 100 % 6
        ]
        monthly = CONTRIBUTION[series] * (35 + n // 23 % 96)
        if source == "manufacturer":
            makers = world["cars"][e["car"]]["suppliers"]
            payer = makers.get("engine") or makers["tyre"]
            if monthly * 12 > state["accounts"][payer]["budget_cents"] // 40:
                source = "family"
        if source != "manufacturer":
            payer = (
                source
                + "-"
                + (state["people"][pid]["country"] if source == "national" else pid)
            )
        end = ("2025-08-01", "2025-11-01", "2026-01-01", "2026-06-01")[n // 17 % 4]
        key = "seat-backing:" + pid
        state["funding"][key] = backing.agreement(
            key,
            pid,
            source,
            payer,
            monthly,
            day,
            end,
            portable=n % 3 != 0,
            team=e["org"],
            guarantee=n % 11 == 0,
            minimum_starts=1 if n % 7 == 0 else 0,
            best_place=10 if n % 21 == 0 else None,
        )
        if payer not in state["accounts"]:
            offers[payer].append((monthly, end))
    for payer, contracts in offers.items():
        state["backers"].setdefault(payer, 0)
        capital = sum(
            monthly
            * (
                (date.fromisoformat(end).year - 2025) * 12
                + date.fromisoformat(end).month
                - 2
            )
            for monthly, end in contracts
        )
        finance.post(state, payer, "opening-seat-fund:" + payer, capital, "opening")
