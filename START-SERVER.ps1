# SHADDAI Production Server Startup Script (PowerShell)
# Starts all backend services and frontend server

Write-Host @"
╔════════════════════════════════════════════════════════╗
║  SHADDAI PRODUCTION SERVER                            ║
║  Starting Services...                                 ║
╚════════════════════════════════════════════════════════╝
"@

# Check if node_modules exists
if (-not (Test-Path ".\node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    npm install
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
}

# Check if backend directory exists
if (-not (Test-Path ".\backend")) {
    Write-Host "✗ Error: backend directory not found" -ForegroundColor Red
    exit 1
}

# Check if public directory exists
if (-not (Test-Path ".\public")) {
    Write-Host "✗ Error: public directory not found" -ForegroundColor Red
    exit 1
}

Write-Host "`n📂 Directory structure:" -ForegroundColor Cyan
Write-Host "  ✓ /backend - Core server files"
Write-Host "  ✓ /public - Frontend (index.html)"
Write-Host "  ✓ /generated-output - Generated agent files"
Write-Host "  ✓ /docs - Documentation"

Write-Host "`n🚀 Starting server on port 3000..." -ForegroundColor Green

# Start the server
npm start

# If npm start returns (shouldn't unless error)
Write-Host "✗ Server stopped unexpectedly" -ForegroundColor Red
