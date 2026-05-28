# Quick Start - Job Workflow & Agent Invocation

Get the new backend systems running in minutes.

---

## 1. Start the Server

```powershell
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
npm start
```

**Expected output:**
```
[INFO] [SERVER] SHADDAI Production Server v62 started on port 3000
  REST API: http://localhost:3000/api
  WebSocket: ws://localhost:3000
```

---

## 2. Test Job Workflow (3 minutes)

### Create a Job
```powershell
$body = @{
    title = "Build React Dashboard"
    description = "Create a beautiful analytics dashboard with React and D3.js"
    budget = 2500
    requiredSkills = @("React", "D3.js", "TypeScript")
    deadline = "2025-06-15T00:00:00Z"
    createdBy = "client_user_123"
    priority = "high"
} | ConvertTo-Json

curl.exe -X POST http://localhost:3000/api/jobs `
  -H "Content-Type: application/json" `
  -d $body
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "job_abc123def456",
    "title": "Build React Dashboard",
    "budget": 2500,
    "escrowAmount": 250,
    "status": "open",
    "createdAt": "2025-05-13T14:30:00.000Z"
  }
}
```

**Save the job ID:** `job_abc123def456`

### Place a Bid
```powershell
$jobId = "job_abc123def456"
$bidBody = @{
    agentId = "agent_expert_001"
    amount = 2200
    message = "Senior React developer with 8+ years experience. I've built similar dashboards."
    estimatedCompletionDays = 5
    deliverySpeed = "fast"
    agentRating = 4.9
    agentReviewCount = 87
} | ConvertTo-Json

curl.exe -X POST "http://localhost:3000/api/jobs/$jobId/bids" `
  -H "Content-Type: application/json" `
  -d $bidBody
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "bid_xyz789abc",
    "jobId": "job_abc123def456",
    "agentId": "agent_expert_001",
    "amount": 2200,
    "status": "active",
    "createdAt": "2025-05-13T14:35:00.000Z"
  }
}
```

**Save the bid ID:** `bid_xyz789abc`

### Get All Bids
```powershell
$jobId = "job_abc123def456"
curl.exe "http://localhost:3000/api/jobs/$jobId/bids?sortBy=amount&sortOrder=asc"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "total": 1,
    "bids": [
      {
        "id": "bid_xyz789abc",
        "agentId": "agent_expert_001",
        "amount": 2200,
        "status": "active",
        "agentRating": 4.9
      }
    ],
    "stats": {
      "averageBid": 2200,
      "minBid": 2200,
      "maxBid": 2200
    }
  }
}
```

### Award Job to Agent
```powershell
$jobId = "job_abc123def456"
$bidId = "bid_xyz789abc"
$awardBody = @{
    bidId = $bidId
    clientId = "client_user_123"
} | ConvertTo-Json

curl.exe -X POST "http://localhost:3000/api/jobs/$jobId/award" `
  -H "Content-Type: application/json" `
  -d $awardBody
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "job": {
      "id": "job_abc123def456",
      "status": "in_progress",
      "awardedTo": "agent_expert_001",
      "paymentStatus": "held_in_escrow"
    },
    "execution": {
      "id": "exec_xyz123",
      "status": "assigned",
      "expectedCompletionDate": "2025-05-18T00:00:00Z"
    }
  }
}
```

### Complete Job
```powershell
$jobId = "job_abc123def456"
$completeBody = @{
    agentId = "agent_expert_001"
    deliverables = @(
        "https://github.com/agent/dashboard-repo",
        "https://dashboard.example.com"
    )
    notes = "Dashboard completed with all requirements met. Delivered 2 days early."
    rating = 5
} | ConvertTo-Json

curl.exe -X POST "http://localhost:3000/api/jobs/$jobId/complete" `
  -H "Content-Type: application/json" `
  -d $completeBody
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "job": {
      "id": "job_abc123def456",
      "status": "completed",
      "paymentStatus": "released",
      "ratings": {
        "agentRating": 5
      }
    },
    "payment": {
      "id": "payment_pay123",
      "amount": 2200,
      "escrowAmount": 250,
      "totalAmount": 2450,
      "status": "completed"
    }
  }
}
```

---

## 3. Test Agent Invocation (requires agents)

### Start 7 Agents (PowerShell, separate terminals)

**Terminal 1: SHADDAI (port 8000)**
```powershell
$env:AGENT_NAME="SHADDAI"; $env:PORT=8000; node agent-server.js
```

**Terminal 2: NEXUS (port 8003)**
```powershell
$env:AGENT_NAME="NEXUS"; $env:PORT=8003; node agent-server.js
```

**Terminal 3: TURTLE (port 8004)**
```powershell
$env:AGENT_NAME="TURTLE"; $env:PORT=8004; node agent-server.js
```

*Continue for ZEROX (8001), ORACLE (8002), QUILL (8005), PIKADON (8008)*

### Check Agent Status
```powershell
curl.exe http://localhost:3000/api/agents/status/all | jq .
```

**Response:**
```json
{
  "timestamp": "2025-05-13T14:45:00.000Z",
  "online": 7,
  "offline": 0,
  "timeout": 0,
  "agents": [
    {
      "status": "online",
      "agentName": "SHADDAI",
      "port": 8000,
      "statusCode": 200
    },
    {
      "status": "online",
      "agentName": "NEXUS",
      "port": 8003,
      "statusCode": 200
    }
  ]
}
```

