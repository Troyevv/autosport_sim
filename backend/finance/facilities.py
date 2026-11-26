"""Facilities, staffed capacity and dated access. No engineering result generator."""

from datetime import date, timedelta
from typing import Literal
from pydantic import Field
from ..team_staff import department_capacity
from ..domain import RuleError
from ..staff_input import Fields, Id, Day
from . import Instalment, Schedule, register, settle, transfer, available
from .budget import authorize

Kind = Literal[
    "tunnel",
    "cfd",
    "simulator",
    "factory",
    "bench",
    "academy",
    "warehouse",
    "hq",
    "research",
    "design",
    "quality",
]
# EUR cents, days to commission, monthly maintenance, operators per unit of capacity.
TYPES = {
    "tunnel": ("Аэродинамическая труба", 360000000, 420, 360000, 8),
    "cfd": ("CFD-центр", 40000000, 120, 90000, 3),
    "simulator": ("Симулятор", 8000000, 60, 24000, 2),
    "factory": ("Производственный комплекс", 120000000, 240, 140000, 6),
    "bench": ("Испытательный стенд", 16000000, 90, 42000, 3),
    "academy": ("Академия", 12000000, 75, 36000, 2),
    "research": ("Исследовательский центр", 55000000, 150, 95000, 4),
    "design": ("Конструкторское бюро", 68000000, 180, 110000, 5),
    "quality": ("Центр контроля качества", 18000000, 90, 47000, 3),
    "warehouse": ("Склад компонентов", 6500000, 45, 21000, 2),
    "hq": ("Штаб-квартира", 9000000, 90, 30000, 2),
}
# Indexed locations for new game assets, independent of actual company domiciles.
LOCATIONS = {
    "GB": (110, 110, 100),
    "IT": (96, 98, 95),
    "DE": (108, 105, 93),
    "FR": (103, 104, 97),
    "US": (115, 112, 128),
    "ES": (88, 91, 105),
}
PUBLIC = "facility:operators"
TRAINING = {
    "bench-test": "bench",
    "simulator": "simulator",
    "fitness": "hq",
    "pit-drill": "factory",
    "academy": "academy",
    "debrief": "hq",
}


class Build(Fields):
    kind: Kind
    country: Literal["GB", "IT", "DE", "FR", "US", "ES"]


class Upgrade(Fields):
    facility: Id


class Lease(Fields):
    facility: Id
    start: Day
    days: int = Field(ge=1, le=366)
    units: int = Field(ge=1, le=8)
    mode: Literal["lease", "outsource"]


class Access(Fields):
    reference: Id
    org: Id
    facility: Id
    start: Day
    days: int = Field(ge=1, le=366)
    units: int = Field(ge=1, le=8)
    program: Id
    regulation: Id
    purpose: Literal[
        "preparation",
        "engineering",
        "research",
        "development",
        "production",
        "inspection",
        "testing",
        "storage",
    ]
    authorization: Id


ORDERS = {"finance-build": Build, "finance-upgrade": Upgrade, "finance-lease": Lease}
PRODUCERS = {"finance-facility-access": Access}


def later(day, days):
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


def asset(key, owner, kind, country, start, ready, book, level=1):
    return dict(
        id=key,
        owner=owner,
        kind=kind,
        country=country,
        start=start,
        ready=ready,
        level=level,
        book_cents=book,
        condition=100,
        status="active" if start == ready else "construction",
        last_service=None,
        construction_cents=book,
    )


PROCESS = {
    "research": "research",
    "design": "development",
    "factory": "production",
    "quality": "inspection",
    "warehouse": "storage",
    "tunnel": "testing",
    "cfd": "testing",
    "bench": "testing",
    "simulator": "testing",
}


