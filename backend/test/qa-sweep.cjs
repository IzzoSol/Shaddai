#!/usr/bin/env node
/*
 * qa-sweep.cjs — PIKADON's self-contained QA harness for the SHADDAI backend.
 *
 * Boots the SHADDAI express app (mirroring _dash93.cjs's mount list) on an
 * ISOLATED port (8242), exercises every backend endpoint, prints a PASS/FAIL
 * table + prioritized bug list, then closes the server.
 *
 * Exit code 0 if all pass, 1 otherwise.
 *
 * Run from the project root:
 *     node backend/test/qa-sweep.cjs
 *
 * NODE_PATH is self-set below (the app requires backend/node_modules on the path).
 */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');         // project root
const BACKEND = path.join(ROOT, 'backend');
const NM = path.join(BACKEND, 'node_modules');

// Ensure backend/node_modules is resolvable (the app depends on it).
process.env.NODE_PATH = NM + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
require('module').Module._initPaths();

const PORT = 8242;
const BASE = `http://127.0.0.1:${PORT}`;

// ── boot the app exactly like _dash93.cjs (minus the HTML/static routes) ──
const express = require(path.join(NM, 'express'));
const app = express();

function safeMount(label, fn) {
  try { fn(); } catch (e) { console.warn(`[qa] mount failed (${label}):`, e.message); }
}

safeMount('forge',        () => app.use('/api/forge',        require(path.join(BACKEND, 'forge', 'forge-routes'))));
safeMount('collectables', () => app.use('/api/collectables', require(path.join(BACKEND, 'collectables', 'collectables-routes'))));
safeMount('rooms',        () => app.use('/api/rooms',        require(path.join(BACKEND, 'rooms', 'rooms-routes'))));
safeMount('operatives',   () => app.use('/api/operatives',   require(path.join(BACKEND, 'lib', 'operatives-routes'))));
safeMount('federation',   () => app.use(require(path.join(BACKEND, 'federation-routes'))));
safeMount('districts',    () => app.use(require(path.join(BACKEND, 'district-routes'))));

