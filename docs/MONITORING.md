# SHADDAI Monitoring & Observability Guide

Complete guide for monitoring SHADDAI in production and understanding system health.

## Quick Health Check

Get system status in one command:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "operational",
  "version": "61.0.0",
  "timestamp": "2026-05-13T10:30:00Z",
  "agents": 7,
  "uptime": 3600,
  "executionsProcessed": 42
}
```

## Detailed Status

Get comprehensive system information:

```bash
curl http://localhost:3000/api/status
```

Response:
```json
{
  "server": "running",
  "port": 3000,
  "environment": "production",
  "uptime": 3600,
  "agents": [
    {
      "name": "NEXUS",
      "status": "online",
      "port": 8003,
      "tasksCompleted": 12,
      "failureRate": 0.08,
      "avgResponseTime": 2500
    }
  ],
  "executionStats": {
    "total": 42,
    "successful": 39,
    "failed": 3,
    "avgDuration": 1250
  },
  "memory": {
    "used": 145,
    "available": 7000,
    "heapUsed": 98,
    "heapTotal": 512
  },
  "generatedFiles": 15
}
```

## Key Metrics to Monitor

### Response Time

Track API response times to catch performance degradation:

```bash
# Get execution times
curl "http://localhost:3000/api/executions?limit=100" | \
  jq '.[] | .duration'
```

Healthy range:
- API overhead: 50-200ms
- Agent execution: 1-30s (task-dependent)
- Total: < 60s

### Success Rate

Monitor failure rates for each agent:

```bash
# Get agent statistics
curl http://localhost:3000/api/agents
```

Healthy: > 95% success rate per agent

### Agent Availability

Check if all agents are running:

```bash
curl http://localhost:3000/api/agents | \
  jq '.[] | {name, status}'
```

Output (healthy):
```json
{
  "name": "NEXUS",
  "status": "online"
}
{
  "name": "TURTLE",
  "status": "online"
}
```

### Memory Usage

Monitor server memory:

```bash
curl http://localhost:3000/api/status | \
  jq '.memory'
