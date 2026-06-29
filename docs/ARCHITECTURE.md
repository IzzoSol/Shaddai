# SHADDAI System Architecture

Complete technical overview of SHADDAI v61 architecture, components, and data flow.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE LAYER                         │
│  Frontend (React) - Dashboard, Job Posting, Monitoring          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────▼────────────────────┐
        │      REST API LAYER (Express)        │
        │      Port 3000                       │
        ├──────────────────────────────────────┤
        │ • Request Validation                │
        │ • Authentication (JWT)              │
        │ • Rate Limiting                     │
        │ • CORS Handling                     │
        └─────────────────┬────────────────────┘
                          │
        ┌─────────────────▼──────────────────────────────┐
        │    ORCHESTRATION & COORDINATION LAYER          │
        ├──────────────────────────────────────────────┤
        │ ┌─────────────────────────────────────────┐  │
        │ │  Skill Orchestrator                     │  │
        │ │  • Routes tasks to agents              │  │
        │ │  • Manages execution queue             │  │
        │ │  • Handles failures & retries          │  │
        │ └─────────────────────────────────────────┘  │
        │                                              │
        │ ┌─────────────────────────────────────────┐  │
        │ │  Skill Executor (Real)                 │  │
        │ │  • HTTP calls to live agents           │  │
        │ │  • Timeout handling                    │  │
        │ │  • Response parsing                    │  │
        │ └─────────────────────────────────────────┘  │
        │                                              │
        │ ┌─────────────────────────────────────────┐  │
        │ │  Skill Router                          │  │
        │ │  • Intelligent task routing            │  │
        │ │  • Agent selection logic               │  │
        │ │  • Load balancing                      │  │
        │ └─────────────────────────────────────────┘  │
        └─────────────────┬──────────────────────────────┘
                          │
        ┌─────────────────▼───────────────────────────────────┐
        │         AGENT EXECUTION LAYER                        │
        ├────────────────────────────────────────────────────┤
        │  SHADDAI (8000) ◄─ Strategy & Coordination        │
        │  NEXUS (8003)   ◄─ Backend & APIs                 │
        │  TURTLE (8004)  ◄─ Design & UI/UX                │
        │  QUILL (8005)   ◄─ Writing & Docs                │
        │  PIKADON (8008) ◄─ Security & Compliance         │
        │  ZEROX (8001)   ◄─ Billing & Business            │
        │  ORACLE (8002)  ◄─ Research & Intelligence       │
        └────────────────────────────────────────────────────┘
                          │
        ┌─────────────────▼────────────────────┐
        │    PERSISTENCE & STORAGE LAYER       │
        ├──────────────────────────────────────┤
        │ • DatabaseReal (In-memory + File)   │
        │ • Execution History                 │
        │ • Skill Metrics & Performance       │
        │ • Generated Files Storage           │
        └──────────────────────────────────────┘
```

## Component Details

### 1. Frontend Layer (React)

**Location:** `public/index.html` (1.6 MB single file)

**Responsibilities:**
- Dashboard UI with multi-theme support
- Agent management interface
- Job posting and bidding system
- Real-time execution monitoring
- Generated files viewer
- User authentication

**Key Features:**
- Tab-based navigation
- Dark/Light theme support
- Live execution tracking
- File generation and download

### 2. REST API Layer

**Location:** `backend/server-production.js`

**Framework:** Express.js

**Key Endpoints:**

```
Health & Status
  GET  /api/health            ← Liveness probe
  GET  /api/status            ← System status

Agent Management
  GET  /api/agents            ← List all agents
  GET  /api/agents/:name      ← Agent details
  POST /api/agents/task       ← Execute task

Skills
  GET  /api/skills            ← Available skills
  GET  /api/skills/:id        ← Skill details

Execution History
  GET  /api/executions        ← List all executions
  GET  /api/executions/:id    ← Execution details
  GET  /api/executions?agent=NAME&limit=10

Jobs
  GET  /api/jobs              ← List jobs
  POST /api/jobs              ← Create job
  GET  /api/jobs/:id          ← Job details

Files
  GET  /api/generated-files   ← List generated files
  GET  /api/generated-files/:name ← Download file

Auth
  POST /api/auth/login        ← User login
  POST /api/auth/logout       ← User logout

