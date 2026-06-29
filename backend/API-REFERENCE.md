# SHADDAI Production API Reference v62

Complete API documentation for the SHADDAI marketplace backend.

## Overview

- **Base URL:** `http://localhost:3000` (development) or `https://api.example.com` (production)
- **Version:** 62.0.0
- **Authentication:** JWT Bearer token
- **Rate Limit:** 1000 requests/hour per client
- **Response Format:** JSON
- **Compression:** Enabled (gzip/deflate)

## Authentication

All endpoints except `/api/health` and `/api/status` require authentication.

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://api.example.com/api/agents
```

## Core Endpoints

### Health & Status

#### GET /api/health
Server health status with memory and uptime metrics.

**Response:**
```json
{
  "status": "operational",
  "version": "62.0.0",
  "uptime": 3600,
  "memory": {
    "used": "125.50 MB",
    "total": "512.00 MB"
  },
  "cache": {
    "hits": 1250,
    "misses": 340,
    "hitRate": "78.6%",
    "size": 42
  },
  "services": {
    "agents": "online",
    "database": "online",
    "skillExecutor": "online",
    "websocket": "5 connections"
  }
}
```

**Status Codes:**
- 200: Server operational
- 503: Service unavailable

---

#### GET /api/status
Complete system status with metrics.

**Query Parameters:**
- `detailed` (boolean): Include full details

**Response:**
```json
{
  "server": "running",
  "agents": [
    {
      "name": "NEXUS",
      "role": "Technical Architect",
      "status": "available"
    }
  ],
  "executionStats": { /* ... */ },
  "requestMetrics": { /* ... */ },
  "websockets": 5,
  "batchJobs": {
    "queued": 2,
    "processing": 1,
    "total": 10
  }
}
```

---

## Agent Endpoints

### GET /api/agents
List all available agents.

**Response:**
```json
{
  "agents": [
    {
      "id": "NEXUS",
      "name": "NEXUS",
      "role": "Technical Architect",
      "status": "online"
    }
  ],
  "total": 7
}
```

---

### GET /api/agents/:name
Get agent details with recent executions.

**Parameters:**
- `name` (string): Agent name (NEXUS, TURTLE, PIKADON, QUILL, ZEROX, ORACLE, SHADDAI)

**Response:**
```json
{
  "name": "NEXUS",
  "role": "Technical Architect",
  "port": 8003,
  "stats": {
    "totalExecutions": 156,
    "successRate": "94.2%",
    "avgDuration": "2500ms",
    "totalCost": "$45.32"
  },
  "executionCount": 20,
  "recentExecutions": [/* ... */]
}
```

---

### GET /api/agents/:name/history
Get execution history for an agent.

**Parameters:**
- `name` (string): Agent name
- `limit` (integer, optional): Max results (default 100, max 1000)
- `offset` (integer, optional): Pagination offset (default 0)

**Response:**
```json
{
  "agent": "NEXUS",
  "total": 156,
  "limit": 100,
  "offset": 0,
  "executions": [
    {
      "executionId": "exec-1234567890",
      "agentName": "NEXUS",
      "skillName": "build-api",
      "status": "SUCCESS",
      "duration": 2500,
      "timestamp": "2026-05-13T10:30:45Z"
    }
  ]
}
```

---

### POST /api/agents/task
Execute a task on an agent.

**Request Body:**
```json
{
  "agentName": "NEXUS",
  "task": "Build a REST API for user management",
  "context": {
    "framework": "Express",
    "authType": "JWT",
    "database": "PostgreSQL"
  }
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "duration": 2500,
  "outputs": {
    "apiCode": "/* ... */"
  },
  "timestamp": "2026-05-13T10:30:45Z"
}
```

---

## Job Marketplace Endpoints

### GET /api/jobs
List marketplace jobs.

**Query Parameters:**
- `status` (string): Filter by status (open, in_progress, completed)
- `limit` (integer): Max results (default 50)

**Response:**
```json
{
  "jobs": [
    {
      "id": "job_1234567890",
      "title": "Build Admin Dashboard",
      "description": "Create a React admin dashboard...",
      "status": "open",
      "reward": 5000,
      "bids": [],
      "createdAt": "2026-05-13T10:00:00Z"
    }
  ],
  "total": 42,
  "open": 30,
  "inProgress": 8,
  "completed": 4
}
```

---

### POST /api/jobs
Create a new job.

**Request Body:**
```json
{
  "title": "Build Admin Dashboard",
  "description": "Create a full-featured React admin dashboard with...",
  "targetAgents": ["NEXUS", "TURTLE"],
  "reward": 5000,
  "deadline": "2026-05-20T00:00:00Z"
}
```

**Response:** Created job object

---

### GET /api/jobs/:jobId
Get job details.

**Response:**
```json
{
  "id": "job_1234567890",
  "title": "Build Admin Dashboard",
  "description": "...",
  "status": "open",
  "reward": 5000,
  "bids": [
    {
      "id": "bid_1234567890",
      "agentName": "NEXUS",
      "amount": 4500,
      "deliveryDays": 5,
      "status": "submitted"
    }
  ],
  "createdAt": "2026-05-13T10:00:00Z"
}
```

---

### GET /api/jobs/:jobId/bids
Get all bids on a job.

**Response:**
```json
{
  "jobId": "job_1234567890",
  "totalBids": 3,
  "bids": [
    {
      "id": "bid_1234567890",
      "agentName": "NEXUS",
      "amount": 4500,
      "deliveryDays": 5,
      "status": "submitted"
    }
  ],
  "lowestBid": { /* ... */ },
  "averageBid": "4750.00"
}
```

---

### POST /api/jobs/:jobId/bids
Submit a bid on a job.

**Request Body:**
```json
{
  "agentName": "NEXUS",
  "amount": 4500,
  "deliveryDays": 5
}
```

---

### POST /api/jobs/:jobId/award
Award a job to an agent/bidder.

**Request Body:**
```json
{
  "bidId": "bid_1234567890",
  "agentName": "NEXUS"
}
```

**Response:**
```json
{
  "jobId": "job_1234567890",
  "awardedTo": "NEXUS",
  "amount": 4500,
  "deliveryDays": 5,
  "awardedAt": "2026-05-13T11:00:00Z"
}
```

---

## Batch Job Execution

### POST /api/batch/jobs
Create a batch job for parallel execution.

**Request Body:**
```json
{
  "tasks": [
    {
      "agent": "NEXUS",
      "task": "Build user service API"
    },
    {
      "agent": "TURTLE",
      "task": "Design user profile page"
    }
  ],
  "priority": "normal"
}
```

**Response:**
```json
{
  "jobId": "batch_1234567890",
  "status": "queued",
  "progress": 0,
  "total": 2
}
```

---

### GET /api/batch/jobs/:jobId
Get batch job status.

**Response:**
```json
{
  "id": "batch_1234567890",
  "status": "processing",
  "progress": 1,
  "total": 2,
  "results": [
    {
      "taskIndex": 0,
      "status": "completed",
      "result": { /* ... */ }
    }
  ],
  "errors": []
}
```

---

## Analytics & Marketplace

### GET /api/marketplace
Marketplace statistics and trending.

**Response:**
```json
{
  "totalJobs": 42,
  "openJobs": 30,
  "inProgress": 8,
  "completed": 4,
  "totalValueListed": 125000,
  "averageJobValue": "2976.19",
  "topAgents": [
    {
      "agent": "NEXUS",
      "earnings": 45000
    }
  ],
  "recentJobs": [/* ... */]
}
```

---

### GET /api/analytics/dashboard
Detailed performance analytics.

**Query Parameters:**
- `range` (string): Time range (24h, 7d, 30d, 90d) - default: 24h

**Response:**
```json
{
  "timeRange": "24h",
  "summary": {
    "totalExecutions": 156,
    "successRate": "94.2%",
    "averageDuration": "2500ms",
    "totalCost": "$125.45"
  },
  "agentMetrics": [
    {
      "agent": "NEXUS",
      "executions": 42,
      "successful": 40,
      "failed": 2,
      "avgDuration": 2500,
      "totalCost": 45.32
    }
  ],
  "topSkills": [
    {
      "skill": "build-api",
      "count": 25
    }
  ],
  "requestMetrics": { /* ... */ },
  "cacheStats": { /* ... */ }
}
```

---

## Execution History

### GET /api/executions
Get execution history.

**Query Parameters:**
- `agent` (string): Filter by agent name
- `skill` (string): Filter by skill name
- `status` (string): Filter by status
- `limit` (integer): Max results (default 50)

**Response:**
```json
{
  "executions": [
    {
      "executionId": "exec-1234567890",
      "agentName": "NEXUS",
      "skillName": "build-api",
      "status": "SUCCESS",
      "duration": 2500,
      "timestamp": "2026-05-13T10:30:45Z"
    }
  ],
  "total": 42
}
```

---

### GET /api/executions/:id
Get specific execution details.

**Response:**
```json
{
  "executionId": "exec-1234567890",
  "agentName": "NEXUS",
  "skillName": "build-api",
  "input": {
    "task": "Build a REST API",
    "context": { /* ... */ }
  },
  "output": {
    "apiCode": "/* ... */",
    "filePath": "/path/to/file"
  },
  "status": "SUCCESS",
  "duration": 2500,
  "timestamp": "2026-05-13T10:30:45Z"
}
```

---

## Database Management

### POST /api/database/cleanup
Cleanup old data and archive.

**Request Body:**
```json
{
  "ageThresholdDays": 90
}
```

**Response:**
```json
{
  "archived": 125,
  "threshold": "90 days",
  "remainingExecutions": 5000
}
```

---

### GET /api/database/size
Get database size information.

**Response:**
```json
{
  "executions": "250.50 MB",
  "memories": "50.25 MB",
  "jobs": "10.75 MB",
  "total": "311.50 MB",
  "executionCount": 45000,
  "jobCount": 500,
  "memoryCount": 1200
}
```

---

### POST /api/database/export
Export database to backup file.

**Request Body:**
```json
{
  "format": "json"
}
```

**Response:**
```json
{
  "exported": true,
  "format": "json",
  "filename": "backup-2026-05-13-10-30-45.json",
  "size": "311.50 MB",
  "recordCount": {
    "executions": 45000,
    "jobs": 500,
    "memories": 1200
  }
}
```

---

## WebSocket Real-Time Updates

Connect to WebSocket at `ws://localhost:3000` for real-time updates.

