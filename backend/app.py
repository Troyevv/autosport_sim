import json
from tempfile import TemporaryFile
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask
from fastapi.concurrency import run_in_threadpool

from . import backing, employment, media, service, staff_desk, storage
from .staff_input import Day
from .catalog import LINEUP_WORLD as WORLD
from .domain import RuleError
from .statistics import archive, facts, telemetry
from .livery import GARAGE

app = FastAPI(title="Autosport Sim", version="0.2.0")


@app.exception_handler(RuleError)
async def rejected(request: Request, error: RuleError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {"mode": "career", "career_saves": True}


@app.get("/api/world")
def world():
    return {
        **{
            k: v
            for k, v in WORLD.items()
            if k not in ("profiles", "reserve", "reserve_ages")
        },
        "staff_rules": {
            k: v for k, v in WORLD["staff_rules"].items() if k != "training"
        },
        "faces": {p: v["face"] for p, v in WORLD["profiles"].items()},
    }


@app.get("/api/garage")
def garage():
    return GARAGE


@app.get("/api/careers")
def careers():
    return service.list_careers()


@app.post("/api/careers", status_code=201)
def create(spec: service.CareerInput):
    return service.create(spec)


@app.post("/api/careers/import", status_code=201)
async def import_career(request: Request):
    size = 0
    limit = archive.file_limit()
    with TemporaryFile() as upload:
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise RuleError("Файл превышает допустимый размер.", 413)
            await run_in_threadpool(upload.write, chunk)
        upload.seek(0)
        return await run_in_threadpool(archive.read_file, upload)


@app.get("/api/careers/{cid}")
def load(cid: str):
    return service.load(cid)


@app.get("/api/careers/{cid}/personnel")
def personnel(cid: str):
    with storage.transaction() as db:
        return staff_desk.directory(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/lineup")
def driver_lineup(cid: str):
    with storage.transaction() as db:
        return service.lineup.desk(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/personnel/{pid}")
def dossier(cid: str, pid: str, wet: bool = False):
    with storage.transaction() as db:
        return staff_desk.dossier(storage.checkpoint(db, cid), WORLD, pid, wet)


@app.get("/api/careers/{cid}/personnel/{pid}/quote")
def quote(
    cid: str,
    pid: str,
    seat: str,
    start: Day,
    end: Day,
    salary_cents: int = 0,
    outside_starts: bool = False,
    combined_duties: bool = False,
    driver_status: Literal["equal", "first", "second"] | None = None,
    remit: Literal["supervised", "standard", "independent"] = "standard",
):
    with storage.transaction() as db:
        state = storage.checkpoint(db, cid)
        try:
            terms = dict(
                person=pid,
                seat=seat,
                start=start,
                end=end,
                salary_cents=salary_cents,
                remit=remit,
                driver_status=driver_status,
                outside_starts=outside_starts,
                combined_duties=combined_duties,
            )
            fee = employment.quote(state, WORLD, terms)
            comparison = employment.career_choice.assess(
                state, WORLD, state["people"][pid], terms
            )
        except RuleError as exc:
            return dict(buyout_cents=None, reason=str(exc))
        support = backing.quote(state, pid, state["setup"]["org"], start)
        return dict(
            considerations=comparison["reasons"],
            buyout_cents=fee,
            support_cents=support,
            net_cents=support - salary_cents,
            reason=None,
        )


@app.get("/api/careers/{cid}/export")
def export(cid: str):
    file, extended = archive.write_file(cid)
    suffix = "autosport" if extended else "autosport.json"
    return StreamingResponse(
        iter(lambda: file.read(65536), b""),
        media_type="application/octet-stream" if extended else "application/json",
        headers={
            "Content-Disposition": f'attachment; filename="career-{cid}.{suffix}"'
        },
        background=BackgroundTask(file.close),
    )


@app.get("/api/careers/{cid}/statistics")
def statistics(
    cid: str,
    person: str | None = None,
    org: str | None = None,
    series: str | None = None,
    season: str | None = None,
    layout: str | None = None,
    session: str | None = None,
    kind: str | None = None,
    manufacturer: str | None = None,
    program: str | None = None,
    track: str | None = None,
    layout_version: str | None = None,
    origin: Literal["initial", "simulation", "historical"] | None = None,
    after: str | None = Query(None, max_length=8192),
    limit: int = Query(50, ge=1, le=200),
):
    filters = {
        k: v for k, v in locals().items() if k in facts.FILTERS and v is not None
    }
    try:
        cursor = json.loads(after) if after is not None else None
    except (ValueError, RecursionError):
        raise RuleError("Некорректный курсор страницы.") from None
    with storage.transaction() as db:
        return facts.page(db, cid, filters=filters, after=cursor, limit=limit)


@app.get("/api/careers/{cid}/statistics/ledger")
def ledger_page(
    cid: str,
    after_date: str = "",
    after_key: str = "",
    limit: int = Query(50, ge=1, le=200),
):
    with storage.transaction() as db:
        return facts.ledger(db, cid, after=(after_date, after_key), limit=limit)


@app.get("/api/careers/{cid}/statistics/laps")
def lap_summary(
    cid: str,
    session: str,
    entry: str,
    origin: Literal["initial", "simulation"] = "simulation",
):
    with storage.transaction() as db:
        return facts.lap_summary(db, cid, session, entry, origin)


@app.get("/api/careers/{cid}/statistics/telemetry")
def channel_range(
    cid: str,
    session: str,
    car: str,
    channel: str,
    start_us: int,
    end_us: int,
    instance: str = "",
    limit: int = Query(8, ge=1, le=32),
):
    with storage.transaction() as db:
        return telemetry.read(
            db,
            cid,
            session=session,
            car=car,
            channel=channel,
            start_us=start_us,
            end_us=end_us,
            instance=instance,
            limit=limit,
        )


@app.post("/api/careers/{cid}/commands")
def command(cid: str, command: service.Command):
    if (
        command.action in service.lineup.PRODUCERS
        or command.action in service.PRODUCERS
        or command.action
        in (
            "component-usage",
            "council-observation",
            "confirmed-work",
            "issued-licence",
            "season-classification",
        )
    ):
        raise RuleError("Требуется подтверждение подсистемы-источника.", 403)
    return service.execute(cid, command)


@app.get("/api/media")
def media_index():
    return media.index()


@app.get("/api/media/{kind}/{entity}")
def asset(kind: str, entity: str, v: str | None = None):
    meta, content = media.get(kind, entity)
    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return Response(
        content,
        media_type=mime[meta["path"].rsplit(".", 1)[1]],
        headers={
            "X-Content-Type-Options": "nosniff",
            "ETag": '"' + meta["sha256"] + '"',
            "Cache-Control": "public, max-age=31536000, immutable"
            if v == meta["sha256"]
            else "no-cache",
        },
    )


@app.get("/api/careers/{cid}/finance")
def financial_statement(cid: str, scope: str = "organization"):
    from .finance.reports import statement
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return statement(storage.checkpoint(db, cid), WORLD, db, cid, scope)


@app.get("/api/careers/{cid}/finance/report.csv")
def export_financial_statement(cid: str, scope: str = "organization"):
    import csv
    from io import StringIO
    from fastapi.responses import Response

    report = financial_statement(cid, scope)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["EUR cents", "scope", report["scope"]])
    for key in (
        "opening_cents",
        "cash_cents",
        "available_cents",
        "profit_cents",
        "income_cents",
        "expense_cents",
        "cash_flow_cents",
    ):
        writer.writerow([key, report[key]])
    for section in ("journal", "obligations", "forecast"):
        writer.writerow([section])
        rows = report[section]
        if rows:
            writer.writerow(rows[0].keys())
            writer.writerows(row.values() for row in rows)
    return Response(
        output.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="finance.csv"'},
    )


@app.get("/api/careers/{cid}/commercial")
def commercial_market(cid: str):
    from .finance import market
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return market.projection(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/manufacturer")
def manufacturer_desk(cid: str):
    from .manufacturer.desk import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/programme")
def programme_desk(cid: str):
    from .programme.desk import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/council")
def council_desk(cid: str):
    from .council import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/production")
def production_desk(cid: str):
    from .production.desk import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/development")
def development_desk(cid: str):
    from .development.desk import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/research")
def research_desk(cid: str):
    from .research.desk import projection
    from .catalog import LINEUP_WORLD

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), LINEUP_WORLD)


@app.get("/api/careers/{cid}/components/{entry}")
def component_desk(cid: str, entry: str):
    with storage.transaction() as db:
        return service.components.desk(storage.checkpoint(db, cid), WORLD, entry)


@app.get("/api/careers/{cid}/garage")
def career_garage(cid: str):
    from .finance.rights import catalog
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return catalog(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/rights")
def commercial_rights(cid: str):
    from .finance.rights import projection
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/budget")
def budget_control(cid: str, year: int | None = None):
    from .finance.budget import report
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        state = storage.checkpoint(db, cid)
        return report(
            state, WORLD, state["setup"]["org"], year or int(state["date"][:4])
        )


@app.get("/api/careers/{cid}/facilities")
def facilities_overview(cid: str):
    from .finance.facilities import projection
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/capital")
def capital_overview(cid: str):
    from .finance.capital import projection
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/economy")
def economy_overview(cid: str):
    from .finance.economy import projection
    from .catalog import LINEUP_WORLD as WORLD
    from . import storage

    with storage.transaction() as db:
        return projection(storage.checkpoint(db, cid), WORLD)
