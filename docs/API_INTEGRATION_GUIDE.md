# SHADDAI API Integration Guide

Complete guide for connecting the SHADDAI frontend to the backend and using all API endpoints.

## Frontend Configuration

### Base URL

The frontend should use this base URL for all API calls:

```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

Or in production:
```javascript
const API_BASE_URL = 'https://shaddai.example.com/api';
```

### Fetch Helper

Create a utility for API calls:

```javascript
// api-client.js
class APIClient {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Failed:', error);
      throw error;
    }
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

export const api = new APIClient();
```

---

## Core API Endpoints

### 1. Health Check

**Endpoint:**
```
GET /health
```

**Use Case:** Verify server is running

**Example:**
```javascript
const health = await api.get('/health');
console.log(health);
// {
//   status: "operational",
//   version: "61.0.0",
//   timestamp: "2026-05-13T10:30:00Z"
// }
```

---

### 2. System Status

**Endpoint:**
```
GET /status
```

**Use Case:** Get overall system status and stats

**Example:**
```javascript
const status = await api.get('/status');
// {
//   server: "running",
//   agents: [...],
//   executionStats: {...},
//   generatedFiles: 5
// }
```

---

### 3. List All Agents

**Endpoint:**
```
GET /agents
```

**Use Case:** Display available agents to user

**Example:**
```javascript
const { agents } = await api.get('/agents');
// [
//   { id: 'SHADDAI', name: 'SHADDAI', role: 'Supreme Orchestrator', status: 'online' },
//   { id: 'NEXUS', name: 'NEXUS', role: 'Technical Architect', status: 'online' },
//   ...
// ]
```

---

### 4. Get Agent Details

**Endpoint:**
```
GET /agents/:name
```

**Parameters:**
- `name` - Agent name (e.g., "NEXUS")

**Example:**
```javascript
const agent = await api.get('/agents/NEXUS');
// {
//   name: "NEXUS",
//   role: "Technical Architect",
//   status: "online",
//   stats: {
//     tasksCompleted: 42,
//     successRate: 95.2
//   },
//   recentExecutions: [...]
// }
```

---

### 5. Execute Agent Task (MAIN ENDPOINT)

**Endpoint:**
```
POST /agents/task
```

**Body:**
```json
{
  "agentName": "NEXUS",
  "task": "Build a REST API with authentication",
  "context": {
    "framework": "Express",
    "database": "PostgreSQL",
    "authType": "JWT"
  }
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "outputs": {
    "apiCode": "const express = require('express')...",
    "filePath": "/generated-output/api-server.js",
    "fileSize": 2048,
    "generated": true,
    "timestamp": "2026-05-13T10:30:45Z"
  },
  "duration": 1250
}
```

**Examples:**

**Example 1: NEXUS Build API**
```javascript
const result = await api.post('/agents/task', {
  agentName: 'NEXUS',
  task: 'Create a complete REST API for user management',
  context: {
    framework: 'Express',
    database: 'PostgreSQL',
    entities: ['User', 'Profile', 'Settings']
  }
});

