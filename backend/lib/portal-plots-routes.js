// backend/lib/portal-plots-routes.js — Portal Plot Rent / Buy State
// NEXUS build — SHADDAI World 3D
//
// Mount in server-production.js:
//   app.use('/api/portal-plots', require('./lib/portal-plots-routes'));
//
// Data file: backend/data/portal-plots.json
//   { "plots": { "<id>": { ...plotRecord } } }
//
// Endpoints:
//   GET  /api/portal-plots              — list all plots with current status
//   POST /api/portal-plots/:id/rent     — body { owner, months } → mark rented
//   POST /api/portal-plots/:id/buy      — body { owner }         → mark sold
//   POST /api/portal-plots/:id/release  — (admin/testing)        → back to available
//
// Beta note: no real payment processing here. The route records *intent* and
// price so the dashboard can gate on the stored record. Wire Stripe separately.

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const router   = express.Router();
const DATA_DIR  = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'portal-plots.json');

// ── Input limits ──────────────────────────────────────────────────────────────
const MAX_OWNER  = 80;    // display name / wallet address length cap
const MAX_MONTHS = 24;    // max rental term in months
const MIN_MONTHS = 1;

// ── Seed data ─────────────────────────────────────────────────────────────────
// Written on first boot if the file doesn't exist.
const SEED = {
  plots: {
    'nexus-world': {
      id:          'nexus-world',
      name:        'NEXUS Portal World',
      agentCode:   'NEXUS',
      pos:         [-165, 286],              // world-space [x, z] — matches portals-registry.js
      status:      'available',              // 'available' | 'rented' | 'sold'
      rentPrice:   29,                       // USD / month (informational; beta)
      buyPrice:    299,                      // USD one-time (informational; beta)
      owner:       null,
      rentedAt:    null,
      expiresAt:   null,
      soldAt:      null,
      updatedAt:   null,
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Load store from disk; seeds the file if it doesn't exist yet. */
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      _save(SEED);
      return JSON.parse(JSON.stringify(SEED));
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.plots !== 'object') {
      _save(SEED);
      return JSON.parse(JSON.stringify(SEED));
    }
    return parsed;
  } catch (_) {
    return JSON.parse(JSON.stringify(SEED));
  }
}

/** Atomic write: tmp file → rename. */
function _save(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

/** Strip HTML and trim; cap to maxLen. Returns '' for non-strings. */
function sanitize(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

/** Clamp a number to [min, max]; returns fallback if not a finite number. */
function clampInt(val, min, max, fallback) {
  var n = parseInt(val, 10);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Compute ISO expiry string from now + months. */
function expiryFromNow(months) {
  var d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/portal-plots
// Returns all plots (id, name, status, owner, prices, dates).
// The frontend portal-plots.js polls this to update signs and tints.
router.get('/', function (req, res) {
  try {
    const store = load();
    res.json({ ok: true, plots: store.plots });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/portal-plots/:id/rent
// body: { owner: string, months: number }
// Marks the plot as rented by owner for N months.
// Returns 409 if already rented/sold; 404 if id unknown.
router.post('/:id/rent', express.json({ limit: '8kb' }), function (req, res) {
  try {
    const id    = String(req.params.id || '').slice(0, 64);
    const store = load();

    if (!store.plots[id]) {
      return res.status(404).json({ ok: false, error: 'plot not found: ' + id });
    }

    const plot = store.plots[id];

    if (plot.status === 'sold') {
      return res.status(409).json({ ok: false, error: 'plot is already sold; cannot rent a sold plot' });
    }
    if (plot.status === 'rented') {
      return res.status(409).json({
        ok: false,
        error: 'plot is currently rented by ' + (plot.owner || 'another user') +
               ' until ' + (plot.expiresAt || 'unknown'),
      });
    }

    const b      = req.body || {};
    const owner  = sanitize(b.owner, MAX_OWNER) || 'anonymous';
    const months = clampInt(b.months, MIN_MONTHS, MAX_MONTHS, 1);

    plot.status    = 'rented';
    plot.owner     = owner;
    plot.rentedAt  = new Date().toISOString();
    plot.expiresAt = expiryFromNow(months);
    plot.soldAt    = null;
    plot.updatedAt = new Date().toISOString();

    _save(store);

    res.status(201).json({
      ok:     true,
      action: 'rented',
      plot:   plot,
      months: months,
      message: owner + ' has rented ' + plot.name + ' for ' + months +
               ' month(s) until ' + plot.expiresAt +
               ' ($' + (plot.rentPrice * months) + ' beta intent recorded)',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/portal-plots/:id/buy
// body: { owner: string }
// Marks the plot as sold to owner.
// Returns 409 if already sold; 404 if id unknown.
router.post('/:id/buy', express.json({ limit: '8kb' }), function (req, res) {
  try {
    const id    = String(req.params.id || '').slice(0, 64);
    const store = load();

    if (!store.plots[id]) {
      return res.status(404).json({ ok: false, error: 'plot not found: ' + id });
    }

    const plot = store.plots[id];

    if (plot.status === 'sold') {
      return res.status(409).json({
        ok: false,
        error: 'plot is already sold to ' + (plot.owner || 'another user'),
      });
    }

    const b     = req.body || {};
    const owner = sanitize(b.owner, MAX_OWNER) || 'anonymous';

    plot.status    = 'sold';
    plot.owner     = owner;
    plot.soldAt    = new Date().toISOString();
    plot.rentedAt  = null;
    plot.expiresAt = null;
    plot.updatedAt = new Date().toISOString();

    _save(store);

    res.status(201).json({
      ok:     true,
      action: 'sold',
      plot:   plot,
      message: owner + ' has purchased ' + plot.name +
               ' ($' + plot.buyPrice + ' beta intent recorded)',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/portal-plots/:id/release
// No body required.
// Resets plot to 'available'. Intended for admin use or testing.
router.post('/:id/release', express.json({ limit: '2kb' }), function (req, res) {
  try {
    const id    = String(req.params.id || '').slice(0, 64);
    const store = load();

    if (!store.plots[id]) {
      return res.status(404).json({ ok: false, error: 'plot not found: ' + id });
    }

    const plot = store.plots[id];
    const prevStatus = plot.status;
    const prevOwner  = plot.owner;

    plot.status    = 'available';
    plot.owner     = null;
    plot.rentedAt  = null;
    plot.expiresAt = null;
    plot.soldAt    = null;
    plot.updatedAt = new Date().toISOString();

    _save(store);

    res.json({
      ok:          true,
      action:      'released',
      plot:        plot,
      wasStatus:   prevStatus,
      wasOwner:    prevOwner,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

module.exports = router;
