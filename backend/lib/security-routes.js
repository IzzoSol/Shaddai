/**
 * security-routes.js — PIKADON Security API Router
 * SHADDAI MASTER FINAL BUILD — backend/lib/security-routes.js
 *
 * Mount in server-production.js:
 *   app.use('/api/security', require('./lib/security-routes'));
 *
 * Endpoints:
 *   POST  /api/security/scan             — run pikadon-scan on submitted content
 *   POST  /api/security/report           — flag content for human review
 *   GET   /api/security/queue            — list flagged items (newest first)
 *   POST  /api/security/queue/:id/resolve — mark an item allow|block
 *
 * Deps: express, node built-ins (fs, path, crypto). No new npm packages.
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const { scan } = require('./pikadon-scan');

const router   = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'security-queue.json');

// ─── Limits / constants ───────────────────────────────────────────────────────
const MAX_QUEUE      = 500;
const MAX_VALUE_LEN  = 2048;
const MAX_REASON_LEN = 500;
const MAX_BY_LEN     = 128;
const MAX_KIND_LEN   = 64;

// ─── Queue persistence helpers ────────────────────────────────────────────────

/** Read the queue file; returns [] on missing/corrupt file. */
function readQueue() {
  try {
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Atomically write the queue — write to a temp file then rename. */
function writeQueue(items) {
  const tmp = QUEUE_FILE + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf8');
    fs.renameSync(tmp, QUEUE_FILE);
  } catch (err) {
    // Clean up temp file if rename failed
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/** Cap string to maxLen, returning a trimmed copy. */
function cap(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).trim();
}

// ─── POST /scan ───────────────────────────────────────────────────────────────
//
// Body: { type: 'url'|'text', value: string, expect?: string }
// Response: verdict object from pikadon-scan.scan()

router.post('/scan', (req, res) => {
  const { type, value, expect } = req.body || {};

  if (!type || !value) {
    return res.status(400).json({ error: 'Missing required fields: type, value' });
  }
  if (!['url', 'text'].includes(type)) {
    return res.status(400).json({ error: 'type must be "url" or "text"' });
  }

  const safeValue  = cap(String(value),  MAX_VALUE_LEN);
  const safeExpect = expect ? cap(String(expect), 32) : undefined;

  let verdict;
  try {
    verdict = scan({ type, value: safeValue, expect: safeExpect });
  } catch (err) {
    return res.status(500).json({ error: 'Scan engine error', detail: String(err.message) });
  }

  return res.json({ verdict });
});

// ─── POST /report ─────────────────────────────────────────────────────────────
//
// Body: { kind: string, value: string, reason?: string, by?: string }
// Appends a flagged item to security-queue.json (newest last, capped at MAX_QUEUE).

router.post('/report', (req, res) => {
  const { kind, value, reason, by } = req.body || {};

  if (!kind || !value) {
    return res.status(400).json({ error: 'Missing required fields: kind, value' });
  }

  // Run pikadon-scan as a courtesy — attach the verdict to the report
  const safeValue = cap(String(value), MAX_VALUE_LEN);
  const safeKind  = cap(String(kind),  MAX_KIND_LEN);
  const safeReason = reason ? cap(String(reason), MAX_REASON_LEN) : '';
  const safeBy    = by     ? cap(String(by),     MAX_BY_LEN)     : 'anonymous';

  // Detect if this looks like a URL or text for auto-scan
  let autoVerdict = null;
  try {
    const isUrl = /^https?:\/\//i.test(safeValue) || /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(safeValue);
    autoVerdict = scan({ type: isUrl ? 'url' : 'text', value: safeValue });
  } catch {
    // non-fatal — report still recorded
  }

  const item = {
    id:        crypto.randomUUID(),
    kind:      safeKind,
    value:     safeValue,
    reason:    safeReason,
    by:        safeBy,
    autoScan:  autoVerdict,
    status:    'pending',   // pending | allowed | blocked
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
  };

  let queue;
  try {
    queue = readQueue();
    queue.push(item);
    // Enforce cap — drop oldest if over limit
    if (queue.length > MAX_QUEUE) {
      queue = queue.slice(queue.length - MAX_QUEUE);
    }
    writeQueue(queue);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save report', detail: String(err.message) });
  }

  return res.status(201).json({ ok: true, id: item.id, autoScan: autoVerdict });
});

// ─── GET /queue ───────────────────────────────────────────────────────────────
//
// Query params:
//   status  — filter by 'pending'|'allowed'|'blocked' (default: all)
//   limit   — number of results to return (default 50, max 200)
//   offset  — skip N results (for pagination)
//
// Returns items newest-first.

router.get('/queue', (req, res) => {
  let items;
  try {
    items = readQueue();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read queue', detail: String(err.message) });
  }

  // Newest first
  items = items.slice().reverse();

  // Optional status filter
  const { status, limit: limitStr, offset: offsetStr } = req.query;
  if (status && ['pending', 'allowed', 'blocked'].includes(status)) {
    items = items.filter(i => i.status === status);
  }

  const limit  = Math.min(parseInt(limitStr,  10) || 50,  200);
  const offset = Math.max(parseInt(offsetStr, 10) || 0,   0);

  const page = items.slice(offset, offset + limit);

  return res.json({
    total:  items.length,
    offset,
    limit,
    items:  page,
  });
});

// ─── POST /queue/:id/resolve ──────────────────────────────────────────────────
//
// Body: { action: 'allow'|'block', by?: string }
// Marks the queued item as resolved.

router.post('/queue/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { action, by } = req.body || {};

  if (!action || !['allow', 'block'].includes(action)) {
    return res.status(400).json({ error: 'action must be "allow" or "block"' });
  }

  let queue;
  try {
    queue = readQueue();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read queue', detail: String(err.message) });
  }

  const idx = queue.findIndex(i => i.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Queue item "${id}" not found` });
  }

  queue[idx] = {
    ...queue[idx],
    status:     action === 'allow' ? 'allowed' : 'blocked',
    resolvedBy: by ? cap(String(by), MAX_BY_LEN) : 'admin',
    resolvedAt: new Date().toISOString(),
  };

  try {
    writeQueue(queue);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save resolution', detail: String(err.message) });
  }

  return res.json({ ok: true, item: queue[idx] });
});

module.exports = router;
