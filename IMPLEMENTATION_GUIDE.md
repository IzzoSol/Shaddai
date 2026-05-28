# SHADDAI Enhanced Frontend - Implementation Guide

**Quick Start for Integration**

---

## File Overview

### Production File
**Location:** `public/index-enhanced.html`  
**Size:** ~65KB (unminified), ~15KB (minified+gzipped)  
**Dependencies:** None (self-contained)  
**Browser Support:** All modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

---

## Step 1: Deploy

### Option A: Replace Existing
```bash
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD\public
cp index.html index.html.backup
cp index-enhanced.html index.html
```

### Option B: Dual-Deploy (Test First)
```bash
# Keep original at: /index.html
# New version at: /index-new.html
# Test at: http://localhost:3000/index-new.html
```

### Option C: Gradual Rollout
```bash
# Use feature flag
http://localhost:3000/?ui=enhanced
```

---

## Step 2: Connect Backend API

### A. Agent Status (Real-Time)

**Endpoint:** `GET /api/agents/status`

**Response Format:**
```json
[
  {
    "id": "NEXUS",
    "status": "BUILDING",
    "uptime_percent": 99.2,
    "active_tasks": 8,
    "cpu_percent": 62,
    "memory_mb": 680
  }
]
```

**Integration Code:**
```javascript
// In the JavaScript section of index-enhanced.html
function updateAgentStatus() {
  fetch('/api/agents/status')
    .then(r => r.json())
    .then(agents => {
      agents.forEach(agent => {
        const card = document.querySelector(
          `.agent-card:has(.agent-name:contains("${agent.id}"))`
        );
        if (card) {
          card.querySelector('.agent-status').textContent = agent.status;
          card.querySelector('[data-metric="uptime"]').textContent = 
            agent.uptime_percent.toFixed(1) + '%';
          card.querySelector('[data-metric="tasks"]').textContent = 
            agent.active_tasks + ' active';
          card.querySelector('[data-metric="cpu"]').textContent = 
            agent.cpu_percent + '%';
          card.querySelector('[data-metric="memory"]').textContent = 
            agent.memory_mb + 'MB';
        }
      });
    })
    .catch(err => showToast('Failed to fetch agent status', 'error'));
}

// Call every 5 seconds
setInterval(updateAgentStatus, 5000);
```

### B. Job Market (Load Data)

**Endpoint:** `GET /api/jobs?status=open&sort=newest&limit=20`

**Response Format:**
```json
[
  {
    "id": "job_123",
    "title": "API Integration",
    "description": "Build REST API integration...",
    "budget": 1200,
    "status": "open",
    "created_at": "2024-05-13T10:00:00Z"
  }
]
```

**Integration:**
```javascript
function loadJobBoard() {
  fetch('/api/jobs?status=open&sort=newest')
    .then(r => r.json())
    .then(jobs => renderJobGrid(jobs));
}

function renderJobGrid(jobs) {
  const grid = document.querySelector('.job-grid');
  grid.innerHTML = jobs.map(job => `
    <div class="job-card">
      <div class="job-title">${job.title}</div>
      <div class="job-description">${job.description}</div>
      <div class="job-meta">
        <div class="job-budget">$${job.budget.toLocaleString()}</div>
        <div class="job-status-badge ${job.status}">${job.status.toUpperCase()}</div>
      </div>
    </div>
  `).join('');
}

loadJobBoard();
setInterval(loadJobBoard, 30000); // Refresh every 30s
```

### C. Execution History (WebSocket Stream)

**Endpoint:** `wss://api.shaddai.local/execution-stream`

**Message Format:**
```json
{
  "type": "execution_update",
  "id": "exec_456",
  "task": "API Integration",
  "result": "NEXUS deployed API endpoint",
  "progress": 65,
  "timestamp": "2024-05-13T14:32:15Z"
}
```

**Integration:**
```javascript
function connectExecutionStream() {
  const ws = new WebSocket('wss://api.shaddai.local/execution-stream');
  
  ws.onopen = () => {
    console.log('Connected to execution stream');
  };
  
  ws.onmessage = (event) => {
    const execution = JSON.parse(event.data);
    addExecutionItem(execution);
  };
  
  ws.onerror = (error) => {
    showToast('Execution stream error', 'error');
    // Retry after 5s
    setTimeout(connectExecutionStream, 5000);
  };
}

function addExecutionItem(execution) {
  const timeline = document.querySelector('.execution-timeline');
  const item = document.createElement('div');
  item.className = 'execution-item slide-up';
  item.innerHTML = `
    <div class="execution-time">${new Date(execution.timestamp).toLocaleTimeString()}</div>
    <div class="execution-task">${execution.task}</div>
    <div class="execution-result">${execution.result}</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${execution.progress}%;"></div>
    </div>
  `;
  timeline.insertBefore(item, timeline.firstChild);
  
  // Keep only last 10 items
  while (timeline.children.length > 10) {
    timeline.removeChild(timeline.lastChild);
  }
}

connectExecutionStream();
```

### D. Generated Files (List & Download)

