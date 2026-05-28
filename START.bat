@echo off
title SHADDAI v62 - Launching...
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║   SHADDAI v62 — AI Agent Marketplace                    ║
echo  ║   7 Agents + Ollama + Market Data                       ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

REM ── Kill existing Node processes ────────────────────────────
echo [1/5] Clearing old processes...
taskkill /F /IM "node.exe" >nul 2>&1
timeout /t 1 /nobreak >nul
echo       Done

REM ── Install dependencies ─────────────────────────────────────
if not exist "node_modules" (
  echo [2/5] Installing npm packages...
  call npm install --silent
  if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )
  echo       Done
) else (
  echo [2/5] Dependencies OK
)

REM ── Start Ollama ─────────────────────────────────────────────
echo [3/5] Starting Ollama (local AI engine)...
set OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe
if exist "%OLLAMA_EXE%" (
  start "" /min "%OLLAMA_EXE%" serve
  timeout /t 3 /nobreak >nul
  echo       Ollama starting on port 11434
) else (
  echo       WARNING: Ollama not found - chat will be limited
)

REM ── Start Agent Network ───────────────────────────────────────
echo [4/5] Starting 7-agent network...
start "SHADDAI Agents" /min node backend/multi-agent-server.js
timeout /t 2 /nobreak >nul
echo       Agents starting on ports 8000-8008

REM ── Start Main Server ─────────────────────────────────────────
echo [5/5] Starting SHADDAI server on port 3000...
echo.
echo  ┌──────────────────────────────────────────────────────────┐
echo  │   Dashboard  →  http://localhost:3000                    │
echo  │   Health     →  http://localhost:3000/api/health         │
echo  │   Agents     →  http://localhost:3000/api/agents/status/all │
echo  └──────────────────────────────────────────────────────────┘
echo.
echo  Opening dashboard in browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

node backend/server-production.js

echo.
echo  Server stopped.
pause
