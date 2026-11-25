"""Windows CI smoke through the same .bat files that Explorer invokes."""

from contextlib import ExitStack
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

SOURCE = Path(__file__).resolve().parents[1]


def browser_probe(url):
    # Registered via Python's standard BROWSER setting. Validate the published
    # URL at the instant a normal desktop browser would have received it.
    with urllib.request.urlopen(url, timeout=5) as response:
        index = response.read().decode()
    script = re.search(r'<script\b[^>]*\bsrc="([^"]+)"', index)[1]
    with urllib.request.urlopen(url + script, timeout=5) as response:
        assert len(response.read()) > 100
    with urllib.request.urlopen(url + "/api/config", timeout=5) as response:
        assert json.load(response)["mode"] == "demo"
    with Path(os.environ["LAUNCHER_SMOKE_VISITS"]).open("a", encoding="utf-8") as f:
        print(url, file=f)


def run_smoke(tmp):
    root = tmp / "Игра автоспорт"
    root.mkdir()
    for name in ("start.bat", "stop.bat", "pyproject.toml", "uv.lock"):
        shutil.copy2(SOURCE / name, root / name)
    for name in ("backend", "frontend", "scripts"):
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
    probe = tmp / "browser.py"
    shutil.copy2(__file__, probe)
    visits = tmp / "visits.txt"
    env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "LAUNCHER_SMOKE_VISITS": str(visits),
        "BROWSER": f'"{sys.executable}" "{probe}" %s',
    }
    launched = []
    with ExitStack() as stack:

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

        def wait_for_launch(proc, log, expected):
            deadline = time.monotonic() + 240
            while time.monotonic() < deadline and proc.poll() is None:
                if visits.exists():
                    urls = visits.read_text(encoding="utf-8").splitlines()
                    if len(urls) == expected:
                        return urls[-1]
                time.sleep(0.2)
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
            url = wait_for_launch(first, log, 1)
            api, ui, _ = ports_and_pid(log)
            assert {api, ui}.isdisjoint({8102, 5173}) and api != ui
            assert url == f"http://127.0.0.1:{ui}"
            assert (root / ".venv/Scripts/python.exe").is_file()
            modules = root / "frontend/node_modules"
            sentinel = modules / "keep-on-warm-start"
            sentinel.touch()
            command("start")
            assert wait_for_launch(first, log, 2) == url
            command("stop")
            assert first.wait(10) == 0
            check_stopped((api, ui))
            command("stop")
            for sock in occupied:
                assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN)
                sock.close()
            second, log = launch("start")
            assert wait_for_launch(second, log, 3) == "http://127.0.0.1:5173"
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
            third, log = launch("start")
            wait_for_launch(third, log, 4)
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
    if len(sys.argv) == 2:
        browser_probe(sys.argv[1])
    else:
        with tempfile.TemporaryDirectory(prefix="APEX smoke ") as temp:
            run_smoke(Path(temp))
