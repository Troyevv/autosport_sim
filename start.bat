@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
pushd "%~dp0" || goto :failed
where.exe uv.exe >nul 2>nul
if errorlevel 1 goto :no_uv
set "VIRTUAL_ENV="
uv.exe run --no-project --python 3.12 -- python "scripts\windows\launcher.py" start
:done
if errorlevel 1 goto :failed
popd
exit /b 0
:no_uv
echo Не найден uv. Установите uv для Windows и заново откройте этот файл.
echo https://docs.astral.sh/uv/getting-started/installation/
:failed
echo Не удалось выполнить start.bat. Подробности ошибки приведены выше.
pause
exit /b 1