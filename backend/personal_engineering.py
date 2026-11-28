"""Exclusive client posts, backed by the dated employment and supply ledgers."""

from collections import defaultdict
from functools import lru_cache
from hashlib import sha256

from . import personnel, media_profile
from .domain import RuleError
from .opening.catalog import values


@lru_cache(maxsize=1)
def roster():
    return values("engineering-staff.csv")


def position(key, maker, client=None, entry=None):
    return dict(
        id=key,
        org=maker,
        series=entry["championship"] if entry else None,
        entry=entry["id"] if entry else None,
        client=client,
        person=None,
        position="race-engineer" if entry else "technical-advisor",
    )


def client_post(maker, client):
    return f"{maker}:technical-advisor:{client}"


def catalog(state, world):
    office = state.get("engineering_service")
    if not office:
        return world
    return dict(world, assignments=world["assignments"] | office["posts"])


def add_person(state, world, record, role, seat):
    pid = record["id"]
    digest = sha256(pid.encode()).digest()
    skills = {
        s: 49 + digest[i] % 44 for i, s in enumerate(world["positions"][role]["skills"])
    }
    person = dict(
        id=pid,
        name=record["name"],
        face=record["face"],
        origin="generated",
        nationality=world["countries"][record["country"]],
        birth_date=record["birth_date"],
        experience=int(record["experience"]),
        potential=min(99, max(skills.values()) + digest[6] % 11),
        skills=skills,
        specialization=max(skills, key=skills.get),
        fatigue=0,
        morale=70,
    )
    disciplines = {c["discipline"] for c in world["championships"].values()}
    personnel.initialize_person(state, world, person, role, disciplines)
    person.pop("training")
    person.pop("courses")
    media_profile.initialize_person(state, pid, person)
    state["people"][pid] = person
    if seat is None:
        return
    # Opening retainers are monthly. Regular payroll settles the actual days employed.
    from .employment import ask

    salary = ask(state, world, person, seat)
    end = f"{int(state['date'][:4]) + 1}-01-01"
    for d in personnel.disciplines(world, seat):
        person["adaptation"][d] = 80
        person["discipline_days"][d] = person["experience"] * 365
    state["seats"][seat["id"]] = [
        dict(
            person=pid,
            position=role,
            start=state["date"],
            end=end,
            agreed_end=end,
            salary_cents=salary,
            buyout_cents=salary * 2,
            remit="standard",
        )
    ]


def activate(state):
    if "engineering_service" in state:
        return
    from .catalog import lineup_for

    world = lineup_for(state)
    office = state["engineering_service"] = dict(
        since=state["revision"], start=state["date"], posts={}, briefings={}
    )
    posts = office["posts"]
    people = iter(roster())
    by_maker = defaultdict(set)
    # Use the saved contracts. A supplier can have changed before the upgrade.
    for (maker, client), spans in supply_periods(state, world).items():
        if any(a <= state["date"] < b for a, b in spans):
            by_maker[maker].add(client)
    engineers = {
        a["entry"]
        for a in world["assignments"].values()
        if a["position"] == "race-engineer"
    }
    for eid, e in sorted(world["entries"].items()):
        if eid not in engineers:
            key = f"{e['org']}:race-engineer:{e['championship']}:{eid}"
            posts[key] = position(key, e["org"], entry=e)
            add_person(state, world, next(people), "race-engineer", posts[key])
    for maker in sorted(
        {
            a["org"]
            for a in world["assignments"].values()
            if a["position"] == "technical-advisor"
        }
    ):
        clients = by_maker[maker]
        original = maker + ":technical-advisor"
        old = next(
            (
                r["client"]
                for r in state["support"]
                if r["employer"] == maker
                and r["start"] <= state["date"] < r["end"]
                and r["client"] in clients
            ),
            None,
        )
        first = old or min(clients, default=None)
        posts[original] = dict(world["assignments"][original], client=first)
        for client in sorted(clients - {first}):
            key = client_post(maker, client)
            posts[key] = position(key, maker, client)
            state["seats"][key] = []
            if record := next(people, None):
                add_person(state, world, record, "technical-advisor", posts[key])
        # A relief post is a normal job. Large portfolios retain a reserve on opening day.
        key = original + ":reserve"
        posts[key] = position(key, maker)
        state["seats"][key] = []
        if len(clients) >= 7 and (record := next(people, None)):
            add_person(state, world, record, "technical-advisor", posts[key])
    for org, team in world["organizations"].items():
        if team["kind"] == "team":
            key = org + ":race-engineer:reserve"
            posts[key] = dict(
                position(key, org), position="race-engineer", engineering_reserve=True
            )
            state["seats"][key] = []
    office["covers"] = []
    # Multi-programme teams can retain a substitute in the same payroll as their starters.
    multi = sorted(
        org
        for org, team in world["organizations"].items()
        if team["kind"] == "team" and len(team["programs"]) > 1
    )
    for org in multi[:2]:
        if record := next(people, None):
            add_person(
                state,
                world,
                record,
                "race-engineer",
                posts[org + ":race-engineer:reserve"],
            )
    for i, record in enumerate(people):
        add_person(
            state,
            world,
            record,
            "technical-advisor" if i % 2 == 0 else "race-engineer",
            None,
        )
    for deal in state["market"]["supplies"].values():
        if deal["status"] == "signed":
            ensure_post(state, deal["sponsor"], deal["org"])
    personnel.update_payroll(state, lineup_for(state), state["date"])


