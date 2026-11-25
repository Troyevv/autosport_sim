@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
pushd "%~dp0" || goto :failed
if not exist ".venv\Scripts\python.exe" goto :bootstrap
".venv\Scripts\python.exe" "scripts\windows\launcher.py" stop
goto :done
:bootstrap
where.exe uv.exe >nul 2>nul
if errorlevel 1 goto :no_uv
set "VIRTUAL_ENV="
uv.exe run --no-project --python ">=3.11,<3.15" -- python "scripts\windows\launcher.py" stop
:done
if errorlevel 1 goto :failed
popd
exit /b 0
:no_uv
echo Не найден uv. Установите uv для Windows и заново откройте этот файл.
echo https://docs.astral.sh/uv/getting-started/installation/
:failed
echo Не удалось выполнить stop.bat. Подробности ошибки приведены выше.
pause
exit /b 1