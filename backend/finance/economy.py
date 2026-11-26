"""Monthly decisions on actual finite balances. No sporting calendar or result generation."""

from hashlib import sha256
from typing import Literal
from pydantic import Field
from ..domain import RuleError, occupant_on
from ..staff_input import Fields, Id, Day
from . import (
    budget,
    capital,
    facilities,
    market,
    rights,
    available,
    next_month,
    post,
    transfer,
    Instalment,
    Schedule,
    register,
    settle,
)

HOUSE = "economy:households"
DISTRIBUTOR = "economy:distribution"
REGIONS = ("GB", "IT", "DE", "FR", "US", "JP", "ES")
# Monthly addressable wholesale units, game estimates for a licensed collection.
VOLUME = {
    "f1": 48000,
    "wec": 27800,
    "dtm": 23600,
    "f2": 16000,
    "f3": 13000,
    "freca": 4900,
    "f4-gb": 3900,
    "f4-es": 3500,
    "f4-it": 4200,
    "kart-ok": 1350,
    "kart-okj": 980,
}
COST = {"standard": 1130, "premium": 1940}


class Distribution(Fields):
    region: Literal["GB", "IT", "DE", "FR", "US", "JP", "ES"]
    offer: Literal["standard", "premium", "withdraw"]
    unit_cents: int = Field(ge=100, le=20000)


class Month(Fields):
    pass


class RegionalReceipt(Fields):
    reference: Id
    person: Id
    org: Id
    country: Id
    day: Day
    kind: Literal["interview", "home-round", "merchandise", "sponsor-appearance"]
    source: Id
    reach: int = Field(ge=0, le=10**9)
    contract: Id | None = None


class SupplierWork(Fields):
    reference: Id
    contract: Id
    day: Day
    category: Literal["warranty", "shipping", "support", "research"]
    amount_cents: int = Field(gt=0, le=10**12)
    units: int = Field(gt=0, le=10000)
    authorization: Id


ORDERS = {"finance-distribution": Distribution, "finance-month": Month}
PRODUCERS = {
    "finance-regional-receipt": RegionalReceipt,
    "finance-supplier-work": SupplierWork,
}


def stable(*parts):
    return int.from_bytes(sha256("|".join(parts).encode()).digest()[:4], "big")


def initialize(state, world):
    if "economy" in state:
        return
    state["economy"] = dict(
        since=state["revision"],
        licenses={},
        audiences={},
        receipts={},
        work={},
        flows={},
        sales={},
        last=None,
    )
    state["finance"]["pockets"][DISTRIBUTOR] = 0
    post(state, DISTRIBUTOR, "economy-opening", 2000000000, "opening")
    state["finance"]["pockets"][HOUSE] = 0
    post(state, HOUSE, "economy-opening", 12500000000, "opening")
    for org, a in world["organizations"].items():
        drivers = [
            p for s in a["programs"] for p in market.audience(state, world, org, s)
        ]
        # Existing recognition at entry, derived from the organization's real career roster.
        state["economy"]["audiences"][org] = {
            r: max((p["regional_popularity"].get(r, 0) for p in drivers), default=0)
            for r in REGIONS
        }


def leader(state, org):
    for role in ("owner", "manufacturer", "manager"):
        pid = budget.office(state, org, role)
        if pid:
            return state["people"][pid]
    return None


def distribute(state, org, order):
    if state["capital"]["crises"].get(org, {}).get("status") == "bankrupt":
        raise RuleError("Коммерческие продажи приостановлены.")
    licenses = state["economy"]["licenses"]
    if order.offer == "withdraw":
        licenses.pop(org, None)
    else:
        licenses[org] = dict(**order.model_dump(), since=state["date"])


def observe(state, posting):
    org = posting["org"]
    if org not in state["accounts"]:
        return
    rows = (
        state["economy"]
        .setdefault("flows", {})
        .setdefault(org, {})
        .setdefault(posting["date"][:4], {})
    )
    source = posting["source"]
    rows[source] = rows.get(source, 0) + posting["delta_cents"]


