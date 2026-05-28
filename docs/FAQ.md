# SHADDAI Frequently Asked Questions

Quick answers to common questions about SHADDAI.

## Getting Started

### Q: Do I need all 7 agents running?

**A:** No. SHADDAI works without the actual agents, using Claude API as a fallback. However, the real agents (NEXUS, TURTLE, etc.) provide better quality and performance. You can start with Claude API and add agents later.

### Q: How do I get started in 5 minutes?

**A:** See [Getting Started](GETTING_STARTED.md). TL;DR:
```bash
cd SHADDAI-FINAL-BUILD
npm install
npm start
# Open http://localhost:3000
```

### Q: Can I run this on Windows?

**A:** Yes. Use `START-SERVER.ps1` (PowerShell) or `START-SERVER.bat` (Command Prompt).

### Q: What are the system requirements?

**A:** 
- Node.js 16+
- 2GB RAM minimum (4GB recommended)
- 500MB disk space
- Port 3000 available

### Q: Is there a web UI?

**A:** Yes. Once running, open `http://localhost:3000` in your browser. It's a React-based dashboard in a single HTML file.

## Using the API

### Q: How do I execute an agent task?

**A:** POST to `/api/agents/task`:

```bash
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "task": "Build a REST API",
    "context": {"framework": "Express"}
  }'
```

### Q: What response do I get?

**A:** 
```json
{
  "status": "SUCCESS",
  "outputs": {
    "code": "...",
    "filePath": "/generated-output/api.js",
    "timestamp": "2026-05-13T10:30:45Z"
  },
  "duration": 1250
}
```

### Q: How long do tasks take?

**A:** 
- Simple tasks: 5-10 seconds
- Complex tasks: 20-60 seconds
- Maximum timeout: 60 seconds

If your task takes longer, break it into smaller subtasks.

### Q: Can I run multiple agents in parallel?

**A:** Yes. Each agent runs independently, so you can execute 7 tasks concurrently (one per agent). SHADDAI automatically handles queuing and parallel execution.

### Q: What if an agent is offline?

**A:** The system falls back to Claude API. You'll still get results, but potentially lower quality. Start the agents to get better performance.

### Q: Can I integrate with my frontend?

**A:** Yes. See [API Integration Guide](API_INTEGRATION_GUIDE.md). The API works with any frontend (React, Vue, vanilla JS, etc.).

## Agents

### Q: Which agent should I use for X?

**A:**
- **Building APIs/backends**: NEXUS
- **Designing UIs/interfaces**: TURTLE
- **Writing docs/copy**: QUILL
- **Security reviews**: PIKADON
- **Business logic/pricing**: ZEROX
- **Research/insights**: ORACLE
- **Coordination/strategy**: SHADDAI

### Q: Can agents communicate with each other?

**A:** Yes, through SHADDAI. Have SHADDAI coordinate multi-agent workflows by specifying dependencies and passing outputs between agents.

### Q: What skills does each agent have?

**A:** See [Agent Guide](AGENT_GUIDE.md). Each agent has 100+ specialized skills in their domain.

### Q: Can I use agents without the actual agent processes?

**A:** Yes. SHADDAI has a Claude API fallback. You don't need the real agents (ports 8000-8008) - the system will still work using Claude.

## Files and Output

### Q: Where do generated files go?

**A:** 
- Disk: `/generated-output/` folder
- API: `/api/generated-files` endpoint
- Response: In the `outputs.filePath` field

### Q: How do I download generated files?

**A:** Via the API:
```bash
curl http://localhost:3000/api/generated-files/api-server.js
```

Or through the dashboard UI.

### Q: Can I delete generated files?

**A:** Yes, manually from `/generated-output/` or via dashboard.

### Q: How much disk space do generated files need?

**A:** Typically:
- Simple file: 5-50 KB
- Complete API: 50-200 KB
- Full application: 500 KB - 5 MB

You can cleanup old files:
```bash
find ./generated-output -type f -mtime +30 -delete
```

## Database and Storage

### Q: Where is data stored?

**A:** 
- Executions: `./data/executions.json`
- Metrics: `./data/metrics.json`
- Cache: `./data/cache.json`
- Generated files: `./generated-output/`

### Q: Is my data persistent?

**A:** Yes, all data is saved to disk and persists across restarts.

### Q: What happens if the database gets corrupted?

