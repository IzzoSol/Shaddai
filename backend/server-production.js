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
    const logEntry = {
      timestamp: this._formatTimestamp(),
      level,
      component,
      message,
      ...data
    };

    console.log(`[${level}] [${component}] ${message}`, data);

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
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const logger = new Logger();
const cache = new CacheLayer();
const requestTracker = new RequestTracker();

// Middleware
app.use(compression());
// Stripe webhook MUST see the raw body for signature verification — register it
// BEFORE express.json() so the JSON parser doesn't consume the body first.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./stripe-webhook'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
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
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,   // don't auto-serve index.html for '/' — the '/' route serves the Codex landing; '/dashboard' serves the app
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
        "'self'", "wss:",
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
    // Allow: no origin (same-origin, curl), file:// (string 'null'), localhost/127.0.0.1
    if (!origin || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.startsWith('file://')) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed: ' + origin));
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

wss.on('connection', (ws, req) => {
  const clientId = crypto.randomBytes(8).toString('hex');
  wsConnections.set(clientId, ws);
  logger.info('WEBSOCKET', `Client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(clientId, data, ws);
    } catch (error) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    wsConnections.delete(clientId);
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

app.get('/api/status', (req, res) => {
  const cached = cache.get('status');
  if (cached) {
    return res.json(cached);
  }

  const status = {
    server: 'running',
    agents: Object.entries(AGENTS).map(([key, agent]) => ({
      name: agent.name,
      role: agent.role,
      status: 'available'
    })),
    executionStats: database.getStatistics(),
    requestMetrics: requestTracker.getMetrics(),
    cacheStats: cache.stats(),
    websockets: wsConnections.size,
    batchJobs: {
      queued: batchQueue.queue.length,
      processing: batchQueue.processing,
      total: batchQueue.jobs.size
    }
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

// ============================================
// PROXY ROUTES — mounted BEFORE agent wildcard so /api/agents/custom
// is handled by proxy instead of being caught by /api/agents/:name
// ============================================

// SECURITY: global rate limiter — a hard backstop against cost-amplification /
// shared-key drain / brute abuse. Applies to ALL /api routes. Generous cap so
// normal dashboard use is unaffected; blocks only runaway/scripted floods.
try { app.use('/api', require('./auth-guard').rateLimit({ windowMs: 60000, max: 150 })); } catch (e) { console.warn('[security] rate limiter not mounted:', e.message); }

app.use('/api', apiProxyRoutes);
// MoonPay Agents (ZEROX non-custodial trading coordination + PIKADON kill-switch)
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
// AURA — cost layer: /chat cache-check (called before any paid provider), /record, /stats, /route
app.use('/api/aura', require('./aura-routes'));
// Billing — real tiers/credits/usage metering (Stripe lazy-loaded; crypto via /api/moonpay)
app.use('/api/billing', require('./billing-routes').router);
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
// ⭐ WORLD LABS INTEGRATION — Dynamic world generation (World Labs API + Higgs Physics + Hugging Face)
app.use('/api/worlds', require('./routes/worlds-api'));
// GRIDIRON PROSPECT — Game character saves, loads, and exports
app.use('/api/gridiron', require('./routes/gridiron-routes'));

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

app.get('/api/agents/:name', (req, res) => {
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
    recentExecutions: history
  });
});

app.get('/api/agents/:name/history', (req, res) => {
  const agent = AGENTS[req.params.name.toUpperCase()];
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  const history = database.getExecutionsForAgent(agent.name, limit + offset);
  const paginated = history.slice(offset, offset + limit);

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
app.get('/api/executions/history', (req, res) => {
  try {
    const history = agentInvocation.getExecutionHistory({
      agentName: req.query.agentName,
      status: req.query.status,
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 50
    });
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
app.use('/games', express.static(path.join(__dirname, '..', 'games')));

// ── Shaddai Realms — 2.5D isometric RPG (Vite/Phaser SPA), served static (MUST be before the catch-all) ──
const REALMS_DIST = path.join(__dirname, '../public/realms');
app.use('/realms', express.static(REALMS_DIST, { maxAge: '1d', index: 'index.html' }));
// SPA fallback: any /realms/* sub-path that isn't a static asset resolves to index.html.
app.get('/realms/*', (req, res) => res.sendFile(path.join(REALMS_DIST, 'index.html')));
// Self-heal the 7 council character images on boot (forge-art is gitignored → regenerate from HF env keys)
try { require('./lib/char-gen').ensureCouncilChars(); } catch (e) { console.warn('[prod] council self-heal skipped:', e.message); }

// Landing page = the Codex (The Celestial Almanac). The full dashboard app lives at /dashboard.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/codex.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
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
  logger.error('HTTP', 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
    requestId: req.id
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
    console.log('  POST /api/worlds/create (generate world)');
    console.log('  GET  /api/worlds/:id (fetch world)');
    console.log('  GET  /api/worlds (list all)');
    console.log('  POST /api/worlds/:id/physics (update physics)');
    console.log('  POST /api/worlds/:id/seed (add entities)');
    console.log('  POST /api/worlds/:id/districts/visit (navigate)');
    console.log('  → Viewer: http://localhost:' + PORT + '/worlds-viewer.html');

    console.log('\n✓ WebSocket Events:');
    console.log('  • execution (real-time task updates)');
    console.log('  • job_created');
    console.log('  • bid_submitted');
    console.log('  • job_awarded');

    logger.info('SERVER', 'All services ready');
  });
}

module.exports = { app, server, wss, logger, cache, requestTracker };