**Endpoint:** `GET /api/files?agent=NEXUS&sort=newest`

**Response Format:**
```json
[
  {
    "id": "file_789",
    "name": "API_Documentation.pdf",
    "size_bytes": 2457600,
    "type": "document",
    "agent": "NEXUS",
    "created_at": "2024-05-13T14:32:15Z",
    "url": "/files/download/file_789"
  }
]
```

**Integration:**
```javascript
function loadFiles(agentFilter = 'all') {
  const query = agentFilter === 'all' 
    ? '/api/files?sort=newest'
    : `/api/files?agent=${agentFilter}&sort=newest`;
    
  fetch(query)
    .then(r => r.json())
    .then(files => renderFileGrid(files));
}

function renderFileGrid(files) {
  const grid = document.querySelector('.file-grid');
  const typeIcons = {
    document: '📄',
    data: '📊',
    code: '💻',
    image: '🖼️',
    video: '🎬',
    audio: '🎵'
  };
  
  grid.innerHTML = files.map(file => `
    <div class="file-item">
      <div class="file-icon">${typeIcons[file.type] || '📁'}</div>
      <div class="file-name">${file.name}</div>
      <div class="file-size">${(file.size_bytes / 1024 / 1024).toFixed(1)} MB</div>
      <div class="file-actions">
        <button class="file-action-btn" onclick="window.open('${file.url}')">View</button>
        <button class="file-action-btn" onclick="downloadFile('${file.url}', '${file.name}')">Download</button>
      </div>
    </div>
  `).join('');
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  showToast(`Downloading ${filename}...`, 'success');
}

loadFiles();

// Filter when agent selected
document.querySelectorAll('[data-agent]').forEach(chip => {
  chip.addEventListener('click', () => {
    const agent = chip.dataset.agent;
    loadFiles(agent === 'all' ? 'all' : agent);
  });
});
```

### E. Performance Analytics (Charts)

**Endpoint:** `GET /api/analytics/performance?period=week`

**Response Format:**
```json
{
  "success_rates": {
    "SHADDAI": 98.5,
    "NEXUS": 97.2,
    "TURTLE": 96.8,
    "ORACLE": 99.1
  },
  "response_times": {
    "ZEROX": 450,
    "QUILL": 320,
    "PIKADON": 280
  },
  "weekly_activity": [40, 65, 75, 90, 85, 70, 45]
}
```

**Integration:**
```javascript
function updatePerformanceCharts() {
  fetch('/api/analytics/performance?period=week')
    .then(r => r.json())
    .then(data => {
      // Update success rates
      Object.entries(data.success_rates).forEach(([agent, rate]) => {
        const statBox = document.querySelector(
          `.stat-box:has(.stat-label:contains("${agent}"))`
        );
        if (statBox) {
          statBox.querySelector('.stat-value').textContent = rate.toFixed(1) + '%';
        }
      });
      
      // Update weekly activity chart
      const chart = document.querySelector('.chart-container');
      chart.innerHTML = data.weekly_activity.map((height, i) => `
        <div class="chart-bar" style="height: ${height * 1}%;"></div>
      `).join('');
    });
}

updatePerformanceCharts();
```

### F. Wallet & Transactions

**Endpoint:** `GET /api/wallet/transactions?limit=10`

**Response Format:**
```json
{
  "balance": 12450.80,
  "pending": 840.50,
  "transactions": [
    {
      "id": "txn_001",
      "type": "job_completed",
      "description": "API Integration",
      "amount": 1200.00,
      "timestamp": "2024-05-13T14:32:15Z"
    }
  ]
}
```

**Integration:**
```javascript
function updateWallet() {
  fetch('/api/wallet/transactions?limit=10')
    .then(r => r.json())
    .then(data => {
      // Update balance
      document.querySelector('.wallet-balance').textContent = 
        '$' + data.balance.toLocaleString('en-US', {maximumFractionDigits: 2});
      
      // Update transaction list
      const list = document.querySelector('.transaction-list');
      list.innerHTML = data.transactions.map(txn => `
        <div class="transaction-item">
          <div>
            <div class="transaction-type">${txn.description}</div>
            <div style="font-size: 8px; color: var(--text-muted);">
              ${new Date(txn.timestamp).toLocaleString()}
            </div>
          </div>
          <div class="transaction-amount ${txn.amount < 0 ? 'negative' : ''}">
            ${txn.amount > 0 ? '+' : ''}$${Math.abs(txn.amount).toFixed(2)}
          </div>
        </div>
      `).join('');
    });
}

updateWallet();
setInterval(updateWallet, 10000); // Update every 10s
```

---

## Step 3: Authentication & Security

### Add Auth Token to Requests

```javascript
const API_KEY = localStorage.getItem('api_key');
const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

fetch('/api/agents/status', { headers })
  .then(r => r.json())
  .then(data => console.log(data));
```

### Refresh Token on 401

