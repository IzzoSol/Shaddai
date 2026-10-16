'use strict';
// DEV-ONLY standalone server so the front end can build against the REAL gateway contract before backend wiring.
//   node server/agents/dev-server.js            -> http://127.0.0.1:8788/api/agents/*
// Auth is a fake header (x-test-user: alice). Models are scripted (MockAdapter): any chat runs a search then asks to buy (approval flow).
// Never mount this in production. Real wiring = see docs/HANDOFF-FPS-FRONTEND-BACKEND-20261016.md (Part C).
const express = require('express');
const { createGateway } = require('./index');
const { makeRouter } = require('./routes');

const gateway = createGateway({ priceEntries: { 'mock/fast': { inPerM: 1, outPerM: 2 } }, priceVersion: 'dev-1' });
gateway.registry.define({ name: 'search_catalog', description: 'Search the catalog', permissionClass: 'READ_PUBLIC', cacheable: true,
  input: { type: 'object', properties: { q: { type: 'string', maxLength: 60 } }, required: ['q'], additionalProperties: false },
  handler: async a => ({ items: [{ listingId: 'L1', name: 'Neon lamp (' + a.q + ')', price: 12 }] }) });
gateway.registry.define({ name: 'place_order', description: 'Buy a listing', permissionClass: 'SPEND', approval: 'required',
  input: { type: 'object', properties: { listingId: { type: 'string' }, qty: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['listingId', 'qty'], additionalProperties: false },
  preview: a => 'Buy ' + a.qty + ' x ' + a.listingId + ' (12 sparks each)', handler: async a => ({ orderId: 'ord_' + a.listingId, receipt: 'immutable-dev-receipt' }) });

const AGENTS = {
  nova: { id: 'nova', owner: 'alice', name: 'Nova', role: 'Greeter', grants: ['search_catalog', 'place_order'], provider: 'mock', defaultAlias: 'fast', allowedAliases: ['fast'], byok: false },
  ledger: { id: 'ledger', owner: 'alice', name: 'Ledger', role: 'Merchant', grants: ['search_catalog'], provider: 'mock', defaultAlias: 'fast', allowedAliases: ['fast'], byok: false },
};
// Stateless scripted "model": decides from the conversation so resume/continue works without shared state.
function devAdapter() {
  return {
    providerId: 'mock', format: 'chat', aliases: { fast: 'mock-fast' }, dataUse: { 'mock-fast': 'private-ok' },
    async validateConfig() { return { ok: true }; },
    async *complete(req) {
      await new Promise(r => setTimeout(r, 120));
      const last = req.messages[req.messages.length - 1];
      const toolName = last.role === 'tool' ? (() => { try { return JSON.parse(last.content).tool; } catch (_) { return null; } })() : null;
      const usage = { type: 'usage', inputTokens: 200 + req.messages.length * 40, outputTokens: 30 };
      if (last.role === 'user') { yield { type: 'text_delta', text: 'Let me look. ' }; yield usage;
        yield { type: 'tool_call', id: 'c' + req.messages.length, name: 'search_catalog', args: { q: 'lamp' }, argsValid: true }; yield { type: 'done', reason: 'tool_calls' }; return; }
      if (toolName === 'search_catalog') { yield usage;
        yield { type: 'tool_call', id: 'c' + req.messages.length, name: 'place_order', args: { listingId: 'L1', qty: 1 }, argsValid: true }; yield { type: 'done', reason: 'tool_calls' }; return; }
      yield { type: 'text_delta', text: 'Order placed. Receipt saved.' }; yield usage; yield { type: 'done', reason: 'stop' };
    },
  };
}

const app = express();
app.use('/api/agents', makeRouter({
  gateway, production: false, allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8787'], adminIds: ['root'],
  auth: (req, res, next) => { const u = req.headers['x-test-user']; if (u) req.user = { id: String(u) }; next(); },
  resolveAgent: async (uid, id) => (AGENTS[id] && AGENTS[id].owner === uid ? AGENTS[id] : null),
  listAgents: async uid => Object.values(AGENTS).filter(a => a.owner === uid).map(({ id, name, role, grants, provider }) => ({ id, name, role, grants, provider })),
  adapterFor: () => ({ adapter: devAdapter(), providerCfg: { dataUse: { fast: 'private-ok' } } }),
}));
if (require.main === module) app.listen(8788, '127.0.0.1', () => console.log('agents dev server on http://127.0.0.1:8788  (header x-test-user: alice)'));
module.exports = { app, gateway };
