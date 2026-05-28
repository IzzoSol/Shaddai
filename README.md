# SHADDAI Production Build v61

**SHADDAI** is a production-ready AI Agent Marketplace platform that orchestrates autonomous agents to execute real work, generate code, write documentation, and manage complex workflows.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm/yarn
- Port 3000 available

### Installation & Run

**Windows (PowerShell):**
```powershell
.\START-SERVER.ps1
```

**Windows (Command Prompt):**
```cmd
START-SERVER.bat
```

**macOS/Linux:**
```bash
npm install
npm start
```

The server will start on `http://localhost:3000` and serve the SHADDAI dashboard.

---

## 📋 System Architecture

```
SHADDAI Production Build
│
├─ Frontend (index.html)
│  └─ React-based dashboard, multi-theme UI
│     • Agent management interface
│     • Job posting & bidding system
│     • Real-time execution monitoring
│     • Generated files viewer
│
├─ Backend Services
│  ├─ Express Server (server-production.js)
│  │  └─ REST API endpoints
│  │     • /api/agents - Agent management
│  │     • /api/agents/task - Task execution
│  │     • /api/executions - Execution history
│  │     • /api/jobs - Job management
│  │
│  ├─ Agent Orchestrator
│  │  └─ Coordinates 7 specialized agents
│  │     • SHADDAI - Supreme Orchestrator
│  │     • NEXUS - Technical Architect
│  │     • TURTLE - UI/UX & Creative
│  │     • PIKADON - Security & Compliance
│  │     • QUILL - Writing & Communication
│  │     • ZEROX - Wealth & Revenue Engine
│  │     • ORACLE - Research & Intelligence
│  │
│  ├─ Skill Execution System
│  │  ├─ SkillExecutorReal - Calls real agents via HTTP
│  │  ├─ SkillOrchestrator - Manages skill execution
│  │  ├─ SkillOptimizer - Optimizes skill performance
│  │  └─ SkillRouter - Routes tasks intelligently
│  │
│  ├─ Data Persistence
│  │  └─ DatabaseReal
│  │     • Execution history
│  │     • Skill metrics
│  │     • Agent performance stats
│  │     • Memory management
│  │
│  └─ Support Services
│     ├─ AuthService - User authentication
│     ├─ BillingService - Subscription management
│     └─ SecurityHardening - CORS, helmet, JWT
│
└─ Generated Output
   └─ /generated-output
      • API code (from NEXUS)
      • UI components (from TURTLE)
      • Security audits (from PIKADON)
      • Documentation (from QUILL)
      • Project coordination reports (from SHADDAI)
```

---

## 📡 API Endpoints

### Health & Status
```
GET /api/health                 - Server health check
GET /api/status                 - Detailed system status
```

### Agent Management
```
GET  /api/agents                - List all agents
GET  /api/agents/:name          - Get agent details
POST /api/agents/task           - Execute agent task
```

### Skill Execution
```
GET  /api/skills                - List available skills
POST /api/agents/task           - Execute a skill
  {
    "agentName": "NEXUS",
    "task": "Build a REST API",
    "context": {}
  }
```

### Job Management
```
GET  /api/jobs                  - List all jobs
POST /api/jobs                  - Create new job
  {
    "title": "Build Login Page",
    "description": "Create React login component",
    "targetAgents": ["TURTLE"],
    "reward": 100
  }
```

### Execution History
```
GET  /api/executions            - List all executions
GET  /api/executions/:id        - Get execution details
GET  /api/executions?agent=NEXUS&limit=10
```

### Generated Files
```
GET  /api/generated-files       - List generated files
GET  /api/generated-files/:name - Download specific file
```

---

## 🔧 How It Works

### 1. Task Execution Flow

```
User → POST /api/agents/task
  ↓
SkillExecutor → Validates request
  ↓
Agent HTTP Call → Connects to real agent (port 8000-8008)
  ↓
Agent Executes → Generates real output
  ↓
Response Saved → Persisted in DatabaseReal
  ↓
Files Written → Saved to /generated-output
  ↓
Response Sent → Back to user
```

### 2. Example: Have NEXUS Build an API

```bash
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "task": "Build a REST API with Express, PostgreSQL, JWT auth",
    "context": {
      "framework": "Express",
      "database": "PostgreSQL",
      "authType": "JWT"
    }
  }'
```

