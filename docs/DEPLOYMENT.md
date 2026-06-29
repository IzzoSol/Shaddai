# SHADDAI Deployment Guide

Complete guide for deploying SHADDAI to production environments.

## Pre-Deployment Checklist

Before deploying to production, verify all items:

```
✓ Code Changes
  □ All features tested locally
  □ No hardcoded credentials
  □ Environment variables configured
  □ API endpoints verified
  □ Error handling working

✓ Security
  □ HTTPS configured
  □ JWT secrets strong (32+ chars)
  □ Rate limiting enabled
  □ CORS properly configured
  □ Input validation enabled
  □ Password hashing enabled

✓ Database
  □ Data backup strategy defined
  □ Connection strings secured
  □ Migration scripts tested
  □ Rollback plan documented

✓ Infrastructure
  □ Server capacity adequate
  □ Monitoring set up
  □ Logging configured
  □ Load balancing ready
  □ Auto-scaling configured

✓ Testing
  □ All unit tests passing
  □ Integration tests passing
  □ Load testing completed
  □ Security scanning done
  □ Smoke tests ready

✓ Documentation
  □ Runbooks written
  □ Emergency procedures documented
  □ Team trained
  □ Contacts list updated
```

## Deployment Strategies

### Strategy 1: Local Development (Quick Start)

Best for: Testing, demos, development

```powershell
# Windows PowerShell
.\START-SERVER.ps1

# Windows Command Prompt
START-SERVER.bat

# macOS/Linux
npm start
```

Runs on `http://localhost:3000`

### Strategy 2: PM2 Process Manager (Recommended)

Best for: Production, auto-restart, monitoring

#### Installation

```bash
npm install -g pm2
```

#### Starting with PM2

```bash
# Start SHADDAI with PM2
pm2 start backend/server-production.js --name "shaddai"

# View logs
pm2 logs shaddai

# Monitor
pm2 monit

# View status
pm2 list
```

#### Configuration (ecosystem.config.js)

Create `ecosystem.config.js` in the root directory:

```javascript
module.exports = {
  apps: [
    {
      name: 'shaddai',
      script: './backend/server-production.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/shaddai-error.log',
      out_file: './logs/shaddai-out.log',
      max_memory_restart: '1G',
      merge_logs: true
    }
  ]
};
```

#### Starting with Config

```bash
pm2 start ecosystem.config.js
pm2 save          # Save process list for auto-start on reboot
pm2 startup       # Generate startup script
```

#### Auto-Restart on Reboot

```bash
# Generate startup script
pm2 startup

# Make it permanent
pm2 save

# Check startup status
pm2 startup -u <username>
```

### Strategy 3: Docker Deployment

Best for: Cloud deployment, consistency

#### Create Dockerfile

```dockerfile
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["npm", "start"]
```

#### Create .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
README.md
docs/
generated-output/
*.log
.env.local
```

#### Build and Run

```bash
# Build image
docker build -t shaddai:latest .

# Run container
docker run -d \
  --name shaddai \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -v /data/generated-output:/app/generated-output \
  shaddai:latest

# View logs
docker logs -f shaddai

# Stop container
docker stop shaddai
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  shaddai:
    build: .
    container_name: shaddai
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      LOG_LEVEL: info
    volumes:
      - ./generated-output:/app/generated-output
      - ./logs:/app/logs
    restart: always
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
```

Run with:
```bash
docker-compose up -d
docker-compose logs -f
```

### Strategy 4: Kubernetes Deployment

Best for: Large scale, high availability

#### Create Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shaddai
  labels:
    app: shaddai
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shaddai
  template:
    metadata:
      labels:
        app: shaddai
    spec:
      containers:
      - name: shaddai
        image: shaddai:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/status
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: output
          mountPath: /app/generated-output
      volumes:
      - name: output
        persistentVolumeClaim:
          claimName: shaddai-output
---
apiVersion: v1
kind: Service
metadata:
  name: shaddai-service
spec:
  selector:
    app: shaddai
  ports:
  - protocol: TCP
    port: 3000
    targetPort: 3000
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f deployment.yaml
kubectl get deployments
kubectl logs deployment/shaddai
```

### Strategy 5: Cloud Deployment (AWS/Azure/GCP)

#### AWS Elastic Beanstalk

1. Create `.ebextensions/nodecommand.config`:
```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
```