def ensure_post(state, maker, client):
    office = state.get("engineering_service")
    if not office or any(
        p.get("client") == client and p["org"] == maker
        for p in office["posts"].values()
    ):
        return
    key = client_post(maker, client)
    office["posts"][key] = position(key, maker, client)
    state["seats"][key] = []


def service_deals(state, world, maker=None, client=None):
    """Signed supply history, including pre-opening careers' original entry agreements."""
    legacy = bool(state.get("engineering_service")) and not state.get("opening")
    replaced = {}
    for deal in state["market"]["supplies"].values():
        if deal["status"] not in ("signed", "expired", "terminated") or (
            client and deal["org"] != client
        ):
            continue
        if legacy:
            for eid in deal.get("entries", [None]):
                key = (deal["org"], deal["series"], deal["product"], eid)
                replaced[key] = min(deal["start"], replaced.get(key, deal["start"]))
        if not maker or deal["sponsor"] == maker:
            yield deal
    if not legacy:
        return
    from .supplier_engineering import agreement

    start = state["engineering_service"]["start"]
    for entry in world["entries"].values():
        if client and entry["org"] != client:
            continue
        for axis, supplier in world["cars"][entry["car"]]["suppliers"].items():
            if maker and supplier != maker:
                continue
            key = (entry["org"], entry["championship"], axis)
            end = min(
                replaced.get((*key, k), "2026-01-01") for k in (None, entry["id"])
            )
            if end <= start:
                continue
            terms = agreement(state, world, entry, axis, start)
            if terms and terms["maker"] == supplier:
                yield dict(
                    id=terms["id"],
                    org=entry["org"],
                    series=entry["championship"],
                    product=axis,
                    sponsor=supplier,
                    status="signed",
                    start=start,
                    end=end,
                    partnership=terms["partnership"],
                    support=terms["support"],
                )


def supply_periods(state, world, maker=None, client=None):
    """Union of effective supply periods for each pair, including zero-data contracts."""
    intervals = defaultdict(list)
    for d in service_deals(state, world, maker, client):
        intervals[d["sponsor"], d["org"]].append(
            (d["start"], min(d["end"], d.get("ended") or d["end"]))
        )
    for pair, periods in intervals.items():
        merged = []
        for start, end in sorted(periods):
            if start >= end:
                continue
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))
        intervals[pair] = merged
    return intervals


def subtract(start, end, blocked):
    for left, right in sorted(blocked):
        if right <= start or left >= end:
            continue
        if start < left:
            yield start, left
        start = max(start, right)
    if start < end:
        yield start, end


def temporary_assignment(state, row):
    if "duty" in row:
        return row["duty"] == "cover"
    # Early #64 saves used the signed supply ID as the prefix for commercial deployments.
    return (
        row.get("pair", False)
        and row["id"].rsplit("/", 1)[0] not in state["market"]["supplies"]
    )


def unavailable_intervals(state):
    spans = defaultdict(list)
    for item in state["preparations"].values():
        if item["status"] not in ("cancelled", "rejected"):
            for pid in item["participants"]:
                spans[pid].append((item["start"], item["end"]))
    for item in state.get("research", {}).get("handovers", {}).values():
        day = item["date"]
        for pid in (item["mentor"], item["recipient"]):
            spans[pid].append((day, personnel.shifted(day, 1)))
    return spans


