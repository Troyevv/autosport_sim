"""Windows CI smoke through the same .bat files that Explorer invokes."""

from contextlib import ExitStack, contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
from queue import Empty, Queue
from urllib.request import urlopen
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import threading

SOURCE = Path(__file__).resolve().parents[1]


@contextmanager
def observe_browser(root):
    """Only the disposable copy reports a visit, after React renders the playable title screen."""
    visits = Queue()

    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers["Content-Length"])
            visit = json.loads(self.rfile.read(size))
            visits.put((visit, self.headers.get("User-Agent", "")))
            self.send_response(204)
            self.end_headers()

    with ThreadingHTTPServer(("127.0.0.1", 0), Receiver) as observer:
        observer.daemon_threads = True
        port = observer.server_address[1]
        html = root / "frontend/index.html"
        instrument = r"""
<script>
const observer = new MutationObserver(() => {
  const menu = document.querySelector(".title-copy");
  const heading = menu?.querySelector("h1")?.innerText.replace(/\s+/g, " ").trim();
  const canStart = Array.from(menu?.querySelectorAll("nav button") || [])
    .some(button => button.textContent.trim() === "Новая карьера" && !button.disabled);
  if (heading && canStart) {
    observer.disconnect();
    navigator.sendBeacon("http://127.0.0.1:PORT/", JSON.stringify({
      url: location.origin, title: document.title, heading
    }));
  }
});
observer.observe(document.body, {childList: true, subtree: true});
</script>""".replace("PORT", str(port))
        html.write_text(
            html.read_text(encoding="utf-8").replace("</body>", instrument + "</body>"),
            encoding="utf-8",
        )
        thread = threading.Thread(target=observer.serve_forever, daemon=True)
        thread.start()
        try:
            yield visits
        finally:
            observer.shutdown()
            thread.join()


def conflicting_browser(tmp):
    """Reproduce webbrowser.open returning True without visiting the page."""
    handler = tmp / "discard URL.py"
    receipt = handler.with_suffix(".txt")
    handler.write_text(
        "import sys\nfrom pathlib import Path\n"
        "Path(__file__).with_suffix('.txt').write_text(sys.argv[1])\n",
        encoding="utf-8",
    )
    override = f'"{Path(sys.executable).as_posix()}" "{handler.as_posix()}" %s'
    url = "http://127.0.0.1:1/"
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys, webbrowser; assert webbrowser.open(sys.argv[1])",
            url,
        ],
        env={**os.environ, "BROWSER": override},
        check=True,
        timeout=20,
    )
    assert receipt.read_text() == url
    print("Reproduced: webbrowser.open reported success for a non-browser handler.")
    return override


