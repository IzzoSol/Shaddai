# SHADDAI Troubleshooting Guide

Common issues and solutions for SHADDAI development and production.

## Quick Diagnostic

Run this to diagnose most issues:

```bash
# Windows PowerShell
$tests = @(
    @{name="Port 3000"; test="Test-NetConnection localhost -Port 3000"},
    @{name="Node"; test="node --version"},
    @{name="npm"; test="npm --version"},
    @{name="Health"; test="curl http://localhost:3000/api/health"},
    @{name="Agents"; test="curl http://localhost:3000/api/agents"}
)

foreach ($test in $tests) {
    Write-Host "Testing: $($test.name)" -ForegroundColor Yellow
    Invoke-Expression $test.test
    Write-Host ""
}
```

## Startup Issues

### Issue: "Port 3000 Already in Use"

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

Option 1: Kill the process using port 3000
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual PID)
taskkill /PID 1234 /F
```

Option 2: Use a different port
```powershell
$env:PORT = 3001
npm start
```

Option 3: Close all Node.js processes
```powershell
taskkill /IM node.exe /F
npm start
```

### Issue: "npm install Fails"

**Error:**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solutions:**

```bash
# Clear cache
npm cache clean --force

# Delete dependencies
Remove-Item node_modules -Recurse -ErrorAction Ignore
Remove-Item package-lock.json -ErrorAction Ignore

# Reinstall with force
npm install --force

# Or use legacy peer deps
npm install --legacy-peer-deps
```

### Issue: "Cannot Find Module 'express'"

**Error:**
```
Error: Cannot find module 'express'
```

**Solutions:**

```bash
# Reinstall dependencies
npm install

# Or reinstall specific package
npm install express

# Check if node_modules exists
ls node_modules | grep express
```

### Issue: "Node Version Incompatible"

**Error:**
```
The engine "node" is incompatible with this package
```

**Solutions:**

Check Node version:
```bash
node --version  # Should be 16+ for SHADDAI
```

Update Node.js:
- Download from https://nodejs.org (LTS version)
- Or use nvm (Node Version Manager)

```bash
# macOS/Linux with nvm
nvm install 18
nvm use 18

# Windows - Download installer from nodejs.org
```

## Agent Connection Issues

### Issue: "Agents Showing Offline"

**Symptoms:**
- Agent status shows "offline"
- Tasks fail with "Agent unreachable"

**Solutions:**

Check if agents are running:
```bash
# Try to connect to NEXUS (port 8003)
curl http://localhost:8003/api/execute
# Should respond (or give a different error, not connection refused)
```

Start the agents:
```bash
# Start all agents (requires Python and agent_wrapper.py)
python agent_wrapper.py --all

# Or start individual agents
python agent_wrapper.py --agent nexus --port 8003
```

If agents won't start:
- Check Python is installed (python --version)
- Check agent_wrapper.py exists
- Check firewall allows localhost connections

### Issue: "Agent Task Hangs"

**Symptoms:**
- Request to agent endpoint takes 60+ seconds
- Eventually times out with 504 Gateway Timeout

**Solutions:**

```bash
# Check agent process
ps aux | grep agent

# Kill hanging agent
kill -9 <pid>

# Restart agent
python agent_wrapper.py --agent nexus

# Check agent logs (if available)
tail -f agent-nexus.log
```

Increase timeout in `backend/skill-executor-real.js`:
```javascript
const AGENT_TIMEOUT = process.env.AGENT_TIMEOUT || 120000; // 2 minutes
```

### Issue: "Agent Returns Empty Response"

**Symptoms:**
- Task completes but outputs.code is empty
- No file generated in /generated-output

**Solutions:**

```bash
# Check what agent returned
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{"agentName":"NEXUS","task":"test"}'

# Look for error message in response
# Common causes:
# 1. Agent crashed
# 2. Network issue
# 3. Timeout

# Solution: Restart agent and retry
```

## API Issues

### Issue: "API Returns 404"

**Error:**
```
404 Not Found
```

**Solutions:**

Check endpoint URL:
```bash
# Correct
curl http://localhost:3000/api/health

# Wrong
curl http://localhost:3000/api/health/  # Extra slash
curl http://localhost:3000/api-health   # Wrong separator
```

Verify endpoint exists:
```bash
# List all endpoints in server-production.js
grep -n "app.get\|app.post" backend/server-production.js
```

### Issue: "API Returns 500 Internal Server Error"

**Error:**
```json
{
  "status": 500,
  "message": "Internal Server Error"
}
```

**Solutions:**

Check server logs:
```bash
# If using PM2
pm2 logs shaddai

