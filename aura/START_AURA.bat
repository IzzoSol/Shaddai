@echo off
title AURA — Agent Unified Routing Architecture (Port 8010)
color 0A

echo.
echo  ███████████████████████████████████████
echo  ██   AURA  —  Token Saver Engine     ██
echo  ██   Port 8010  ^|  AINL Primitives   ██
echo  ███████████████████████████████████████
echo.

:: Move to script directory
cd /d "%~dp0"

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.11+ from python.org
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo [WARN] .env not found — copying from .env.template
    copy ".env.template" ".env" >nul
    echo [WARN] Edit .env and add your API keys, then restart.
)

:: Install deps if needed
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing dependencies...
    pip install -r requirements.txt
)

:: Check Ollama
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo [WARN] Ollama not detected on port 11434. Free LLM will be skipped.
    echo [INFO] Install Ollama from ollama.com to enable free local AI.
) else (
    echo [OK]   Ollama detected — free LLM ready
)

:: Launch
echo.
echo [AURA] Starting server...
echo [AURA] Health check: http://localhost:8010/aura/health
echo [AURA] Task API:     POST http://localhost:8010/aura/task
echo [AURA] Press Ctrl+C to stop
echo.
python aura_server.py

pause