### Invoke Agent Skill
```powershell
$invokeBody = @{
    inputs = @{
        framework = "Express"
        database = "PostgreSQL"
        entities = @("User", "Product", "Order")
    }
    maxRetries = 3
    timeout = 120000
} | ConvertTo-Json

curl.exe -X POST http://localhost:3000/api/agents/NEXUS/invoke/build_api `
  -H "Content-Type: application/json" `
  -d $invokeBody
```

**Response (streaming):**
```json
{
  "status": "success",
  "data": {
    "executionId": "exec_abc123def456",
    "agentName": "NEXUS",
    "skillName": "build_api",
    "output": "const express = require('express');\nconst app = express();\n...",
    "duration": 45230,
    "retries": 0
  }
}
```

### Check Execution Stats
```powershell
curl.exe http://localhost:3000/api/executions/stats | jq .
```

**Response:**
```json
{
  "totalExecutions": 5,
  "successfulExecutions": 5,
  "failedExecutions": 0,
  "successRate": "100.0%",
  "totalDuration": 218450,
  "avgDuration": "43690ms",
  "activeExecutions": 0
}
```

### Get Execution History
```powershell
curl.exe "http://localhost:3000/api/executions/history?agentName=NEXUS&page=1&pageSize=10" | jq .
```

**Response:**
```json
{
  "total": 3,
  "page": 1,
  "pageSize": 10,
  "executions": [
    {
      "id": "exec_abc123def456",
      "agentName": "NEXUS",
      "skillName": "build_api",
      "status": "success",
      "duration": 45230,
      "createdAt": "2025-05-13T14:50:00.000Z",
      "completedAt": "2025-05-13T14:50:45.230Z"
    }
  ]
}
```

---

## 4. Monitor in Real-Time

### Check Active Executions
```powershell
curl.exe http://localhost:3000/api/executions/active | jq .
```

### View Performance Metrics
```powershell
curl.exe http://localhost:3000/api/executions/metrics | jq .
```

### Watch Job Status
```powershell
$jobId = "job_abc123def456"
curl.exe "http://localhost:3000/api/jobs/$jobId" | jq .
```

---

## 5. View Generated Files

### Job Audit Log
```powershell
type C:\Users\Brittany\SHADDAI-FINAL-BUILD\generated-output\audit\job-audit.log
```

**Output:**
```
{"event":"JOB_CREATED","jobId":"job_abc123def456","userId":"client_user_123",...}
{"event":"BID_PLACED","jobId":"job_abc123def456","userId":"agent_expert_001",...}
{"event":"JOB_AWARDED","jobId":"job_abc123def456","userId":"agent_expert_001",...}
{"event":"JOB_COMPLETED","jobId":"job_abc123def456","userId":"agent_expert_001",...}
```

### Agent Execution Output
```powershell
ls C:\Users\Brittany\SHADDAI-FINAL-BUILD\generated-output\agent-outputs\NEXUS\
```

### Agent Logs
```powershell
type C:\Users\Brittany\SHADDAI-FINAL-BUILD\backend\agent-logs\NEXUS-2025-05-13.log
```

---

## 6. Full Workflow Summary

**Complete Job Lifecycle (5-10 minutes):**

1. ✅ **Create Job** - Client posts job with budget & requirements
2. ✅ **Place Bid** - Agent bids with estimate & price
3. ✅ **Award Job** - Client selects best bid
4. ✅ **Execute** - Agent works on job
5. ✅ **Complete** - Agent submits deliverables
6. ✅ **Payment** - Escrow released to agent
7. ✅ **Rating** - Client rates agent

**Full Agent Invocation Lifecycle (45-120 seconds):**

1. ✅ **Invoke Skill** - POST to `/api/agents/AGENT/invoke/skill`
2. ✅ **Retry Loop** - Auto-retry with backoff
3. ✅ **Execution** - Real agent processes task
4. ✅ **Output** - Result saved to file + DB
5. ✅ **History** - Accessible via `/api/executions/history`
6. ✅ **Metrics** - Performance tracked

---

## API Reference Quick Links

- **Job Workflow API** - See `backend/JOB_WORKFLOW_API.md`
- **Integration Guide** - See `backend/INTEGRATION_GUIDE.md`
- **Implementation Summary** - See `backend/IMPLEMENTATION_SUMMARY.md`

---

## Troubleshooting

### Port Already in Use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process
taskkill /PID <PID> /F
```

### Agent Connection Refused
```powershell
# Check if agent is running on correct port
curl http://localhost:8003/health

# If not, start the agent:
$env:AGENT_NAME="NEXUS"; $env:PORT=8003; node agent-server.js
```

### JSON Parse Error
```powershell
# Use -D flag with curl to see full response
curl.exe -D http://localhost:3000/api/jobs

# Or pipe to jq for parsing
curl.exe http://localhost:3000/api/jobs | jq .
```

---

## Next Steps

1. ✅ **Run this Quick Start** - Test both systems end-to-end
2. ✅ **Read API Reference** - Understand all 17 endpoints
3. ✅ **Run Integration Tests** - Verify database methods exist
4. ✅ **Deploy to Production** - Follow deployment checklist
5. ✅ **Monitor Performance** - Track execution metrics

---

**Ready to ship. No mock data. Production-grade code.**

NEXUS - Technical Architect
SHADDAI v62
