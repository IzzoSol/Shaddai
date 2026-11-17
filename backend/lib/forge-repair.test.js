// node backend/lib/forge-repair.test.js — FORGE REPAIR 2026-11-15.
// Proves: (1) a body pick persists exactly as picked (council + all 8 Forge
// archetypes + PIXEL), (2) an unknown body is an explicit API error and
// creates NOTHING, (3) the 3D-body gate reads its plan from the plans table
// and its off-switch works, (4) skill selection comes from the REAL academy
// catalogue and persists — with workflows — on BOTH the agent record and
// the linked operative (the record the Gallery reads), (5) the body
// catalogue endpoint offers the glow office body + all assignable bodies.
// Real: body-catalog.js, operatives.js, operatives-routes.js,
// agent-forge.js, agent-forge-routes.js. Stubbed: auth-guard softAuth
// (x-test-user header), via require.cache. Operatives store is a temp file.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-forge-repair-'));
process.env.SHADDAI_OPERATIVES_FILE = path.join(TMP, 'ops.json');
delete process.env.SHADDAI_FORGE_GATE;
const lib = __dirname, backend = path.join(lib, '..');
function stub(file, exp) { const k = require.resolve(file); require.cache[k] = { id: k, filename: k, loaded: true, exports: exp }; }
stub(path.join(backend, 'auth-guard.js'), { softAuth: (req, _res, next) => { const u = req.headers['x-test-user']; req.userId = u || undefined; req.isAuthenticated = !!u; next(); } });