def initialize(state, world, *, legacy=False):
    if "estate" in state:
        return
    assets = {}
    state["estate"] = dict(since=state["revision"], assets=assets, bookings={})
    state["finance"]["pockets"][PUBLIC] = 0
    if not legacy:
        state["estate"]["capacity_since"] = state["revision"]
    kinds = (
        ("tunnel", "cfd", "simulator", "factory", "bench", "academy", "logistics", "hq")
        if legacy
        else TYPES
    )
    for kind in kinds:
        key = "shared:" + kind
        assets[key] = asset(key, PUBLIC, kind, "GB", state["date"], state["date"], 0, 8)


def migrate(state):
    estate = state["estate"]
    if "capacity_since" in estate:
        return
    for a in estate["assets"].values():
        if a["kind"] == "logistics":
            a["kind"] = "warehouse"
    for r in estate["bookings"].values():
        if r.get("purpose") == "logistics":
            r["purpose"] = "storage"
    for kind in ("research", "design", "quality"):
        key = "shared:" + kind
        estate["assets"][key] = asset(
            key, PUBLIC, kind, "GB", state["date"], state["date"], 0, 8
        )
    estate["capacity_since"] = state["revision"]


def specification(kind):
    # Historical checkpoints keep their original IDs, fees and receipts during replay.
    return TYPES["warehouse" if kind == "logistics" else kind]


def staff(state, org):
    return sum(g["size"] for g in state["collectives"].values() if g["org"] == org)


