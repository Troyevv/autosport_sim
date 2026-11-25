"""Coverage of unique people and artwork actually written to one archive."""

from collections import Counter

from backend.catalog import DISPLAY_NAMES, WORLD


def coverage(assets, attempts, gaps, size):
    ready = {a["entity"]: a for a in assets if a["kind"] == "head"}
    members = {
        series: {
            p
            for e in WORLD["entries"].values()
            if e["championship"] == series
            for p in e["crew"]
        }
        for series in WORLD["championships"]
    }
    staff = {
        a["person"]
        for a in WORLD["assignments"].values()
        if a["position"] != "driver" and a["person"]
    }

    def counted(ids):
        count = len(ids.intersection(ready))
        return {
            "prepared": count,
            "total": len(ids),
            "percent": round(100 * count / len(ids), 2) if ids else 0,
        }

    return {
        "world": WORLD["version"],
        "archive_bytes": size,
        "assets": dict(Counter(a["kind"] for a in assets)),
        "people": counted(set(WORLD["names"])),
        "staff": counted(staff),
        "championships": {c: counted(ids) for c, ids in members.items()},
        "portraits": {
            pid: {
                "name": DISPLAY_NAMES[pid],
                "series": [c for c, ids in members.items() if pid in ids],
                **attempts[pid],
            }
            for pid in sorted(WORLD["names"])
        },
        "gaps": gaps,
    }
