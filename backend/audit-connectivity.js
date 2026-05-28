#!/usr/bin/env node
/**
 * SHADDAI Connectivity Audit (static — no server, no tokens)
 *
 * Verifies "everything connects to everything":
 *  1. Frontend /api/* calls       → a matching backend route exists  (broken links)
 *  2. Agent tool arrays           → every named tool exists in TOOLS  (dead refs)
 *  3. Every TOOL                  → assigned to ≥1 agent (or dynamic/MCP)
 *  4. Skill recipe tool refs      → the referenced tools exist
 *  5. Module wiring               → mcp-client, pay-guard, engine load
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'FINAL-SHADDAI-79.9.html'), 'utf8');
const ROUTES_SRC = fs.readFileSync(path.join(__dirname, 'api-proxy-routes.js'), 'utf8');

let problems = 0;
const P = (msg) => { console.log('  ✗ ' + msg); problems++; };
const OK = (msg) => console.log('  ✓ ' + msg);

// ── 1. Backend route inventory ──────────────────────────────────────────────
// router.get/post/put/delete/patch('/path', ...) — note routes are mounted under /api
const routeRe = /router\.(get|post|put|delete|patch|all|use)\(\s*['"`]([^'"`]+)['"`]/g;
const backendRoutes = new Set();
let m;
while ((m = routeRe.exec(ROUTES_SRC)) !== null) {
  let p = m[2];
  // router is mounted at /api, so every relative route gets that prefix
  // (guard with '/api/' + trailing slash so '/apis/x' isn't mistaken for already-prefixed)
  if (!p.startsWith('/api/')) p = '/api' + p;
  backendRoutes.add(p);
}
// Also scan server-production.js for any app.get/post routes
try {
  const SRV = fs.readFileSync(path.join(__dirname, 'server-production.js'), 'utf8');
  let sm; const sre = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  while ((sm = sre.exec(SRV)) !== null) backendRoutes.add(sm[2].startsWith('/api') ? sm[2] : sm[2]);
} catch {}

// Match a called path against routes by segments (a route :param or a called
// ${template} segment matches anything). No regex built from paths (avoids
// special-char crashes).
function routeExists(called) {
  const pathOnly = called.split('?')[0];
  const cSeg = pathOnly.split('/').map(s => /\$\{[^}]+\}/.test(s) ? '*' : s);
  for (const r of backendRoutes) {
    const rSeg = r.split('/');
    // wildcard route (…/*) matches any path sharing its prefix
    if (rSeg[rSeg.length - 1] === '*') {
      const prefix = rSeg.slice(0, -1);
      if (prefix.every((s, i) => s.startsWith(':') || s === cSeg[i])) return true;
      continue;
    }
    if (rSeg.length !== cSeg.length) continue;
    if (rSeg.every((s, i) => s.startsWith(':') || s === cSeg[i] || cSeg[i] === '*')) return true;
  }
  return false;
}

// ── Frontend /api/* calls ─────────────────────────────────────────────────
console.log('\n[1] FRONTEND → BACKEND /api LINKS');
const apiCallRe = /(?:fetch|PROXY\s*\+|axios\.\w+)\s*\(?\s*[`'"]([^`'"]*\/api\/[^`'"]+)[`'"]/g;
const calledPaths = new Set();
// External hosts whose paths happen to contain /api/ — NOT SHADDAI backend routes
const EXTERNAL = /^https?:\/\/(?!localhost:3000|127\.0\.0\.1:3000)/i;
while ((m = apiCallRe.exec(HTML)) !== null) {
  let u = m[1];
  if (EXTERNAL.test(u)) continue;                  // external API (coingecko, tarotapi, ollama:11434, etc.)
  const idx = u.indexOf('/api/');
  if (idx >= 0) u = u.slice(idx);
  u = u.split('?')[0];
  if (u.length > 5) calledPaths.add(u);
}
// Also catch `${PROXY}/api/...` and `${AURA_BASE}/aura/...`
const tmplRe = /[`'"]\$\{(?:PROXY|window\.PROXY|[A-Z_]+)\}(\/(?:api|aura)\/[^`'"]+)[`'"]/g;
while ((m = tmplRe.exec(HTML)) !== null) calledPaths.add(m[1].split('?')[0]);

let auraCalls = 0, broken = 0;
for (const c of [...calledPaths].sort()) {
  if (c.startsWith('/aura/')) { auraCalls++; continue; }    // AURA is a separate service
  if (routeExists(c)) { /* fine */ }
  else { P(`frontend calls ${c} — NO matching backend route`); broken++; }
}
if (!broken) OK(`all ${calledPaths.size - auraCalls} /api frontend calls map to a backend route`);
OK(`${auraCalls} /aura calls → separate AURA service (port 8010)`);
OK(`${backendRoutes.size} backend routes registered`);

