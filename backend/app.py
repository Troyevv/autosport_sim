import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.concurrency import run_in_threadpool

from . import media, service
from .catalog import DISPLAY_NAMES, WORLD
from .domain import RuleError, team_color

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
    organizations = {
        key: {**value, "color": team_color(key)}
        for key, value in WORLD["organizations"].items()
    }
    return {**WORLD, "names": DISPLAY_NAMES, "organizations": organizations}


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
    body = await read_upload(request, 4 * 1024 * 1024)
    try:
        document = json.loads(body)
    except (ValueError, UnicodeError, RecursionError):
        raise RuleError("Не удалось прочитать сохранение.") from None
    return await run_in_threadpool(service.import_save, document)


@app.get("/api/careers/{cid}")
def load(cid: str):
    return service.load(cid)


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


@app.post("/api/media/import")
async def import_pack(request: Request):
    data = await read_upload(request, media.LIMIT)
    return {"assets": await run_in_threadpool(media.install, data)}


@app.get("/api/media/{kind}/{entity}")
def asset(kind: str, entity: str):
    meta, content = media.get(kind, entity)
    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return Response(
        content,
        media_type=mime[meta["path"].rsplit(".", 1)[1]],
        headers={
            "X-Content-Type-Options": "nosniff",
            "ETag": '"' + meta["sha256"] + '"',
        },
    )