# If running directly
# Check console output where npm start was run
```

Common causes:
1. Database error - check data folder permissions
2. Missing file - check backend files exist
3. Agent error - check agent is running
4. Out of memory - restart server

Restart server:
```bash
# With PM2
pm2 restart shaddai

# Otherwise
Ctrl+C
npm start
```

### Issue: "CORS Error in Browser"

**Error:**
```
Access to XMLHttpRequest at 'http://localhost:3000/api/...' 
from origin 'http://localhost:3001' has been blocked by CORS policy
```

**Solutions:**

Update CORS configuration in `backend/server-production.js`:

```javascript
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'  // Add your frontend port
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

Restart server:
```bash
npm start
```

### Issue: "Invalid JSON in Request"

**Error:**
```
SyntaxError: Unexpected token < in JSON at position 0
```

**Solutions:**

Check request body is valid JSON:

```bash
# Wrong - single quotes
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{"agentName": 'NEXUS'}'  # Single quotes invalid

# Correct - double quotes
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d "{\"agentName\": \"NEXUS\"}"
```

Use online JSON validator: https://jsonlint.com

## Performance Issues

### Issue: "Server Running Slowly"

**Symptoms:**
- Response time > 5 seconds
- High CPU usage

**Solutions:**

Check memory usage:
```bash
# Check free memory
free -h  # Linux
Get-Process node | Select-Object WorkingSet  # Windows

# If > 80% used, restart
pm2 restart shaddai
```

Check what tasks are running:
```bash
curl http://localhost:3000/api/executions?status=RUNNING
```

Kill long-running task:
```bash
# Edit /generated-output to see recent files
# Check timestamps - if one is very old, agent may be stuck

# Restart agents
pm2 restart all
```

### Issue: "High Memory Usage"

**Symptoms:**
- Memory gradually increases
- Eventually crashes

**Solutions:**

This usually means a memory leak. Solutions:

1. Restart server regularly
```bash
# Restart every 4 hours
0 */4 * * * pm2 restart shaddai
```

2. Monitor memory
```bash
# Watch memory every 10 seconds
watch -n 10 'ps aux | grep node'
```

3. Enable garbage collection
```bash
# Start with explicit garbage collection
node --expose-gc backend/server-production.js
```

4. Update Node.js
```bash
# Memory leaks often fixed in newer versions
node --version
# Update if old
```

### Issue: "Timeout on Long Tasks"

**Symptoms:**
- Tasks > 60 seconds fail
- Error: "Agent timeout"

**Solutions:**

Increase timeout in `backend/skill-executor-real.js`:

```javascript
// Default is 60 seconds
const TIMEOUT = 120000; // 2 minutes

const response = await Promise.race([
  agentRequest,
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), TIMEOUT)
  )
]);
```

Or break task into smaller pieces:
```bash
# Instead of one big task
# Have agent return intermediate results

# Bad:
"Build a complete e-commerce platform"

# Good:
"Build the user API endpoints first"
# Then: "Build the product API endpoints"
# Then: "Build the order API endpoints"
```

## Data Issues

### Issue: "Files Not Saving"

**Symptoms:**
- Task completes but no file in /generated-output
- outputs.filePath is null

**Solutions:**

Check folder permissions:
```bash
# Linux/macOS
ls -la generated-output
chmod 755 generated-output

# Windows - right-click folder, Properties, Security tab
# Ensure current user has write permissions
```

Check disk space:
```bash
# Linux/macOS
df -h

# Windows
Get-Volume

# If full, delete old files
find ./generated-output -type f -mtime +30 -delete
```

Check the response has content:
```javascript
// In your task
const result = await api.post('/api/agents/task', {...});

if (!result.outputs.code) {
  console.error('Agent returned empty code');
  // Agent may have failed silently
}
```

### Issue: "Execution History Lost"

**Symptoms:**
- /api/executions returns empty
- Previously run tasks disappeared

**Solutions:**

Executions are stored in `./data/executions.json`:

```bash
# Check if file exists
ls -la data/executions.json

# Check if it's corrupted
cat data/executions.json | python -m json.tool

# If corrupted, delete it (history lost but server will work)
rm data/executions.json
npm start  # Will create new file
```

Backup regularly:
```bash
# Create daily backup
0 3 * * * cp data/executions.json backup/executions-$(date +%Y%m%d).json
```

