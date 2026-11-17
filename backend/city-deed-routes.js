'use strict';
/**
 * city-deed-routes.js — buy a CITY PLOT (plots-v4) with Sparks. Server record only.
 *   GET  /api/city-deeds        -> { ok, deeds: { plotId: { owner, price, at } } }
 *   POST /api/city-deeds/buy { plotId } -> { ok, plotId, owner, price, balance }
 *        401 signed-out · 400 unknown plot · 402 insufficient_sparks · 409 owned ·
 *        503 pricing not set (CITY_PLOT_PRICE_PER_M2_SPARKS unset — founder decision)
 * Price = plot area (w_m × d_m from plots-v4.json) × PRICE_PER_M2, rounded to 2dp.
 * Money path: EconomyService.spendSparks() is the only Sparks writer; idempotency key
 * 'citydeed:<plotId>:<userId>' so a retry never double-charges. Ownership check,
 * spend and record happen inside the store lock as one unit (home-deeds pattern).
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { JsonStore } = require('./lib/json-store');

const PLOTS_FILE = path.join(__dirname, '..', 'public', 'assets', 'world', 'plots-v4.json');
const UID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const PRICE_PER_M2 = Number(process.env.CITY_PLOT_PRICE_PER_M2_SPARKS);

function loadPlots() {
  try { const j = JSON.parse(fs.readFileSync(PLOTS_FILE, 'utf8')); return Array.isArray(j.plots) ? j.plots : []; }
  catch (e) { return []; }
}
function priceFor(plot) {
  if (!isFinite(PRICE_PER_M2) || PRICE_PER_M2 <= 0) return null;
  const area = (Number(plot.w_m) || 0) * (Number(plot.d_m) || 0);
  return Math.round(area * PRICE_PER_M2 * 100) / 100;
}

function makeRouter(opts) {
  opts = opts || {};
  const store = opts.store || new JsonStore(path.join(opts.dataDir || path.join(__dirname, 'data'), 'city-deeds.json'), { deeds: {} });
  const economy = opts.economy || require('./economy-service').getDefault();
  const r = express.Router();
  r.use(express.json({ limit: '2kb' }));
  const uidOf = (req) => (req.userId && UID_RE.test(String(req.userId)) ? String(req.userId) : null);

  r.get('/', async (_req, res) => {
    const db = await store.read();
    res.json({ ok: true, deeds: db.deeds || {} });
  });

  r.post('/buy', async (req, res) => {
    const u = uidOf(req); if (!u) return res.status(401).json({ ok: false, error: 'sign in first' });
    const plotId = String((req.body && req.body.plotId) || '');
    const plot = loadPlots().find(p => p.plot_id === plotId);
    if (!plot) return res.status(400).json({ ok: false, error: 'unknown plot' });
    const price = priceFor(plot);
    if (price == null) return res.status(503).json({ ok: false, error: 'plot pricing not set' });
    try {
      const out = await store.withLock(async (db) => {
        db.deeds = db.deeds || {};
        const d = db.deeds[plotId];
        if (d && d.owner === u) return { replayed: true };
        if (d) return { taken: true };
        await economy.spendSparks(u, price, 'city_deed:' + plotId, 'citydeed:' + plotId + ':' + u, { refId: plotId });
        db.deeds[plotId] = { owner: u, price: price, at: new Date().toISOString() };
        return { bought: true };
      });
      if (out.taken) return res.status(409).json({ ok: false, error: 'this plot already has an owner' });
      const balance = await economy.getBalance(u);
      return res.json({ ok: true, plotId: plotId, owner: u, price: price, balance: balance, replayed: !!out.replayed });
    } catch (e) {
      if (e && (e.name === 'InsufficientFundsError' || /insufficient/i.test(e.message || ''))) {
        return res.status(402).json({ ok: false, error: 'insufficient_sparks' });
      }
      return res.status(500).json({ ok: false, error: e.message });
    }
  });
  return r;
}
module.exports = { makeRouter };
