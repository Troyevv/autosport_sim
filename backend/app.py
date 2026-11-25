from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Autosport Sim", version="0.1.0")


class Config(BaseModel):
    mode: Literal["demo"] = "demo"
    career_saves: bool = False


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> Config:
    return Config()
