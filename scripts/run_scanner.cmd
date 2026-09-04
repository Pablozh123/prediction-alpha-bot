@echo off
setlocal EnableExtensions
rem Restart wrapper for the paper-only scanner (npm run dev).
rem Paths are relative to this script, so the repo can live anywhere.
rem Log: logs\scanner.log, rotated to scanner.log.1 once it passes LOG_MAX_BYTES.

set "REPO=%~dp0.."
set "LOGDIR=%REPO%\logs"
set "LOGFILE=%LOGDIR%\scanner.log"
set "LOG_MAX_BYTES=10485760"
set "RESTART_DELAY_SECONDS=30"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
cd /d "%REPO%"

:loop
call :rotate
echo [%date% %time%] scanner start (paper-only) >> "%LOGFILE%"
call npm run dev >> "%LOGFILE%" 2>&1
set "EXITCODE=%ERRORLEVEL%"
echo [%date% %time%] scanner exited with code %EXITCODE%; restarting in %RESTART_DELAY_SECONDS%s >> "%LOGFILE%"
timeout /t %RESTART_DELAY_SECONDS% /nobreak >nul
goto loop

:rotate
if not exist "%LOGFILE%" exit /b 0
for %%F in ("%LOGFILE%") do set "LOGSIZE=%%~zF"
if %LOGSIZE% LSS %LOG_MAX_BYTES% exit /b 0
if exist "%LOGFILE%.1" del /q "%LOGFILE%.1"
move /y "%LOGFILE%" "%LOGFILE%.1" >nul
exit /b 0
