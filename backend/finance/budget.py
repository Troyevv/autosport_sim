"""Annual mandates and independent regulatory controls, all amounts in EUR cents."""

from calendar import monthrange
from datetime import date, timedelta
from typing import Annotated, Literal
from pydantic import Field, model_validator
from ..domain import RuleError, occupant_on
from ..engineering import resource_scope, project_target
from ..staff_input import Fields, Id, Day
from . import available, Instalment, Schedule, register, settle

Part = Literal[
    "personnel", "engineering", "operations", "commercial", "facilities", "reserve"
]
PARTS = (
    "personnel",
    "engineering",
    "operations",
    "commercial",
    "facilities",
    "reserve",
)
GROUPS = {
    "payroll": "personnel",
    "staff-payroll": "personnel",
    "signing": "personnel",
    "buyout": "personnel",
    "severance": "personnel",
    "engineering": "engineering",
    "production": "engineering",
    "staff-preparation": "personnel",
    "logistics": "operations",
    "supply": "operations",
    "repairs": "operations",
    "fine": "operations",
    "interest": "operations",
    "infrastructure": "facilities",
    "marketing": "commercial",
    "sponsorship": "commercial",
    "driver-backing": "commercial",
    "academy": "commercial",
    "backing-exit": "commercial",
}
RELEVANT = {
    "engineering",
    "production",
    "logistics",
    "repairs",
    "staff-payroll",
    "payroll",
    "staff-preparation",
}
Amount = Annotated[int, Field(ge=0, le=10**13)]


class Proposal(Fields):
    year: int = Field(ge=2025, le=9998)
    allocations: dict[Part, Amount]
    reason: str = Field(min_length=2, max_length=200)

    @model_validator(mode="after")
    def complete(self):
        if set(self.allocations) != set(PARTS) or not sum(self.allocations.values()):
            raise ValueError("Укажите распределение по всем статьям.")
        return self


class Decision(Fields):
    proposal: Id
    response: Literal["approve", "adjust", "reject"]
    allocations: dict[Part, Amount] | None = None
    reason: str = Field(min_length=2, max_length=200)


class ProjectCost(Fields):
    project: Id
    program: Id
    target_season: Id
    generation: Id
    amount_cents: int = Field(gt=0, le=10**13)
    due: Day
    atr: dict[
        Literal[
            "runs",
            "wind_on_minutes",
            "occupancy_minutes",
            "cfd_geometries",
            "cfd_milli_mauh",
        ],
        Amount,
    ]


ORDERS = {"finance-budget-propose": Proposal, "finance-budget-decide": Decision}
PRODUCERS = {"finance-project-cost": ProjectCost}


def initialize(state, world, history):
    if "control" in state:
        return
    state["control"] = dict(
        since=state["revision"],
        plans={},
        requests={},
        actual={},
        projects={},
        audits={},
    )
    for org in state["accounts"]:
        open_year(state, org, state["date"][:4])
    for p in history:
        observe(state, world, p)


def open_year(state, org, year):
    plans = state["control"]["plans"].setdefault(org, {})
    if year not in plans:
        total = state["accounts"][org]["budget_cents"]
        amounts = {
            k: total * n // 100
            for k, n in zip(PARTS, (55, 18, 12, 6, 6, 3), strict=True)
        }
        amounts["reserve"] += total - sum(amounts.values())
        plans[year] = dict(
            allocations=amounts, approved=state["date"], source="opening", revision=0
        )
    return plans[year]


def attributable_pay(state, world, org, day):
    end = date.fromisoformat(day)
    first = (end - timedelta(days=1)).replace(day=1)
    days = monthrange(first.year, first.month)[1]
    for aid, rows in state["seats"].items():
        seat = world["assignments"][aid]
        if seat["org"] != org:
            continue
        for r in rows:
            left = max(
                first,
                date.fromisoformat(state["personnel_start"]),
                date.fromisoformat(r["start"]),
            )
            right = min(end, date.fromisoformat(r["end"])) if r["end"] else end
            amount = r["salary_cents"] * max(0, (right - left).days) // days
            if amount:
                yield r["person"], seat["position"], amount