// ── 2 & 3. Tool ↔ agent integrity (load the engine) ─────────────────────────
console.log('\n[2] TOOL ↔ AGENT INTEGRITY');
let engine;
try { engine = require('./agent-engine.js'); OK('agent-engine.js loads'); }
catch (e) { P('agent-engine.js FAILED to load: ' + e.message); console.log(`\nSUMMARY: ${problems} problems\n`); process.exit(1); }

const TOOLS = engine.TOOLS, AGENTS = engine.AGENTS;
const toolNames = new Set(Object.keys(TOOLS));

// 2a. every agent tool ref exists
let deadRefs = 0;
for (const [aname, a] of Object.entries(AGENTS)) {
  for (const t of (a.tools || [])) {
    if (!toolNames.has(t)) { P(`agent ${aname} references missing tool: ${t}`); deadRefs++; }
  }
}
if (!deadRefs) OK('every agent tool reference resolves to a real tool');

// 2b. every tool assigned to ≥1 agent
const assigned = new Set();
for (const a of Object.values(AGENTS)) (a.tools || []).forEach(t => assigned.add(t));
const unassigned = [...toolNames].filter(t => !assigned.has(t));
if (unassigned.length) P(`${unassigned.length} tools not assigned to any agent: ${unassigned.join(', ')}`);
else OK(`all ${toolNames.size} tools assigned to ≥1 agent`);

// 2c. every tool has name + schema + execute
let badShape = 0;
for (const [n, t] of Object.entries(TOOLS)) {
  if (!t.name) { P(`tool ${n} missing name`); badShape++; }
  if (!t.schema) { P(`tool ${n} missing schema`); badShape++; }
  if (typeof t.execute !== 'function') { P(`tool ${n} missing execute()`); badShape++; }
}
if (!badShape) OK(`all ${toolNames.size} tools have name + schema + execute()`);

// ── 4. Recipe tool references ───────────────────────────────────────────────
console.log('\n[3] SKILL RECIPE TOOL REFERENCES');
try {
  const recipesPath = path.join(__dirname, 'data', 'recipes.json');
  let recipeRefs = 0, recipeBad = 0;
  if (fs.existsSync(recipesPath)) {
    const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8'));
    const list = Array.isArray(recipes) ? recipes : (recipes.recipes || Object.values(recipes));
    for (const r of list) {
      for (const step of (r.steps || [])) {
        recipeRefs++;
        if (step.tool && !toolNames.has(step.tool)) { P(`recipe ${r.id || r.name} → missing tool ${step.tool}`); recipeBad++; }
      }
    }
    if (!recipeBad) OK(`all ${recipeRefs} recipe tool refs resolve (${list.length} recipes)`);
  } else { OK('no recipes.json (recipes may be baked in skill-index) — skipped'); }
} catch (e) { P('recipe check error: ' + e.message); }

// ── 5. Module wiring ────────────────────────────────────────────────────────
console.log('\n[4] MODULE WIRING');
for (const mod of ['./mcp-client', './pay-guard', './llm-tracer', './cache-analytics', './skill-embeddings', './agent-event-bus']) {
  try { require(mod); OK(`${mod} loads`); }
  catch (e) { P(`${mod} FAILED: ${e.message}`); }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(problems === 0 ? '✅ FULLY CONNECTED — 0 problems' : `❌ ${problems} connectivity problem(s) found`);
console.log('═'.repeat(50) + '\n');
process.exit(problems > 0 ? 1 : 0);
