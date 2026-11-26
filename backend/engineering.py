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
    for entry in entries.values():
        generation(entry["championship"] + "-2026", entry["category"])
    return dict(
        seasons=seasons,
        technical_rules=regulations,
        generations=generations,
        concepts=concepts,
        atr=config["f1_atr"],
        cost_cap=config["f1_cost_cap"],
        sources=config["sources"],
    )


def project_target(world, program_id, season_id, generation_id, *, planning_year=None):
    program = world["programs"].get(program_id)
    if not program and planning_year:
        org, _, series = program_id.partition(":")
        maker = world["organizations"].get(org, {})
        if maker.get("kind") == "supplier" and series in maker["programs"]:
            program = dict(
                org=org,
                championship=series,
                classes=world["championships"][series]["classes"],
            )
    engineering = world["engineering"]
    gen = engineering["generations"].get(generation_id)
    season = engineering["seasons"].get(season_id)
    if program and planning_year and not gen:
        for year in (planning_year, planning_year + 1):
            for category in program["classes"]:
                sid = f"{program['championship']}-{year}"
                if season_id == sid and generation_id == f"{sid}-{category.lower()}-v1":
                    gen = dict(
                        category=category,
                        season=sid,
                        regulation="tech-" + generation_id,
                    )
                    season = dict(championship=program["championship"])
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


def resource_scope(world, org, day, current_rank=None, *, simulated=False):
    """The activity date selects the common pool for both project target seasons."""
    if org not in world["engineering"]["atr"]["opening_rank"]:
        return None
    rule = world["engineering"]["atr"]
    successor = simulated and day >= rule["end_exclusive"]
    if successor:
        year = day[:4]
        rule = dict(
            rule,
            id=f"f1-{year}-atr-sim-1",
            period_starts=[year + d[4:] for d in rule["period_starts"]],
            end_exclusive=f"{int(year) + 1}-01-01",
        )
    period = atr_period(rule, day)
    if not period:
        return None
    rank = (
        rule["opening_rank"].index(org) + 1
        if period["number"] <= 3 and not successor
        else current_rank
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
