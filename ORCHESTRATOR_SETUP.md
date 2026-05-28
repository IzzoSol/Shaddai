# ORCHESTRATOR SETUP GUIDE

Quick reference for integrating the orchestrator into server-production.js

---

## WHERE TO ADD IT

In `/backend/server-production.js`:

### Step 1: Import at top (around line 28)

```javascript
// Job & Agent Systems
const JobWorkflowEngine = require('./job-workflow');
const AgentInvocationEngine = require('./agent-invocation');

// NEW: Add this line
const SHADDAIOrcherator = require('./shaddai-orchestrator');
```

### Step 2: Initialize after services (around line 339)

Find this section:
```javascript
// Services
const database = new DatabaseReal();
const skillExecutor = new SkillExecutorReal();
const authService = new AuthService();
const billingService = new BillingService();
const batchQueue = new BatchJobQueue(database);
const jobWorkflow = new JobWorkflowEngine(database);
const agentInvocation = new AgentInvocationEngine(database);
```

Add right after:
```javascript
// NEW: Initialize orchestrator with all services
const orchestrator = new SHADDAIOrcherator(app, server, wss, {
  database,
  jobWorkflow,
  agentInvocation,
  authService,
  billingService,
  skillExecutor,
  security,
  logger,
  cache,
  requestTracker
});

console.log('[SERVER] SHADDAI Orchestrator initialized');
```

### Step 3: Done!

That's it. The orchestrator will:
- Register all routes automatically
- Set up all event listeners
- Enable WebSocket broadcasting
- Start monitoring systems

---

## WHAT GETS ADDED

These routes are now available:

```
GET  /api/orchestrator/status
     → Returns orchestrator health + system info

GET  /api/orchestrator/workflows
     → Lists all active workflows

POST /api/jobs
     → Create new job (from job-workflow)

GET  /api/jobs/:jobId
     → Get job details

POST /api/jobs/:jobId/bids
     → Place bid on job

POST /api/jobs/:jobId/award
     → Award job to winning bid

POST /api/jobs/:jobId/execute
     → Start agent execution

GET  /api/jobs/:jobId/listen
     → Server-Sent Events listener for real-time updates

POST /api/jobs/:jobId/payment/release
     → Release escrow payment
```

---

## EVENTS EMITTED

The orchestrator emits these events for your own listeners:

```javascript
orchestrator.on('job-created', (data) => {
  // { jobId, title, budget }
});

orchestrator.on('bid-placed', (data) => {
  // { jobId, bidId, agentName, amount }
});

orchestrator.on('job-awarded', (data) => {
  // { jobId, bidId, agentName }
});

orchestrator.on('execution-started', (data) => {
  // { jobId, executionId, agentName }
});

orchestrator.on('execution-completed', (data) => {
  // { jobId, executionId, agentName, result, success }
});

orchestrator.on('broadcast', ({ type, data }) => {
  // Fired whenever a WebSocket broadcast happens
});
```

---

## TESTING

After updating server.js, test with:

```bash
# 1. Check orchestrator is running
curl http://localhost:3000/api/orchestrator/status

# 2. Create a job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write a blog post",
    "description": "5000 word article on AI",
    "budget": 100,
    "deadline": "2025-05-20T23:59:59Z",
    "createdBy": "user123"
  }'

# 3. Place a bid
curl -X POST http://localhost:3000/api/jobs/job_xxx/bids \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "amount": 80
  }'

# 4. Award job
curl -X POST http://localhost:3000/api/jobs/job_xxx/award \
  -H "Content-Type: application/json" \
  -d '{"bidId": "bid_xxx"}'

# 5. Execute
curl -X POST http://localhost:3000/api/jobs/job_xxx/execute \
  -H "Content-Type: application/json" \
  -d '{"skillName": "write_blog", "inputs": {}}'

# 6. Monitor workflow
curl http://localhost:3000/api/orchestrator/workflows
```

---

## FRONTEND INTEGRATION

In `/frontend/dashboard-workflows.js`, add this to start listening for real-time updates:

```javascript
// Listen for real-time job updates (SSE)
async function subscribeToJobUpdates(jobId) {
  try {
    const response = await fetch(`http://localhost:3000/api/jobs/${jobId}/listen`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleJobUpdate(data);
          } catch (e) {
            console.error('Failed to parse job update:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Job subscription failed:', error);
  }
}

// Handle incoming updates
function handleJobUpdate(update) {
  const { type, data, timestamp } = update;
  
  console.log(`[${timestamp}] ${type}:`, data);
  
  switch (type) {
    case 'job_created':
      console.log('Job created:', data);
      break;
    case 'bid_placed':
      console.log('New bid:', data);
      break;
    case 'job_awarded':
      console.log('Job awarded:', data);
      break;
    case 'execution_started':
      console.log('Execution started:', data);
      break;
    case 'execution_completed':
      console.log('Execution completed:', data);
      updateJobStatus(data.jobId, 'completed');
      break;
    case 'payment_released':
      console.log('Payment released:', data);
      break;
  }
}
```

---

## DEBUGGING

If something breaks:

### Check orchestrator status
```bash
curl http://localhost:3000/api/orchestrator/status
```

Should show:
```json
{
  "status": "operational",
  "systems": {
    "activeWorkflows": 0,
    "websockets": 0,
    "jobWorkflow": true,
    "agentInvocation": true,
    "database": true,
    "billing": true
  }
}
```

### Check active workflows
```bash
curl http://localhost:3000/api/orchestrator/workflows
```

### Check server logs
```bash
tail -f backend/logs/$(date +%Y-%m-%d).log
```

### Check database directly
```javascript
// In node repl
const DatabaseReal = require('./backend/database-real');
const db = new DatabaseReal();
console.log(db.queryJobs({ limit: 10 }));
```

---

## TROUBLESHOOTING

**Problem:** "SHADDAIOrcherator is not a function"
- Solution: Check require path is correct: `require('./shaddai-orchestrator')`

**Problem:** "Cannot read property 'on' of undefined"
- Solution: Check jobWorkflow and agentInvocation are initialized before orchestrator

**Problem:** WebSocket not connecting
- Solution: Check `wss` is passed to orchestrator, ensure client connects to same server

**Problem:** Routes 404ing
- Solution: Check orchestrator is initialized AFTER app is created but BEFORE listen()

**Problem:** Database queries failing
- Solution: Verify database instance is live: `orchestrator.database.queryJobs()`

---

## THAT'S IT!

The orchestrator handles everything else:
- Routes requests to the right handlers
- Emits events for all state changes
- Broadcasts updates to connected clients
- Manages payment flows
- Coordinates with all 7 agents
- Logs everything for audit trail

**Next:** Have agents test the full flow end-to-end with Postman.
