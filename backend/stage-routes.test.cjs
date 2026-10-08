'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const express = require('express');
const { createRouter } = require('./stage-routes');
const { createEngagementStore } = require('./lib/engagement-store');

const ents = { pat: { tier: 'pro', active: true }, fred: { tier: 'free', active: true }, cy: { tier: 'free', active: true } };
function boot() {
  const store = createEngagementStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-')), 'e.json'));
  const app = express();
  // stand-in for softAuth: x-user-id => verified user; none => anonymous
  app.use((req, _r, next) => { const u = req.headers['x-user-id']; req.userId = u || 'local'; req.isAuthenticated = !!u; next(); });
  app.use('/api/stage', createRouter({
    store, getEntitlement: (u) => ents[u],
    requireAdmin: (req, res, next) => req.headers['x-admin'] === 'yes' ? next() : res.status(403).json({ ok: false }),
  }));
  return new Promise((r) => { const s = app.listen(0, () => r({ s, store, base: 'http://127.0.0.1:' + s.address().port })); });
}
const call = (base, p, o = {}) => fetch(base + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('stage routes: scoping, gates, admin-only writes', async () => {
  const { s, base } = await boot();
  try {
    assert.equal((await call(base, '/api/stage/me')).body.stage, 'guest');
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'pat' } })).body.stage, 'user');
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'fred' } })).body.stage, 'free');

    // non-admin cannot create or list
    assert.equal((await call(base, '/api/stage/engagements', { method: 'POST', body: JSON.stringify({ clientUserId: 'fred' }), headers: { 'x-user-id': 'fred' } })).status, 403);
    assert.equal((await call(base, '/api/stage/engagements', { headers: { 'x-user-id': 'fred' } })).status, 403);

    // admin starts an engagement for fred -> fred is client, cy and pat are not
    const c = await call(base, '/api/stage/engagements', { method: 'POST', body: JSON.stringify({ clientUserId: 'fred', title: 'Audit' }), headers: { 'x-admin': 'yes', 'x-user-id': 'consultant1' } });
    assert.equal(c.status, 201);
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'fred' } })).body.stage, 'client');
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'cy' } })).body.stage, 'free');
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'pat' } })).body.stage, 'user');

    // spoof attempts: ?userId / body cannot change who "me" is
    const spoof = await call(base, '/api/stage/me?userId=fred', { headers: { 'x-user-id': 'cy' } });
    assert.equal(spoof.body.stage, 'free');
    assert.equal(spoof.body.engagementId, null);

    // ending the engagement removes client stage
    const eid = c.body.engagement.id;
    assert.equal((await call(base, '/api/stage/engagements/' + eid, { method: 'PATCH', body: JSON.stringify({ status: 'ended' }), headers: { 'x-admin': 'yes' } })).status, 200);
    assert.equal((await call(base, '/api/stage/me', { headers: { 'x-user-id': 'fred' } })).body.stage, 'free');
    assert.equal((await call(base, '/api/stage/engagements/nope', { method: 'PATCH', body: '{}', headers: { 'x-admin': 'yes' } })).status, 404);
    assert.equal((await call(base, '/api/stage/engagements', { method: 'POST', body: '{}', headers: { 'x-admin': 'yes' } })).status, 400);
  } finally { s.close(); }
});