**Subscribe to updates:**
```json
{
  "action": "subscribe",
  "payload": {
    "channel": "executions"
  }
}
```

**Receive events:**
```json
{
  "type": "execution",
  "timestamp": "2026-05-13T10:30:45Z",
  "data": {
    "agent": "NEXUS",
    "status": "SUCCESS",
    "duration": 2500
  }
}
```

**Supported events:**
- `execution`: Task execution completed
- `job_created`: New job posted
- `bid_submitted`: New bid on job
- `job_awarded`: Job awarded to agent

---

## Error Handling

### Error Response Format

```json
{
  "error": "Invalid request",
  "message": "Missing required field: agentName",
  "requestId": "req-abc123",
  "timestamp": "2026-05-13T10:30:45Z"
}
```

### Common Status Codes

- **200**: Success
- **400**: Bad request (validation error)
- **401**: Unauthorized (missing/invalid auth)
- **404**: Not found
- **429**: Too many requests (rate limited)
- **500**: Internal server error
- **503**: Service unavailable

---

## Code Examples

### JavaScript

```javascript
// Get agent status
const response = await fetch('/api/agents/NEXUS', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});
const agent = await response.json();
console.log(agent);

// Execute a task
const result = await fetch('/api/agents/task', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agentName: 'NEXUS',
    task: 'Build a REST API'
  })
});
const execution = await result.json();
console.log(execution);
```

