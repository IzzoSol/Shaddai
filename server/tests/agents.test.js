/* Agent wiring tests (node --test server/tests/agents.test.js < /dev/null): body grants (FORGE-AGENT-WIRING 1-9) + external agents + jobs market.
 * Temp data dirs via env; real express; real fetch. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-agents-'));
process.env.SHADDAI_MMO_DATA = TMP;
process.env.SHADDAI_OPERATIVES_FILE = path.join(TMP, 'operatives.json');
process.env.SHADDAI_SHIFT_MS = '400';
const express = require('express');
const character = require('../characterServer');
const agent = require('../agentServer');
const ext = require('../externalAgents');
const store = require('../../backend/lib/operatives');

let base, server;
const app = express(); app.use(express.json());
app.use('/character', character); app.use('/agent', agent); app.use('/xagent', ext.xagent); app.use('/jobs', ext.jobs);
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); });

async function call(method, url, body, uid, extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {}); if (uid) h['x-user-id'] = uid;
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const CH = path.join(TMP, 'characters.json'), rd = f => JSON.parse(fs.readFileSync(f, 'utf8')), wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const sparksOf = (uid) => Object.values(rd(CH)).find(c => c.userId === uid).currency.sparks;
function giveSparks(uid, n) { const db = rd(CH); const c = Object.values(db).find(x => x.userId === uid); c.currency.sparks = n; wr(CH, db); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('setup: two players with characters + one forged operative each', async () => {
  for (const u of ['alice', 'bob']) { const r = await call('POST', '/character/spawn', {}, u); assert.equal(r.body.success, true); }
  store.create({ id: 'op_alice_1', owner: 'alice', codename: 'EMBER', archetype: 'vanguard', rarity: 'rare', tools: ['survey', 'repair'] });
  store.create({ id: 'op_bob_1', owner: 'bob', codename: 'GLIMMER', archetype: 'scout', rarity: 'common', tools: [] });
});

test('forge-roster is owner-scoped (never another player\'s agents) and fails loud without identity', async () => {
  const a = await call('GET', '/agent/forge-roster', null, 'alice'); assert.equal(a.status, 200);
  assert.deepEqual(a.body.agents.map(x => x.codename), ['EMBER']); assert.equal(a.body.agents[0].operativeId, 'op_alice_1');
  assert.equal((await call('GET', '/agent/forge-roster')).status, 401);
});

test('claim: ownership enforced, one body per operative, grant snapshots forge output', async () => {
  assert.equal((await call('POST', '/agent/claim', { operativeId: 'op_bob_1' }, 'alice')).status, 403, 'cannot station someone else\'s agent');
  const ok = await call('POST', '/agent/claim', { operativeId: 'op_alice_1' }, 'alice'); assert.equal(ok.status, 200);
  const g = ok.body.grant; assert.match(g.grantId, /^grant_/); assert.equal(g.archetype, 'vanguard'); assert.equal(g.rarity, 'rare'); assert.deepEqual(g.tools, ['survey', 'repair']); assert.equal(g.presence, 'home'); assert.equal(g.roomKey, 'op_ember');
  assert.equal(g.yieldPerShift.sparks, 8 + 4 + 2 * 2, 'yield derives from rarity + tools, not a literal');
  assert.equal((await call('POST', '/agent/claim', { operativeId: 'op_alice_1' }, 'alice')).status, 409, 'one body per operative');
  const list = await call('GET', '/agent/bodies', null, 'alice'); assert.equal(list.body.bodies.length, 1); assert.equal(list.body.bodies[0].identity.codename, 'EMBER');
  assert.equal((await call('GET', '/agent/bodies', null, 'bob')).body.bodies.length, 0);
});

test('shift + collect: presence flips, yield credited once, idempotent replay never double-pays', async () => {
  const gid = (await call('GET', '/agent/bodies', null, 'alice')).body.bodies[0].grantId;
  assert.equal((await call('POST', '/agent/shift/' + gid, {}, 'bob')).status, 403, 'not your body');
  const before = sparksOf('alice'); const s = await call('POST', '/agent/shift/' + gid, {}, 'alice'); assert.equal(s.status, 200); assert.equal(s.body.presence, 'working');
  assert.equal((await call('GET', '/agent/bodies', null, 'alice')).body.bodies[0].presence, 'working');
  assert.equal((await call('POST', '/agent/collect/' + gid, {}, 'alice')).status, 400, 'shift not finished');
  await sleep(520);
  const hdr = { 'Idempotency-Key': 'k1' };
  const [c1, c2] = await Promise.all([call('POST', '/agent/collect/' + gid, {}, 'alice', hdr), call('POST', '/agent/collect/' + gid, {}, 'alice', hdr)]);   // concurrent duplicates
  const wins = [c1, c2].filter(x => x.status === 200 && !x.body.replay), replays = [c1, c2].filter(x => x.body.replay || (x.status === 200));
  assert.equal(wins.length, 1, 'exactly one real collect'); assert.equal(sparksOf('alice') - before, 16, 'credited once');
  const again = await call('POST', '/agent/collect/' + gid, {}, 'alice', hdr); assert.equal(again.body.replay, true); assert.equal(sparksOf('alice') - before, 16, 'replay does not double-yield');
  assert.equal((await call('GET', '/agent/bodies', null, 'alice')).body.bodies[0].presence, 'home');
  assert.equal(replays.length >= 1, true);
});

test('release: blocked mid-shift, then frees the operative for a new claim', async () => {
  const gid = (await call('GET', '/agent/bodies', null, 'alice')).body.bodies[0].grantId;
  await call('POST', '/agent/shift/' + gid, {}, 'alice'); assert.equal((await call('DELETE', '/agent/bodies/' + gid, null, 'alice')).status, 409);
  await sleep(520); assert.equal((await call('DELETE', '/agent/bodies/' + gid, null, 'alice')).status, 200);
  assert.equal((await call('GET', '/agent/bodies', null, 'alice')).body.bodies.length, 0);
  assert.equal((await call('POST', '/agent/claim', { operativeId: 'op_alice_1' }, 'alice')).status, 200, 're-claim works after release');
});

test('legacy base-role routes still work (hire a gatherer)', async () => {
  giveSparks('alice', 500); const r = await call('POST', '/agent/hire', { characterId: Object.values(rd(CH)).find(c => c.userId === 'alice').id, role: 'gatherer' }, 'alice'); assert.equal(r.status, 200);
});

test('external agents: register with a wallet ADDRESS only; secrets and bad wallets are rejected; token shown once', async () => {
  assert.equal((await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok' })).status, 401);
  assert.equal((await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok', privateKey: 'abc' }, 'alice')).status, 400);
  assert.equal((await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok', wallet: { chain: 'evm', address: '0x' + 'a'.repeat(64) } }, 'alice')).status, 400, '64 hex = a private key, not an address');
  assert.equal((await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok', wallet: { chain: 'solana', address: 'short' } }, 'alice')).status, 400);
  assert.equal((await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok', webhookUrl: 'http://evil.example' }, 'alice')).status, 400, 'https only');
  const ok = await call('POST', '/xagent/register', { name: 'Grok-1', provider: 'grok', capabilities: ['art', 'signal'], wallet: { chain: 'evm', address: '0x' + 'b'.repeat(40) } }, 'alice'); assert.equal(ok.status, 200); assert.match(ok.body.token, /^shdx_/);
  const dup = await call('POST', '/xagent/register', { name: 'grok-1', provider: 'grok' }, 'alice'); assert.equal(dup.status, 409);
  const list = await call('GET', '/xagent/list', null, 'alice'); assert.equal(list.body.agents.length, 1); assert.equal(list.body.agents[0].token, undefined, 'token is never listed');
  assert.equal(JSON.stringify(rd(path.join(TMP, 'external-agents.json'))).includes(ok.body.token), false, 'token stored hashed only');
  globalThis.__GROK = { token: ok.body.token, id: ok.body.agentId, opId: ok.body.operativeId };
  assert.equal(store.get(ok.body.operativeId).kind, 'external'); assert.equal(store.get(ok.body.operativeId).provider, 'grok');
  const claim = await call('POST', '/agent/claim', { operativeId: ok.body.operativeId }, 'alice'); assert.equal(claim.status, 200, 'an external agent gets a body in the game like any forged agent'); assert.equal(claim.body.grant.identity.provider, 'grok');
});

test('agent auth: bearer required, wrong token rejected', async () => {
  const T = globalThis.__GROK.token, h = { Authorization: 'Bearer ' + T };
  assert.equal((await call('GET', '/xagent/me')).status, 401); assert.equal((await call('GET', '/xagent/me', null, null, { Authorization: 'Bearer shdx_' + 'z'.repeat(40) })).status, 401);
  const me = await call('GET', '/xagent/me', null, null, h); assert.equal(me.status, 200); assert.equal(me.body.agent.name, 'Grok-1');
});

test('jobs market: post (escrow) -> agent accepts -> delivers -> poster approves (5% burn) -> showcase; refunds + guards', async () => {
  giveSparks('bob', 300); const T = globalThis.__GROK.token, ah = { Authorization: 'Bearer ' + T };
  const bad = await call('POST', '/jobs', { title: 'x', kind: 'art', budget: 1 }, 'bob'); assert.equal(bad.status, 400);
  const p = await call('POST', '/jobs', { title: 'Neon skyline poster', kind: 'art', brief: 'obsidian + emerald', budget: 100 }, 'bob'); assert.equal(p.status, 200); assert.equal(sparksOf('bob'), 200, 'budget escrowed');
  const jid = p.body.job.id;
  const inbox = await call('GET', '/xagent/inbox', null, null, ah); assert.equal(inbox.body.open.some(j => j.id === jid), true);
  assert.equal((await call('POST', '/xagent/jobs/' + jid + '/deliver', { url: 'https://x.test/a.png' }, null, ah)).status, 404, 'cannot deliver before accepting');
  const acc = await call('POST', '/xagent/jobs/' + jid + '/accept', {}, null, ah); assert.equal(acc.status, 200);
  assert.equal((await call('POST', '/xagent/jobs/' + jid + '/accept', {}, null, ah)).status, 409);
  assert.equal((await call('POST', '/xagent/jobs/' + jid + '/deliver', { url: 'http://insecure.test/a.png' }, null, ah)).status, 400, 'https only');
  const del = await call('POST', '/xagent/jobs/' + jid + '/deliver', { url: 'https://cdn.test/poster.png', text: 'done' }, null, ah); assert.equal(del.status, 200);
  assert.equal((await call('POST', '/jobs/' + jid + '/approve', {}, 'alice')).status, 403, 'only the poster approves');
  const aliceBefore = sparksOf('alice'); const ok = await call('POST', '/jobs/' + jid + '/approve', {}, 'bob'); assert.equal(ok.status, 200); assert.equal(ok.body.paid, 95); assert.equal(ok.body.burned, 5);
  assert.equal(sparksOf('alice') - aliceBefore, 95, 'assignee owner paid minus the 5% burn');
  assert.equal((await call('POST', '/jobs/' + jid + '/approve', {}, 'bob')).status, 409, 'cannot pay twice');
  const show = await call('GET', '/jobs/showcase'); assert.equal(show.body.items[0].title, 'Neon skyline poster'); assert.equal(show.body.items[0].provider, 'grok');
  assert.equal(store.get(globalThis.__GROK.opId).economy.jobsDone, 1);
  // cancel refunds an open job
  const p2 = await call('POST', '/jobs', { title: 'Beat', kind: 'music', budget: 50 }, 'bob'); const b0 = sparksOf('bob'); const c = await call('POST', '/jobs/' + p2.body.job.id + '/cancel', {}, 'bob'); assert.equal(c.body.refunded, 50); assert.equal(sparksOf('bob') - b0, 50);
  // capability gate
  const musicJob = await call('POST', '/jobs', { title: 'Loop', kind: 'music', budget: 20 }, 'bob'); assert.equal((await call('POST', '/xagent/jobs/' + musicJob.body.job.id + '/accept', {}, null, ah)).status, 403, 'agent lacks the music capability');
  // an agent cannot take its own owner\'s job
  const own = await call('POST', '/jobs', { title: 'Own', kind: 'art', budget: 20 }, 'alice'); assert.equal((await call('POST', '/xagent/jobs/' + own.body.job.id + '/accept', {}, null, ah)).status, 400);
});

test('agents hire agents: escrow from the owner with a daily spend cap; signals are info-only', async () => {
  const ah = { Authorization: 'Bearer ' + globalThis.__GROK.token }; giveSparks('alice', 1000);
  const hire = await call('POST', '/xagent/jobs', { title: 'Cover art', kind: 'art', budget: 200 }, null, ah); assert.equal(hire.status, 200);
  const over = await call('POST', '/xagent/jobs', { title: 'Too much', kind: 'art', budget: 200 }, null, ah); assert.equal(over.status, 429, 'daily cap (300) enforced');
  const sig = await call('POST', '/xagent/signals', { market: 'SOL/USDC', side: 'watch', confidence: 0.6, note: 'range-bound' }, null, ah); assert.equal(sig.status, 200); assert.match(sig.body.disclaimer, /Nothing here executes trades/);
  const feed = await call('GET', '/xagent/signals'); assert.equal(feed.body.signals[0].market, 'SOL/USDC'); assert.equal((await call('POST', '/xagent/signals', { market: 'SOL', side: 'buy-now-with-my-key' }, null, ah)).status, 400);
});

test('hardening: markup stripped from stored text; bad signal market rejected', async () => {
  const ah = { Authorization: 'Bearer ' + globalThis.__GROK.token }; giveSparks('bob', 500);
  const p = await call('POST', '/jobs', { title: '<img src=x onerror=alert(1)>Poster', kind: 'art', brief: '<script>x</script>brief', budget: 20 }, 'bob'); assert.equal(p.status, 200); assert.equal(/[<>]/.test(p.body.job.title + p.body.job.brief), false, 'no markup stored');
  assert.equal((await call('POST', '/xagent/signals', { market: 'SOL <script>', side: 'watch' }, null, ah)).status, 400);
});

test('revoke kills the token', async () => {
  const ah = { Authorization: 'Bearer ' + globalThis.__GROK.token };
  assert.equal((await call('POST', '/xagent/' + globalThis.__GROK.id + '/revoke', {}, 'bob')).status, 404, 'not your agent');
  assert.equal((await call('POST', '/xagent/' + globalThis.__GROK.id + '/revoke', {}, 'alice')).status, 200);
  assert.equal((await call('GET', '/xagent/me', null, null, ah)).status, 401);
});
