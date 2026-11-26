"""Season-specific settlement rules; event producers confirm starts and final classifications."""

from pydantic import Field
from ..domain import RuleError
from ..staff_input import Fields, Id
from . import Instalment, Schedule, post, register, settle

F3_FUND = "organizer:f3:2025:promotion"
F3_AWARDS = (30000000, 25000000, 20000000, 15000000, 10000000)
F3_SOURCE = "https://www.fiaformula3.com/en/latest/article/formula-3-announce-one-million-euro-prize-fund-to-support-top-five-drivers.2rhzMuXuBbsn5944FPwHhE"


def initialize(state):
    wallets = state["finance"]["pockets"]
    wallets[F3_FUND] = 0
    post(state, F3_FUND, "opening", sum(F3_AWARDS), "opening")


class PromotionAwards(Fields):
    classification: Id
    successor_entries: list[Id] = Field(min_length=1, max_length=60)


def award(state, world, order):
    """A confirmed F2 field and final F3 standings are both required. Pay once per ranking slot."""
    if state["date"][:4] != "2026":
        raise RuleError("Для выплаты нужен подтверждённый состав следующего сезона.")
    eligible = {
        row["person"]
        for aid, history in state["seats"].items()
        if world["assignments"][aid]["position"] == "driver"
        and world["assignments"][aid]["series"] == "f2"
        for row in history
        if row["start"] <= state["date"]
        and (not row["end"] or state["date"] < row["end"])
    }
    if set(order.successor_entries) != eligible:
        raise RuleError("Требуется полный подтверждённый состав F2.")
    ranked = []
    for pid in eligible:
        record = (
            state["people"][pid]["credentials"]
            .get("classifications", {})
            .get("f3-2025")
        )
        if record:
            ranked.append((record["place"], pid))
    if not ranked or len({p for p, _ in ranked}) != len(ranked):
        raise RuleError("Итоговая классификация отсутствует или противоречива.")
    terms = []
    for slot, (_, pid) in enumerate(sorted(ranked)[:5]):
        wallet = "driver:" + pid
        state["finance"]["pockets"].setdefault(wallet, 0)
        terms.append(
            Instalment(
                id=f"{F3_FUND}:{slot}",
                contract=order.classification,
                payer=F3_FUND,
                recipient=wallet,
                amount_cents=F3_AWARDS[slot],
                due=state["date"],
                earned=state["date"],
                category="prize",
            )
        )
    register(state, Schedule(installments=terms))
    settle(state)