def capacity(state, a):
    if a["status"] != "active" or a["condition"] < 25:
        return 0
    if "capacity_since" in state["estate"]:
        return resources(state, a)[0]
    units = a["level"]
    if a["owner"] != PUBLIC:
        payroll = staff(state, a["owner"])
        # Staff cannot operate the same equipment pool at several sites at once.
        rivals = sorted(
            (
                b
                for b in state["estate"]["assets"].values()
                if b["owner"] == a["owner"] and b["status"] == "active"
            ),
            key=lambda b: (b["ready"], b["id"]),
        )
        for b in rivals:
            need = specification(b["kind"])[4]
            if b["id"] == a["id"]:
                return min(units, max(0, payroll) // need)
            payroll -= b["level"] * need
    return units


def resources(state, a):
    """Staffed parallel slots and effective hundredths of a person-day per day."""
    if a["status"] != "active" or a["condition"] < 25:
        return 0, 0
    need = specification(a["kind"])[4]
    if a["owner"] == PUBLIC:
        # Staffing is included in the external operator's published capacity.
        return a["level"], a["level"] * need * a["condition"]
    groups = [g for g in state["collectives"].values() if g["org"] == a["owner"]]
    time = sum(g["size"] * (100 - g["workload"]) for g in groups)
    qualified = sum(department_capacity(g) for g in groups)
    reserved = 0
    for b in sorted(
        state["estate"]["assets"].values(), key=lambda b: (b["ready"], b["id"])
    ):
        if b["owner"] != a["owner"] or b["status"] != "active" or b["condition"] < 25:
            continue
        if b["id"] == a["id"]:
            break
        reserved += b["level"] * specification(b["kind"])[4] * 100
    slots = min(a["level"], max(0, time - reserved) // (need * 100))
    effective = slots * need * qualified * a["condition"] // max(1, time)
    return (slots, effective) if effective else (0, 0)


def free(state, a, start, end, *, buyer=None):
    records = [
        r
        for r in state["estate"]["bookings"].values()
        if r["facility"] == a["id"] and r["start"] < end and start < r["end"]
    ]

    def remaining(d):
        active = [r for r in records if r["start"] <= d < r["end"]]
        if buyer and buyer != a["owner"]:
            return sum(
                r["units"]
                for r in active
                if r["org"] == buyer
                and r["mode"] in ("lease", "outsource")
                and r.get("purpose") != "preparation"
            ) - sum(
                r["units"] for r in active if r["org"] == buyer and r["mode"] == "use"
            )
        return capacity(state, a) - sum(
            r["units"] for r in active if r["mode"] != "use" or r["org"] == a["owner"]
        )

    return min(
        remaining(d)
        for d in {
            start,
            *(r["start"] for r in records if start < r["start"] < end),
            *(r["end"] for r in records if start < r["end"] < end),
        }
    )


def quote(kind, country):
    _, cost, days, upkeep, staffing = specification(kind)
    build, wages, local_services = LOCATIONS[country]
    return dict(
        build_cents=cost * build // 100,
        days=days,
        monthly_cents=upkeep * wages // 100,
        staff=staffing,
        daily_cents=max(100, upkeep * (wages + local_services) // 1200),
    )


def act(state, world, org, key, order):
    assets = state["estate"]["assets"]
    today = state["date"]
    if isinstance(order, Build):
        q = quote(order.kind, order.country)
        amount = q["build_cents"]
        authorize(state, world, org, "asset-purchase", amount, today)
        transfer(state, org, PUBLIC, key, amount, "asset-purchase")
        assets[key] = asset(
            key,
            org,
            "logistics"
            if order.kind == "warehouse" and "capacity_since" not in state["estate"]
            else order.kind,
            order.country,
            today,
            later(today, q["days"]),
            amount,
        )
        return
    a = assets.get(order.facility)
    if not a or a["status"] != "active":
        raise RuleError("Объект недоступен.")
    q = quote(a["kind"], a["country"])
    if isinstance(order, Upgrade):
        if a["owner"] != org or a["level"] >= 8:
            raise RuleError("Модернизация недоступна.", 403)
        if any(
            r["facility"] == a["id"] and r["end"] > today
            for r in state["estate"]["bookings"].values()
        ):
            raise RuleError("На время модернизации уже проданы слоты.", 409)
        amount = q["build_cents"] * a["level"] // 2
        authorize(state, world, org, "asset-purchase", amount, today)
        transfer(state, org, PUBLIC, key, amount, "asset-purchase")
        a.update(
            status="upgrade",
            ready=later(today, max(1, q["days"] // 2)),
            book_cents=a["book_cents"] + amount,
        )
        return
    start = order.start
    end = later(start, order.days)
    if start < today or a["owner"] == org or free(state, a, start, end) < order.units:
        raise RuleError("Недостаточно свободных слотов на эти даты.", 409)
    fee = (
        q["daily_cents"]
        * order.days
        * order.units
        * (120 if order.mode == "outsource" else 100)
        // 100
    )
    authorize(state, world, org, "infrastructure", fee, today)
    transfer(state, org, a["owner"], key, fee, "infrastructure")
    state["estate"]["bookings"][key] = dict(
        id=key,
        org=org,
        facility=a["id"],
        mode=order.mode,
        start=start,
        end=end,
        units=order.units,
        cost_cents=fee,
    )


def command(state, world, action, args):
    order = ORDERS[action].model_validate(args)
    if not isinstance(order, Lease) and state["setup"]["role"] == "manager":
        raise RuleError("Капитальные вложения утверждает владелец.", 403)
    act(state, world, state["setup"]["org"], f"facility:{state['revision']}", order)


def consume(
    state,
    org,
    key,
    a,
    start,
    end,
    units,
    purpose,
    authority,
    *,
    program=None,
    regulation=None,
):
    record = dict(
        id=key,
        org=org,
        facility=a["id"],
        mode="use",
        start=start,
        end=end,
        units=units,
        purpose=purpose,
        authority=authority,
        cost_cents=0,
    )
    if program is not None and "capacity_since" in state["estate"]:
        record.update(program=program, regulation=regulation)
    bookings = state["estate"]["bookings"]
    if key in bookings:
        if any(bookings[key].get(k) != v for k, v in record.items()):
            raise RuleError("Ссылка на слот уже используется.", 409)
        return
    if capacity(state, a) < units or free(state, a, start, end, buyer=org) < units:
        raise RuleError("Для программы нет подтверждённой мощности.", 409)
    if "capacity_since" in state["estate"]:
        slots, effective = resources(state, a)
        record["effective_person_days_x100"] = effective * units // slots
    bookings[key] = dict(
        record,
        condition=a["condition"],
        level=a["level"],
        staffed_capacity=capacity(state, a),
    )


def access(state, world, event):
    program = world["programs"].get(event.program)
    organization = world["organizations"].get(event.org, {})
    if (
        not program
        and organization.get("kind") == "supplier"
        and "capacity_since" in state["estate"]
    ):
        series = next(
            (
                s
                for s in organization["programs"]
                if event.program == f"{event.org}:{s}"
            ),
            None,
        )
        if series:
            program = {"org": event.org, "championship": series}
    if (
        not program
        or program["org"] != event.org
        or world["championships"][program["championship"]]["rules_id"]
        != event.regulation
    ):
        raise RuleError("Неверные программа или версия регламента.")
    a = state["estate"]["assets"].get(event.facility)
    if not a or event.start < state["date"]:
        raise RuleError("Нет объекта или дата слота прошла.")
    if "capacity_since" in state["estate"]:
        process = PROCESS.get(a["kind"])
        if not (
            event.purpose == process
            or event.purpose == "engineering"
            and process == "testing"
            or event.purpose == "preparation"
            and a["kind"] in TRAINING.values()
        ):
            raise RuleError("Объект не предоставляет мощность для этой операции.")
    if (
        a["kind"] in ("tunnel", "cfd")
        and event.purpose in ("testing", "engineering")
        and program["championship"] == "f1"
    ):
        project = state["control"]["projects"].get(event.authorization)
        if (
            not project
            or project["terms"]["program"] != event.program
            or not project["terms"]["atr"]
            or event.start != state["date"]
        ):
            raise RuleError("Требуется подтверждённая квота проекта F1.")
        if any(
            r.get("authority") == event.authorization
            and r["id"] != event.reference
            and state["estate"]["assets"][r["facility"]]["kind"] == a["kind"]
            for r in state["estate"]["bookings"].values()
        ):
            raise RuleError("Ресурс проекта уже выделен.", 409)
    consume(
        state,
        event.org,
        event.reference,
        a,
        event.start,
        later(event.start, event.days),
        event.units,
        event.purpose,
        event.authorization,
        program=event.program,
        regulation=event.regulation,
    )


def training(state, org, key, kind, start, end):
    for a in sorted(
        state["estate"]["assets"].values(), key=lambda x: (x["owner"] != org, x["id"])
    ):
        if a["kind"] != TRAINING[kind] or capacity(state, a) < 1:
            continue
        if free(state, a, start, end, buyer=org) > 0:
            consume(state, org, key, a, start, end, 1, "preparation", key)
            return a["id"], None
        if a["owner"] == PUBLIC and free(state, a, start, end) > 0:
            state["estate"]["bookings"][key] = dict(
                id=key,
                org=org,
                facility=a["id"],
                mode="outsource",
                start=start,
                end=end,
                units=1,
                cost_cents=0,
                purpose="preparation",
            )
            return a["id"], PUBLIC
    raise RuleError("Нет свободного объекта для подготовки на эти даты.", 409)


def tick(state, world):
    day = state["date"]
    for a in sorted(state["estate"]["assets"].values(), key=lambda r: r["id"]):
        if a["owner"] == PUBLIC:
            continue
        if a["status"] in ("construction", "upgrade") and day >= a["ready"]:
            a.update(
                level=a["level"] + int(a["status"] == "upgrade"),
                status="active",
                condition=100,
            )
        if (
            not day.endswith("-01")
            or a["status"] != "active"
            or a["last_service"] == day
        ):
            continue
        q = quote(a["kind"], a["country"])
        amount = q["monthly_cents"] * a["level"]
        term = Instalment(
            id="maint:" + a["id"] + ":" + day,
            contract=a["id"],
            payer=a["owner"],
            recipient=PUBLIC,
            category="infrastructure",
            due=day,
            earned=day,
            amount_cents=amount,
        )
        serviced = available(state, a["owner"]) >= amount
        register(state, Schedule(installments=[term]))
        if "capital" in state:
            from .capital import history

            history(
                state,
                a["owner"],
                term.id,
                "depreciation",
                asset=a["id"],
                profit_cents=a["book_cents"] * 995 // 1000 - a["book_cents"],
            )
        a.update(
            condition=max(0, a["condition"] - (1 if serviced else 8)),
            book_cents=a["book_cents"] * 995 // 1000,
            last_service=day,
        )
    settle(state)


EngineeringProcess = Literal["research", "development", "production"]


class CapacityWindow(Fields):
    process: EngineeringProcess
    start: Day
    end: Day
    installed_slots: int
    available_slots: int
    effective_person_days_x100: int
    confirmed_queue: list[Id]


def capacity_window(
    state, org, process: EngineeringProcess, start, end
) -> CapacityWindow:
    """Owned and contracted capacity available throughout [start, end)."""
    if start >= end:
        raise RuleError("Окончание периода должно быть позже начала.")
    assets = {
        a["id"]: a
        for a in state["estate"]["assets"].values()
        if PROCESS.get(a["kind"]) == process
    }
    queue = sorted(
        (
            r
            for r in state["estate"]["bookings"].values()
            if r["facility"] in assets
            and r["org"] == org
            and r["mode"] == "use"
            and r["end"] > start
            and r["start"] < end
        ),
        key=lambda r: (r["start"], r["end"], r["id"]),
    )
    slots = installed = work = 0
    for a in assets.values():
        capacity_slots, effective = resources(state, a)
        if a["owner"] == org and a["status"] == "active":
            installed += a["level"]
        accessible = max(0, min(capacity_slots, free(state, a, start, end, buyer=org)))
        slots += accessible
        work += effective * accessible // max(1, capacity_slots)
    return CapacityWindow(
        process=process,
        start=start,
        end=end,
        installed_slots=installed,
        available_slots=slots,
        effective_person_days_x100=work,
        confirmed_queue=[r["id"] for r in queue],
    )


def projection(state, world):
    org = state["setup"]["org"]
    today = state["date"]
    return dict(
        processes=PROCESS,
        windows=[
            capacity_window(state, org, p, today, later(today, 1)).model_dump()
            for p in ("research", "development", "production")
        ],
        types={k: v[0] for k, v in TYPES.items()},
        locations=list(LOCATIONS),
        quotes={k: {c: quote(k, c) for c in LOCATIONS} for k in TYPES},
        assets=[
            dict(
                a,
                capacity=capacity(state, a),
                effective_person_days_x100=resources(state, a)[1],
                free=free(state, a, today, later(today, 1)),
                daily_cents=quote(a["kind"], a["country"])["daily_cents"],
            )
            for a in state["estate"]["assets"].values()
        ],
        bookings=[
            r
            for r in state["estate"]["bookings"].values()
            if r["org"] == org
            or state["estate"]["assets"][r["facility"]]["owner"] == org
        ],
        staff=staff(state, org),
    )


class ResourceGrant(Fields):
    reference: Id
    facility: Id
    start: Day
    end: Day
    units: int
    condition: int
    level: int
    staffed_capacity: int
    purpose: str
    effective_person_days_x100: int | None
    authorization: Id
    program: Id | None
    regulation: Id | None


def grant(state, key) -> ResourceGrant:
    row = state["estate"]["bookings"][key]
    a = state["estate"]["assets"][row["facility"]]
    if row["mode"] != "use":
        raise RuleError("Для технической программы нужен подтверждённый слот.")
    return ResourceGrant(
        reference=key,
        facility=a["id"],
        start=row["start"],
        end=row["end"],
        units=row["units"],
        condition=row["condition"],
        level=row["level"],
        staffed_capacity=row["staffed_capacity"],
        purpose=row["purpose"],
        program=row.get("program"),
        regulation=row.get("regulation"),
        effective_person_days_x100=row.get("effective_person_days_x100"),
        authorization=row["authority"],
    )


def travel_cost_index(state, org):
    sites = [
        a
        for a in state.get("estate", {}).get("assets", {}).values()
        if a["owner"] == org and a["kind"] in ("hq", "logistics") and capacity(state, a)
    ]
    return min((LOCATIONS[a["country"]][2] for a in sites), default=100)
