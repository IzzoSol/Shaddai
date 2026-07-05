@echo off
title SHADDAI
cd /d "%~dp0"
echo ============================================================
echo   SHADDAI launcher  -  ONE server, ONE port (3000)
echo ============================================================
echo.
echo Freeing ports 3000 and 8099 (killing any stale servers)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8099" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Done.
echo.
echo Starting SHADDAI from THIS folder (%cd%)
echo Dashboard will open at  http://localhost:3000
echo Keep this window open. Close it to stop SHADDAI.
echo.
start "" http://localhost:3000/
node backend/server-production.js
pause
