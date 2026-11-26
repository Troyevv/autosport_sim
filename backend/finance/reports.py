"""Financial statements and forecasts derived from postings, dated seats and signed terms."""

from calendar import monthrange
from collections import defaultdict
from datetime import date
from . import (
    CAPITAL,
    PERSONAL,
    available,
    balance,
    finance_staff,
    next_month,
    portfolio,
)
from .. import backing
from ..domain import RuleError


def cash_rows(db, cid, accounts):
    params = ",".join("?" for _ in accounts)
    return [
        dict(r)
        for r in db.execute(
            f"SELECT org,date,key,source,delta_cents FROM posting WHERE career=? AND org IN ({params}) ORDER BY date,org,key",
            [cid, *accounts],
        )
    ]


def scheduled_payroll(state, world, org, first, end):
    days = monthrange(first.year, first.month)[1]
    total = sum(
        g["payroll_cents"] for g in state["collectives"].values() if g["org"] == org
    )
    for aid, rows in state["seats"].items():
        if world["assignments"][aid]["org"] != org:
            continue
        for r in rows:
            left = max(
                first,
                date.fromisoformat(r["start"]),
                date.fromisoformat(state["personnel_start"]),
            )
            right = min(end, date.fromisoformat(r["end"])) if r["end"] else end
            total += r["salary_cents"] * max(0, (right - left).days) // days
    return total


