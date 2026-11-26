"""Career accounting in EUR cents. The posting table is the single cash journal."""

from collections import defaultdict
from datetime import date
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..domain import RuleError, occupant_on
from ..staff_input import Day, Fields, Id

Cents = Annotated[int, Field(gt=0, le=10**13)]
Category = Literal[
    "staff-payroll",
    "sponsorship",
    "prize",
    "merchandise",
    "driver-backing",
    "licensing",
    "hospitality",
    "supply",
    "production",
    "logistics",
    "repairs",
    "fine",
    "infrastructure",
    "marketing",
    "academy",
    "interest",
    "engineering",
    "loan",
    "investment",
    "dividend",
    "principal",
    "asset-purchase",
    "allocation",
]
CAPITAL = {
    "opening",
    "allocation",
    "investment",
    "loan",
    "principal",
    "dividend",
    "asset-purchase",
}
PERSONAL = "person:player"


class Allocation(Fields):
    payer: Id
    recipient: Id
    amount_cents: Cents


class Reserve(Fields):
    account: Id
    amount_cents: int = Field(ge=0, le=10**13)


class Officer(Fields):
    person: Id


ORDERS = {
    "finance-transfer": Allocation,
    "finance-reserve": Reserve,
    "finance-officer": Officer,
}


class Instalment(Fields):
    id: Id
    contract: Id
    payer: Id
    recipient: Id | None
    amount_cents: Cents
    due: Day
    earned: Day
    category: Category
    reserved: bool = False


class Schedule(Fields):
    installments: list[Instalment] = Field(min_length=1, max_length=600)

    @model_validator(mode="after")
    def unique(self):
        if len({r.id for r in self.installments}) != len(self.installments):
            raise ValueError("Повтор срока платежа.")
        return self


