/**
 * SHADDAI PRODUCTION SERVER v62 — Enhanced Backend
 * Features: WebSocket support, compression, caching, batch jobs, real-time updates
 * Port: 3000
 */

// Load env from backend/.env (next to this file) regardless of where node is launched.
// On Render, env vars come from the dashboard and are already in process.env.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
// Shared response/error contract + secret-redaction helpers.
const { redactUrl, redactObject } = require('./lib/respond');

// Core systems
const DatabaseReal = require('./database-real');
const SkillOrchestrator = require('./skill-orchestrator');
const SkillExecutorReal = require('./skill-executor-real');
const AuthService = require('./auth-service');
const { softAuth } = require('./auth-guard');
const BillingService = require('./billing-service');
const SecurityHardening = require('./security-hardening');

// Job & Agent Systems
const JobWorkflowEngine = require('./job-workflow');
const AgentInvocationEngine = require('./agent-invocation');

// TURTLE Video System
const { router: turtleRouter } = require('./turtle-video-endpoints');

// External APIs
const externalAPIs = require('./external-apis');

// Agent Integration
const agentIntegration = require('./agent-integration');

// Proxy Routes (all missing API endpoints for the dashboard)
const apiProxyRoutes = require('./api-proxy-routes');
const freeApis = require('./freeApis');

// ============================================
// PRODUCTION ENHANCEMENTS
// ============================================

// In-memory cache with TTL
class CacheLayer {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  set(key, value, ttlMs = 60000) {
    this.cache.set(key, value);

    // Clear existing TTL
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
    }

    // Set new TTL
    const timeout = setTimeout(() => {
      this.cache.delete(key);
      this.ttls.delete(key);
    }, ttlMs);

    this.ttls.set(key, timeout);
  }

  get(key) {
    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }
    this.misses++;
    return null;
  }

  clear() {
    for (const timeout of this.ttls.values()) {
      clearTimeout(timeout);
    }
    this.cache.clear();
    this.ttls.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : ((this.hits / total) * 100).toFixed(1);
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      totalRequests: total
    };
  }
}

// Structured logging
class Logger {
  constructor() {
    this.logDir = path.join(__dirname, 'logs');
    this._ensureLogDir();
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _formatTimestamp() {
    return new Date().toISOString();
  }

  _write(level, component, message, data = {}) {
    // Secret redaction on the write path: strip tokens/keys/wallets/coords from
    // the logged data, and redact any URL-bearing fields, so secrets never land
    // in logs/*.log or the console. Never throws — falls back to raw on error.
    let safeData = data;
    try {
      safeData = redactObject(data);
      for (const k of ['url', 'originalUrl', 'path', 'requestUrl', 'href', 'endpoint']) {
        if (safeData && typeof safeData[k] === 'string') safeData[k] = redactUrl(safeData[k]);
      }
    } catch (_) { safeData = data; }

    const logEntry = {
      timestamp: this._formatTimestamp(),
      level,
      component,
      message,
      ...safeData
    };

    console.log(`[${level}] [${component}] ${message}`, safeData);

    // Write to file (daily rotation)
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${date}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  info(component, message, data) {
    this._write('INFO', component, message, data);
  }

  error(component, message, data) {
    this._write('ERROR', component, message, data);
  }

  warn(component, message, data) {
    this._write('WARN', component, message, data);
  }

  debug(component, message, data) {
    this._write('DEBUG', component, message, data);
  }
}

// Request tracking
class RequestTracker {
  constructor() {
    this.requests = new Map();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      endpoints: new Map()
    };
  }

  trackRequest(requestId, method, path) {
    this.requests.set(requestId, {
      id: requestId,
      method,
      path,
      startTime: Date.now(),
      status: null,
      duration: null,
      error: null
    });
  }

  completeRequest(requestId, status, error = null) {
    const request = this.requests.get(requestId);
    if (!request) return;

    request.status = status;
    request.duration = Date.now() - request.startTime;
    request.error = error;

    // Update metrics
    this.metrics.totalRequests++;
    if (status < 400) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Track by endpoint
    const key = `${request.method} ${request.path}`;
    if (!this.metrics.endpoints.has(key)) {
      this.metrics.endpoints.set(key, {
        count: 0,
        avgTime: 0,
        errors: 0
      });
    }

    const endpoint = this.metrics.endpoints.get(key);
    endpoint.count++;
    endpoint.avgTime = (endpoint.avgTime + request.duration) / endpoint.count;
    if (status >= 400) endpoint.errors++;

    // Remove old request
    setTimeout(() => this.requests.delete(requestId), 60000);
  }

  getMetrics() {
    const total = this.metrics.totalRequests || 1;
    return {
      totalRequests: this.metrics.totalRequests,
      successRate: `${((this.metrics.successfulRequests / total) * 100).toFixed(1)}%`,
      errorRate: `${((this.metrics.failedRequests / total) * 100).toFixed(1)}%`,
      topEndpoints: Array.from(this.metrics.endpoints.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([key, stats]) => ({ endpoint: key, ...stats }))
    };
  }
}

// Job queue for batch execution
class BatchJobQueue {
  constructor(database) {
    this.database = database;
    this.jobs = new Map();
    this.queue = [];
    this.processing = false;
  }

