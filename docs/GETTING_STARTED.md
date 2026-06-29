# SHADDAI Getting Started Guide

Get SHADDAI up and running in under 5 minutes.

## What is SHADDAI?

SHADDAI is an AI Agent Marketplace that orchestrates 7 specialized agents to execute real work:
- **NEXUS** - Builds APIs and backend systems
- **TURTLE** - Designs beautiful UIs and components
- **QUILL** - Writes documentation and communication
- **PIKADON** - Reviews code for security
- **ZEROX** - Handles billing and business logic
- **ORACLE** - Researches and provides insights
- **SHADDAI** - Coordinates everything

Instead of writing code yourself, you describe what you need and SHADDAI's agents execute it.

## Prerequisites

Before starting, ensure you have:
- **Node.js** 16+ ([Download](https://nodejs.org))
- **npm** (included with Node.js)
- **Port 3000 available** (check with `netstat -ano | findstr :3000`)
- **Windows, macOS, or Linux**

## Quick Start (5 Minutes)

### Step 1: Clone or Extract Files

```powershell
# Navigate to your project directory
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
```

### Step 2: Install Dependencies

```powershell
npm install
```

This installs all required Node.js packages. Takes about 1-2 minutes on first run.

### Step 3: Start the Server

**On Windows (PowerShell):**
```powershell
.\START-SERVER.ps1
```

**On Windows (Command Prompt):**
```cmd
START-SERVER.bat
```

**On macOS/Linux:**
```bash
npm start
```

### Step 4: Open in Browser

Once you see "Server running on port 3000", open:
```
http://localhost:3000
```

You should see the SHADDAI dashboard with a list of available agents.

## Your First Task: 5 Minutes

### Task 1: Check Server Health

Open a new PowerShell window and run:

```powershell
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "operational",
  "version": "61.0.0",
  "timestamp": "2026-05-13T10:30:00Z"
}
```

### Task 2: List Available Agents

```powershell
curl http://localhost:3000/api/agents
```

This shows all 7 agents and their status (should be "online").

### Task 3: Execute Your First Agent Task

Have NEXUS build a simple API:

```powershell
$body = @{
    agentName = "NEXUS"
    task = "Build a simple REST API with a /hello endpoint that returns JSON"
    context = @{
        framework = "Express"
    }
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/agents/task `
  -ContentType "application/json" `
  -Body $body
```

**What to expect:**
- Takes 5-30 seconds
- Returns a file path to generated code
- Code saved to `/generated-output/api-server.js`

## Common Tasks

### Build a REST API
```powershell
$body = @{
    agentName = "NEXUS"
    task = "Build a REST API for managing users"
    context = @{
        framework = "Express"
        database = "PostgreSQL"
        entities = @("User", "Profile", "Settings")
    }
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/agents/task `
  -ContentType "application/json" `
  -Body $body
```

### Design a Login Page
```powershell
$body = @{
    agentName = "TURTLE"
    task = "Design a beautiful, modern login page with dark mode"
    context = @{
        framework = "React"
        theme = "dark"
        brandColors = @("#6366f1", "#f97316")
    }
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/agents/task `
  -ContentType "application/json" `
  -Body $body
```

### Write API Documentation
```powershell
$body = @{
    agentName = "QUILL"
    task = "Write comprehensive API documentation"
    context = @{
        apiName = "User Management API"
        tone = "professional"
        audience = "developers"
    }
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/agents/task `
  -ContentType "application/json" `
  -Body $body
```

### Security Review
```powershell
$body = @{
    agentName = "PIKADON"
    task = "Review this API code for security vulnerabilities and improvements"
    context = @{
        code = "const app = require('express')()..."  # Paste code here
        severity = "high"
    }
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/agents/task `
  -ContentType "application/json" `
  -Body $body
```

## Understanding the Response

Each agent returns a response like:

```json
{
  "status": "SUCCESS",
  "outputs": {
    "code": "const express = require('express')...",
    "filePath": "/generated-output/api-server.js",
    "fileSize": 2048,
    "timestamp": "2026-05-13T10:30:45Z"
  },
  "duration": 1250
}
```

**Fields:**
- `status` - SUCCESS or ERROR
- `outputs.code` - The generated code/content
- `outputs.filePath` - Where the file was saved on disk
- `duration` - Execution time in milliseconds
- `timestamp` - When the task ran

## Viewing Generated Files

All agent output is saved to `/generated-output/`:

```powershell
# List all generated files
curl http://localhost:3000/api/generated-files

# Download a specific file
curl http://localhost:3000/api/generated-files/api-server.js
```

Or browse directly:
```
http://localhost:3000/api/generated-files
```

## Troubleshooting

### Port 3000 Already in Use

Check what's using the port:
```powershell
netstat -ano | findstr :3000
```

Either:
1. Stop the process using that port
2. Change the port in `backend/server-production.js` (look for `PORT = 3000`)
3. Use a different port when starting: `npm start -- --port 3001`

### Agents Show as Offline

SHADDAI can run with or without the actual agents. The system will:
- Still execute tasks using Claude API
- Save output to `/generated-output/`
- Work 95% the same way

To run actual agents, see [Agent Guide](AGENT_GUIDE.md).

### Getting "Command not found"

Make sure you're in the right directory:
```powershell
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
pwd  # Should show the SHADDAI directory
```

### npm install Fails

Try these steps:
```powershell
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock
Remove-Item -Recurse node_modules -ErrorAction Ignore
Remove-Item package-lock.json -ErrorAction Ignore

# Try again
npm install
```

## Next Steps

1. **Explore the API**: See [API Integration Guide](API_INTEGRATION_GUIDE.md)
2. **Run Real Agents**: See [Agent Guide](AGENT_GUIDE.md)
3. **Deploy to Production**: See [Deployment Guide](DEPLOYMENT.md)
4. **Monitor System**: See [Monitoring Guide](MONITORING.md)
5. **Handle Issues**: See [Troubleshooting Guide](TROUBLESHOOTING.md)

## Common Questions

**Q: Do I need the real agents running?**
A: No. SHADDAI works with the Claude API fallback. Real agents are optional but provide better performance.

**Q: Can I use this in production?**
A: Yes. See [Deployment Guide](DEPLOYMENT.md) for production setup.

**Q: How many agents can run in parallel?**
A: Up to 7 (one per agent type). System handles queuing automatically.

**Q: Where do generated files go?**
A: `/generated-output/` on disk AND returned in API responses.

**Q: Is there a rate limit?**
A: Yes, 100 requests/minute per IP by default. Configurable in `backend/server-production.js`.

---

**You're all set!** Start with the examples above, then explore the full [API Integration Guide](API_INTEGRATION_GUIDE.md).

Last Updated: 2026-05-13