**A:** Delete the corrupted file. A new one will be created on next run (you'll lose history for that file).

```bash
rm ./data/executions.json
npm start
```

### Q: Can I backup my data?

**A:** Yes:
```bash
# Backup everything
cp -r ./data ./data.backup
cp -r ./generated-output ./generated-output.backup
```

### Q: Can I export execution history?

**A:** Yes:
```bash
curl http://localhost:3000/api/executions?limit=1000 > executions.json
```

## Performance

### Q: How many requests can SHADDAI handle?

**A:** 
- Sequential: Limited by agent speed (typically 1-5 tasks/minute)
- Parallel: Up to 7 concurrent (one per agent)

### Q: What's the typical response time?

**A:** 
- API overhead: 50-200ms
- Agent execution: 5-60s
- Total: Usually 5-70s per task

### Q: How much memory does it use?

**A:** 
- Idle: ~100 MB
- Per execution: ~10-50 MB
- With cache: 300-1000 MB typical

### Q: Can I run it on a Raspberry Pi?

**A:** Maybe, but not recommended. Minimum 4GB RAM needed.

## Deployment

### Q: Can I deploy to production?

**A:** Yes. See [Deployment Guide](DEPLOYMENT.md). Recommended approaches:
- PM2 (simple)
- Docker (scalable)
- Kubernetes (enterprise)
- Cloud (AWS/Azure/GCP)

### Q: Is SHADDAI secure?

**A:** Yes. Features include:
- Input validation
- CORS protection
- Rate limiting
- JWT authentication support
- HTTPS support
- No hardcoded credentials

See [Troubleshooting](TROUBLESHOOTING.md) Security section for hardening.

### Q: How do I enable HTTPS?

**A:** Use a reverse proxy (Nginx) with Let's Encrypt SSL certificates. See [Deployment Guide](DEPLOYMENT.md) for setup.

### Q: What's the recommended hosting?

**A:** 
- Development: Local laptop
- Small scale: $5-10/month VPS (1 CPU, 2GB RAM)
- Medium scale: $20-50/month (2 CPU, 4GB RAM)
- Large scale: Kubernetes cluster or AWS ECS

### Q: How do I scale to handle more traffic?

**A:** 
1. Vertical scaling: Increase server CPU/RAM
2. Horizontal scaling: Run multiple instances behind load balancer
3. Agent scaling: Run agents on separate servers

## Monitoring and Maintenance

### Q: How do I monitor the system?

**A:** See [Monitoring Guide](MONITORING.md). Key endpoints:
- Health: `GET /api/health`
- Status: `GET /api/status`
- Executions: `GET /api/executions`

### Q: How do I set up alerts?

**A:** Email alerts, Slack integration, or monitoring service (Uptime Robot, Datadog, etc.). See [Monitoring Guide](MONITORING.md).

### Q: How do I troubleshoot issues?

**A:** See [Troubleshooting Guide](TROUBLESHOOTING.md). Common issues covered.

### Q: How do I update SHADDAI?

**A:** 
```bash
git pull origin main
npm install
npm start
```

Or if not using git:
1. Download latest version
2. Backup current data folder
3. Replace backend and public folders
4. Restart server

## Customization

### Q: Can I customize the dashboard?

**A:** Yes. Edit `public/index.html`. It's a self-contained React app.

### Q: Can I add new agents?

**A:** Yes. The system supports unlimited agents. Each needs:
1. HTTP endpoint on a port
2. `/api/execute` endpoint
3. Respond with JSON output

### Q: Can I customize agent skills?

**A:** If running real agents, yes. See the agent's skill library. The system is agent-agnostic.

### Q: Can I integrate with third-party services?

**A:** Yes. SHADDAI can call external APIs from agent tasks. Common integrations:
- Stripe (billing)
- Slack (notifications)
- GitHub (code)
- OpenAI (AI)

Add to context:
```javascript
{
  agentName: "NEXUS",
  task: "Build API with Stripe integration",
  context: {
    externalServices: ["Stripe"],
    stripeKeys: "provided separately"
  }
}
```

## Pricing and Licensing

### Q: Is SHADDAI free?

**A:** The code is provided. You pay for:
- Claude API usage (if using fallback)
- Cloud hosting (if deploying)
- Agent process licenses (if using paid agents)

### Q: Can I use it commercially?

**A:** Yes. Check licensing terms for any open source dependencies.

### Q: Can I resell SHADDAI as a service?

**A:** Yes, as long as you follow licensing terms. You become the platform provider.

## Troubleshooting

### Q: The server won't start

**A:** Check:
1. Port 3000 is available: `netstat -ano | findstr :3000`
2. Node.js installed: `node --version`
3. npm packages: `npm install`

See [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed steps.

### Q: API returns 500 error

**A:** Check server logs. Common causes:
- Database file permissions
- Agent timeout
- Out of memory

### Q: Agents show offline

**A:** 
1. Check agents are running on the expected ports
2. Check no firewall is blocking connections
3. Try connecting directly: `curl http://localhost:8003/api/execute`

### Q: Task takes too long or times out

**A:** 
1. Increase timeout in `backend/skill-executor-real.js`
2. Break task into smaller subtasks
3. Check agent logs for errors

## Architecture and Design

### Q: How does SHADDAI work?

**A:** Simplified:
1. You send a task to the API
2. API validates and routes to agent
3. Agent executes (real agent or Claude API)
4. Output saved to disk and database
5. Response sent back to you

See [Architecture Guide](ARCHITECTURE.md) for details.

### Q: What technology stack is used?

**A:** 
- Frontend: React (HTML/CSS/JS)
- Backend: Node.js + Express
- Database: File-based JSON (with PostgreSQL support)
- Agents: Python + Claude API
- Deployment: Docker, Kubernetes, PM2

### Q: Can I use a different database?

**A:** Yes. The code is modular. Replace `backend/database-real.js` with your database. Supports any Node.js compatible DB.

### Q: Is the frontend a single-page app?

**A:** Yes. `public/index.html` is a complete React app (~1.6 MB single file) for simplicity.

## Getting Help

### Q: Where do I find documentation?

**A:** 
- Quick start: [Getting Started](GETTING_STARTED.md)
- API: [API Integration Guide](API_INTEGRATION_GUIDE.md)
- Agents: [Agent Guide](AGENT_GUIDE.md)
- Deployment: [Deployment Guide](DEPLOYMENT.md)
- Architecture: [Architecture Guide](ARCHITECTURE.md)
- Monitoring: [Monitoring Guide](MONITORING.md)
- Issues: [Troubleshooting Guide](TROUBLESHOOTING.md)

### Q: How do I report bugs?

**A:** Provide:
1. System info: `node --version`, `npm --version`
2. Error message (full stack trace)
3. Steps to reproduce
4. Server logs: `pm2 logs shaddai --lines 100`

### Q: How do I request features?

**A:** Describe:
1. What you want to do
2. Why you need it
3. Use case or example

### Q: Is there a community?

**A:** Not yet, but contribute improvements back!

---

**Still have questions?** Check the relevant guide above or report an issue.

Last Updated: 2026-05-13
