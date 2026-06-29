# SHADDAI Production Deployment Guide v62

Complete guide for deploying the SHADDAI backend to production.

## Pre-Deployment Checklist

- [ ] All tests passing (100% coverage minimum)
- [ ] Security audit completed
- [ ] Performance benchmarks reviewed
- [ ] Database migration plan finalized
- [ ] Backup strategy tested
- [ ] Monitoring and alerting configured
- [ ] Load testing completed (min 5000 req/sec)
- [ ] Disaster recovery plan written
- [ ] Team trained on deployment process
- [ ] Rollback plan documented

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Load Balancer (Nginx/HAProxy)         │
├─────────────────────────────────────────────────┤
│  API Server 1  │  API Server 2  │  API Server 3 │
│  (Node.js)     │  (Node.js)     │  (Node.js)    │
├─────────────────────────────────────────────────┤
│        Shared Database (PostgreSQL)             │
├─────────────────────────────────────────────────┤
│    Redis Cache  │  Message Queue (RabbitMQ)    │
└─────────────────────────────────────────────────┘
```

## Environment Setup

### Node.js Requirements

- Node.js 18.x or higher
- npm 8.x or higher
- For clustering: Node.js with PM2

### System Requirements

- **CPU**: Minimum 4 cores for load
- **RAM**: Minimum 8GB per server
- **Storage**: Minimum 100GB (SSD recommended)
- **Network**: 1Gbps connection minimum
- **OS**: Ubuntu 20.04 LTS or higher (recommended)

### Dependencies Installation

```bash
# Install Node.js (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
cd /opt/shaddai-backend
npm install --production

# Install PM2 globally
sudo npm install -g pm2
```

## Configuration

### Environment Variables

Create `.env` file:

```bash
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database (when migrating from file storage)
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shaddai_prod
DB_USER=shaddai_user
DB_PASSWORD=SECURE_PASSWORD_HERE

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CACHE_PASSWORD_HERE
REDIS_DB=0

# JWT
JWT_SECRET=VERY_LONG_RANDOM_SECRET_STRING_HERE
JWT_EXPIRY=24h

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_RETENTION_DAYS=30

# Performance
MAX_REQUEST_SIZE=50mb
REQUEST_TIMEOUT=30000
DB_POOL_MIN=5
DB_POOL_MAX=20

# Security
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=1000
ALLOWED_ORIGINS=https://example.com,https://www.example.com

# Monitoring
SENTRY_DSN=https://your-sentry-key@sentry.io/project
NEW_RELIC_LICENSE_KEY=your_new_relic_key
DATADOG_API_KEY=your_datadog_key

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_DESTINATION=s3://backup-bucket/shaddai
```

### SSL/TLS Configuration

```bash
# Generate self-signed cert (for testing)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout server.key -out server.crt -days 365

# Use Let's Encrypt in production
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d api.example.com
```

## Database Migration

### From File Storage to PostgreSQL

```sql
-- Create database
CREATE DATABASE shaddai_prod;
CREATE USER shaddai_user WITH PASSWORD 'SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE shaddai_prod TO shaddai_user;

-- Create tables
CREATE TABLE executions (
  execution_id UUID PRIMARY KEY,
  agent_name VARCHAR(255) NOT NULL,
  skill_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  duration INTEGER,
  cost_estimate NUMERIC(10, 6),
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_agent (agent_name),
  INDEX idx_skill (skill_name),
  INDEX idx_status (status),
  INDEX idx_timestamp (timestamp)
);

CREATE TABLE jobs (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL,
  reward NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
);

-- Create other tables similarly
```

### Migration Script

```bash
#!/bin/bash
# migrate-data.sh

echo "Starting data migration..."

# Export from file storage
node migration/export-file-storage.js > /tmp/shaddai-backup.json

# Import to PostgreSQL
node migration/import-postgresql.js /tmp/shaddai-backup.json

# Verify counts
psql -h localhost -U shaddai_user -d shaddai_prod -c "SELECT COUNT(*) FROM executions;"

echo "Migration complete!"
```

## Deployment

### Using PM2

```bash
# Create PM2 ecosystem config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'shaddai-api',
      script: './server-production.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2.log',
      time: true,
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Monitor
pm2 monit
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["node", "server-production.js"]
```

```bash
# Build image
docker build -t shaddai-api:62.0.0 .

# Run container
docker run -d \
  --name shaddai-api \
  --restart always \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=postgres-host \
  -v /data/shaddai:/app/data \
  shaddai-api:62.0.0

# Docker Compose for full stack
docker-compose -f docker-compose.prod.yml up -d
```

### Nginx Reverse Proxy

```nginx
upstream shaddai_backend {
    least_conn;
    server localhost:3000 max_fails=3 fail_timeout=30s;
    server localhost:3001 max_fails=3 fail_timeout=30s;
    server localhost:3002 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;
    gzip_min_length 1000;

    # Logging
    access_log /var/log/nginx/shaddai-access.log combined;
    error_log /var/log/nginx/shaddai-error.log;

    location / {
        proxy_pass http://shaddai_backend;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 24 4k;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://shaddai_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    location /api/ {
        limit_req zone=api_limit burst=200 nodelay;
        proxy_pass http://shaddai_backend;
    }
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}
```

## Monitoring & Observability

### Application Monitoring

```javascript
// monitoring.js
const NewRelic = require('newrelic');
const Sentry = require('@sentry/node');

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});

