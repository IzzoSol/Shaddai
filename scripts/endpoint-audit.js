#!/usr/bin/env node
'use strict';
/**
 * Endpoint-integrity audit: every /api/... the FRONTEND calls vs every backend route.
 * Flags frontend calls with no matching backend route ("broken links").
 * Heuristic but high-signal; review flagged items manually.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };

// normalize a path into segments; dynamic parts (:id, ${x}, *) → '*'
function pattern(p) {
  return p.replace(/[?#].*$/, '')                 // drop query/hash
          .replace(/\$\{[^}]*\}/g, '*')           // template vars
          .replace(/:[A-Za-z0-9_]+/g, '*')        // :param
          .replace(/`/g, '')
          .split('/').filter(Boolean);
}
function segEq(x, y) { return x === y || x === '*' || y === '*'; }
function segMatch(a, b) {
  // exact-length match …
  if (a.length === b.length) return a.every((s, i) => segEq(s, b[i]));
  // …or one is a prefix of the other (frontend concatenates :id onto a literal,
  // e.g. fetch('/api/council/run/' + id) → backend '/council/run/:id').
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.every((s, i) => segEq(s, long[i]));
}

// External (non-SHADDAI) API prefixes the frontend legitimately calls direct.
const EXTERNAL = [/^\/api\/v\d/, /^\/api\/mirofish/, /^\/api\/(json|tags|tickers|quote|notes)$/, /^\/api\/v1\/chat/];
function isExternal(p) { return EXTERNAL.some(re => re.test(p)); }

// ---- FRONTEND calls ----
const html = read('public/index.html');
const feRaw = (html.match(/\/api\/[A-Za-z0-9_\-/:.$\{\}`]*/g) || [])
  .map(s => s.replace(/['"`).,;]+$/, ''))
  .filter(s => s.length > 4);
const fePatterns = [...new Set(feRaw.map(s => '/' + pattern(s).join('/')))].sort();

// ---- BACKEND routes ----
const mounts = [
  ['backend/api-proxy-routes.js', '/api'],
  ['backend/moonpay-agent.js', '/api/moonpay'],
  ['backend/brains.js', '/api/brains'],
  ['backend/billing-routes.js', '/api/billing'],
  ['backend/llm-proxy-routes.js', '/api/llm'],
  ['backend/server-production.js', ''], // app.METHOD('/api/...') absolute
];
const beRoutes = [];
for (const [file, mount] of mounts) {
  const src = read(file);
  const re = /\b(?:router|app)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src))) {
    let full = (m[2].startsWith('/api/') || m[2] === '/api') ? m[2] : (mount + m[2]);
    if (!full.startsWith('/api')) continue;
    beRoutes.push(pattern(full));
  }
}

// ---- DIFF ----
const broken = [];
const external = [];
for (const fe of fePatterns) {
  const segs = pattern(fe);
  const hit = beRoutes.some(be => segMatch(segs, be));
  if (hit) continue;
  if (isExternal(fe)) { external.push(fe); continue; }
  broken.push(fe);
}

console.log(`Frontend /api patterns: ${fePatterns.length}`);
console.log(`Backend routes parsed:  ${beRoutes.length}`);
console.log(`\n=== POSSIBLE BROKEN LINKS (frontend call, no backend route) ===`);
if (!broken.length) console.log('  none 🎉');
else broken.forEach(b => console.log('  ✗ ' + b));
process.exit(0);
