'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { createRouter } = require('./routes');

const SIG = { id: 'm:AAA:buy', moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'buy', confidence: 0.7, entry: 100, target: 106, stop: 97, rationale: 'r', ts: 0 };
const engine = {
  signals: async ({ assetClass } = {}) => ({ signals: assetClass && assetClass !== 'stock' ? [] : [SIG], errors: [], regime: { riskOn: null }, ts: 1 }),
  quotes: async () => ({ quotes: [{ symbol: 'AAA', price: 100, assetClass: 'stock' }], errors: [], ts: 1 }),
  correlations: async () => ({ symbols: [], values: [] }),
  signalById: async (id) => (id === SIG.id ? SIG : null),
};
const store = [];
const paper = {
  open: ({ owner, signal, sizeUsd }) => { const trade = { id: 't1', owner, signalId: signal.id, sizeUsd }; store.push(trade); return { ok: true, trade }; },
  close: ({ id }) => (id === 't1' ? { ok: true, trade: { id } } : { ok: false, status: 404, error: 'open trade not found' }),
  portfolio: () => ({ cash: 1, equity: 1, openTrades: [{ id: 't1', symbol: 'AAA', entry: 100 }], closedTrades: [], byModule: {} }),
};

async function withServer(userId, fn) {
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { if (userId) req.userId = userId; next(); });
  app.use('/api/intel', createRouter({ engine, paper }));
  const srv = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api/intel`;
  try { await fn(base); } finally { srv.close(); }
}
const j = (r) => r.json();

test('read endpoints are public', async () => {
  await withServer(null, async (b) => {
    assert.strictEqual((await j(await fetch(b + '/signals'))).signals.length, 1);
    assert.strictEqual((await j(await fetch(b + '/signals?assetClass=crypto'))).signals.length, 0);
    assert.strictEqual((await j(await fetch(b + '/quotes'))).ok, true);
    assert.deepStrictEqual((await j(await fetch(b + '/correlations'))).symbols, []);
    assert.ok((await j(await fetch(b + '/modules'))).modules.length >= 3);
  });
});

test('paper endpoints require login', async () => {
  await withServer(null, async (b) => {
    assert.strictEqual((await fetch(b + '/paper')).status, 401);
    assert.strictEqual((await fetch(b + '/paper/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  });
});

test('paper open uses the SERVER signal (not client prices); unknown signal 404; close errors map to status', async () => {
  await withServer('u1', async (b) => {
    const post = (p, body) => fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await post('/paper/open', { signalId: SIG.id, sizeUsd: 500, entry: 1 });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(store[0].signalId, SIG.id);
    assert.strictEqual((await post('/paper/open', { signalId: 'nope', sizeUsd: 500 })).status, 404);
    assert.strictEqual((await post('/paper/close', { id: 'zzz' })).status, 404);
    assert.strictEqual((await post('/paper/close', { id: 't1' })).status, 200);
    assert.strictEqual((await fetch(b + '/paper')).status, 200);
  });
});
