"""Shared finite commercial market. Bids are evaluated and signed against current resources."""

import csv
import json
from datetime import date, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Literal
from pydantic import Field, model_validator
from ..domain import RuleError, occupant_on
from ..staff_input import Day, Fields, Id
from .. import professional
from . import (
    Instalment,
    Schedule,
    available,
    post,
    register,
    settle,
    transfer,
    next_month,
)

DATA = Path(__file__).resolve().parents[1] / "data" / "finance"
with (DATA / "brands.csv").open(encoding="utf8") as stream:
    BRANDS = {
        r["id"]: dict(
            r,
            markets=r["markets"].split(),
            series=r["series"].split(),
            budget_cents=int(r["budget_eur"]) * 100,
        )
        for r in csv.DictReader(stream)
    }
PARTNERS = json.loads((DATA / "partners.json").read_text())
COUNTRIES = {
    "pirelli": "IT",
    "ferrari": "IT",
    "bmw": "DE",
    "porsche": "DE",
    "honda-rbpt": "JP",
    "mercedes": "DE",
    "renault": "FR",
    "mecachrome": "FR",
    "hewland": "GB",
    "3mo": "FR",
    "xtrac": "GB",
    "michelin": "FR",
    "toyota": "JP",
    "goodyear": "US",
    "abarth": "IT",
    "sadev": "FR",
    "hankook": "KR",
    "iame": "IT",
    "maxxis": "TW",
    "tm-kart": "IT",
    "vortex": "IT",
    "henza-kart": "DE",
}
ZONE = Literal[
    "flank",
    "upper",
    "nose",
    "sill",
    "shoulder",
    "wing",
    "suit",
    "uniform",
    "garage",
    "hospitality",
    "press",
    "launch",
]
ROLE = Literal["title", "principal", "technical", "partner", "personal", "academy"]


class Rights(Fields):
    zone: ZONE
    share: int = Field(ge=10, le=100)
    shared: bool = False
    offset: int = Field(default=0, ge=0, le=90)
    priority: int = Field(default=0, ge=0, le=15)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def fits(self):
        if self.offset + self.share > 100 or (
            self.color
            and self.zone not in ("flank", "upper", "nose", "sill", "shoulder", "wing")
        ):
            raise ValueError(
                "Доля и позиция должны помещаться в поверхности. Цвет задаётся для кузова."
            )
        return self


class Terms(Fields):
    sponsor: Id
    org: Id
    series: Id
    role: ROLE
    start: Day
    end: Day
    fixed_cents: int = Field(ge=1, le=10**12)
    advance_cents: int = Field(ge=0, le=10**12)
    interval: Literal[1, 3, 6] = 3
    bonus_cents: int = Field(ge=0, le=10**11)
    podium: int = Field(ge=1, le=10)
    rights: list[Rights] = Field(max_length=12)
    exclusive: bool
    appearances: int = Field(ge=0, le=24)
    reputation: int = Field(ge=0, le=100)
    compensation_cents: int = Field(ge=0, le=10**11)
    renew: bool = True
    person: Id | None = None
    academy: Id | None = None

    @model_validator(mode="after")
    def valid(self):
        if (
            not self.start < self.end
            or self.advance_cents > self.fixed_cents
            or (date.fromisoformat(self.end) - date.fromisoformat(self.start)).days
            > 1827
        ):
            raise ValueError("Проверьте аванс, сумму и срок договора.")
        if (self.role == "personal") != bool(self.person) or (
            self.role == "academy"
        ) != bool(self.academy):
            raise ValueError("Проверьте получателя личной или академической поддержки.")
        if len({r.zone for r in self.rights}) != len(self.rights):
            raise ValueError("Поверхность указана дважды.")
        return self


class Supply(Fields):
    product: Literal["engine", "transmission", "tyre"]
    price_cents: int = Field(gt=0, le=10**11)
    discount_cents: int = Field(ge=0, le=10**11)
    support: bool
    academy_person: Id | None = None
    seat_cents: int = Field(ge=0, le=10**10)
    testing: bool
    development: bool


class Bid(Fields):
    terms: Terms
    supply: Supply | None = None


class Reply(Fields):
    offer: Id
    decision: Literal["accept", "reject", "counter"]
    counter: Bid | None = None
    sponsorship: bool = True
    supply: bool = False
    discount: bool = False
    support: bool = False
    seat: bool = False
    testing: bool = False
    development: bool = False


class End(Fields):
    contract: Id


ORDERS = {"finance-bid": Bid, "finance-bid-reply": Reply, "finance-end-deal": End}