// agent-forge.js writes into backend/data — snapshot so the run leaves no trace.
const DATA = path.join(backend, 'data');
const snap = {};
for (const f of ['custom_agents.json', 'agent_wallets.json']) {
  const p = path.join(DATA, f);
  snap[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

const express = require('express');
const app = express(); app.use(express.json());
app.use('/api/operatives', require('./operatives-routes'));
app.use('/api/agent-forge', require('./agent-forge-routes'));
const ops = require('./operatives');
const bc = require('./body-catalog');
const forge = require('./agent-forge');
const { ENTRIES } = require('./academy/curriculum/entries');
const ACAD_ID = (ENTRIES[0].skill || ENTRIES[0]).id;
const kitId = (forge.listKits().find((k) => k.available) || {}).id;

let base, server, pass = 0; const tests = [];
const t = (name, fn) => tests.push([name, fn]);
async function call(method, p, body, user) {
  const h = { 'Content-Type': 'application/json' }; if (user) h['x-test-user'] = user;
  const r = await fetch(base + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/* ── unit: the catalogue ─────────────────────────────────────────────── */
t('resolveModel: archetype ids canonicalise (ghost, FORGE-Street-Deity)', () => {
  assert.strictEqual(bc.resolveModel('ghost').model, 'FORGE-GHOST');
  assert.strictEqual(bc.resolveModel('FORGE-Street-Deity').model, 'FORGE-STREET-DEITY');
  assert.strictEqual(bc.resolveModel('vanguard').glb, '/assets/forge-models/vanguard-final.glb');
});
t('resolveModel: council + PIXEL pass through; empty = no pick', () => {
  assert.strictEqual(bc.resolveModel('zerox').model, 'ZEROX');
  assert.strictEqual(bc.resolveModel('PIXEL').model, 'PIXEL');
  assert.strictEqual(bc.resolveModel('').model, null);
  assert.strictEqual(bc.resolveModel(undefined).model, null);
});
t('resolveModel: unknown body and "glow" are explicit errors, never a substitute', () => {
  const bad = bc.resolveModel('bogus-body');
  assert.strictEqual(bad.ok, false); assert(bad.valid.includes('FORGE-GHOST'));
  const glow = bc.resolveModel('GLOW');
  assert.strictEqual(glow.ok, false); assert(/glow body/.test(glow.error));
});
t('gate plan is READ from the plans table (lowest tier with the body unlock)', () => {
  const req = bc.requiredEntitlement();
  assert(req && req.name && typeof req.price === 'number');
  const tiers = require('./tiers');
  const carrier = tiers.TIERS.find((x) => (x.unlocks || []).includes('Build 3D assets for the world'));
  assert.strictEqual(req.id, carrier.id); assert.strictEqual(req.price, carrier.price);
});

/* ── operatives API: picks persist, errors are explicit ──────────────── */
t('POST /api/operatives model=ghost persists FORGE-GHOST (was: silent SHADDAI)', async () => {
  const r = await call('POST', '/api/operatives', { codename: 'GHOSTIE', model: 'ghost' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.operative.model, 'FORGE-GHOST');
  assert.deepStrictEqual(r.json.operative.academySkills, []);
  assert.deepStrictEqual(r.json.operative.workflows, []);
});
t('POST /api/operatives: every archetype + council pick persists as picked', async () => {
  for (const id of bc.ARCHETYPE_IDS) {
    const r = await call('POST', '/api/operatives', { codename: 'A-' + id, model: 'FORGE-' + id });
    assert.strictEqual(r.json.operative.model, 'FORGE-' + id.toUpperCase(), id);
    if (id !== 'oracle') {   // bare 'oracle' is the COUNCIL body — the archetype needs its FORGE- prefix, same as the realm picker
      const bare = await call('POST', '/api/operatives', { codename: 'B-' + id, model: id });
      assert.strictEqual(bare.json.operative.model, 'FORGE-' + id.toUpperCase(), 'bare ' + id);
    }
  }
  const c = await call('POST', '/api/operatives', { codename: 'COUNCIL1', model: 'zerox' });
  assert.strictEqual(c.json.operative.model, 'ZEROX');
});
t('POST /api/operatives model=bogus → 400 explicit, and NO record is created', async () => {
  const before = ops.all().length;
  const r = await call('POST', '/api/operatives', { codename: 'BADBODY', model: 'bogus-body' });
  assert.strictEqual(r.status, 400); assert(/unknown body/.test(r.json.error)); assert(Array.isArray(r.json.validBodies));
  assert.strictEqual(ops.all().length, before);
  assert(!ops.all().some((o) => o.codename === 'BADBODY'));
});
t('POST /api/operatives: academySkills + workflows persist on the record', async () => {
  const r = await call('POST', '/api/operatives', { codename: 'SCHOLAR', model: 'PIXEL', academySkills: [ACAD_ID], workflows: ['lib.demo-flow'] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.deepStrictEqual(r.json.operative.academySkills, [ACAD_ID]);
  assert.deepStrictEqual(r.json.operative.workflows, ['lib.demo-flow']);
});
t('PATCH model=artisan persists FORGE-ARTISAN; PATCH bogus → 400, record untouched', async () => {
  const c = await call('POST', '/api/operatives', { codename: 'PATCHME', model: 'ZEROX' });
  const id = c.json.operative.id;
  const p = await call('PATCH', '/api/operatives/' + id, { model: 'artisan' }, 'local');
  assert.strictEqual(p.status, 200, JSON.stringify(p.json)); assert.strictEqual(p.json.operative.model, 'FORGE-ARTISAN');
  const bad = await call('PATCH', '/api/operatives/' + id, { model: 'nope' }, 'local');
  assert.strictEqual(bad.status, 400); assert.strictEqual(ops.get(id).model, 'FORGE-ARTISAN');
});

/* ── the gate ────────────────────────────────────────────────────────── */
t('gate: signed-in free caller gets 402 naming the plans-table plan for a 3D body; PIXEL + no-pick stay free', async () => {
  const g = await call('POST', '/api/operatives', { codename: 'GATED', model: 'ZEROX' }, 'u-free');
  assert.strictEqual(g.status, 402, JSON.stringify(g.json));
  assert(g.json.requires && g.json.requires.name); assert(/no substitute/.test(g.json.error));
  assert(!ops.all().some((o) => o.codename === 'GATED'));
  const px = await call('POST', '/api/operatives', { codename: 'PIXELFREE', model: 'PIXEL' }, 'u-free');
  assert.strictEqual(px.status, 200); assert.strictEqual(px.json.operative.model, 'PIXEL');
  const none = await call('POST', '/api/operatives', { codename: 'NOPICK' }, 'u-free');
  assert.strictEqual(none.status, 200);
});
t('gate off-switch: SHADDAI_FORGE_GATE=0 lets the same caller assign the body', async () => {
  process.env.SHADDAI_FORGE_GATE = '0';
  try {
    const r = await call('POST', '/api/operatives', { codename: 'GATEOFF', model: 'ZEROX' }, 'u-free');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.operative.model, 'ZEROX');
  } finally { delete process.env.SHADDAI_FORGE_GATE; }
});

/* ── agent-forge API: catalogue endpoints + forge-time selection ─────── */
t('GET /api/agent-forge/bodies: glow office body + 7 council + 8 archetypes + pixel, gate info attached', async () => {
  const r = await call('GET', '/api/agent-forge/bodies');
  assert.strictEqual(r.status, 200);
  const kinds = {}; for (const b of r.json.bodies) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  assert.deepStrictEqual(kinds, { glow: 1, council: 7, archetype: 8, pixel: 1 });
  const glow = r.json.bodies.find((b) => b.kind === 'glow');
  assert.strictEqual(glow.assignable, false); assert.strictEqual(glow.gate.entitled, true);
  assert(r.json.required && r.json.required.name);
});
t('GET /api/agent-forge/skills: the REAL academy catalogue (>= 11, curriculum ids present)', async () => {
  const r = await call('GET', '/api/agent-forge/skills');
  assert.strictEqual(r.status, 200); assert(r.json.skills.length >= 11, 'got ' + r.json.skills.length);
  assert(r.json.skills.every((s) => s.source === 'academy'));
  for (const e of ENTRIES) { const sk = e.skill || e; assert(r.json.skills.some((s) => s.id === sk.id), 'missing ' + sk.id); }
});
t('POST /api/agent-forge: archetype pick + academy skills + workflows persist on agent AND operative', async () => {
  const r = await call('POST', '/api/agent-forge', { name: 'Repair Probe', kits: [kitId], model: 'psionic', academySkills: [ACAD_ID], workflows: ['lib.demo-flow'] }, 'u1');
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.operative.model, 'FORGE-PSIONIC');
  assert.deepStrictEqual(r.json.agent.academySkills, [ACAD_ID]);
  const op = ops.get(r.json.operative.id);
  assert.strictEqual(op.model, 'FORGE-PSIONIC');
  assert.deepStrictEqual(op.academySkills, [ACAD_ID]);
  assert.deepStrictEqual(op.workflows, ['lib.demo-flow']);
  const mine = await call('GET', '/api/agent-forge/mine', null, 'u1');
  const mineAgent = mine.json.agents.find((a) => a.id === r.json.agent.id);
  assert(mineAgent && mineAgent.academySkills.includes(ACAD_ID));
  const del = await call('DELETE', '/api/agent-forge/' + r.json.agent.id, null, 'u1');
  assert.strictEqual(del.status, 200);
});
t('POST /api/agent-forge model=bogus → 400 before forging; nothing is created', async () => {
  const before = forge.listByOwner('u1').length;
  const r = await call('POST', '/api/agent-forge', { name: 'Bad Body Bot', model: 'bogus' }, 'u1');
  assert.strictEqual(r.status, 400); assert(/unknown body/.test(r.json.error));
  assert.strictEqual(forge.listByOwner('u1').length, before);
});
t('POST /api/agent-forge academySkills=[unknown] → 400 explicit validation error', async () => {
  const r = await call('POST', '/api/agent-forge', { name: 'Bad Skill Bot', academySkills: ['not-a-real-skill'] }, 'u1');
  assert.strictEqual(r.status, 400); assert(JSON.stringify(r.json).includes('unknown academy skill'));
});

(async () => {
  server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
  for (const [name, fn] of tests) { try { await fn(); pass++; console.log('  ok ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } }
  server.close();
  for (const f of Object.keys(snap)) {
    const p = path.join(DATA, f);
    if (snap[f] === null) { try { fs.unlinkSync(p); } catch (_) {} } else fs.writeFileSync(p, snap[f]);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`forge-repair: ${pass} passed, ${tests.length - pass} failed`);
})();
