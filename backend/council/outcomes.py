"""Compare the staff's actual deliverable with its signed evidence in the same career."""

from .. import teamwork


def completed(state, world, project):
    related = [
        r for r in state["council"]["briefs"].values() if r.get("work") == project["id"]
    ]
    if not related:
        return
    report = state["research"]["reports"].get("report-" + project["id"])
    reading = project.get("report")
    outcome = None
    if report:
        summary = report["conclusion"]
        if report["outcome"] == "inconclusive":
            outcome = "incomplete-analysis"
    elif reading:
        summary = reading["finding"] or reading["interpretation"]
        drawing = state["components"]["revisions"].get(project["candidate"])
        design = (
            state["development"]["projects"].get(drawing["reference"])
            if drawing
            else None
        )
        # A component reading may validate a component forecast. An assembly calculation
        # represents a different quantity even when both are expressed in square metres.
        if (
            design
            and design["org"] == project["org"]
            and project["method"] != "calculation"
            and reading["metric"] in design["forecast"]
        ):
            low, high = design["forecast"][reading["metric"]]
            measured = reading["b"]["value"]
            spread = reading["uncertainty"]
            if low <= measured - spread and measured + spread <= high:
                outcome = "verified-analysis"
            elif measured + spread < low or measured - spread > high:
                outcome = "incomplete-analysis"
    else:
        summary = "КБ передало редакцию " + project["specification"] + "."
    for r in related:
        r["outcome"] = dict(date=state["date"], source=project["id"], summary=summary)
    # Credit only a pair that actually worked together on this deliverable.
    if outcome:
        lead = project["lead"]
        peers = {
            r["chief"]
            for r in related
            if r["chief"] in project["participants"] and lead in project["participants"]
        }
        for chief in sorted(peers):
            if f"technical|{lead}|{chief}" in teamwork.partnerships(
                state, world, state["date"]
            ):
                teamwork.record_event(
                    state, world, lead, chief, outcome, project["id"], state["date"]
                )