if (result.status === 'SUCCESS') {
  console.log('API generated:', result.outputs.filePath);
}
```

**Example 2: TURTLE Design UI**
```javascript
const result = await api.post('/agents/task', {
  agentName: 'TURTLE',
  task: 'Design a modern dashboard with dark mode',
  context: {
    framework: 'React',
    theme: 'modern',
    brandColors: ['#6366f1', '#f97316']
  }
});
```

**Example 3: PIKADON Security Review**
```javascript
const result = await api.post('/agents/task', {
  agentName: 'PIKADON',
  task: 'Review this code for security vulnerabilities',
  context: {
    code: apiCode,  // Pass code to review
    severity: 'high'
  }
});
```

**Example 4: QUILL Write Documentation**
```javascript
const result = await api.post('/agents/task', {
  agentName: 'QUILL',
  task: 'Write comprehensive API documentation',
  context: {
    apiName: 'User Management API',
    tone: 'professional',
    audience: 'developers'
  }
});
```

---

### 6. List Skills

**Endpoint:**
```
GET /skills
```

**Use Case:** Show available skills for users to request

**Example:**
```javascript
const { skills } = await api.get('/skills');
// [
//   { id: 'nexus-build-api', name: 'Build API', ... },
//   { id: 'turtle-design-login', name: 'Design Login', ... },
//   ...
// ]
```

---

### 7. List Execution History

**Endpoint:**
```
GET /executions
GET /executions?agent=NEXUS&status=SUCCESS&limit=10
```

**Query Parameters:**
- `agent` - Filter by agent name
- `skill` - Filter by skill
- `status` - Filter by status (SUCCESS, ERROR)
- `limit` - Number of results (default: 50)

**Example:**
```javascript
const executions = await api.get('/executions?agent=NEXUS&limit=10');
// [
//   {
//     id: 'exec_123',
//     agent: 'NEXUS',
//     skill: 'task',
//     status: 'SUCCESS',
//     duration: 1250,
//     timestamp: '2026-05-13T10:30:45Z'
//   },
//   ...
// ]
```

---

### 8. Get Execution Details

**Endpoint:**
```
GET /executions/:id
```

**Example:**
```javascript
const execution = await api.get('/executions/exec_123');
// {
//   id: 'exec_123',
//   agent: 'NEXUS',
//   input: { task: '...', context: {...} },
//   output: { apiCode: '...', filePath: '...' },
//   status: 'SUCCESS',
//   duration: 1250,
//   timestamp: '2026-05-13T10:30:45Z'
// }
```

---

### 9. List Jobs

**Endpoint:**
```
GET /jobs
```

**Example:**
```javascript
const { jobs } = await api.get('/jobs');
// [
//   {
//     id: 'job_123',
//     title: 'Build Login Page',
//     description: 'Create a React login component',
//     targetAgents: ['TURTLE'],
//     reward: 100,
//     status: 'open',
//     bids: [...]
//   },
//   ...
// ]
```

---

### 10. Create Job

**Endpoint:**
```
POST /jobs
```

**Body:**
```json
{
  "title": "Build Admin Dashboard",
  "description": "Create a complete admin dashboard with user management",
  "targetAgents": ["TURTLE", "NEXUS"],
  "reward": 500
}
```

**Example:**
```javascript
const job = await api.post('/jobs', {
  title: 'Build Payment Integration',
  description: 'Integrate Stripe for billing',
  targetAgents: ['NEXUS'],
  reward: 250
});
```

---

### 11. List Generated Files

**Endpoint:**
```
GET /generated-files
```

**Example:**
```javascript
const { files } = await api.get('/generated-files');
// [
//   {
//     name: 'api-server.js',
//     size: 2048,
//     created: '2026-05-13T10:30:00Z',
//     modified: '2026-05-13T10:30:00Z'
//   },
//   ...
// ]
```

---

### 12. Download Generated File

**Endpoint:**
```
GET /generated-files/:name
```

**Example:**
```javascript
const file = await api.get('/generated-files/api-server.js');
// {
//   name: 'api-server.js',
//   content: 'const express = require('express')...'
// }

// Save to file
const element = document.createElement('a');
element.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(file.content);
element.download = file.name;
element.click();
```

---

### 13. Authentication Login

**Endpoint:**
```
POST /auth/login
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Example:**
```javascript
const result = await api.post('/auth/login', {
  email: 'user@example.com',
  password: 'password123'
});

if (result.success) {
  localStorage.setItem('authToken', result.token);
}
```

---

### 14. Authentication Logout

**Endpoint:**
```
POST /auth/logout
```

**Example:**
```javascript
await api.post('/auth/logout', {});
localStorage.removeItem('authToken');
```

---

### 15. Get Billing Tiers

**Endpoint:**
```
GET /billing/tiers
```

**Example:**
```javascript
const { tiers } = await api.get('/billing/tiers');
// [
//   { name: 'Free', price: 0, limits: {...} },
//   { name: 'Pro', price: 29, limits: {...} },
//   { name: 'Enterprise', price: 299, limits: {...} }
// ]
```

---

### 16. Subscribe to Tier

**Endpoint:**
```
POST /billing/subscribe
```

**Body:**
```json
{
  "userId": "user_123",
  "tier": "Pro"
}
```

**Example:**
```javascript
const subscription = await api.post('/billing/subscribe', {
  userId: currentUser.id,
  tier: 'Pro'
});

console.log('Subscription created:', subscription);
```

---

## Real-World Usage Example

