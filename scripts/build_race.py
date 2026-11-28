"""Configure and incrementally build the C++ module for this interpreter."""

import argparse
import hashlib
import importlib.metadata
import os
from pathlib import Path
import subprocess
import sys
import sysconfig

import cmake
import pybind11

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "native" / "race"


def build(test=False):
    cmake_bin = str(
        Path(cmake.CMAKE_BIN_DIR) / ("cmake.exe" if os.name == "nt" else "cmake")
    )
    options = [
        f"-DPython_EXECUTABLE={sys.executable}",
        f"-Dpybind11_DIR={pybind11.get_cmake_dir()}",
        "-DCMAKE_BUILD_TYPE=Release",
        f"-DBUILD_TESTING={'ON' if test else 'OFF'}",
    ]
    if os.name == "nt":
        options += ["-G", "Visual Studio 17 2022", "-T", "v143"]
    key = hashlib.sha256(
        repr(
            (
                sys.executable,
                sys.version,
                sysconfig.get_config_var("SOABI"),
                sysconfig.get_platform(),
                options,
                importlib.metadata.version("cmake"),
                pybind11.__version__,
                [
                    os.environ.get(k)
                    for k in ("CC", "CXX", "CXXFLAGS", "CMAKE_GENERATOR", "LDFLAGS")
                ],
            )
        ).encode()
    ).hexdigest()[:20]
    folder = ROOT / ".autosport" / "native" / key
    dest = Path(sysconfig.get_path("platlib"))
    try:
        subprocess.run([cmake_bin, "-S", SOURCE, "-B", folder, *options], check=True)
        subprocess.run(
            [cmake_bin, "--build", folder, "--config", "Release", "--parallel"],
            check=True,
        )
        if test:
            ctest = Path(cmake.CMAKE_BIN_DIR) / (
                "ctest.exe" if os.name == "nt" else "ctest"
            )
            subprocess.run(
                [ctest, "--test-dir", folder, "-C", "Release", "--output-on-failure"],
                check=True,
            )
        subprocess.run(
            [cmake_bin, "--install", folder, "--config", "Release", "--prefix", dest],
            check=True,
        )
        subprocess.run(
            [
                sys.executable,
                "-c",
                "import _race_space as r; assert r.CONTRACT_VERSION == 1",
            ],
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        hint = (
            "Установите Visual Studio Build Tools 2022, MSVC v143 и Windows SDK (Desktop development with C++)."
            if os.name == "nt"
            else "Проверьте компилятор C++20 и заголовки Python."
        )
        raise SystemExit(
            f"Сборка или проверка гоночного ядра завершилась ошибкой. {hint}"
        ) from exc


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test", action="store_true")
    build(parser.parse_args().test)
