// node tools/tests/agent-body-frames.test.cjs — POST /agent/claim stores a humanoid/wheeled frame + body (validated), and the frame can be switched.
// Runs the real router against a TEMP data dir with a stubbed Operative store (no real data touched).
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-bodies-'));
process.env.SHADDAI_MMO_DATA = TMP;
const OPS = { op1: { id: 'op1', owner: 'u1', codename: 'GROK-ONE', kind: 'imported', provider: 'grok' }, op2: { id: 'op2', owner: 'u1', codename: 'GROK-TWO' }, op3: { id: 'op3', owner: 'u2', codename: 'NOT-MINE' } };
require.cache[require.resolve(path.join(ROOT, 'backend', 'lib', 'operatives.js'))] = { id: 's', filename: 's', loaded: true, exports: { get: id => OPS[id] || null, listByOwner: u => Object.values(OPS).filter(o => o.owner === u) } };
const express = require(path.join(ROOT, 'node_modules', 'express'));
const app = express(); app.use(express.json()); app.use((req, _r, next) => { req.userId = req.headers['x-test-user'] || ''; next(); }); app.use('/agent', require(path.join(ROOT, 'server', 'agentBodies.js')));
const srv = app.listen(0, async () => {
  const port = srv.address().port; let pass = 0, fail = 0;
  const call = (method, p, body, user) => new Promise(res => { const d = body ? JSON.stringify(body) : ''; const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), 'x-test-user': user || 'u1' } }, s => { let t = ''; s.on('data', c => t += c); s.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { } res({ status: s.statusCode, j }); }); }); r.end(d); });
  const ok = (n, c) => { console.log((c ? '  ok  ' : '  FAIL ') + n); c ? pass++ : fail++; };
  try {
    const a = await call('POST', '/agent/claim', { operativeId: 'op1', frame: 'wheeled', bodyKind: 'analyst' });
    ok('claim with a wheel frame stores it', a.status === 200 && a.j.grant.frame === 'wheeled' && a.j.grant.bodyKind === 'analyst');
    const b = await call('POST', '/agent/claim', { operativeId: 'op2', frame: 'flying-saucer', bodyKind: '<script>' });
    ok('unknown frame/body fall back to a valid humanoid, never stored raw', b.status === 200 && b.j.grant.frame === 'humanoid' && b.j.grant.bodyKind === 'scrap');
    const c = await call('POST', '/agent/bodies/' + a.j.grant.grantId + '/frame', { frame: 'humanoid', bodyKind: 'warden' });
    ok('owner can switch a body from wheels to humanoid', c.status === 200 && c.j.grant.frame === 'humanoid' && c.j.grant.bodyKind === 'warden');
    const d = await call('POST', '/agent/bodies/' + a.j.grant.grantId + '/frame', { frame: 'wheeled' }, 'u2');
    ok('another player cannot switch it (403)', d.status === 403);
    const e = await call('POST', '/agent/bodies/' + a.j.grant.grantId + '/frame', { frame: 'wheeled', bodyKind: 'scrap' });
    ok('mismatched body for a frame is corrected (humanoid body on wheels -> first wheel body)', e.status === 200 && e.j.grant.frame === 'wheeled' && e.j.grant.bodyKind === 'unicycle');
    const f = await call('POST', '/agent/claim', { operativeId: 'op3' });
    ok('cannot claim someone else\'s operative (403)', f.status === 403);
  } finally { srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); console.log(pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0; }
});