Response:
```json
{
  "status": "SUCCESS",
  "outputs": {
    "apiCode": "const express = require('express')...",
    "filePath": "/generated-output/api-server.js",
    "fileSize": 2048,
    "timestamp": "2026-05-13T10:30:45Z"
  }
}
```

### 3. Example: Have TURTLE Design a Login Page

```bash
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "TURTLE",
    "task": "Design a beautiful, accessible login page with dark mode",
    "context": {
      "framework": "React",
      "theme": "modern",
      "colors": ["#6366f1", "#f97316"]
    }
  }'
```

---

## 📂 Directory Structure

```
SHADDAI-FINAL-BUILD/
├── public/
│   └── index.html              - Main frontend (1.6MB)
│
├── backend/
│   ├── server-production.js    - Main Express server
│   ├── skill-executor-real.js  - Real agent executor
│   ├── skill-orchestrator.js   - Orchestration logic
│   ├── skill-bridge.js         - Agent communication
│   ├── database-real.js        - Persistent storage
│   ├── background-jobs.js      - Auto-optimization
│   ├── auth-service.js         - Authentication
│   ├── billing-service.js      - Billing system
│   ├── agents/                 - Agent definitions
│   └── skills/                 - Skill library
│
├── generated-output/           - Files generated by agents
├── docs/                       - Documentation
├── package.json                - Dependencies
├── START-SERVER.ps1            - PowerShell start script
├── START-SERVER.bat            - Batch start script
└── README.md                   - This file
```

---

## 🔌 Real Agent Integration

SHADDAI connects to 7 real agents running locally on dedicated ports:

| Agent | Port | Role |
|-------|------|------|
| SHADDAI | 8000 | Supreme Orchestrator |
| ZEROX | 8001 | Wealth & Revenue Engine |
| ORACLE | 8002 | Research & Intelligence |
| NEXUS | 8003 | Technical Architect |
| TURTLE | 8004 | UI/UX & Creative |
| QUILL | 8005 | Writing & Communication |
| PIKADON | 8008 | Security & Compliance |

**To run all agents locally:**

```bash
# Terminal 1: Start all agents
python agent_wrapper.py --all

# Terminal 2: Start SHADDAI server
npm start
```

---

## 📊 Generated Outputs

All agent work is saved to `/generated-output/`:

- **api-server.js** - Complete REST API (from NEXUS)
- **LoginPage.tsx** - React component (from TURTLE)
- **SECURITY-AUDIT.md** - Security review (from PIKADON)
- **API-DOCUMENTATION.md** - Full docs (from QUILL)
- **PROJECT-COORDINATION.md** - Project report (from SHADDAI)

Access via API:
```
GET /api/generated-files
GET /api/generated-files/api-server.js
```

---

## 🛡️ Security Features

- ✅ CORS configured
- ✅ Helmet security headers
- ✅ Input validation & sanitization
- ✅ JWT token support
- ✅ Rate limiting ready
- ✅ HTTPS support available

---

## 🚀 Deployment

### Local Testing
```bash
npm start
```

### Production (with PM2)
```bash
npm install -g pm2
pm2 start backend/server-production.js --name "shaddai"
pm2 save
pm2 startup
```

### Docker
```dockerfile
FROM node:16
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t shaddai .
docker run -p 3000:3000 shaddai
```

---

## 📈 Performance

- **Response Time**: < 200ms for API calls
- **Concurrent Agents**: Up to 7 parallel executions
- **Database**: In-memory with persistence
- **File Generation**: Real output, not mocked

---

## 🔍 Monitoring

Check server status:
```bash
curl http://localhost:3000/api/health
```

View execution history:
```bash
curl http://localhost:3000/api/executions?limit=20
```

---

## 🤝 Contributing

To extend SHADDAI:

1. Add new skills in `/backend/skills/`
2. Create agent-specific endpoints
3. Update database schema as needed
4. Test with real agents before deployment

---

## 📞 Support

**Configuration Files:**
- `.env` - Environment variables (optional)
- `backend/server-production.js` - Main server config

**Troubleshooting:**
- Ensure port 3000 is available
- Check Node.js version (16+)
- Verify agents are running on expected ports
- Check browser console for frontend errors

---

## 📜 License

SHADDAI v61 - Production Ready

---

**Built with multi-agent AI orchestration for real, autonomous work.**

Last Updated: 2026-05-13