def appointments(state, world, maker=None, client=None, *, include_covers=True):
    office = state.get("engineering_service")
    manual = [r for r in state["support"] if not maker or r["employer"] == maker]
    if not office:
        yield from (r for r in manual if not client or r["client"] == client)
        return
    periods = supply_periods(state, world, maker)
    occupied = unavailable_intervals(state) if include_covers else defaultdict(list)
    reserved = defaultdict(list)
    employments = defaultdict(list)
    principals = []
    for key, post in office["posts"].items():
        org = post["org"]
        if post["position"] != "technical-advisor" or maker and org != maker:
            continue
        for booking in state["seats"][key]:
            pid = booking["person"]
            employments[org, pid].append(booking)
            if post.get("client"):
                principals.append(
                    (
                        dict(
                            id=key + "/" + pid,
                            advisor=pid,
                            employer=org,
                            client=post["client"],
                            seat=key,
                            start=booking["start"],
                            end=booking["end"],
                            salary_cents=booking["salary_cents"],
                        ),
                        booking,
                        False,
                    )
                )
    candidates = []
    for row in sorted(manual, key=lambda r: not temporary_assignment(state, r)):
        if row["start"] < office["start"] and (not client or row["client"] == client):
            end = min(row["end"], office["start"])
            if row["start"] < end:
                yield dict(row, end=end, end_exclusive=end)
        temporary = temporary_assignment(state, row)
        if include_covers or not temporary:
            candidates.extend(
                (row, booking, temporary)
                for booking in employments[row["employer"], row["advisor"]]
            )

    # Project the person actually doing the work. The underlying employment and
    # commercial records stay intact throughout a temporary replacement.
    for row, booking, temporary in [*candidates, *principals]:
        pid = row["advisor"]
        pair = row["employer"], row["client"]
        for left, right in periods[pair]:
            start = max(left, row["start"], booking["start"], office["start"])
            end = min(right, row["end"] or right, booking["end"] or right)
            for a, b in subtract(start, end, occupied[pid] + reserved[pair]):
                occupied[pid].append((a, b))
                reserved[pair].append((a, b))
                if not client or row["client"] == client:
                    yield dict(
                        row,
                        id=row["id"] + "/" + a,
                        pair=True,
                        start=a,
                        end=b,
                        temporary=temporary,
                        salary_cents=booking["salary_cents"],
                    )


def duty_history(state, world, maker=None, client=None):
    """Name both the permanent assignee and the actual worker at every change of duty."""
    by_pair = defaultdict(list)
    for row in appointments(state, world, maker, client, include_covers=False):
        by_pair[row["employer"], row["client"]].append(row)
    for row in appointments(state, world, maker, client):
        if not row.get("temporary"):
            yield dict(row, principal=row["advisor"])
            continue
        principals = by_pair[row["employer"], row["client"]]
        changes = sorted(
            {row["start"], row["end"]}
            | {
                d
                for p in principals
                for d in (p["start"], p["end"])
                if row["start"] < d < row["end"]
            }
        )
        for start, end in zip(changes, changes[1:]):
            pid = next(
                (p["advisor"] for p in principals if p["start"] <= start < p["end"]),
                None,
            )
            yield dict(
                row, id=row["id"] + "/" + start, principal=pid, start=start, end=end
            )


def grant(state, world, entry, axis, day, terms, rows=None):
    """Resolve one observation grant from employment, client, component and supply terms."""
    if not terms or not terms["support"]:
        return None
    from .supplier_engineering import agreement

    actual = agreement(state, world, entry, axis, day)
    if (
        not actual
        or not actual["support"]
        or (actual["id"], actual["maker"]) != (terms["id"], terms["maker"])
    ):
        return None
    terms = actual
    maker, client = terms["maker"], entry["org"]
    deal = state["market"]["supplies"].get(terms["id"])
    if not deal and not state.get("opening"):
        deal = next(
            (
                d
                for d in service_deals(state, world, maker, client)
                if d["id"] == terms["id"]
            ),
            None,
        )
    end = (deal.get("ended") or deal["end"]) if deal else terms.get("end")
    for r in rows if rows is not None else appointments(state, world, maker, client):
        if (r["employer"], r["client"]) != (maker, client) or not r["start"] <= day < r[
            "end"
        ]:
            continue
        if r.get("pair"):
            from .opening.partners import support_access

            channels, load = support_access(terms["partnership"], maker, axis)
            return dict(
                r,
                agreement=terms["id"],
                product=axis,
                entry=entry["id"],
                channels=sorted(channels),
                allocation_percent=load,
                start=max(r["start"], terms.get("start") or r["start"]),
                end=min(r["end"], end or r["end"]),
            )
        if (
            r["agreement"] == terms["id"]
            and r["product"] == axis
            and r.get("entry", entry["id"]) == entry["id"]
        ):
            return dict(r, end=min(r["end"], end or r["end"]))
    return None


