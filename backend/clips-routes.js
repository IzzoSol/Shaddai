// ============================================================================
// clips-routes.js — backend proxy so the SHADDAI dashboard can reach the
// separate Clips ENGINE (a standalone service that does the heavy media work).
//
// The dashboard talks ONLY to the SHADDAI backend; this router forwards Clips
// traffic to the engine so the engine never needs to be exposed publicly and
// so we can gate + meter usage centrally.
//
// Mount (in server-production.js):
//   app.use('/api/clips', require('./clips-routes'));
//
// Engine layout (already built + proven):
//   ${ENGINE}/api/clips/v1/{health,sources,sources/:id,generate,batches/:id}
//   ${ENGINE}/files/*        ← static output files
//
// Path mapping handled here (router is mounted at /api/clips, so req.url is
// already stripped of that prefix):
//   /api/clips/files/<x>  → ${ENGINE}/files/<x>
//   /api/clips/<rest>     → ${ENGINE}/api/clips/v1/<rest>
//
// STREAMING: we use Node's built-in http/https and pipe req → upstream and
// upstream → res. The request body is NEVER buffered or parsed here, so
// multipart/form-data file uploads stream straight through unchanged. (Do not
// add express.json on this path — it would consume the body.)
// ============================================================================

const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const router = express.Router();

// Engine base URL (no trailing slash).
const ENGINE = (process.env.CLIPS_ENGINE_URL || 'http://localhost:8787').replace(/\/+$/, '');

// Credits charged per clip generation (debited from the x402 ledger).
const GENERATE_COST = 5;

// Lazy-load the ledger so a problem there can never crash router load.
let ledger = null;
try { ledger = require('./lib/x402-ledger'); } catch (_) { ledger = null; }

// ── helpers ────────────────────────────────────────────────────────────────

// Map the incoming (prefix-stripped) path onto the engine's path layout.
// Returns the full upstream URL string.
function mapToEngineUrl(reqUrl) {
  // reqUrl looks like '/generate', '/files/foo.mp4?x=1', '/health', etc.
  if (reqUrl === '/files' || reqUrl.startsWith('/files/') || reqUrl.startsWith('/files?')) {
    // /files/* → ${ENGINE}/files/*  (strip the leading '/files')
    return ENGINE + '/files' + reqUrl.slice('/files'.length);
  }
  // everything else → ${ENGINE}/api/clips/v1/<rest>
  return ENGINE + '/api/clips/v1' + reqUrl;
}

// Identify the caller's account + tier.
// Pattern reused from the codebase: the dashboard identifies a user via headers
// (auth-guard.softAuth uses x-user-id). For Clips we accept explicit
// x-shaddai-account / x-shaddai-tier headers (the dashboard sets these), and
// fall back to x-user-id for the account.
function getAccount(req) {
  return String(req.headers['x-shaddai-account'] || req.headers['x-user-id'] || '').trim();
}
function getTier(req) {
  return String(req.headers['x-shaddai-tier'] || '').trim().toLowerCase();
}

// Generic streaming proxy: pipe req → upstream and upstream → res.
function proxy(req, res) {
  let target;
  try {
    target = new URL(mapToEngineUrl(req.url));
  } catch (e) {
    return res.status(502).json({ error: 'bad_engine_url', detail: String(e.message || e) });
  }

  const client = target.protocol === 'https:' ? https : http;

  // Clone headers, fix Host so the upstream sees its own host.
  const headers = Object.assign({}, req.headers);
  headers.host = target.host;

  const upstream = client.request(
    target,
    { method: req.method, headers },
    (up) => {
      // Preserve upstream status + headers, then stream the body through.
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'engine_unreachable', detail: String(err.message || err) });
    } else {
      res.end();
    }
  });

  // Pipe the (possibly multipart) request body straight to the engine.
  req.pipe(upstream);
}

// ── health ───────────────────────────────────────────────────────────────--
// Report whether the engine is reachable. Does NOT proxy — it probes.
router.get('/health', async (req, res) => {
  let engine = false;
  try {
    const r = await fetch(ENGINE + '/api/clips/v1/health', { method: 'GET' });
    engine = r.ok;
  } catch (_) {
    engine = false;
  }
  res.json({ ok: true, engine });
});

// ── tier gate + metering for clip generation ───────────────────────────────-
// Runs ONLY for POST /generate. We deliberately do NOT read the body so the
// multipart upload keeps streaming in the proxy step that follows.
router.post('/generate', (req, res, next) => {
  // Dev mode: if REQUIRE_AUTH is not 'true', allow everything (no gate, no
  // debit) so local development never breaks. Matches auth-guard's behaviour.
  if (process.env.REQUIRE_AUTH !== 'true') {
    return next();
  }

  // 1) Tier gate — Clips is a premium feature. Block free/missing tiers.
  const tier = getTier(req);
  if (!tier || tier === 'free') {
    return res.status(402).json({ error: 'premium_required', feature: 'clips' });
  }

  // 2) Meter — debit credits from the x402 ledger for this generation.
  //    try/catch so a ledger error can never block the request.
  try {
    if (ledger && typeof ledger.debit === 'function') {
      const account = getAccount(req);
      const result = ledger.debit(account, GENERATE_COST, 'clips:generate');
      if (result && result.ok === false) {
        return res.status(402).json({
          error: 'insufficient_credits',
          needed: result.needed,
          balance: result.balance
        });
      }
    }
  } catch (e) {
    // Never block on a ledger failure — log and continue.
    console.warn('[clips] ledger debit failed (allowing through):', e.message);
  }

  return next();
});

// ── generic streaming proxy for everything under /api/clips/* ───────────────-
// (Including POST /generate, which reaches here after the gate above calls
// next(). The body has NOT been consumed, so the upload streams through.)
router.all('/*', proxy);

module.exports = router;