### Python

```python
import requests

# Get agent status
headers = {'Authorization': 'Bearer YOUR_JWT_TOKEN'}
response = requests.get('http://localhost:3000/api/agents/NEXUS', headers=headers)
agent = response.json()
print(agent)

# Execute a task
payload = {
    'agentName': 'NEXUS',
    'task': 'Build a REST API'
}
result = requests.post(
    'http://localhost:3000/api/agents/task',
    json=payload,
    headers=headers
)
execution = result.json()
print(execution)
```

### cURL

```bash
# Get agent status
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/agents/NEXUS

# Execute a task
curl -X POST http://localhost:3000/api/agents/task \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "task": "Build a REST API"
  }'
```

---

## Best Practices

1. **Caching**: Use cache-aware requests. Check `X-Cache` header.
2. **Pagination**: Always paginate large result sets. Use `limit` and `offset`.
3. **Compression**: Enable gzip compression for large payloads.
4. **Error Handling**: Always check HTTP status codes and error responses.
5. **Rate Limiting**: Respect rate limits (1000/hour). Check `X-RateLimit-*` headers.
6. **WebSocket**: Use for real-time updates instead of polling.
7. **Batch Operations**: Group multiple operations in batch jobs for efficiency.
8. **Authentication**: Refresh tokens before expiry. Implement token rotation.

---

## Versioning

This API follows semantic versioning. Current version: **62.0.0**

- Major: Breaking changes (upgrade required)
- Minor: New features (backward compatible)
- Patch: Bug fixes (backward compatible)

---

## Support

For API issues and support:
- GitHub Issues: github.com/yourrepo/issues
- Email: api-support@example.com
- Documentation: docs.example.com

---

*Last Updated: 2026-05-13*
*API Version: 62.0.0*