def cover(state, world, seat, booking, args):
    entry = world["entries"].get(args.get("entry"))
    client = args.get("client") or (entry and entry["org"])
    start, end = args["start"], args["end"]
    maker = seat["org"]
    if (
        not client
        or seat["position"] != "technical-advisor"
        or not max(state["date"], booking["start"])
        <= start
        < end
        <= (booking["end"] or end)
    ):
        raise RuleError("Проверьте должность и срок трудового договора.")
    if not any(
        a <= start and end <= b
        for a, b in supply_periods(state, world, maker, client)[maker, client]
    ):
        raise RuleError("Период замещения выходит за срок поставок клиенту.")
    from .preparation import busy

    if busy(state, booking["person"], start, end) or any(
        r["start"] < end
        and start < r["end"]
        and (
            r["advisor"] == booking["person"]
            or (r["client"] == client and r.get("temporary"))
        )
        for r in appointments(state, world, maker)
    ):
        raise RuleError("Консультант или клиент занят в этот период.", 409)
    row = dict(
        id=f"support-{state['revision']}/{seat['id']}/{start}",
        duty="cover",
        advisor=booking["person"],
        employer=maker,
        client=client,
        start=start,
        end=end,
        pair=True,
        salary_cents=booking["salary_cents"],
    )
    state["support"].append(row)


def telemetry_grants(state, world, maker):
    from .supplier_engineering import agreement

    day = state["date"]
    by_client = defaultdict(list)
    for r in appointments(state, world, maker):
        if r["start"] <= day < r["end"]:
            by_client[r["client"]].append(r)
    grants = []
    for e in world["entries"].values():
        if e["org"] not in by_client:
            continue
        for axis in world["cars"][e["car"]]["suppliers"]:
            terms = agreement(state, world, e, axis, day)
            r = grant(state, world, e, axis, day, terms, by_client[e["org"]])
            if r:
                grants.append(r)
    return grants


def check_capacity(state, world, maker, client, start, end):
    """Plan only the uncovered portions, against the proposed supply and signed employment."""
    rows = list(appointments(state, world, maker))
    covered = [(r["start"], r["end"]) for r in rows if r["client"] == client]
    gaps = list(subtract(start, end, covered))
    if not gaps:
        return []
    occupied = unavailable_intervals(state)
    for r in rows:
        if r["client"] != client:
            occupied[r["advisor"]].append((r["start"], r["end"]))
    available = []
    for post in state["engineering_service"]["posts"].values():
        if post["org"] != maker or post["position"] != "technical-advisor":
            continue
        for booking in state["seats"][post["id"]]:
            pid = booking["person"]
            for a, b in subtract(
                max(start, booking["start"]),
                min(end, booking["end"] or end),
                occupied[pid],
            ):
                available.append((a, b, post["id"], booking))
    plan = []
    for date, stop in gaps:
        while date < stop:
            # Longest continuous coverage first. The seat ID breaks ties reproducibly.
            choice = max(
                (item for item in available if item[0] <= date < item[1]),
                key=lambda item: (item[1], item[2]),
                default=None,
            )
            if not choice:
                raise RuleError(
                    f"На период с {date} по {stop} нужен свободный штатный консультант.",
                    409,
                )
            _, until, _, booking = choice
            until = min(stop, until)
            plan.append(
                dict(
                    advisor=booking["person"],
                    start=date,
                    end=until,
                    salary_cents=booking["salary_cents"],
                )
            )
            date = until
    return plan


