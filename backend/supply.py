"""Eligibility and client observation boundaries for future session/contract producers."""

from dataclasses import dataclass
from enum import Enum


class TyreMarket(str, Enum):
    SOLE = "sole"
    APPROVED = "approved"
    OPEN = "open"


def tyre_eligible(policy, supplier, *, homologated):
    mode = TyreMarket(policy["mode"])
    if not homologated:
        return False
    if mode is TyreMarket.OPEN:
        return True
    listed = policy["approved_suppliers"]
    if mode is TyreMarket.SOLE and len(listed) != 1:
        raise ValueError("У монопольного рынка должен быть один поставщик.")
    return supplier in listed


@dataclass(frozen=True)
class SupportAssignment:
    """A manufacturer's employee serves a client within a dated service agreement."""

    id: str
    advisor: str
    employer: str
    client: str
    agreement: str
    product: str
    start: str
    end_exclusive: str
    channels: frozenset[str]
    salary_cents: int
    allocation_percent: int


@dataclass(frozen=True)
class ObservationScope:
    client: str
    car: str
    session: str
    session_kind: str
    supplier: str
    product: str
    spec_version: str
    instance: str


def visible_channels(assignment, scope, day, employer, channels):
    """Allowlist for observations, with no access granted by a global supplier role."""
    if assignment is None or not (
        assignment.agreement
        and assignment.employer == employer == scope.supplier
        and assignment.client == scope.client
        and assignment.product == scope.product
        and assignment.start <= day < assignment.end_exclusive
        and scope.session_kind in {"test", "practice", "qualifying", "race"}
    ):
        return frozenset()
    return assignment.channels.intersection(
        channels,
        {
            "distance",
            "temperature",
            "wear",
            "mode",
            "power",
            "failure_observed",
            "test_completed",
            "feedback",
        },
    )