Complete workflow for generating API and UI together:

```javascript
// 1. Start with NEXUS building API
const apiResult = await api.post('/agents/task', {
  agentName: 'NEXUS',
  task: 'Build REST API for user management',
  context: {
    framework: 'Express',
    database: 'PostgreSQL',
    entities: ['User', 'Profile', 'Auth']
  }
});

// 2. Have TURTLE design UI
const uiResult = await api.post('/agents/task', {
  agentName: 'TURTLE',
  task: 'Design user management dashboard',
  context: {
    framework: 'React',
    components: ['UserList', 'UserForm', 'Profile']
  }
});

// 3. Have PIKADON review security
const securityResult = await api.post('/agents/task', {
  agentName: 'PIKADON',
  task: 'Review API code for security',
  context: {
    code: apiResult.outputs.apiCode
  }
});

// 4. Have QUILL write docs
const docsResult = await api.post('/agents/task', {
  agentName: 'QUILL',
  task: 'Write complete API documentation',
  context: {
    apiCode: apiResult.outputs.apiCode,
    audience: 'developers'
  }
});

// 5. Have SHADDAI coordinate everything
const reportResult = await api.post('/agents/task', {
  agentName: 'SHADDAI',
  task: 'Create project coordination report',
  context: {
    components: ['API', 'UI', 'Security', 'Docs']
  }
});

// Display results
console.log('API:', apiResult.outputs.filePath);
console.log('UI:', uiResult.outputs.filePath);
console.log('Security:', securityResult.outputs.filePath);
console.log('Docs:', docsResult.outputs.filePath);
console.log('Report:', reportResult.outputs.filePath);
```

---

## Error Handling

```javascript
try {
  const result = await api.post('/agents/task', {
    agentName: 'NEXUS',
    task: 'Build API'
  });
  
  if (result.status === 'ERROR') {
    console.error('Agent error:', result.error);
  }
} catch (error) {
  console.error('API call failed:', error);
}
```

---

## WebSocket (Real-time Updates)

Coming in next phase - WebSocket support for live execution tracking.

---

## Rate Limiting

- Default: 100 requests/minute per IP
- Adjust in `security-hardening.js`

---

## CORS Configuration

Frontend can be on different domain. CORS is enabled for:
- `localhost:3000`
- `localhost:3001`
- Configure in `server-production.js`

---

## Testing Endpoints

### Using cURL (Command Line)

```bash
# Health check
curl http://localhost:3000/api/health

# List agents
curl http://localhost:3000/api/agents

# Execute task
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "task": "Build an API"
  }'

# Get executions
curl http://localhost:3000/api/executions?limit=10

# Get execution details
curl http://localhost:3000/api/executions/exec_123

# Download generated file
curl http://localhost:3000/api/generated-files/api-server.js
```

### Using JavaScript/Node.js

```javascript
// Simple fetch wrapper
async function callAPI(endpoint, options = {}) {
  const url = `http://localhost:3000/api${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Execute a task
async function executeTask() {
  const result = await callAPI('/agents/task', {
    method: 'POST',
    body: {
      agentName: 'NEXUS',
      task: 'Build a REST API',
      context: {
        framework: 'Express',
        database: 'PostgreSQL'
      }
    }
  });
  
  console.log('Task result:', result);
  return result;
}

// Run it
executeTask();
```

### Using Python

```python
import requests
import json

BASE_URL = 'http://localhost:3000/api'

def execute_task(agent_name, task, context=None):
    """Execute an agent task"""
    payload = {
        'agentName': agent_name,
        'task': task,
        'context': context or {}
    }
    
    response = requests.post(
        f'{BASE_URL}/agents/task',
        json=payload,
        headers={'Content-Type': 'application/json'}
    )
    
    if response.status_code != 200:
        raise Exception(f"API Error: {response.status_code} {response.text}")
    
    return response.json()

# Example usage
result = execute_task(
    agent_name='NEXUS',
    task='Build a REST API',
    context={
        'framework': 'Express',
        'database': 'PostgreSQL',
        'entities': ['User', 'Product']
    }
)