Billing
  GET  /api/billing/tiers     ← Pricing tiers
  POST /api/billing/subscribe ← Subscribe to tier
```

### 3. Orchestration Layer

#### Skill Orchestrator
**Location:** `backend/skill-orchestrator.js`

**Responsibilities:**
- Receives task requests from API
- Validates input parameters
- Routes to appropriate agent
- Manages execution queue
- Tracks execution metrics
- Handles retry logic

**Flow:**
```
Request → Validation → Routing → Execution → Persistence → Response
```

#### Skill Executor (Real)
**Location:** `backend/skill-executor-real.js`

**Responsibilities:**
- Makes HTTP calls to real agents
- Handles timeouts (default: 60s)
- Parses agent responses
- Error handling and logging
- Response transformation

**HTTP Call Pattern:**
```
POST http://localhost:8003/api/execute
{
  "task": "Build a REST API",
  "context": {...}
}
```

#### Skill Router
**Location:** `backend/skill-bridge.js`

**Responsibilities:**
- Intelligent agent selection
- Load balancing across agents
- Skill → Agent mapping
- Context preparation
- Request deduplication

**Routing Logic:**
```javascript
// Simplified routing logic
if (task.includes("API") || task.includes("backend")) {
  return "NEXUS";
}
if (task.includes("UI") || task.includes("design")) {
  return "TURTLE";
}
if (task.includes("doc") || task.includes("write")) {
  return "QUILL";
}
// etc...
```

### 4. Agent Execution Layer

All agents run as separate processes on dedicated ports:

| Agent | Port | Language | Primary Skills |
|-------|------|----------|---|
| SHADDAI | 8000 | Python/Claude | Strategy, Coordination, Decision-making |
| ZEROX | 8001 | Python/Claude | Billing, Pricing, Revenue modeling |
| ORACLE | 8002 | Python/Claude | Research, Data analysis, Insights |
| NEXUS | 8003 | Python/Claude | APIs, Backend, Infrastructure |
| TURTLE | 8004 | Python/Claude | UI Design, Components, UX |
| QUILL | 8005 | Python/Claude | Writing, Docs, Communication |
| PIKADON | 8008 | Python/Claude | Security, Compliance, Audits |

**Agent Communication:**
- HTTP endpoints on respective ports
- JSON request/response format
- 60-second timeout per request
- Automatic retry on failure

### 5. Database Layer

**Location:** `backend/database-real.js`

**Data Stores:**
```
In-Memory + File-Based Persistence
├── Executions (all task runs)
├── Skill Metrics (performance data)
├── Agent Performance Stats
├── Job History
├── Generated Files Index
└── User Sessions (auth)
```

**Storage Locations:**
- `/generated-output/` - Agent-generated files
- `./data/executions.json` - Execution history
- `./data/metrics.json` - Performance metrics
- `./data/cache.json` - Skill optimization cache

## Data Flow

### Task Execution Flow

```
1. User Request
   POST /api/agents/task
   {
     "agentName": "NEXUS",
     "task": "Build API",
     "context": {...}
   }
   ↓
2. API Validation
   • Validate agentName exists
   • Validate task is not empty
   • Validate context structure
   ↓
3. Skill Orchestration
   • Create execution ID
   • Add to execution queue
   • Log start time
   ↓
4. Agent Routing
   • Determine agent (already specified)
   • Prepare request payload
   • Check agent availability
   ↓
5. HTTP Execution
   POST http://localhost:8003/api/execute
   • Send request to NEXUS
   • Wait for response (timeout: 60s)
   • Handle errors/timeouts
   ↓
6. Response Processing
   • Parse JSON response
   • Extract code/output
   • Generate file on disk
   ↓
7. Persistence
   • Save execution record
   • Update skill metrics
   • Cache optimization data
   ↓
8. Client Response
   {
     "status": "SUCCESS",
     "outputs": {
       "code": "...",
       "filePath": "/generated-output/api.js",
       "timestamp": "2026-05-13T10:30:45Z"
     }
   }
```

### Parallel Execution

Multiple agents can run in parallel:

```
Time
 ↑
 │  Task A (NEXUS)    ████████████
 │  Task B (TURTLE)          ████████
 │  Task C (PIKADON)               ████
 │
 └────────────────────────────────────►