```javascript
async function fetchWithAuth(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${localStorage.getItem('api_key')}`
    }
  });

  if (response.status === 401) {
    // Token expired, refresh
    const refreshToken = localStorage.getItem('refresh_token');
    const tokenResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (tokenResponse.ok) {
      const { access_token } = await tokenResponse.json();
      localStorage.setItem('api_key', access_token);
      
      // Retry original request
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${access_token}`
        }
      });
    } else {
      // Redirect to login
      window.location.href = '/login';
    }
  }

  return response;
}
```

---

## Step 4: Environment Configuration

### Create `.env.js`

```javascript
// public/.env.js
window.CONFIG = {
  API_BASE: process.env.API_BASE || 'http://localhost:3000/api',
  WS_BASE: process.env.WS_BASE || 'ws://localhost:3000',
  THEME: localStorage.getItem('theme') || 'default',
  POLLING_INTERVAL: 5000,
  MAX_RETRIES: 3
};
```

### Load in HTML

```html
<script src="/config.js"></script>
<script>
  const API = window.CONFIG.API_BASE;
  fetch(`${API}/agents/status`);
</script>
```

---

## Step 5: Testing Integration

### Health Check
```javascript
async function healthCheck() {
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    console.log('System Health:', health);
    return health.status === 'ok';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// On page load
window.addEventListener('load', async () => {
  if (await healthCheck()) {
    showToast('System Status: All Systems Operational', 'success');
  } else {
    showToast('System Status: Connection failed', 'error');
  }
});
```

### Network Tab Debugging
1. Open DevTools (F12)
2. Go to Network tab
3. Perform actions (load jobs, update wallet, etc.)
4. Watch requests:
   - Should see `/api/` calls
   - Status should be 200-299
   - Responses should be valid JSON

---

## Step 6: Customization

### Change Colors for Your Brand

```javascript
// In the <script> section
const THEME_CONFIG = {
  default: {
    accent: '#00e5a0',
    bg_deep: '#020817',
    text_primary: '#e8edf5'
  },
  custom: {
    accent: '#FF6B6B',      // Your brand color
    bg_deep: '#0A0E27',
    text_primary: '#FFFFFF'
  }
};

document.documentElement.style.setProperty('--accent', THEME_CONFIG.custom.accent);
document.documentElement.style.setProperty('--bg-deep', THEME_CONFIG.custom.bg_deep);
document.documentElement.style.setProperty('--text-primary', THEME_CONFIG.custom.text_primary);
```

### Add Custom Navigation Items

```javascript
// Add to mainNav
const customNav = document.querySelector('#mainNav');
const newBtn = document.createElement('button');
newBtn.className = 'nav-btn';
newBtn.textContent = 'Custom View';
newBtn.dataset.view = 'customView';
newBtn.addEventListener('click', () => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('customView').classList.add('active');
});
customNav.appendChild(newBtn);
```

---

## Troubleshooting

### Issue: Blank Page
**Solution:** Check browser console (F12). Look for:
- CSS/JS load errors
- CORS issues
- Network request failures

### Issue: Styles Not Applying
**Solution:** 
```javascript
// Force CSS refresh
document.querySelector('link[rel="stylesheet"]').href += '?v=' + Date.now();
```

### Issue: Data Not Loading
**Solution:** Check API endpoint
```javascript
fetch('/api/agents/status')
  .then(r => {
    console.log('Response status:', r.status);
    return r.json();
  })
  .then(data => console.log('Data:', data))
  .catch(err => console.error('Error:', err));
```

### Issue: Toast Notifications Not Showing
**Solution:** Ensure toast container exists
```html
<div class="toast-container" id="toastContainer"></div>
```

---

## Performance Optimization

### Minify CSS/JS
```bash
npm install -g terser cleancss-cli

# Minify JS
terser index-enhanced.html -o index-enhanced.min.html

# Minify CSS
cleancss -o styles.min.css styles.css
```

### Enable Caching Headers
```nginx
# nginx.conf
location ~* index-enhanced.html {
  expires 1h;
  add_header Cache-Control "public, max-age=3600";
}

location ~* \.(js|css|gif|jpg|jpeg|png|svg|ico|woff2|ttf|eot)$ {
  expires 30d;
  add_header Cache-Control "public, max-age=2592000, immutable";
}
```

### Lazy Load Non-Critical
```javascript
// Defer non-critical scripts
document.addEventListener('DOMContentLoaded', () => {
  loadPerformanceCharts();  // After main render
  connectExecutionStream(); // Background WebSocket
});
```

---

## Deployment Checklist

- [ ] API endpoints configured
- [ ] Auth tokens setup
- [ ] WebSocket connection tested
- [ ] All themes working
- [ ] Toast notifications firing
- [ ] Navigation switching views
- [ ] Mobile responsive checked
- [ ] Performance acceptable (Lighthouse)
- [ ] Security headers present
- [ ] Error logging working
- [ ] Analytics tracking configured

---

## Support

For issues or questions:
1. Check the audit report: `AUDIT_AND_ENHANCEMENTS.md`
2. Review implementation examples above
3. Test in browser console
4. Check network requests in DevTools

**Good luck with your deployment!** 🚀

---

**Created by TURTLE** 🎨  
SHADDAI UI/UX Design Team