print(json.dumps(result, indent=2))
```

### Using Postman

1. Download Postman: https://www.postman.com/downloads/
2. Create new request:
   - Method: `POST`
   - URL: `http://localhost:3000/api/agents/task`
   - Headers: `Content-Type: application/json`
   - Body (JSON):
   ```json
   {
     "agentName": "NEXUS",
     "task": "Build an API",
     "context": {
       "framework": "Express"
     }
   }
   ```
3. Click Send

---

## Error Handling Best Practices

### Check Status Codes

```javascript
async function executeTask(agentName, task) {
  try {
    const response = await fetch('/api/agents/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, task, context: {} })
    });
    
    // Handle status codes
    if (response.status === 404) {
      throw new Error('Agent or endpoint not found');
    }
    if (response.status === 500) {
      throw new Error('Server error - check server logs');
    }
    if (response.status === 429) {
      throw new Error('Rate limited - wait before retrying');
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check response status
    if (data.status === 'ERROR') {
      throw new Error(`Task error: ${data.error}`);
    }
    
    return data;
  } catch (error) {
    console.error('Task failed:', error);
    // Handle error...
  }
}
```

### Retry on Failure

```javascript
async function executeWithRetry(agentName, task, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeTask(agentName, task);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retry attempt ${attempt}, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Handle Timeouts

```javascript
async function executeWithTimeout(agentName, task, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('/api/agents/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, task, context: {} }),
      signal: controller.signal
    });
    
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Task timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## Common API Patterns

### Check if Server is Running

```javascript
async function isServerRunning(url = 'http://localhost:3000') {
  try {
    const response = await fetch(`${url}/api/health`, { timeout: 5000 });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Poll for Task Completion

```javascript
async function waitForExecution(executionId, maxWaitMs = 120000) {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second
  
  while (Date.now() - startTime < maxWaitMs) {
    const execution = await fetch(`/api/executions/${executionId}`).then(r => r.json());
    
    if (execution.status === 'SUCCESS' || execution.status === 'ERROR') {
      return execution;
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Execution timeout after ${maxWaitMs}ms`);
}
```

### Batch Execute Multiple Tasks

```javascript
async function executeBatch(tasks) {
  const results = [];
  
  for (const { agentName, task, context } of tasks) {
    try {
      const result = await executeTask(agentName, task, context);
      results.push({ status: 'success', result });
    } catch (error) {
      results.push({ status: 'error', error: error.message });
    }
  }
  
  return results;
}

// Usage
const results = await executeBatch([
  { agentName: 'NEXUS', task: 'Build API' },
  { agentName: 'TURTLE', task: 'Design UI' },
  { agentName: 'QUILL', task: 'Write docs' }
]);
```

---

## Rate Limiting and Quotas

Default rate limiting: **100 requests/minute per IP**

To handle rate limiting:

```javascript
async function executeWithRateLimit(agentName, task) {
  const response = await fetch('/api/agents/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, task, context: {} })
  });
  
  // Check rate limit headers
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const resetTime = response.headers.get('X-RateLimit-Reset');
  
  if (response.status === 429) {
    const resetDate = new Date(parseInt(resetTime) * 1000);
    throw new Error(`Rate limited. Reset at ${resetDate}`);
  }
  
  console.log(`Requests remaining: ${remaining}`);
  return response.json();
}
```

---

## Monitoring API Usage

```javascript
async function getAPIStats() {
  const stats = {
    healthCheck: null,
    executions: null,
    agents: null
  };
  
  // Check health
  stats.healthCheck = await fetch('/api/health').then(r => r.json());
  
  // Check executions
  const executions = await fetch('/api/executions?limit=100').then(r => r.json());
  stats.executions = {
    total: executions.length,
    successful: executions.filter(e => e.status === 'SUCCESS').length,
    failed: executions.filter(e => e.status === 'ERROR').length
  };
  
  // Check agents
  const agents = await fetch('/api/agents').then(r => r.json());
  stats.agents = agents.map(a => ({
    name: a.name,
    status: a.status
  }));
  
  return stats;
}
```

---

## Next Steps

1. Review [Agent Guide](AGENT_GUIDE.md) for agent capabilities
2. See [Architecture Guide](ARCHITECTURE.md) for system design
3. Check [Deployment Guide](DEPLOYMENT.md) for production setup
4. Review [Monitoring Guide](MONITORING.md) for operational health
5. See [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues

---

**API Documentation v61.0 - 2026-05-13**
