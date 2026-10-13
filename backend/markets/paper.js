'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fail = (status, error) => ({ ok: false, status, error });

function createPaper({ file, now = Date.now, startBalance = 100000, maxSize = 10000, maxOpen = 10 }) {
  let db = Object.create(null); // null prototype: owner ids like '__proto__' or 'constructor' are plain keys
  try { Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8')) || {}); } catch (_) { db = Object.create(null); }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }
  const acct = (owner) => (db[owner] = db[owner] || { cash: startBalance, trades: [] });

  function open({ owner, signal, sizeUsd }) {
    const a = acct(owner);
    if (!Number.isFinite(sizeUsd) || sizeUsd < 10 || sizeUsd > maxSize) return fail(400, `size must be between 10 and ${maxSize}`);
    if (!signal || !Number.isFinite(signal.entry) || signal.entry <= 0) return fail(400, 'signal has no valid entry price');
    if (a.trades.some((t) => !t.closedAt && t.signalId === signal.id)) return fail(409, 'already open on this signal');
    if (a.trades.filter((t) => !t.closedAt).length >= maxOpen) return fail(429, `max ${maxOpen} open trades`);
    if (sizeUsd > a.cash) return fail(400, 'not enough paper cash');
    const trade = { id: crypto.randomUUID(), signalId: signal.id, moduleId: signal.moduleId, symbol: signal.symbol,
      side: signal.side, entry: signal.entry, sizeUsd, units: sizeUsd / signal.entry, openedAt: now(), closedAt: null, exit: null, pnl: null };
    a.cash -= sizeUsd; a.trades.push(trade); save();
    return { ok: true, trade };
  }

  const pnlOf = (t, price) => (t.side === 'buy' ? (price - t.entry) : (t.entry - price)) * t.units;

  function close({ owner, id, price }) {
    const a = acct(owner);
    const t = a.trades.find((x) => x.id === id && !x.closedAt);
    if (!t) return fail(404, 'open trade not found');
    if (!Number.isFinite(price) || price <= 0) return fail(400, 'invalid price');
    t.exit = price; t.closedAt = now(); t.pnl = Math.round(pnlOf(t, price) * 100) / 100;
    a.cash += t.sizeUsd + t.pnl; save();
    return { ok: true, trade: t };
  }

  function portfolio({ owner, prices = {} }) {
    const a = acct(owner);
    const openTrades = a.trades.filter((t) => !t.closedAt).map((t) => {
      const px = Number.isFinite(prices[t.symbol]) ? prices[t.symbol] : t.entry;
      return { ...t, mark: px, unrealized: Math.round(pnlOf(t, px) * 100) / 100 };
    });
    const closedTrades = a.trades.filter((t) => t.closedAt);
    const byModule = {};
    for (const t of closedTrades) {
      const m = (byModule[t.moduleId] = byModule[t.moduleId] || { pnl: 0, trades: 0, wins: 0 });
      m.pnl = Math.round((m.pnl + t.pnl) * 100) / 100; m.trades++; if (t.pnl > 0) m.wins++;
    }
    const equity = Math.round((a.cash + openTrades.reduce((s, t) => s + t.sizeUsd + t.unrealized, 0)) * 100) / 100;
    return { cash: Math.round(a.cash * 100) / 100, equity, openTrades, closedTrades, byModule };
  }

  return { open, close, portfolio };
}
module.exports = { createPaper };
