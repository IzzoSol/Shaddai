'use strict';
// SHADDAI Colosseum: schedule + tickets. The fights are SIMULATED deterministically on the client from a seed; the server gives the seed
// of a ticketed event ONLY to its ticket holders, so a free viewer genuinely cannot reproduce the main event or the tournament.
// (A practice bout uses a public seed and is always free.)
//   GET  /api/colosseum/events            -> current + next main bout and tournament, prices, whether you hold a ticket
//   POST /api/colosseum/ticket {event_id} -> sign in required; free unless ARENA_TICKETS=on (then Sparks via economy-service, idempotent, refunded on failure)
//   GET  /api/colosseum/ticket/:event_id  -> { has_ticket, seed } (seed only for holders)
// Prices are PLACEHOLDERS in cents of a Spark (owner decides). Nothing here pays out prizes or touches a wallet.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOUT_MS = 4 * 60 * 1000, TOUR_MS = 60 * 60 * 1000;
const PRICE_CENTS = { main: 50, tournament: 100 };
const EVENT_RE = /^(bout|tour)-\d{1,9}$/;

function createArena(opts) {
  opts = opts || {};
  const file = opts.file || path.join(__dirname, 'data', 'arena-tickets.json');
  const secretFile = opts.secretFile || path.join(__dirname, 'data', 'arena-secret.txt');
  const now = opts.now || (() => Date.now());
  const ticketsOn = opts.ticketsOn != null ? !!opts.ticketsOn : process.env.ARENA_TICKETS === 'on';
  const unitsPerSpark = opts.unitsPerSpark || Number(process.env.SPARKS_LEDGER_UNITS_PER_SPARK) || 100;
  const economy = () => opts.economy || require('./economy-service').getDefault();
  const uidOf = typeof opts.uidOf === 'function' ? opts.uidOf : (req) => { const u = String(req.userId || ''); return (req.isAuthenticated && u && u !== 'local' && u.length <= 128) ? u : ''; };

  let secret = opts.secret || process.env.ARENA_SECRET || '';
  if (!secret) { try { secret = fs.readFileSync(secretFile, 'utf8').trim(); } catch (_) { /* create below */ } }
  if (!secret) { secret = crypto.randomBytes(24).toString('hex'); try { fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, secret); } catch (_) { /* in-memory only */ } }
  let db = { tickets: {} }; try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && j.tickets) db = j; } catch (_) { /* first boot */ }
  function save() { try { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.tmp-' + process.pid; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, file); } catch (e) { console.error('[arena] save failed:', e && e.message); } }
  const seedOf = (eventId) => parseInt(crypto.createHmac('sha256', secret).update(eventId).digest('hex').slice(0, 8), 16) >>> 0;
  const fmt = (c) => (c / 100).toFixed(2);

  function describe(kind, n) { const len = kind === 'tour' ? TOUR_MS : BOUT_MS; return { id: kind + '-' + n, kind: kind === 'tour' ? 'tournament' : 'main', starts: n * len, ends: (n + 1) * len, price_cents: PRICE_CENTS[kind === 'tour' ? 'tournament' : 'main'], price_sparks: fmt(PRICE_CENTS[kind === 'tour' ? 'tournament' : 'main']) }; }
  function schedule(t) { const b = Math.floor(t / BOUT_MS), h = Math.floor(t / TOUR_MS); return { now: t, current: [describe('bout', b), describe('tour', h)], next: [describe('bout', b + 1), describe('tour', h + 1)] }; }
  function eventValid(id, t) { if (!EVENT_RE.test(String(id))) return null; const kind = id.slice(0, 4) === 'tour' ? 'tour' : 'bout', n = parseInt(id.slice(5), 10), len = kind === 'tour' ? TOUR_MS : BOUT_MS, cur = Math.floor(t / len); if (n < cur || n > cur + 1) return null; return describe(kind, n); }
  const has = (u, id) => !!(u && db.tickets[u + '|' + id]);

  const router = express.Router();
  const json = express.json({ limit: '4kb' });
  if (!opts.uidOf) { try { const g = require('./auth-guard'); router.use(g.softAuth); router.use(g.rateLimit({ windowMs: 60000, max: 60 })); } catch (_) { /* tests */ } }

  router.get('/events', (req, res) => {
    const u = uidOf(req), s = schedule(now());
    const mark = (e) => Object.assign({}, e, { has_ticket: has(u, e.id) });
    res.json({ ok: true, now: s.now, tickets_on: ticketsOn, signed_in: !!u, practice: { free: true, seed: 20261107 }, current: s.current.map(mark), next: s.next.map(mark),
      note: ticketsOn ? 'Tickets are paid in Sparks.' : 'Tickets are free for now but need you to sign in.' });
  });
  router.get('/ticket/:id', (req, res) => {
    const u = uidOf(req), e = eventValid(req.params.id, now()); if (!e) return res.status(404).json({ ok: false, error: 'unknown or finished event' });
    const held = has(u, e.id); res.json(Object.assign({ ok: true, event_id: e.id, has_ticket: held }, held ? { seed: seedOf(e.id) } : {}));
  });
  router.post('/ticket', json, async (req, res) => {
    const u = uidOf(req); if (!u) return res.status(401).json({ ok: false, error: 'sign in to get a ticket' });
    const id = String((req.body && req.body.event_id) || ''), e = eventValid(id, now()); if (!e) return res.status(404).json({ ok: false, error: 'unknown or finished event' });
    if (has(u, id)) return res.json({ ok: true, already: true, event_id: id, seed: seedOf(id) });
    let paid = null;
    if (ticketsOn) {
      const units = Math.max(1, Math.round(e.price_cents * unitsPerSpark / 100)), key = 'ticket:' + u + ':' + id;
      try { await economy().spend(u, units, 'arena:ticket', key); paid = { units, key }; }
      catch (err) { if (err && (err.code === 'INSUFFICIENT_FUNDS' || /insufficient/i.test(String(err.message)))) return res.status(402).json({ ok: false, error: 'Out of Sparks. Top up to get a ticket (' + e.price_sparks + ' Sparks).' }); return res.status(503).json({ ok: false, error: 'the Sparks service is unavailable; try again shortly' }); }
    }
    try { db.tickets[u + '|' + id] = { at: new Date(now()).toISOString(), paid_units: paid ? paid.units : 0 }; save(); }
    catch (err) { if (paid) { try { await economy().grant(u, paid.units, 'arena:ticket:refund', 'refund:' + paid.key); } catch (_) { /* ledger idempotent */ } } return res.status(500).json({ ok: false, error: 'could not issue the ticket; you were not charged' }); }
    res.status(201).json({ ok: true, event_id: id, charged_sparks: paid ? fmt(e.price_cents) : '0.00', seed: seedOf(id) });
  });
  router._test = { schedule, eventValid, seedOf };
  return router;
}

module.exports = createArena();
module.exports.createArena = createArena;
