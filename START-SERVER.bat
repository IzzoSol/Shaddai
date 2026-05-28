@echo off
REM SHADDAI Production Server Startup Script (Batch)
REM Starts all backend services and frontend server

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  SHADDAI PRODUCTION SERVER                            ║
echo ║  Starting Services...                                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo ✓ Dependencies installed
    echo.
)

REM Check if backend directory exists
if not exist "backend" (
    echo ✗ Error: backend directory not found
    pause
    exit /b 1
)

REM Check if public directory exists
if not exist "public" (
    echo ✗ Error: public directory not found
    pause
    exit /b 1
)

echo 📂 Directory structure:
echo   ✓ /backend - Core server files
echo   ✓ /public - Frontend (index.html)
echo   ✓ /generated-output - Generated agent files
echo   ✓ /docs - Documentation
echo.

echo 🚀 Starting server on port 3000...
echo.

REM Start the server
call npm start

REM If npm start returns (shouldn't unless error)
echo ✗ Server stopped unexpectedly
pause
