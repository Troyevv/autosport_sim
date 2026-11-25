"""Double-click launcher. Only the supervisor may open a browser outside the job."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
import webbrowser

from kernel import Event, Job, Mutex

ROOT = Path(__file__).resolve().parents[2]
FRONT = ROOT / "frontend"
PYTHON = ROOT / ".venv/Scripts/python.exe"
HOST = "127.0.0.1"
INSTANCE = (
    "Local\\Autosport-"
    + hashlib.sha256(os.path.normcase(str(ROOT)).encode()).hexdigest()
)
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def say(message):
    print(message, flush=True)


def tool(name, args, minimum):
    path = shutil.which(name)
    if not path:
        raise RuntimeError(
            f"Не найден {name}. Установите инструмент и снова откройте start.bat."
        )
    result = subprocess.check_output([path, *args], text=True).strip()
    match = re.search(r"\b(\d+)\.(\d+)\.(\d+)", result.lstrip("v"))
    if not match or tuple(map(int, match.groups())) < minimum:
        version = ".".join(map(str, minimum))
        raise RuntimeError(f"Для {name} нужна версия от {version}. Найдена: {result}.")
    say(f"{name}: {result}")
    return path, result


def prepare():
    uv, _ = tool("uv.exe", ["--version"], (0, 13, 9))
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(
            "Для запуска нужен Python 3.12. Откройте start.bat через uv."
        )
    say("Python: " + sys.version.split()[0])
    node, node_version = tool("node.exe", ["--version"], (22, 13, 0))
    if node_version.startswith("v23."):
        raise RuntimeError("Установите Node.js 24 LTS или 22 LTS от 22.13.")
    npm, npm_version = tool("npm.cmd", ["--version"], (9, 0, 0))
    say("Проверка виртуального окружения и зависимостей Python…")
    # uv audits the locked environment and installs only when it differs.
    subprocess.run(
        [uv, "sync", "--locked", "--python", sys.executable],
        cwd=ROOT,
        env={**os.environ, "UV_PROJECT_ENVIRONMENT": str(PYTHON.parents[1])},
        check=True,
    )
    modules = FRONT / "node_modules"
    stamp = modules / ".autosport-install"
    digest = hashlib.sha256()
    for manifest in ("package.json", "package-lock.json"):
        digest.update((FRONT / manifest).read_bytes())
    arch = subprocess.check_output([node, "-p", "process.arch"], text=True).strip()
    digest.update(f"{node_version}/{npm_version}/{arch}".encode())
    key = digest.hexdigest()
    vite = modules / "vite/bin/vite.js"
    if not (
        stamp.is_file()
        and stamp.read_text() == key
        and vite.is_file()
        and (modules / "typescript/bin/tsc").is_file()
        and (modules / ".package-lock.json").is_file()
    ):
        say("Установка зависимостей интерфейса…")
        stamp.unlink(missing_ok=True)
        subprocess.run(
            [npm, "ci", "--include=dev", "--no-audit", "--no-fund"],
            cwd=FRONT,
            check=True,
        )
        stamp.write_text(key)
    else:
        say("Зависимости интерфейса уже установлены.")
    say("Сборка интерфейса…")
    subprocess.run([npm, "run", "build"], cwd=FRONT, check=True)
    return node, vite


def available_port(preferred, excluded=0):
    for port in (preferred, 0):
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                sock.bind((HOST, port))
            except OSError:
                if port:
                    continue
                raise
            actual = sock.getsockname()[1]
            if actual != excluded:
                return actual
    # An ephemeral port coincided with the port reserved for the other server.
    return available_port(0, excluded)


def read_url(url):
    with HTTP.open(url, timeout=0.8) as response:
        return response.read()


def ready(api_url, ui_url, entry):
    try:
        return (
            json.loads(read_url(api_url + "/api/health")).get("status") == "ok"
            and json.loads(read_url(ui_url + "/api/config"))
            == {"mode": "demo", "career_saves": False}
            and entry in read_url(ui_url + "/").decode()
            and read_url(ui_url + entry)
            == (FRONT / "dist" / entry.lstrip("/")).read_bytes()
        )
    except (OSError, ValueError, urllib.error.URLError):
        return False


def stop_servers(servers):
    for process in servers:
        if process.poll() is None:
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)
            except OSError:
                process.terminate()
    for process in servers:
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def serve(api_port, ui_port, ready_name):
    # No installer or server may run until the supervisor owns this process tree.
    if os.read(sys.stdin.fileno(), 1) != b"G":
        return
    stopping = threading.Event()

    def watch_parent():
        os.read(sys.stdin.fileno(), 1)  # EOF requests shutdown.
        stopping.set()

    threading.Thread(target=watch_parent, daemon=True).start()
    node, vite = prepare()
    api_url, ui_url = (f"http://{HOST}:{port}" for port in (api_port, ui_port))
    index = (FRONT / "dist/index.html").read_text(encoding="utf-8")
    entry = re.search(r'<script\b[^>]*\bsrc="(/assets/[^"]+\.js)"', index)
    if not entry:
        raise RuntimeError("В сборке не найден входной JavaScript-модуль.")
    servers = []
    options = dict(
        stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
    )
    try:
        servers.append(
            subprocess.Popen(
                [
                    PYTHON,
                    "-m",
                    "uvicorn",
                    "backend.app:app",
                    "--host",
                    HOST,
                    "--port",
                    api_port,
                ],
                cwd=ROOT,
                **options,
            )
        )
        servers.append(
            subprocess.Popen(
                [
                    node,
                    vite,
                    "preview",
                    "--host",
                    HOST,
                    "--port",
                    ui_port,
                    "--strictPort",
                ],
                cwd=FRONT,
                env={**os.environ, "AUTOSPORT_API_PORT": api_port},
                **options,
            )
        )
        deadline = time.monotonic() + 60
        announced = False
        with Event(ready_name) as started:
            while not stopping.wait(0.2):
                for name, process in zip(("API", "Интерфейс"), servers):
                    if process.poll() is not None:
                        raise RuntimeError(
                            f"{name} завершился с кодом {process.returncode}. См. вывод выше."
                        )
                if not announced:
                    if ready(api_url, ui_url, entry.group(1)):
                        started.signal()
                        announced = True
                    elif time.monotonic() > deadline:
                        raise RuntimeError(
                            f"Приложение не ответило за минуту. API {api_url}, интерфейс {ui_url}."
                        )
    finally:
        stop_servers(servers)


def supervise(stop, reopen):
    api_port = available_port(8102)
    ui_port = available_port(5173, api_port)
    url = f"http://{HOST}:{ui_port}"
    say(f"Адреса запуска: API {api_port}, интерфейс {ui_port}. PID {os.getpid()}.")
    ready_name = INSTANCE + "-" + uuid.uuid4().hex
    with Event(ready_name) as started, Job() as job:
        worker = subprocess.Popen(
            [
                # Start the base interpreter itself. A Windows venv redirector
                # could spawn the real worker before assignment to the job.
                Path(sys.base_prefix) / "python.exe",
                __file__,
                "serve",
                str(api_port),
                str(ui_port),
                ready_name,
            ],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        try:
            job.attach(worker.pid)
            worker.stdin.write(b"G")
            worker.stdin.flush()
            active = False
            while not stop.wait(150):
                if worker.poll() is not None:
                    raise RuntimeError("Запуск игры прерван. Проверьте сообщение выше.")
                again = reopen.wait()
                if started.wait() or (active and again):
                    active = True
                    say(
                        f"Игра готова: {url}. Для остановки откройте stop.bat или закройте это окно."
                    )
                    if not webbrowser.open(url):
                        raise RuntimeError(
                            f"Не удалось открыть браузер по умолчанию. Адрес игры: {url}"
                        )
        except KeyboardInterrupt:
            pass
        finally:
            worker.stdin.close()
            try:
                worker.wait(timeout=8)
            except subprocess.TimeoutExpired:
                pass  # Closing the job also stops installers and grandchildren.
    say("Приложение остановлено.")


def control(action):
    with Mutex(INSTANCE) as mutex:
        if mutex.wait():
            try:
                if action == "stop":
                    say("Приложение уже остановлено.")
                    return
                with (
                    Event(INSTANCE + "-stop") as stop,
                    Event(INSTANCE + "-open") as reopen,
                ):
                    supervise(stop, reopen)
            finally:
                mutex.release()
        else:
            name = "-stop" if action == "stop" else "-open"
            with Event(INSTANCE + name) as request:
                request.signal()
                if action == "stop":
                    if not mutex.wait(30000):
                        raise RuntimeError(
                            "Остановка занимает больше 30 секунд. Проверьте окно запуска."
                        )
                    mutex.release()
                    say("Приложение остановлено.")
                else:
                    say("Эта копия уже запускается или работает.")


if __name__ == "__main__":
    try:
        os.chdir(ROOT)
        if sys.argv[1] == "serve":
            serve(*sys.argv[2:])
        else:
            control(sys.argv[1])
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        say(f"Ошибка: {error}")
        sys.exit(1)
