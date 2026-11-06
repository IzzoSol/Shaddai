// tools/tests/operatives-route.redteam.cjs  (node tools/tests/operatives-route.redteam.cjs)
// Red-team POST /api/operatives: client must not control id / economy / stats / inventory / owner. Store + char-gen are stubbed.
const path = require('path'), fs = require('fs'), http = require('http');
const LIB = path.join(__dirname, '..', '..', 'backend', 'lib') + path.sep;
const ROOMS = path.join(LIB, '..', 'data', 'agent-rooms.json'); const roomsBak = fs.existsSync(ROOMS) ? fs.readFileSync(ROOMS) : null;
const calls = [];
require.cache[require.resolve(LIB + 'operatives.js')] = { id: 'stub', filename: 'stub', loaded: true, exports: {
  create: rec => { calls.push(rec); return Object.assign({ id: 'op_test', codename: rec.codename, tools: rec.tools || [] }, rec); },
  all: () => [], listByOwner: () => [], get: () => null, update: () => null, remove: () => null } };
require.cache[require.resolve(LIB + 'char-gen.js')] = { id: 'stub2', filename: 'stub2', loaded: true, exports: { generateCharForOperative: async () => {} } };
const express = require('express');
const app = express(); app.use('/api/operatives', require(LIB + 'operatives-routes.js'));
const srv = app.listen(0, async () => {
  const port = srv.address().port; let pass = 0, fail = 0;
  const post = body => new Promise(res => { const d = JSON.stringify(body); const r = http.request({ port, method: 'POST', path: '/api/operatives', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, s => { let t = ''; s.on('data', c => t += c); s.on('end', () => res({ status: s.statusCode, body: t })); }); r.end(d); });
  const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };
  try {
    const r1 = await post({ codename: 'REDTEAM', id: 'op_victim_123', owner: 'victim@x.com', economy: { earnings: 1e9 }, stats: { power: 999 }, inventory: { cosmetics: ['all'] }, tokenId: 1, model: 'NEXUS', tools: ['Research'] });
    const c = calls[0] || {};
    ok('request accepted (200)', r1.status === 200);
    ok('client id dropped', c.id === undefined);
    ok('client economy dropped', c.economy === undefined);
    ok('client stats dropped', c.stats === undefined);
    ok('client inventory dropped', c.inventory === undefined);
    ok('client tokenId dropped', c.tokenId === undefined);
    ok('owner comes from server, not body', c.owner !== 'victim@x.com');
    ok('creative fields kept (model, tools, codename)', c.model === 'NEXUS' && Array.isArray(c.tools) && c.codename === 'REDTEAM');
    const r2 = await post({ model: 'NEXUS' });
    ok('missing codename -> 400', r2.status === 400);
  } finally {
    if (roomsBak) fs.writeFileSync(ROOMS, roomsBak); else if (fs.existsSync(ROOMS)) fs.unlinkSync(ROOMS);
    console.log(`\n${pass} passed, ${fail} failed`); srv.close(); process.exit(fail ? 1 : 0);
  }
});
