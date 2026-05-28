@echo off
REM ============================================================
REM   SHADDAI v80 — One-Click Launcher
REM   Starts Ollama + Backend (+ AURA) and opens the dashboard.
REM   Works from wherever this .bat lives (uses its own folder).
REM ============================================================
title SHADDAI v80 Launcher
color 0A
cd /d "%~dp0"

echo.
echo  ===========================================
echo   SHADDAI v80 - Sovereign AI Command
echo   Starting all services...
echo  ===========================================
echo.

REM --- 1. Ollama (free local LLM) -----------------------------
where ollama >nul 2>nul
if %errorlevel%==0 (
  echo [1/4] Starting Ollama...
  start "Ollama" cmd /c "ollama serve"
  timeout /t 2 /nobreak >nul
) else (
  echo [1/4] Ollama not found - skipping ^(install from ollama.com for free local AI^)
)

REM --- 2. Backend dependencies (first run only) ---------------
if not exist "backend\node_modules" (
  echo [2/4] Installing backend dependencies ^(first run, please wait^)...
  pushd backend
  call npm install
  popd
) else (
  echo [2/4] Backend dependencies present.
)

REM --- 3. Backend server (port 3000) --------------------------
echo [3/4] Starting backend server on http://localhost:3000 ...
start "SHADDAI Backend" cmd /c "cd /d "%~dp0backend" && node server-production.js"
timeout /t 3 /nobreak >nul

REM --- 4. AURA token-saver (port 8010, optional) --------------
where python >nul 2>nul
if %errorlevel%==0 (
  if exist "aura\aura_server.py" (
    echo [4/4] Starting AURA token-saver on http://localhost:8010 ...
    start "AURA" cmd /c "cd /d "%~dp0aura" && python aura_server.py"
    timeout /t 2 /nobreak >nul
  )
) else (
  echo [4/4] Python not found - skipping AURA ^(optional token-saver^)
)

REM --- Open the dashboard -------------------------------------
echo.
echo  Opening dashboard...
timeout /t 2 /nobreak >nul
start "" "%~dp0FINAL-SHADDAI-V80.html"

echo.
echo  ===========================================
echo   SHADDAI is live!
echo   - Dashboard: opened in your browser
echo   - Backend:   http://localhost:3000
echo   - AURA:      http://localhost:8010 (if Python installed)
echo.
echo   Close this window anytime. To STOP all
echo   services, run STOP-SHADDAI.bat
echo  ===========================================
echo.
pause
