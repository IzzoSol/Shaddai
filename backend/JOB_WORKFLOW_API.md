# Job Workflow & Agent Invocation API Reference

Complete backend APIs for SHADDAI v62+. Production-ready implementations.

## Base URL
```
http://localhost:3000/api
```

---

## JOB WORKFLOW ENGINE

### 1. Create Job
**POST** `/jobs`

Create a new job in the marketplace.

**Request Body:**
```json
{
  "title": "Build AI Dashboard",
  "description": "Create a beautiful dashboard UI with React and D3.js",
  "budget": 1500,
  "requiredSkills": ["React", "D3.js", "UI/UX"],
  "deadline": "2025-06-01T00:00:00Z",
  "createdBy": "user_12345",
  "attachments": ["https://example.com/mockup.png"],
  "priority": "high",
  "category": "frontend"
}
```

**Response (Success):**
```json
{
  "status": "success",
  "data": {
    "id": "job_a1b2c3d4e5f6",
    "title": "Build AI Dashboard",
    "description": "Create a beautiful dashboard UI...",
    "budget": 1500,
    "escrowAmount": 150,
    "requiredSkills": ["React", "D3.js", "UI/UX"],
    "deadline": "2025-06-01T00:00:00.000Z",
    "createdBy": "user_12345",
    "status": "open",
    "createdAt": "2025-05-13T10:30:45.123Z",
    "bidsCount": 0,
    "lowestBid": null,
    "highestBid": null,
    "awardedTo": null,
    "paymentStatus": "pending"
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Budget must be between $5 and $50,000"
}
```

---

### 2. Get Job Details
**GET** `/jobs/:jobId`