def observe(state, world, p):
    source = p["source"]
    delta = p["delta_cents"]
    org = p["org"].split(":")[0]
    if (
        org not in state["accounts"]
        or source not in GROUPS
        or (delta >= 0 and not p["key"].startswith("refund:"))
    ):
        return
    term = state["finance"]["instalments"].get(
        p["key"].removeprefix("due:").removeprefix("refund:")
    )
    if term and term["payer"] != p["org"]:
        return
    pay_day = term["due"] if term else p["date"]
    payroll = source == "staff-payroll" and (
        term["id"] if term else p["key"]
    ).startswith("payroll-")
    year = (
        str((date.fromisoformat(pay_day) - timedelta(days=1)).year)
        if payroll
        else (term["earned"] if term else p["date"])[:4]
    )
    data = (
        state["control"]["actual"]
        .setdefault(org, {})
        .setdefault(year, dict(categories={}, relevant=0, drivers=0, staff={}))
    )
    part = GROUPS[source]
    data["categories"][part] = data["categories"].get(part, 0) - delta
    if source in RELEVANT:
        data["relevant"] -= delta
    if payroll and org in world["engineering"]["atr"]["opening_rank"]:
        for pid, role, amount in attributable_pay(state, world, org, pay_day):
            if term and (term["recipient"] == "person:player") != (
                pid == state["player_id"]
            ):
                continue
            if role == "driver":
                data["drivers"] += amount
            else:
                data["staff"][pid] = data["staff"].get(pid, 0) + amount


def cap_rule(world, org, year):
    rule = world["engineering"]["cost_cap"]
    if (
        org not in world["engineering"]["atr"]["opening_rank"]
        or str(year) != rule["start"][:4]
    ):
        return None
    rounds = sum(
        e["kind"] == "round" and e["series"] == "f1" and e["start"][:4] == str(year)
        for e in world["events"]
    )
    usd = (
        rule["base_cents"]
        + (rounds - rule["reference_rounds"]) * rule["per_round_adjustment_cents"]
    )
    # Art. 2.4 illustration in presentation currency, before indexation (21 competitions).
    return dict(
        version=rule["id"],
        source=rule["source"],
        rounds=rounds,
        start=rule["start"],
        end=rule["end_exclusive"],
        limit_cents=(usd * 122928 + 67500) // 135000,
        currency="EUR",
        indexation="До индексации",
        exclusions=rule["excluded"],
        sanctions=rule["sanctions"],
    )


class Determination(Fields):
    org: Id
    year: int
    version: Id
    rounds: int = Field(ge=1, le=52)
    index_basis_points: int = Field(ge=9000, le=15000)
    reference: Id


class Ranking(Fields):
    org: Id
    rank: int = Field(ge=1, le=10)
    period: Id
    reference: Id


PRODUCERS.update(
    {"finance-cap-determination": Determination, "finance-atr-rank": Ranking}
)


def scope_for(state, world, org):
    scope = resource_scope(world, org, state["date"])
    if not scope:
        return None
    rank = state.get("control", {}).get("rankings", {}).get(scope["pool_id"])
    if rank:
        scope = resource_scope(world, org, state["date"], rank["rank"])
    projects = state.get("control", {}).get("projects", {})
    scope["used"] = {
        unit: sum(
            p["terms"]["atr"].get(unit, 0)
            for p in projects.values()
            if p["pool"] == scope["pool_id"]
        )
        for unit in world["engineering"]["atr"]["base"]
    }
    return scope


def determination(state, world, event):
    if isinstance(event, Ranking):
        scope = scope_for(state, world, event.org)
        if (
            not scope
            or scope["period"]["id"] != event.period
            or scope["period"]["number"] <= 3
        ):
            raise RuleError("Классификация не относится к текущему периоду.")
        table, key = "rankings", scope["pool_id"]
    else:
        rule = cap_rule(world, event.org, event.year)
        if (
            not rule
            or rule["version"] != event.version
            or event.year != int(state["date"][:4])
        ):
            raise RuleError("Решение не относится к действующему регламенту.")
        table, key = "determinations", f"{event.org}:{event.year}"
    rows = state["control"].setdefault(table, {})
    if key in rows and rows[key] != event.model_dump():
        raise RuleError("Для периода уже зарегистрировано другое решение.", 409)
    rows[key] = event.model_dump()