  createJob(jobData) {
    const jobId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const job = {
      id: jobId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      total: jobData.tasks.length,
      tasks: jobData.tasks,
      results: [],
      errors: []
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.processQueue();

    return job;
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job) continue;

      job.status = 'processing';
      job.startedAt = new Date().toISOString();

      try {
        for (let i = 0; i < job.tasks.length; i++) {
          const task = job.tasks[i];
          try {
            // Execute task (would call actual executor)
            const result = {
              taskIndex: i,
              status: 'completed',
              result: task.data
            };
            job.results.push(result);
          } catch (error) {
            job.errors.push({
              taskIndex: i,
              error: error.message
});

/* ──────────────────────────────────────────────
   FREE-API ENDPOINTS (DexScreener, CoinGecko, Reddit, Twitter, etc.)
   ────────────────────────────────────────────── */
app.get('/api/free/coingecko', async (req, res) => {
  try {
    const coins = await freeApis.fetchCoingeckoCoins(200);
    res.json({ ok: true, coins });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/free/boosted', async (req, res) => {
  try {
    const coins = await freeApis.fetchBoostedCoins(25);
    res.json({ ok: true, assets: coins });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/free/news', async (req, res) => {
  try {
    const headlines = await freeApis.fetchGoogleNews();
    res.json({ ok: true, headlines });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/free/sentiment', async (req, res) => {
  try {
    const posts = await freeApis.fetchRedditSentiment('crypto');
    res.json({ ok: true, posts });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/free/twitter', async (req, res) => {
  try {
    const query = req.query.q?.toLowerCase() || 'crypto';
    const tweets = await freeApis.fetchTwitterSentiment(query);
    res.json({ ok: true, tweets });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* Boosted + Top-25 combined */
app.get('/api/markets/boosted-and-top', async (req, res) => {
  try {
    const result = await freeApis.getBoostedAndTop();
    res.json(result);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});
          }
          job.progress = i + 1;
        }

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
      } catch (error) {
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
        job.errors.push({ global: error.message });
      }
    }

    this.processing = false;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }
}

// ============================================
// INITIALIZE SERVICES
// ============================================

const app = express();
// Behind Render's reverse proxy: trust the first proxy hop so req.ip and
// rate-limit keys use the real client IP (X-Forwarded-For), not the proxy.
app.set('trust proxy', 1);
// Don't advertise the framework.
app.disable('x-powered-by');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const logger = new Logger();
const cache = new CacheLayer();
const requestTracker = new RequestTracker();

// Middleware
// Compression BUFFERS Server-Sent Events — a streaming route would deliver every
// event in one lump at the end, which is exactly the hang we are fixing. Skip
// compression whenever the response is (or declares itself) an event stream.
app.use(compression({
  filter: (req, res) => {
    const ct = String(res.getHeader('Content-Type') || '');
    if (ct.includes('text/event-stream')) return false;
    if (String(res.getHeader('X-Accel-Buffering') || '') === 'no') return false;
    if (String(res.getHeader('Cache-Control') || '').includes('no-transform')) return false;
    if (String(req.headers.accept || '').includes('text/event-stream')) return false;
    return compression.filter(req, res);
  }
}));
// Stripe webhook MUST see the raw body for signature verification — register it
// BEFORE express.json() so the JSON parser doesn't consume the body first.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./stripe-webhook'));
// Sparks/subscription paywall webhook — also raw body, also BEFORE express.json().
app.post('/api/sub-billing/webhook', express.raw({ type: 'application/json' }), require('./sub-billing-webhook'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
// Phase 0 · DID identity — attach req.did/req.didDocument when a did:key is presented
// (X-DID header / Authorization: DID <did> / ?did= / body.did). Never blocks a request.
try { app.use(require('./middleware/did-resolver').didResolverMiddleware); } catch (e) { console.warn('[did] resolver not mounted:', e.message); }
// Never let browsers cache HTML pages — they must always fetch the latest build. (Static assets like
// JS/images still cache normally; those are cache-busted with ?v= query strings.) This stops the
// recurring "it's still broken / showing the old version" problem where a stale cached page is served.
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Serve MiroFish React app
app.use('/mirofish', express.static(path.join(__dirname, '../public/mirofish'), {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

app.use(express.static(path.join(__dirname, '../public'), {
  index: false,   // don't auto-serve index.html for '/' — the '/' route serves the landing (home.html); '/dashboard' serves the app
  setHeaders: (res, filePath) => {
    // HTML + the service worker must never be cached, so new builds + the kill-switch
    // always reach the browser (a cached sw.js would let a stale worker survive updates).
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Quick Start generated sites — served with directory-index enabled so a generated
// site is reachable at the pretty URL /sites/<slug>/ . The global static mount above
// sets index:false, so without this a directory request falls through to the SPA
// catch-all and returns the dashboard instead of the generated page.
app.use('/sites', express.static(path.join(__dirname, '../public/sites'), {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Request tracking middleware
app.use((req, res, next) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  req.id = requestId;
  requestTracker.trackRequest(requestId, req.method, req.path);

  res.on('finish', () => {
    requestTracker.completeRequest(requestId, res.statusCode);
  });

  next();
});

// Security — restrict CORS to localhost origins only (prevents malicious pages from calling our file APIs)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
        "https://s3.tradingview.com",
        "https://s.tradingview.com",
        "https://www.gstatic.com",   // Firebase SDK
        "https://apis.google.com"    // Google / Firebase auth
      ],
      // The dashboard UI is built on inline event handlers (onclick=, onchange=, …).
      // Helmet's default is scriptSrcAttr:'none', which SILENTLY BLOCKS all of them —
      // making buttons/chat/SEND appear "dead". Explicitly allow inline handlers so the
      // existing UI actually works. (Consistent with scriptSrc 'unsafe-inline' above.)
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: [
        "'self'", "wss:", "blob:", "data:",   // blob:/data: → GLTFLoader fetch()es embedded GLB textures via blob URLs

        "https://*.googleapis.com", "https://*.firebaseapp.com",
        "http://localhost:3000", "ws://localhost:3000",
        "http://localhost:8000", "http://localhost:8001", "http://localhost:8002",
        "http://localhost:8003", "http://localhost:8004", "http://localhost:8005",
        "http://localhost:8008", "http://localhost:8010",
        "http://localhost:11434",
        "https://api.github.com",
        "https://api.anthropic.com",
        "https://openrouter.ai",
        "https://api.openai.com",
        "https://generativelanguage.googleapis.com",
        "https://api.telegram.org",
        "https://mainnet.helius-rpc.com",
        "https://api.coinlore.net",
        "https://api.coingecko.com",
        "https://api.dexscreener.com",
        "https://quote-api.jup.ag",
        "https://lite.rpc.solana.com",
        "https://serpapi.com",
        "https://api.elevenlabs.io",
        "https://api.acedata.cloud",
        "https://pollinations.ai",
        "https://image.pollinations.ai",
        "https://api.minimax.chat",
        "https://api.together.xyz",
        "https://api.openweathermap.org",
        "https://newsapi.org",
        // Firebase auth
        "https://www.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://shaddai999.firebaseapp.com",
        // SHADDAI Clipper engine (local + Render)
        "http://localhost:8787", "http://127.0.0.1:8787", "https://shaddai-clipper.onrender.com",
        // Fontshare CSS
        "https://api.fontshare.com"
      ],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://api.fontshare.com", "https://cdn.fontshare.com"],
      frameSrc: ["'self'", "https://calendly.com", "https://calendar.google.com", "https://s.tradingview.com",
        "https://shaddai999.firebaseapp.com", "https://accounts.google.com",
        "http://localhost:8787", "https://shaddai-clipper.onrender.com"],
      mediaSrc: ["'self'", "blob:", "data:"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: (origin, cb) => {
    // Allow: no origin (same-origin, curl), file:// (string 'null'), localhost/127.0.0.1,
    // this app's OWN deployed origin (*.onrender.com — the dashboard is served same-origin),
    // and any extra origins listed in ALLOWED_ORIGINS (comma-separated).
    const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin
        || origin === 'null'
        || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        || origin.startsWith('file://')
        || /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin)
        || extra.includes(origin)) {
      cb(null, true);
    } else {
      // Deny WITHOUT throwing — throwing here escalates to a 500 that breaks EVERY request.
      // Just withhold CORS headers; the browser blocks cross-origin, same-origin still works.
      cb(null, false);
    }
  },
  credentials: false
}));

// Services
const database = new DatabaseReal();
const skillExecutor = new SkillExecutorReal();
const authService = AuthService;
const billingService = BillingService;
const jobWorkflow = new JobWorkflowEngine(database);
const agentInvocation = new AgentInvocationEngine(database);

// Agent definitions
const AGENTS = {
  SHADDAI: { name: 'SHADDAI', role: 'Supreme Orchestrator', port: 8000 },
  NEXUS: { name: 'NEXUS', role: 'Technical Architect', port: 8003 },
  TURTLE: { name: 'TURTLE', role: 'UI/UX & Creative', port: 8004 },
  PIKADON: { name: 'PIKADON', role: 'Security & Compliance', port: 8008 },
  QUILL: { name: 'QUILL', role: 'Writing & Communication', port: 8005 },
  ZEROX: { name: 'ZEROX', role: 'Wealth & Revenue Engine', port: 8001 },
  ORACLE: { name: 'ORACLE', role: 'Research & Intelligence', port: 8002 }
};

// WebSocket connections
const wsConnections = new Map();

// ── SHADDAI multiplayer relay (grafted from mp-server.js — shares this same WS server).
//    Game clients (game.html) speak {t:'hello'|'move'|'region'|'chat'}; the app speaks
//    {action,...}. We route by that and tag game clients on 'hello', relaying player state
//    only among game clients so the pixel-world multiplayer works on this single service. ──
const mpPlayers = new Map(); let mpNextId = 1;
function mpBcast(obj, exceptWs){ const s = JSON.stringify(obj);
  for (const c of wss.clients){ if (c !== exceptWs && c.readyState === WebSocket.OPEN && c.__isGame){ try { c.send(s); } catch(e){} } } }

wss.on('connection', (ws, req) => {
  const clientId = crypto.randomBytes(8).toString('hex');
  wsConnections.set(clientId, ws);
  logger.info('WEBSOCKET', `Client connected: ${clientId}`);

  // multiplayer: hand this connection an id + the current game roster (ignored by app clients)
  const mpid = 'mp' + (mpNextId++); ws.__mpid = mpid;
  try { ws.send(JSON.stringify({ t:'welcome', id: mpid }));
        for (const [, pl] of mpPlayers) ws.send(JSON.stringify({ t:'state', ...pl })); } catch(e){}

  ws.on('message', (message) => {
    let data; try { data = JSON.parse(message); } catch (error) { try { ws.send(JSON.stringify({ error: 'Invalid message format' })); } catch(_){} return; }
    if (data && data.t) {   // ── game (pixel-world) relay message ──
      const t = data.t;
      if (t === 'hello') { ws.__isGame = true; mpPlayers.set(mpid, { id:mpid, name:String(data.name||'Traveler').slice(0,16), region:data.region||null, col:(data.col|0)||30, row:(data.row|0)||30, anim:'idle', rig:data.rig||null }); mpBcast({ t:'state', ...mpPlayers.get(mpid) }, ws); }
      else if (t === 'move') { const pl = mpPlayers.get(mpid); if (pl) { pl.col=data.col; pl.row=data.row; pl.anim=data.anim; if (data.region) pl.region=data.region; mpBcast({ t:'state', ...pl }, ws); } }
      else if (t === 'region') { const pl = mpPlayers.get(mpid); if (pl) { pl.region=data.region; mpBcast({ t:'state', ...pl }, ws); } }
      else if (t === 'chat') { const pl = mpPlayers.get(mpid); const text=String(data.text||'').slice(0,200); if (pl && text) mpBcast({ t:'chat', id:mpid, name:pl.name, region:pl.region, text }); }
      return;
    }
    try { handleWebSocketMessage(clientId, data, ws); } catch (error) { try { ws.send(JSON.stringify({ error: 'Invalid message format' })); } catch(_){} }
  });

  ws.on('close', () => {
    wsConnections.delete(clientId);
    if (mpPlayers.has(mpid)) { mpPlayers.delete(mpid); mpBcast({ t:'leave', id: mpid }); }
    logger.info('WEBSOCKET', `Client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    logger.error('WEBSOCKET', `Error with client ${clientId}`, { error: error.message });
  });
});

function broadcastUpdate(type, data) {
  const message = JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    data
  });

  for (const ws of wsConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function handleWebSocketMessage(clientId, data, ws) {
  const { action, payload } = data;

  switch (action) {
    case 'subscribe':
      ws.send(JSON.stringify({
        type: 'subscribed',
        channel: payload.channel,
        clientId
      }));
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;

    default:
      ws.send(JSON.stringify({ error: 'Unknown action' }));
  }
}

// ============================================
// HEALTH & STATUS
// ============================================

// x402 payment discovery (HTTP 402 micropayments — primary rail; free unless X402_ENABLED)
app.get('/.well-known/x402.json', (req, res) => res.json(require('./lib/x402').discovery()));

// ===== CITY ROUTES — Phase A =====
app.get('/api/city/plots', (req, res) => {
  const plots = Array.from({length: 30}, (_, i) => ({
    id: 'plot-founders-' + i, slot: i,
    col: 6 + (i % 10) * 5, row: 4 + ((i / 10) | 0) * 5,
    district: 'agentcity', rate: 0.5,
  }));
  res.json({ plots });
});
app.post('/api/city/signal-drop', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || (req.body && req.body.userId);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const { getInstance } = require('./economy-service');
    const econ = getInstance();
    const key = 'signal-drop-' + userId + '-' + Date.now();
    await econ.spend(userId, 50, 'Signal rescue taxi fee', key);
    res.json({ ok: true, deducted: 50 });
  } catch (err) {
    res.json({ ok: true, note: 'client-side only', reason: err.message });
  }
});
// ===== END CITY ROUTES =====

app.get('/api/health', (req, res) => {
  const health = {
    status: 'operational',
    version: require('./package.json').version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB'
    },
    cache: cache.stats(),
    services: {
      agents: 'online',
      database: 'online',
      skillExecutor: 'online',
      websocket: wsConnections.size + ' connections'
    }
  };

  cache.set('health', health, 5000);
  res.json(health);
});

// MCP + RAG status — powers the landing page MCP/RAG section (also handy for
// verifying the bridge + knowledge bases are ready for Claude Desktop/Code).
// Cached: the KB stats read several MB of JSON, so don't recompute per hit.
app.get('/api/mcp/status', (req, res) => {
  const cached = cache.get('mcpStatus');
  if (cached) return res.json(cached);

  const fsx = require('fs');
  const pathx = require('path');
  const bridgePath = pathx.join(__dirname, 'mcp-server-rag.js');
  const bridge = fsx.existsSync(bridgePath);
  let bridgeVersion = null;
  if (bridge) {
    const m = /const VERSION = '([^']+)'/.exec(fsx.readFileSync(bridgePath, 'utf8'));
    bridgeVersion = m ? m[1] : null;
  }

  // Per-agent RAG knowledge base stats (docs, chars, source names — trimmed).
  const agents = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
  const kbs = [];
  let totalChars = 0;
  try {
    const rag = require('./rag-index');
    for (const id of agents) {
      const ns = 'kb_' + id.toLowerCase();
      let docs = [];
      try { docs = rag.listUserDocs(ns) || []; } catch (_) {}
      let chars = 0;
      try {
        const p = pathx.join(__dirname, 'data', 'rag', ns, 'docs.json');
        if (fsx.existsSync(p)) {
          const parsed = JSON.parse(fsx.readFileSync(p, 'utf8'));
          chars = (parsed || []).reduce((s, d) => s + (d.text ? d.text.length : 0), 0);
        }
      } catch (_) {}
      totalChars += chars;
      const chunks = docs.reduce((s, d) => s + (d.chunks || 0), 0);
      kbs.push({
        agent: id, kb: ns, docs: docs.length, chunks, chars,
        sources: docs.slice(0, 8).map(d => d.name),
      });
    }
  } catch (e) {
    kbs.push({ error: String((e && e.message) || e) });
  }

  // Connected MCP servers (filesystem/fetch/memory + any disabled ones).
  let mcpServers = null;
  try {
    const mcp = require('./mcp-client');
    const servers = mcp.listServers ? mcp.listServers() : [];
    mcpServers = (servers || []).map(s => ({
      id: s.id,
      transport: s.transport,
      disabled: !!s.disabled,
      status: s.status || 'unknown',
      tools: s.toolCount || 0,
    }));
  } catch (_) {}

  const out = {
    ok: true,
    status: bridge ? 'ready' : 'missing-bridge',
    bridge: { file: bridgePath, exists: bridge, version: bridgeVersion },
    agents: kbs,
    totals: { kbChars: totalChars, kbMB: +(totalChars / 1048576).toFixed(2), kbChunks: kbs.reduce((s,a)=>s+(a.chunks||0),0), kbDocs: kbs.reduce((s,a)=>s+(a.docs||0),0) },
    mcpServers,
    mcpClientLoaded: mcpServers !== null,
    timestamp: new Date().toISOString(),
  };
  cache.set('mcpStatus', out, 30000); // 30s TTL — fresh enough for a status panel
  res.json(out);
});

// Gated download of the private SHADDAI MCP package (full engine closure).
// Query param ?code= unlocks it — defaults to the landing page's gate phrase.
// The zip is built by backend/build-mcp-package.js.
app.get('/api/mcp/package', (req, res) => {
  const zip = path.join(__dirname, 'shaddai-mcp-dist.zip');
  if (!fs.existsSync(zip)) {
    return res.status(404).json({ ok: false, error: 'Package not built yet. Run `node build-mcp-package.js` in backend/.' });
  }
  const gate = process.env.MCP_PACKAGE_CODE || 'ASCEND-MCP';
  const code = String(req.query.code || '').trim();
  if (code !== gate) {
    return res.status(403).json({ ok: false, error: 'Enter the gate passphrase to download the SHADDAI MCP package.' });
  }
  res.download(zip, 'shaddai-mcp.zip');
});

// Cloud RAG search — semantic search over all 7 agent knowledge bases (or one).
// Powers the brain page's live search + cross-talk when no local brain server runs.
// Post: { q: string, agent?: string, topK?: number }
app.post('/api/mcp/search', express.json(), (req, res) => {
  try {
    const q = String((req.body && (req.body.q || req.body.query)) || '').trim();
    if (!q) return res.status(400).json({ ok: false, error: 'q required' });
    const topK = Math.max(1, Math.min(10, parseInt(req.body.topK, 10) || 3));
    const rag = require('./rag-index');
    const all = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
    const agents = req.body.agent ? [String(req.body.agent).toUpperCase()] : all;
    const perAgent = [];
    let total = 0;
    for (const id of agents) {
      try {
        const hits = rag.searchUser('kb_' + id.toLowerCase(), q, topK) || [];
        if (hits.length) total++;
        perAgent.push({
          agent: id,
          docs: hits.length,
          results: hits.map(r => ({
            source: r.docName, chunk: String(r.chunkText || '').slice(0, 300), score: +r.score.toFixed(4),
            kind: /^DIGEST_|^MASTERY_/.test(r.docName || '') ? 'digest' : 'transcript',
            timeLabel: r.timeLabel || null, tsEstimate: !!r.tsEstimate, deepLink: r.deepLink || null,
          })),
        });
      } catch (_) { perAgent.push({ agent: id, docs: 0, results: [] }); }
    }
    const totalDocs = perAgent.reduce((s, a) => s + a.docs, 0);
    res.json({ ok: true, q, agents_resonating: total, total_docs: totalDocs, results: perAgent });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get('/api/status', (req, res) => {
  const cached = cache.get('status');
  if (cached) {
    return res.json(cached);
  }

  // Defensive: any single failing metric used to 500 the whole endpoint. Wrap each
  // sub-call so /api/status always returns something (used by uptime monitors).
  const safe = (fn, fb) => { try { return fn(); } catch (_) { return fb; } };
  const status = {
    server: 'running',
    agents: safe(() => Object.entries(AGENTS).map(([key, agent]) => ({
      name: agent.name,
      role: agent.role,
      status: 'available'
    })), []),
    executionStats: safe(() => database.getStatistics(), {}),
    requestMetrics: safe(() => requestTracker.getMetrics(), {}),
    cacheStats: safe(() => cache.stats(), {}),
    websockets: safe(() => wsConnections.size, 0),
    batchJobs: safe(() => ({
      queued: batchQueue.queue.length,
      processing: batchQueue.processing,
      total: batchQueue.jobs.size
    }), {})
  };

  cache.set('status', status, 10000);
  res.json(status);
});

// ============================================
// EXTERNAL APIs - OLLAMA, DEX, MARKETS
// ============================================

app.get('/api/apis/health', async (req, res) => {
  try {
    const status = await externalAPIs.checkAPIs();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PROVIDER HEALTH + PIPELINE + LEARNING (admin) ──────────────────────────
app.get('/api/providers/status', (req, res) => {
  try {
    const providers = require('./providers');
    const tokenDb = require('./token-db');
    const pipeline = require('./pipeline');
    res.json({
      providers: providers.status(),
      cache: providers.cacheStats(),
      pipeline: pipeline.getStats(),
      candidates: pipeline.getCandidates(),
      learning: tokenDb.getLearning(),
      stats: tokenDb.historicalStats(),
      overlap: Object.fromEntries(
        Object.entries(tokenDb.getSnapshots())
          .filter(([, v]) => v.sources && Object.keys(v.sources).length >= 2)
          .map(([k, v]) => [k, { name: v.name, symbol: v.symbol, sources: Object.keys(v.sources), lastSeen: v.lastSeen }])
      ),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers/health', (req, res) => {
  try {
    const providers = require('./providers');
    res.json({ providers: providers.status(), cache: providers.cacheStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers/learning', (req, res) => {
  try {
    const tokenDb = require('./token-db');
    const learning = tokenDb.analyzeOutcomes();
    const failures = tokenDb.analyzeFailures();
    const autotune = tokenDb.autoTune();
    res.json({ learning, stats: tokenDb.historicalStats(), weights: tokenDb.getWeights(), failures, autotune });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers/failures', (req, res) => {
  try {
    const tokenDb = require('./token-db');
    res.json(tokenDb.getFailures());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers/autotune', (req, res) => {
  try {
    const tokenDb = require('./token-db');
    res.json(tokenDb.getAutoTune());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers/overlap', (req, res) => {
  try {
    const tokenDb = require('./token-db');
    const snaps = tokenDb.getSnapshots();
    const overlap = {};
    for (const [mint, s] of Object.entries(snaps)) {
      if (s.sources && Object.keys(s.sources).length >= 2) {
        overlap[mint] = { name: s.name, symbol: s.symbol, sources: Object.keys(s.sources), fdv: s.entryFdv, lastSeen: s.lastSeen };
      }
    }
    res.json({ overlap, count: Object.keys(overlap).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/providers/reset-circuit', (req, res) => {
  try {
    const { name } = req.body;
    const providers = require('./providers');
    if (name) { providers.resetCircuit(name); res.json({ ok: true, reset: name }); }
    else { res.status(400).json({ error: 'provider name required' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ollama/generate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const response = await externalAPIs.callOllama(prompt, model);
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ollama/models', async (req, res) => {
  try {
    const models = await externalAPIs.listOllamaModels();
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dexscreener/search', async (req, res) => {
  try {
    const query = req.query.q || req.query.token || req.query.query;
    if (!query) return res.status(400).json({ error: 'q parameter required' });
    const data = await externalAPIs.getDexScreenerData(query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dexscreener/pairs/:chainId/:token', async (req, res) => {
  try {
    const { chainId, token } = req.params;
    const data = await externalAPIs.getDexScreenerPairs(chainId, token);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/coingecko/price/:coin', async (req, res) => {
  try {
    const { coin } = req.params;
    const data = await externalAPIs.getCoinGeckoPrice(coin);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/coingecko/market/:coin', async (req, res) => {
  try {
    const { coin } = req.params;
    const data = await externalAPIs.getCoinGeckoMarketData(coin);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/helius/balance/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const balance = await externalAPIs.getHeliusBalance(wallet);
    res.json({ balance, wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/helius/tokens/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const tokens = await externalAPIs.getHeliusTokenAccounts(wallet);
    res.json({ tokens, wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/polymarket/markets', async (req, res) => {
  try {
    const data = await externalAPIs.getPolymarketMarkets();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/polymarket/prices', async (req, res) => {
  try {
    const data = await externalAPIs.getPolymarketPrices();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Markets data routes — all free public APIs, no keys required ─────────────
// Shared fetch helper with 10s timeout and basic caching
const _mktCache = new Map();
async function _mktFetch(url, ttl = 60000) {
  const c = _mktCache.get(url);
  if (c && Date.now() - c.ts < ttl) return c.data;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'SHADDAI/1.0' } });
  if (!r.ok) throw new Error(`${r.status} from ${url}`);
  const data = await r.json();
  _mktCache.set(url, { data, ts: Date.now() });
  return data;
}

// Crypto prices — CoinGecko free tier, no key
app.get('/api/markets/crypto', async (req, res) => {
  try {
    const ids = (req.query.ids || 'bitcoin,ethereum,solana,chainlink,dogecoin').slice(0, 200);
    const d = await _mktFetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h,7d`, 90000);
    res.json({ ok: true, coins: d });
  } catch (e) { res.json({ ok: false, coins: [], error: String(e.message) }); }
});

// Global crypto market — CoinGecko (falls back to CoinPaprika when rate-limited)
app.get('/api/markets/global', async (req, res) => {
  try {
    const d = await _mktFetch('https://api.coingecko.com/api/v3/global', 120000);
    res.json({ ok: true, data: d.data });
  } catch (e1) {
    try {
      const cp = await _mktFetch('https://api.coinpaprika.com/v1/global', 120000);
      res.json({
        ok: true,
        data: {
          total_market_cap: { usd: cp.market_cap_usd },
          total_volume: { usd: cp.volume_24h_usd },
          market_cap_percentage: { btc: cp.bitcoin_dominance_percentage || 0, eth: 0 },
        },
      });
    } catch (e2) { res.json({ ok: false, data: null, error: String(e2.message) }); }
  }
});

// Trending coins — CoinGecko
app.get('/api/markets/trending', async (req, res) => {
  try {
    const d = await _mktFetch('https://api.coingecko.com/api/v3/search/trending', 120000);
    const coins = (d.coins || []).map(c => c.item);
    res.json({ ok: true, data: { coins }, coins });
  } catch (e) { res.json({ ok: false, data: { coins: [] }, coins: [], error: String(e.message) }); }
});

// Fear & Greed Index — Alternative.me (free, no key)
app.get('/api/markets/fear-greed', async (req, res) => {
  try {
    const d = await _mktFetch('https://api.alternative.me/fng/?limit=8&format=json', 300000);
    const latest = d.data && d.data[0];
    const prev = d.data && d.data[1];
    res.json({
      ok: true,
      value: latest ? parseInt(latest.value) : null,
      label: latest ? latest.value_classification : null,
      prev: prev ? parseInt(prev.value) : null,
      ts: latest ? latest.timestamp : null,
      data: (d.data || []).map(x => ({ value: parseInt(x.value), value_classification: x.value_classification, timestamp: x.timestamp })),
    });
  } catch (e) { res.json({ ok: false, value: null, data: [], error: String(e.message) }); }
});

// Forex rates — Frankfurter.app (free, no key, ECB data)
app.get('/api/markets/forex', async (req, res) => {
  try {
    const d = await _mktFetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF', 300000);
    const pairs = Object.entries(d.rates || {}).map(([sym, rate]) => ({ sym: 'USD/' + sym, rate: +rate.toFixed(5), change24h: 0 }));
    res.json({ ok: true, pairs });
  } catch (e) { res.json({ ok: false, pairs: [], error: String(e.message) }); }
});

// Stock quotes — free Yahoo Finance unofficial (no key)
app.get('/api/markets/stocks', async (req, res) => {
  try {
    const symbols = (req.query.symbols || 'SPY,QQQ,NVDA,TSLA,AAPL,MSFT,AMZN').split(',').slice(0, 10).map(s => encodeURIComponent(s.trim())).join(',');
    const d = await _mktFetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`, 60000);
    const quotes = ((d.quoteResponse && d.quoteResponse.result) || []).map(q => ({
      symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice, change: q.regularMarketChange, changePct: q.regularMarketChangePercent,
      open: q.regularMarketOpen, high: q.regularMarketDayHigh, low: q.regularMarketDayLow, volume: q.regularMarketVolume,
    }));
    res.json({ ok: true, quotes });
  } catch (e) { res.json({ ok: false, quotes: [], error: String(e.message) }); }
});

// DexScreener hot pairs — token profiles (the /boosted endpoint returns null)
app.get('/api/markets/dex-hot', async (req, res) => {
  try {
    const chain = req.query.chain || 'solana';
    const raw = await _mktFetch('https://api.dexscreener.com/token-profiles/latest/v1', 60000);
    const list = Array.isArray(raw) ? raw : (raw.profiles || []);
    const pairs = list
      .filter(p => !chain || p.chainId === chain)
      .slice(0, 20)
      .map(p => ({
        symbol: p.symbol || p.name || '',
        tokenAddress: p.tokenAddress || '',
        description: p.description || p.name || '',
        icon: p.icon || p.image || '',
        links: p.links || [],
        url: p.url || '',
        chain: p.chainId || chain,
      }));
    res.json({ ok: true, data: pairs, pairs });
  } catch (e) { res.json({ ok: false, data: [], pairs: [], error: String(e.message) }); }
});

// Jupiter token prices (Solana DEX aggregator) — free public API (v3)
const JUP_MINTS = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};
app.get('/api/markets/jupiter', async (req, res) => {
  try {
    const map = { ...JUP_MINTS };
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    ids.forEach((m, i) => { if (!Object.values(map).includes(m)) map['T' + i] = m; });
    const mints = Object.values(map).join(',');
    const d = await _mktFetch(`https://api.jup.ag/price/v3?ids=${mints}`, 30000);
    const out = {};
    Object.entries(map).forEach(([sym, mint]) => {
      const v = d[mint];
      if (v) out[sym] = { price: v.usdPrice != null ? v.usdPrice : v.price, priceChange24h: v.priceChange24h || 0 };
    });
    res.json({ ok: true, data: { data: out } });
  } catch (e) { res.json({ ok: false, data: { data: {} }, error: String(e.message) }); }
});

// Solana network stats — free public RPC (falls back across endpoints)
app.get('/api/network/solana', async (req, res) => {
  const rpcs = [process.env.HELIUS_RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana.publicnode.com'].filter(Boolean);
  const body = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  let tps = null, slot = null, circulatingSupply = null;
  for (const rpc of rpcs) {
    try {
      const [perfRes, slotRes, supplyRes] = await Promise.allSettled([
        fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(1, 'getRecentPerformanceSamples', [1]), signal: AbortSignal.timeout(15000) }),
        fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(2, 'getSlot', []), signal: AbortSignal.timeout(15000) }),
        fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(3, 'getSupply', [{ commitment: 'finalized' }]), signal: AbortSignal.timeout(15000) }),
      ]);
      if (perfRes.status === 'fulfilled' && perfRes.value.ok) {
        const pj = await perfRes.value.json(); const s = pj.result && pj.result[0];
        if (s) tps = Math.round(s.numTransactions / s.samplePeriodSecs);
      }
      if (slotRes.status === 'fulfilled' && slotRes.value.ok) {
        const sj = await slotRes.value.json(); slot = sj.result;
      }
      if (supplyRes.status === 'fulfilled' && supplyRes.value.ok) {
        const sj = await supplyRes.value.json(); circulatingSupply = sj.result && sj.result.value && sj.result.value.circulating;
      }
      if (tps !== null || slot !== null) break;
    } catch (_) { continue; }
  }
  res.json({ ok: tps !== null || slot !== null, data: { tps, slot, circulatingSupply } });
});

// ── MiroFish LLM swarm simulation — runs on Render when localhost:5001 unavailable ─
// POST { token, scenario, numAgents, rounds, platform }
// Returns structured swarm prediction via LLM chain
app.post('/api/mirofish/simulate', express.json(), async (req, res) => {
  try {
    const { token = 'SOL', scenario = 'market rally', numAgents = 30, platform = 'twitter' } = req.body || {};
    const tok = String(token).slice(0, 20).replace(/[<>]/g, '');
    const scen = String(scenario).slice(0, 200).replace(/[<>]/g, '');

    const llmProxy = require('./llm-proxy-routes');
    const callLLM = llmProxy._callLLM || null;

    // Build swarm agent personas and ask each one
    const roles = ['Whale Tracker', 'Degen Trader', 'Technical Analyst', 'Fundamentals Researcher', 'Sentiment Reader', 'Risk Manager', 'Market Maker'];
    const selected = roles.slice(0, Math.min(7, Math.max(3, Math.round(numAgents / 7))));

    const systemPrompt = `You are a swarm of crypto market prediction agents analyzing "${tok}" given the scenario: "${scen}" on ${platform}.
Respond ONLY with valid JSON in this exact shape:
{
  "consensus": "bull" | "bear" | "neutral",
  "confidence": 0-100,
  "summary": "2-sentence market outlook",
  "agents": [
    { "role": "string", "stance": "bull"|"bear"|"neutral", "strength": 0-100, "reasoning": "1 sentence" }
  ],
  "price_target": "short directional phrase e.g. +15-30% in 7d",
  "risk": "low"|"medium"|"high",
  "key_factors": ["factor1", "factor2", "factor3"]
}
Generate exactly ${selected.length} agents with roles: ${selected.join(', ')}. Base your analysis on real crypto market dynamics.`;

    const llmRes = await fetch(`${req.protocol}://${req.get('host')}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Analyze ${tok}: ${scen}`, systemPrompt, agent: 'zerox', format: 'json' }),
      signal: AbortSignal.timeout(30000),
    });
    const llmData = await llmRes.json();
    if (!llmRes.ok) throw new Error(llmData.error || 'LLM chat failed HTTP ' + llmRes.status);
    const text = String(llmData.response || llmData.content || llmData.message || '').trim();

    // Extract JSON from LLM response (handles markdown fences + trailing prose)
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const src = (fenced && fenced[1]) || text;
    const start = src.indexOf('{');
    if (start < 0) throw new Error('LLM did not return valid JSON');
    let depth = 0, inStr = false, esc = false, parsed = null;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { parsed = JSON.parse(src.slice(start, i + 1)); } catch (_) { parsed = null; } break; } }
    }
    if (!parsed) throw new Error('LLM did not return valid JSON');

    res.json({ ok: true, token: tok, scenario: scen, platform, numAgents: selected.length, result: parsed, source: 'llm-swarm', provider: llmData.provider || 'cloud' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ── PNL image generator — themed ZEROX art for Shaddai Signals PNL cards ─
try { app.use('/api/pnl', require('./pnl-image')); console.log('[prod] PNL image generator mounted'); }
catch (e) { console.warn('[prod] pnl-image failed:', e.message); }

// ── Pro trading signals — backs the pro-signals page (PIW-gated client-side).
// Source = the live Telegram PNL tracker (backend/data/tg-calls.json). Same-origin,
// no key (registration + access control lives on the page itself). 1s response cache
// so the heavily-polled feed never re-reads the JSON file per hit.
app.get('/api/signals/calls', (req, res) => {
  try {
    const pnl = require('./telegram-pnl');
    const limit = req.query.all === '1' ? 2000 : Math.min(200, parseInt(req.query.limit, 10) || 100);
    const rows = pnl.callsJson({ limit, since: req.query.since, chain: req.query.chain, source: req.query.source });
    res.json({ ok: true, total: rows.length, calls: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.get('/api/signals/stats', (req, res) => {
  try {
    const pnl = require('./telegram-pnl');
    const period = req.query.period || 'all';
    const leaderboard = pnl.leaderboardJson({ limit: 10, period });
    // Per-source breakdown in the shape the pro-signals page renders.
    const all = pnl.callsJson({ limit: 2000 });
    const span = period === 'day' ? 1 : period === 'week' ? 7 : 0;
    const since = span ? Date.now() - span * 86400000 : 0;
    const by = {};
    let total = 0;
    for (const c of all) {
      if (since && (c.ts || 0) < since) continue;
      const src = c.source || 'unknown';
      const b = by[src] || (by[src] = { total: 0, x2: 0, x5: 0, x10: 0 });
      b.total++; total++;
      if (c.peakMult >= 2) b.x2++;
      if (c.peakMult >= 5) b.x5++;
      if (c.peakMult >= 10) b.x10++;
    }
    const x2 = Object.values(by).reduce((s, b) => s + b.x2, 0);
    const x5 = Object.values(by).reduce((s, b) => s + b.x5, 0);
    const x10 = Object.values(by).reduce((s, b) => s + b.x10, 0);
    res.json({ ok: true, total, hitRate: total ? Math.round(x2 / total * 100) : 0, x2, x5, x10, sources: by, leaderboard });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.get('/api/signals/leaderboard', (req, res) => {
  try {
    const pnl = require('./telegram-pnl');
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    res.json({ ok: true, leaderboard: pnl.leaderboardJson({ limit, period: req.query.period }) });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── AI PNL IMAGE ENDPOINT ────────────────────────────────────────────────
// GET /api/pnl-image/:mint?mult=5&symbol=SOLANDIER
// Generates a themed AI PNL celebration image using HF keys (auto-rotating).
// Returns PNG with proper headers. Caches to public/assets/bot/pnl-generated/.
app.get('/api/pnl-image/:mint', async (req, res) => {
  try {
    const pnlImages = require('./lib/pnl-images');
    const pnl = require('./telegram-pnl');
    const mint = req.params.mint;
    const symbol = req.query.symbol || '';
    const mult = parseFloat(req.query.mult) || 1;
    // Try to find the call in the tracker first
    const call = pnl.findTokenJson(mint);
    const callData = call.called
      ? { mint, symbol: call.symbol || symbol, peakMult: call.peakMult, curMult: call.currentMult, entryFdv: call.entryFdv }
      : { mint, symbol: symbol || mint.slice(0, 8), peakMult: mult, curMult: mult, entryFdv: 0 };
    const imgPath = await pnlImages.generatePnlImage(callData);
    if (imgPath) {
      const fs = require('fs');
      const buf = fs.readFileSync(imgPath);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
      return res.send(buf);
    }
    // Fallback: return 404 so client uses static image
    res.status(404).json({ ok: false, error: 'generation failed' });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── PNL PRESET IMAGES (instant, no AI) ─────────────────────────────────────
// GET /api/pnl-preset/:tier — returns a pre-generated tier image or generates one on first hit.
const _pnlPresetCache = {};
app.get('/api/pnl-preset/:tier', async (req, res) => {
  try {
    const tier = parseInt(req.params.tier, 10) || 2;
    const pnlImages = require('./lib/pnl-images');
    const theme = pnlImages.TIER_THEMES[tier] || pnlImages.TIER_THEMES[2];
    // Check if we have a cached preset
    const presetPath = require('path').join(pnlImages.GENERATED_DIR, `_preset_${tier}x.png`);
    const _fs = require('fs');
    if (_fs.existsSync(presetPath) && (Date.now() - _fs.statSync(presetPath).mtimeMs) < 86400000) {
      const buf = _fs.readFileSync(presetPath);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      return res.send(buf);
    }
    // Generate a preset for this tier using the theme prompt
    try {
      const hf = require('./lib/hf-keys');
      const result = await hf.generateSafe(theme.prompt, { width: 1024, height: 1024 });
      if (result.buffer) {
        _fs.writeFileSync(presetPath, result.buffer);
        console.log(`[pnl-preset] generated tier ${tier}: ${theme.label}`);
        res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        return res.send(result.buffer);
      }
      if (result.fallbackUrl) {
        const r = await fetch(result.fallbackUrl, { signal: AbortSignal.timeout(45000) });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          _fs.writeFileSync(presetPath, buf);
          res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          return res.send(buf);
        }
      }
    } catch (e2) { console.warn('[pnl-preset] gen failed:', e2.message); }
    // Last resort: return a simple colored placeholder SVG
    const colors = { 1:'#0a4a6e', 2:'#00ff9c', 5:'#22d3ee', 10:'#f4c842', 15:'#c090ff', 20:'#ffd700', 25:'#ff69b4', 30:'#00bfff', 35:'#ff4500', 40:'#ff1493', 50:'#ffffff' };
    const c = colors[tier] || '#888';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><defs><radialGradient id='g'><stop offset='0%' stop-color='${c}' stop-opacity='0.9'/><stop offset='100%' stop-color='#0a0a14' stop-opacity='1'/></radialGradient></defs><rect width='1024' height='1024' fill='url(#g)'/><text x='512' y='540' text-anchor='middle' font-family='sans-serif' font-size='96' font-weight='bold' fill='${c}'>${theme.label}</text><text x='512' y='600' text-anchor='middle' font-family='sans-serif' font-size='48' fill='#ffffff88'>${tier}x TIER</text></svg>`;
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    return res.send(svg);
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.get('/api/signals/token/:q', (req, res) => {
  try {
    const pnl = require('./telegram-pnl');
    res.json({ ok: true, token: pnl.findTokenJson(String(req.params.q || '').slice(0, 64)) });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── SIGNAL ANALYTICS & QUALITY METRICS ──────────────────────────────────────
// GET /api/signals/analytics — returns dead coin analysis + signal quality metrics
// Helps ZEROX improve calling system by tracking which sources produce winners
app.get('/api/signals/analytics', (req, res) => {
  try {
    const siggen = require('./telegram-signals');
    const analysis = siggen._analyzeDeadCoins();

    // Calculate overall metrics — callsJson() returns newest-first, so slice(0,100) = most recent 100
    const all = siggen._loadCallHistory();
    const recent = all.slice(0, 100);
    const recent2x = recent.filter(c => (c.peakMult || 1) >= 2).length;
    const recent5x = recent.filter(c => (c.peakMult || 1) >= 5).length;

    // Score each source by win rate
    const sourceScores = {};
    const sources = new Set(all.map(c => c.source).filter(Boolean));
    for (const src of sources) {
      sourceScores[src] = siggen._sourceScore(src);
    }

    res.json({
      ok: true,
      analysis,
      metrics: {
        totalCalls: all.length,
        recentCalls: recent.length,
        recent2xCount: recent2x,
        recent5xCount: recent5x,
        recent2xRate: recent.length ? ((recent2x / recent.length) * 100).toFixed(1) : 0,
        recent5xRate: recent.length ? ((recent5x / recent.length) * 100).toFixed(1) : 0
      },
      sourceScores,
      generatedAt: new Date().toISOString()
    });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── SIGNAL QUALITY AUDIT ────────────────────────────────────────────────────
// GET /api/signals/audit — detailed breakdown of quality gates and rug filters
app.get('/api/signals/audit', (req, res) => {
  try {
    const siggen = require('./telegram-signals');
    const config = {
      hardFdvCapTrending: siggen.HARD_FDV_CAP_TRENDING,
      hardFdvCapMax: siggen.HARD_FDV_CAP_MAX,
      rugMinScore: siggen.RUG_MIN_SCORE,
      ageGateSeconds: siggen.AGE_GATE_SECONDS,
      multiplierCapFromDiscovery: siggen.MULTIPLIER_CAP_DISCOVERY,
      lpLockPercentMinimum: siggen.LP_LOCK_PERCENT_MINIMUM,
      bundleMaxPercent: siggen.BUNDLE_MAX_PERCENT
    };
    res.json({ ok: true, config });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── SIGNAL VALIDATION & RISK SCORING ────────────────────────────────────────
// POST /api/signals/validate — validate a proposed call + calculate risk/viability scores
// Body: { mint, entryFdv, holders, rugScore, lpPct, liq, vol24, vol1h, insiders, bundlers, snipers, top10Pct, source }
app.post('/api/signals/validate', (req, res) => {
  try {
    const siggen = require('./telegram-signals');
    const pnl = require('./telegram-pnl');
    const callData = req.body || {};

    // Default validation config
    const config = {
      minFdv: 1000,
      minHolders: 100,
      maxTop10Pct: 55,
      minSocialScore: 0,
      requireWebsite: false,
      requireTwitter: false,
      requireLocked: false,
      minLiqRatio: 1,
      rejectInsiders: false,
      rejectSnipers: false,
      rejectBundlers: false,
      maxRiskScore: 85,
      rugMinScore: siggen.RUG_MIN_SCORE
    };

    const validation = siggen._validateCall(callData, config);

    res.json({
      ok: true,
      mint: callData.mint,
      validation,
      timestamp: new Date().toISOString()
    });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ============================================
// PROXY ROUTES — mounted BEFORE agent wildcard so /api/agents/custom
// is handled by proxy instead of being caught by /api/agents/:name
// ============================================

// SECURITY: global rate limiter — a hard backstop against cost-amplification /
// shared-key drain / brute abuse. Applies to ALL /api routes. Generous cap so
// normal dashboard use is unaffected; blocks only runaway/scripted floods.
// Public API developer docs + "get a free key" page. Registered BEFORE the /api
// middleware chain so an exact GET /api serves the HTML (not the API router).
// Public API developer docs + "get a free key" page (audited — PIKADON sign-off 2026-07-19).
{
  const apiDocsPage = (req, res) => { res.set('X-Frame-Options', 'DENY'); res.sendFile(path.join(__dirname, '../public/api.html')); };
  app.get('/api', apiDocsPage);
  app.get('/developers', apiDocsPage);
}

// Use the battle-tested `express-rate-limit` (already a dependency) instead of the
// hand-rolled in-memory Map (which never evicted → slow leak, and keyed on a
// spoofable X-Forwarded-For with no `trust proxy`). Same window/cap (60s/150) so
// legitimate traffic is unaffected. 429 body matches the previous shape.
try {
  const expressRateLimit = require('express-rate-limit');
  app.use('/api', expressRateLimit({
    windowMs: 60000,
    max: 150,
    standardHeaders: true,   // RateLimit-* headers
    legacyHeaders: false,    // drop deprecated X-RateLimit-*
    // /api/v1 (public developer API) is exempt here — it has its own per-key limiter
    // + per-IP backstop, so it isn't double-limited (which would cause NAT/CGNAT users
    // to hit a shared 150/min bucket and get confusing 429s). Anchor the match on a
    // path boundary (strip query) so lookalikes like /api/v1beta are NOT exempted.
    skip: (req) => { const p = String(req.originalUrl || req.url || '').split('?')[0]; return p === '/api/v1' || p.startsWith('/api/v1/'); },
    handler: (req, res) => {
      res.status(429).json({ ok: false, error: 'rate limit exceeded — slow down' });
    }
  }));
} catch (e) {
  console.warn('[security] express-rate-limit not mounted, falling back:', e.message);
  try { app.use('/api', require('./auth-guard').rateLimit({ windowMs: 60000, max: 150 })); } catch (e2) { console.warn('[security] fallback rate limiter not mounted:', e2.message); }
}

app.use('/api', apiProxyRoutes);
// FULL RAG BRAIN — 401K-chunk corpus backing public/brain.html.
// Exposes /api/overview, /search, /summary, /council, /ask, /synthesize,
// /crosstalk, /books, /booksearch, /gallery, /rooms/bulk, /rooms/generate.
// Mounted before rooms-routes + gallery-routes so brain's /rooms/bulk and
// /gallery win those exact paths (the ONLY page calling them is brain.html).
try { app.use('/api', require('./brain-server')); console.log('[prod] RAG brain mounted (/api overview|search|summary|council|ask|synthesize|crosstalk|books|gallery|rooms)'); }
catch (e) { console.warn('[startup] RAG brain not mounted:', e.message); }
// MoonPay Agents (ZEROX non-custodial trading coordination + PIKADON kill-switch)
app.use('/api/telegram', require('./telegram-routes'));   // dashboard control for the TG bot/signals
app.use('/api/social', require('./routes/social-routes'));      // Social media posting (Telegram, Discord)
app.use('/api/pro-signals', require('./routes/pro-signals')); // PRO signals dashboard — live feed, filtering, bid recommendations
app.use('/api/signal-engine', require('./routes/signal-engine-v2')); // ZEROX Signal Engine v2 — meta-based calling, real-time evaluation
app.use('/api/signal-analysis', require('./routes/signal-analysis')); // Signal history analysis — winners, patterns, recommendations
app.use('/api/signal-levels', require('./routes/signal-levels')); // Entry/Exit/SL calculator — real-time levels from DexScreener
app.use('/api/signal-scoring', require('./routes/signal-scoring-v3')); // Bundle-focused scoring v3 + deep analysis button
app.use('/api/signal-forensics', require('./routes/signal-forensics')); // Deep forensic analysis of winners vs losers + strategies
app.use('/api/signal-meta-forensics', require('./routes/signal-meta-forensics')); // Meta themes, psychology, thesis, naming patterns
app.use('/api/signal-discovery', require('./routes/signal-discovery').router); // Real-time early detection of new coin launches (<5m old)
app.use('/api/wallet-network', require('./routes/wallet-network')); // Tracked wallet network visualization + holdings
app.use('/api/pnl-imagery', require('./routes/pnl-imagery')); // HF FLUX PnL image generator (market cap, multiplier, thesis)
app.use('/api/v1', require('./public-api-routes'));       // PUBLIC developer API (free keys + JSON signals) — audited 2026-07-19
app.use('/api/moonpay', require('./moonpay-agent'));
app.use('/api/x402/agent', require('./x402-agent-routes')); // agents take payments (x402 hire)
app.use('/api/market', require('./skill-market-routes')); // skill + agent marketplace (create/list/buy)
app.use('/api/agent-memory', require('./lib/agent-memory').router); // per-customer agent memory (learn/grow)
// NOTE: the full AURA HTTP surface is mounted below via ./aura-routes (line ~712).
// The bare lib/aura.router only exposes /stats + /route and — because it is mounted
// FIRST — used to SHADOW aura-routes' richer /stats (which adds the live tool-cache
// block `toolCache`). That left the monitor's "LIVE API-PULL CACHE" panel permanently
// blank. Mount aura-routes as the single source of truth for /api/aura instead.
app.use('/api/news', require('./news-routes'));
app.use('/api/video', require('./video-routes')); // BYOK video gen (Pika/Runway/HeyGen/Kling)
app.use('/api/x402/ledger', require('./x402-ledger-routes')); // prepaid balance ledger (pre-fund → spend down)
app.use('/api/collectibles/rewards', require('./lib/collectible-rewards').router);              // AURA token-saver (cache/compute-first) stats+route
app.use('/api/security', require('./lib/security-scan').router); // PIKADON real scans (url/code/skill)
app.use('/api/vault', require('./lib/api-vault').router);        // BYOK API key vault (password-locked)
// BYOK panel (dashboard "🔑 Connect Your APIs" card): simple paste-a-key → applied to env + persisted.
try {
  const _keys = require('./keys-routes');
  if (_keys.applyStoredKeysToEnv) _keys.applyStoredKeysToEnv();   // apply saved user keys to process.env on boot
  if (_keys.router) app.use('/api/keys', _keys.router);
} catch (e) { console.error('[keys-routes] mount failed:', e.message); }
// Brains & personas — per-agent model routing (Ollama/Groq/Claude) + custom agents
app.use('/api/brains', require('./brains').router);
// Operative Forge — build-your-own-agent LOOK → real FLUX NFT portrait (HF token stays server-side)
app.use('/api/forge', require('./forge/forge-routes'));
// Collectables — 100 NFT cards + REAL unlock-by-dashboard-action tracking (mint = later phase)
app.use('/api/collectables', require('./collectables/collectables-routes'));
// Rooms — personal operative habitat: HF scene-gen + wearables (reuses forge-core slots)
app.use('/api/rooms', require('./rooms/rooms-routes'));
// Operatives — the unified Operative store (identity+look+brain+inventory+economy+stats)
app.use('/api/operatives', require('./lib/operatives-routes'));
app.use('/api/radio', require('./lib/radio-routes'));                 // Shaddai Radio: community tracks + city bulletin
app.use('/api/portal-plots', require('./lib/portal-plots-routes'));   // rentable/buyable portal-world plots
app.use('/api/security', require('./lib/security-routes'));           // PIKADON security scan engine + review queue
app.use('/api/tufish', require('./lib/tufish-routes'));               // TuFish / MiroFish — free-API market data proxy (Polymarket + CoinGecko)
app.use('/api/leaderboard', require('./lib/leaderboard-routes'));     // SHADDAI games leaderboards
app.use('/api/chat', require('./lib/chat-routes'));                   // realm + per-room chat (PIKADON-scanned)
app.use('/api/mp', require('./multiplayer'));                         // multiplayer presence + chat relay (poll-based, in-memory)
app.use('/api/economy', require('./economy-routes')());               // Sparks ledger (append-only, idempotent; Postgres or atomic dev store) — economy-routes exports a factory; must be CALLED
// Seed the shop catalog once (idempotent; only if empty) so /api/economy/catalog has items.
try { require('./catalog-seed').seedCatalog(require('./economy-service').getDefault(), { onlyIfEmpty: true }).catch(e => console.error('[catalog-seed]', e.message)); } catch (e) { console.error('[catalog-seed]', e.message); }
app.use('/api/sub-billing', require('./sub-billing-routes'));         // Stripe subscriptions + per-deliverable unlock paywall
app.use('/api/work', require('./work-sessions'));                     // agent work loop: real work -> Sparks payout + while-away summary + live feed
// AURA — cost layer: /chat cache-check (called before any paid provider), /record, /stats, /route
app.use('/api/aura', require('./aura-routes'));
// Billing — real tiers/credits/usage metering (Stripe lazy-loaded; crypto via /api/moonpay)
app.use('/api/billing', require('./billing-routes').router);
// User profiles — "who you are" account data, persisted free via Firestore (survives redeploys)
try { app.use('/api/profile', require('./profile-routes')); } catch (e) { console.warn('[startup] profile-routes not mounted:', e.message); }
// Agent Battle Arena — skill loadouts -> sim match -> data learner (which skills win)
try { app.use('/api/battle', require('./battle-routes')); } catch (e) { console.warn('[startup] battle-routes not mounted:', e.message); }
try { app.use('/api/football', require('./sports/football/football-routes')); } catch (e) { console.warn('[startup] football-routes not mounted:', e.message); }
// Cross-game SKILLPLAY: agent real-skills -> per-game abilities (scalable to forged agents)
try { app.use('/api/skillplay', require('./skillplay-routes')); } catch (e) { console.warn('[startup] skillplay-routes not mounted:', e.message); }
// AURA self-improvement: background auto-warm (no-op unless AURA_AUTOWARM=true)
try { require('./aura-warmer').startAutoWarm(); } catch (_) {}
// Plug-in Payments — /api/stripe/{config,plans,create-checkout,verify}: hosted checkout links
// (Payment Links / Lemon Squeezy / Gumroad) OR full Stripe. Fixes the previously-404 billing buttons.
try { app.use('/api/stripe', require('./stripe-routes')); console.log('[prod] plug-in payments (/api/stripe) mounted'); }
catch (e) { console.warn('[prod] stripe-routes failed:', e.message); }
try { app.use('/api/media', require('./media-save')); console.log('[prod] media persistence (/api/media/save) mounted'); }
catch (e) { console.warn('[prod] media-save failed:', e.message); }
try { app.use('/api/media-gen', require('./media-gen')); console.log('[prod] media generation (/api/media-gen: music/video/capabilities) mounted'); }
catch (e) { console.warn('[prod] media-gen failed:', e.message); }
try { app.use('/api/achievements', require('./achievements').router); console.log('[prod] achievements + levels (/api/achievements) mounted'); }
catch (e) { console.warn('[prod] achievements failed:', e.message); }
// Server-side LLM proxy — browser calls this so provider keys never ship to the client
app.use('/api/llm', require('./llm-proxy-routes'));
app.post('/api/agentic/run', express.json(), require('./lib/agent-tool-run').handler);  // function-calling agent runner — agents actually EXECUTE tools
app.post('/api/orchestrate', express.json(), require('./lib/orchestrate').handler);      // SHADDAI orchestrator — decompose a task & route to the right specialists
// Mastery card RAG search — used by the MCP server, dashboards, and external clients.
// Merges the small mastery KB (rag-index) with the FULL 401K-chunk brain corpus
// (brain-index) so the landing page Knowledge Base search hits ALL of the info.
app.post('/api/mastery/search', express.json(), async (req, res) => {
  try {
    const { query, agent } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    const q = String(query).slice(0, 300);
    const agentId = String(agent || 'SHADDAI').toUpperCase();
    const namespace = 'kb_' + agentId.toLowerCase();
    const rag = require('./rag-index');
    const ragHits = (rag.searchUser(namespace, q, 5) || []).map(r => ({
      source: String(r.docName || 'mastery'), chunk: String(r.chunkText || '').slice(0, 300), score: r.score, corpus: 'mastery',
      kind: /^DIGEST_|^MASTERY_/.test(r.docName || '') ? 'digest' : 'transcript',
      timeLabel: r.timeLabel || null, deepLink: r.deepLink || null,
    }));
    let brainHits = [];
    try {
      const bi = require('./brain-index');
      brainHits = (bi.searchChunks(namespace, q, 5) || []).map(r => ({
        source: String(r.title || r.doc || namespace), chunk: String(r.text || r.chunkText || '').slice(0, 300), score: r.score, corpus: 'brain',
      }));
    } catch (_) { /* brain corpus unavailable — mastery only */ }
    const seen = new Set();
    const merged = [];
    for (const r of [...ragHits, ...brainHits]) {
      const key = (r.source || '') + '|' + (r.chunk || '').slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
    res.json({ ok: true, count: merged.length, results: merged.slice(0, 8) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});
// GRIDIRON PROSPECT — Game character saves, loads, and exports
app.use('/api/gridiron', require('./routes/gridiron-routes'));
// CRYPTO DATA API — keyless, read-only façade over existing market proxies (/api/data/v1/*)
try { app.use(require('./crypto-data-routes')); console.log('[prod] crypto data API (/api/data/v1) mounted'); }
catch (e) { console.warn('[startup] crypto-data-routes not mounted:', e.message); }

// ============================================
// AGENTS API
// ============================================

app.get('/api/agents', (req, res) => {
  const agents = Object.entries(AGENTS).map(([key, agent]) => ({
    id: key,
    name: agent.name,
    role: agent.role,
    status: 'online'
  }));

  res.json({ agents, total: agents.length });
});

// SECURITY: executions are indexed by agent, not user. Redact the content-bearing
// fields of executions that aren't the caller's so one user's prompts/results can't
// leak via these endpoints (metadata like agent/timestamp/status stays).
function _scopeExecs(list, uid) {
  return (list || []).map(function (e) {
    if (!e || e.userId === uid) return e;
    return Object.assign({}, e, { goal: undefined, prompt: undefined, input: undefined, result: undefined, output: undefined, response: undefined, answer: undefined, messages: undefined, _redacted: true });
  });
}

app.get('/api/agents/:name', softAuth, (req, res) => {
  const agent = AGENTS[req.params.name.toUpperCase()];
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const stats = database.getStatistics(agent.name);
  const history = database.getExecutionsForAgent(agent.name, 20);

  res.json({
    ...agent,
    stats,
    executionCount: history.length,
    recentExecutions: _scopeExecs(history, req.userId)
  });
});

app.get('/api/agents/:name/history', softAuth, (req, res) => {
  const agent = AGENTS[req.params.name.toUpperCase()];
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  const history = database.getExecutionsForAgent(agent.name, limit + offset);
  const paginated = _scopeExecs(history.slice(offset, offset + limit), req.userId);

  res.json({
    agent: agent.name,
    total: history.length,
    limit,
    offset,
    executions: paginated
  });
});

// ============================================
// SKILL EXECUTION
// ============================================

app.post('/api/agents/task', softAuth, async (req, res) => {
  try {
    const { agentName, task, context = {} } = req.body;

    if (!agentName || !task) {
      return res.status(400).json({ error: 'Missing agentName or task' });
    }

    const agent = AGENTS[agentName.toUpperCase()];
    if (!agent) {
      return res.status(404).json({ error: `Agent not found: ${agentName}` });
    }

    logger.info('SKILL_EXEC', `Executing task for ${agentName}`, { task });

    const startTime = Date.now();
    const result = await skillExecutor.executeSkill(agentName, {
      task,
      context,
      timestamp: new Date().toISOString()
    });

    const duration = Date.now() - startTime;

    await database.saveExecution({
      agentName,
      skill: 'task',
      input: { task, context },
      output: result,
      status: result.status,
      duration,
      timestamp: new Date().toISOString()
    });

    // Broadcast update
    broadcastUpdate('execution', {
      agent: agentName,
      status: result.status,
      duration
    });

    res.json({
      ...result,
      duration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('SKILL_EXEC', 'Error executing task', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// JOB MANAGEMENT (Marketplace)
// ============================================

app.get('/api/jobs', (req, res) => {
  const status = req.query.status || null;
  const limit = parseInt(req.query.limit) || 50;

  let jobs = database.queryJobs({ limit });

  if (status) {
    jobs = jobs.filter(j => j.status === status);
  }

  res.json({
    jobs,
    total: jobs.length,
    open: jobs.filter(j => j.status === 'open').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length
  });
});

app.post('/api/jobs', async (req, res) => {
  try {
    const { title, description, targetAgents, reward, deadline } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Missing title or description' });
    }

    const job = {
      id: `job_${Date.now()}`,
      title,
      description,
      targetAgents: targetAgents || [],
      reward: reward || 0,
      deadline,
      status: 'open',
      createdAt: new Date().toISOString(),
      bids: []
    };

    await database.saveJob(job);
    logger.info('JOB', `Job created: ${job.id}`, { title });

    broadcastUpdate('job_created', { jobId: job.id, title });

    res.json(job);
  } catch (error) {
    logger.error('JOB', 'Error creating job', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = database.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

app.get('/api/jobs/:jobId/bids', (req, res) => {
  const job = database.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const bids = job.bids || [];
  const sorted = bids.sort((a, b) => a.amount - b.amount);

  res.json({
    jobId: job.id,
    totalBids: bids.length,
    bids: sorted,
    lowestBid: sorted[0],
    averageBid: sorted.length > 0
      ? (bids.reduce((sum, b) => sum + b.amount, 0) / bids.length).toFixed(2)
      : null
  });
});

app.post('/api/jobs/:jobId/bids', async (req, res) => {
  try {
    const { agentName, amount, deliveryDays } = req.body;

    const job = database.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const bid = {
      id: `bid_${Date.now()}`,
      jobId: job.id,
      agentName,
      amount,
      deliveryDays,
      status: 'submitted',
      createdAt: new Date().toISOString()
    };

    job.bids = job.bids || [];
    job.bids.push(bid);

    await database.saveJob(job);
    logger.info('BID', `Bid submitted for job ${job.id}`, { agentName, amount });

    broadcastUpdate('bid_submitted', {
      jobId: job.id,
      bidId: bid.id,
      agentName,
      amount
    });

    res.json(bid);
  } catch (error) {
    logger.error('BID', 'Error submitting bid', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/:jobId/award', async (req, res) => {
  try {
    const { bidId, agentName } = req.body;

    const job = database.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const bid = job.bids?.find(b => b.id === bidId);
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    job.status = 'in_progress';
    job.awardedTo = agentName;
    job.awardedBidId = bidId;
    job.awardedAt = new Date().toISOString();

    bid.status = 'awarded';

    await database.saveJob(job);
    logger.info('AWARD', `Job awarded to ${agentName}`, { jobId: job.id, bidId });

    broadcastUpdate('job_awarded', {
      jobId: job.id,
      agentName,
      bidId,
      amount: bid.amount
    });

    res.json({
      jobId: job.id,
      awardedTo: agentName,
      amount: bid.amount,
      deliveryDays: bid.deliveryDays,
      awardedAt: job.awardedAt
    });
  } catch (error) {
    logger.error('AWARD', 'Error awarding job', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BATCH JOB EXECUTION
// ============================================

app.post('/api/batch/jobs', (req, res) => {
  try {
    const { tasks, priority = 'normal' } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Invalid tasks array' });
    }

    const job = batchQueue.createJob({
      tasks,
      priority,
      createdAt: new Date().toISOString()
    });

    logger.info('BATCH', `Batch job created: ${job.id}`, { taskCount: tasks.length });

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      total: job.total
    });
  } catch (error) {
    logger.error('BATCH', 'Error creating batch job', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/batch/jobs/:jobId', (req, res) => {
  const job = batchQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Batch job not found' });
  }

  res.json(job);
});

// ============================================
// MARKETPLACE ANALYTICS
// ============================================

app.get('/api/marketplace', (req, res) => {
  const cached = cache.get('marketplace');
  if (cached) {
    return res.json(cached);
  }

  const jobs = database.queryJobs({ limit: 1000 });

  const stats = {
    totalJobs: jobs.length,
    openJobs: jobs.filter(j => j.status === 'open').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    totalValueListed: jobs.reduce((sum, j) => sum + (j.reward || 0), 0),
    averageJobValue: jobs.length > 0
      ? (jobs.reduce((sum, j) => sum + (j.reward || 0), 0) / jobs.length).toFixed(2)
      : 0,
    topAgents: Array.from(new Map(
      jobs
        .filter(j => j.awardedTo)
        .map(j => [j.awardedTo, (j.reward || 0)])
        .reduce((map, [agent, reward]) => {
          map.set(agent, (map.get(agent) || 0) + reward);
          return map;
        }, new Map())
        .entries()
    ))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([agent, earnings]) => ({ agent, earnings })),
    recentJobs: jobs.slice(0, 5)
  };

  cache.set('marketplace', stats, 30000);
  res.json(stats);
});

// ============================================
// ANALYTICS DASHBOARD
// ============================================

app.get('/api/analytics/dashboard', (req, res) => {
  const timeRange = req.query.range || '24h';

  const executions = database.queryExecutions({ limit: 10000 });

  const agentMetrics = {};
  for (const exec of executions) {
    if (!agentMetrics[exec.agentName]) {
      agentMetrics[exec.agentName] = {
        agent: exec.agentName,
        executions: 0,
        successful: 0,
        failed: 0,
        avgDuration: 0,
        totalCost: 0
      };
    }

    const metrics = agentMetrics[exec.agentName];
    metrics.executions++;
    if (exec.status === 'SUCCESS') metrics.successful++;
    if (exec.status === 'ERROR') metrics.failed++;
    metrics.avgDuration = (metrics.avgDuration + (exec.duration || 0)) / metrics.executions;
    metrics.totalCost += exec.costEstimate || 0;
  }

  const dashboard = {
    timeRange,
    generatedAt: new Date().toISOString(),
    summary: {
      totalExecutions: executions.length,
      successRate: executions.length > 0
        ? ((executions.filter(e => e.status === 'SUCCESS').length / executions.length) * 100).toFixed(1) + '%'
        : '0%',
      averageDuration: executions.length > 0
        ? (executions.reduce((sum, e) => sum + (e.duration || 0), 0) / executions.length).toFixed(0) + 'ms'
        : '0ms',
      totalCost: '$' + executions.reduce((sum, e) => sum + (e.costEstimate || 0), 0).toFixed(2)
    },
    agentMetrics: Object.values(agentMetrics)
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 20),
    topSkills: Array.from(new Map(
      executions.map(e => [e.skillName, (executions.filter(x => x.skillName === e.skillName).length)])
    ))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count })),
    requestMetrics: requestTracker.getMetrics(),
    cacheStats: cache.stats()
  };

  cache.set('analytics', dashboard, 60000);
  res.json(dashboard);
});

// ============================================
// EXECUTION HISTORY
// ============================================

app.get('/api/executions', (req, res) => {
  const { agent, skill, status, limit = 50 } = req.query;
  const filter = { limit: parseInt(limit) };

  if (agent) filter.agent = agent;
  if (skill) filter.skill = skill;
  if (status) filter.status = status;

  const executions = database.queryExecutions(filter);
  res.json({ executions, total: executions.length });
});

// Named sub-routes must come before /:id wildcard
app.get('/api/executions/history', softAuth, (req, res) => {
  try {
    const history = agentInvocation.getExecutionHistory({
      agentName: req.query.agentName,
      status: req.query.status,
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 50
    });
    // SECURITY: redact content of executions that aren't the caller's.
    if (Array.isArray(history)) return res.json(_scopeExecs(history, req.userId));
    if (history && typeof history === 'object') {
      ['executions', 'items', 'history', 'results'].forEach(function (k) {
        if (Array.isArray(history[k])) history[k] = _scopeExecs(history[k], req.userId);
      });
    }
    res.json(history);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/executions/metrics', (req, res) => {
  try {
    res.json(agentInvocation.getPerformanceMetrics(req.query.agentName));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/executions/stats', (req, res) => {
  try {
    res.json(agentInvocation.getStatistics());
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/executions/active', (req, res) => {
  try {
    res.json(agentInvocation.getActiveExecutions());
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/executions/:id', (req, res) => {
  const execution = database.getExecution(req.params.id);
  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }
  res.json(execution);
});

// ============================================
// GENERATED FILES
// ============================================

app.get('/api/generated-files', (req, res) => {
  const dir = path.join(__dirname, '../generated-output');
  const files = [];

  if (fs.existsSync(dir)) {
    const items = fs.readdirSync(dir);
    items.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      files.push({
        name: file,
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime
      });
    });
  }

  res.json({ files, total: files.length });
});

app.get('/api/generated-files/:name', (req, res) => {
  const filePath = path.join(__dirname, '../generated-output', req.params.name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ name: req.params.name, content });
});

// ============================================
// AUTHENTICATION
// ============================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.authenticate(email, password);
    logger.info('AUTH', `Login successful for ${email}`);
    res.json(result);
  } catch (error) {
    logger.warn('AUTH', `Login failed for ${req.body.email}`, { error: error.message });
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  logger.info('AUTH', 'Logout successful');
  res.json({ success: true });
});

// ============================================
// BILLING
// ============================================

// /api/billing/tiers is handled by api-proxy-routes.js (has full tier definitions)

app.post('/api/billing/subscribe', async (req, res) => {
  try {
    const { userId, tier } = req.body;
    const subscription = await billingService.createSubscription(userId, tier);
    logger.info('BILLING', `Subscription created for ${userId}`, { tier });
    res.json(subscription);
  } catch (error) {
    logger.error('BILLING', 'Subscription error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// DATABASE MANAGEMENT
// ============================================

app.post('/api/database/cleanup', async (req, res) => {
  try {
    const ageThresholdDays = req.body.ageThresholdDays || 90;
    const result = await database.cleanupOldData(ageThresholdDays);
    logger.info('DATABASE', 'Cleanup completed', result);
    res.json(result);
  } catch (error) {
    logger.error('DATABASE', 'Cleanup error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/database/size', (req, res) => {
  const size = database.getDatabaseSize();
  res.json(size);
});

app.post('/api/database/export', async (req, res) => {
  try {
    const format = req.body.format || 'json';
    const result = await database.exportData();
    logger.info('DATABASE', 'Export completed');
    res.json(result);
  } catch (error) {
    logger.error('DATABASE', 'Export error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Job workflow routes handled above (lines ~767-934 via jobWorkflow engine) and via apiProxyRoutes

// ============================================
// AGENT INVOCATION ENGINE
// ============================================

// Invoke an agent skill
app.post('/api/agents/:agentName/invoke/:skillName', softAuth, async (req, res) => {
  try {
    const { agentName, skillName } = req.params;
    const { inputs = {}, maxRetries, timeout } = req.body;

    const result = await agentInvocation.invokeAgent(agentName, skillName, inputs, {
      maxRetries,
      timeout
    });

    logger.info('AGENT', `Invoked ${agentName}::${skillName}`);
    res.json(result);
  } catch (error) {
    logger.error('AGENT', 'Error invoking agent', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get agent status
app.get('/api/agents/:agentName/status', async (req, res) => {
  try {
    const status = await agentInvocation.getAgentStatus(req.params.agentName);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all agents status
app.get('/api/agents/status/all', async (req, res) => {
  try {
    const status = await agentInvocation.getAllAgentsStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// executions/history, /metrics, /stats, /active — defined earlier before /:id wildcard

// Cancel execution
app.post('/api/executions/:executionId/cancel', (req, res) => {
  try {
    const result = agentInvocation.cancelExecution(req.params.executionId);
    if (result.status === 'error') {
      return res.status(404).json(result);
    }
    logger.info('AGENT', `Execution cancelled: ${req.params.executionId}`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TURTLE VIDEO GENERATION
// ============================================

app.use('/api/skills/turtle', turtleRouter);

// ============================================
// AGENT INTEGRATION ENDPOINTS
// ============================================

app.get('/api/agents/health', async (req, res) => {
  try {
    const health = await agentIntegration.checkAllAgents();
    res.json({ agents: health, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/:name/health', async (req, res) => {
  try {
    const health = await agentIntegration.checkAgentHealth(req.params.name);
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/:name/skills', async (req, res) => {
  try {
    const skills = await agentIntegration.getAgentSkills(req.params.name);
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/:name/skill/:skillName', async (req, res) => {
  try {
    const result = await agentIntegration.executeAgentSkill(
      req.params.name,
      req.params.skillName,
      req.body
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/:jobId/route', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = database.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const route = await agentIntegration.routeJobToAgent(job);
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/:jobId/execute', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { agent } = req.body;
    const job = database.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const execution = await agentIntegration.executeJobWithAgents(jobId, job, agent);
    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shaddai/orchestrate', async (req, res) => {
  try {
    const { task, context } = req.body;
    const result = await agentIntegration.callSHADDAI(task, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pikadon/audit', async (req, res) => {
  try {
    const { jobData = { id: 'adhoc-' + Date.now(), title: 'Ad-hoc audit', payload: (req.body || {}) } } = req.body || {};
    const result = await agentIntegration.pikadonSecurityAudit(jobData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FRONTEND FALLBACK
// ============================================

// ── Shaddai Worlds + Federation (MUST be before the catch-all) ──
app.get('/world',           (req, res) => res.sendFile(path.join(__dirname, '../public/SHADDAI-WORLD-3D.html')));
app.get('/world3d',         (req, res) => res.sendFile(path.join(__dirname, '../public/SHADDAI-WORLD-3D.html')));
app.get('/world-complete',  (req, res) => res.sendFile(path.join(__dirname, '../public/SHADDAI-WORLD-COMPLETE.html')));
// legacy world aliases — their HTML files were archived; redirect to the canonical world (no more 500s)
['/world-master', '/world-api', '/world-new', '/world-build'].forEach(p => app.get(p, (req, res) => res.redirect('/world')));
try { app.use(require('./federation-routes')); console.log('[prod] federation (A2A + MCP + portals) mounted'); }
catch (e) { console.warn('[prod] federation failed:', e.message); }
try { app.use(require('./district-routes')); console.log('[prod] districts mounted'); }
catch (e) { console.warn('[prod] districts failed:', e.message); }
try { app.use(require('./portal-admin-routes')); console.log('[prod] portal-admin mounted'); }
catch (e) { console.warn('[prod] portal-admin failed:', e.message); }
try { app.use(require('./museum-routes')); console.log('[prod] museum mounted'); }
catch (e) { console.warn('[prod] museum failed:', e.message); }
try { app.use(require('./x402-routes')); console.log('[prod] x402 ledger mounted'); }
catch (e) { console.warn('[prod] x402 failed:', e.message); }
try { app.use(require('./reputation-routes')); console.log('[prod] reputation + VCs mounted'); }
catch (e) { console.warn('[prod] reputation failed:', e.message); }
try { app.use(require('./referral-routes')); console.log('[prod] referral flywheel mounted'); }
catch (e) { console.warn('[prod] referral failed:', e.message); }
try { app.use(require('./agent-room-routes')); console.log('[prod] canonical agent-rooms mounted'); }
catch (e) { console.warn('[prod] agent-rooms failed:', e.message); }
try { app.use(require('./markets-routes')); console.log('[prod] markets mounted'); }
catch (e) { console.warn('[prod] markets failed:', e.message); }
try { app.use(require('./admin-routes')); console.log('[prod] admin privileges mounted'); }
catch (e) { console.warn('[prod] admin failed:', e.message); }
try { app.use(require('./games-routes')); console.log('[prod] games leaderboard mounted'); }
catch (e) { console.warn('[prod] games failed:', e.message); }
try { app.use('/api/arcade', require('./arcade-routes')); console.log('[prod] agent arcade mounted'); }
catch (e) { console.warn('[prod] arcade failed:', e.message); }
try { app.use('/api/realms', require('./realms-routes')); console.log('[prod] shaddai realms mounted'); }
catch (e) { console.warn('[prod] realms failed:', e.message); }
try { app.use(require('./bazaar-routes')); console.log('[prod] bazaar marketplace mounted'); }
catch (e) { console.warn('[prod] bazaar failed:', e.message); }
try { app.use(require('./results-routes')); console.log('[prod] results inbox mounted'); }
catch (e) { console.warn('[prod] results-routes failed:', e.message); }
try { app.use(require('./gallery-routes')); console.log('[prod] creator gallery mounted'); }
catch (e) { console.warn('[prod] gallery failed:', e.message); }
try { app.use(require('./skills-market-routes')); console.log('[prod] skills market mounted'); }
catch (e) { console.warn('[prod] skills market failed:', e.message); }
try { app.use(require('./ainl-routes')); console.log('[prod] AINL workflows mounted'); }
catch (e) { console.warn('[prod] AINL failed:', e.message); }
try { app.use(require('./neocortex-routes')); console.log('[prod] neocortex memory mounted'); }
catch (e) { console.warn('[prod] neocortex failed:', e.message); }
try { app.use(require('./wallet-routes')); console.log('[prod] x402-v2 wallet mounted'); }
catch (e) { console.warn('[prod] wallet failed:', e.message); }
try { app.use(require('./hire-routes')); console.log('[prod] agent hire mounted'); }
catch (e) { console.warn('[prod] hire failed:', e.message); }
try { app.use(require('./analytics-routes')); console.log('[prod] analytics mounted'); }
catch (e) { console.warn('[prod] analytics failed:', e.message); }
try { app.use('/api/coin-launch', require('./coin-launch-routes')); console.log('[prod] coin launch kit mounted'); }
catch (e) { console.warn('[prod] coin-launch failed:', e.message); }
try { app.use('/api/thread-pack', require('./thread-pack-routes')); console.log('[prod] thread pack mounted'); }
catch (e) { console.warn('[prod] thread-pack failed:', e.message); }
try { app.use(require('./quickstart-routes')); console.log('[prod] quickstart wizard mounted'); }
catch (e) { console.warn('[prod] quickstart failed:', e.message); }
app.use('/games', express.static(path.join(__dirname, '..', 'games')));

// ── Shaddai Realms — 2.5D isometric RPG (Vite/Phaser SPA), served static (MUST be before the catch-all) ──
const REALMS_DIST = path.join(__dirname, '../public/realms');
app.use('/realms', express.static(REALMS_DIST, { maxAge: '1d', index: 'index.html' }));
// SPA fallback: any /realms/* sub-path that isn't a static asset resolves to index.html.
app.get('/realms/*', (req, res) => res.sendFile(path.join(REALMS_DIST, 'index.html')));
// Self-heal the 7 council character images on boot (forge-art is gitignored → regenerate from HF env keys)
try { require('./lib/char-gen').ensureCouncilChars(); } catch (e) { console.warn('[prod] council self-heal skipped:', e.message); }

// Landing page = the 4-module selector (enter.html) — the front door. It offers
// the cinematic descent, the full story (home.html), the dashboard, and Simple
// Mode. home.html is NOT retired: it is module 2, still served at /home.html.
// The Codex almanac lives at /codex, the full dashboard app at /dashboard.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/enter.html'));
});
app.get('/codex', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/codex.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
// RAG brain — the 7-agent knowledge system UI (knowledge bases + live cloud search).
app.get('/brain', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/brain.html'));
});

// API 404 GUARD — any unmatched /api/* path returns JSON, never the SPA HTML.
// Without this the catch-all below serves index.html for a missing endpoint, and the
// client's res.json() blows up with "Unexpected token '<', <!DOCTYPE...". This keeps
// failed fetches as clean JSON 404s (e.g. the 3D world loading inside the dashboard).
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  const errorId = crypto.randomBytes(6).toString('hex');
  logger.error('HTTP', 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: redactUrl(req.originalUrl || req.url || ''),
    method: req.method,
    requestId: req.id,
    errorId
  });

  // Double-send guard: if the response already started, hand off to Express.
  if (res.headersSent || res.writableEnded) return next(err);

  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
  } catch (_) {}

  const status = err.status || 500;
  res.status(status).json({
    error: 'Internal Server Error',
    // Never leak internal message/stack in production for 5xx.
    message: (process.env.NODE_ENV === 'production' && status >= 500) ? undefined : err.message,
    requestId: req.id,
    errorId
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

// nodebestpractices #2.2 — catch unhandled async errors before they silently crash the process
process.on('unhandledRejection', (reason, promise) => {
  logger.error('PROCESS', 'Unhandled promise rejection', { reason: String(reason) });
  // Don't exit — log and continue. Crashing on every unhandled rejection kills the server
  // for network timeouts and cancelled requests that we can't always control.
});

process.on('uncaughtException', (err) => {
  logger.error('PROCESS', 'Uncaught exception — shutting down safely', { error: err.message, stack: err.stack });
  // uncaughtException means the process is in unknown state — exit and let the OS restart it
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SERVER', 'SIGTERM received, shutting down gracefully');

  server.close(() => {
    logger.info('SERVER', 'HTTP server closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('SERVER', 'Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

// Only listen when run directly (not when imported by Vercel serverless)
if (!process.env.VERCEL_ENV) {
  server.listen(PORT, () => {
    logger.info('SERVER', `SHADDAI Production Server v62 started on port ${PORT}`);

    // Public DexScreener → Telegram signals feed (no-op unless TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL set).
    try { require('./telegram-signals').startTelegramSignals(); } catch (e) { console.warn('[tg-signals] init skipped:', e && e.message); }
    // Interactive Telegram bot — long-polls for commands (no-op unless TELEGRAM_BOT_TOKEN set).
    try { require('./telegram-bot').startTelegramBot(); } catch (e) { console.warn('[tg-bot] init skipped:', e && e.message); }
    // @TurtleMusicBot — dedicated music bot (no-op unless TURTLE_MUSIC_BOT_TOKEN set).
    try { require('./turtle-music-bot').start(); } catch (e) { console.warn('[turtle-music-bot] init skipped:', e && e.message); }
    // Scheduled market-pulse / news broadcaster (dashboard-configurable interval).
    try { require('./telegram-news').startNewsPoster(); } catch (e) { console.warn('[tg-news] init skipped:', e && e.message); }
    // Call PNL tracker — re-prices calls, posts milestone wins, powers hit-rate stats.
    try { require('./telegram-pnl').startTracker(); } catch (e) { console.warn('[tg-pnl] init skipped:', e && e.message); }

    // Start DexScreener discovery loop (free, no key) → pushes new boosted tokens into signals
    try { require('./telegram-pnl').startDiscovery(); console.log('[discovery] DexScreener boosted-token discovery armed'); } catch (e) { console.warn('[discovery] init skipped:', e && e.message); }

    // ── KEEP-ALIVE: Render's free plan spins the service DOWN after ~15 min idle, which stops the
    // signal pollers (no calls when nobody's visiting). Self-ping the public URL every ~10 min so the
    // instance stays awake 24/7 and the pollers keep running. (Render auto-sets RENDER_EXTERNAL_URL.)
    try {
      const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
      if (selfUrl) {
        const ping = () => { fetch(selfUrl.replace(/\/$/, '') + '/api/model/health').then(() => {}).catch(() => {}); };
        const ka = setInterval(ping, 10 * 60 * 1000);   // every 10 min (< Render's ~15 min idle window)
        if (ka.unref) ka.unref();
        setTimeout(ping, 30000);
        console.log('[keep-alive] self-ping armed →', selfUrl, '(prevents free-plan spin-down so signals run 24/7)');
      } else {
        console.log('[keep-alive] not armed (no RENDER_EXTERNAL_URL) — set SELF_PING_URL or use an external uptime pinger to keep signals running 24/7.');
      }
    } catch (e) { console.warn('[keep-alive] init skipped:', e && e.message); }

    // ── RAG rebuild: populate agent knowledge from mastery cards on startup ────
    try {
      const rag = require('./rag-index');
      const masteryRoot = path.join(__dirname, 'knowledge', 'mastery');
      if (fs.existsSync(masteryRoot)) {
        let loaded = 0;
        for (const agentDir of fs.readdirSync(masteryRoot, { withFileTypes: true })) {
          if (!agentDir.isDirectory()) continue;
          const agentKey = 'kb_' + agentDir.name.toLowerCase();
          const dir = path.join(masteryRoot, agentDir.name);
          for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.md')) continue;
            const docName = 'MASTERY_' + file.replace(/\.md$/, '');
            // Skip if already indexed
            const existing = rag.listUserDocs(agentKey);
            if (existing.some(d => d.name === docName)) continue;
            const text = fs.readFileSync(path.join(dir, file), 'utf8');
            if (text.length > 200) {
              rag.addDocument(agentKey, docName, text);
              loaded++;
            }
          }
        }
        if (loaded) console.log(`[RAG] loaded ${loaded} mastery cards into agent knowledge`);
      }
    } catch (e) { console.warn('[RAG] rebuild skipped:', e && e.message); }

    console.log(`
╔════════════════════════════════════════════════════════╗
║  SHADDAI PRODUCTION SERVER v62                        ║
║  Port: ${PORT}                                             ║
║  WebSocket: Enabled                                   ║
║  Compression: Enabled                                 ║
║  Caching: Enabled                                     ║
║  Status: ONLINE                                       ║
╚════════════════════════════════════════════════════════╝
    `);

    console.log('\n✓ Services initialized:');
    console.log('  • Frontend server');
    console.log('  • Agent orchestration');
    console.log('  • Skill executor');
    console.log('  • Database persistence');
    console.log('  • WebSocket real-time updates');
    console.log('  • Request/Response compression');
    console.log('  • Caching layer (TTL-based)');
    console.log('  • Structured logging');
    console.log('  • Batch job processing');
    console.log('  • 🌍 World Labs integration (dynamic worlds)');

    console.log('\n✓ API Endpoints (Premium Features):');
    console.log('  GET  /api/agents/:name/history');
    console.log('  GET  /api/jobs/:jobId/bids');
    console.log('  POST /api/jobs/:jobId/award');
    console.log('  GET  /api/marketplace');
    console.log('  GET  /api/analytics/dashboard');
    console.log('  POST /api/batch/jobs');
    console.log('  GET  /api/batch/jobs/:jobId');

    console.log('\n✓ World Labs API Endpoints:');
    console.log('  → Viewer: http://localhost:' + PORT + '/worlds-viewer.html');

    console.log('\n✓ WebSocket Events:');
    console.log('  • execution (real-time task updates)');
    console.log('  • job_created');
    console.log('  • bid_submitted');
    console.log('  • job_awarded');

    logger.info('SERVER', 'All services ready');

    // Boot auto-connect for enabled MCP servers (non-blocking) so agents
    // see their tools immediately. Failures are logged, never crash boot.
    try {
      require('./mcp-client').autoConnectAll().then(results => {
        for (const r of results) {
          if (r.ok) logger.info('MCP', `connected ${r.id} (${r.tools} tools)`);
          else logger.warn('MCP', `auto-connect ${r.id} failed: ${r.error}`);
        }
      }).catch(e => logger.warn('MCP', `auto-connect error: ${e.message}`));
    } catch (e) {
      logger.warn('MCP', `auto-connect init failed: ${e.message}`);
    }
  });
}

module.exports = { app, server, wss, logger, cache, requestTracker };