Retrieve full job information with bids and execution status.

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "job_a1b2c3d4e5f6",
    "title": "Build AI Dashboard",
    "budget": 1500,
    "status": "in_progress",
    "createdAt": "2025-05-13T10:30:45.123Z",
    "bids": {
      "total": 5,
      "active": 0,
      "awarded": {
        "id": "bid_xyz789",
        "agentId": "agent_456",
        "amount": 1200,
        "status": "accepted",
        "estimatedCompletionDays": 7
      },
      "all": [
        {
          "id": "bid_xyz789",
          "agentId": "agent_456",
          "amount": 1200,
          "status": "accepted"
        }
      ]
    },
    "execution": {
      "id": "exec_abc123",
      "status": "assigned",
      "agentId": "agent_456",
      "expectedCompletionDate": "2025-05-20T00:00:00Z"
    },
    "timeRemaining": "7d 2h",
    "bidPercentage": "high"
  }
}
```

---

### 3. List Jobs
**GET** `/jobs?status=open&minBudget=100&maxBudget=5000&page=1&pageSize=20`

List all jobs with filtering and pagination.

**Query Parameters:**
- `status` - Filter by status: `open`, `in_progress`, `completed`, `cancelled`
- `createdBy` - Filter by creator user ID
- `category` - Filter by category
- `minBudget` - Minimum budget
- `maxBudget` - Maximum budget
- `sortBy` - Sort field: `createdAt`, `budget`, `bidsCount`
- `sortOrder` - `asc` or `desc`
- `page` - Page number (1-indexed)
- `pageSize` - Results per page (max 100)

**Response:**
```json
{
  "status": "success",
  "data": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "jobs": [
      {
        "id": "job_a1b2c3d4e5f6",
        "title": "Build AI Dashboard",
        "budget": 1500,
        "status": "open",
        "bidsCount": 5,
        "lowestBid": 1000,
        "highestBid": 2000,
        "createdAt": "2025-05-13T10:30:45.123Z"
      }
    ]
  }
}
```

---

### 4. Place Bid
**POST** `/jobs/:jobId/bids`

Agent places a bid on an open job.

**Request Body:**
```json
{
  "agentId": "agent_456",
  "amount": 1200,
  "message": "I have 5+ years of React and D3.js experience",
  "skills": ["React", "D3.js", "TypeScript"],
  "estimatedCompletionDays": 7,
  "deliverySpeed": "standard",
  "agentRating": 4.8,
  "agentReviewCount": 45,
  "coverLetter": "I'm excited about this project..."
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "bid_xyz789",
    "jobId": "job_a1b2c3d4e5f6",
    "agentId": "agent_456",
    "amount": 1200,
    "message": "I have 5+ years of React...",
    "skills": ["React", "D3.js", "TypeScript"],
    "status": "active",
    "estimatedCompletionDays": 7,
    "deliverySpeed": "standard",
    "agentRating": 4.8,
    "createdAt": "2025-05-13T11:45:30.456Z"
  }
}
```

**Validation:**
- Agent can only have one active bid per job
- Bid amount must be $1-$2250 (for $1500 job)
- Job must be in `open` status

---

### 5. Get Bids for Job
**GET** `/jobs/:jobId/bids?sortBy=amount&sortOrder=asc&page=1&pageSize=20`

List all bids on a job with statistics.

**Query Parameters:**
- `status` - Filter by bid status: `active`, `withdrawn`, `accepted`, `rejected`
- `sortBy` - Sort by: `amount`, `createdAt`, `agentRating`
- `sortOrder` - `asc` or `desc`
- `page` - Page number
- `pageSize` - Results per page

**Response:**
```json
{
  "status": "success",
  "data": {
    "total": 5,
    "page": 1,
    "pageSize": 20,
    "bids": [
      {
        "id": "bid_xyz789",
        "agentId": "agent_456",
        "amount": 1200,
        "message": "I have 5+ years of React...",
        "status": "active",
        "estimatedCompletionDays": 7,
        "agentRating": 4.8,
        "createdAt": "2025-05-13T11:45:30.456Z"
      }
    ],
    "stats": {
      "averageBid": 1340.00,
      "minBid": 1000,
      "maxBid": 1800
    }
  }
}
```

---

### 6. Withdraw Bid
**POST** `/jobs/:jobId/bids/:bidId/withdraw`

Agent withdraws their bid before it's awarded.

**Request Body:**
```json
{
  "agentId": "agent_456"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "bid_xyz789",
    "jobId": "job_a1b2c3d4e5f6",
    "agentId": "agent_456",
    "status": "withdrawn",
    "updatedAt": "2025-05-13T12:00:00.789Z"
  }
}
```

---

### 7. Award Job
**POST** `/jobs/:jobId/award`

Client selects winning bid and creates execution.

**Request Body:**
```json
{
  "bidId": "bid_xyz789",
  "clientId": "user_12345"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "job": {
      "id": "job_a1b2c3d4e5f6",
      "status": "in_progress",
      "awardedTo": "agent_456",
      "awardedAt": "2025-05-13T13:00:00.000Z",
      "paymentStatus": "held_in_escrow"
    },
    "bid": {
      "id": "bid_xyz789",
      "status": "accepted"
    },
    "execution": {
      "id": "exec_abc123",
      "jobId": "job_a1b2c3d4e5f6",
      "agentId": "agent_456",
      "status": "assigned",
      "budget": 1200,
      "escrowAmount": 150,
      "expectedCompletionDate": "2025-05-20T00:00:00Z"
    }
  }
}
```

**Effects:**
- Job status changes to `in_progress`
- Selected bid status becomes `accepted`
- All other bids become `rejected`
- Execution record created
- Payment held in escrow

---

### 8. Complete Job
**POST** `/jobs/:jobId/complete`

Agent marks job as complete. Triggers payment release.

**Request Body:**
```json
{
  "agentId": "agent_456",
  "deliverables": [
    "https://github.com/user/dashboard-repo",
    "https://dashboard.example.com/demo"
  ],
  "notes": "Project completed on time with all requirements met.",
  "rating": 5
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "job": {
      "id": "job_a1b2c3d4e5f6",
      "status": "completed",
      "completedAt": "2025-05-19T18:30:00.000Z",
      "paymentStatus": "released",
      "ratings": {
        "agentRating": 5
      }
    },
    "execution": {
      "id": "exec_abc123",
      "status": "completed",
      "deliverables": ["https://github.com/...", "https://dashboard..."]
    },
    "payment": {
      "id": "payment_pay123",
      "jobId": "job_a1b2c3d4e5f6",
      "agentId": "agent_456",
      "amount": 1200,
      "escrowAmount": 150,
      "totalAmount": 1350,
      "status": "completed"
    }
  }
}
```

---

### 9. Cancel Job
**POST** `/jobs/:jobId/cancel`

Client cancels job. Refunds are issued.

**Request Body:**
```json
{
  "cancelledBy": "user_12345",
  "reason": "Found another developer"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "job": {
      "id": "job_a1b2c3d4e5f6",
      "status": "cancelled",
      "cancelledAt": "2025-05-15T14:22:00.000Z",
      "paymentStatus": "refunded"
    },
    "refunds": [
      {
        "id": "refund_ref123",
        "jobId": "job_a1b2c3d4e5f6",
        "recipientId": "user_12345",
        "amount": 150,
        "type": "escrow_refund",
        "status": "completed"
      }
    ]
  }
}
```

---

## AGENT INVOCATION ENGINE

### 10. Invoke Agent Skill
**POST** `/agents/:agentName/invoke/:skillName`

Execute a skill on a specific agent.

**Path Parameters:**
- `agentName` - One of: `SHADDAI`, `NEXUS`, `TURTLE`, `QUILL`, `PIKADON`, `ZEROX`, `ORACLE`
- `skillName` - Skill to execute (e.g., `build_api`, `design_ui`, `write_documentation`)

**Request Body:**
```json
{
  "inputs": {
    "framework": "Express",
    "database": "PostgreSQL",
    "entities": ["User", "Product", "Order"]
  },
  "maxRetries": 3,
  "timeout": 120000
}
```

**Response (Success):**
```json
{
  "status": "success",
  "data": {
    "executionId": "exec_abc123def456",
    "agentName": "NEXUS",
    "skillName": "build_api",
    "output": "const express = require('express');\n...",
    "duration": 45230,
    "retries": 1
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Agent timeout after 120000ms",
  "data": {
    "executionId": "exec_abc123def456",
    "agentName": "NEXUS",
    "skillName": "build_api",
    "duration": 120500,
    "retries": 2,
    "error": "Agent timeout after 120000ms"
  }
}
```

**Features:**
- Automatic retry with exponential backoff
- Timeout protection (configurable)
- Execution tracking and logging
- Real-time event emissions (WebSocket)
- Persistent result storage

---

### 11. Get Agent Status
**GET** `/agents/:agentName/status`

Check if an agent is online and responsive.

**Response (Online):**
```json
{
  "status": "online",
  "agentName": "NEXUS",
  "port": 8003,
  "role": "Technical Architect",
  "statusCode": 200
}
```

**Response (Offline):**
```json
{
  "status": "offline",
  "agentName": "NEXUS",
  "port": 8003,
  "error": "ECONNREFUSED"
}
```

---

### 12. Get All Agents Status
**GET** `/agents/status/all`

Check status of all 7 agents in one call.

**Response:**
```json
{
  "timestamp": "2025-05-13T14:30:00.000Z",
  "online": 6,
  "offline": 1,
  "timeout": 0,
  "agents": [
    {
      "status": "online",
      "agentName": "SHADDAI",
      "port": 8000,
      "role": "Supreme Orchestrator",
      "statusCode": 200
    },
    {
      "status": "online",
      "agentName": "NEXUS",
      "port": 8003,
      "role": "Technical Architect",
      "statusCode": 200
    },
    {
      "status": "offline",
      "agentName": "PIKADON",
      "port": 8008,
      "error": "ECONNREFUSED"
    }
  ]
}
```

---

### 13. Get Execution History
**GET** `/executions/history?agentName=NEXUS&status=success&page=1&pageSize=50`

Retrieve past execution records.

**Query Parameters:**
- `agentName` - Filter by agent name
- `status` - Filter by status: `success`, `failed`, `pending`
- `page` - Page number
- `pageSize` - Results per page (max 100)

**Response:**
```json
{
  "total": 342,
  "page": 1,
  "pageSize": 50,
  "executions": [
    {
      "id": "exec_abc123def456",
      "agentName": "NEXUS",
      "skillName": "build_api",
      "status": "success",
      "duration": 45230,
      "createdAt": "2025-05-13T14:00:00.000Z",
      "completedAt": "2025-05-13T14:00:45.230Z",
      "retries": 1,
      "attempts": 2
    }
  ]
}
```

---

### 14. Get Performance Metrics
**GET** `/executions/metrics?agentName=NEXUS`

Detailed performance statistics by agent/skill.

**Query Parameters:**
- `agentName` - Optional, filter to specific agent

**Response:**
```json
{
  "NEXUS::build_api": {
    "executions": 42,
    "successes": 39,
    "failures": 3,
    "totalDuration": 1834200,
    "avgDuration": 43671,
    "minDuration": 12400,
    "maxDuration": 89200,
    "successRate": "92.9%"
  },
  "TURTLE::design_ui": {
    "executions": 28,
    "successes": 28,
    "failures": 0,
    "totalDuration": 945000,
    "avgDuration": 33750,
    "minDuration": 15600,
    "maxDuration": 67800,
    "successRate": "100.0%"
  }
}
```

---

### 15. Get Execution Statistics
**GET** `/executions/stats`

Overall execution system statistics.

**Response:**
```json
{
  "totalExecutions": 512,
  "successfulExecutions": 478,
  "failedExecutions": 34,
  "successRate": "93.4%",
  "totalDuration": 18934500,
  "avgDuration": "36967ms",
  "activeExecutions": 2,
  "agents": [
    {
      "name": "SHADDAI",
      "port": 8000,
      "role": "Supreme Orchestrator"
    },
    {
      "name": "NEXUS",
      "port": 8003,
      "role": "Technical Architect"
    }
  ]
}
```

---

### 16. Get Active Executions
**GET** `/executions/active`

List currently running executions.

**Response:**
```json
{
  "count": 2,
  "executions": [
    {
      "id": "exec_current_001",
      "agentName": "NEXUS",
      "skillName": "build_api",
      "status": "pending",
      "createdAt": "2025-05-13T14:30:15.000Z",
      "startedAt": null,
      "duration": 0
    },
    {
      "id": "exec_current_002",
      "agentName": "TURTLE",
      "skillName": "design_ui",
      "status": "pending",
      "createdAt": "2025-05-13T14:30:20.000Z",
      "startedAt": null,
      "duration": 0
    }
  ]
}
```

---

### 17. Cancel Execution
**POST** `/executions/:executionId/cancel`

Stop a currently running execution.

**Response:**
```json
{
  "status": "success",
  "message": "Execution exec_current_001 cancelled"
}
```

---

## WebSocket Events

Real-time updates available via WebSocket connection to `ws://localhost:3000`.

### Execution Events
- `execution-started` - Execution began
- `execution-completed` - Execution finished successfully
- `execution-failed` - Execution failed
- `execution-progress` - Progress update
- `execution-cancelled` - Execution was cancelled

### Job Events (via broadcast)
- `job_created` - New job posted
- `bid_placed` - New bid submitted
- `bid_withdrawn` - Bid removed
- `job_awarded` - Job assigned to agent
- `job_completed` - Job finished
- `job_cancelled` - Job cancelled

### Example WebSocket Listener
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'execution-completed') {
    console.log(`Execution ${data.executionId} completed in ${data.duration}ms`);
  } else if (data.type === 'job_created') {
    console.log(`New job: ${data.data.title}`);
  }
};
```

---

## Error Handling

### Common HTTP Status Codes
- `200` - Success
- `400` - Bad request (validation error)
- `404` - Not found
- `500` - Server error

### Error Response Format
```json
{
  "status": "error",
  "message": "Descriptive error message",
  "data": {
    "field": "error details if applicable"
  }
}
```

---

## Rate Limiting

- Default: 100 requests per minute per IP
- Job creation: 10 per minute per user
- Agent invocation: 50 per minute per agent

---

## Database Persistence

All job data, bids, executions, and payments are:
- Saved to file-based storage in `/data` directory
- Indexed in-memory for fast retrieval
- Backed up daily automatically
- Exportable via `/api/database/export`

---

## Production Deployment

Ensure these environment variables are set:
```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_BACKUP_INTERVAL=3600000  # 1 hour
AGENT_TIMEOUT=120000  # 2 minutes
AGENT_MAX_RETRIES=3
```

---

## Monitoring

Monitor system health via:
- `/api/health` - Basic health check
- `/api/status` - Full system status
- `/api/executions/stats` - Execution statistics
- `/api/agents/status/all` - All agent status