// agent-engine shim routes (mirror _dash93.cjs)
safeMount('agent-engine', () => {
  const ae = require(path.join(BACKEND, 'agent-engine'));
  app.get('/api/agent/tools', (req, res) => {
    const tools = Object.values(ae.TOOLS).map(t => ({ name: t.name, description: t.description, schema: t.schema, agents: t.agents }));
    res.json({ tools, total: tools.length });
  });
  if (ae.skillIndex) {
    app.get('/api/skills/stats', (req, res) => { try { res.json(ae.skillIndex.getStats()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app.get('/api/skills/find', (req, res) => {
      const { query, agent, limit } = req.query;
      if (!query) return res.status(400).json({ error: 'query required' });
      try { const skills = ae.skillIndex.findSkills(query, { agent, limit: parseInt(limit) || 10 }); res.json({ query, count: skills.length, skills }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
  }
});

// ── test framework ──
const results = [];   // { name, pass, detail, severity }
function check(name, pass, detail, severity) {
  results.push({ name, pass: !!pass, detail: detail || '', severity: severity || 'HIGH' });
}

async function req(method, urlPath, { body, headers } = {}) {
  const opts = { method, headers: Object.assign({}, headers) };
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    opts.headers['content-type'] = 'application/json';
  }
  const r = await fetch(BASE + urlPath, opts);
  let json = null, text = '';
  try { text = await r.text(); json = JSON.parse(text); } catch (e) { /* non-json */ }
  return { status: r.status, json, text };
}

async function runTests() {
  // 1. Navigator ask
  try {
    const r = await req('GET', '/api/navigator/ask?q=how+do+I+forge+an+agent');
    const ans = (r.json && String(r.json.answer || '')) || '';
    check('GET /api/navigator/ask', r.status === 200 && /forge/i.test(ans),
      `status=${r.status} answerMentionsForge=${/forge/i.test(ans)}`, 'HIGH');
  } catch (e) { check('GET /api/navigator/ask', false, 'threw: ' + e.message, 'HIGH'); }

  // 2. Navigator aura
  try {
    const r = await req('GET', '/api/navigator/aura');
    check('GET /api/navigator/aura', r.status === 200 && r.json && r.json.ok === true && typeof r.json.aura === 'object',
      `status=${r.status} ok=${r.json && r.json.ok}`, 'MEDIUM');
  } catch (e) { check('GET /api/navigator/aura', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 3. Library note + search
  const tag = 'qasweep_' + Date.now().toString(36);
  try {
    const post = await req('POST', '/api/library/note', { body: { title: 'QA Sweep ' + tag, body: 'marker ' + tag } });
    const postOk = post.status === 200 && post.json && post.json.ok === true;
    const search = await req('GET', '/api/library/search?q=' + encodeURIComponent(tag));
    const found = search.status === 200 && search.json && search.json.count > 0;
    check('POST /api/library/note', postOk, `status=${post.status} ok=${post.json && post.json.ok}`, 'HIGH');
    check('GET /api/library/search (round-trip)', found, `status=${search.status} count=${search.json && search.json.count}`, 'HIGH');
  } catch (e) { check('POST /api/library/note', false, 'threw: ' + e.message, 'HIGH'); }

  // 4. Aegis scan — eval detection
  try {
    const r = await req('POST', '/api/aegis/scan', { body: { target: 'const x=eval(req.query.c)' } });
    const sec = r.json && r.json.result && r.json.result.security;
    const finds = JSON.stringify(sec || '').toLowerCase().includes('eval');
    check('POST /api/aegis/scan (eval)', r.status === 200 && finds,
      `status=${r.status} flaggedEval=${finds}`, 'HIGH');
  } catch (e) { check('POST /api/aegis/scan (eval)', false, 'threw: ' + e.message, 'HIGH'); }

  // 5. Aegis scan — CVE lookup
  try {
    const r = await req('POST', '/api/aegis/scan', { body: { target: 'log4j' } });
    const cve = r.json && r.json.result && r.json.result.cve;
    const hasCve = /CVE-\d{4}-\d+/i.test(String(cve || ''));
    check('POST /api/aegis/scan (cve log4j)', r.status === 200 && hasCve,
      `status=${r.status} hasCVE=${hasCve} cveSnippet=${String(cve || '').slice(0, 60)}`, 'MEDIUM');
  } catch (e) { check('POST /api/aegis/scan (cve log4j)', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 6. Esoteric gating — free → 402
  try {
    const r = await req('POST', '/api/oracle/esoteric', { body: { query: 'numerology', tier: 'free' } });
    check('POST /api/oracle/esoteric (free→402)', r.status === 402,
      `status=${r.status} (expected 402)`, 'HIGH');
  } catch (e) { check('POST /api/oracle/esoteric (free→402)', false, 'threw: ' + e.message, 'HIGH'); }

  // 7. Esoteric — pro → 200
  try {
    const r = await req('POST', '/api/oracle/esoteric', { body: { query: 'numerology', tier: 'pro' } });
    check('POST /api/oracle/esoteric (pro→200)', r.status === 200 && r.json && r.json.ok === true,
      `status=${r.status} ok=${r.json && r.json.ok}`, 'HIGH');
  } catch (e) { check('POST /api/oracle/esoteric (pro→200)', false, 'threw: ' + e.message, 'HIGH'); }

  // 8. agent.json
  try {
    const r = await req('GET', '/.well-known/agent.json');
    const skills = (r.json && r.json.skills) || [];
    check('GET /.well-known/agent.json', r.status === 200 && skills.length === 7,
      `status=${r.status} skills=${skills.length} (expected 7)`, 'MEDIUM');
  } catch (e) { check('GET /.well-known/agent.json', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 9. mcp.json
  try {
    const r = await req('GET', '/.well-known/mcp.json');
    check('GET /.well-known/mcp.json', r.status === 200 && r.json && Array.isArray(r.json.tools),
      `status=${r.status} tools=${r.json && r.json.tools && r.json.tools.length}`, 'MEDIUM');
  } catch (e) { check('GET /.well-known/mcp.json', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 10. A2A submission → 202 + visitor recorded
  try {
    const r = await req('POST', '/api/a2a', { body: { skill: 'research', task: 'hi' }, headers: { 'x-agent-name': 'QASweepBot' } });
    check('POST /api/a2a (research→202)', r.status === 202,
      `status=${r.status} (expected 202) body=${JSON.stringify(r.json).slice(0, 80)}`, 'HIGH');
    const v = await req('GET', '/api/grid/visitors');
    check('GET /api/grid/visitors (count>=1)', v.status === 200 && v.json && v.json.count >= 1,
      `status=${v.status} count=${v.json && v.json.count}`, 'MEDIUM');
  } catch (e) { check('POST /api/a2a (research→202)', false, 'threw: ' + e.message, 'HIGH'); }

  // 11. Grid portals
  try {
    const r = await req('GET', '/api/grid/portals');
    check('GET /api/grid/portals', r.status === 200 && r.json && Array.isArray(r.json.portals),
      `status=${r.status} portals=${r.json && r.json.portals && r.json.portals.length}`, 'LOW');
  } catch (e) { check('GET /api/grid/portals', false, 'threw: ' + e.message, 'LOW'); }

  // 12. Agent tools (~200)
  try {
    const r = await req('GET', '/api/agent/tools');
    const total = r.json && r.json.total;
    check('GET /api/agent/tools (~200)', r.status === 200 && total > 0,
      `status=${r.status} total=${total} (expected ~200)`, 'HIGH');
  } catch (e) { check('GET /api/agent/tools (~200)', false, 'threw: ' + e.message, 'HIGH'); }

  // 13. Skills stats (~3437)
  try {
    const r = await req('GET', '/api/skills/stats');
    const total = r.json && (r.json.total != null ? r.json.total : r.json.totalSkills);
    check('GET /api/skills/stats (~3437)', r.status === 200 && total > 0,
      `status=${r.status} total=${total} (expected ~3437)`, 'MEDIUM');
  } catch (e) { check('GET /api/skills/stats (~3437)', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 14. Skills find
  try {
    const r = await req('GET', '/api/skills/find?query=numerology');
    check('GET /api/skills/find?query=numerology', r.status === 200 && r.json && r.json.count > 0,
      `status=${r.status} count=${r.json && r.json.count}`, 'MEDIUM');
  } catch (e) { check('GET /api/skills/find?query=numerology', false, 'threw: ' + e.message, 'MEDIUM'); }

  // 15. Collectables list
  try {
    const r = await req('GET', '/api/collectables/list');
    check('GET /api/collectables/list', r.status === 200,
      `status=${r.status}`, 'LOW');
  } catch (e) { check('GET /api/collectables/list', false, 'threw: ' + e.message, 'LOW'); }

  // 16. Operatives
  try {
    const r = await req('GET', '/api/operatives');
    check('GET /api/operatives', r.status === 200,
      `status=${r.status}`, 'LOW');
  } catch (e) { check('GET /api/operatives', false, 'threw: ' + e.message, 'LOW'); }
}

// ── render table ──
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function printReport() {
  console.log('\n' + '='.repeat(96));
  console.log('  SHADDAI BACKEND QA SWEEP — PIKADON  (port ' + PORT + ')');
  console.log('='.repeat(96));
  console.log('  ' + pad('RESULT', 7) + pad('ENDPOINT', 44) + 'DETAIL');
  console.log('  ' + '-'.repeat(92));
  for (const r of results) {
    console.log('  ' + pad(r.pass ? 'PASS' : 'FAIL', 7) + pad(r.name, 44) + r.detail);
  }
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log('  ' + '-'.repeat(92));
  console.log(`  TOTAL: ${results.length}   PASS: ${passed}   FAIL: ${failed}`);

  const bugs = results.filter(r => !r.pass).sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.severity] - order[b.severity];
  });
  if (bugs.length) {
    console.log('\n  PRIORITIZED BUG LIST:');
    bugs.forEach((b, i) => console.log(`   ${i + 1}. [${b.severity}] ${b.name} — ${b.detail}`));
  } else {
    console.log('\n  No bugs found. All endpoints behaved as expected.');
  }
  console.log('='.repeat(96) + '\n');
  return failed;
}

// ── main ──
const server = app.listen(PORT, '127.0.0.1', async () => {
  let failed = 1;
  try {
    await runTests();
    failed = printReport();
  } catch (e) {
    console.error('[qa] fatal:', e && e.stack || e);
  } finally {
    server.close(() => process.exit(failed === 0 ? 0 : 1));
    // safety: force-exit if close hangs (agent-engine timers etc.)
    setTimeout(() => process.exit(failed === 0 ? 0 : 1), 1500).unref();
  }
});
server.on('error', (e) => { console.error('[qa] server error:', e.message); process.exit(1); });