def allocate(state, key, terms, plan):
    for assignment in plan:
        state["support"].append(
            dict(
                id=f"{key}/{assignment['start']}",
                employer=terms.sponsor,
                client=terms.org,
                pair=True,
                duty="service",
                **assignment,
            )
        )

    # A growing client portfolio can recruit a permanent successor and further relief.
    # Publish new positions through the same employment catalogue as the opening posts.
    ensure_post(state, terms.sponsor, terms.org)
    posts = state["engineering_service"]["posts"]
    reserves = [
        p
        for p in posts.values()
        if p["org"] == terms.sponsor
        and p["position"] == "technical-advisor"
        and not p.get("client")
    ]
    if all(state["seats"][p["id"]] for p in reserves):
        key = f"{terms.sponsor}:technical-advisor:reserve:{len(reserves) + 1}"
        posts[key] = position(key, terms.sponsor)
        state["seats"][key] = []


def working_contract(state, seat, day):
    """The paid employment record supplying this job on the requested day."""
    from .personnel import active

    def contract(key, person=None):
        return next(
            (
                r
                for r in state["seats"].get(key, ())
                if active(r, day) and (not person or r["person"] == person)
            ),
            None,
        )

    row = contract(seat["id"])
    engineer = seat["position"] == "race-engineer" and seat["entry"]
    office = state.get("engineering_service")
    if engineer and office:
        for cover in office["covers"]:
            if cover["entry"] == seat["entry"] and cover["start"] <= day < cover["end"]:
                row = contract(cover["seat"], cover["person"]) or row
                break
    if row and engineer and office:
        from .preparation import busy

        if busy(state, row["person"], day, personnel.shifted(day, 1)):
            return None
    return row


def working_person(state, seat, day):
    row = working_contract(state, seat, day)
    return row["person"] if row else None


def cover_entry(state, world, seat, booking, args):
    from .preparation import busy

    entry = world["entries"].get(args["entry"])
    start, end = args["start"], args["end"]
    if not seat.get("engineering_reserve") or not entry or entry["org"] != seat["org"]:
        raise RuleError("Замещать инженера может резервный инженер этой команды.")
    if (
        not max(state["date"], booking["start"])
        <= start
        < end
        <= (booking["end"] or end)
    ):
        raise RuleError("Замещение должно входить в срок трудового договора.")
    pid = booking["person"]
    covers = state["engineering_service"]["covers"]
    if busy(state, pid, start, end) or any(
        r["start"] < end
        and start < r["end"]
        and (r["person"] == pid or r["entry"] == entry["id"])
        for r in covers
    ):
        raise RuleError("Инженер или заявка заняты в этот период.", 409)
    covers.append(
        dict(person=pid, seat=seat["id"], entry=entry["id"], start=start, end=end)
    )


def practice_by_duty(state, world, day):
    practice = defaultdict(set)
    for seat in world["assignments"].values():
        if seat["position"] == "race-engineer" and seat["entry"]:
            person = working_person(state, seat, day)
            if person:
                practice[person].add(
                    world["championships"][seat["series"]]["discipline"]
                )
    clients = {
        (r["employer"], r["client"]): r["advisor"]
        for r in appointments(state, world)
        if r["start"] <= day < r["end"]
    }
    for deal in service_deals(state, world):
        if deal["start"] <= day < min(deal["end"], deal.get("ended") or deal["end"]):
            person = clients.get((deal["sponsor"], deal["org"]))
            if person:
                practice[person].add(
                    world["championships"][deal["series"]]["discipline"]
                )
    return practice


def npc_crew_cover(state, world, end):
    """An NPC manager fills an uncovered entry using an available contracted substitute."""
    from .domain import occupant_on

    day = state["date"]
    reserves = {}
    for key, seat in state["engineering_service"]["posts"].items():
        if not seat.get("engineering_reserve"):
            continue
        org = seat["org"]
        manager = occupant_on(state["seats"].get(org + ":manager", []), day)
        booking = working_contract(state, seat, day)
        if booking and manager and manager != state["player_id"]:
            reserves[org] = (seat, booking)
    if not reserves:
        return
    for seat in world["assignments"].values():
        org = seat["org"]
        if (
            org not in reserves
            or seat["position"] != "race-engineer"
            or not seat["entry"]
        ):
            continue
        if working_person(state, seat, day):
            continue
        reserve, booking = reserves[org]
        try:
            cover_entry(
                state,
                world,
                reserve,
                booking,
                dict(
                    entry=seat["entry"], start=day, end=min(booking["end"] or end, end)
                ),
            )
        except RuleError:
            continue
        del reserves[org]


