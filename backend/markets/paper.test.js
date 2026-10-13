'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPaper } = require('./paper');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paper-')), 'p.json');
const sig = (side = 'buy', over = {}) => ({ id: `m:AAA:${side}`, moduleId: 'm', symbol: 'AAA', side, entry: 100, ...over });

test('long trade: open, close at profit, per-module P&L', () => {
  const p = createPaper({ file: tmp() });
  const o = p.open({ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 });
  assert.ok(o.ok);
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: { AAA: 110 } }).equity, 100100);
  const c = p.close({ owner: 'u1', id: o.trade.id, price: 110 });
  assert.ok(c.ok);
  const pf = p.portfolio({ owner: 'u1', prices: {} });
  assert.strictEqual(pf.cash, 100100);
  assert.strictEqual(pf.byModule.m.pnl, 100);
  assert.strictEqual(pf.byModule.m.wins, 1);
});

test('short trade profits when price falls', () => {
  const p = createPaper({ file: tmp() });
  const o = p.open({ owner: 'u1', signal: sig('sell'), sizeUsd: 1000 });
  p.close({ owner: 'u1', id: o.trade.id, price: 90 });
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: {} }).byModule.m.pnl, 100);
});

test('rejects duplicates, bad sizes, too many open, unknown/foreign close; ledger unchanged', () => {
  const p = createPaper({ file: tmp(), maxOpen: 1 });
  const o = p.open({ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 });
  for (const [args, status] of [
    [{ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 }, 409],
    [{ owner: 'u1', signal: sig('buy', { id: 'x' }), sizeUsd: 1000 }, 429],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: -5 }, 400],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: 999999 }, 400],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: NaN }, 400],
    [{ owner: 'u2', signal: sig('buy', { entry: 0 }), sizeUsd: 100 }, 400],
  ]) { const r = p.open(args); assert.strictEqual(r.ok, false); assert.strictEqual(r.status, status); }
  assert.strictEqual(p.close({ owner: 'u1', id: 'nope', price: 1 }).status, 404);
  assert.strictEqual(p.close({ owner: 'u2', id: o.trade.id, price: 1 }).status, 404);
  assert.strictEqual(p.close({ owner: 'u1', id: o.trade.id, price: -1 }).status, 400);
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: {} }).openTrades.length, 1);
});

test('cannot open more than available cash; ledger persists across instances', () => {
  const file = tmp();
  const p = createPaper({ file, startBalance: 1500, maxSize: 1000 });
  assert.ok(p.open({ owner: 'u', signal: sig('buy', { id: 'a' }), sizeUsd: 1000 }).ok);
  assert.strictEqual(p.open({ owner: 'u', signal: sig('buy', { id: 'b' }), sizeUsd: 1000 }).status, 400);
  assert.strictEqual(createPaper({ file }).portfolio({ owner: 'u', prices: {} }).openTrades.length, 1);
});

test('corrupt ledger file starts fresh instead of crashing', () => {
  const file = tmp(); fs.writeFileSync(file, '{not json');
  assert.strictEqual(createPaper({ file }).portfolio({ owner: 'u', prices: {} }).cash, 100000);
});

test('owner ids that collide with Object.prototype keys get their own clean account', () => {
  const p = createPaper({ file: tmp() });
  for (const owner of ['__proto__', 'constructor', 'toString']) {
    const o = p.open({ owner, signal: sig('buy', { id: owner }), sizeUsd: 100 });
    assert.ok(o.ok, owner);
    assert.strictEqual(p.portfolio({ owner, prices: {} }).openTrades.length, 1);
  }
  assert.strictEqual(({}).cash, undefined);
});
