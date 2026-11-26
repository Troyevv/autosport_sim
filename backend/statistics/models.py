"""Version 1 wire contracts. All times are integer microseconds on the session clock."""

from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, StrictInt, model_validator

from ..staff_input import Day, Fields, Id

Origin = Literal["simulation", "initial", "historical"]
Access = Literal["public", "internal", "technical", "estimate"]
Version = Annotated[StrictInt, Field(ge=1, le=1)]
Time = Annotated[int, Field(ge=0, le=2**53)]
Positive = Annotated[int, Field(gt=0, le=2**53)]


class Component(Fields):
    manufacturer: Id
    product: Id
    component: Id
    specification: Id
    version: Id
    instance: Id | None = None


class Context(Fields):
    """References at observation time. Catalog labels may change independently."""

    org: Id | None = None
    org_name: Id | None = None
    program: Id | None = None
    manufacturer: Id | None = None
    owner: Id | None = None
    person: Id | None = None
    academy: Id | None = None
    contract: Id | None = None
    component: Component | None = None


class Session(Context):
    org: Id
    org_name: Id
    series: Id
    season: Id
    regulation: Id
    round: Id
    session: Id
    session_kind: Literal["test", "practice", "qualifying", "sprint", "race"]
    track: Id
    layout: Id
    layout_version: Id
    entry: Id
    car: Id


class Result(Fields):
    kind: Literal["entry-result"]
    context: Session
    place: Positive | None
    status: Id
    crew: list[Id] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def distinct_crew(self):
        if len(set(self.crew)) != len(self.crew):
            raise ValueError("Повтор участника экипажа.")
        return self


class Lap(Fields):
    kind: Literal["lap"]
    context: Session
    lap: Positive
    elapsed_us: Positive
    sectors_us: list[Positive] = Field(max_length=32)
    eligible_for_record: bool
    position: Positive | None = None


class SessionEvent(Fields):
    kind: Literal[
        "position",
        "strategy",
        "stint",
        "pit-stop",
        "incident",
        "penalty",
        "technical-event",
    ]
    context: Session
    source_id: Id
    at_us: Time
    until_us: Time | None = None
    lap: Positive | None = None
    related_event: Id | None = None
    code: Id
    # Only quantities certified by the producer, with explicit units.
    measurements: list["Measurement"] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def time_order(self):
        if self.until_us is not None and self.until_us < self.at_us:
            raise ValueError("Окончание события предшествует началу.")
        return self


class Measurement(Fields):
    quantity: Id
    unit: Id
    unit_version: Positive = 1
    value: FiniteFloat


class Record(Fields):
    kind: Literal["record"]
    context: Session | Context
    source_id: Id
    reference: Id
    measurement: Measurement


class Milestone(Fields):
    kind: Literal[
        "achievement",
        "organization-change",
        "specification-change",
        "engineering-report",
        "research-report",
        "financial-event",
        "academy-event",
        "media-event",
        "contract-event",
    ]
    context: Session | Context
    source_id: Id
    code: Id
    reference: Id


class Estimate(Fields):
    kind: Literal["estimate"]
    context: Context
    source_id: Id
    quantity: Id
    unit: Id
    unit_version: Positive = 1
    low: FiniteFloat
    high: FiniteFloat

    @model_validator(mode="after")
    def ordered(self):
        if self.low > self.high:
            raise ValueError("Перепутаны границы оценки.")
        return self


class Fact(Fields):
    version: Version
    day: Day
    # Real pre-career data requires a separate verified identity catalog (#41).
    origin: Literal["simulation", "initial"] = "simulation"
    access: Access
    data: Annotated[
        Result | Lap | SessionEvent | Record | Milestone | Estimate,
        Field(discriminator="kind"),
    ]

    @model_validator(mode="after")
    def policy(self):
        required = {
            "strategy": "internal",
            "technical-event": "technical",
            "financial-event": "internal",
            "specification-change": "technical",
            "engineering-report": "technical",
            "research-report": "technical",
            "estimate": "estimate",
        }.get(self.data.kind)
        if self.access != "public" and self.data.context.org is None:
            raise ValueError("Закрытым данным требуется организация с правом доступа.")
        if (self.data.context.org is None) != (self.data.context.org_name is None):
            raise ValueError("Идентификатор и название организации задаются вместе.")
        if required is not None and self.access != required:
            raise ValueError("Недопустимая область доступа для этого факта.")
        if self.access == "estimate" and not isinstance(self.data, Estimate):
            raise ValueError("Для оценки требуется диапазон.")
        return self


class Batch(Fields):
    facts: list[Fact] = Field(min_length=1, max_length=512)


class RecordingPolicy(Fields):
    period_us: Positive
    archive_days: int | None = Field(ge=0, le=36500)


class ChannelHeader(Fields):
    version: Version
    day: Day
    context: Session
    channel: Id
    unit: Id
    unit_version: Positive = 1
    first_us: Time
    period_us: Positive


class ChannelBlock(ChannelHeader):
    values: list[FiniteFloat] = Field(min_length=1, max_length=4096)

    @model_validator(mode="after")
    def end_in_range(self):
        if self.first_us + self.period_us * len(self.values) > 2**53:
            raise ValueError("Блок выходит за диапазон часов сессии.")
        return self
