"""Browser acceptance fixture, isolated in Playwright's temporary career database."""

import sys
from backend import service
from backend.catalog import WORLD

org = "team-abt-sportsline"


def publish(career, action, **fact):
    return service.execute(
        career["id"],
        service.Command(
            command_id=action, revision=career["revision"], action=action, staff=fact
        ),
    )


def prepare():
    c = service.create(
        service.CareerInput(
            role="manager", org=org, series="dtm", name="Приёмка", seed=42
        )
    )
    seat, teammate = [
        a
        for a in WORLD["assignments"].values()
        if a["org"] == org and a["position"] == "driver"
    ]
    c = publish(
        c,
        "driver-absence",
        person=seat["person"],
        date=c["date"],
        reason="illness",
        authority="medical",
        expected_return="2025-02-12",
        evidence="Тестовый медицинский протокол",
        reference="test-absence",
    )
    event = next(
        e for e in WORLD["events"] if e["kind"] == "round" and e["series"] == "dtm"
    )
    publish(
        c,
        "driver-registration",
        date=c["date"],
        seat=seat["id"],
        round=event["id"],
        regulation=WORLD["championships"]["dtm"]["rules_id"],
        reference="test-registration",
        phase="registration",
        deadline=event["start"],
        approved=[teammate["person"], "agent-season25-1"],
        crew=[],
        minimum_crew=1,
        driving_time_approved=True,
        evidence="Тестовый протокол регистрации",
    )
    print(c["id"])


if __name__ == "__main__":
    if len(sys.argv) == 1:
        prepare()
    else:
        c = service.load(sys.argv[1])
        publish(
            c,
            "driver-clearance",
            date=c["date"],
            reference="test-clearance",
            absence="test-absence",
            authority="medical",
            evidence="Тестовый протокол допуска",
        )
