'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { createGateway, createMock } = require('..');
const { makeRouter } = require('../routes');
const { validateEndpoint, blockedIp } = require('../ssrf');
const { createWebhookAgent, sign, verifySignature, parseIntents } = require('../providers/webhook-agent');

const PRICES = { 'mock/fast': { inPerM: 1, outPerM: 2 } };
const AGENTS = { a_mine: { id: 'a_mine', owner: 'alice', grants: ['echo'], provider: 'mock', defaultAlias: 'fast', allowedAliases: ['fast'] } };

function boot(extra) {
  const gateway = createGateway({ priceEntries: PRICES });
  gateway.registry.define({ name: 'echo', description: 'echo', permissionClass: 'READ_PUBLIC',
    input: { type: 'object', properties: { t: { type: 'string' } }, required: ['t'], additionalProperties: false }, handler: async a => a.t });
  const mock = createMock([{ toolCalls: [{ id: 'c', name: 'echo', args: { t: 'hi' } }], usage: { inputTokens: 10, outputTokens: 5 } }, { text: 'done', usage: { inputTokens: 20, outputTokens: 5 } }], extra && extra.mock);
  const app = express();
  app.use('/api/agents', makeRouter({
    gateway, production: false, allowedOrigins: ['https://app.example'], adminIds: ['root'],
    auth: (req, res, next) => { const u = req.headers['x-test-user']; if (u) req.user = { id: u }; next(); },
    resolveAgent: async (uid, id) => (AGENTS[id] && AGENTS[id].owner === uid ? AGENTS[id] : null),
    adapterFor: () => ({ adapter: mock, providerCfg: { dataUse: { fast: 'private-ok' } } }),
  }));
  return new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res({ s, gateway, port: s.address().port })); });
}
function req(port, method, path, { user, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-test-user': user } : {}, headers || {}) }, res => {
      let b = ''; res.on('data', d => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

test('production refuses to start without an ALLOWED_ORIGINS allowlist', () => {
  assert.throws(() => makeRouter({ gateway: {}, auth() {}, resolveAgent() {}, adapterFor() {}, production: true, allowedOrigins: [] }), /ALLOWED_ORIGINS/);
});

test('chat: identity from session only; body userId ignored; foreign agent is 404; unauthenticated is 401', async () => {
  const { s, port, gateway } = await boot();
  try {
    assert.strictEqual((await req(port, 'POST', '/api/agents/chat', { body: { agentId: 'a_mine', message: 'x' } })).status, 401);
    assert.strictEqual((await req(port, 'POST', '/api/agents/chat', { user: 'mallory', body: { agentId: 'a_mine', message: 'x', userId: 'alice' } })).status, 404);
    const ok = await req(port, 'POST', '/api/agents/chat', { user: 'alice', body: { agentId: 'a_mine', message: 'hello', userId: 'mallory' } });
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.body.includes('"type":"tool_result"') && ok.body.includes('"type":"done"'));
    assert.ok(gateway.audit.entries().every(e => e.userId === undefined || e.userId === 'alice'));
  } finally { s.close(); }
});

test('CORS: only allowlisted origins are echoed', async () => {
  const { s, port } = await boot();
  try {
    const a = await req(port, 'GET', '/api/agents/usage', { user: 'alice', headers: { origin: 'https://app.example' } });
    const b = await req(port, 'GET', '/api/agents/usage', { user: 'alice', headers: { origin: 'https://evil.example' } });
    assert.strictEqual(a.headers['access-control-allow-origin'], 'https://app.example');
    assert.strictEqual(b.headers['access-control-allow-origin'], undefined);
  } finally { s.close(); }
});

test('kill: owner can pause own agent only; cannot touch others, resume, or global; admin can', async () => {
  const { s, port, gateway } = await boot();
  try {
    assert.strictEqual((await req(port, 'POST', '/api/agents/kill', { user: 'mallory', body: { level: 'agent', id: 'a_mine' } })).status, 404);
    assert.strictEqual((await req(port, 'POST', '/api/agents/kill', { user: 'alice', body: { level: 'global' } })).status, 403);
    assert.strictEqual((await req(port, 'POST', '/api/agents/kill', { user: 'alice', body: { level: 'agent', id: 'a_mine' } })).status, 200);
    assert.strictEqual(gateway.killSwitch.blocked({ agentId: 'a_mine' }), 'kill_agent');
    assert.strictEqual((await req(port, 'POST', '/api/agents/kill', { user: 'alice', body: { level: 'agent', id: 'a_mine', on: false } })).status, 403);
    const chat = await req(port, 'POST', '/api/agents/chat', { user: 'alice', body: { agentId: 'a_mine', message: 'x' } });
    assert.ok(chat.body.includes('kill_agent'));
    assert.strictEqual((await req(port, 'POST', '/api/agents/kill', { user: 'root', body: { level: 'agent', id: 'a_mine', on: false } })).status, 200);
  } finally { s.close(); }
});

test('client disconnect aborts the run and releases the budget hold', async () => {
  const { s, port, gateway } = await boot({ mock: { delayMs: 400 } });
  try {
    await new Promise(resolve => {
      const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/agents/chat', headers: { 'content-type': 'application/json', 'x-test-user': 'alice' } });
      r.on('error', () => {}); r.on('response', res => { res.on('data', () => {}); setTimeout(() => { r.destroy(); resolve(); }, 50); });
      r.write(JSON.stringify({ agentId: 'a_mine', message: 'x' })); r.end();
    });
    await new Promise(r => setTimeout(r, 900));
    assert.strictEqual(gateway.usage.summary('alice').heldUsd, 0);
  } finally { s.close(); }
});

test('SSRF: loopback, private, link-local, metadata, v6, mapped v4, http, creds, bad port all blocked; public passes', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '0.0.0.0', '100.64.0.1']) assert.ok(blockedIp(ip), ip);
  assert.ok(!blockedIp('8.8.8.8'));
  const pub = async () => ['93.184.216.34'];
  assert.ok((await validateEndpoint('https://agent.example/hook', { resolve: pub })).ok);
  assert.strictEqual((await validateEndpoint('http://agent.example/hook', { resolve: pub })).code, 'https_required');
  assert.strictEqual((await validateEndpoint('https://u:p@agent.example/', { resolve: pub })).code, 'credentials_in_url');
  assert.strictEqual((await validateEndpoint('https://agent.example:8443/', { resolve: pub })).code, 'port_not_allowed');
  assert.strictEqual((await validateEndpoint('https://evil.example/', { resolve: async () => ['127.0.0.1'] })).code, 'blocked_address');           // DNS to loopback
  assert.strictEqual((await validateEndpoint('https://evil.example/', { resolve: async () => ['93.184.216.34', '10.0.0.1'] })).code, 'blocked_address'); // mixed answers
  assert.strictEqual((await validateEndpoint('https://169.254.169.254/latest', {})).code, 'blocked_address');
});

