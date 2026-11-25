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
    result = subprocess.check_output(
        [path, *args], stdin=subprocess.DEVNULL, text=True, timeout=20
    ).strip()
    match = re.search(r"\b(\d+)\.(\d+)\.(\d+)", result.lstrip("v"))
    if not match or tuple(map(int, match.groups())) < minimum:
        version = ".".join(map(str, minimum))
        raise RuntimeError(f"Для {name} нужна версия от {version}. Найдена: {result}.")
    say(f"{name}: {result}")
    return path, result


def prepare():
    uv, _ = tool("uv.exe", ["--version"], (0, 13, 9))
    if not (3, 11) <= sys.version_info[:2] < (3, 15):
        raise RuntimeError("Нужен Python 3.11–3.14. Запустите игру через start.bat.")
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
        stdin=subprocess.DEVNULL,
        check=True,
    )
    modules = FRONT / "node_modules"
    stamp = modules / ".autosport-install"
    digest = hashlib.sha256()
    for manifest in ("package.json", "package-lock.json"):
        digest.update((FRONT / manifest).read_bytes())
    arch = subprocess.check_output(
        [node, "-p", "process.arch"], stdin=subprocess.DEVNULL, text=True, timeout=20
    ).strip()
    digest.update(f"{node_version}/{npm_version}/{arch}".encode())
    installed_lock = modules / ".package-lock.json"

    def install_key():
        installed = hashlib.sha256(installed_lock.read_bytes()).hexdigest()
        return digest.hexdigest() + ":" + installed

    vite = modules / "vite/bin/vite.js"
    if not (
        stamp.is_file()
        and installed_lock.is_file()
        and stamp.read_bytes() == install_key().encode()
        and vite.is_file()
        and (modules / "typescript/bin/tsc").is_file()
    ):
        say("Установка зависимостей интерфейса…")
        stamp.unlink(missing_ok=True)
        subprocess.run(
            [npm, "ci", "--include=dev", "--no-audit", "--no-fund"],
            cwd=FRONT,
            stdin=subprocess.DEVNULL,
            check=True,
        )
        stamp.write_bytes(install_key().encode())
    else:
        say("Зависимости интерфейса уже установлены.")
    say("Сборка интерфейса…")
    subprocess.run(
        [npm, "run", "build"], cwd=FRONT, stdin=subprocess.DEVNULL, check=True
    )
    return node, vite


def reserve_port(preferred):
    sock = socket.socket()
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            sock.bind((HOST, preferred))
        except OSError:
            sock.bind((HOST, 0))
        return sock
    except OSError:
        sock.close()
        raise


def check_ready(api_url, ui_url, entry):
    def read(url):
        try:
            with HTTP.open(url, timeout=2) as response:
                return response.read()
        except OSError as error:
            raise RuntimeError(f"{url}: {error}") from error

    if json.loads(read(api_url + "/api/health")).get("status") != "ok":
        raise ValueError("API пока не готов.")
    # Match the frontend bootstrap contract; additional API fields are valid.
    config = json.loads(read(ui_url + "/api/config"))
    if config.get("mode") != "demo" or config.get("career_saves") is not False:
        raise ValueError("Прокси интерфейса вернул несовместимую конфигурацию.")
    if entry not in read(ui_url + "/").decode():
        raise ValueError("HTTP-сервер отдал другую сборку интерфейса.")
    if read(ui_url + entry) != (FRONT / "dist" / entry.lstrip("/")).read_bytes():
        raise ValueError(f"Содержимое модуля {entry} расходится со сборкой.")


def open_game(url):
    try:
        # ShellExecute uses the user's HTTP association and propagates WinError.
        os.startfile(url, "open")
    except OSError as error:
        say(
            f"Ошибка открытия браузера: {error}. Проверьте браузер по умолчанию "
            "для HTTP в параметрах Windows и повторите двойной клик по start.bat."
        )
    else:
        say(f"Адрес передан браузеру по умолчанию: {url}")


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
    if stopping.is_set():
        return
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
                    try:
                        check_ready(api_url, ui_url, entry.group(1))
                    except (RuntimeError, ValueError) as error:
                        if time.monotonic() >= deadline:
                            raise RuntimeError(
                                f"Не удалось подтвердить готовность: {error}"
                            ) from error
                    else:
                        say(
                            "API, прокси и сборка готовы. Сигнал передаётся окну запуска."
                        )
                        started.signal()
                        announced = True
    finally:
        stop_servers(servers)


def supervise(stop, reopen):
    with reserve_port(8102) as api, reserve_port(5173) as ui:
        api_port, ui_port = api.getsockname()[1], ui.getsockname()[1]
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
                if started.wait():
                    active = True
                    say(
                        "Готовность подтверждена. Для остановки откройте stop.bat или закройте это окно."
                    )
                    open_game(url)
                elif active and again:
                    open_game(url)
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
