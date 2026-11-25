"""Read opt-in public metadata, with a positive license and identity match per image."""

import html
import json
import math
import re
import time
import unicodedata
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

AGENT = (
    "AutosportSim/1.0 (https://github.com/Troyevv/autosport_sim; private media pack)"
)
API = "https://commons.wikimedia.org/w/api.php"
COMMONS = {"commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"}
LICENSES = {
    f"https://creativecommons.org/licenses/{kind}/{v}/": f"CC {kind.upper()} {v}"
    for kind in ("by", "by-sa")
    for v in ("2.0", "3.0", "4.0")
}
LICENSES["https://creativecommons.org/publicdomain/zero/1.0/"] = "CC0"


class Unavailable(RuntimeError):
    def __init__(self, message, delay=30):
        super().__init__(message)
        self.delay = delay


def plain(text):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", str(text))).split())


def normalized(text):
    return " ".join(
        "".join(
            c if c.isalnum() else " "
            for c in unicodedata.normalize("NFKD", plain(text)).casefold()
            if not unicodedata.combining(c)
        ).split()
    )


def contains(text, term):
    return bool(term and " " + normalized(term) + " " in " " + normalized(text) + " ")


def allowed_url(url, hosts):
    try:
        u = urlsplit(url)
        port = u.port
    except (TypeError, ValueError):
        return False
    return (
        u.scheme == "https"
        and u.hostname in hosts
        and port in (None, 443)
        and not u.username
        and not u.password
    )


_backoff = {}
_NS_PER_SECOND = 1_000_000_000


def retry_delay(hint, default):
    if hint.isdigit():
        return max(1, int(hint))
    try:
        return max(1, math.ceil(parsedate_to_datetime(hint).timestamp() - time.time()))
    except (TypeError, ValueError, OverflowError):
        return default


def check_host(url):
    host = urlsplit(url).hostname
    until, message = _backoff.get(host, (0, ""))
    remaining = until - time.monotonic_ns()
    if remaining > 0:
        raise Unavailable(message, (remaining + _NS_PER_SECOND - 1) // _NS_PER_SECOND)


def fetch(url, hosts, limit):
    if not allowed_url(url, hosts):
        raise ValueError("Неразрешённый адрес источника")

    check_host(url)

    class Redirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if not allowed_url(newurl, hosts):
                raise ValueError("Переадресация за пределы источника")
            check_host(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    try:
        with build_opener(Redirect()).open(
            Request(url, headers={"User-Agent": AGENT}), timeout=12
        ) as response:
            data = response.read(limit + 1)
    except HTTPError as exc:
        if exc.code in (404, 410):
            return b""
        host = urlsplit(exc.geturl()).hostname
        message = f"{host} вернул HTTP {exc.code}"
        delay = retry_delay(
            exc.headers.get("Retry-After", ""), 3600 if exc.code in (401, 403) else 60
        )
        if exc.code in (401, 403, 429, 503) or exc.headers.get("Retry-After"):
            _backoff[host] = time.monotonic_ns() + delay * _NS_PER_SECOND, message
        raise Unavailable(message, delay) from exc
    except (OSError, URLError) as exc:
        host = urlsplit(url).hostname
        message = f"{host} временно недоступен"
        _backoff[host] = time.monotonic_ns() + 30 * _NS_PER_SECOND, message
        raise Unavailable(message) from exc
    if len(data) > limit:
        raise ValueError("Файл превышает лимит загрузки")
    return data


def organization_logos(name):
    """Search licensed marks named for the organisation, requesting a raster thumbnail."""
    query = urlencode(
        dict(
            action="query",
            format="json",
            generator="search",
            gsrnamespace=6,
            gsrlimit=8,
            gsrsearch=f'intitle:"{name}" logo',
            prop="imageinfo",
            iiprop="url|extmetadata",
            iiurlwidth=256,
        )
    )
    response = json.loads(fetch(API + "?" + query, COMMONS, 2_000_000))
    for page in response.get("query", {}).get("pages", {}).values():
        title = normalized(page.get("title", ""))
        if not contains(title, name) or not contains(title, "logo"):
            continue
        info = next(iter(page.get("imageinfo", [])), {})
        meta = info.get("extmetadata", {})
        short = plain(meta.get("LicenseShortName", {}).get("value", ""))
        link = plain(meta.get("LicenseUrl", {}).get("value", "")).replace(
            "http:", "https:"
        )
        author = plain(meta.get("Artist", {}).get("value", ""))
        if (
            short not in {"Public domain", "CC0"}
            and link.rstrip("/") + "/" not in LICENSES
        ):
            continue
        if not author or len(author) > 200:
            continue
        yield dict(
            image=info.get("thumburl", info.get("url", "")),
            hosts=COMMONS,
            source=info["descriptionurl"],
            author=author,
            license=(short + " " + link).strip(),
        )