def briefing(state, world, event_id):
    from .driver_availability import participant
    from .supplier_engineering import agreement
    from .teamwork import professional_action
    from .domain import occupant_on

    event = next(e for e in world["events"] if e["id"] == event_id)
    day = state["date"]
    org = state["setup"]["org"]
    maker = state["setup"]["role"] == "manufacturer"
    by_client = defaultdict(list)
    for r in duty_history(
        state, world, maker=org if maker else None, client=None if maker else org
    ):
        if r["start"] <= day < r["end"]:
            by_client[r["client"]].append(r)
    seats = defaultdict(list)
    for s in world["assignments"].values():
        if s["entry"] and s["series"] == event["series"]:
            seats[s["entry"]].append(s)
    rows = []
    for eid, crew in seats.items():
        e = world["entries"][eid]
        if event.get("org") and event["org"] != e["org"]:
            continue
        if (not maker and e["org"] != org) or (maker and e["org"] not in by_client):
            continue
        engineer = next(
            (
                working_person(state, s, day)
                for s in crew
                if s["position"] == "race-engineer"
            ),
            None,
        )
        drivers = [
            p
            for s in crew
            if s["position"] == "driver" and (p := participant(state, s["id"], day))
        ]
        feedback = []
        if engineer and not maker:
            for pid in drivers:
                reports = [
                    f
                    for f in state["council"]["observations"].values()
                    if f["entry"] == eid
                    and f["author"] == pid
                    and f["kind"] == "driver-feedback"
                ]
                detail = professional_action(
                    state,
                    world,
                    ("feedback", pid, engineer, e["org"]),
                    day,
                    evidence=100 if reports else 0,
                )
                feedback.append(
                    dict(
                        person=pid,
                        decision=detail["decision"] if reports else "await-feedback",
                        reports=[r["reference"] for r in reports],
                    )
                )
        consultants = []
        products_on_entry = {
            axis: terms["maker"]
            for axis in world["cars"][e["car"]]["suppliers"]
            if (terms := agreement(state, world, e, axis, day))
        }
        for r in by_client[e["org"]]:
            products = [
                axis
                for axis, supplier in products_on_entry.items()
                if supplier == r["employer"]
            ]
            if not products:
                continue
            chief = occupant_on(
                state["seats"].get(e["org"] + ":chief-engineer", []), day
            )
            cases = [
                c["id"]
                for c in state["manufacturer"]["cases"].values()
                if c["entry"] == eid
                and c["supplier"] == r["employer"]
                and c["status"] == "open"
            ]
            review = (
                professional_action(
                    state,
                    world,
                    ("technical", r["advisor"], chief, e["org"]),
                    day,
                    evidence=75 if cases else 0,
                )
                if chief
                else {}
            )
            consultants.append(
                dict(
                    person=r["advisor"],
                    principal=r["principal"],
                    temporary=r.get("temporary", False),
                    maker=r["employer"],
                    products=sorted(products),
                    cases=cases,
                    **review,
                )
            )
        if not maker or consultants:
            rows.append(
                dict(
                    entry=eid,
                    engineer=engineer,
                    principal=next(
                        (
                            occupant_on(state["seats"][s["id"]], day)
                            for s in crew
                            if s["position"] == "race-engineer"
                        ),
                        None,
                    ),
                    drivers=drivers,
                    feedback=feedback,
                    consultants=consultants,
                )
            )
    return rows


def confirm_briefing(state, world, event):
    from .teamwork import record_event

    rows = briefing(state, world, event)
    for row in rows:
        for review in row["feedback"]:
            actor, peer = review["person"], row["engineer"]
            for reference in review["reports"]:
                source = "briefing-feedback/" + reference
                # A later meeting can revisit the report without double counting trust.
                if f"feedback|{actor}|{peer}|{source}" in state["cooperation_events"]:
                    continue
                outcome = (
                    "confirmed-feedback"
                    if review["decision"] == "endorse"
                    else "unclear-feedback"
                )
                record_event(state, world, actor, peer, outcome, source, state["date"])
    state["engineering_service"]["briefings"][event] = rows