def report(state, world, org, year):
    year = str(year)
    plan = state["control"]["plans"].get(org, {}).get(year)
    actual = state["control"]["actual"].get(org, {}).get(year, {})
    reserved = dict.fromkeys(PARTS, 0)
    accrued = 0
    for row in state["finance"]["instalments"].values():
        if (
            row["payer"].split(":")[0] != org
            or row["status"] != "pending"
            or row["earned"][:4] != year
        ):
            continue
        part = GROUPS.get(row["category"])
        if part:
            reserved[part] += row["amount_cents"]
        if row["category"] in RELEVANT:
            accrued += row["amount_cents"]
    counted = (
        actual.get("relevant", 0)
        - actual.get("drivers", 0)
        - sum(sorted(actual.get("staff", {}).values(), reverse=True)[:3])
    )
    rule = cap_rule(world, org, year)
    if rule:
        decision = state["control"].get("determinations", {}).get(f"{org}:{year}")
        if decision:
            reg = world["engineering"]["cost_cap"]
            usd = (
                reg["base_cents"]
                + (decision["rounds"] - reg["reference_rounds"])
                * reg["per_round_adjustment_cents"]
            )
            rule.update(
                rounds=decision["rounds"],
                limit_cents=usd
                * 122928
                * decision["index_basis_points"]
                // (135000 * 10000),
                indexation=decision["reference"],
            )
        start = date.fromisoformat(max(rule["start"], state["personnel_start"]))
        end = date.fromisoformat(rule["end"])
        elapsed = max(1, (min(date.fromisoformat(state["date"]), end) - start).days)
        rule.update(
            forecast_cents=max(0, counted) * (end - start).days // elapsed + accrued,
            spent_cents=max(0, counted),
            committed_cents=accrued,
            remaining_cents=rule["limit_cents"] - max(0, counted) - accrued,
        )
    return dict(
        year=year,
        plan=plan,
        actual=actual.get("categories", {}),
        reserved=reserved,
        cap=rule,
        requests=[
            r
            for r in state["control"]["requests"].values()
            if r["org"] == org and str(r["year"]) == year
        ],
        audits=[r for r in state["control"]["audits"].values() if r["org"] == org],
        cash_cents=state["accounts"][org]["cash_cents"],
        available_cents=available(state, org),
        atr=scope_for(state, world, org),
    )


def authorize(state, world, org, category, amount, day, *, plan_only=False):
    if "control" not in state or org not in state["accounts"] or category not in GROUPS:
        return
    view = report(state, world, org, day[:4])
    plan = view["plan"]
    if not plan:
        raise RuleError("Нет утверждённого бюджета на этот год.", 409)
    part = GROUPS[category]
    if (
        plan["allocations"][part] - view["actual"].get(part, 0) - view["reserved"][part]
        < amount
    ):
        raise RuleError("Статья утверждённого бюджета исчерпана.", 409)
    if category in RELEVANT and view["cap"] and view["cap"]["remaining_cents"] < amount:
        raise RuleError("Расход превышает остаток регламентного Cost Cap.", 409)
    if not plan_only and amount > available(state, org):
        raise RuleError("Недостаточно свободных денежных средств.", 409)


def propose(state, org, order, actor):
    if order.year not in (int(state["date"][:4]), int(state["date"][:4]) + 1):
        raise RuleError("Для согласования доступны текущий и следующий сезон.")
    requests = state["control"]["requests"]
    if any(
        r["org"] == org and r["year"] == order.year and r["status"] == "pending"
        for r in requests.values()
    ):
        raise RuleError("Владелец уже рассматривает смету.")
    key = f"budget:{org}:{len(requests)}"
    requests[key] = dict(
        **order.model_dump(),
        id=key,
        org=org,
        submitted=state["date"],
        actor=actor,
        status="pending",
    )
    return requests[key]


def decide(state, world, org, order, actor):
    r = state["control"]["requests"].get(order.proposal)
    if not r or r["org"] != org or r["status"] != "pending":
        raise RuleError("Запрос не ожидает решения.")
    if (order.allocations is not None) != (order.response == "adjust"):
        raise RuleError("Корректировка требует пересмотренной сметы.")
    amounts = order.allocations or r["allocations"]
    if order.response != "reject":
        if set(amounts) != set(PARTS) or not sum(amounts.values()):
            raise RuleError("Неполная смета.")
        view = report(state, world, org, r["year"])
        if any(
            amounts[k] < view["actual"].get(k, 0) + view["reserved"][k] for k in PARTS
        ):
            raise RuleError("Смета не покрывает уже принятые обязательства.")
        plan = open_year(state, org, str(r["year"]))
        plan.update(
            allocations=dict(amounts),
            approved=state["date"],
            source=r["id"],
            revision=plan["revision"] + 1,
        )
        if r["year"] == int(state["date"][:4]):
            state["accounts"][org].update(
                budget_cents=sum(amounts.values()),
                development_budget_cents=amounts["engineering"],
            )
    r.update(
        status=order.response,
        decision_by=actor,
        decided=state["date"],
        decision_reason=order.reason,
        approved_allocations=amounts if order.response != "reject" else None,
    )


def office(state, org, role):
    return occupant_on(state["seats"].get(org + ":" + role, []), state["date"])


def command(state, world, action, args):
    org = state["setup"]["org"]
    role = state["setup"]["role"]
    if action == "finance-budget-review" and role == "owner":
        return request_from_manager(state, world, org)
    if action == "finance-budget-propose" and role in ("manager", "manufacturer"):
        return propose(state, org, Proposal.model_validate(args), state["player_id"])
    if action == "finance-budget-decide" and role in ("owner", "manufacturer"):
        return decide(
            state, world, org, Decision.model_validate(args), state["player_id"]
        )
    raise RuleError("Эта должность не уполномочена на бюджетное решение.", 403)


