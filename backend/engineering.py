"""Technical identities and resource scope. No project scheduler or simulated consumption."""

from bisect import bisect_right
import re

from .domain import RuleError


def technical_catalog(rules, entries, cars, config):
    seasons, regulations, generations, concepts = {}, {}, {}, {}
    for series in rules:
        for year in (2025, 2026):
            sid = f"{series}-{year}"
            seasons[sid] = dict(
                id=sid,
                championship=series,
                year=year,
                status="active" if year == 2025 else "planning",
            )

    def generation(sid, category):
        gid = f"{sid}-{category.lower()}-v1"
        rid = f"tech-{gid}"
        regulations[rid] = dict(id=rid, season=sid, category=category, version=1)
        generations[gid] = dict(id=gid, regulation=rid, season=sid, category=category)
        return gid

    for entry in entries.values():
        sid = entry["championship"] + "-2025"
        car = cars[entry["car"]]
        gid = generation(sid, entry["category"])
        model_id = re.sub(r"[^a-z0-9]+", "-", car["name"].lower()).strip("-")
        concept = f"concept-{sid}-{entry['org']}-{model_id}"
        concepts[concept] = dict(
            id=concept, generation=gid, org=entry["org"], name=car["name"]
        )
        car.update(
            season=sid,
            generation=gid,
            concept=concept,
            regulation=generations[gid]["regulation"],
        )
    # Only the announced F1 successor is seeded. Other future homologations can be registered independently.
    generation("f1-2026", "F1")
    return dict(
        seasons=seasons,
        technical_rules=regulations,
        generations=generations,
        concepts=concepts,
        atr=config["f1_atr"],
        cost_cap=config["f1_cost_cap"],
        sources=config["sources"],
    )


def project_target(world, program_id, season_id, generation_id):
    program = world["programs"].get(program_id)
    engineering = world["engineering"]
    gen = engineering["generations"].get(generation_id)
    season = engineering["seasons"].get(season_id)
    if (
        not program
        or not gen
        or not season
        or gen["category"] not in program["classes"]
        or gen["season"] != season_id
        or (season["championship"] != program["championship"])
    ):
        raise RuleError("Сезон и поколение несовместимы с программой.")
    return dict(
        program=program_id,
        target_season=season_id,
        generation=generation_id,
        regulation=gen["regulation"],
        budget_owner=program["org"],
    )


def atr_period(rule, day):
    starts = rule["period_starts"]
    i = bisect_right(starts, day) - 1
    if i < 0 or day >= rule["end_exclusive"]:
        return None
    return dict(
        id=f"{rule['id']}-p{i + 1}",
        number=i + 1,
        start=starts[i],
        end_exclusive=(starts + [rule["end_exclusive"]])[i + 1],
    )


def resource_scope(world, org, day, current_rank=None):
    """The activity date selects the common pool for both project target seasons."""
    if org not in world["engineering"]["atr"]["opening_rank"]:
        return None
    rule = world["engineering"]["atr"]
    period = atr_period(rule, day)
    if not period:
        return None
    rank = (
        rule["opening_rank"].index(org) + 1 if period["number"] <= 3 else current_rank
    )
    percent = None if rank is None else rule["rank_percent"][min(rank, 10) - 1]
    limits = (
        None
        if percent is None
        else {k: (v * percent + 99) // 100 for k, v in rule["base"].items()}
    )
    return dict(
        pool_id=org + ":" + period["id"], period=period, percent=percent, limits=limits
    )