test('webhook agent: signed request, replay window, size cap, schema; rebinding re-validated each call', async () => {
  const secret = 'per-agent-secret';
  let sent;
  const fetchImpl = async (url, init) => { sent = init; return { ok: true, status: 200, text: async () => JSON.stringify({ intents: [{ type: 'say', text: 'hi' }] }) }; };
  const ag = createWebhookAgent({ agentId: 'jev1', url: 'https://agent.example/hook', secret, fetchImpl, resolve: async () => ['93.184.216.34'] });
  const out = await ag.decide({ nearby: [] });
  assert.ok(out.ok && out.intents[0].text === 'hi');
  assert.strictEqual(sent.redirect, 'error');
  assert.ok(verifySignature(secret, sent.headers['x-shaddai-timestamp'], sent.body, sent.headers['x-shaddai-signature']));
  assert.ok(!verifySignature(secret, String(Date.now() - 10 * 60 * 1000), sent.body, sign(secret, String(Date.now() - 10 * 60 * 1000), sent.body)));   // stale
  assert.ok(!verifySignature('other', sent.headers['x-shaddai-timestamp'], sent.body, sent.headers['x-shaddai-signature']));
  assert.strictEqual(parseIntents('x'.repeat(70000)).code, 'response_too_large');
  assert.strictEqual(parseIntents('{"intents":[{"type":"spend","amount":99}]}').code, 'bad_intent_type');    // no money intents, ever
  const rebind = createWebhookAgent({ agentId: 'j', url: 'https://agent.example/hook', secret, fetchImpl, resolve: async () => ['127.0.0.1'] });
  assert.strictEqual((await rebind.decide({})).code, 'blocked_address');
});