def desk(state, world, org, maker):
    """One row per dated person/client link. Display separate contractual rights."""
    from .opening.partners import support_access

    deals = list(
        service_deals(
            state, world, maker=org if maker else None, client=None if maker else org
        )
    )
    result = []
    for a in duty_history(
        state, world, maker=org if maker else None, client=None if maker else org
    ):
        rights = []
        if a.get("pair"):
            for d in deals:
                if (d["org"], d["sponsor"]) != (a["client"], a["employer"]) or d[
                    "status"
                ] not in ("signed", "terminated", "expired"):
                    continue
                start = max(a["start"], d["start"])
                end = min(a["end"], d["end"], d.get("ended") or d["end"])
                if start >= end:
                    continue
                channels, load = (
                    support_access(d["partnership"], d["sponsor"], d["product"])
                    if d["support"]
                    else ([], 0)
                )
                rights.append(
                    dict(
                        product=d["product"],
                        agreement=d["id"],
                        series=d["series"],
                        channels=sorted(channels),
                        load=load,
                        start=start,
                        end=end,
                    )
                )
        else:
            rights.append(
                dict(
                    product=a["product"],
                    agreement=a["agreement"],
                    channels=a["channels"],
                    load=a["allocation_percent"],
                    start=a["start"],
                    end=a["end"],
                )
            )
        products = sorted({r["product"] for r in rights})
        result.append(
            dict(
                id=a["id"],
                person=a["advisor"],
                temporary=a.get("temporary", False),
                principal=a["principal"],
                name=state["people"][a["advisor"]]["name"],
                client=a["client"],
                employer=a["employer"],
                start=a["start"],
                end=a["end"],
                products=products,
                product=products[0] if len(products) == 1 else None,
                rights=rights,
                channels=sorted({c for r in rights for c in r["channels"]}),
                load=max((r["load"] for r in rights), default=0),
            )
        )
    return sorted(
        result,
        key=lambda r: (
            not (r["start"] <= state["date"] < r["end"]),
            r["client"],
            r["start"],
            r["id"],
        ),
    )


def end_obligations(state, maker, client):
    from .catalog import lineup_for

    periods = supply_periods(state, lineup_for(state), maker, client)[maker, client]
    future = []
    for row in state["support"]:
        if (row["employer"], row["client"]) != (maker, client) or row["end"] <= state[
            "date"
        ]:
            continue
        boundary = max(state["date"], row["start"])
        intervals = [
            (max(boundary, a), min(row["end"], b))
            for a, b in periods
            if max(boundary, a) < min(row["end"], b)
        ]
        if intervals and intervals[0][0] == boundary:
            _, first_end = intervals.pop(0)
        else:
            first_end = boundary
        for a, b in intervals:
            piece = dict(
                row,
                id=f"{row['id']}/{a}",
                start=a,
                end=b,
                duty="cover" if temporary_assignment(state, row) else "service",
            )
            if "end_exclusive" in piece:
                piece["end_exclusive"] = b
            future.append(piece)
        row["end"] = first_end
        if "end_exclusive" in row:
            row["end_exclusive"] = first_end
    state["support"].extend(future)


def engineer_cover_history(state, world, person):
    covers = state.get("engineering_service", {}).get("covers", [])
    if not covers:
        return []
    posts = {
        s["entry"]: s["id"]
        for s in world["assignments"].values()
        if s["position"] == "race-engineer" and s["entry"]
    }
    history = []
    from .domain import occupant_on

    for cover in covers:
        contracts = state["seats"][posts[cover["entry"]]]
        edges = sorted(
            {cover["start"], cover["end"]}
            | {
                d
                for c in contracts
                for d in (c["start"], c["end"])
                if d and cover["start"] < d < cover["end"]
            }
        )
        for a, b in zip(edges, edges[1:]):
            principal = occupant_on(contracts, a)
            if person in (principal, cover["person"]):
                history.append(dict(cover, principal=principal, start=a, end=b))
    return sorted(history, key=lambda r: (r["start"], r["entry"]))


def entry_partners(state, world, pid):
    from .driver_availability import participant

    if "engineering_service" not in state:
        return []
    crews = defaultdict(list)
    engineers = {}
    principals = {}
    from .domain import occupant_on

    for seat in world["assignments"].values():
        eid = seat["entry"]
        if not eid:
            continue
        if seat["position"] == "driver":
            driver = participant(state, seat["id"], state["date"])
            if driver:
                crews[eid].append(driver)
        elif seat["position"] == "race-engineer":
            principals[eid] = occupant_on(state["seats"][seat["id"]], state["date"])
            engineers[eid] = working_person(state, seat, state["date"])
    return [
        dict(
            entry=eid, engineer=engineer, principal=principals[eid], drivers=crews[eid]
        )
        for eid, engineer in engineers.items()
        if pid in (engineer, principals[eid]) or pid in crews[eid]
    ]
