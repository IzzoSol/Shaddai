'use strict';
/**
 * home-deed-routes.js — buy a realm-town HOME with Sparks (owner 2026-10-16: "people can purchase homes with sparks").
 * Sparks are closed-loop points (no cash-out); this moves NO real money and mints NOTHING. A deed is a server record only.
 *
 *   GET  /api/home-deeds              -> { ok, price, deeds: { homeId: { owner, at } } }   (public: lets the world mark sold homes)
 *   GET  /api/home-deeds/mine         -> { ok, homes: [homeId] }                          (signed in)
 *   POST /api/home-deeds/buy {homeId} -> { ok, homeId, price, replayed? }                 (signed in; 402 not enough Sparks, 409 owned by someone else)
 *
 * homeId = 'home:<stationId>:<lot>' — stationId [a-z0-9-]{2,32}, lot 0..3 (the 4 home lots of world-realm-kits.js TOWN per station).
 * Money path: EconomyService.spend() is the ONLY Sparks writer; idempotency key 'deed:<homeId>:<userId>' so a retried request never
 * charges twice. Purchases are serialized by the deed store lock: the ownership check, the spend and the record are one unit.
 */
const path = require('path');
const express = require('express');
const { JsonStore } = require('./lib/json-store');

const HOME_ID_RE = /^home:([a-z0-9-]{2,32}):(\d{1,2})$/;
const UID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const HOME_LOTS = 4;   // world-realm-kits TOWN: 4 home lots per station (trimmed 2026-10-16)
const MAX_HOMES_PER_USER = 3;

function validHomeId(id) { const m = HOME_ID_RE.exec(String(id || '')); return !!m && Number(m[2]) < HOME_LOTS; }

function makeRouter(opts) {
  opts = opts || {};
  const price = opts.price || Number(process.env.HOME_PRICE_SPARKS) || 2500;
  const store = opts.store || new JsonStore(path.join(opts.dataDir || path.join(__dirname, 'data'), 'home-deeds.json'), { deeds: {} });
  const economy = opts.economy || require('./economy-service').getDefault();
  const r = express.Router();
  r.use(express.json({ limit: '2kb' }));
  const uidOf = (req) => (req.userId && UID_RE.test(String(req.userId)) ? String(req.userId) : null);

  r.get('/', async (_req, res) => {
    const db = await store.read(); const out = {};
    Object.keys(db.deeds || {}).forEach((k) => { out[k] = { owner: db.deeds[k].owner, at: db.deeds[k].at }; });
    res.json({ ok: true, price, deeds: out });
  });

  r.get('/mine', async (req, res) => {
    const u = uidOf(req); if (!u) return res.status(401).json({ ok: false, error: 'sign in first' });
    const db = await store.read(); res.json({ ok: true, homes: Object.keys(db.deeds || {}).filter((k) => db.deeds[k].owner === u) });
  });

  r.post('/buy', async (req, res) => {
    const u = uidOf(req); if (!u) return res.status(401).json({ ok: false, error: 'sign in first' });
    const homeId = String((req.body && req.body.homeId) || '');
    if (!validHomeId(homeId)) return res.status(400).json({ ok: false, error: 'unknown home' });
    try {
      const out = await store.withLock(async (db) => {
        db.deeds = db.deeds || {};
        const d = db.deeds[homeId];
        if (d && d.owner === u) return { replayed: true };
        if (d) return { taken: true };
        if (Object.keys(db.deeds).filter((k) => db.deeds[k].owner === u).length >= MAX_HOMES_PER_USER) return { limit: true };
        await economy.spend(u, price, 'home_deed:' + homeId, 'deed:' + homeId + ':' + u, { refId: homeId });
        db.deeds[homeId] = { owner: u, at: new Date().toISOString(), price };
        return { bought: true };
      });
      if (out.taken) return res.status(409).json({ ok: false, error: 'this home already has an owner' });
      if (out.limit) return res.status(409).json({ ok: false, error: 'you can own up to ' + MAX_HOMES_PER_USER + ' homes' });
      return res.json({ ok: true, homeId, price, replayed: !!out.replayed });
    } catch (e) {
      if (e && e.code === 'INSUFFICIENT_FUNDS') return res.status(402).json({ ok: false, error: 'not enough Sparks (' + price + ' needed)' });
      if (e && e.code === 'VALIDATION') return res.status(400).json({ ok: false, error: e.message });
      return res.status(500).json({ ok: false, error: 'purchase failed' });
    }
  });
  return r;
}

module.exports = { makeRouter, validHomeId, HOME_LOTS };
