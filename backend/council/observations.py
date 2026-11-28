"""Input for trusted session producers. Only evidence released to this team crosses this port."""

from typing import Literal
from pydantic import Field, FiniteFloat, model_validator
from ..supply import entry_agreement, support_on, visible_channels, ObservationScope

from .. import components
from ..domain import RuleError, occupant_on
from ..staff_input import Day, Fields, Id


class Observation(Fields):
    reference: Id
    org: Id
    entry: Id
    session: Id
    day: Day
    instance: Id
    specification: Id
    kind: Literal["driver-feedback", "track-measurement", "session-result"]
    author: Id
    observation: Id
    channel: (
        Literal[
            "distance",
            "temperature",
            "wear",
            "mode",
            "power",
            "failure_observed",
            "test_completed",
            "feedback",
        ]
        | None
    ) = None
    value: FiniteFloat | None = None
    unit: Id | None = None
    uncertainty: FiniteFloat | None = Field(default=None, ge=0)
    conditions: Id | None = None
    track: Id | None = None
    layout: Id | None = None
    load_profile: Id | None = None
    indicator: (
        Literal[
            "mount-out-of-tolerance",
            "coolant-flow-low",
            "load-limit-exceeded",
            "service-procedure-deviation",
            "outside-operating-window",
        ]
        | None
    ) = None
    session_kind: Literal["test", "practice", "qualifying", "sprint", "race"] | None = (
        None
    )

    @model_validator(mode="after")
    def measured_channel(self):
        if self.kind == "track-measurement" and any(
            x is None
            for x in (
                self.channel,
                self.value,
                self.unit,
                self.uncertainty,
                self.conditions,
            )
        ):
            raise ValueError(
                "Измерению нужны канал, значение, единица, погрешность и условия."
            )
        if any((self.track, self.layout, self.load_profile)) and not all(
            (self.track, self.layout, self.load_profile)
        ):
            raise ValueError("Укажите трассу, конфигурацию и версию профиля нагрузки.")
        if self.indicator and self.kind != "track-measurement":
            raise ValueError(
                "Диагностический признак требует измерения с условиями и погрешностью."
            )
        return self


def observation_grant(state, world, entry, fact):
    """Resolve the reviewer at the report date within the existing #5 data grant."""
    from ..components.registry import drawing_for

    drawing = drawing_for(state, fact["specification"])
    channel = "feedback" if fact["kind"] == "driver-feedback" else fact["channel"]
    if not channel or not fact["session_kind"]:
        return None
    scope = ObservationScope(
        entry["org"],
        entry["car"],
        fact["session"],
        fact["session_kind"],
        drawing["manufacturer"],
        drawing["slot"],
        drawing["id"],
        fact["instance"],
    )
    contract = entry_agreement(entry["id"], drawing["slot"])
    if "manufacturer" in state:
        from ..supplier_engineering import agreement

        terms = agreement(state, world, entry, drawing["slot"], fact["day"])
        if (
            not terms
            or not terms["support"]
            or terms["maker"] != drawing["manufacturer"]
        ):
            return None
        contract = terms["id"]
    if "engineering_service" in state:
        from ..personal_engineering import grant as client_grant

        r = client_grant(state, world, entry, drawing["slot"], fact["day"], terms)
        rows = [r] if r else []
    else:
        rows = state["support"]
    for r in rows:
        if r["agreement"] != contract or r.get("entry", entry["id"]) != entry["id"]:
            continue
        grant = support_on({"support": [r]}, r["advisor"], fact["day"])
        if not grant or not visible_channels(
            grant, scope, fact["day"], r["employer"], [channel]
        ):
            continue
        if "engineering_service" in state:
            current = client_grant(
                state,
                world,
                entry,
                drawing["slot"],
                state["date"],
                agreement(state, world, entry, drawing["slot"]),
            )
            if (
                not current
                or current["start"] > fact["day"]
                or current["advisor"] != r["advisor"]
                or current["agreement"] != contract
                or channel not in current["channels"]
            ):
                continue
        return grant
    return None


def analyst_for(state, world, entry, fact):
    reviewer = observation_grant(state, world, entry, fact)
    if reviewer:
        return occupant_on(
            state["seats"].get(reviewer.employer + ":analyst", []), fact["day"]
        )
    return None


def receive(state, world, fact: Observation):
    records = state["council"]["observations"]
    data = fact.model_dump()
    for field in ("track", "layout", "load_profile", "indicator"):
        if data[field] is None:
            del data[field]
    if fact.reference in records:
        if records[fact.reference] != data:
            raise RuleError("Источник уже зарегистрирован с другим содержанием.", 409)
        return
    entry = world["entries"].get(fact.entry)
    if (
        not entry
        or entry["org"] != fact.org
        or fact.day != state["date"]
        or fact.instance not in components.mounting(state, fact.entry).values()
        or components.spec(state, fact.instance)["id"] != fact.specification
    ):
        raise RuleError("Наблюдение не соответствует заявке и установленному узлу.")
    roles = (
        {"driver"}
        if fact.kind == "driver-feedback"
        else {"analyst", "chief-analyst", "race-engineer"}
    )
    from ..driver_availability import participant
    from ..personal_engineering import working_person

    if not any(
        seat["position"] in roles
        and not seat.get("engineering_reserve")
        and seat["org"] == fact.org
        and seat["entry"] in (None, fact.entry)
        and seat["series"] in (None, entry["championship"])
        and (
            participant(state, seat["id"], fact.day)
            if fact.kind == "driver-feedback"
            else working_person(state, seat, fact.day)
        )
        == fact.author
        for seat in world["assignments"].values()
    ):
        raise RuleError("Нет полномочий на передачу этого наблюдения.", 403)
    records[fact.reference] = data
