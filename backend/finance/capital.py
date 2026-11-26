"""Finite capital markets, ownership and insolvency proceedings in EUR cents."""

from datetime import date
from typing import Literal
from pydantic import Field
from ..domain import RuleError
from ..staff_input import Fields, Id
from . import (
    Cents,
    Instalment,
    Schedule,
    PERSONAL,
    available,
    balance,
    next_month,
    post,
    register,
    transfer,
)
from . import market, facilities

BANK = "capital:bank"
INVESTOR = "capital:fund"


class Investment(Fields):
    amount_cents: Cents
    source: Literal["personal", "owner"]


class Dividend(Fields):
    amount_cents: Cents


class Loan(Fields):
    principal_cents: Cents
    months: int = Field(ge=2, le=60)


class Repayment(Fields):
    loan: Id


class Sale(Fields):
    basis_points: int = Field(ge=1, le=10000)
    issue: bool


class ProgramSale(Fields):
    program: Id
    side: Literal["buy", "sell"]


class Trade(Fields):
    asset: Id
    side: Literal["buy", "sell"]


class Restructure(Fields):
    loan: Id


class Admission(Fields):
    program: Id
    organization: Id
    predecessor: Id | None = None
    decision: Literal["admit", "withdraw", "replace"]
    regulation: Id
    reference: Id


class OrganizationChange(Fields):
    reference: Id
    organization: Id
    decision: Literal["incorporate", "sale", "closure"]
    owner: Id
    consideration_cents: int = Field(ge=0, le=10**13)


ORDERS = {
    "finance-invest": Investment,
    "finance-dividend": Dividend,
    "finance-loan": Loan,
    "finance-repay": Repayment,
    "finance-equity": Sale,
    "finance-asset": Trade,
    "finance-program-sale": ProgramSale,
    "finance-restructure": Restructure,
}
PRODUCERS = {
    "finance-program-admission": Admission,
    "finance-organization-change": OrganizationChange,
}


def owner_wallet(org):
    return "owner:" + org


def initialize(state, world):
    if "capital" in state:
        return
    s = state["capital"] = dict(
        since=state["revision"],
        shares={},
        loans={},
        crises={},
        history=[],
        programs={},
        changes={},
    )
    wallets = state["finance"]["pockets"]
    for org in sorted(state["accounts"]):
        owner = owner_wallet(org)
        wallets[owner] = 0
        post(
            state,
            owner,
            "capital-opening",
            state["accounts"][org]["budget_cents"] // 2,
            "opening",
        )
        s["shares"][org] = {owner: 10000}
    for wallet, amount in [(BANK, 100000000000), (INVESTOR, 30000000000)]:
        wallets[wallet] = 0
        post(state, wallet, "capital-opening", amount, "opening")
    for key, p in world["programs"].items():
        s["programs"][key] = dict(
            id=key,
            org=p["org"],
            series=p["championship"],
            status="admitted",
            since=state["date"],
        )


def obligations(state, org):
    return [
        r
        for r in state["finance"]["instalments"].values()
        if r["payer"] == org and r["status"] == "pending"
    ]


