'use strict';
/**
 * navi-routes.js — the backend for the in-world Navi (public/world-navi.js), 2026-10-16.
 * Before this, Navi called GET /api/navi/signals (no handler) and its signup / enroll / name actions lived only in localStorage.
 *
 *   GET  /api/navi/signals        ZEROX call feed. The SERVER decides what you see: free = 3 calls at least 60 min old (no entry data),
 *                                 paid tier (billing-service customer tier != free) = the 20 latest live calls with peak multiple.
 *   GET  /api/navi/state          the caller's server-side Navi record { name, schedule[], enrolled[] }
 *   POST /api/navi/name           { name }            3-20 chars, letters/digits/space/_-.
 *   POST /api/navi/signup         { eventId }         event signup (free; fees only when a live event charges, via the economy service)
 *   POST /api/navi/enroll         { classId, botId? } Academy class enrolment
 *
 * Identity: req.userId from softAuth (verified session uid). Writes without a user id are refused (401). No money moves here.
 * Storage: data/navi-state.json via JsonStore (atomic, serialized).
 */
const path = require('path');
const express = require('express');
const { JsonStore } = require('./lib/json-store');

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const NAME_RE = /^[A-Za-z0-9 _.-]{3,20}$/;
const MAX_LIST = 50;

function makeRouter(opts) {
  opts = opts || {};
  const store = opts.store || new JsonStore(path.join(opts.dataDir || path.join(__dirname, 'data'), 'navi-state.json'), { users: {} });
  const calls = opts.calls || function (o) { try { return require('./telegram-pnl').callsJson(o); } catch (e) { return []; } };
  const tierOf = opts.tierOf || function (uid) { try { const c = require('./billing-service').getCustomer(uid); return (c && c.tier) || 'free'; } catch (e) { return 'free'; } };
  const now = opts.now || Date.now;
  const r = express.Router();
  r.use(express.json({ limit: '4kb' }));

  const uidOf = (req) => (req.userId && ID_RE.test(String(req.userId)) ? String(req.userId) : null);
  const needUser = (req, res) => { const u = uidOf(req); if (!u) res.status(401).json({ ok: false, error: 'sign in first' }); return u; };
  const rec = (db, u) => (db.users[u] = db.users[u] || { name: null, schedule: [], enrolled: [] });

  r.get('/signals', (req, res) => {
    const u = uidOf(req), paid = !!u && tierOf(u) !== 'free', t = now();
    const rows = calls({ limit: 200 }) || [];
    if (paid) {
      return res.json({ ok: true, live: true, calls: rows.slice(0, 20).map((c) => ({ symbol: c.symbol, chain: c.chain, peakMult: c.peakMult != null ? c.peakMult : null, entryFdv: c.entryFdv != null ? c.entryFdv : null, ts: c.ts })) });
    }
    const old = rows.filter((c) => c.ts && t - c.ts >= 60 * 60 * 1000).slice(0, 3);
    return res.json({ ok: true, live: false, calls: old.map((c) => ({ symbol: c.symbol, chain: c.chain, ageMin: Math.round((t - c.ts) / 60000) })) });
  });

  r.get('/state', async (req, res) => {
    const u = needUser(req, res); if (!u) return;
    const db = await store.read(); const s = (db.users && db.users[u]) || { name: null, schedule: [], enrolled: [] };
    res.json({ ok: true, name: s.name, schedule: s.schedule, enrolled: s.enrolled });
  });

  r.post('/name', async (req, res) => {
    const u = needUser(req, res); if (!u) return;
    const name = String((req.body && req.body.name) || '').trim();
    if (!NAME_RE.test(name)) return res.status(400).json({ ok: false, error: 'name must be 3-20 letters, digits, space, _ . -' });
    await store.withLock((db) => { rec(db, u).name = name; });
    res.json({ ok: true, name });
  });

  r.post('/signup', async (req, res) => {
    const u = needUser(req, res); if (!u) return;
    const id = String((req.body && req.body.eventId) || '');
    if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'bad eventId' });
    const out = await store.withLock((db) => { const s = rec(db, u); if (s.schedule.some((e) => e.id === id)) return 'already';
      s.schedule.push({ id, kind: 'event', at: now() }); if (s.schedule.length > MAX_LIST) s.schedule.splice(0, s.schedule.length - MAX_LIST); return 'ok'; });
    res.json({ ok: true, eventId: id, already: out === 'already' });
  });

  r.post('/enroll', async (req, res) => {
    const u = needUser(req, res); if (!u) return;
    const cls = String((req.body && req.body.classId) || ''), bot = req.body && req.body.botId != null ? String(req.body.botId) : null;
    if (!ID_RE.test(cls) || (bot !== null && !ID_RE.test(bot))) return res.status(400).json({ ok: false, error: 'bad classId/botId' });
    const out = await store.withLock((db) => { const s = rec(db, u); if (s.enrolled.some((e) => e.classId === cls)) return 'already';
      s.enrolled.push({ classId: cls, botId: bot, at: now() }); if (s.enrolled.length > MAX_LIST) s.enrolled.splice(0, s.enrolled.length - MAX_LIST); return 'ok'; });
    res.json({ ok: true, classId: cls, already: out === 'already' });
  });

  return r;
}

module.exports = { makeRouter };
