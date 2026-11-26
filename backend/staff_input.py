from datetime import date
from typing import Annotated, Literal
from pydantic import AfterValidator, BaseModel, ConfigDict, Field


class Fields(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


Id = Annotated[str, Field(min_length=1, max_length=220)]


def iso_day(value: str):
    if date.fromisoformat(value).isoformat() != value:
        raise ValueError("Нужна календарная дата.")
    return value


Day = Annotated[str, AfterValidator(iso_day)]


class Offer(Fields):
    remit: Literal["supervised", "standard", "independent"] = "standard"
    person: Id
    seat: Id
    start: Day
    end: Day
    salary_cents: int = Field(gt=0, le=10**10)
    bonus_cents: int = Field(ge=0, le=10**10)


class Reply(Fields):
    offer: Id


class Seat(Fields):
    seat: Id


class Course(Seat):
    skill: Id


class Support(Seat):
    entry: Id
    product: Id
    start: Day
    end: Day


class Observation(Fields):
    person: Id


class Mandate(Fields):
    limit_cents: int = Field(ge=0, le=10**11)
    goal: Literal["performance", "development", "economy", "technical"]
    priority: Literal["required", "desired"]
    horizon: Literal["race", "intermediate", "season", "long"]
    autonomy: int = Field(ge=0, le=100)


class Scholarship(Observation):
    recipient: Id | None = None
    academy: Id
    end: Day
    monthly_cents: int = Field(gt=0, le=10**10)
    option: bool
    priority: bool


class Sponsorship(Observation):
    recipient: Id
    monthly_cents: int = Field(gt=0, le=10**10)
    end: Day
    portable: bool
    guarantee: bool


class Agreement(Fields):
    agreement: Id


class Coaching(Agreement):
    skill: Id


class Program(Fields):
    kind: Literal[
        "simulator", "fitness", "academy", "pit-drill", "debrief", "bench-test"
    ]


ORDERS = {
    "prepare-program": Program,
    "manufacturer-backing": Sponsorship,
    "scout-driver": Observation,
    "manager-mandate": Mandate,
    "academy-enroll": Scholarship,
    "academy-right": Agreement,
    "academy-course": Coaching,
    "funding-end": Agreement,
    "offer-send": Offer,
    "offer-accept": Reply,
    "offer-withdraw": Reply,
    "staff-release": Seat,
    "staff-train": Course,
    "advisor-assign": Support,
}
