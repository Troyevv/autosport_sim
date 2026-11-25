"""Reviewed original photographs. A credit or a matching driver name is insufficient."""

import json
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StudioSource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    entity: str
    image: str
    source: str
    publisher: str
    author: str
    license: str
    terms: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    category: Literal[
        "driver-headshot",
        "team-portrait",
        "media-day-studio",
        "roster-portrait",
        "studio-head-and-shoulders",
    ]
    framing: Literal["single-head-and-shoulders"]
    pose: Literal["frontal", "near-frontal"]
    lighting: Literal["even-studio"]
    visibility: Literal["whole-head-face-neck-both-shoulders"]
    headwear: Literal["none"]
    sunglasses: Literal["none"]
    adaptation: Literal["permitted"]
    # The review identifies this precise native frame and who published it.
    evidence: str = Field(min_length=12)

    @model_validator(mode="after")
    def official(self):
        for url in (self.source, self.image, self.terms):
            u = urlsplit(url)
            if (
                u.scheme != "https"
                or not u.hostname
                or u.username
                or u.password
                or u.port not in (443, None)
            ):
                raise ValueError("Нужна защищённая ссылка на источник.")
        if self.publisher != urlsplit(self.source).hostname:
            raise ValueError(
                "Страница портрета должна принадлежать официальному издателю."
            )
        return self


def reviewed_sources():
    path = Path(__file__).with_name("data") / "official-portraits.json"
    return [
        StudioSource.model_validate(row)
        for row in json.loads(path.read_text(encoding="utf-8"))
    ]


REVIEWED = {(s.entity, s.sha256): s for s in reviewed_sources()}
