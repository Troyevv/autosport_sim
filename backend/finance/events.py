"""Trusted contracts for commercial, sporting and regional producers."""

from typing import Literal
from pydantic import Field
from ..staff_input import Day, Fields, Id
from ..domain import RuleError
from .series import PromotionAwards, award
from . import Instalment, Schedule, balance, register, settle, cancel


class CommercialEvidence(Fields):
    source: Literal[
        "championship",
        "entry",
        "hospitality",
        "licence",
        "retail",
        "supplier",
        "academy",
        "sponsor",
        "infrastructure",
        "finance",
    ]
    reference: Id
    series: Id
    regulation: Id
    schedule: Schedule


class InKindDelivery(Fields):
    contract: Id
    reference: Id
    payer: Id
    recipient: Id
    date: Day
    description: Id
    estimated_cents: int = Field(ge=0, le=10**13)


class Cancellation(Fields):
    installment: Id


PRODUCERS = {
    "finance-promotion-awards": PromotionAwards,
    "finance-confirm": CommercialEvidence,
    "finance-in-kind": InKindDelivery,
    "finance-cancel": Cancellation,
}

# Per-entry transport and service costs in EUR cents on a confirmed round.
# Game estimates by discipline, never an award for an invented result.
ROUND_COSTS = {
    "f1": 4800000,
    "f2": 490000,
    "f3": 320000,
    "dtm": 560000,
    "wec": 2200000,
    "freca": 185000,
    "f4-it": 125000,
    "f4-gb": 95000,
    "f4-es": 110000,
    "kart-ok": 35000,
    "kart-okj": 28000,
}


def participation(state, world, entry_id, day):
    entry = world["entries"][entry_id]
    series = entry["championship"]
    weekend = next(
        (
            e
            for e in world["events"]
            if e["kind"] == "round"
            and e["series"] == series
            and e["start"] <= day <= e["end"]
        ),
        None,
    )
    if not weekend:
        return
    org = entry["org"]
    term = Instalment(
        id="logistics:" + weekend["id"] + ":" + entry_id,
        contract=entry["program"],
        due=weekend["end"],
        earned=weekend["start"],
        category="logistics",
        payer=org,
        recipient=None,
        amount_cents=ROUND_COSTS[series],
    )
    register(state, Schedule(installments=[term]))
    settle(state)


def confirm(state, world, action, payload):
    event = PRODUCERS[action].model_validate(payload)
    if isinstance(event, PromotionAwards):
        award(state, world, event)
    elif isinstance(event, CommercialEvidence):
        rule = world["championships"].get(event.series)
        if not rule or rule["rules_id"] != event.regulation:
            raise RuleError("Версия регламента финансового события не совпадает.")
        for term in event.schedule.installments:
            if term.contract != event.reference:
                raise RuleError("Основание платежа не совпадает с событием.")
        register(state, event.schedule)
        settle(state)
    elif isinstance(event, InKindDelivery):
        if event.date != state["date"] or event.recipient == event.payer:
            raise RuleError("Проверьте дату и стороны технической помощи.")
        balance(state, event.payer)
        balance(state, event.recipient)
        evidence = state["finance"]["in_kind"]
        if (
            event.reference in evidence
            and evidence[event.reference] != event.model_dump()
        ):
            raise RuleError("Этот акт поставки уже зарегистрирован.", 409)
        evidence[event.reference] = event.model_dump()
    else:
        if event.installment not in state["finance"]["instalments"]:
            raise RuleError("Обязательство отсутствует.")
        cancel(state, event.installment)
