/* Tests for the public API: key store, pnl JSON accessors, and HTTP endpoints.
   Run: node backend/scripts/test-public-api.js   (exit 0 = all pass) */
'use strict';
const assert = require('assert');
const http = require('http');
const express = require('express');

let passed = 0;
function ok(name, cond) { if (!cond) { console.error('✗ FAIL:', name); process.exitCode = 1; } else { passed++; console.log('✓', name); } }

// ── unit: api-keys ───────────────────────────────────────────────────────────
const keys = require('../api-keys');
const minted = keys.mint('test-label');
ok('mint returns a raw sk_live_ key', typeof minted.key === 'string' && minted.key.startsWith('sk_live_'));
ok('mint returns tier free', minted.tier === 'free');
const rec = keys.validate(minted.key);
ok('validate finds the minted key', rec && rec.tier === 'free');
ok('validate rejects garbage', keys.validate('nope') === null);
ok('raw key is NOT stored (hashed)', rec.hash !== minted.key && rec.hash.length === 64);
// rate limit: 60/min free → 61st call fails
let lastOk = true;
for (let i = 0; i < 61; i++) lastOk = keys.rateCheck(rec).ok;
ok('rateCheck blocks past 60/min', lastOk === false);
// IP mint throttle: 5/hour
let ipOk = true; for (let i = 0; i < 6; i++) ipOk = keys.mintAllowed('1.2.3.4');
ok('mintAllowed blocks past 5/hour/IP', ipOk === false);

// ── unit: pnl JSON accessors ─────────────────────────────────────────────────
const pnl = require('../telegram-pnl');
const calls = pnl.callsJson({ limit: 5 });
ok('callsJson returns an array', Array.isArray(calls));
if (calls.length) {
  const c = calls[0];
  ok('call shape has id/symbol/mint/currentMult/peakMult/ts',
    'id' in c && 'symbol' in c && 'mint' in c && 'currentMult' in c && 'peakMult' in c && 'ts' in c);
  ok('call shape has NO html/markup fields', !('milestones' in c) && !('closed' in c));
}
ok('callsJson respects limit clamp (≤100)', pnl.callsJson({ limit: 9999 }).length <= 100);
ok('callsJson since=now returns nothing newer', pnl.callsJson({ since: Date.now() + 1 }).length === 0);
const lb = pnl.leaderboardJson({ limit: 10 });
ok('leaderboardJson sorted by peakMult desc', lb.length < 2 || lb[0].peakMult >= lb[lb.length - 1].peakMult);
const st = pnl.statsJson();
ok('statsJson has totalCalls/hitRate2x/avgPeak/distribution',
  'totalCalls' in st && 'hitRate2x' in st && 'avgPeak' in st && st.distribution && 'x1_2' in st.distribution);
ok('findTokenJson miss → {called:false}', pnl.findTokenJson('___nope___').called === false);

// ── integration: HTTP endpoints ──────────────────────────────────────────────
const app = express();
app.use('/api/v1', require('../public-api-routes'));
const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const J = async (path, opts) => { const r = await fetch(base + path, opts); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  try {
    // no key → 401
    let r = await J('/api/v1/calls');
    ok('GET /calls without key → 401', r.status === 401 && r.body.ok === false);
    // SECURITY: query-param key must NOT authenticate (keys must not travel in URLs)
    r = await J('/api/v1/calls?key=anything');
    ok('GET /calls?key=… (query param) → 401 (header-only)', r.status === 401);
    // mint a key over HTTP
    r = await J('/api/v1/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'http-test' }) });
    ok('POST /keys mints a key', r.status === 200 && r.body.ok && r.body.key);
    const key = r.body.key;
    const auth = { headers: { Authorization: 'Bearer ' + key } };
    // authed reads → 200 with envelope
    r = await J('/api/v1/calls?limit=3', auth);
    ok('GET /calls with key → 200 {ok,data[]}', r.status === 200 && r.body.ok && Array.isArray(r.body.data));
    r = await J('/api/v1/stats', auth);
    ok('GET /stats with key → 200 {ok,data}', r.status === 200 && r.body.ok && r.body.data && 'totalCalls' in r.body.data);
    r = await J('/api/v1/leaderboard?limit=5', auth);
    ok('GET /leaderboard with key → 200', r.status === 200 && r.body.ok && Array.isArray(r.body.data));
    r = await J('/api/v1/me', auth);
    ok('GET /me with key → 200 tier=free', r.status === 200 && r.body.data.tier === 'free');
    r = await J('/api/v1/token/__nope__', auth);
    ok('GET /token miss → {called:false}', r.status === 200 && r.body.data.called === false);
  } catch (e) {
    console.error('✗ integration error:', e.message); process.exitCode = 1;
  } finally {
    server.close();
    console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' — WITH FAILURES' : ' — all green'));
  }
});