def run_smoke(tmp):
    root = tmp / "Игра автоспорт"
    root.mkdir()
    for name in ("start.bat", "stop.bat", "pyproject.toml", "uv.lock"):
        shutil.copy2(SOURCE / name, root / name)
    for name in ("backend", "frontend", "scripts", "native"):
        shutil.copytree(
            SOURCE / name,
            root / name,
            ignore=shutil.ignore_patterns(
                "__pycache__",
                "node_modules",
                "dist",
                "test-results",
                "playwright-report",
            ),
        )
    env = {**os.environ, "PYTHONUTF8": "1", "BROWSER": conflicting_browser(tmp)}
    launched = []
    with ExitStack() as stack:
        visits = stack.enter_context(observe_browser(root))

        def launch(name):
            log = tmp / f"{len(launched)}-{name}.log"
            output = stack.enter_context(log.open("wb"))
            proc = subprocess.Popen(
                [os.environ["COMSPEC"], "/d", "/c", "call", root / f"{name}.bat"],
                cwd=tmp,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                env=env,
            )
            launched.append((proc, log))
            return proc, log

        def command(name):
            proc, log = launch(name)
            assert proc.wait(60) == 0, log.read_text(encoding="utf-8", errors="replace")

        def wait_for_launch(proc, log):
            deadline = time.monotonic() + 240
            while time.monotonic() < deadline and proc.poll() is None:
                try:
                    visit, agent = visits.get(timeout=0.2)
                except Empty:
                    continue
                assert (
                    visit["title"] == "Autosport Sim · PIT WALL 02"
                    and visit["heading"] == "Всё решается до старта."
                )
                print(f"Browser rendered the title screen at {visit['url']} ({agent})", flush=True)
                return visit["url"]
            raise AssertionError(log.read_text(encoding="utf-8", errors="replace"))

        def ports_and_pid(log):
            result = re.search(
                r"API (\d+), интерфейс (\d+)\. PID (\d+)",
                log.read_text(encoding="utf-8", errors="replace"),
            )
            assert result
            return tuple(map(int, result.groups()))

        def check_stopped(ports):
            for port in ports:
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    with socket.socket() as check:
                        check.settimeout(0.2)
                        if check.connect_ex(("127.0.0.1", port)) != 0:
                            break
                    time.sleep(0.1)
                else:
                    raise AssertionError(f"Server still listening on {port}")

        occupied = []
        for preferred in (8102, 5173):
            sock = stack.enter_context(socket.socket())
            sock.bind(("127.0.0.1", preferred))
            sock.listen()
            occupied.append(sock)

        try:
            command("stop")
            first, log = launch("start")
            url = wait_for_launch(first, log)
            api, ui, _ = ports_and_pid(log)
            assert {api, ui}.isdisjoint({8102, 5173}) and api != ui
            assert url == f"http://127.0.0.1:{ui}"
            with urlopen(url + "/api/world", timeout=10) as response:
                world = json.load(response)
            with urlopen(url + "/api/media", timeout=10) as response:
                assets = json.load(response)
            faces = set(world["faces"].values())
            assert len(faces) >= 1000
            for kind in ("generated-head", "uniform", "logo"):
                item = next(
                    a
                    for a in assets
                    if a["kind"] == kind
                    and (kind != "generated-head" or a["entity"] in faces)
                )
                with urlopen(
                    f"{url}/api/media/{kind}/{item['entity']}", timeout=10
                ) as response:
                    assert response.headers.get_content_maintype() == "image"
                    assert len(response.read()) > 128
            assert (root / ".venv/Scripts/python.exe").is_file()
            native = next((root / ".venv/Lib/site-packages").glob("_race_space*.pyd"))
            built = native.stat().st_mtime_ns
            modules = root / "frontend/node_modules"
            sentinel = modules / "keep-on-warm-start"
            sentinel.touch()
            command("start")
            assert wait_for_launch(first, log) == url
            command("stop")
            assert first.wait(10) == 0
            check_stopped((api, ui))
            command("stop")
            for sock in occupied:
                assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN)
                sock.close()
            second, log = launch("start")
            assert wait_for_launch(second, log) == "http://127.0.0.1:5173"
            assert native.stat().st_mtime_ns == built, "unchanged native binary rebuilt"
            assert sentinel.exists(), "npm reinstalled unchanged packages"
            assert "Зависимости интерфейса уже установлены" in log.read_text(
                encoding="utf-8", errors="replace"
            )
            api, ui, supervisor = ports_and_pid(log)
            assert (api, ui) == (8102, 5173)
            # Kill only the supervisor. Descendants must disappear via its job.
            subprocess.run(["taskkill", "/PID", str(supervisor), "/F"], check=True)
            second.wait(15)
            check_stopped((api, ui))
            command("stop")
            with (root / "frontend/package.json").open("a") as f:
                f.write("\n")
            with (root / "native/race/bindings.cpp").open("a") as f:
                f.write("\n// Incremental build probe.\n")
            third, log = launch("start")
            wait_for_launch(third, log)
            assert native.stat().st_mtime_ns != built, "changed native source was ignored"
            assert not sentinel.exists(), "changed manifest did not trigger npm ci"
            command("stop")
            assert third.wait(10) == 0
            check_stopped((8102, 5173))
            print(
                "Passed: clean install, occupied ports, ready URL, repeat open, stop twice, "
                "warm start, forced close, dependency invalidation."
            )
        finally:
            if any(proc.poll() is None for proc, _ in launched):
                command("stop")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="APEX smoke ") as temp:
        run_smoke(Path(temp))
