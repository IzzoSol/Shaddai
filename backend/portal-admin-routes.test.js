// portal-admin-routes.test.js — self-contained test for the portal admin router.
// Run:  node backend/portal-admin-routes.test.js
// Uses node built-ins + express (already a project dep). Spins the router on a temp
// express app pointed at a TEMP COPY of the registry (never touches the real file).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// ── set up a temp registry and point the router's __dirname at it ──
// The router resolves portal-registry.json relative to its own __dirname, so we
// copy a seed registry beside a temp copy of the router. The temp dir lives INSIDE
// backend/ so node's module resolution still walks up to backend/node_modules (express).
const tmpDir = fs.mkdtempSync(path.join(__dirname, '.portal-test-'));
const seed = {
  portals: [
    { id: 'seed-a', name: 'Seed A', operator: null, url: null, position: [200, 0, 0], color: '#27e0ff', entry_fee_usdc: 0, type: 'native', tags: ['x'] },
  ],
};
fs.writeFileSync(path.join(tmpDir, 'portal-registry.json'), JSON.stringify(seed, null, 2));
// copy the router source into the temp dir so its __dirname points at the temp registry
const routerSrc = fs.readFileSync(path.join(__dirname, 'portal-admin-routes.js'), 'utf8');
const routerTmpPath = path.join(tmpDir, 'portal-admin-routes.js');
fs.writeFileSync(routerTmpPath, routerSrc);

const ADMIN_TOKEN = 'test-secret-123';
process.env.ADMIN_TOKEN = ADMIN_TOKEN;

const router = require(routerTmpPath);
const app = express();
app.use(router);

// ── tiny promise-based HTTP helper ──
function req(server, method, urlPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    if (token) headers['x-admin-token'] = token;
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise((r) => server.once('listening', r));
  let failed = false;
  const ok = (msg) => console.log('  ok -', msg);
  try {
    // 1) list — seed present
    let res = await req(server, 'GET', '/api/portals');
    assert.strictEqual(res.status, 200, 'GET list status');
    assert.strictEqual(res.body.portals.length, 1, 'seed portal present');
    ok('GET /api/portals lists seed');

    // 2) OPEN TESTING MODE: create WITHOUT token is allowed
    res = await req(server, 'POST', '/api/portals', { body: { name: 'No Auth' } });
    assert.strictEqual(res.status, 201, 'create without token → 201 (open mode)');
    ok('POST without token allowed (open testing mode)');
    // clean up the no-auth portal so later counts stay predictable
    await req(server, 'DELETE', '/api/portals/' + res.body.portal.id);

    // 3) create WITH token
    res = await req(server, 'POST', '/api/portals', { token: ADMIN_TOKEN, body: { name: 'My Portal', url: 'https://example.com', type: 'game', access: 'credits', doc: 'hello' } });
    assert.strictEqual(res.status, 201, 'create status 201');
    assert.ok(res.body.portal && res.body.portal.id, 'created portal has id');
    assert.strictEqual(res.body.portal.type, 'game', 'type applied');
    assert.strictEqual(res.body.portal.access, 'credits', 'access applied');
    assert.strictEqual(res.body.portal.doc, 'hello', 'doc applied');
    assert.ok(Array.isArray(res.body.portal.position) && res.body.portal.position.length === 3, 'auto position assigned');
    const newId = res.body.portal.id;
    ok('POST creates portal with defaults + extended fields');

    // 4) list now has 2, and new fields defaulted on the created one
    res = await req(server, 'GET', '/api/portals');
    assert.strictEqual(res.body.portals.length, 2, 'list has 2 after create');
    ok('GET reflects new portal');

    // 5) update (merge, keep existing fields)
    res = await req(server, 'PUT', '/api/portals/' + newId, { token: ADMIN_TOKEN, body: { color: '#ff0000', tags: ['edited'] } });
    assert.strictEqual(res.status, 200, 'update status 200');
    assert.strictEqual(res.body.portal.color, '#ff0000', 'color updated');
    assert.deepStrictEqual(res.body.portal.tags, ['edited'], 'tags updated');
    assert.strictEqual(res.body.portal.url, 'https://example.com', 'url preserved on merge');
    assert.strictEqual(res.body.portal.id, newId, 'id unchanged');
    ok('PUT merges fields without dropping others');

    // 6) update missing id → 404
    res = await req(server, 'PUT', '/api/portals/does-not-exist', { token: ADMIN_TOKEN, body: { color: '#000' } });
    assert.strictEqual(res.status, 404, 'update missing → 404');
    ok('PUT unknown id → 404');

    // 7) OPEN TESTING MODE: delete without token is allowed
    res = await req(server, 'DELETE', '/api/portals/' + newId);
    assert.strictEqual(res.status, 200, 'delete without token → 200 (open mode)');
    assert.strictEqual(res.body.removed.id, newId, 'removed correct portal');
    ok('DELETE removes portal');

    // 9) list back to 1
    res = await req(server, 'GET', '/api/portals');
    assert.strictEqual(res.body.portals.length, 1, 'list back to 1 after delete');
    ok('GET confirms deletion');

    console.log('\nALL TESTS PASSED');
  } catch (e) {
    failed = true;
    console.error('\nTEST FAILED:', e && e.message);
    console.error(e && e.stack);
  } finally {
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(failed ? 1 : 0);
  }
})();