def statement(state, world, db, cid, scope="organization"):
    org = state["setup"]["org"]
    wallets = portfolio(state, world)
    scopes = [org, PERSONAL, *wallets[1:]]
    if state["setup"]["role"] == "owner":
        scopes.append("consolidated")
    if "capital" in state and state["setup"]["role"] in ("owner", "manufacturer"):
        scopes.append("owner:" + org)
    if scope == "organization":
        scope = org
    if scope not in scopes:
        raise RuleError("Нет доступа к выбранному финансовому контуру.", 403)
    accounts = set(wallets if scope == "consolidated" else [scope])
    day = state["date"]
    cash = sum(balance(state, a) for a in accounts)
    free = sum(available(state, a) for a in accounts)
    journal = cash_rows(db, cid, sorted(accounts))
    book = state["finance"]
    terms = [
        r
        for r in book["instalments"].values()
        if r["payer"] in accounts or r["recipient"] in accounts
    ]
    employees = finance_staff(state, world, org)
    officer = employees.get(book["officers"].get(org))
    # A qualified director narrows uncertainty on future seat funding and personnel turnover.
    width = 25 - (officer["skill"] // 5 if officer else 0)
    income = expense = opening = 0
    activity = defaultdict(int)
    history = defaultdict(int)
    breakdown = defaultdict(lambda: dict(income_cents=0, expense_cents=0))
    direct = defaultdict(int)

    def operation(source, value):
        nonlocal income, expense
        inc = max(0, value)
        out = max(0, -value)
        income += inc
        expense += out
        breakdown[source]["income_cents"] += inc
        breakdown[source]["expense_cents"] += out
        activity[source] += value

    for p in journal:
        value, source = p["delta_cents"], p["source"]
        history[p["date"][:7]] += value
        if source == "opening":
            opening += value
        if source not in CAPITAL and not p["key"].startswith(("due:", "refund:")):
            direct[(p["date"], p["key"], source)] += value
    for (_, _, source), value in direct.items():
        operation(source, value)

    for entry in state.get("capital", {}).get("history", []):
        if entry["org"] in accounts and entry.get("profit_cents"):
            value = entry["profit_cents"]
            operation(
                "depreciation" if entry["kind"] == "depreciation" else "disposal", value
            )

    def direction(row):
        return int(row["recipient"] in accounts) - int(row["payer"] in accounts)

    margins = defaultdict(int)
    for r in terms:
        if (
            r["category"] not in CAPITAL
            and r["earned"] <= day
            and not r.get("withheld")
            and r["status"] != "cancelled"
        ):
            value = direction(r) * r["amount_cents"]
            operation(r["category"], value)
            margins[r["contract"]] += value
    schedule = [
        dict(
            id=r["id"],
            category=r["category"],
            contract=r["contract"],
            due=r["due"],
            amount_cents=direction(r) * r["amount_cents"],
            overdue=r["due"] <= day,
        )
        for r in terms
        if r["status"] == "pending" and direction(r)
    ]
    seats = defaultdict(list)
    for aid, rows in state["seats"].items():
        for row in rows:
            seats[row["person"]].append((aid, row))
    for key, r in state["funding"].items():
        for recipient, amt in r["arrears"].items():
            sign = int(recipient in accounts) - int(r["payer"] in accounts)
            if sign:
                schedule.append(
                    dict(
                        id=key + ":" + recipient,
                        category="driver-backing",
                        contract=key,
                        due=r["end"],
                        amount_cents=sign * amt,
                        overdue=True,
                    )
                )
                operation("driver-backing", sign * amt)
    forecast = []
    base = low = high = cash
    first = date.fromisoformat(day).replace(day=1)
    for n in range(6):
        due = next_month(first.isoformat())
        end = date.fromisoformat(due)
        payroll = (
            scheduled_payroll(state, world, org, first, end) if org in accounts else 0
        )
        if PERSONAL in accounts:
            days = monthrange(first.year, first.month)[1]
            for _, r in seats[state["player_id"]]:
                left = max(
                    first,
                    date.fromisoformat(r["start"]),
                    date.fromisoformat(state["personnel_start"]),
                )
                right = min(end, date.fromisoformat(r["end"])) if r["end"] else end
                payroll -= r["salary_cents"] * max(0, (right - left).days) // days
        flows = []
        if payroll:
            flows.append(
                dict(
                    id="forecast:salary:" + due,
                    category="staff-payroll",
                    contract="payroll",
                    due=due,
                    amount_cents=-payroll,
                    overdue=False,
                )
            )
        for key, r in state["funding"].items():
            for receiver, amt in backing.period_amounts(
                state, world, r, first, end, seats[r["person"]]
            ).items():
                sign = int(receiver in accounts) - int(r["payer"] in accounts)
                if sign:
                    flows.append(
                        dict(
                            id=key + ":" + receiver + ":" + due,
                            category="driver-backing",
                            contract=key,
                            due=due,
                            amount_cents=sign * amt,
                            overdue=False,
                        )
                    )
        if org in accounts and "estate" in state:
            from .facilities import quote

            for a in state["estate"]["assets"].values():
                if (
                    a["owner"] == org
                    and a["ready"] <= due
                    and a["status"] != "receivership"
                ):
                    flows.append(
                        dict(
                            id="forecast:maintenance:" + a["id"] + ":" + due,
                            category="infrastructure",
                            contract=a["id"],
                            due=due,
                            amount_cents=-quote(a["kind"], a["country"])[
                                "monthly_cents"
                            ]
                            * a["level"],
                            overdue=False,
                        )
                    )
        if org in accounts and org in state.get("economy", {}).get("licenses", {}):
            months = defaultdict(int)
            for entry in journal:
                if entry["source"] == "licensing" and entry["key"].startswith(
                    "retail:"
                ):
                    months[entry["date"][:7]] += entry["delta_cents"]
            if months:
                recent = sorted(months)[
                    -(3 if officer and officer["skill"] >= 50 else 1) :
                ]
                flows.append(
                    dict(
                        id="forecast:licensing:" + due,
                        category="licensing",
                        contract="distribution",
                        due=due,
                        amount_cents=sum(months[m] for m in recent) // len(recent),
                        overdue=False,
                    )
                )
        fixed = sum(
            r["amount_cents"]
            for r in schedule
            if (not n or first.isoformat() < r["due"]) and r["due"] <= due
        )
        change = fixed + sum(r["amount_cents"] for r in flows)
        risk = sum(abs(r["amount_cents"]) for r in flows) * width // 100
        base += change
        low += change - risk
        high += change + risk
        forecast.append(
            dict(date=due, base_cents=base, negative_cents=low, optimistic_cents=high)
        )
        if n == 0:
            nearest = flows
        first = end
    schedule.extend(nearest)
    overdue = sum(
        -r["amount_cents"] for r in schedule if r["overdue"] and r["amount_cents"] < 0
    )
    return dict(
        currency="EUR",
        scope=scope,
        scopes=scopes,
        accounts=wallets,
        cash_cents=cash,
        available_cents=free,
        reserve_cents=cash - free,
        opening_cents=opening,
        cash_flow_cents=cash - opening,
        net_financial_assets_cents=cash
        + sum(
            direction(r) * r["amount_cents"]
            for r in terms
            if r["status"] == "pending"
            and (r["earned"] <= day or r["category"] == "principal")
        )
        + sum(
            r["amount_cents"]
            for r in schedule
            if r["overdue"]
            and r["category"] == "driver-backing"
            and r["contract"] in state["funding"]
        ),
        income_cents=income,
        expense_cents=expense,
        profit_cents=income - expense,
        overdue_cents=overdue,
        activity=dict(activity),
        breakdown=dict(breakdown),
        contracts=dict(margins),
        in_kind=[
            r
            for r in book["in_kind"].values()
            if r["payer"] in accounts or r["recipient"] in accounts
        ],
        forecast=forecast,
        recommendation=(
            "Согласовать график погашения просроченных обязательств."
            if overdue
            else "Перенести необязательные расходы или привлечь финансирование до "
            + next(r["date"] for r in forecast if r["negative_cents"] < 0)
            + "."
            if any(r["negative_cents"] < 0 for r in forecast)
            else "Сохранить денежный резерв на ближайшие выплаты по календарю."
        ),
        width=width,
        officer=officer,
        candidates=list(employees.values()),
        reserves={a: book["reserves"].get(a, 0) for a in wallets},
        history=[dict(month=m, delta_cents=v) for m, v in sorted(history.items())],
        obligations=sorted(schedule, key=lambda r: (r["due"], r["id"])),
        journal=journal,
    )