```

Healthy:
- Used < 50% of available
- Heap < 80% of total

If heap usage > 80%, restart the server.

### Disk Space

Monitor generated files storage:

```bash
# Check disk usage
df -h /app/generated-output
```

Cleanup old files:
```bash
find /app/generated-output -type f -mtime +30 -delete
```

## Execution Monitoring

### List Recent Executions

```bash
curl "http://localhost:3000/api/executions?limit=20"
```

### Filter by Agent

```bash
curl "http://localhost:3000/api/executions?agent=NEXUS&limit=10"
```

### Filter by Status

```bash
curl "http://localhost:3000/api/executions?status=ERROR&limit=10"
```

### Get Execution Details

```bash
curl http://localhost:3000/api/executions/exec_123
```

## Logging Strategy

### Log Levels

Configure in `backend/server-production.js`:

```javascript
const LOG_LEVELS = {
  ERROR: 0,    // Critical errors
  WARN: 1,     // Warnings
  INFO: 2,     // General information
  DEBUG: 3     // Detailed debugging
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
```

### Access Logs

Enable access logging with Morgan:

```javascript
const morgan = require('morgan');
app.use(morgan('combined', {
  stream: fs.createWriteStream('./logs/access.log', { flags: 'a' })
}));
```

### Application Logs

Log important events:

```javascript
logger.info(`Task started: ${taskId}`);
logger.warn(`Agent timeout: ${agentName}`);
logger.error(`Task failed: ${taskId}`, error);
```

### Log Rotation

Prevent logs from consuming all disk space:

```bash
# On Linux, create /etc/logrotate.d/shaddai
/app/logs/*.log {
  daily
  rotate 7
  compress
  delaycompress
  notifempty
  create 0640 nobody nobody
  postrotate
    systemctl reload shaddai > /dev/null 2>&1 || true
  endscript
}
```

## Performance Monitoring

### Response Time Dashboard

Create a simple monitoring script:

```bash
#!/bin/bash
# monitor.sh - Track performance metrics

while true; do
  echo "=== SHADDAI Performance $(date) ==="
  
  # API response time
  time curl -s http://localhost:3000/api/health > /dev/null
  
  # Memory usage
  echo -n "Memory: "
  curl -s http://localhost:3000/api/status | jq '.memory.used'
  
  # Success rate
  echo -n "Success Rate: "
  curl -s http://localhost:3000/api/executions?limit=100 | \
    jq '[.[].status] | group_by(.) | map({key: .[0], count: length})'
  
  sleep 60
done
```

### Request Rate Monitoring

Monitor requests per minute:

```bash
# Count requests in last minute
tail -f /app/logs/access.log | \
  grep "$(date '+%d/%b/%Y:%H:%M')" | \
  wc -l
```

Healthy: 0-100 requests/minute

## Alerting

### Setup Email Alerts (Simple)

Create `/app/monitor-alerts.js`:

```javascript
const { getStatus } = require('./backend/database-real.js');
const nodemailer = require('nodemailer');

async function checkAndAlert() {
  const status = await getStatus();
  
  // Check memory
  if (status.memory.used > status.memory.available * 0.8) {
    sendAlert('Memory usage critical', status.memory);
  }
  
  // Check failure rate
  const failureRate = status.executionStats.failed / status.executionStats.total;
  if (failureRate > 0.05) {
    sendAlert('High failure rate detected', failureRate);
  }
  
  // Check agent availability
  status.agents.forEach(agent => {
    if (agent.status !== 'online') {
      sendAlert(`Agent ${agent.name} is offline`, agent);
    }
  });
}

async function sendAlert(subject, details) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL,
      pass: process.env.ALERT_PASSWORD
    }
  });

  await transporter.sendMail({
    from: 'alerts@shaddai.com',
    to: 'admin@shaddai.com',
    subject: `[ALERT] ${subject}`,
    text: JSON.stringify(details, null, 2)
  });
}

// Run every 5 minutes
setInterval(checkAndAlert, 5 * 60 * 1000);
```

### Setup Monitoring Service (Uptime Robot)

1. Create a health endpoint
2. Add to Uptime Robot (uptime.com)
3. Configure alert email
4. Set check interval to 5 minutes

```
Endpoint: https://yourdomain.com/api/health
Check Interval: 5 minutes
Alert Emails: admin@company.com
```

## Metrics Collection

### Prometheus Integration

Add Prometheus metrics:

```javascript
const promClient = require('prom-client');

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const taskCounter = new promClient.Counter({
  name: 'shaddai_tasks_total',
  help: 'Total number of tasks executed',
  labelNames: ['agent', 'status']
});

// Use in middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route.path, res.statusCode)
      .observe(duration);
  });
  next();
});

// Expose metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

## Dashboard Setup

### Using Grafana

1. Install Grafana: https://grafana.com/grafana/download
2. Add Prometheus datasource
3. Create dashboard with panels:

```
Panel 1: API Response Time (histogram)
Panel 2: Task Success Rate (gauge)
Panel 3: Memory Usage (time series)
Panel 4: Agent Status (stat)
Panel 5: Requests/min (time series)
```

### Simple Web Dashboard

Create `monitoring-dashboard.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>SHADDAI Monitoring</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial; margin: 20px; }
    .metric { display: inline-block; width: 30%; margin: 10px; }
    .status-ok { color: green; }
    .status-warning { color: orange; }
    .status-error { color: red; }
  </style>
</head>
<body>
  <h1>SHADDAI System Monitor</h1>
  
  <div class="metric">
    <h3>Server Status</h3>
    <p id="server-status" class="status-ok">Online</p>
  </div>
  
  <div class="metric">
    <h3>Memory Usage</h3>
    <p id="memory-usage">--</p>
  </div>
  
  <div class="metric">
    <h3>Success Rate</h3>
    <p id="success-rate">--</p>
  </div>
  
  <h2>Response Times</h2>
  <canvas id="responseTimeChart"></canvas>
  
  <h2>Execution Rates</h2>
  <canvas id="executionChart"></canvas>

  <script>
    // Fetch and update metrics every 30 seconds
    async function updateMetrics() {
      try {
        const health = await fetch('/api/health').then(r => r.json());
        const status = await fetch('/api/status').then(r => r.json());
        
        // Update server status
        document.getElementById('server-status').textContent = 
          health.status === 'operational' ? 'Online' : 'Offline';
        
        // Update memory
        document.getElementById('memory-usage').textContent = 
          `${status.memory.used}MB / ${status.memory.available}MB`;
        
        // Update success rate
        const successRate = status.executionStats.successful / status.executionStats.total;
        document.getElementById('success-rate').textContent = 
          (successRate * 100).toFixed(1) + '%';
        
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
        document.getElementById('server-status').textContent = 'Error';
        document.getElementById('server-status').className = 'status-error';
      }
    }
    
    updateMetrics();
    setInterval(updateMetrics, 30000);
  </script>
</body>
</html>
```

## Troubleshooting with Monitoring

### High Response Times

```bash
# Check what tasks are running
curl http://localhost:3000/api/executions?status=RUNNING

# Check memory
curl http://localhost:3000/api/status | jq '.memory'

# Check agent performance
curl http://localhost:3000/api/agents | jq '.[] | {name, avgResponseTime}'
```

### High Failure Rate

```bash
# Get recent failures
curl "http://localhost:3000/api/executions?status=ERROR&limit=20"

# Check which agent is failing
curl "http://localhost:3000/api/executions?status=ERROR&limit=20" | \
  jq '[.[] | .agent] | group_by(.) | map({agent: .[0], count: length})'
```

### Agent Offline

```bash
# Check agent status
curl http://localhost:3000/api/agents | \
  jq '.[] | select(.status != "online")'

# Restart agent
systemctl restart shaddai-nexus
# or
pm2 restart nexus
```

### Memory Leak

```bash
# Monitor memory over time
watch -n 10 'curl -s http://localhost:3000/api/status | jq .memory'

# If memory increases continuously, restart
pm2 restart shaddai

# Profile with heapdump
npm install heapdump
# Add to code: heapdump.writeSnapshot('/heap-' + Date.now() + '.heapsnapshot');
```

## Monitoring Checklist

Daily:
- [ ] Server online
- [ ] All agents online
- [ ] Success rate > 95%
- [ ] Memory < 70%
- [ ] No recent errors

Weekly:
- [ ] Response time trends
- [ ] Storage usage
- [ ] Database integrity check
- [ ] Backup verification
- [ ] Log review

Monthly:
- [ ] Capacity planning review
- [ ] Performance optimization
- [ ] Security audit
- [ ] Disaster recovery test
- [ ] Metrics analysis

---

**For troubleshooting, see [Troubleshooting Guide](TROUBLESHOOTING.md)**

Last Updated: 2026-05-13
