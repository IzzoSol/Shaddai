// node backend/navi-routes.test.js — Navi backend: tiered signals, auth-required writes, validation, idempotent signup/enroll.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs'), http = require('http'), express = require('express');
const { JsonStore } = require('./lib/json-store'); const { makeRouter } = require('./navi-routes');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-')), T0 = 1_800_000_000_000;
const calls = () => [{ symbol: 'NEW', chain: 'solana', ts: T0 - 5 * 60000, peakMult: 3 }, { symbol: 'OLD1', chain: 'solana', ts: T0 - 90 * 60000, peakMult: 9 }, { symbol: 'OLD2', chain: 'base', ts: T0 - 120 * 60000 }];
const app = express(); app.use((req, _r, next) => { req.userId = req.headers['x-test-user'] || undefined; next(); });
app.use('/api/navi', makeRouter({ store: new JsonStore(path.join(dir, 'n.json'), { users: {} }), calls, tierOf: (u) => (u === 'pro1' ? 'pro' : 'free'), now: () => T0 }));
const srv = app.listen(0); const port = srv.address().port;
function req(method, url, body, user) { return new Promise((ok, no) => { const d = body ? JSON.stringify(body) : null; const r = http.request({ port, path: url, method, headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-test-user': user } : {}) }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => ok({ status: res.statusCode, j: JSON.parse(s || '{}') })); }); r.on('error', no); if (d) r.write(d); r.end(); }); }
(async () => { let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('  ok ', n); };
  await t('free: delayed preview only (>= 60 min old, no peak/entry data)', async () => { const r = await req('GET', '/api/navi/signals'); assert.strictEqual(r.j.live, false); assert.deepStrictEqual(r.j.calls.map((c) => c.symbol), ['OLD1', 'OLD2']); assert.ok(r.j.calls.every((c) => c.peakMult === undefined && c.ageMin >= 60)); });
  await t('paid tier: live feed with peak multiple', async () => { const r = await req('GET', '/api/navi/signals', null, 'pro1'); assert.strictEqual(r.j.live, true); assert.strictEqual(r.j.calls[0].symbol, 'NEW'); assert.strictEqual(r.j.calls[0].peakMult, 3); });
  await t('writes need a signed-in user (401)', async () => { assert.strictEqual((await req('POST', '/api/navi/name', { name: 'Neo' })).status, 401); assert.strictEqual((await req('GET', '/api/navi/state')).status, 401); });
  await t('name validated and stored', async () => { assert.strictEqual((await req('POST', '/api/navi/name', { name: '<script>' }, 'u1')).status, 400); assert.strictEqual((await req('POST', '/api/navi/name', { name: 'Neo Rider' }, 'u1')).j.name, 'Neo Rider'); });
  await t('signup + enroll are idempotent and per user', async () => { await req('POST', '/api/navi/signup', { eventId: 'colo-1' }, 'u1'); const again = await req('POST', '/api/navi/signup', { eventId: 'colo-1' }, 'u1'); assert.strictEqual(again.j.already, true);
    await req('POST', '/api/navi/enroll', { classId: 'class-01', botId: 'bot-a' }, 'u1'); const s = (await req('GET', '/api/navi/state', null, 'u1')).j; assert.strictEqual(s.schedule.length, 1); assert.strictEqual(s.enrolled[0].classId, 'class-01');
    assert.strictEqual((await req('GET', '/api/navi/state', null, 'u2')).j.schedule.length, 0); });
  await t('bad ids rejected', async () => { assert.strictEqual((await req('POST', '/api/navi/signup', { eventId: '../../etc' }, 'u1')).status, 400); assert.strictEqual((await req('POST', '/api/navi/enroll', { classId: 'a b' }, 'u1')).status, 400); });
  console.log(pass + ' passed, 0 failed'); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); srv.close(); process.exit(1); });
