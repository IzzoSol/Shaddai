'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app, gateway } = require('../dev-server');

function call(port, method, path, user, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', 'x-test-user': user } }, res => {
      let b = ''; res.on('data', d => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const events = b => b.split('\n\n').filter(Boolean).map(x => JSON.parse(x.replace(/^data: /, '')));

test('HTTP: chat suspends on approval, only the owner can approve, resume continues once, replay is refused, roster works', async () => {
  const s = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); }); const port = s.address().port;
  try {
    const roster = JSON.parse((await call(port, 'GET', '/api/agents/roster', 'alice')).body);
    assert.deepStrictEqual(roster.agents.map(a => a.id).sort(), ['ledger', 'nova']);
    assert.deepStrictEqual(JSON.parse((await call(port, 'GET', '/api/agents/roster', 'mallory')).body).agents, []);

    const chat = events((await call(port, 'POST', '/api/agents/chat', 'alice', { agentId: 'nova', message: 'buy me a lamp' })).body);
    const need = chat.find(e => e.type === 'approval_required');
    assert.ok(need && need.preview.includes('L1'));
    assert.strictEqual(need.resumeState, undefined);                        // run state never reaches the browser
    assert.strictEqual((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/resume', 'alice')).status, 409);   // not approved yet
    assert.strictEqual((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/decision', 'mallory', { decision: 'approve' })).status, 404);
    assert.strictEqual((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/decision', 'alice', { decision: 'approve' })).status, 200);
    assert.strictEqual((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/resume', 'mallory')).status, 404);
    const resumed = events((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/resume', 'alice')).body);
    assert.ok(resumed.some(e => e.type === 'tool_result' && e.tool === 'place_order' && e.status === 'ok'));
    assert.strictEqual(resumed[resumed.length - 1].type, 'done');
    assert.strictEqual((await call(port, 'POST', '/api/agents/approvals/' + need.approvalId + '/resume', 'alice')).status, 404);   // single use
    const u = JSON.parse((await call(port, 'GET', '/api/agents/usage', 'alice')).body);
    assert.ok(u.userUsd > 0 && u.heldUsd === 0);
    assert.ok(gateway.audit.verify());
  } finally { s.close(); }
});
