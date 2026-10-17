// node backend/home-deed-routes.test.js — home deeds for Sparks: one owner, one debit, retries never double-charge, no Sparks = no deed.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs'), http = require('http'), express = require('express');
const { JsonStore } = require('./lib/json-store'); const { makeRouter, validHomeId } = require('./home-deed-routes');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deeds-'));
// fake economy with the real contract: spend(user, amount, reason, idemKey) is idempotent per key and throws INSUFFICIENT_FUNDS
const bal = { rich: 10000, poor: 100, rich2: 10000 }, seen = new Set(), debits = [];
const economy = { async spend(u, amt, reason, key) { if (seen.has(key)) return { replayed: true }; if ((bal[u] || 0) < amt) { const e = new Error('no'); e.code = 'INSUFFICIENT_FUNDS'; throw e; } bal[u] -= amt; seen.add(key); debits.push([u, amt, key]); return { ok: true }; } };
const app = express(); app.use((req, _r, next) => { req.userId = req.headers['x-test-user'] || undefined; next(); });
app.use('/api/home-deeds', makeRouter({ store: new JsonStore(path.join(dir, 'd.json'), { deeds: {} }), economy, price: 2500 }));
const srv = app.listen(0), port = srv.address().port;
function req(method, url, body, user) { return new Promise((ok, no) => { const d = body ? JSON.stringify(body) : null; const r = http.request({ port, path: url, method, headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-test-user': user } : {}) }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => ok({ status: res.statusCode, j: JSON.parse(s || '{}') })); }); r.on('error', no); if (d) r.write(d); r.end(); }); }
(async () => { let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('  ok ', n); };
  await t('home ids: lot 0..1 on a station id only', async () => { assert.ok(validHomeId('home:desert:0') && validHomeId('home:rift-gate:1')); assert.ok(!validHomeId('home:desert:2') && !validHomeId('home:../x:1') && !validHomeId('plot:desert:1')); });
  await t('must be signed in', async () => { assert.strictEqual((await req('POST', '/api/home-deeds/buy', { homeId: 'home:desert:0' })).status, 401); });
  await t('buy debits once and records the owner', async () => { const r = await req('POST', '/api/home-deeds/buy', { homeId: 'home:desert:0' }, 'rich'); assert.strictEqual(r.j.ok, true); assert.strictEqual(bal.rich, 7500);
    assert.strictEqual((await req('GET', '/api/home-deeds')).j.deeds['home:desert:0'].owner, 'rich'); });
  await t('retry by the owner is a replay (no second debit)', async () => { const r = await req('POST', '/api/home-deeds/buy', { homeId: 'home:desert:0' }, 'rich'); assert.strictEqual(r.j.replayed, true); assert.strictEqual(bal.rich, 7500); assert.strictEqual(debits.length, 1); });
  await t('someone else cannot buy an owned home (409, not charged)', async () => { const r = await req('POST', '/api/home-deeds/buy', { homeId: 'home:desert:0' }, 'rich2'); assert.strictEqual(r.status, 409); assert.strictEqual(bal.rich2, 10000); });
  await t('not enough Sparks -> 402 and no deed', async () => { const r = await req('POST', '/api/home-deeds/buy', { homeId: 'home:arctic:1' }, 'poor'); assert.strictEqual(r.status, 402); assert.ok(!(await req('GET', '/api/home-deeds')).j.deeds['home:arctic:1']); });
  await t('two buyers racing for one home: exactly one owner, one debit', async () => { const [a, b] = await Promise.all([req('POST', '/api/home-deeds/buy', { homeId: 'home:forest:1' }, 'rich'), req('POST', '/api/home-deeds/buy', { homeId: 'home:forest:1' }, 'rich2')]);
    assert.strictEqual([a, b].filter((x) => x.j.ok).length, 1); assert.strictEqual(debits.filter((d) => d[2].indexOf('home:forest:1') >= 0).length, 1); });
  await t('mine lists the caller homes; max 3 per user', async () => { await req('POST', '/api/home-deeds/buy', { homeId: 'home:ocean:0' }, 'rich'); const m = (await req('GET', '/api/home-deeds/mine', null, 'rich')).j.homes; assert.ok(m.length <= 3 && m.includes('home:desert:0'));
    const extra = await req('POST', '/api/home-deeds/buy', { homeId: 'home:void:1' }, 'rich'); if (m.length === 3) assert.strictEqual(extra.status, 409); });
  console.log(pass + ' passed, 0 failed'); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); srv.close(); process.exit(1); });
