'use strict';
// Compatibility smoke test: the OFFICIAL MCP SDK client talking to the bridge, the way an outside bot's MCP client would.
// Not part of the default test run (needs @modelcontextprotocol/sdk, which is not a backend dependency).
//   MCP_SDK_DIR=<folder containing node_modules/@modelcontextprotocol/sdk> NODE_PATH=<backend node_modules> node backend/tests/platform-bridge.sdk-smoke.js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createBridge } = require('../platform-bridge');
const sdkDir = process.env.MCP_SDK_DIR;
if (!sdkDir) { console.log('skipped: set MCP_SDK_DIR'); process.exit(0); }
const { Client } = require(path.join(sdkDir, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'));
const { StreamableHTTPClientTransport } = require(path.join(sdkDir, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js'));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-sdk-'));
  const ops = { a1: { id: 'a1', name: 'Bolt', owner: 'alice', skills: [] } };
  const bridge = createBridge({ file: path.join(tmp, 'b.json'), plotsFile: path.join(tmp, 'none.json'), stepMs: 30, spacingMs: 0,
    operatives: { get: (id) => ops[id] || null, listByOwner: (o) => Object.values(ops).filter((x) => x.owner === o) },
    tools: { fetch_price: { description: 'price', execute: async ({ symbol }) => ({ symbol, usd: 1 }) }, get_fear_greed: { description: 'fg', execute: async () => ({ value: 50 }) }, get_trending: { description: 't', execute: async () => [] } }, internal: { agents: async () => [], plots: async () => [], balance: async () => ({ sparks: 7 }), classes: async () => [] },
    academy: { classes: { join: () => ({ ok: true }) } }, uidOf: (req) => req.headers['x-uid'] || '' });
  const app = express(); app.use('/api/bridge', bridge);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/bridge';
  const minted = await (await fetch(base + '/tokens', { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': 'alice' },
    body: JSON.stringify({ label: 'sdk', agent_id: 'a1', scopes: ['workflows:read', 'workflows:run', 'runs:read', 'agents:read', 'tools:run', 'school:join', 'school:read', 'economy:read'] }) })).json();

  // a client with no token cannot connect
  const bad = new Client({ name: 'nobody', version: '1' });
  await assert.rejects(() => bad.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'))), 'no token -> cannot connect');

  const client = new Client({ name: 'grok-like-bot', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + minted.token } } }));
  console.log('connected to', JSON.stringify(client.getServerVersion()));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  for (const need of ['list_workflows', 'start_workflow', 'get_run_status', 'join_class', 'get_balance', 'list_skills']) assert.ok(tools.includes(need), 'tool listed: ' + need);
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args || {} }); assert.ok(!r.isError, name + ' failed'); return r.structuredContent; };
  const wfs = await call('list_workflows'); assert.ok(wfs.items.some((w) => w.workflow_id === 'market.snapshot'));
  const run = await call('start_workflow', { workflow_id: 'market.snapshot', params: { symbols: ['bitcoin'] }, idempotency_key: 'sdk-1' });
  let st; for (let i = 0; i < 40; i++) { st = await call('get_run_status', { run_id: run.run_id }); if (st.status === 'succeeded' || st.status === 'failed') break; await new Promise((r) => setTimeout(r, 50)); }
  assert.strictEqual(st.status, 'succeeded'); assert.ok(st.receipt);
  assert.strictEqual((await call('join_class', { class_id: 'cls_any' })).joined, true);
  assert.strictEqual((await call('get_balance')).sparks, 7);
  await assert.rejects(() => client.callTool({ name: 'cancel_run', arguments: { run_id: run.run_id } }), 'a tool outside the granted scopes is refused');
  await client.close(); server.close();
  console.log('platform-bridge SDK smoke: official MCP client connected, listed tools, ran a workflow, joined a class');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