def participants(world):
    result = dict(BRANDS)
    for oid, r in world["organizations"].items():
        if r["kind"] != "supplier" or not set(r["lines"]) & {
            "engine",
            "transmission",
            "tyre",
        }:
            continue
        country = COUNTRIES[oid.removeprefix("supplier-")]
        result[oid] = dict(
            id=oid,
            name=r["name"],
            country=country,
            category="components",
            markets=[country, "GB", "DE"],
            series=r["programs"],
            priority="technology",
            budget_cents=0,
        )
    return result


def payer(sponsor):
    return sponsor if sponsor.startswith("supplier-") else "brand:" + sponsor


def funds(state, sponsor):
    return max(
        0,
        min(
            available(state, payer(sponsor)),
            state["market"]["budgets"][sponsor]
            - sum(
                d["fixed_cents"]
                for d in state["market"]["contracts"].values()
                if d["sponsor"] == sponsor
                and d["start"][:4] == state["date"][:4]
                and d["status"] != "cancelled"
            ),
        ),
    )


def active(row, day):
    return row["status"] == "signed" and row["start"] <= day < row["end"]


def installments(terms, contract, recipient, first_due=None):
    start, end = terms.start, terms.end
    dates = []
    due = first_due or start
    if first_due is None:
        for _ in range(terms.interval):
            due = next_month(due)
    while due < end:
        dates.append(due)
        for _ in range(terms.interval):
            due = next_month(due)
    dates = dates or [(date.fromisoformat(end) - timedelta(days=1)).isoformat()]
    advance = terms.advance_cents
    values = [(start, advance, dates[0])] if advance else []
    base, extra = divmod(terms.fixed_cents - advance, len(dates))
    values.extend((day, base + int(i < extra), day) for i, day in enumerate(dates))
    return [
        Instalment(
            id=f"{contract}:{i}",
            contract=contract,
            payer=payer(terms.sponsor),
            recipient=recipient,
            amount_cents=amount,
            due=due,
            earned=earned,
            category="sponsorship",
            reserved=True,
        )
        for i, (due, amount, earned) in enumerate(values)
        if amount
    ]


def audience(state, world, org, series):
    drivers = []
    for aid, seat in world["assignments"].items():
        if (
            seat["org"] == org
            and seat["series"] == series
            and seat["position"] == "driver"
        ):
            pid = occupant_on(state["seats"][aid], state["date"])
            if pid:
                drivers.append(state["people"][pid])
    return drivers


def targets(state, world, brand):
    # A fixed scouting shortlist for this season. Only public identities enter the profile.
    return state["market"]["interests"][brand["id"]]


