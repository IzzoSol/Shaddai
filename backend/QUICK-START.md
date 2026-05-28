# SHADDAI Backend v62 — Quick Start Guide

Get the production backend running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- npm 8+ installed
- (Optional) PostgreSQL for production
- (Optional) Redis for caching

## Installation (5 minutes)

### Step 1: Install Dependencies
```bash
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD\backend
npm install --production
```

### Step 2: Configure Environment
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings (or use defaults for development)
# NODE_ENV=development  (default)
# PORT=3000             (default)
```

### Step 3: Start Server
```bash
# Development (with hot reload)
npm run dev

# Production (with PM2)
pm2 start ecosystem.config.js

# Or direct start
node server-production.js
```

### Step 4: Verify It's Running
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "operational",
  "version": "62.0.0",
  "services": {
    "agents": "online",
    "database": "online",
    "skillExecutor": "online"
  }
}
```

## API Quick Examples

### 1. Get Agent Status
```bash
curl http://localhost:3000/api/agents/NEXUS
```

### 2. Execute a Task
```bash
curl -X POST http://localhost:3000/api/agents/task \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "NEXUS",
    "task": "Build a REST API for user management"
  }'
```

### 3. Create a Job
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build Admin Dashboard",
    "description": "Create a React admin dashboard",
    "reward": 5000
  }'
```

### 4. Get Marketplace Stats
```bash
curl http://localhost:3000/api/marketplace
```

### 5. Connect WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected!');
  ws.send(JSON.stringify({
    action: 'subscribe',
    payload: { channel: 'executions' }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

## File Structure

```
backend/
├── server-production.js      # Main server (WebSocket, caching, logging)
├── database-real.js          # Database with indices and optimization
├── skill-executor-real.js    # Agent execution engine
├── auth-service.js           # Authentication (provided)
├── billing-service.js        # Billing (provided)
├── security-hardening.js     # Security middleware (provided)
├── API-REFERENCE.md          # Complete API docs
├── PRODUCTION-DEPLOYMENT.md  # Deployment guide
├── QUICK-START.md           # This file
├── data/                     # File-based storage
│   ├── executions/          # Execution records
│   ├── jobs/                # Job listings
│   ├── memories/            # Agent memories
│   └── archives/            # Old data
└── logs/                    # Application logs
```

## Configuration

### For Development
No configuration needed! Server runs with defaults:
- Port: 3000
- Storage: File-based (./data/)
- Logging: Console + file

### For Production
Edit `.env`:
```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=your-very-long-random-secret-here
DB_TYPE=postgresql        # When migrating from files
DB_HOST=localhost
DB_NAME=shaddai_prod
REDIS_HOST=localhost      # For caching
REDIS_PORT=6379
LOG_LEVEL=info
RATE_LIMIT_MAX=1000
```

## Common Tasks

### View Server Status
```bash
curl http://localhost:3000/api/status | jq .
```

### Check Database Size
```bash
curl http://localhost:3000/api/database/size
```

### Export Data
```bash
curl -X POST http://localhost:3000/api/database/export \
  -H "Content-Type: application/json" \
  -d '{ "format": "json" }'
```

### Clean Up Old Data
```bash
curl -X POST http://localhost:3000/api/database/cleanup \
  -H "Content-Type: application/json" \
  -d '{ "ageThresholdDays": 90 }'
```

### View Execution History
```bash
curl 'http://localhost:3000/api/executions?agent=NEXUS&limit=10'
```

### View Analytics
```bash
curl 'http://localhost:3000/api/analytics/dashboard?range=24h'
```

## Monitoring

### Real-Time Logs
```bash
# If using PM2
pm2 logs shaddai-api

# Or direct file monitoring
tail -f logs/app.log
```

### CPU & Memory
```bash
# If using PM2
pm2 monit

