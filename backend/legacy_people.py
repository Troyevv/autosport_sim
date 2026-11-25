"""Replay the original personnel draws only when validating a version-one career."""

from .domain import draw, assign_face, START


def populate(catalog, setup, state):
    org, role = setup["org"], setup["role"]
    positions = {}
    for aid, assignment in catalog["assignments"].items():
        pid = assignment["person"]
        if pid:
            positions.setdefault(pid, set()).add(assignment["position"])
        if assignment["org"] == org and assignment["position"] == role:
            pid = "player"
        state["seats"][aid] = [dict(person=pid, start=START, end=None)] if pid else []
    positions["player"] = {role}
    for pid, jobs in sorted(positions.items()):
        profile_rng = {"rng": setup["seed"]} if pid == "player" else state
        skills = {
            skill: draw(profile_rng, 55, 94)
            for job in sorted(jobs)
            for skill in catalog["positions"][job]["skills"]
        }
        person = dict(
            id=pid,
            name=setup["name"] if pid == "player" else catalog["names"][pid],
            origin="generated" if pid == "player" else "real",
            face=None if pid == "player" else pid,
            skills=skills,
            potential=draw(profile_rng, max(skills.values()), 100),
            morale=70,
            fatigue=0,
            traits=[],
        )
        assign_face(person, state["people"], setup["face_pool"], setup["seed"])
        state["people"][pid] = person