### Issue: "Database Locks on Read"

**Symptoms:**
- Intermittent "EBUSY" or "EPERM" errors
- File locked errors

**Solutions:**

This happens with file-based database. Switch to better database:

For production, consider:
- PostgreSQL
- MongoDB
- Redis

Or implement in-memory caching:
```javascript
// Cache executions in memory
const executionCache = new Map();

// Write to file async
async function saveExecution(exec) {
  executionCache.set(exec.id, exec);
  // Write to file in background
  fs.promises.appendFile('data/executions.json', JSON.stringify(exec) + '\n');
}
```

## Security Issues

### Issue: "Unauthorized API Access"

**Error:**
```
403 Forbidden - Invalid JWT token
```

**Solutions:**

Check JWT token is valid:
```bash
# Login first to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Will return token, then use in header
curl http://localhost:3000/api/protected \
  -H "Authorization: Bearer <your-token>"
```

If no auth system:
```javascript
// In backend/server-production.js, disable auth check
// Or set a default token in .env
```

### Issue: "Rate Limiting Blocking Requests"

**Error:**
```
429 Too Many Requests
```

**Solutions:**

Check rate limit config:
```javascript
// In backend/security-hardening.js
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100              // 100 requests per minute
});
```

Increase limit:
```javascript
max: 500  // Allow more requests
```

Or allow specific IPs:
```javascript
// Skip rate limiting for localhost
if (req.ip === '127.0.0.1') {
  return next();
}
limiter(req, res, next);
```

## Deployment Issues

### Issue: "Docker Container Crashes"

**Symptoms:**
```
docker: Error response from daemon: container exited with code 1
```

**Solutions:**

Check logs:
```bash
docker logs <container-id>
```

Common causes:
1. Port already in use - change port mapping
2. Missing environment variables - add to docker-compose.yml
3. Out of memory - increase Docker memory limit

Rebuild image:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Issue: "PM2 Process Won't Start"

**Symptoms:**
```
PM2 | App [shaddai] failed to start
```

**Solutions:**

Check PM2 logs:
```bash
pm2 logs shaddai --lines 100
```

Try starting directly to see error:
```bash
npm start
```

Common issues:
1. Missing dependencies - npm install
2. Wrong port - change PORT env var
3. File permissions - chmod +x backend/server-production.js

Restart PM2:
```bash
pm2 kill
pm2 start ecosystem.config.js
pm2 save
```

### Issue: "Production Server Crashes Unexpectedly"

**Solutions:**

1. Setup auto-restart
```bash
pm2 restart shaddai --cron "0 3 * * *"  # 3 AM daily
```

2. Monitor for crashes
```bash
pm2 start monitoring.js  # Your monitoring script
```

3. Setup alerts
```javascript
// Alert when crash occurs
pm2.launchBus((err, bus) => {
  bus.on('process:exit', (data) => {
    console.error('Process exited:', data.process.name);
    // Send alert
  });
});
```

## Getting Help

### Collect Debugging Information

When reporting issues, gather:

```bash
# System info
node --version
npm --version
uname -a  # or systeminfo on Windows

# Server info
curl http://localhost:3000/api/health
curl http://localhost:3000/api/status

# Logs (last 50 lines)
pm2 logs shaddai --lines 50
tail -50 /app/logs/shaddai.log

# Recent executions
curl http://localhost:3000/api/executions?limit=5

# Agent status
curl http://localhost:3000/api/agents
```

### Check Documentation

- [Getting Started](GETTING_STARTED.md) - Basic setup
- [API Guide](API_INTEGRATION_GUIDE.md) - API usage
- [Architecture](ARCHITECTURE.md) - System design
- [Deployment](DEPLOYMENT.md) - Production setup
- [Monitoring](MONITORING.md) - Health checks

### Common Patterns for Issues

| Issue | Usually Caused By | Solution |
|-------|-------------------|----------|
| 404 errors | Wrong URL | Check endpoint path |
| 500 errors | Code error | Check logs, restart |
| Timeout | Slow response | Increase timeout or optimize code |
| Memory leak | Server not releasing memory | Restart or update Node |
| Agent offline | Not running or port wrong | Start agent, check port |
| File not saving | Permissions or disk full | Check permissions, free disk |
| Slow API | Load or memory | Check usage, scale up |

---

**Questions?** See [FAQ](FAQ.md) for common questions.

Last Updated: 2026-05-13