def tick(state, world):
    day = state["date"]
    if day.endswith("-01-01"):
        for org in state["accounts"]:
            plan = open_year(state, org, day[:4])
            state["accounts"][org]["budget_cents"] = sum(plan["allocations"].values())
            close_period(state, world, org, str(int(day[:4]) - 1))
    for key in sorted(state["control"]["requests"]):
        r = state["control"]["requests"][key]
        org = r["org"]
        if r["status"] != "pending" or r["submitted"] >= day:
            continue
        actor = office(state, org, "owner") or office(state, org, "manufacturer")
        if not actor or actor == state["player_id"]:
            continue
        funds = state["accounts"][org]["cash_cents"]
        discipline = state["people"][actor]["professionalism"]
        ok = sum(r["allocations"].values()) <= funds * (180 - discipline) // 100
        decision = Decision(
            proposal=key,
            response="approve" if ok else "reject",
            reason="Оценка ликвидности и принятых обязательств.",
        )
        try:
            decide(state, world, org, decision, actor)
        except RuleError:
            decide(
                state,
                world,
                org,
                Decision(
                    proposal=key,
                    response="reject",
                    reason="Заявка не покрывает обязательства.",
                ),
                actor,
            )


def project(state, world, cost):
    scope = project_target(world, cost.program, cost.target_season, cost.generation)
    org = scope["budget_owner"]
    key = cost.project
    plans = state["control"]["projects"]
    if key in plans:
        if plans[key]["terms"] != cost.model_dump():
            raise RuleError("Проект уже имеет другие условия.", 409)
        return
    if cost.due < state["date"]:
        raise RuleError("Срок платежа истёк.")
    authorize(state, world, org, "engineering", cost.amount_cents, state["date"])
    pool = scope_for(state, world, org)
    if cost.atr:
        if not pool or pool["limits"] is None:
            raise RuleError("Для периода отсутствует подтверждённая квота ATR.")
        for unit, amount in cost.atr.items():
            used = sum(
                p["terms"]["atr"].get(unit, 0)
                for p in plans.values()
                if p["pool"] == pool["pool_id"]
            )
            if amount + used > pool["limits"][unit]:
                raise RuleError("Недостаточно инженерной квоты ATR.", 409)
    term = Instalment(
        id="project:" + key,
        contract=key,
        payer=org,
        recipient=None,
        category="engineering",
        amount_cents=cost.amount_cents,
        due=cost.due,
        earned=state["date"],
        reserved=True,
    )
    register(state, Schedule(installments=[term]))
    plans[key] = dict(
        terms=cost.model_dump(), pool=pool["pool_id"] if pool else None, org=org
    )
    settle(state)


def request_from_manager(state, world, org):
    manager = office(state, org, "manager")
    if not manager:
        raise RuleError("В организации нет менеджера для подготовки сметы.")
    year = int(state["date"][:4])
    view = report(state, world, org, year)
    amounts = {
        k: max(v, view["actual"].get(k, 0) + view["reserved"][k])
        for k, v in view["plan"]["allocations"].items()
    }
    return propose(
        state,
        org,
        Proposal(
            year=year,
            allocations=amounts,
            reason="Пересмотр сезонной сметы по фактическим обязательствам.",
        ),
        manager,
    )


class Review(Fields):
    pass


ORDERS["finance-budget-review"] = Review


def close_period(state, world, org, year):
    key = f"{org}:{year}"
    if key in state["control"]["audits"]:
        return
    view = report(state, world, org, year)
    cap = view["cap"]
    if not cap:
        return
    over = max(0, cap["spent_cents"] + cap["committed_cents"] - cap["limit_cents"])
    severity = (
        "material"
        if over * 20 >= cap["limit_cents"]
        else "minor"
        if over
        else "compliant"
    )
    # The real process is adjudicated. This game selects a financial sanction and, for
    # a material breach, restricts the next engineering mandate pending sporting adjudication.
    fine = over // 2 if severity == "minor" else over
    state["control"]["audits"][key] = dict(
        id=key,
        org=org,
        year=year,
        version=cap["version"],
        over_cents=over,
        severity=severity,
        fine_cents=fine,
        date=state["date"],
    )
    if fine:
        register(
            state,
            Schedule(
                installments=[
                    Instalment(
                        id="cap:" + key,
                        contract=key,
                        payer=org,
                        recipient=None,
                        amount_cents=fine,
                        due=state["date"],
                        earned=state["date"],
                        category="fine",
                    )
                ]
            ),
        )
        settle(state)
    if severity == "material":
        plan = open_year(state, org, state["date"][:4])
        penalty = min(over, plan["allocations"]["engineering"])
        plan["allocations"]["engineering"] -= penalty
        plan["allocations"]["reserve"] += penalty
        state["accounts"][org]["development_budget_cents"] = plan["allocations"][
            "engineering"
        ]