def valuation(state, org):
    day = state["date"]
    holdings = [a for a in state["estate"]["assets"].values() if a["owner"] == org]
    assets = sum(a["book_cents"] for a in holdings)
    terms = obligations(state, org)
    debt = sum(
        r["amount_cents"]
        for r in terms
        if r["category"] == "principal" or r["earned"] <= day
    )
    overdue = sum(
        r["amount_cents"] for r in terms if r["due"] < day and not r.get("withheld")
    )
    revenue = sum(
        r["amount_cents"]
        for r in state["finance"]["instalments"].values()
        if r["recipient"] == org
        and r["category"] in ("sponsorship", "supply", "licensing")
        and r["status"] == "pending"
        and not r.get("withheld")
    )
    cash = balance(state, org)
    income_value = revenue // 4
    return dict(
        cash_cents=cash,
        assets_cents=assets,
        debt_cents=debt,
        overdue_cents=overdue,
        contract_value_cents=income_value,
        value_cents=max(0, cash + assets + income_value - debt - overdue // 2),
    )


def schedule(state, org, key, principal, months, rate, first=None):
    day = first or next_month(state["date"])
    left = principal
    rows = []
    for i in range(months):
        payment = principal // months + int(i < principal % months)
        interest = (left * rate + 60000) // 120000
        for kind, amount in [("principal", payment), ("interest", interest)]:
            if amount:
                rows.append(
                    Instalment(
                        id=f"{key}:{i}:{kind}",
                        contract=key,
                        payer=org,
                        recipient=BANK,
                        category=kind,
                        amount_cents=amount,
                        due=day,
                        earned=day,
                    )
                )
        left -= payment
        day = next_month(day)
    register(state, Schedule(installments=rows))


def lend(state, org, key, order):
    v = valuation(state, org)
    principal = order.principal_cents
    if v["overdue_cents"] or principal > max(0, v["value_cents"] * 60 // 100):
        raise RuleError("Кредитор отказал по оценке платёжеспособности.", 409)
    rate = 450 + min(
        1600, (v["debt_cents"] + principal) * 450 // max(1, v["value_cents"])
    )
    transfer(state, BANK, org, key, principal, "loan")
    schedule(state, org, key, principal, order.months, rate)
    state["capital"]["loans"][key] = dict(
        id=key,
        org=org,
        principal_cents=principal,
        months=order.months,
        rate_bps=rate,
        start=state["date"],
        restructured=False,
    )


def shares_sale(state, org, key, order):
    s = state["capital"]["shares"][org]
    owner = owner_wallet(org)
    bp = order.basis_points
    if bp >= 10000 and order.issue or not order.issue and bp > s.get(owner, 0):
        raise RuleError("Недоступная доля.")
    value = valuation(state, org)["value_cents"]
    price = max(1, value * bp // (10000 - bp if order.issue else 10000))
    if not value:
        raise RuleError("Для неплатёжеспособной организации нужна реструктуризация.")
    transfer(state, INVESTOR, org if order.issue else owner, key, price, "investment")
    if order.issue:
        previous = dict(s)
        for k, v in previous.items():
            s[k] = v * (10000 - bp) // 10000
        # Assign the rounding remainder to the largest pre-issue holding.
        k = max(sorted(previous), key=previous.get)
        s[k] += 10000 - bp - sum(s.values())
    else:
        s[owner] -= bp
    s[INVESTOR] = s.get(INVESTOR, 0) + bp
    history(
        state,
        org,
        key,
        "issue" if order.issue else "sale",
        amount_cents=price,
        share=bp,
    )


def history(state, org, key, kind, **extra):
    state["capital"]["history"].append(
        dict(org=org, reference=key, kind=kind, date=state["date"], **extra)
    )


def loan_action(state, org, key, order):
    d = state["capital"]["loans"].get(order.loan)
    if not d or d["org"] != org:
        raise RuleError("Кредит организации отсутствует.")
    rows = [
        r
        for r in obligations(state, org)
        if r["contract"] == d["id"] or r["contract"] == d.get("replacement")
    ]
    principal = sum(r["amount_cents"] for r in rows if r["category"] == "principal")
    due = sum(
        r["amount_cents"]
        for r in rows
        if r["category"] == "interest" and r["earned"] <= state["date"]
    )
    if not principal:
        raise RuleError("Основной долг погашен.")
    if isinstance(order, Restructure):
        if d["restructured"]:
            raise RuleError("Уступка кредитора уже использована.")
        # Accrued interest remains payable; unearned future interest is replaced.
        schedule(
            state,
            org,
            key,
            principal,
            min(60, d["months"] + 6),
            d["rate_bps"] + 150,
            next_month(next_month(state["date"])),
        )
        d.update(restructured=True, replacement=key)
    else:
        if available(state, org) < principal + due:
            raise RuleError("Денег для досрочного погашения недостаточно.", 409)
        transfer(state, org, BANK, key, principal, "principal")
        if due:
            transfer(state, org, BANK, key + ":interest", due, "interest")
    for r in rows:
        if r["category"] == "interest" and r["earned"] <= state["date"]:
            if isinstance(order, Repayment):
                r.update(status="paid", paid=state["date"])
        else:
            r.update(status="cancelled", cancelled=state["date"])
    history(
        state,
        org,
        key,
        "restructure" if isinstance(order, Restructure) else "repay",
        amount_cents=principal,
    )


def asset_trade(state, world, org, key, order):
    a = state["estate"]["assets"].get(order.asset)
    if (
        not a
        or a["owner"] not in (org, INVESTOR)
        or (a["owner"] == org) != (order.side == "sell")
    ):
        raise RuleError("Актив не выставлен этой стороной.")
    buyer = INVESTOR if order.side == "sell" else org
    price = max(1, a["book_cents"] * (75 if buyer == INVESTOR else 95) // 100)
    if buyer == org:
        from .budget import authorize

        authorize(state, world, org, "asset-purchase", price, state["date"])
    transfer(state, buyer, a["owner"], key, price, "asset-purchase")
    gain = price - a["book_cents"] if order.side == "sell" else 0
    a.update(owner=buyer, book_cents=price)
    history(
        state,
        org,
        key,
        order.side,
        asset=a["id"],
        amount_cents=price,
        profit_cents=gain,
    )


def program_trade(state, world, org, key, order):
    p = state["capital"]["programs"].get(order.program)
    if not p or (p["org"] != org if order.side == "sell" else p["org"] != INVESTOR):
        raise RuleError("Программа не выставлена продавцом.")
    if (
        order.side == "buy"
        and p["series"] not in world["organizations"][org]["programs"]
    ):
        raise RuleError("Нет организационного допуска в эту серию.")
    # A going-concern sale transfers identifiable working capital and the team's commercial interest.
    # Sporting entry approval is separate, and historical entries keep their IDs.
    account = order.program
    basis = max(
        10000,
        balance(state, account)
        + state["accounts"][world["programs"][account]["org"]]["budget_cents"] // 20,
    )
    price = basis * (80 if order.side == "sell" else 100) // 100
    buyer = INVESTOR if order.side == "sell" else org
    transfer(state, buyer, p["org"], key, price, "asset-purchase")
    previous = p["org"]
    p.update(org=buyer, status="withdrawn", since=state["date"], previous=previous)
    for deal in state["market"]["contracts"].values():
        if (
            deal["org"] == previous
            and deal["series"] == p["series"]
            and deal["status"] == "signed"
        ):
            market.end_deal(state, deal, previous, "Программа продана.", breach=True)
    history(state, org, key, order.side, program=order.program, amount_cents=price)


def act(state, world, org, key, order):
    if state["capital"]["crises"].get(org, {}).get("status") == "bankrupt":
        raise RuleError("Организация находится в процедуре ликвидации.", 409)
    if isinstance(order, Investment):
        payer = PERSONAL if order.source == "personal" else owner_wallet(org)
        transfer(state, payer, org, key, order.amount_cents, "investment")
    elif isinstance(order, Dividend):
        v = valuation(state, org)
        if v["overdue_cents"] or order.amount_cents > min(
            available(state, org), max(0, v["cash_cents"] - v["debt_cents"])
        ):
            raise RuleError("Распределение нарушит обязательства организации.", 409)
        shares = state["capital"]["shares"][org]
        amounts = {k: order.amount_cents * n // 10000 for k, n in shares.items()}
        amounts[max(sorted(shares), key=shares.get)] += order.amount_cents - sum(
            amounts.values()
        )
        for k, amount in sorted(amounts.items()):
            if amount:
                transfer(state, org, k, key + ":" + k, amount, "dividend")
    elif isinstance(order, Loan):
        lend(state, org, key, order)
    elif isinstance(order, Sale):
        shares_sale(state, org, key, order)
    elif isinstance(order, ProgramSale):
        program_trade(state, world, org, key, order)
    elif isinstance(order, Trade):
        asset_trade(state, world, org, key, order)
    else:
        loan_action(state, org, key, order)


def command(state, world, action, args):
    org = state["setup"]["org"]
    if state["setup"]["role"] == "manager":
        raise RuleError("Требуется решение собственника.", 403)
    if state["capital"]["shares"][org].get(
        owner_wallet(org), 0
    ) < 5001 and action not in ("finance-invest", "finance-repay"):
        raise RuleError("Для решения необходим контрольный пакет.", 403)
    act(
        state,
        world,
        org,
        f"capital:{state['revision']}",
        ORDERS[action].model_validate(args),
    )


def admission(state, world, e):
    p = state["capital"]["programs"].get(e.program)
    if (
        not p
        or e.organization not in state["accounts"]
        or world["championships"][p["series"]]["rules_id"] != e.regulation
    ):
        raise RuleError("Нет программы, организации или версии допуска.")
    if e.decision == "withdraw" and p["org"] == e.organization:
        p.update(status="withdrawn", since=state["date"])
    elif (
        e.decision in ("admit", "replace")
        and p["status"] in ("withdrawn", "closed")
        and (e.decision != "replace" or p["org"] == e.predecessor)
    ):
        if (
            state["capital"]["crises"].get(e.organization, {}).get("status")
            == "bankrupt"
        ):
            raise RuleError("Замена не прошла финансовый допуск.")
        p.update(org=e.organization, status="admitted", since=state["date"])
    else:
        raise RuleError("Решение допуска противоречит состоянию заявки.")
    history(state, e.organization, e.reference, e.decision, program=e.program)


def integration(state, world, e):
    changes = state["capital"]["changes"]
    if e.reference in changes:
        if changes[e.reference] != e.model_dump():
            raise RuleError("Основание уже занято.", 409)
        return
    if isinstance(e, Admission):
        admission(state, world, e)
    else:
        if e.organization not in state["accounts"]:
            raise RuleError("Требуется зарегистрированная идентичность организации.")
        balance(state, e.owner)
        if e.decision == "sale":
            shares = state["capital"]["shares"][e.organization]
            if not e.consideration_cents:
                raise RuleError("Нужна цена выкупа.")
            remaining = e.consideration_cents
            held = sorted(k for k, v in shares.items() if v)
            for i, k in enumerate(held):
                value = (
                    remaining
                    if i == len(held) - 1
                    else e.consideration_cents * shares[k] // 10000
                )
                if value and k != e.owner:
                    transfer(
                        state, e.owner, k, e.reference + ":" + k, value, "investment"
                    )
                remaining -= value
            shares.clear()
            shares[e.owner] = 10000
        elif e.decision == "closure":
            bankrupt(state, world, e.organization, e.reference)
        else:
            if e.organization in state["capital"]["shares"]:
                raise RuleError("Организация уже учреждена.")
            state["capital"]["shares"][e.organization] = {e.owner: 10000}
            if e.consideration_cents:
                transfer(
                    state,
                    e.owner,
                    e.organization,
                    e.reference,
                    e.consideration_cents,
                    "investment",
                )
        history(state, e.organization, e.reference, e.decision)
    changes[e.reference] = e.model_dump()


def losses(state, world, org, all_staff=False):
    day = state["date"]
    seats = [
        (k, r)
        for k, rows in state["seats"].items()
        if world["assignments"][k]["org"] == org
        for r in rows
        if r["person"] != state["player_id"]
        and r["start"] <= day
        and (not r["end"] or day < r["end"])
    ]
    for k, r in sorted(seats, key=lambda x: (-x[1]["salary_cents"], x[0]))[
        : None if all_staff else 1
    ]:
        r.update(end=day, exit_reason="insolvency")
    deals = sorted(
        (
            d
            for d in state["market"]["contracts"].values()
            if d["org"] == org and d["status"] == "signed"
        ),
        key=lambda d: d["id"],
    )
    for d in deals[: None if all_staff else 1]:
        market.end_deal(
            state, d, d["sponsor"], "Нарушение финансовых гарантий.", breach=True
        )


def bankrupt(state, world, org, key):
    losses(state, world, org, True)
    for p in state["capital"]["programs"].values():
        if p["org"] == org:
            p.update(status="closed", since=state["date"])
    for g in state["collectives"].values():
        if g["org"] == org:
            g.update(size=0, payroll_cents=0)
    for a in state["estate"]["assets"].values():
        if a["owner"] == org:
            a["status"] = "receivership"
    state["capital"]["crises"].setdefault(org, {}).update(
        status="bankrupt", since=state["date"]
    )
    history(state, org, key, "bankrupt")


def tick(state, world):
    if not state["date"].endswith("-01"):
        return
    day = state["date"]
    for org in sorted(state["accounts"]):
        crisis = state["capital"]["crises"].get(org, {})
        if crisis.get("status") == "bankrupt":
            continue
        late = [
            r
            for r in obligations(state, org)
            if r["due"] < day
            and not r.get("withheld")
            and r["category"] not in ("sponsorship",)
        ]
        if not late:
            if crisis.get("status") == "insolvent":
                crisis.update(status="recovered", since=day)
            continue
        age = (
            date.fromisoformat(day) - date.fromisoformat(min(r["due"] for r in late))
        ).days
        if age < 30:
            continue
        if crisis.get("status") != "insolvent":
            state["capital"]["crises"][org] = dict(status="insolvent", since=day)
            losses(state, world, org)
            history(state, org, "crisis:" + day, "insolvent")
        elif age >= 180:
            bankrupt(state, world, org, "default:" + day)


def projection(state, world):
    org = state["setup"]["org"]
    s = state["capital"]
    return dict(
        valuation=valuation(state, org),
        owner_cents=balance(state, owner_wallet(org))
        if state["setup"]["role"] != "manager"
        else None,
        personal_cents=balance(state, PERSONAL),
        shares=s["shares"][org],
        loans=[
            dict(
                d,
                remaining_cents=sum(
                    r["amount_cents"]
                    for r in obligations(state, org)
                    if r["category"] == "principal"
                    and r["contract"] in (d["id"], d.get("replacement"))
                ),
            )
            for d in s["loans"].values()
            if d["org"] == org
        ],
        crisis=s["crises"].get(org, {"status": "solvent"}),
        history=[r for r in s["history"] if r["org"] == org],
        programs=[p for p in s["programs"].values() if p["org"] in (org, INVESTOR)],
        assets=[
            dict(
                id=a["id"],
                kind=facilities.TYPES[a["kind"]][0],
                owner=a["owner"],
                book_cents=a["book_cents"],
            )
            for a in state["estate"]["assets"].values()
            if a["owner"] in (org, INVESTOR)
        ],
    )
