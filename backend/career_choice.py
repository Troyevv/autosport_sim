"""Candidate comparison based on their own contract, known colleagues and published results."""

from datetime import date
from .domain import occupant_on
from .personnel import active, bookings
from .teamwork import trust


def office(world, seat):
    if seat.get("academy") or seat.get("position") == "manager":
        return "owner"
    return (
        "manager"
        if world["organizations"][seat["org"]]["kind"] == "team"
        else "manufacturer"
    )


def public_form(state, world, org, series, category):
    """Placings are comparable only within the same series; retain the denominator."""
    if not series:
        return None
    results = {}
    for entries in state["starts"].values():
        for eid, result in entries.items():
            if (
                result.get("series") == series
                and result.get("org") == org
                and world["entries"].get(result.get("entry"), {}).get("category")
                == category
                and result["place"]
                and result["day"] <= state["date"]
            ):
                results[eid, result["entry"]] = result["place"]
    return (sum(results.values()) / len(results), len(results)) if results else None


def assess(state, world, p, offer):
    seat = world["assignments"][offer["seat"]]
    org = seat["org"]
    day = state["date"]
    contracts = [
        (world["assignments"][aid], r)
        for aid, r in bookings(state, p["id"])
        if active(r, day)
    ]
    current = min(
        contracts,
        key=lambda pair: (
            pair[0]["org"] != org,
            pair[0]["series"] != seat["series"],
            pair[0]["id"],
        ),
        default=None,
    )
    old, contract = current or ({}, {})
    ambition = p["ambition"]
    loyalty = p["loyalty"]
    priority = "development" if p["professionalism"] > ambition + 10 else "sport"
    if ambition < 60 or p.get("management", {}).get("style") == "economy":
        priority = "security"
    if p["position"] != "driver" and priority == "sport":
        priority = "autonomy"
    reasons = []
    score = 0
    veto = None
    if old and old["org"] != org:
        years = (
            max(
                0,
                (date.fromisoformat(day) - date.fromisoformat(contract["start"])).days,
            )
            // 365
        )
        score -= max(0, loyalty - 55) // 6 + min(5, years)
        contact_scores = [
            trust(r) - 50
            for r in state["relationships"].values()
            if p["id"] in (r["a"], r["b"]) and r["org"] in (org, old["org"])
        ]
        old_contacts = [
            r
            for r in state["relationships"].values()
            if p["id"] in (r["a"], r["b"]) and r["org"] == old["org"]
        ]
        if contact_scores:
            delta = sum(contact_scores) - 2 * sum(trust(r) - 50 for r in old_contacts)
            score += max(-10, min(10, delta // 5))
        if loyalty >= 75:
            reasons.append("Ценит действующее назначение и знакомых коллег.")
        new_boss = occupant_on(state["seats"][org + ":" + office(world, seat)], day)
        old_boss = occupant_on(
            state["seats"][old["org"] + ":" + office(world, old)], day
        )
        if new_boss and old_boss:
            difference = (
                state["people"][new_boss]["reputation"]
                - state["people"][old_boss]["reputation"]
            )
            score += difference // 12
            if abs(difference) >= 20:
                reasons.append("Учитывает профессиональную репутацию руководства.")
        # Public honours establish sporting prestige independently of today's classification.
        honours = {
            (f["org"], f["event_id"], f["context"]["achievement"])
            for row in state["work_log"].values()
            if (f := row["fact"])["org"] in (org, old["org"])
            and f["context"].get("achievement") in ("win", "title")
            and f["date"] <= day
        }
        if honours:

            def prestige(employer):
                return min(
                    8,
                    sum(
                        4 if award == "title" else 1
                        for team, _, award in honours
                        if team == employer
                    ),
                )

            difference = prestige(org) - prestige(old["org"])
            if difference:
                score += difference
                reasons.append(
                    "Учитывает подтверждённые победы и титулы в истории выступлений организаций."
                )
        category = world["entries"].get(seat["entry"], {}).get("category")
        if (
            category
            and seat["series"] == old["series"]
            and world["entries"].get(old["entry"], {}).get("category") == category
        ):
            new = public_form(state, world, org, seat["series"], category)
            previous = public_form(state, world, old["org"], old["series"], category)
            if new and previous:
                gap = previous[0] - new[0]
                score += int(max(-16, min(16, gap))) * (2 if priority == "sport" else 1)
                reasons.append(
                    f"Публичные классификации в серии: {previous[1]} у нынешней команды, {new[1]} у предложившей."
                )
                if (
                    min(new[1], previous[1]) >= 2
                    and gap <= -5
                    and priority == "sport"
                    and ambition >= 75
                ):
                    veto = "Спортивные перспективы нынешней команды важнее прибавки к окладу."
        if seat["series"] and old["series"]:

            def admission(s):
                return world["championships"][s]["admission"].get("min_points", 0)

            step = admission(seat["series"]) - admission(old["series"])
            if step:
                score += 12 if step > 0 else -12
                reasons.append("Учитывает уровень допуска чемпионата.")
                if step < 0 and priority == "sport" and ambition >= 80:
                    veto = (
                        "Пилот хочет сохранить место в серии с более высоким допуском."
                    )
    if "lineup" in state and p["position"] == "driver" and seat["entry"]:
        from .driver_terms import assessment, LABELS

        status = offer.get("driver_status") or "equal"
        change, refusal = assessment(
            state, p, org, status, contract.get("driver_status", "equal")
        )
        score += change
        reasons.append("Предлагаемый статус · " + LABELS[status])
        if refusal:
            veto = refusal
            reasons.append(refusal)
    remit = offer.get("remit", "standard")
    previous_remit = contract.get("remit", "standard")
    if p["position"] != "driver" and remit != previous_remit:
        scale = {"supervised": 0, "standard": 1, "independent": 2}
        change = scale[remit] - scale[previous_remit]
        score += change * (10 if priority in ("development", "autonomy") else 3)
        reasons.append("Сопоставляет самостоятельность и возможность наставничества.")
        if (
            change < 0
            and priority in ("development", "autonomy")
            and max(ambition, p["professionalism"]) >= 76
        ):
            veto = "Ограниченные полномочия не соответствуют профессиональной цели."
    duration = (
        date.fromisoformat(offer["end"]) - date.fromisoformat(offer["start"])
    ).days
    if priority == "security" and duration >= 180:
        score += 5
        reasons.append("Ценит гарантированный срок работы.")
    if any(
        r["person"] == p["id"] and r["payer"] == org and any(r["arrears"].values())
        for r in state["funding"].values()
    ):
        score -= 12
        reasons.append("Учитывает известную просрочку по собственному финансированию.")
    if any(
        r["org"] == org and r["status"] == "completed" and p["id"] in r["participants"]
        for r in state["preparations"].values()
    ):
        score += 8 if priority == "development" else 3
        reasons.append("Знаком с доступной профессиональной подготовкой.")
    if p["position"] == "manager":
        mandate = state["mandates"][org]
        if priority != "security" and ambition >= 80 and mandate["autonomy"] < 30:
            veto = "Делегированных владельцем полномочий недостаточно."
    return dict(
        priority=priority, score=max(-35, min(25, score)), reasons=reasons, veto=veto
    )