def assessment(state, world, brand, terms):
    people = audience(state, world, terms.org, terms.series)
    if terms.person:
        people = [p for p in people if p["id"] == terms.person]
    priority = brand["priority"]
    profile = targets(state, world, brand)
    reach = max(
        (
            max(
                (p["regional_popularity"].get(m, 0) for m in brand["markets"]),
                default=0,
            )
            for p in people
        ),
        default=0,
    )
    popularity = max((p["popularity"] for p in people), default=0)
    reputation = max((p["reputation"] for p in people), default=0)
    if "economy" in state and not terms.person:
        # Company recognition persists across individual sporting contracts.
        baseline = state["economy"]["audiences"].get(terms.org, {})
        reach = max(
            reach, max((baseline.get(r, 0) for r in brand["markets"]), default=0)
        )
        executive = next(
            (
                state["people"][pid]
                for role in ("manager", "owner")
                if (
                    pid := occupant_on(
                        state["seats"].get(terms.org + ":" + role, []), state["date"]
                    )
                )
            ),
            None,
        )
        if executive:
            reputation = max(reputation, executive["reputation"])
    match = terms.series in brand["series"]
    affinity = terms.org in profile["organizations"] or any(
        p["id"] in profile["drivers"] for p in people
    )
    score = (
        18
        + 20 * match
        + reach // 5
        + 14 * affinity
        + min(10, len(terms.rights) * 4)
        + min(8, terms.appearances * 2)
    )
    score += 12 * int(
        (priority == "technology" and terms.role == "technical")
        or (priority == "juniors" and terms.role in ("academy", "personal"))
        or (priority == "visibility" and terms.role in ("title", "principal"))
        or (
            priority == "hospitality"
            and any(r.zone == "hospitality" for r in terms.rights)
        )
    )
    classified = [
        r["place"]
        for p in people
        for r in state["starts"].get(p["id"], {}).values()
        if r.get("series") == terms.series
        and r.get("place")
        and r["day"] <= state["date"]
    ]
    if classified:
        score += max(0, 11 - min(classified))
    score += min(8, max(0, popularity - profile["min_popularity"]) // 4)
    score -= max(0, profile["min_reputation"] - reputation)
    limit = min(
        funds(state, terms.sponsor),
        state["market"]["budgets"][terms.sponsor] * max(5, min(90, score)) // 160,
    )
    return score, limit, reputation


class Homologation(Fields):
    reference: Id
    provider: Id
    entry: Id
    product: Literal["tyre", "engine", "transmission"]
    regulation: Id
    start: Day
    end: Day
    works: bool = False


def homologate(state, world, h):
    entry = world["entries"].get(h.entry)
    if (
        not entry
        or h.start >= h.end
        or h.provider not in world["organizations"]
        or h.product not in world["organizations"][h.provider]["lines"]
    ):
        raise RuleError("Неизвестная заявка, компонент или поставщик.")
    rules = world["championships"][entry["championship"]]
    if rules["rules_id"] != h.regulation:
        raise RuleError("Не совпадает регламент допуска.")
    if h.product == "tyre":
        from ..supply import tyre_eligible

        if not tyre_eligible(
            rules["tyre_market"][entry["category"]], h.provider, homologated=True
        ):
            raise RuleError("Регламент поставщиков шин не допускает эту марку.")
    rows = state["market"].setdefault("homologations", {})
    if h.reference in rows and rows[h.reference] != h.model_dump():
        raise RuleError("Решение уже зарегистрировано.")
    rows[h.reference] = h.model_dump()


def supplier_eligible(state, world, entry, sponsor, product, start, end):
    initial = world["cars"][entry["car"]]["suppliers"].get(product) == sponsor
    certified = any(
        h["entry"] == entry["id"]
        and h["provider"] == sponsor
        and h["product"] == product
        and h["start"] <= start
        and end <= h["end"]
        for h in state["market"].get("homologations", {}).values()
    )
    if product == "tyre":
        from ..supply import tyre_eligible

        return tyre_eligible(
            world["championships"][entry["championship"]]["tyre_market"][
                entry["category"]
            ],
            sponsor,
            homologated=initial or certified,
        )
    return initial or certified


def validate(state, world, bid, *, signing=False):
    t = bid.terms
    sponsors = participants(world)
    if (
        t.sponsor not in sponsors
        or t.org not in world["organizations"]
        or t.series not in world["organizations"][t.org]["programs"]
        or world["organizations"][t.org]["kind"] != "team"
    ):
        raise RuleError("Неизвестный партнёр или гоночная программа.")
    if (
        state.get("capital", {}).get("crises", {}).get(t.org, {}).get("status")
        == "bankrupt"
        or state.get("capital", {}).get("crises", {}).get(t.sponsor, {}).get("status")
        == "bankrupt"
    ):
        raise RuleError("Организация не допущена к сделкам.")
    if "capital" in state and not any(
        p["org"] == t.org and p["series"] == t.series and p["status"] == "admitted"
        for p in state["capital"]["programs"].values()
    ):
        raise RuleError("Коммерческий договор требует допущенной программы.")
    if t.end <= state["date"] or (not signing and t.start < state["date"]):
        raise RuleError("Срок предложения истёк.")
    if t.person and t.person not in {
        p["id"] for p in audience(state, world, t.org, t.series)
    }:
        raise RuleError("Пилот не выступает за выбранную программу.")
    if t.academy and state["academies"].get(t.academy, {}).get("org") != t.org:
        raise RuleError("Академия не входит в организацию.")
    if bid.supply:
        s = bid.supply
        if not t.sponsor.startswith("supplier-") or s.discount_cents > s.price_cents:
            raise RuleError("Недопустимая скидка или поставщик.")
        entries = [
            e
            for e in world["entries"].values()
            if e["org"] == t.org and e["championship"] == t.series
        ]
        if not entries or not all(
            supplier_eligible(state, world, e, t.sponsor, s.product, t.start, t.end)
            for e in entries
        ):
            raise RuleError(
                "Для этого пакета требуется действующая поставка компонента во все заявки программы."
            )
        if bool(s.seat_cents) != bool(s.academy_person) or (
            s.academy_person
            and not any(
                row["person"] == s.academy_person
                and row["start"] <= state["date"] < row["end"]
                for row in state["scholarships"].values()
            )
        ):
            raise RuleError("Финансирование доступно для действующего воспитанника.")
    return sponsors[t.sponsor]


def conflict(state, world, terms):
    category = participants(world)[terms.sponsor]["category"]
    for d in state["market"]["contracts"].values():
        if (
            d["status"] != "signed"
            or d["org"] != terms.org
            or d["end"] <= terms.start
            or terms.end <= d["start"]
        ):
            continue
        if (
            d["sponsor"] == terms.sponsor
            and d["role"] == terms.role
            and (d["person"], d["academy"]) == (terms.person, terms.academy)
        ):
            return "Уже действует договор с этим партнёром."
        if d["role"] == terms.role == "title" or (
            d["sponsor"] != terms.sponsor
            and d["category"] == category
            and (d["exclusive"] or terms.exclusive)
        ):
            return "Действуют исключительные права партнёра."

    from .rights import collision

    return collision(state, world, terms)


def sign_sponsor(state, world, terms, key, source=None, first_due=None):
    err = conflict(state, world, terms)
    if err:
        raise RuleError(err, 409)
    if terms.fixed_cents > funds(state, terms.sponsor):
        raise RuleError("Маркетинговый бюджет уже занят другим договором.", 409)
    receiver = terms.org
    if terms.person or terms.academy:
        receiver = (
            ("driver:" + terms.person) if terms.person else ("academy:" + terms.academy)
        )
        state["finance"]["pockets"].setdefault(receiver, 0)
    register(
        state, Schedule(installments=installments(terms, key, receiver, first_due))
    )
    row = dict(
        **terms.model_dump(),
        id=key,
        category=participants(world)[terms.sponsor]["category"],
        status="signed",
        receiver=receiver,
        source=source,
        fulfilled_events=[],
        end_reason=None,
    )
    state["market"]["contracts"][key] = row
    return row


def initialize(state, world):
    if "market" in state:
        return
    players = participants(world)
    book = state["market"] = dict(
        since=state["revision"],
        budgets={},
        interests={},
        contracts={},
        offers={},
        supplies={},
    )
    for brand in players.values():
        bid = brand["id"]
        cash = brand["budget_cents"]
        if bid.startswith("supplier-"):
            cash = state["accounts"][bid]["cash_cents"] // 4
        else:
            state["finance"]["pockets"][payer(bid)] = 0
            post(state, payer(bid), "opening", cash, "opening")
        book["budgets"][bid] = cash
        teams = sorted(
            {
                e["org"]
                for e in world["entries"].values()
                if e["championship"] in brand["series"]
            }
        )
        drivers = sorted(
            {
                p
                for e in world["entries"].values()
                if e["org"] in teams
                for p in e["crew"]
            }
        )
        seed = int.from_bytes(sha256(bid.encode()).digest()[:4], "big")
        book["interests"][bid] = dict(
            organizations=[
                teams[(seed + i) % len(teams)] for i in range(min(4, len(teams)))
            ],
            drivers=[drivers[seed % len(drivers)]],
            min_reputation=35 + seed % 25,
            min_popularity=30 + seed % 35,
        )
    for bid, org, role, start, url in PARTNERS:
        start = max(start, state["date"])
        if start >= "2026-01-01":
            continue
        amount = min(
            book["budgets"][bid] // 5, state["accounts"][org]["payroll_cents"] * 2
        )
        t = Terms(
            sponsor=bid,
            org=org,
            series=world["organizations"][org]["programs"][0],
            role=role,
            start=start,
            end="2026-01-01",
            fixed_cents=amount,
            advance_cents=0,
            interval=3,
            bonus_cents=amount // 20,
            podium=3,
            rights=[],
            exclusive=True,
            appearances=2,
            reputation=30,
            compensation_cents=amount // 8,
        )
        from .rights import start_rights

        t = t.model_copy(update={"rights": start_rights(world, org, t.series, bid)})
        sign_sponsor(
            state,
            world,
            t,
            "partner-2025:" + bid + ":" + org,
            url,
            first_due=max(start, "2025-03-31"),
        )


def sign_supply(state, world, bid, reply, key):
    t, s = bid.terms, bid.supply
    if s is None:
        raise RuleError("В предложении нет поставки.")
    if any(
        d["org"] == t.org
        and d["series"] == t.series
        and d["product"] == s.product
        and d["start"] < t.end
        and t.start < d["end"]
        and d["status"] == "signed"
        for d in state["market"]["supplies"].values()
    ):
        raise RuleError("На этот период уже согласована поставка.", 409)
    entries = [
        e
        for e in world["entries"].values()
        if e["org"] == t.org and e["championship"] == t.series
    ]
    works = bool(entries) and all(
        any(
            h["works"]
            and h["provider"] == t.sponsor
            and h["product"] == s.product
            and h["entry"] == e["id"]
            and h["start"] <= t.start
            and h["end"] >= t.end
            for h in state["market"].get("homologations", {}).values()
        )
        for e in entries
    )
    status = (
        "works"
        if works
        else "priority"
        if reply.support and s.support and reply.testing and s.testing
        else "commercial"
        if reply.sponsorship
        else "technical"
        if reply.support and s.support
        else "client"
    )
    discount = s.discount_cents if reply.discount else 0
    support = reply.support and s.support
    # Marginal costs and the support allocation are disclosed game estimates.
    cost = s.price_cents * (68 if support else 58) // 100
    price = s.price_cents - discount
    rows = []
    for suffix, payee, paying, amt, category in [
        ("delivery", t.sponsor, t.org, price, "supply"),
        ("production", None, t.sponsor, cost, "production"),
        ("seat", t.org, t.sponsor, s.seat_cents if reply.seat else 0, "driver-backing"),
    ]:
        if amt:
            from .budget import authorize

            authorize(state, world, paying, category, amt, t.start)
            rows.append(
                Instalment(
                    id=key + ":" + suffix,
                    contract=key,
                    payer=paying,
                    recipient=payee,
                    amount_cents=amt,
                    due=max(state["date"], t.start),
                    earned=t.start,
                    category=category,
                    reserved=True,
                )
            )
    if rows:
        register(state, Schedule(installments=rows))
    state["market"]["supplies"][key] = dict(
        id=key,
        sponsor=t.sponsor,
        org=t.org,
        series=t.series,
        product=s.product,
        start=t.start,
        end=t.end,
        status="signed",
        partnership=status,
        list_cents=s.price_cents,
        discount_cents=discount,
        sale_cents=price,
        cost_cents=cost,
        support=support,
        academy_person=s.academy_person if reply.seat else None,
        seat_cents=s.seat_cents if reply.seat else 0,
        testing=reply.testing and s.testing,
        development=reply.development and s.development,
    )


def experience(state, world, offer):
    t = offer["terms"]
    offices = [(t["org"], "manager")]
    if t["sponsor"].startswith("supplier-"):
        offices.append((t["sponsor"], "supply"))
    for org, role in offices:
        pid = occupant_on(state["seats"][org + ":" + role], state["date"])
        if not pid:
            continue
        professional.record(
            state,
            world,
            professional.Activity(
                event_id=offer["id"] + ":conclusion",
                person=pid,
                role=role,
                org=org,
                date=state["date"],
                kind="commercial",
                skills=["Переговоры"],
                difficulty=60,
                result="completed" if offer["status"] == "signed" else "failed",
                context=dict(series=t["series"])
                if t["series"] in world["organizations"][org]["programs"]
                else {},
            ),
        )


def propose(state, world, bid, actor):
    brand = validate(state, world, bid)
    t = bid.terms
    if actor not in (t.org, t.sponsor):
        raise RuleError("Нужны полномочия стороны переговоров.", 403)
    if any(
        o["terms"]["org"] == t.org
        and o["terms"]["sponsor"] == t.sponsor
        and o["status"] in ("counter", "offered")
        for o in state["market"]["offers"].values()
    ):
        raise RuleError("С этим партнёром уже идут переговоры.", 409)
    score, limit, rep = assessment(state, world, brand, t)
    key = "commercial:" + str(len(state["market"]["offers"]) + 1)
    row = dict(
        **bid.model_dump(),
        id=key,
        actor=actor,
        status="offered",
        date=state["date"],
        deadline=(date.fromisoformat(state["date"]) + timedelta(days=14)).isoformat(),
        history=[bid.model_dump()],
        reason="Предложение соответствует коммерческим интересам.",
        score=score,
    )
    state["market"]["offers"][key] = row
    if actor == t.org:
        if bid.supply:
            requested = bid.supply
            support_cost = (
                requested.price_cents * (68 if requested.support else 58) // 100
            )
            concession = max(0, requested.price_cents - support_cost) + limit // 10
            if requested.discount_cents > concession:
                row["supply"]["discount_cents"] = concession
                row.update(
                    status="counter",
                    reason="Производитель ограничил субсидию с учётом себестоимости и охвата.",
                )
                row["history"].append(
                    dict(terms=dict(row["terms"]), supply=dict(row["supply"]))
                )
        veto = conflict(state, world, t)
        if (veto and not bid.supply) or (
            not bid.supply and (score < 28 or limit < 1 or rep < t.reputation)
        ):
            row.update(
                status="rejected",
                reason=veto
                or "Аудитория и репутация программы не отвечают задачам кампании.",
            )
        elif t.fixed_cents > limit or score < 45:
            if limit < 1 and bid.supply:
                row.update(
                    status="counter", reason="Доступна только техническая поставка."
                )
            else:
                amount = max(1, min(limit, t.fixed_cents))
                row["terms"].update(
                    fixed_cents=amount,
                    advance_cents=min(t.advance_cents, amount // 5),
                    appearances=min(24, t.appearances + 1),
                )
                row["history"].append(
                    dict(terms=dict(row["terms"]), supply=row["supply"])
                )
                row.update(
                    status="counter",
                    reason="Партнёр пересмотрел стоимость, аванс и число мероприятий.",
                )
    if row["status"] == "rejected":
        experience(state, world, row)
    return row


def respond(state, world, reply, actor, *, deferred=False):
    o = state["market"]["offers"].get(reply.offer)
    if (
        not o
        or o["status"] not in ("counter", "offered")
        or o["deadline"] < state["date"]
    ):
        raise RuleError("Предложение закрыто или срок ответа истёк.")
    bid = Bid(terms=o["terms"], supply=o["supply"])
    t = bid.terms
    if actor not in (t.org, t.sponsor):
        raise RuleError("Предложение другой организации.", 403)
    if reply.decision == "reject":
        o.update(status="rejected", reason="Сторона отклонила предложение.")
        experience(state, world, o)
        return
    if reply.decision == "counter":
        counter = reply.counter
        if not counter or (counter.terms.sponsor, counter.terms.org) != (
            t.sponsor,
            t.org,
        ):
            raise RuleError("Стороны встречного предложения должны совпадать.")
        o["status"] = "superseded"
        next_offer = propose(state, world, counter, actor)
        next_offer["history"] = o["history"] + next_offer["history"]
        return
    validate(state, world, bid, signing=True)
    if not reply.sponsorship and not reply.supply:
        raise RuleError("Выберите принимаемые части пакета.")
    if reply.sponsorship:
        score, limit, rep = assessment(state, world, participants(world)[t.sponsor], t)
        if limit < t.fixed_cents or rep < t.reputation:
            raise RuleError(
                "Условия превышают доступный бюджет или требования репутации.", 409
            )
    # Reserve all payments before committing either agreement. SQLite commands roll back both on rejection.
    if reply.supply:
        sign_supply(state, world, bid, reply, o["id"] + ":supply")
    if reply.sponsorship:
        sign_sponsor(state, world, t, o["id"] + ":sponsor")
    if reply.supply:
        state["market"]["supplies"][o["id"] + ":supply"].update(
            package=o["id"],
            sponsorship=o["id"] + ":sponsor" if reply.sponsorship else None,
        )
    if reply.sponsorship:
        state["market"]["contracts"][o["id"] + ":sponsor"].update(
            package=o["id"], supply=o["id"] + ":supply" if reply.supply else None
        )
    if not deferred:
        settle(state)
    o.update(
        status="signed",
        reason="Принятые договоры вступают в силу по согласованным датам.",
    )
    experience(state, world, o)


def end_deal(state, deal, actor, reason, *, breach=False):
    if not deal or actor not in (deal["org"], deal["sponsor"]):
        raise RuleError("Нет полномочий на прекращение договора.", 403)
    if deal["status"] != "signed":
        raise RuleError("Договор уже завершён.")
    day = state["date"]
    for r in state["finance"]["instalments"].values():
        if (
            r["contract"] == deal["id"]
            and r["status"] == "pending"
            and r["earned"] > day
        ):
            r.update(status="cancelled", cancelled=day)
    if not breach and deal["compensation_cents"]:
        outgoing = actor if actor == deal["org"] else payer(actor)
        recipient = payer(deal["sponsor"]) if actor == deal["org"] else deal["receiver"]
        transfer(
            state,
            outgoing,
            recipient,
            deal["id"] + ":exit",
            deal["compensation_cents"],
            "backing-exit",
        )
    deal.update(status="terminated", end_reason=reason, ended=day)


def command(state, world, action, args):
    order = ORDERS[action].model_validate(args)
    actor = state["setup"]["org"]
    if isinstance(order, SupplyExit):
        end_supply(state, actor, order.contract)
    elif isinstance(order, Bid):
        propose(state, world, order, actor)
    elif isinstance(order, Reply):
        # A manufacturer may propose a package; the independent client chooses which clauses to accept.
        o = state["market"]["offers"].get(order.offer)
        if (
            o
            and actor == o["terms"]["sponsor"]
            and o["actor"] == actor
            and order.decision == "accept"
        ):
            raise RuleError("Клиент ещё не принял предложение.", 409)
        respond(state, world, order, actor)
    else:
        end_deal(
            state,
            state["market"]["contracts"].get(order.contract),
            actor,
            "Расторжение по инициативе стороны",
        )


def tick(state, world):
    day = state["date"]
    market = state["market"]
    for o in market["offers"].values():
        if o["status"] in ("counter", "offered") and o["deadline"] < day:
            o.update(status="expired", reason="Истёк срок ответа.")
    for d in sorted(
        [*market["contracts"].values(), *market["supplies"].values()],
        key=lambda d: d["id"],
    ):
        if (
            d["status"] == "signed"
            and "appearances" in d
            and d["start"] <= day < d["end"]
        ):
            attendees = audience(state, world, d["org"], d["series"])
            if d["person"]:
                attendees = [p for p in attendees if p["id"] == d["person"]]
            if attendees and max(p["reputation"] for p in attendees) < d["reputation"]:
                end_deal(
                    state, d, d["sponsor"], "Репутация ниже договорной", breach=True
                )
        if d["status"] == "signed" and "fulfilled_events" in d:
            if d["end"] <= day and len(d["fulfilled_events"]) < d["appearances"]:
                d.update(renew=False, end_reason="Не выполнен график мероприятий")
            elif any(
                row.get("withheld", "9999-12-31")
                <= (date.fromisoformat(day) - timedelta(days=30)).isoformat()
                for row in state["finance"]["instalments"].values()
                if row["contract"] == d["id"] and row["status"] == "pending"
            ):
                end_deal(
                    state,
                    d,
                    d["sponsor"],
                    "Нарушение рекламных обязательств",
                    breach=True,
                )
        if d["status"] == "signed" and d["end"] <= day:
            d["status"] = "expired"
    player = state["setup"]["org"]
    brands = participants(world)
    if day[8:] == "01":
        invite(state, world, day, market, player)
        renewals(state, world, day)
    for key in sorted(market["offers"]):
        o = state["market"]["offers"][key]
        t = o["terms"]
        if (
            o["status"] not in ("offered", "counter")
            or o["actor"] != t["sponsor"]
            or t["org"] == player
        ):
            continue
        supplier = o["supply"]
        take_supply = bool(
            supplier and available(state, t["org"]) >= supplier["price_cents"]
        )
        take_sponsor = (
            not conflict(state, world, Terms.model_validate(t))
            and funds(state, t["sponsor"]) >= t["fixed_cents"]
        )
        score, limit, rep = assessment(
            state, world, brands[t["sponsor"]], Terms.model_validate(t)
        )
        take_sponsor = bool(
            take_sponsor and limit >= t["fixed_cents"] and rep >= t["reputation"]
        )
        reply = Reply(
            offer=o["id"],
            decision="accept" if take_supply or take_sponsor else "reject",
            supply=take_supply,
            sponsorship=take_sponsor,
            discount=True,
            support=True,
            seat=True,
        )
        # NPC negotiations can lose the same race for funds and rights as a player.
        # Stage the economic records until both linked contracts have passed validation.
        from collections import ChainMap
        from . import Schedule, Instalment

        terms = ChainMap({}, state["finance"]["instalments"])
        staged = {
            **state,
            "market": {
                **market,
                "contracts": dict(market["contracts"]),
                "supplies": dict(market["supplies"]),
                "offers": {**market["offers"], key: dict(o)},
            },
            "finance": {
                **state["finance"],
                "instalments": terms,
                "pockets": dict(state["finance"]["pockets"]),
            },
        }
        try:
            respond(staged, world, reply, t["org"], deferred=True)
        except RuleError as err:
            o.update(status="rejected", reason=str(err))
        else:
            state["finance"]["pockets"].update(staged["finance"]["pockets"])
            if terms.maps[0]:
                register(
                    state,
                    Schedule(
                        installments=[
                            Instalment.model_validate(
                                {k: r[k] for k in Instalment.model_fields}
                            )
                            for r in terms.maps[0].values()
                        ]
                    ),
                )
            market.update(staged["market"])
            settle(state)


def invite(state, world, day, market, player):
    # At most one sponsor-led search each month. Actual signed commitments constrain the shortlist.
    brands = participants(world)
    order = sorted(brands, key=lambda b: sha256((day + b).encode()).digest())
    for bid in order:
        brand = brands[bid]
        budget = funds(state, bid)
        if budget < 10000 or bid == player:
            continue
        choices = targets(state, world, brand)["organizations"]
        org = choices[(int(day[:4]) * 12 + int(day[5:7])) % len(choices)]
        series = next(
            (
                s
                for s in world["organizations"][org]["programs"]
                if s in brand["series"]
            ),
            None,
        )
        if not series or any(
            o["status"] in ("counter", "offered")
            and o["terms"]["org"] == org
            and o["terms"]["sponsor"] == bid
            for o in market["offers"].values()
        ):
            continue
        term = Terms(
            sponsor=bid,
            org=org,
            series=series,
            role="partner",
            start=day,
            end=(date.fromisoformat(day) + timedelta(days=365)).isoformat(),
            fixed_cents=budget // 10,
            advance_cents=budget // 100,
            bonus_cents=budget // 100,
            podium=3,
            rights=[Rights(zone="press", share=25, shared=True)],
            exclusive=False,
            reputation=20,
            appearances=2,
            compensation_cents=budget // 100,
        )
        if conflict(state, world, term):
            continue
        try:
            propose(state, world, Bid(terms=term), bid)
        except RuleError:
            continue
        break


def renewals(state, world, day):
    market = state["market"]
    horizon = (date.fromisoformat(day) + timedelta(days=32)).isoformat()
    for key in sorted(market["contracts"]):
        d = market["contracts"][key]
        if (
            not active(d, day)
            or not d["renew"]
            or not day < d["end"] <= horizon
            or d.get("renewal_offer")
        ):
            continue
        if any(
            o["terms"]["org"] == d["org"]
            and o["terms"]["sponsor"] == d["sponsor"]
            and o["status"] in ("counter", "offered")
            for o in market["offers"].values()
        ):
            continue
        amount = min(d["fixed_cents"], funds(state, d["sponsor"]) // 4)
        if amount <= 0:
            continue
        terms = Terms.model_validate({k: d[k] for k in Terms.model_fields}).model_copy(
            update={
                "start": d["end"],
                "end": (date.fromisoformat(d["end"]) + timedelta(days=365)).isoformat(),
                "fixed_cents": amount,
                "advance_cents": 0,
            }
        )
        if not conflict(state, world, terms):
            try:
                d["renewal_offer"] = propose(
                    state, world, Bid(terms=terms), d["sponsor"]
                )["id"]
            except RuleError as err:
                d.update(renew=False, end_reason=str(err))


def projection(state, world):
    org = state["setup"]["org"]
    market = state["market"]
    return dict(
        scholars=sorted(
            {
                r["person"]
                for r in state["scholarships"].values()
                if r["start"] <= state["date"] < r["end"]
            }
        ),
        brands=[
            dict(
                b,
                **targets(state, world, b),
                budget_cents=market["budgets"][b["id"]],
                remaining_estimate_cents=funds(state, b["id"]) // 100000 * 100000,
            )
            for b in participants(world).values()
        ],
        offers=[
            o
            for o in market["offers"].values()
            if org in (o["terms"]["sponsor"], o["terms"]["org"])
        ],
        contracts=[
            d for d in market["contracts"].values() if org in (d["org"], d["sponsor"])
        ],
        supplies=[
            {k: v for k, v in d.items() if k != "cost_cents" or org == d["sponsor"]}
            for d in market["supplies"].values()
            if org in (d["sponsor"], d["org"])
        ],
    )


class Appearance(Fields):
    contract: Id
    event: Id
    day: Day
    person: Id


def appearance(state, world, order):
    d = state["market"]["contracts"].get(order.contract)
    if not d or order.day != state["date"] or not active(d, order.day):
        raise RuleError("Для мероприятия требуется действующий договор.")
    if not any(
        occupant_on(state["seats"][aid], order.day) == order.person
        for aid, s in world["assignments"].items()
        if s["org"] == d["org"]
    ):
        raise RuleError("Участник не представляет партнёра.")
    if order.event not in d["fulfilled_events"]:
        d["fulfilled_events"].append(order.event)


def result_bonus(state, world, pid, entry_id, event_id, day, place):
    if place is None:
        return
    entry = world["entries"][entry_id]
    for d in state["market"]["contracts"].values():
        if (
            not active(d, day)
            or not d["bonus_cents"]
            or d["org"] != entry["org"]
            or d["series"] != entry["championship"]
            or place > d["podium"]
            or (d["person"] and d["person"] != pid)
        ):
            continue
        from .rights import audit

        if not all(check["fulfilled"] for check in audit(state, world, d, entry_id)):
            continue
        term = Instalment(
            id=d["id"] + ":bonus:" + entry_id + ":" + event_id,
            contract=d["id"],
            payer=payer(d["sponsor"]),
            recipient=d["receiver"],
            amount_cents=d["bonus_cents"],
            due=day,
            earned=day,
            category="sponsorship",
        )
        register(state, Schedule(installments=[term]))
    settle(state)


class SupplyExit(Fields):
    contract: Id


def end_supply(state, actor, key):
    d = state["market"]["supplies"].get(key)
    if not d or actor not in (d["org"], d["sponsor"]) or d["status"] != "signed":
        raise RuleError("Нет действующего договора поставки.")
    for row in state["finance"]["instalments"].values():
        if (
            row["contract"] == key
            and row["status"] == "pending"
            and row["earned"] > state["date"]
        ):
            row.update(status="cancelled", cancelled=state["date"])
    d.update(status="terminated", ended=state["date"])


ORDERS["finance-end-supply"] = SupplyExit


def collaborative_work(state, supply_id, kind, rules_id, allowed_rules, day):
    """Engineering consumes this permission alongside its own ATR and capacity reservation."""
    contract = state["market"]["supplies"].get(supply_id)
    return bool(
        contract
        and active(contract, day)
        and kind in ("testing", "development")
        and contract[kind]
        and rules_id in allowed_rules
        and allowed_rules[rules_id].get(kind) is True
    )
