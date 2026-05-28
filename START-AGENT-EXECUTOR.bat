@echo off
title SHADDAI Agent Executor
chcp 65001 >nul 2>&1
color 0B
cls

echo.
echo  =============================================
echo   SHADDAI Agent Executor — Unified Bridge
echo   REST API :8010 ^| MCP ^| Autonomous Mode
echo  =============================================
echo.

set PYTHON=C:\Users\Brittany\AppData\Local\Programs\Python\Python311\python.exe
if not exist "%PYTHON%" set PYTHON=python

set DIR=C:\Users\Brittany\SHADDAI-FINAL-BUILD
set EXECUTOR=%DIR%\shaddai-agent-executor.py

if "%1"=="--cli" goto cli
if "%1"=="--mcp" goto mcp
if "%1"=="--help" goto help

echo Starting REST API server on port 8010...
echo.
echo  Available agents will be auto-detected.
echo  Backend tools proxied via localhost:3000
echo.
"%PYTHON%" "%EXECUTOR%" --serve
goto :eof

:cli
"%PYTHON%" "%EXECUTOR%" --cli
goto :eof

:mcp
echo MCP stdio mode — pipe this to opencode:
echo   npx opencode mcp add shaddai -- "%EXECUTOR%" --mcp
echo.
"%PYTHON%" "%EXECUTOR%" --mcp
goto :eof

:help
echo SHADDAI Agent Executor
echo ======================
echo.
echo Usage: START-AGENT-EXECUTOR [mode]
echo.
echo Modes:
echo   (no args)   Start REST API server on :8010
echo   --cli       Interactive CLI
echo   --mcp       MCP stdio server (for opencode)
echo   --help      This help
echo.
echo Quick opencode setup:
echo   npx opencode mcp add shaddai -- python shaddai-agent-executor.py --mcp
echo.
echo Then in opencode: "shaddai, analyze the crypto market"
echo.