# Or system tools
top
ps aux | grep node
```

### Response Times
Check server logs:
```json
{
  "timestamp": "2026-05-13T10:30:45Z",
  "method": "POST",
  "path": "/api/agents/task",
  "status": 200,
  "duration": 2500
}
```

## Troubleshooting

### Port Already In Use
```bash
# Find what's using port 3000
lsof -i :3000

# Kill it (if safe)
kill -9 <PID>

# Or use different port
PORT=3001 node server-production.js
```

### Database Connection Failed
- Check `data/` directory exists
- Verify write permissions: `ls -la data/`
- If using PostgreSQL, verify credentials in `.env`

### WebSocket Not Connecting
- Check firewall allows port 3000
- Verify WebSocket URL: `ws://localhost:3000`
- Check browser console for errors

### High Memory Usage
```bash
# Check cache size
curl http://localhost:3000/api/health | jq '.cache'

# Clear old data
curl -X POST http://localhost:3000/api/database/cleanup

# Monitor with PM2
pm2 logs shaddai-api
```

## Performance Tips

1. **Enable Caching**
   - Already enabled by default
   - Check hit rate: `curl http://localhost:3000/api/health`

2. **Use WebSocket for Real-Time**
   - Don't poll `/api/status` repeatedly
   - Connect WebSocket instead: `ws://localhost:3000`

3. **Batch Operations**
   - Use `/api/batch/jobs` instead of individual requests
   - Groups parallel execution for better throughput

4. **Database Queries**
   - Use `/api/agents/:name/history` for agent history
   - Use filters to limit results
   - Pagination: `limit=50&offset=100`

5. **Production Setup**
   - Follow PRODUCTION-DEPLOYMENT.md
   - Use load balancer for multiple instances
   - Set up Redis cache
   - Use PostgreSQL for large datasets

## Development Workflow

### Local Development
```bash
# Start server
npm run dev

# In another terminal, test API
curl http://localhost:3000/api/health

# View logs
tail -f logs/app.log
```

### Testing Changes
1. Edit `server-production.js`, `database-real.js`, or `skill-executor-real.js`
2. Restart server (Ctrl+C, then `npm run dev`)
3. Test with curl or Postman

### Adding New Endpoints
1. Edit `server-production.js`
2. Add new `app.get()` or `app.post()` block
3. Return JSON response
4. Document in `API-REFERENCE.md`

## Useful Scripts

```bash
# Install all dependencies
npm install

# Run development server
npm run dev

# Run production server with PM2
pm2 start ecosystem.config.js

# Monitor with PM2
pm2 monit

# View all PM2 processes
pm2 status

# Stop server
pm2 stop shaddai-api

# Restart server
pm2 restart shaddai-api

# View logs
pm2 logs shaddai-api

# Stop all PM2 processes
pm2 stop all

# Delete all PM2 processes
pm2 delete all
```

## Next Steps

1. **Read the full documentation**
   - `API-REFERENCE.md` — Complete API reference
   - `PRODUCTION-DEPLOYMENT.md` — Deploy to production
   - `PRODUCTION-ENHANCEMENTS-SUMMARY.md` — Feature overview

2. **Set up frontend integration**
   - Use WebSocket for real-time updates
   - Implement job creation and bidding
   - Build agent execution dashboard

3. **Configure monitoring**
   - Set up log aggregation (ELK stack)
   - Configure alerts (Sentry, New Relic)
   - Monitor performance (Datadog, CloudWatch)

4. **Deploy to production**
   - Follow PRODUCTION-DEPLOYMENT.md
   - Use PM2 or Docker
   - Configure reverse proxy (Nginx)
   - Set up SSL certificates

## Support

- **API Issues**: Check `/api/health` and logs
- **Database Issues**: Run `/api/database/size` and cleanup
- **Performance Issues**: Check cache stats in `/api/health`
- **WebSocket Issues**: Verify firewall and browser console

---

**Version:** 62.0.0  
**Status:** Production Ready  
**Last Updated:** 2026-05-13
