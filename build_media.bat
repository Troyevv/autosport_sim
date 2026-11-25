@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
set "VIRTUAL_ENV="
pushd "%~dp0" || goto :folder_error
call :find_uv
if defined MEDIA_UV goto :build
echo Для сборки нужен uv. Установить uv для текущего пользователя с astral.sh?
choice /c YN /m "Y = установить, N = отмена"
if errorlevel 2 goto :cancel
if not errorlevel 1 goto :cancel
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-Expression (Invoke-RestMethod 'https://astral.sh/uv/0.13.9/install.ps1')"
if errorlevel 1 goto :install_error
call :find_uv
if not defined MEDIA_UV goto :install_error

:build
echo Подготовка Python и зависимостей медиапакета...
"%MEDIA_UV%" run --locked --python 3.12 --extra media-builder python -u -m scripts.build_media "autosport-2025.zip"
if errorlevel 1 goto :build_error
explorer.exe /select,"%CD%\autosport-2025.zip"
popd
pause
exit /b 0

:find_uv
set "MEDIA_UV="
for %%U in (uv.exe) do set "MEDIA_UV=%%~$PATH:U"
if defined MEDIA_UV exit /b 0
for %%D in ("%UV_INSTALL_DIR%" "%XDG_BIN_HOME%" "%USERPROFILE%\.local\bin" "%USERPROFILE%\.cargo\bin" "%USERPROFILE%\scoop\shims" "%LOCALAPPDATA%\Microsoft\WinGet\Links") do if not "%%~D"=="" if exist "%%~D\uv.exe" set "MEDIA_UV=%%~D\uv.exe"
exit /b 0

:cancel
echo Сборка отменена.
goto :failed
:install_error
echo Не удалось установить или обнаружить uv. Подробности установки указаны выше.
goto :failed
:build_error
echo Сборка завершилась ошибкой. Проверьте сообщение выше, подключение к сети и доступ на запись в папку проекта.
goto :failed
:folder_error
echo Не удалось открыть папку проекта.
pause
exit /b 1
:failed
popd
pause
exit /b 1
