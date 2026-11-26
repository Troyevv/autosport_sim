"""Project physical package coverage from the shared workshop and garage registers."""

from .. import components, production


class Deployment:
    """One read-only allocation across all packages in the organization's portfolios."""

    def __init__(self, state, world, org):
        self.state = state
        self.world = world
        self.org = org
        self.claimed = set()
        self.requirements = {}
        self.incoming = {}
        self.by_version = None

    def supply(self, version):
        if self.by_version is None:
            self.by_version = {}
            mounts = production.mounted(self.state, self.world, self.org)
            for iid in sorted(production.inventory(self.state, self.org)):
                key = components.spec(self.state, iid)["id"]
                phase = production.status(self.state, iid, mounts)
                if phase == "stock" and not components.serviceable(self.state, iid):
                    phase = "unserviceable"
                self.by_version.setdefault(key, {}).setdefault(phase, []).append(iid)
        return self.by_version.get(version, {})

    def expected(self, version, batches, missing):
        """Count each outstanding unit once, without releasing it for installation."""
        phases = self.supply(version)
        queued = [
            i
            for i in phases.get("inspection", ())
            if not self.state["production"]["items"][i].get("rejected")
        ]
        incoming = {
            "inspection": [(iid, 1) for iid in queued],
            "repair": [(iid, 1) for iid in phases.get("repair", ())],
            "produce": [(b["id"], b["quantity"]) for b in batches if not b["finished"]],
        }
        covered = {}
        for stage, rows in incoming.items():
            covered[stage] = 0
            for key, count in rows:
                used = self.incoming.get(key, 0)
                take = min(count - used, missing)
                self.incoming[key] = used + take
                missing -= take
                covered[stage] += take
        return missing, covered

    def distribute(self, cars, plan, pkg, drawing):
        state, world = self.state, self.world
        year, version = plan["year"], drawing["id"]
        current = year == int(state["date"][:4])
        phases = self.supply(version)
        free = [
            i
            for i in phases.get("stock", ())
            if i not in self.claimed and components.installable_revision(state, i)
        ]
        planned = None if current else {car["id"] for car in cars}
        targets = []
        fits = []
        for car in cars:
            eid = car["id"]
            row = dict(entry=eid, number=car["number"], status="waiting", instance=None)
            targets.append(row)
            if not components.compatible(state, world, car, drawing, year=year):
                row["status"] = "incompatible"
                continue
            requirement = (year, eid, version)
            if requirement in self.requirements:
                row.update(status="shared", package=self.requirements[requirement])
                continue
            self.requirements[requirement] = pkg["id"]
            fitted = components.mounting(state, eid)[drawing["slot"]]
            if (
                current
                and fitted in phases.get("installed", ())
                and components.serviceable(state, fitted)
            ):
                row.update(status="installed", instance=fitted)
                self.claimed.add(fitted)
                continue
            iid = next((i for i in free if i not in self.claimed), None)
            if not iid:
                continue
            redirect, _, _ = components.allocation(
                state, world, car, iid, free, year=year, planned_entries=planned
            )
            if redirect:
                row["status"] = "priority"
                continue
            self.claimed.add(iid)
            row.update(status="allocated", instance=iid)
            if current and not components.installation_block(
                state, car, components.specialists(state, world, car)
            ):
                fits.append(
                    dict(
                        entry=eid,
                        instance=iid,
                        label=f"№{car['number']} · {components.serial(iid)}",
                    )
                )
        return targets, fits
