#!/usr/bin/env node
/**
 * launch-check.js — SHADDAI reusable smoke-test / debug harness.
 *
 * Read-only health probe against a running SHADDAI server (default :3000).
 * Verifies pages, JSON APIs, a REAL agent LLM round-trip, the skills catalog,
 * static assets, and prints an ENV readiness readout (SET/MISSING, never values).
 *
 * Usage:
 *   node backend/scripts/launch-check.js
 *   BASE=http://localhost:3000 node backend/scripts/launch-check.js
 *
 * Exit code: 0 if all CRITICAL checks pass, 1 otherwise.
 * Zero dependencies — Node built-ins only (http/https/url).
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Zero-dep .env sniff so the ENV readout matches what the server actually loads
// (the server uses dotenv against backend/.env). We only detect KEY presence —
// values are never read into memory beyond a boolean and never printed.
function envKeysFromDotenv() {
  const present = new Set();
  const candidates = [
    path.join(__dirname, '..', '.env'),   // backend/.env (server's file)
    path.join(process.cwd(), '.env'),      // cwd/.env
  ];
  for (const f of candidates) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
        if (m && m[2].trim()) present.add(m[1]);
      }
    } catch { /* no file — fine */ }
  }
  return present;
}

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/+$/, '');
const AGENT_TIMEOUT = 40000; // ms — the real LLM call gets 40s
const DEFAULT_TIMEOUT = 15000;

// ── tiny result tracker ─────────────────────────────────────────────────────
const results = []; // { ok, critical, label, detail }
function record(ok, critical, label, detail) {
  results.push({ ok, critical, label, detail: detail || '' });
  const tag = ok ? 'PASS' : 'FAIL';
  const line = `${tag} ${label}${detail ? `  (${detail})` : ''}`;
  console.log(line);
}

// ── minimal HTTP client (no deps) ───────────────────────────────────────────
function request(method, path, { body, timeout } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(path.startsWith('http') ? path : BASE + path); }
    catch (e) { return resolve({ error: 'bad url: ' + e.message }); }
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {},
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = payload.length;
    }
    const started = Date.now();
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text, ms: Date.now() - started });
      });
    });
    req.on('error', (e) => resolve({ error: e.message, ms: Date.now() - started }));
    req.setTimeout(timeout || DEFAULT_TIMEOUT, () => {
      req.destroy();
      resolve({ error: `timeout after ${timeout || DEFAULT_TIMEOUT}ms`, ms: Date.now() - started });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function tryJSON(text) {
  try { return { ok: true, data: JSON.parse(text) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// ── checks ──────────────────────────────────────────────────────────────────
async function checkPage(path, critical = true) {
  const r = await request('GET', path);
  if (r.error) return record(false, critical, `page ${path}`, r.error);
  record(r.status === 200, critical, `page ${path}`, r.status === 200 ? `200 in ${r.ms}ms` : `HTTP ${r.status}`);
}

async function checkApiJSON(path, critical = true) {
  const r = await request('GET', path);
  if (r.error) return record(false, critical, `api ${path}`, r.error);
  if (r.status !== 200) return record(false, critical, `api ${path}`, `HTTP ${r.status}`);
  const j = tryJSON(r.text);
  if (!j.ok) return record(false, critical, `api ${path}`, `200 but invalid JSON: ${j.error}`);
  record(true, critical, `api ${path}`, `200 valid JSON in ${r.ms}ms`);
}

async function checkAsset(path, critical = false) {
  const r = await request('GET', path);
  if (r.error) return record(false, critical, `asset ${path}`, r.error);
  record(r.status === 200, critical, `asset ${path}`, r.status === 200 ? `200 (${r.text.length}b)` : `HTTP ${r.status}`);
}

async function checkAgentCall() {
  const label = 'agent POST /api/agents/route (ORACLE)';
  const r = await request('POST', '/api/agents/route', {
    body: { message: 'reply with the single word ONLINE', agentName: 'ORACLE', history: [] },
    timeout: AGENT_TIMEOUT,
  });
  if (r.error) return record(false, true, label, r.error);
  if (r.status !== 200) return record(false, true, label, `HTTP ${r.status}: ${r.text.slice(0, 120)}`);
  const j = tryJSON(r.text);
  if (!j.ok) return record(false, true, label, `invalid JSON: ${j.error}`);
  const resp = j.data && j.data.response;
  if (!resp || !String(resp).trim()) return record(false, true, label, `empty response (model=${j.data && j.data.model || '?'})`);
  const preview = String(resp).replace(/\s+/g, ' ').trim().slice(0, 60);
  record(true, true, label, `${r.ms}ms, model=${j.data.model || '?'}, "${preview}"`);
}

async function checkSkillsCatalog() {
  const label = 'skills GET /api/skills/catalog?limit=5';
  const r = await request('GET', '/api/skills/catalog?limit=5');
  if (r.error) return record(false, false, label, r.error);
  if (r.status !== 200) return record(false, false, label, `HTTP ${r.status} (route may differ)`);
  const j = tryJSON(r.text);
  if (!j.ok) return record(false, false, label, `invalid JSON: ${j.error}`);
  const items = j.data && (j.data.skills || j.data.items || j.data.catalog);
  if (!Array.isArray(items) || items.length === 0) {
    return record(false, false, label, `200 but no items (keys: ${Object.keys(j.data || {}).join(',')})`);
  }
  record(true, false, label, `${items.length} items, total=${j.data.total != null ? j.data.total : '?'}`);
}

function checkEnv() {
  console.log('\n— ENV readiness (SET/MISSING, values never printed) —');
  const dotenvKeys = envKeysFromDotenv();
  const vars = ['GROQ_API_KEY', 'SHADDAI_MERCHANT_WALLET', 'ADMIN_TOKEN'];
  for (const v of vars) {
    const inProc = !!(process.env[v] && String(process.env[v]).trim());
    const inFile = dotenvKeys.has(v);
    const set = inProc || inFile;
    const src = inProc && inFile ? 'process+.env' : inProc ? 'process' : inFile ? '.env' : '';
    console.log(`ENV ${v}: ${set ? `SET${src ? ` [${src}]` : ''}` : 'MISSING'}`);
  }
  console.log('(Checks process.env AND backend/.env — the server loads .env via dotenv.)');
}

// ── run ─────────────────────────────────────────────────────────────────────
(async function main() {
  console.log(`SHADDAI launch-check → ${BASE}`);
  console.log('='.repeat(60));

  console.log('\n[1] Pages');
  for (const p of ['/', '/forge.html', '/whitepaper.html', '/codex.html', '/SHADDAI-WORLD-3D.html']) {
    await checkPage(p, true);
  }

  console.log('\n[2] JSON APIs');
  for (const p of ['/api/operatives', '/api/results', '/api/byok/status', '/api/agent/tools']) {
    await checkApiJSON(p, true);
  }

  console.log('\n[3] Real agent LLM round-trip');
  await checkAgentCall();

  console.log('\n[4] Skills catalog');
  await checkSkillsCatalog();

  console.log('\n[5] Static assets');
  await checkAsset('/assets/forge-models/vanguard-art.jpg', false);
  await checkAsset('/assets/agents/SHADDAI-portrait.png', false);

  console.log('\n[6] ENV readiness');
  checkEnv();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const critFailed = results.filter((r) => !r.ok && r.critical);
  console.log('\n' + '='.repeat(60));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (critFailed.length) {
    console.log('CRITICAL failures:');
    for (const c of critFailed) console.log(`  - ${c.label}: ${c.detail}`);
  }
  process.exit(critFailed.length ? 1 : 0);
})();