```

System queues requests and executes up to 7 concurrently (one per agent).

## Performance Characteristics

### Request Timing

```
Total Execution Time = Overhead + Agent Time + I/O

Overhead:           ~50ms (validation, routing)
Agent Time:         5-60s (depends on task complexity)
I/O:                ~100ms (file write, database)
────────────────────────────
Total:              ~5-61s (typical)
```

### Throughput

- **Sequential Requests:** 1 request per agent per execution
- **Parallel Requests:** Up to 7 concurrent (1 per agent)
- **Sustained Throughput:** ~10-20 tasks/minute with 7 agents

### Memory Usage

```
Base:               ~100 MB
Per Execution:      ~10-50 MB (depends on output size)
Cache:              ~100-500 MB (optimization data)
Total (typical):    ~300-1000 MB
```

### Storage

```
Generated Files:    Varies (typically 1-10 MB per file)
Execution History:  ~1 KB per execution
Metrics:            ~100 KB
Total (1000 execs): ~5-15 GB (depends on file size)
```

## Security Architecture

### Input Validation
- Request body size limit: 1 MB
- Task length limit: 10,000 characters
- Context depth limit: 5 levels
- Allowed fields only

### Authentication
- Optional JWT support
- Token stored in localStorage
- Verified on protected endpoints
- 24-hour token expiration

### Rate Limiting
- 100 requests/minute per IP
- Burst allowance: +20 requests
- Cooldown: 1 minute

### CORS
- Configured for localhost:3000/3001
- Specific methods: GET, POST, PUT, DELETE
- Credentials: allowed
- Headers: Content-Type, Authorization

### Code Isolation
- Agents run in separate processes
- Network isolation (localhost only)
- No direct file system access from agents
- Output validated before storage

## Deployment Architecture

### Development
```
Laptop
├── Express Server (port 3000)
├── Frontend (localhost:3000)
├── 7 Agent Processes (8000-8008)
└── File storage (./generated-output)
```

### Production
```
Server
├── Reverse Proxy (nginx)
│   └── HTTPS/TLS termination
├── Express Server (port 3000, internal)
│   ├── PM2 process manager
│   └── Auto-restart on crash
├── Agent Processes (ports 8000-8008, internal)
└── File Storage (persistent volume)
```

## Integration Points

### External APIs
- Claude API (agent fallback)
- Future: Stripe (billing)
- Future: Auth0 (authentication)

### Data Export
- Generated files (downloadable)
- Execution history (exportable)
- Metrics (queryable via API)

## Monitoring & Observability

### Logs
- Server logs: `console.log` → stdout
- Access logs: HTTP requests
- Execution logs: Per task
- Error logs: Failures and exceptions

### Metrics
- Response times
- Success rates
- Agent utilization
- Error counts by type

### Health Checks
```
GET /api/health  - Returns operational status
GET /api/status  - Returns detailed system stats
```

## File Organization

```
SHADDAI-FINAL-BUILD/
├── public/
│   └── index.html           (Frontend - 1.6 MB)
├── backend/
│   ├── server-production.js (Main server)
│   ├── skill-executor-real.js
│   ├── skill-orchestrator.js
│   ├── skill-router.js
│   ├── skill-bridge.js
│   ├── database-real.js
│   ├── background-jobs.js
│   ├── auth-service.js
│   ├── billing-service.js
│   ├── security-hardening.js
│   ├── agents/
│   │   └── agent-definitions.js
│   └── skills/
│       └── skill-library.js
├── generated-output/        (Agent output)
├── docs/                    (Documentation)
├── data/
│   ├── executions.json
│   ├── metrics.json
│   └── cache.json
├── package.json
└── README.md
```

## Design Patterns Used

### Observer Pattern
- Execution tracking system notifies on completion

### Factory Pattern
- Agent creation and initialization

### Strategy Pattern
- Different agent execution strategies

### Repository Pattern
- DatabaseReal abstracts data access

### Decorator Pattern
- Security hardening wraps Express middleware

---

**For deployment details, see [Deployment Guide](DEPLOYMENT.md)**

**For API details, see [API Integration Guide](API_INTEGRATION_GUIDE.md)**

Last Updated: 2026-05-13