2. Deploy:
```bash
eb init
eb create shaddai-env
eb deploy
```

#### Azure App Service

1. Create `web.config`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="backend/server-production.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^server-production\.js\/debug[\/]?" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

2. Deploy via Azure CLI:
```bash
az webapp up --name shaddai --resource-group myResourceGroup
```

#### Google Cloud Run

1. Deploy:
```bash
gcloud run deploy shaddai \
  --source . \
  --platform managed \
  --region us-central1 \
  --port 3000
```

## Environment Configuration

### Required Environment Variables

Create `.env` file:

```env
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Security
JWT_SECRET=your-secret-key-at-least-32-characters-long
SESSION_SECRET=your-session-secret-key

# CORS
CORS_ORIGIN=https://yourdomain.com

# Agents
AGENT_TIMEOUT=60000
AGENT_RETRY_COUNT=3

# Database
DB_TYPE=file
DB_PATH=./data

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Logging
LOG_FILE_PATH=./logs/shaddai.log
```

### Load from Environment

In `backend/server-production.js`:

```javascript
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

## Reverse Proxy Setup (HTTPS)

### Nginx Configuration

Create `/etc/nginx/sites-available/shaddai`:

```nginx
upstream shaddai_backend {
  server localhost:3000;
}

server {
  listen 80;
  server_name yourdomain.com;
  
  # Redirect HTTP to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name yourdomain.com;
  
  # SSL certificates (use Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
  
  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  
  # Compression
  gzip on;
  gzip_types text/plain text/css application/json application/javascript;
  
  # Proxy settings
  location / {
    proxy_pass http://shaddai_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
  }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/shaddai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Let's Encrypt (Free HTTPS)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com
sudo certbot renew --dry-run  # Test auto-renewal
```

## Scaling

### Horizontal Scaling

Run multiple instances behind load balancer:

```nginx
upstream shaddai {
  least_conn;
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
}
```

Or with PM2:

```bash
pm2 start ecosystem.config.js -i max  # max = number of CPU cores
```

### Vertical Scaling

Increase server resources:
- CPU cores (for concurrency)
- RAM (for execution caching)
- Disk space (for generated files)

## Monitoring & Maintenance

### Health Monitoring

```bash
# Check health endpoint
curl https://yourdomain.com/api/health

# Monitor logs
tail -f /var/log/shaddai.log

# Check PM2 status
pm2 monit
```

### Backup Strategy

```bash
# Daily backup of generated files
0 2 * * * /usr/bin/tar -czf /backup/shaddai-$(date +\%Y\%m\%d).tar.gz /app/generated-output

# Weekly backup of database
0 3 * * 0 /usr/bin/tar -czf /backup/shaddai-db-$(date +\%Y\%m\%d).tar.gz /app/data
```

### Log Rotation

Create `/etc/logrotate.d/shaddai`:

```
/app/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 nobody nobody
}
```

## Deployment Checklist

```
Pre-Deployment
□ All tests passing
□ Code reviewed
□ Security scan completed
□ Performance tested

Deployment
□ Database backed up
□ Environment variables set
□ SSL/HTTPS configured
□ Reverse proxy running
□ Server started successfully

Post-Deployment
□ Health check passing
□ API responding
□ Frontend loads
□ Agents connected
□ Monitoring active
□ Logs reviewing
□ Performance baseline taken
```

## Rollback Procedure

If deployment fails:

```bash
# Stop current version
pm2 stop shaddai

# Restore from backup
git checkout HEAD~1
npm install

# Restart with previous version
pm2 start shaddai

# Verify
curl https://yourdomain.com/api/health
```

## Common Issues

### Out of Memory

```bash
# Check memory usage
free -h

# Increase Node.js heap
node --max-old-space-size=4096 backend/server-production.js

# Or via PM2
pm2 start ecosystem.config.js --max-memory-restart 2G
```

### High CPU Usage

```bash
# Check what's using CPU
top -p $(pgrep -f "server-production.js")

# Profile execution
node --prof backend/server-production.js
```

### Connection Refused

```bash
# Check port is listening
netstat -tlnp | grep 3000

# Check firewall
sudo ufw allow 3000
```

---

**For monitoring, see [Monitoring Guide](MONITORING.md)**

**For troubleshooting, see [Troubleshooting Guide](TROUBLESHOOTING.md)**

Last Updated: 2026-05-13
