"""Custody and support facts are written alongside the checkpoint for both signatories."""


def record(state, code, entry, axis, iid, version, client, maker, contract, reference):
    events = state["manufacturer"]["events"]
    events.append(
        dict(
            id=f"maker-event-{len(events) + 1}",
            date=state["date"],
            code=code,
            entry=entry,
            axis=axis,
            instance=iid,
            specification=version,
            client=client,
            supplier=maker,
            contract=contract,
            reference=reference,
        )
    )


def write_fact(db, cid, state, world, event):
    from ..statistics import facts
    from ..statistics.models import Batch
    from ..components.registry import drawing_for

    d = drawing_for(state, event["specification"])
    payload = []
    for org in sorted({event["client"], event["supplier"]}):
        payload.append(
            dict(
                version=1,
                day=event["date"],
                access="technical",
                data=dict(
                    kind="engineering-report",
                    source_id=event["id"] + "/" + org,
                    reference=event["reference"],
                    code=event["code"],
                    context=dict(
                        org=org,
                        org_name=world["organizations"][org]["name"],
                        contract=event["contract"],
                        program=org
                        + ":"
                        + world["entries"][event["entry"]]["championship"],
                        component=dict(
                            manufacturer=d["manufacturer"],
                            product=d["slot"],
                            component=d["slot"],
                            specification=d["family"],
                            version=d["id"],
                            instance=event["instance"],
                        ),
                    ),
                ),
            )
        )
    facts.record(db, cid, Batch(facts=payload))
