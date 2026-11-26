import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.concurrency import run_in_threadpool

from . import backing, employment, media, service, staff_desk, storage
from .staff_input import Day
from .catalog import WORLD
from .domain import RuleError
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


async def read_upload(request, limit):
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > limit:
            raise RuleError("Файл превышает допустимый размер.", 413)
        data.extend(chunk)
    return bytes(data)


@app.post("/api/careers/import", status_code=201)
async def import_career(request: Request):
    body = await read_upload(request, 16 * 1024 * 1024)
    try:
        document = json.loads(body)
    except (ValueError, UnicodeError, RecursionError):
        raise RuleError("Не удалось прочитать сохранение.") from None
    return await run_in_threadpool(service.import_save, document)


@app.get("/api/careers/{cid}")
def load(cid: str):
    return service.load(cid)


@app.get("/api/careers/{cid}/personnel")
def personnel(cid: str):
    with storage.transaction() as db:
        return staff_desk.directory(storage.checkpoint(db, cid), WORLD)


@app.get("/api/careers/{cid}/personnel/{pid}")
def dossier(cid: str, pid: str, wet: bool = False):
    with storage.transaction() as db:
        return staff_desk.dossier(storage.checkpoint(db, cid), WORLD, pid, wet)


@app.get("/api/careers/{cid}/personnel/{pid}/quote")
def quote(cid: str, pid: str, seat: str, start: Day, end: Day, salary_cents: int = 0):
    with storage.transaction() as db:
        state = storage.checkpoint(db, cid)
        try:
            fee = employment.quote(
                state,
                WORLD,
                dict(
                    person=pid,
                    seat=seat,
                    start=start,
                    end=end,
                    salary_cents=salary_cents,
                ),
            )
        except RuleError as exc:
            return dict(buyout_cents=None, reason=str(exc))
        support = backing.quote(state, pid, state["setup"]["org"], start)
        return dict(
            buyout_cents=fee,
            support_cents=support,
            net_cents=support - salary_cents,
            reason=None,
        )


@app.get("/api/careers/{cid}/export")
def export(cid: str):
    archive = service.export_save(cid)
    return JSONResponse(
        archive,
        headers={
            "Content-Disposition": f'attachment; filename="career-{cid}.autosport.json"'
        },
    )


@app.post("/api/careers/{cid}/commands")
def command(cid: str, command: service.Command):
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
