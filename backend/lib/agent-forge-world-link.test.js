// node backend/lib/agent-forge-world-link.test.js — a forged or imported agent shows up in the 3D world's roster (2026-11-06).
// Real: agent-forge-routes.js (+ requireSignedIn), the unified Operative store (temp file), server/agentBodies.js /forge-roster.
// Stubbed (via require.cache, so no real backend/data is touched): agent-forge.js, grok-connect.js, auth-guard.js softAuth.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-afwl-'));
process.env.SHADDAI_OPERATIVES_FILE = path.join(TMP, 'ops.json'); process.env.SHADDAI_MMO_DATA = TMP; delete process.env.NODE_ENV;
const lib = __dirname, backend = path.join(lib, '..'), root = path.join(backend, '..');
function stub(file, exp) { const k = require.resolve(file); require.cache[k] = { id: k, filename: k, loaded: true, exports: exp }; }
const agents = {}; let n = 0;
stub(path.join(lib, 'agent-forge.js'), {
  listKits: () => [], forgeAgent: (spec) => { if (!spec.name) return { ok: false, error: 'name' }; const a = { id: 'agent_' + (++n), name: spec.name, role: spec.role || 'helper', skills: spec.skills || ['search_web'], owner: spec.owner }; agents[a.id] = a; return { ok: true, agent: a }; },
  removeAgent: (id, owner) => (agents[id] && agents[id].owner === owner ? (delete agents[id], { ok: true }) : { ok: false, error: 'not found' }),
  listMine: () => [], TRAITS: {}
});
stub(path.join(backend, 'grok-connect.js'), { buildAndRegisterBot: ({ name, tools }) => ({ bot: { id: 'grok_' + (++n), name, hasKey: false }, tools: (tools || []).filter(t => t !== 'trade') }) });
stub(path.join(backend, 'auth-guard.js'), { softAuth: (req, _res, next) => { const u = req.headers['x-test-user']; req.userId = u || 'local'; req.isAuthenticated = !!u; next(); } });

const express = require('express');
const app = express(); app.use(express.json());
app.use('/api/agent-forge', require('./agent-forge-routes'));
app.use('/api/mmo/agent', (req, _res, next) => { req.userId = req.headers['x-test-user'] || ''; next(); }, require(path.join(root, 'server', 'agentBodies')));
const ops = require('./operatives');

let base, server, pass = 0; const tests = [];
const t = (name, fn) => tests.push([name, fn]);
async function call(method, p, body, user) {
  const h = { 'Content-Type': 'application/json' }; if (user) h['x-test-user'] = user;
  const r = await fetch(base + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

t('forging needs a real sign-in (401 when anonymous)', async () => { const r = await call('POST', '/api/agent-forge', { name: 'Nova' }); assert.strictEqual(r.status, 401); assert.strictEqual(ops.all().length, 0); });
t('forge creates a linked operative the world roster lists', async () => {
  const r = await call('POST', '/api/agent-forge', { name: 'Nova', model: 'turtle' }, 'u1');
  assert.strictEqual(r.status, 200); assert(r.json.operative && r.json.operative.codename === 'NOVA'); assert.strictEqual(r.json.operative.model, 'TURTLE');
  const op = ops.get(r.json.operative.id); assert.strictEqual(op.agentId, r.json.agent.id); assert.strictEqual(op.owner, 'u1'); assert.strictEqual(op.brain.brainId, 'agent:' + r.json.agent.id);
  const ro = await call('GET', '/api/mmo/agent/forge-roster', null, 'u1'); assert.strictEqual(ro.status, 200); assert(ro.json.agents.some(a => a.codename === 'NOVA'));
});
t('re-forging the same name updates in place (no ghost duplicate)', async () => { await call('POST', '/api/agent-forge', { name: 'nova' }, 'u1'); assert.strictEqual(ops.listByOwner('u1').filter(o => o.codename === 'NOVA').length, 1); });
t("another player's roster never sees it", async () => { const ro = await call('GET', '/api/mmo/agent/forge-roster', null, 'u2'); assert(!ro.json.agents.some(a => a.codename === 'NOVA')); });
t('importing a Grok bot also lands in the world roster (tools filtered, no key stored)', async () => {
  const r = await call('POST', '/api/agent-forge/import', { name: 'My Grok', source: 'grok', tools: ['search_web', 'trade'], apiKey: 'xai-secret' }, 'u1');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.operative.codename, 'MY GROK');
  const op = ops.get(r.json.operative.id); assert.deepStrictEqual(op.tools, ['search_web']); assert.strictEqual(op.source, 'grok'); assert(!JSON.stringify(op).includes('xai-secret'));
  const ro = await call('GET', '/api/mmo/agent/forge-roster', null, 'u1'); assert(ro.json.agents.some(a => a.codename === 'MY GROK'));
});
t('importing needs a real sign-in too', async () => { const r = await call('POST', '/api/agent-forge/import', { name: 'Anon bot' }); assert.strictEqual(r.status, 401); });
t('deleting the agent removes its operative; others are untouched', async () => {
  const nova = ops.listByOwner('u1').find(o => o.codename === 'NOVA');
  const r = await call('DELETE', '/api/agent-forge/' + nova.agentId, null, 'u1'); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.operativesRemoved, 1);
  assert(!ops.get(nova.id)); assert(ops.listByOwner('u1').some(o => o.codename === 'MY GROK'));
});
t("you cannot delete someone else's agent", async () => { const g = ops.listByOwner('u1').find(o => o.codename === 'MY GROK'); const r = await call('DELETE', '/api/agent-forge/' + g.agentId, null, 'u2'); assert.strictEqual(r.status, 404); assert(ops.get(g.id)); });

(async () => {
  server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
  for (const [name, fn] of tests) { try { await fn(); pass++; console.log('  ok ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } }
  server.close(); fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`agent-forge-world-link: ${pass} passed, ${tests.length - pass} failed`);
})();
