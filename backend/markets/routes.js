'use strict';
const express = require('express');
const { MODULES } = require('./modules');

const CLASSES = new Set(['stock', 'crypto', 'prediction']);
const cls = (q) => (CLASSES.has(q) ? q : undefined);

function createRouter({ engine, paper }) {
  const r = express.Router();
  const need = (req, res) => { if (!req.userId) { res.status(401).json({ ok: false, error: 'sign in to paper trade' }); return false; } return true; };
  const guard = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); } };

  r.get('/signals', guard(async (req, res) => res.json({ ok: true, ...(await engine.signals({ assetClass: cls(req.query.assetClass) })) })));
  r.get('/quotes', guard(async (req, res) => res.json({ ok: true, ...(await engine.quotes({ assetClass: cls(req.query.assetClass) })) })));
  r.get('/correlations', guard(async (_q, res) => res.json({ ok: true, ...(await engine.correlations()) })));
  r.get('/modules', (_q, res) => res.json({ ok: true, modules: MODULES.map((m) => ({ id: m.id, source: m.source, assetClasses: m.assetClasses })) }));

  r.get('/paper', guard(async (req, res) => {
    if (!need(req, res)) return;
    const { quotes } = await engine.quotes();
    const prices = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
    res.json({ ok: true, ...paper.portfolio({ owner: String(req.userId), prices }) });
  }));

  r.post('/paper/open', guard(async (req, res) => {
    if (!need(req, res)) return;
    const signal = await engine.signalById(String((req.body && req.body.signalId) || ''));
    if (!signal) return res.status(404).json({ ok: false, error: 'signal no longer active' });
    const out = paper.open({ owner: String(req.userId), signal, sizeUsd: Number(req.body.sizeUsd) });
    res.status(out.ok ? 200 : out.status).json(out);
  }));

  r.post('/paper/close', guard(async (req, res) => {
    if (!need(req, res)) return;
    const { quotes } = await engine.quotes();
    const id = String((req.body && req.body.id) || '');
    const open = paper.portfolio({ owner: String(req.userId), prices: {} }).openTrades.find((t) => t.id === id);
    const q = open && quotes.find((x) => x.symbol === open.symbol);
    const out = paper.close({ owner: String(req.userId), id, price: q ? q.price : (open ? open.entry : NaN) });
    res.status(out.ok ? 200 : out.status).json(out);
  }));

  return r;
}
module.exports = { createRouter };
