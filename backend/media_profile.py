"""Stable identity and known audience context, independent of professional skill and result simulation."""

from hashlib import sha256
import json
from pathlib import Path

DATA = Path(__file__).parent / "data" / "2025-v3"
COUNTRIES = json.loads((DATA / "countries.json").read_text(encoding="utf-8"))
RACE_COUNTRIES = sorted(
    set(
        json.loads((DATA / "track-countries.json").read_text(encoding="utf-8")).values()
    )
)
COUNTRY_IDS = {name: code for code, name in COUNTRIES.items()}
TRAITS = (
    "charisma",
    "diplomacy",
    "candor",
    "temper",
    "privacy",
    "provocation",
    "self_criticism",
    "arrogance",
)


def initialize(state):
    if state.get("identity_schema") == 1:
        return
    for pid, p in state["people"].items():
        country = state["setup"].get("country") if pid == state["player_id"] else None
        country = country or p.get("country") or COUNTRY_IDS[p["nationality"]]
        sample = sha256(("public-profile:" + pid).encode()).digest()
        other_regions = [code for code in RACE_COUNTRIES if code != country]
        foreign = other_regions[sample[12] % len(other_regions)]
        p.update(
            country=country,
            nationality=COUNTRIES[country],
            authority=20 + sample[0] % 76,
            popularity=sample[1] % 96,
            regional_popularity={country: sample[2] % 96, foreign: sample[13] % 96},
            media_traits={k: 15 + sample[i + 3] % 81 for i, k in enumerate(TRAITS)},
        )
    state["identity_schema"] = 1


def bounded(value):
    return min(100, max(0, value))


def context(person, country, *, scrutiny=0, trust=50):
    """Only the attention/pressure and relationship known to the speaker enter the context."""
    if country not in COUNTRIES or not all(
        type(v) is int and 0 <= v <= 100 for v in (scrutiny, trust)
    ):
        raise ValueError("Некорректная страна, оценка внимания или доверия.")
    home = person["country"] == country
    t = person["media_traits"]
    regional = person["regional_popularity"].get(country, 0)
    attention = bounded(
        (2 * regional + person["popularity"] + t["charisma"]) // 4
        + 15 * home
        + scrutiny // 3
    )
    pressure = bounded(
        attention
        * (
            100
            - person["skills"].get("Работа под давлением", person["professionalism"])
        )
        // 100
        + (t["temper"] - t["diplomacy"]) // 8
    )
    return dict(
        country=country,
        home=home,
        attention=attention,
        pressure=pressure,
        motivation=bounded(50 + (attention * (t["charisma"] - t["privacy"])) // 250),
        openness=bounded((t["candor"] + 100 - t["privacy"] + trust) // 3),
        conflict=bounded(
            (
                t["temper"]
                + t["provocation"]
                + t["arrogance"]
                + pressure
                + 100
                - t["diplomacy"]
                + 100
                - person["loyalty"]
            )
            // 6
        ),
        accountability=bounded(
            (t["self_criticism"] + 100 - t["arrogance"] + person["professionalism"])
            // 3
        ),
        influence=(person["authority"] + t["charisma"]) // 2,
    )


def calendar_context(state, world, p):
    from .personnel import active, bookings

    if p["position"] != "driver":
        return []
    posts = [
        (world["assignments"][aid]["series"], row)
        for aid, row in bookings(state, p["id"])
    ]
    return [
        dict(
            event=e["id"],
            name=e["name"],
            date=e["start"],
            series=e["series"],
            **context(p, e["country"]),
        )
        for e in sorted(world["events"], key=lambda e: (e["start"], e["id"]))
        if e["kind"] == "round"
        and e["end"] >= state["date"]
        and any(
            series == e["series"] and active(row, e["start"]) for series, row in posts
        )
    ]