def regional(state, world, e):
    rows = state["economy"]["receipts"]
    if e.reference in rows:
        if rows[e.reference] != e.model_dump():
            raise RuleError("Идентификатор публикации занят.")
        return
    person = state["people"].get(e.person)
    if (
        e.day != state["date"]
        or not person
        or e.org not in state["accounts"]
        or e.country not in world["countries"]
    ):
        raise RuleError("Неизвестная сторона, рынок или дата публикации.")
    if not any(
        occupant_on(state["seats"][aid], e.day) == e.person
        for aid, a in world["assignments"].items()
        if a["org"] == e.org
    ):
        raise RuleError("Человек не представляет эту организацию.")
    if e.kind == "home-round":
        if person["country"] != e.country or not any(
            ev["id"] == e.source
            and ev["kind"] == "round"
            and ev.get("country") == e.country
            and ev["start"] <= e.day <= ev["end"]
            for ev in world["events"]
        ):
            raise RuleError("Домашний этап не подтверждён календарём.")
    if e.contract:
        d = state["market"]["contracts"].get(e.contract)
        if not d or d["org"] != e.org or not market.active(d, e.day):
            raise RuleError("Договор кампании не действует.")
    rows[e.reference] = e.model_dump()


def reach(state, org, region):
    people = state["economy"]["audiences"][org].get(region, 0)
    recent = sum(
        r["reach"]
        for r in state["economy"]["receipts"].values()
        if r["org"] == org
        and r["country"] == region
        and r["day"][:4] == state["date"][:4]
    )
    return min(100, people + min(35, recent // 1000))


def sales(state, world):
    day = state["date"]
    licenses = state["economy"]["licenses"]
    proposals = []
    for org, offer in licenses.items():
        if state["capital"]["crises"].get(org, {}).get("status") == "bankrupt":
            continue
        series = [
            p["series"]
            for p in state["capital"]["programs"].values()
            if p["org"] == org and p["status"] == "admitted"
        ]
        if not series and world["organizations"][org]["kind"] != "supplier":
            continue
        price = offer["unit_cents"]
        interest = reach(state, org, offer["region"])
        # Elastic demand with finite regional purchasing power; an overpriced product can sell no units.
        appetite = max(0, (6400 if offer["offer"] == "premium" else 4200) - price)
        units = (
            sum(VOLUME.get(s, 800) for s in series)
            * (40 + interest)
            * appetite
            // (100 * 3000)
        )
        if not series:
            # Supplier brand licensing is weighted by its real installed customer base.
            clients = len(
                {
                    e["org"]
                    for e in world["entries"].values()
                    if org in world["cars"][e["car"]]["suppliers"].values()
                }
            )
            units = (
                (9000 + min(12000, clients * 250))
                * (65 + interest)
                * appetite
                // 300000
            )
        proposals.append((org, units, price, COST[offer["offer"]]))
    spendable = available(state, HOUSE) // 3
    demand = sum(n * p for _, n, p, _ in proposals)
    for org, n, price, cost in sorted(proposals):
        n = n * min(demand, spendable) // max(1, demand)
        n = min(n, max(0, available(state, DISTRIBUTOR)) // cost)
        if price < cost:
            n = min(n, max(0, available(state, org)) // (cost - price))
        if not n:
            continue
        if price < cost:
            try:
                budget.authorize(
                    state, world, org, "marketing", (cost - price) * n, day
                )
            except RuleError:
                continue
        key = "retail:" + org + ":" + day
        transfer(state, DISTRIBUTOR, HOUSE, key + ":goods", cost * n, "production")
        transfer(state, HOUSE, DISTRIBUTOR, key, price * n, "merchandise")
        royalty = (price - cost) * n
        if royalty > 0:
            transfer(state, DISTRIBUTOR, org, key + ":royalty", royalty, "licensing")
        elif royalty < 0:
            transfer(state, org, DISTRIBUTOR, key + ":royalty", -royalty, "marketing")
        fiscal = (
            state["economy"]["sales"]
            .setdefault(org, {})
            .setdefault(day[:4], dict(units=0, revenue_cents=0, cost_cents=0))
        )
        fiscal["units"] += n
        fiscal["revenue_cents"] += price * n
        fiscal["cost_cents"] += cost * n


def supplier_work(state, world, e):
    d = state["market"]["supplies"].get(e.contract)
    rows = state["economy"]["work"]
    if e.reference in rows:
        if rows[e.reference] != e.model_dump():
            raise RuleError("Акт уже принят с другими условиями.")
        return
    if e.day != state["date"] or not d or not market.active(d, e.day):
        raise RuleError("Нет действующего договора поставки.")
    if (
        e.category == "research"
        and not d["development"]
        or e.category == "support"
        and not d["support"]
    ):
        raise RuleError("Работа не согласована в пакете поставки.")
    cat = {
        "warranty": "repairs",
        "support": "supply",
        "shipping": "logistics",
        "research": "engineering",
    }[e.category]
    register(
        state,
        Schedule(
            installments=[
                Instalment(
                    id="service:" + e.reference,
                    contract=e.contract,
                    payer=d["sponsor"],
                    recipient=HOUSE,
                    earned=e.day,
                    due=e.day,
                    category=cat,
                    amount_cents=e.amount_cents,
                )
            ]
        ),
    )
    settle(state)
    rows[e.reference] = e.model_dump()


def supplier_projection(state, org):
    out = []
    for d in state["market"]["supplies"].values():
        if d["sponsor"] != org:
            continue
        terms = [
            r
            for r in state["finance"]["instalments"].values()
            if r["contract"] == d["id"]
            and r["status"] != "cancelled"
            and r["earned"] <= state["date"]
        ]
        gross = sum(
            r["amount_cents"] * (int(r["recipient"] == org) - int(r["payer"] == org))
            for r in terms
        )
        related = [
            r
            for r in state["market"]["contracts"].values()
            if r["sponsor"] == org
            and r["id"].removesuffix(":sponsor") == d["id"].removesuffix(":supply")
        ]
        commercial = sum(
            r["amount_cents"]
            for r in state["finance"]["instalments"].values()
            if r["contract"] in {a["id"] for a in related}
            and r["earned"] <= state["date"]
            and r["status"] != "cancelled"
            and not r.get("withheld")
        )
        work = [
            r for r in state["economy"]["work"].values() if r["contract"] == d["id"]
        ]
        out.append(
            dict(
                contract=d["id"],
                client=d["org"],
                discount_cents=d["discount_cents"],
                service_costs={
                    k: sum(r["amount_cents"] for r in work if r["category"] == k)
                    for k in ("warranty", "research", "shipping", "support")
                },
                units=sum(r["units"] for r in work),
                margin_cents=gross - commercial,
                production_cents=d["cost_cents"],
                commercial_cents=commercial,
                confirmed_reach=sum(
                    r["reach"]
                    for r in state["economy"]["receipts"].values()
                    if r["contract"] in {a["id"] for a in related}
                ),
            )
        )
    return out


def sponsorship(state, world, org, person, seed):
    programs = [
        p
        for p in state["capital"]["programs"].values()
        if p["org"] == org and p["status"] == "admitted"
    ]
    if not programs:
        return
    series = programs[seed % len(programs)]["series"]
    brands = market.participants(world)
    candidates = sorted(
        (
            b
            for b in brands
            if series in brands[b]["series"] and market.funds(state, b) > 10000
        ),
        key=lambda b: stable(b, str(seed)),
    )
    for b in candidates[:5]:
        amount = min(
            market.funds(state, b) // 10,
            max(10000, state["accounts"][org]["payroll_cents"] // 3),
        )
        term = market.Terms(
            sponsor=b,
            org=org,
            series=series,
            role="partner",
            start=state["date"],
            end=facilities.later(state["date"], 365),
            fixed_cents=max(1, amount),
            advance_cents=amount // 5,
            bonus_cents=amount // 10,
            podium=3,
            rights=[market.Rights(zone="garage", share=25)],
            exclusive=False,
            appearances=0,
            reputation=0,
            compensation_cents=amount // 10,
        )
        if market.conflict(state, world, term):
            continue
        try:
            offer = market.propose(state, world, market.Bid(terms=term), org)
            if offer["status"] in ("counter", "offered"):
                market.respond(
                    state,
                    world,
                    market.Reply(offer=offer["id"], decision="accept"),
                    org,
                )
        except RuleError:
            continue
        break


def supply_search(state, world, org, seed):
    clients = {}
    for e in world["entries"].values():
        for product, provider in world["cars"][e["car"]]["suppliers"].items():
            if provider == org:
                clients[(e["org"], e["championship"], product)] = True
    for client, series, product in sorted(clients, key=lambda k: stable(str(seed), *k)):
        if product not in ("engine", "transmission", "tyre"):
            continue
        if any(
            d["org"] == client
            and d["product"] == product
            and market.active(d, state["date"])
            for d in state["market"]["supplies"].values()
        ):
            continue
        price = max(
            10000, min(available(state, client) // 12, available(state, org) // 8)
        )
        bid = market.Bid(
            terms=market.Terms(
                sponsor=org,
                org=client,
                series=series,
                role="technical",
                start=state["date"],
                end=facilities.later(state["date"], 365),
                fixed_cents=max(1, price // 12),
                advance_cents=0,
                bonus_cents=0,
                podium=3,
                rights=[market.Rights(zone="garage", share=25)],
                exclusive=False,
                appearances=0,
                reputation=0,
                compensation_cents=0,
            ),
            supply=market.Supply(
                product=product,
                price_cents=price,
                discount_cents=price // 4,
                seat_cents=0,
                support=True,
                testing=False,
                development=False,
            ),
        )
        try:
            market.propose(state, world, bid, org)
        except RuleError:
            continue
        break


def manage(state, world, org, person, seed):
    funds = available(state, org)
    monthly = state["accounts"][org]["payroll_cents"]
    key = "board:" + org + ":" + state["date"]
    status = state["capital"]["crises"].get(org, {}).get("status")
    if status == "bankrupt":
        return
    if status == "insolvent" or funds < monthly * 2:
        debt = next(
            (
                d
                for d in state["capital"]["loans"].values()
                if d["org"] == org
                and not d["restructured"]
                and any(
                    r["contract"] == d["id"] and r["category"] == "principal"
                    for r in capital.obligations(state, org)
                )
            ),
            None,
        )
        purse = available(state, capital.owner_wallet(org))
        if debt and status == "insolvent":
            order = capital.Restructure(loan=debt["id"])
        elif (
            not debt
            and not status == "insolvent"
            and person["ambition"] >= person["professionalism"]
            and funds >= 10000
        ):
            order = capital.Loan(
                principal_cents=max(1, min(monthly * 2, funds // 3)), months=18
            )
        elif (
            not debt
            and not status == "insolvent"
            and person["professionalism"] >= 80
            and state["capital"]["shares"][org].get(capital.INVESTOR, 0) < 2500
        ):
            order = capital.Sale(basis_points=750, issue=True)
        elif purse > 10000:
            order = capital.Investment(
                source="owner", amount_cents=min(purse, max(10000, monthly * 3))
            )
        elif status == "insolvent":
            a = next(
                (a for a in state["estate"]["assets"].values() if a["owner"] == org),
                None,
            )
            if a:
                order = capital.Trade(asset=a["id"], side="sell")
            else:
                order = capital.Sale(
                    basis_points=min(1000, 100 + person["ambition"] * 7), issue=True
                )
        else:
            order = capital.Loan(
                principal_cents=max(1, min(monthly * 3, funds // 4)), months=12
            )
        capital.act(state, world, org, key, order)
        return
    if org not in state["economy"]["licenses"]:
        region = max(REGIONS, key=lambda r: reach(state, org, r))
        distribute(
            state,
            org,
            Distribution(
                region=region,
                offer="premium" if person["ambition"] >= 70 else "standard",
                unit_cents=2600 + person["professionalism"] * 8,
            ),
        )
    ladder = {
        "kart-okj": "kart-ok",
        "kart-ok": "f4-it",
        "f4-it": "freca",
        "f4-es": "freca",
        "f4-gb": "freca",
        "freca": "f3",
        "f3": "f2",
    }
    if person["ambition"] >= 75 and funds > monthly * 15 and seed % 4 == 0:
        current = [p for p in state["capital"]["programs"].values() if p["org"] == org]
        owned = {p["series"] for p in current}
        target = next(
            (
                ladder[s]
                for s in sorted(owned)
                if s in ladder and ladder[s] not in owned
            ),
            None,
        )
        if target and any(
            d["org"] == org and market.active(d, state["date"])
            for d in state["market"]["contracts"].values()
        ):
            capital.act(
                state,
                world,
                org,
                key,
                capital.Launch(series=target, amount_cents=max(10000, funds // 20)),
            )
            return
    if (
        seed % 3 == 0
        and funds > monthly * (4 + person["professionalism"] // 20)
        and not any(
            a["owner"] == org and a["status"] != "receivership"
            for a in state["estate"]["assets"].values()
        )
    ):
        facilities.act(
            state,
            world,
            org,
            key,
            facilities.Build(
                kind="logistics" if person["ambition"] < 80 else "simulator",
                country=("GB", "IT", "DE", "FR", "US")[seed % 5],
            ),
        )
    elif world["organizations"][org]["kind"] == "supplier":
        supply_search(state, world, org, seed)
    else:
        sponsorship(state, world, org, person, seed)


def resize(state, world, org):
    from ..personnel import update_payroll

    groups = [
        g for g in state["collectives"].values() if g["org"] == org and g["size"] > 1
    ]
    if not groups:
        return
    g = max(groups, key=lambda g: g["payroll_cents"])
    old = g["size"]
    removed = max(1, old // 4)
    wage = g["payroll_cents"] * removed // old
    if wage <= 0:
        return
    key = "redundancy:" + org + ":" + state["date"]
    register(
        state,
        Schedule(
            installments=[
                Instalment(
                    id=key,
                    contract=g["id"],
                    payer=org,
                    recipient=HOUSE,
                    category="staff-payroll",
                    amount_cents=wage,
                    due=state["date"],
                    earned=state["date"],
                )
            ]
        ),
    )
    g.update(size=old - removed, payroll_cents=g["payroll_cents"] - wage)
    update_payroll(state, world, state["date"])
    capital.history(state, org, key, "resize", removed=removed)


def renew_staff(state, world, org):
    from ..employment import propose, ask

    day = state["date"]
    for aid, seat in world["assignments"].items():
        role = seat["position"]
        if seat["org"] != org or role not in ("manager", "driver"):
            continue
        actor = "owner" if role == "manager" else "manager"
        if not budget.office(state, org, actor) or occupant_on(
            state["seats"][aid], day
        ):
            continue
        old = state["seats"][aid]
        if not old:
            continue
        person = state["people"][old[-1]["person"]]
        if person["id"] == "player":
            continue
        wage = ask(state, world, person, seat)
        if wage * 8 > available(state, org):
            continue
        try:
            propose(
                state,
                world,
                dict(
                    person=person["id"],
                    seat=aid,
                    start=facilities.later(day, 3),
                    end=facilities.later(day, 735),
                    salary_cents=wage,
                    bonus_cents=0,
                ),
                org,
                actor,
            )
        except RuleError:
            continue
        break


def consumer_market(state, world, month):
    brands = market.participants(world)
    # Marketing resources are financed by actual spending from the same finite household sector.
    for i, b in enumerate(sorted(brands)):
        if i % 12 != month % 12 or b.startswith("supplier-"):
            continue
        base = state["market"]["budgets"][b]
        amount = min(base // 6, available(state, HOUSE) // 750)
        if amount > 0:
            transfer(
                state,
                HOUSE,
                market.payer(b),
                "customers:" + b + ":" + state["date"],
                amount,
                "commercial-sales",
            )


class ExecutiveMandate(Fields):
    person: Id
    months: int = Field(ge=12, le=36)


def appoint(state, world, org, request):
    from ..employment import ask
    from ..personnel import update_payroll

    aid = org + ":manufacturer"
    seat = world["assignments"].get(aid)
    person = state["people"].get(request.person)
    if (
        not seat
        or not person
        or person["position"] != "manufacturer"
        or occupant_on(state["seats"][aid], state["date"])
    ):
        raise RuleError("Мандат правления недоступен.")
    if any(
        occupant_on(rows, state["date"]) == person["id"]
        for rows in state["seats"].values()
    ):
        raise RuleError("Кандидат уже занимает пост.")
    wage = ask(state, world, person, seat)
    budget.authorize(state, world, org, "staff-payroll", wage, state["date"])
    end = state["date"]
    for _ in range(request.months):
        end = next_month(end)
    old = state["seats"][aid][-1]
    state["seats"][aid].append(
        dict(
            old,
            person=person["id"],
            start=state["date"],
            end=end,
            salary_cents=wage,
            buyout_cents=2 * wage,
            offer=None,
        )
    )
    update_payroll(state, world, state["date"])


def tick(state, world):
    day = state["date"]
    e = state["economy"]
    if not day.endswith("-01") or e["last"] == day:
        return
    e["last"] = day
    player = state["setup"]["org"]
    firms = sorted(state["accounts"])
    month = int(day[:4]) * 12 + int(day[5:7])
    # Stagger annual strategic reviews; liquidity emergencies are considered every month.
    for i, org in enumerate(firms):
        if org == player:
            continue
        if state["capital"]["crises"].get(org, {}).get("status") == "bankrupt":
            continue
        if (
            day > "2026-01-01"
            and world["organizations"][org]["kind"] == "supplier"
            and not budget.office(state, org, "manufacturer")
        ):
            old = state["seats"][org + ":manufacturer"][-1]["person"]
            try:
                appoint(state, world, org, ExecutiveMandate(person=old, months=24))
            except RuleError:
                pass
        p = leader(state, org)
        if not p:
            continue
        if (
            org not in e["licenses"]
            and state["capital"]["crises"].get(org, {}).get("status") != "bankrupt"
        ):
            region = max(REGIONS, key=lambda r: reach(state, org, r))
            distribute(
                state,
                org,
                Distribution(
                    region=region,
                    offer="premium" if p["ambition"] >= 70 else "standard",
                    unit_cents=3100 if p["ambition"] >= 70 else 2900,
                ),
            )
        if day > "2026-01-01" and i % 6 == month % 6:
            renew_staff(state, world, org)
        if (
            day > "2026-01-01"
            and available(state, org) < state["accounts"][org]["payroll_cents"] * 4
        ):
            resize(state, world, org)

        if (
            day.endswith("-01-01")
            and not state["capital"]["crises"].get(org, {}).get("status") == "bankrupt"
        ):
            manager = budget.office(state, org, "manager") or p["id"]
            plan = budget.open_year(state, org, day[:4])
            free = max(0, available(state, org))
            total = min(
                max(6, free * (100 + p["ambition"] // 2) // 100),
                max(6, sum(plan["allocations"].values()) * 2),
            )
            alloc = {
                k: total * n // 100
                for k, n in zip(budget.PARTS, (52, 17, 13, 6, 7, 5), strict=True)
            }
            alloc["reserve"] += total - sum(alloc.values())
            try:
                proposal = budget.propose(
                    state,
                    org,
                    budget.Proposal(
                        year=int(day[:4]),
                        allocations=alloc,
                        reason="Годовой план по ликвидности и целям правления.",
                    ),
                    manager,
                )
                budget.decide(
                    state,
                    world,
                    org,
                    budget.Decision(
                        proposal=proposal["id"],
                        response="approve",
                        reason="Утверждено с учётом оценки ликвидности.",
                    ),
                    p["id"],
                )
            except RuleError:
                pass
        if (
            i % 12 != month % 12
            and available(state, org) >= state["accounts"][org]["payroll_cents"] * 2
            and state["capital"]["crises"].get(org, {}).get("status") != "insolvent"
        ):
            continue
        try:
            manage(state, world, org, p, stable(org, day))
        except RuleError:
            continue
    for d in sorted(state["market"]["contracts"].values(), key=lambda r: r["id"]):
        if d["org"] == player or not market.active(d, day):
            continue
        for placement in d["rights"]:
            if placement["zone"] in rights.CAR or placement["zone"] in state[
                "market"
            ].get("mounts", {}).get(d["id"], {}):
                continue
            try:
                rights.mount(
                    state,
                    world,
                    dict(
                        contract=d["id"],
                        zone=placement["zone"],
                        x=placement.get("offset", 0) + placement["share"] // 2,
                        scale=placement["share"],
                    ),
                    org=d["org"],
                )
            except RuleError:
                continue
    sales(state, world)
    consumer_market(state, world, month)


def command(state, world, action, args):
    if action == "finance-distribution":
        distribute(state, state["setup"]["org"], Distribution.model_validate(args))
    else:
        from ..employment import HORIZON, advance

        if state["date"] < HORIZON or state["pending"]:
            raise RuleError("Сначала завершите опубликованный спортивный календарь.")
        advance(state, world, next_month(state["date"]))
        state["checkpoint"] = "finance:" + state["date"]


def projection(state, world):
    org = state["setup"]["org"]
    e = state["economy"]
    return dict(
        date=state["date"],
        license=e["licenses"].get(org),
        sales=e["sales"].get(org, {}),
        audience={r: reach(state, org, r) for r in REGIONS},
        suppliers=supplier_projection(state, org),
        flows=e.get("flows", {}).get(org, {}),
        receipts=[r for r in e["receipts"].values() if r["org"] == org],
        can_advance=state["date"] >= "2026-01-01" and not state["pending"],
    )
