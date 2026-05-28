@echo off
REM ============================================================
REM   SHADDAI v80 — Stop all services
REM   Stops the backend (node) and AURA (python) started by
REM   START-SHADDAI.bat. Leaves Ollama running (shared/global).
REM ============================================================
title SHADDAI - Stop Services
color 0C
echo.
echo  Stopping SHADDAI services...
echo.

REM Stop the backend server window + any node running server-production
taskkill /FI "WINDOWTITLE eq SHADDAI Backend*" /T /F >nul 2>nul
for /f "tokens=2 delims=," %%p in ('wmic process where "name='node.exe' and commandline like '%%server-production%%'" get processid /format:csv ^| findstr [0-9]') do taskkill /PID %%p /F >nul 2>nul

REM Stop AURA window + python aura_server
taskkill /FI "WINDOWTITLE eq AURA*" /T /F >nul 2>nul
for /f "tokens=2 delims=," %%p in ('wmic process where "name='python.exe' and commandline like '%%aura_server%%'" get processid /format:csv ^| findstr [0-9]') do taskkill /PID %%p /F >nul 2>nul

echo  Backend and AURA stopped.
echo  ^(Ollama left running - close its window manually if you want it off.^)
echo.
timeout /t 2 /nobreak >nul