// Custom metrics
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // New Relic
    NewRelic.recordMetric(`Custom/API/${req.method}/${req.path}`, duration);
    
    // Custom logging
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
});
```

### Health Monitoring

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3000/api/health"
RESPONSE=$(curl -s $HEALTH_URL)
STATUS=$(echo $RESPONSE | jq -r '.status')

if [ "$STATUS" == "operational" ]; then
  exit 0
else
  exit 1
fi
```

### Log Management

```bash
# Install and configure ELK stack
sudo apt-get install elasticsearch logstash kibana

# Configure Logstash
cat > /etc/logstash/conf.d/shaddai.conf << 'EOF'
input {
  file {
    path => "/opt/shaddai/logs/*.log"
    codec => json
  }
}

filter {
  mutate {
    add_field => { "[@metadata][index_name]" => "shaddai-%{+YYYY.MM.dd}" }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "%{[@metadata][index_name]}"
  }
}
EOF

sudo systemctl restart logstash
```

## Backup & Recovery

### Automated Backups

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/shaddai"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U shaddai_user shaddai_prod | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# File storage backup (if not migrated)
tar -czf $BACKUP_DIR/files-$DATE.tar.gz /opt/shaddai/data/

# S3 upload
aws s3 cp $BACKUP_DIR/ s3://backup-bucket/shaddai/ --recursive

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR"
```

### Recovery Procedure

```bash
#!/bin/bash
# restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup-file>"
  exit 1
fi

# Stop application
pm2 stop shaddai-api

# Restore database
gunzip < $BACKUP_FILE | psql -h localhost -U shaddai_user shaddai_prod

# Verify restore
psql -h localhost -U shaddai_user -d shaddai_prod -c "SELECT COUNT(*) FROM executions;"

# Start application
pm2 start shaddai-api

echo "Restore completed!"
```

## Performance Tuning

### Database Optimization

```sql
-- Create indices for common queries
CREATE INDEX idx_executions_agent_timestamp 
  ON executions (agent_name, timestamp DESC);

CREATE INDEX idx_executions_status 
  ON executions (status) WHERE status != 'COMPLETED';

CREATE INDEX idx_jobs_status_created 
  ON jobs (status, created_at DESC);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM executions 
  WHERE agent_name = 'NEXUS' 
  ORDER BY timestamp DESC LIMIT 100;

-- Vacuum and analyze
VACUUM ANALYZE;
```

### Connection Pooling

```javascript
// Use connection pool
const pool = new Pool({
  max: 20,
  min: 5,
  idle: 10000,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
});
```

### Caching Strategy

```javascript
// Redis caching
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});

// Cache agent stats (5 min TTL)
app.get('/api/agents/:name', async (req, res) => {
  const cacheKey = `agent:${req.params.name}`;
  
  // Check cache
  const cached = await client.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Fetch from DB
  const agent = await database.getAgent(req.params.name);
  
  // Cache result
  client.setex(cacheKey, 300, JSON.stringify(agent));
  
  res.json(agent);
});
```

## Security

### SSL/TLS

- Use TLS 1.2 minimum
- Certificate pinning for critical clients
- Regular certificate rotation

### Authentication

```javascript
// JWT validation middleware
const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later'
});

app.use('/api/', limiter);
```

## Scaling

### Horizontal Scaling

1. Deploy multiple API servers
2. Use load balancer (Nginx, HAProxy)
3. Shared database (PostgreSQL with replication)
4. Redis cluster for caching
5. Message queue for async jobs

### Vertical Scaling

1. Increase Node.js cluster workers
2. Increase database connection pool
3. Increase memory allocation
4. Use faster CPU for computational tasks

## Post-Deployment

### Verification

```bash
# Check application health
curl https://api.example.com/api/health

# Monitor logs
tail -f /opt/shaddai/logs/app.log

# Check PM2 processes
pm2 status

# Monitor resource usage
pm2 monit

# Check database connection
psql -h localhost -U shaddai_user -d shaddai_prod -c "\dt"
```

### Rollback Plan

```bash
#!/bin/bash
# rollback.sh

OLD_VERSION=$1

echo "Rolling back to version $OLD_VERSION..."

# Stop current
pm2 stop shaddai-api

# Checkout old version
git checkout v$OLD_VERSION
npm install --production

# Restart
pm2 start shaddai-api

echo "Rollback to $OLD_VERSION complete!"
```

## Support & Troubleshooting

### Common Issues

**Issue**: High memory usage
**Solution**: Check for memory leaks, increase GC frequency, upgrade server

**Issue**: Slow database queries
**Solution**: Add indices, optimize queries, increase connection pool, upgrade database server

**Issue**: WebSocket disconnections
**Solution**: Increase timeout values, check proxy configuration, monitor network

### Debug Mode

```bash
# Enable debug logging
DEBUG=shaddai:* npm start

# Enable Node.js profiling
node --prof server-production.js
node --prof-process isolate-*.log > profile.txt
```

---

*Last Updated: 2026-05-13*
*Version: 62.0.0*
