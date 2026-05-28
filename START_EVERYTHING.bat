@echo off
title SHADDAI Ecosystem — All Agents
chcp 65001 >nul 2>&1
color 0B
cls

echo.
echo  =============================================
echo   SHADDAI v58.88 — Ecosystem Launcher
echo   Starts 7 agents + executor bridge
echo  =============================================
echo.

set PYTHON=C:\Users\Brittany\AppData\Local\Programs\Python\Python312\python.exe
set BOOT=C:\Users\Brittany\SHADDAI-FINAL-BUILD\boot_agent.py
set EXEC=C:\Users\Brittany\SHADDAI-FINAL-BUILD\shaddai-agent-executor.py
set AGENTS_DIR=C:\Users\Brittany\OneDrive\Desktop\New folder\Desktop\MASTERY FOLDER\06_AGENTS

:: Install httpx if needed
"%PYTHON%" -c "import httpx" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   Installing httpx for pikadon...
    "%PYTHON%" -m pip install httpx -q
)

:: Check backend
echo   Checking backend :3000...
curl -s --max-time 2 http://localhost:3000 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (echo   [WARN] Backend not running on :3000) else (echo   Backend OK)

:: Check Ollama
echo   Checking Ollama...
curl -s --max-time 2 http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% NEQ 0 (echo   [WARN] Ollama not running) else (echo   Ollama OK)

:: Kill leftover agents
echo   Cleaning up...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Launch all agents via bootstrapper
echo.
echo   Launching 7 agents...

"%PYTHON%" "%BOOT%" shaddai
timeout /t 3 /nobreak >nul

"%PYTHON%" "%BOOT%" zerox
timeout /t 2 /nobreak >nul

"%PYTHON%" "%BOOT%" oracle
timeout /t 2 /nobreak >nul

"%PYTHON%" "%BOOT%" nexus
timeout /t 2 /nobreak >nul

"%PYTHON%" "%BOOT%" turtle
timeout /t 2 /nobreak >nul

"%PYTHON%" "%BOOT%" quill
timeout /t 2 /nobreak >nul

"%PYTHON%" "%BOOT%" pikadon
timeout /t 4 /nobreak >nul

:: Verify agents
echo.
echo   Waiting for agents...
set AGENTS=shaddai:8000 zerox:8001 oracle:8002 nexus:8003 turtle:8004 quill:8005 pikadon:8008
for %%A in (%AGENTS%) do (
    for /f "tokens=1,2 delims=:" %%N in (%%A) do (
        set "ready="
        for /l %%I in (1,1,20) do (
            curl -s --max-time 1 http://localhost:%%O/ >nul 2>&1
            if !errorlevel! equ 0 (set ready=1 & goto :next)
            timeout /t 1 /nobreak >nul
        )
        :next
        if defined ready (echo    [OK] %%N:%%O) else (echo    [--] %%N:%%O)
    )
)

:: Launch executor
echo.
echo   Starting executor bridge :8010...
start "EXECUTOR" /MIN "%PYTHON%" "%EXEC%" --serve

timeout /t 4 /nobreak >nul
curl -s --max-time 2 http://localhost:8010/ >nul 2>&1
if %ERRORLEVEL% EQU 0 (echo    [OK] executor:8010) else (echo    [--] executor:8010)

echo.
echo  =============================================
echo   ALL SYSTEMS ONLINE
echo  =============================================
echo.
echo   Agent Portal:  http://localhost:8010/agents
echo   Tools:         http://localhost:8010/tools
echo   Backend:       http://localhost:3000
echo.
echo   To connect opencode:
echo     npx opencode mcp add shaddai -- "%PYTHON%" "%EXEC%" --mcp
echo.
echo   To stop: taskkill /F /IM python.exe
echo.
pause