def next_month(day):
    d = date.fromisoformat(day)
    return date(d.year + d.month // 12, d.month % 12 + 1, 1).isoformat()


def activate(state, world, previous=()):
    if "finance" in state:
        return
    pockets = {}
    for org, rec in world["organizations"].items():
        if rec["kind"] == "team":
            pockets["group:" + org] = 0
        for series in rec["programs"]:
            pockets[org + ":" + series] = 0
    state["finance"] = dict(
        since=state["revision"],
        pockets=pockets,
        reserves={},
        instalments={},
        officers={},
        in_kind={},
    )
    from .series import initialize

    initialize(state)
    # Older careers already moved backing cash without a posting for opening equity.
    # Seed the difference only; preserve every historical payment and its date.
    legacy = {**state["backers"], PERSONAL: state["player_cash_cents"]}
    for p in previous:
        if p["org"] in legacy:
            legacy[p["org"]] -= p["delta_cents"]
    for account, value in sorted(legacy.items()):
        if value:
            state["ledger"].append(
                dict(
                    org=account,
                    key="finance-opening",
                    date=state["date"],
                    delta_cents=value,
                    source="opening",
                )
            )


def balance(state, account):
    if account in state["accounts"]:
        return state["accounts"][account]["cash_cents"]
    if account == PERSONAL:
        return state["player_cash_cents"]
    if account in state["backers"]:
        return state["backers"][account]
    if account not in state["finance"]["pockets"]:
        raise RuleError("Неизвестный финансовый счёт.")
    return state["finance"]["pockets"][account]


def available(state, account, *, ignore=None):
    book = state["finance"]
    locked = sum(
        r["amount_cents"]
        for r in book["instalments"].values()
        if r["id"] != ignore
        and r["payer"] == account
        and r["reserved"]
        and r["status"] == "pending"
    )
    return balance(state, account) - book["reserves"].get(account, 0) - locked


def post(state, account, key, delta, source):
    if not delta:
        return
    after = balance(state, account) + delta
    if after < 0:
        raise RuleError("Недостаточно средств для исполнения договора.", 409)
    if account in state["accounts"]:
        wallet = state["accounts"][account]
        wallet.update(cash_cents=after, forecast_cents=after - wallet["payroll_cents"])
    elif account == PERSONAL:
        state["player_cash_cents"] = after
    elif account in state["backers"]:
        state["backers"][account] = after
    else:
        state["finance"]["pockets"][account] = after
    state["ledger"].append(
        dict(org=account, key=key, date=state["date"], delta_cents=delta, source=source)
    )


def transfer(state, payer, recipient, key, amount, source, *, ignore=None):
    if type(amount) is not int or amount <= 0 or payer == recipient:
        raise RuleError("Проверьте сумму и стороны платежа.")
    if recipient is not None:
        balance(state, recipient)
    if available(state, payer, ignore=ignore) < amount:
        raise RuleError("Свободных средств недостаточно.", 409)
    post(state, payer, key, -amount, source)
    if recipient is not None:
        post(state, recipient, key, amount, source)


def register(state, schedule: Schedule):
    book = state["finance"]["instalments"]
    reserve = defaultdict(int)
    new = {}
    for term in schedule.installments:
        row = term.model_dump()
        if term.payer == term.recipient:
            raise RuleError("Плательщик совпадает с получателем.")
        balance(state, term.payer)
        if term.recipient is not None:
            balance(state, term.recipient)
        if term.id in book:
            if any(book[term.id][k] != v for k, v in row.items()):
                raise RuleError("Обязательство уже имеет другие условия.", 409)
            continue
        if term.reserved:
            reserve[term.payer] += term.amount_cents
        new[term.id] = dict(row, status="pending", paid=None)
    if any(v > available(state, k) for k, v in reserve.items()):
        raise RuleError("Для резерва по договору недостаточно денег.", 409)
    book.update(new)


def settle(state):
    day = state["date"]
    for r in sorted(
        state["finance"]["instalments"].values(), key=lambda r: (r["due"], r["id"])
    ):
        if r["status"] != "pending" or r["due"] > day:
            continue
        if available(state, r["payer"], ignore=r["id"]) < r["amount_cents"]:
            continue
        transfer(
            state,
            r["payer"],
            r["recipient"],
            "due:" + r["id"],
            r["amount_cents"],
            r["category"],
            ignore=r["id"],
        )
        r.update(status="paid", paid=day)


def cancel(state, term_id):
    row = state["finance"]["instalments"][term_id]
    if row["status"] == "cancelled":
        return
    if row["status"] == "paid":
        if row["recipient"] is None:
            raise RuleError("Возврат требует определённого плательщика.")
        transfer(
            state,
            row["recipient"],
            row["payer"],
            "refund:" + term_id,
            row["amount_cents"],
            row["category"],
        )
    row.update(status="cancelled", cancelled=state["date"])


def portfolio(state, world):
    org = state["setup"]["org"]
    return [
        org,
        *(org + ":" + s for s in world["organizations"][org]["programs"]),
        *(["group:" + org] if state["setup"]["role"] == "owner" else []),
    ]


def command(state, world, action, args):
    order = ORDERS[action].model_validate(args)
    scope = portfolio(state, world)
    if isinstance(order, Officer):
        org = state["setup"]["org"]
        if order.person not in finance_staff(state, world, org):
            raise RuleError("Нужен действующий сотрудник с финансовой квалификацией.")
        state["finance"]["officers"][org] = order.person
        return
    if isinstance(order, Reserve):
        if order.account not in scope:
            raise RuleError("Нет полномочий на резерв.", 403)
        reserves = state["finance"]["reserves"]
        if order.amount_cents > available(state, order.account) + reserves.get(
            order.account, 0
        ):
            raise RuleError("Резерв превышает свободный остаток.", 409)
        reserves[order.account] = order.amount_cents
        return
    if order.payer not in scope or order.recipient not in scope:
        raise RuleError("Счёт вне полномочий должности.", 403)
    transfer(
        state,
        order.payer,
        order.recipient,
        f"allocation:{state['revision']}",
        order.amount_cents,
        "allocation",
    )


def finance_staff(state, world, org):
    result = {}
    for aid, seat in world["assignments"].items():
        if seat["org"] == org:
            person = occupant_on(state["seats"][aid], state["date"])
            p = state["people"].get(person)
            if p:
                skills = p["skills"]
                rating = max(
                    (
                        skills[k]
                        for k in (
                            "Финансовое планирование",
                            "Бюджет",
                            "Ценообразование",
                        )
                        if k in skills
                    ),
                    default=None,
                )
                if rating is not None:
                    result[person] = dict(id=person, name=p["name"], skill=rating)
    return result


def payroll(state, org, amount, player_share):
    period = state["date"][:7]
    key = "payroll-" + period
    if available(state, org) >= amount:
        post(state, org, key, -amount, "staff-payroll")
        post(state, PERSONAL, key + ":" + org, player_share, "staff-payroll")
        return
    parts = [(None, amount - player_share), (PERSONAL, player_share)]
    terms = [
        Instalment(
            id=f"{key}:{org}:{index}",
            contract=f"payroll:{org}",
            payer=org,
            recipient=receiver,
            amount_cents=value,
            due=state["date"],
            earned=state["date"],
            category="staff-payroll",
        )
        for index, (receiver, value) in enumerate(parts)
        if value
    ]
    if terms:
        register(state, Schedule(installments=terms))
        if org == state["setup"]["org"]:
            state["notices"].append(
                dict(date=state["date"], text="Возник долг по зарплате за " + period)
            )
