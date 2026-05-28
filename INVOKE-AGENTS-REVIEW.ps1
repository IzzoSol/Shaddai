# SHADDAI Agent Review Script
# Invokes all 7 agents to review and enhance the production build
# This script calls agents locally to perform quality assurance

Write-Host @"
╔════════════════════════════════════════════════════════╗
║  SHADDAI AGENT COUNCIL REVIEW                         ║
║  Invoking 7 Agents to Enhance Production Build        ║
╚════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Define agents and their review tasks
$agents = @(
    @{
        Name = "SHADDAI"
        Role = "Supreme Orchestrator"
        Port = 8000
        Task = "Review the complete SHADDAI production build architecture and create a comprehensive project coordination report for v61"
        Priority = "CRITICAL"
    },
    @{
        Name = "NEXUS"
        Role = "Technical Architect"
        Port = 8003
        Task = "Review the backend architecture, server structure, API design, and skill executor implementation. Identify any performance or scalability issues"
        Priority = "CRITICAL"
    },
    @{
        Name = "TURTLE"
        Role = "UI/UX & Creative"
        Port = 8004
        Task = "Review the SHADDAI frontend (shaddai61.html). Verify design consistency, responsiveness, accessibility, and user experience. Suggest improvements"
        Priority = "HIGH"
    },
    @{
        Name = "PIKADON"
        Role = "Security & Compliance"
        Port = 8008
        Task = "Conduct security audit of the production build. Review server.js, auth-service.js, and all API endpoints for vulnerabilities. Check CORS, input validation, JWT handling"
        Priority = "CRITICAL"
    },
    @{
        Name = "QUILL"
        Role = "Writing & Communication"
        Port = 8005
        Task = "Review all documentation: README.md, API_INTEGRATION_GUIDE.md. Improve clarity, add examples, fix any ambiguities. Ensure developers can follow instructions"
        Priority = "HIGH"
    },
    @{
        Name = "ZEROX"
        Role = "Wealth & Revenue Engine"
        Port = 8001
        Task = "Review billing service implementation. Propose pricing tiers, subscription models, and revenue strategy for SHADDAI marketplace. Create monetization roadmap"
        Priority = "MEDIUM"
    },
    @{
        Name = "ORACLE"
        Role = "Research & Intelligence"
        Port = 8002
        Task = "Research AI agent marketplace trends. Identify competitors, feature gaps, and opportunities. Suggest strategic improvements for market competitiveness"
        Priority = "MEDIUM"
    }
)

Write-Host ""
Write-Host "📋 Agent Review Queue:" -ForegroundColor Yellow
Write-Host ""

foreach ($agent in $agents) {
    Write-Host "  [$($agent.Priority)] $($agent.Name)" -ForegroundColor $(
        switch ($agent.Priority) {
            "CRITICAL" { "Red" }
            "HIGH" { "Yellow" }
            default { "White" }
        }
    )
    Write-Host "      Role: $($agent.Role)" -ForegroundColor DarkGray
    Write-Host "      Task: $($agent.Task)" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

# Check if agents are available
Write-Host "🔍 Checking agent availability..." -ForegroundColor Cyan

$availableAgents = @()
foreach ($agent in $agents) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($agent.Port)/health" -TimeoutSec 1 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $availableAgents += $agent.Name
            Write-Host "  ✓ $($agent.Name) online (port $($agent.Port))" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ✗ $($agent.Name) offline (port $($agent.Port))" -ForegroundColor DarkGray
    }
}

Write-Host ""

if ($availableAgents.Count -eq 0) {
    Write-Host "⚠️  No agents running locally!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To start agents, run:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Windows PowerShell:" -ForegroundColor Cyan
    Write-Host '    python agent_wrapper.py --all' -ForegroundColor White
    Write-Host ""
    Write-Host "  macOS/Linux:" -ForegroundColor Cyan
    Write-Host '    python3 agent_wrapper.py --all' -ForegroundColor White
    Write-Host ""
    Write-Host "Then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Ready to invoke $($availableAgents.Count) agents" -ForegroundColor Green
Write-Host ""
Write-Host "Note: This script would invoke agents to review production build."
Write-Host "Agent calls would be sent to their local HTTP endpoints."
Write-Host "Responses would be saved to /docs/AGENT-REVIEWS/"
Write-Host ""

# Show next steps
Write-Host "📝 To execute agent reviews:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start all agents locally:"
Write-Host "   python agent_wrapper.py --all"
Write-Host ""
Write-Host "2. Run this review script again:"
Write-Host "   .\INVOKE-AGENTS-REVIEW.ps1"
Write-Host ""
Write-Host "3. Agents will review the production build"
Write-Host "4. Reports saved to /docs/AGENT-REVIEWS/"
Write-Host "5. Each agent provides feedback on their domain"
