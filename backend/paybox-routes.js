// backend/paybox-routes.js — customer-facing Paybox endpoints, mounted at /api/paybox.
// Separate from federation-routes.js (that's for EXTERNAL bots/agents calling SHADDAI's
// agents over MCP) — this is SHADDAI's own site talking to its own agents' wallets.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const json = express.json();
let guard = null; try { guard = require('./paybox-guard'); } catch (e) { console.warn('[paybox-routes] paybox-guard unavailable:', e.message); }

const WALLETS_PATH = path.join(__dirname, 'data', 'paybox-wallets.json');

// GET /api/paybox/wallets — public addresses to show/QR on the front door.
// Deliberately file-backed and empty-by-default (see paybox-wallets.json) rather than
// pulling live from Paybox — showing a wallet before it's actually funded-and-ready is
// worse than showing nothing.
router.get('/wallets', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
    res.json({ ok: true, wallets: Array.isArray(data.wallets) ? data.wallets : [] });
  } catch (e) { res.json({ ok: true, wallets: [] }); }
});

// GET /api/paybox/tip-link?agent=ZEROX&amount_usd=5
// Generates a real MoonPay checkout URL that lands funds straight into that agent's
// Paybox wallet. Uses get_buy_link — a READ-ONLY Paybox tool ("Generating the link
// needs no approval, touches no key, and moves no money" per its own description), so
// this works regardless of paybox-config.json's enabled flag; a tip is money coming IN,
// not the agent spending, so the spend-gate doesn't apply here.
//
// tip_credentials in paybox-config.json currently points ZEROX at the general
// evm-default wallet — update it once ZEROX's own dedicated wallets ("Xerox Fomo
// Robinhood"/"Xerox Fomo Solana") are granted + their fresh signing key is pasted back
// into Paybox (owner action, pending as of 2026-08-29).
async function tipLink(agent, amountRaw) {
  if (!guard) return { status: 501, body: { ok: false, error: 'Paybox guard unavailable' } };
  const cfg = guard.getConfig();
  const credentialId = cfg.tip_credentials && cfg.tip_credentials[agent];
  if (!credentialId) return { status: 404, body: { ok: false, error: `No tip wallet configured for "${agent}"` } };

  const amount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '' ? Number(amountRaw) : undefined;
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 10000)) {
    return { status: 400, body: { ok: false, error: 'amount_usd must be a positive number (max 10000)' } };
  }

  const r = await guard.payboxRead('get_buy_link', { credential_id: credentialId, amount_usd: amount }, agent);
  if (!r.ok) return { status: 502, body: { ok: false, error: r.output } };
  return { status: 200, body: { ok: true, agent, checkout_url: r.output && r.output.url, checkoutUrl: r.output && r.output.url, raw: r.output } };
}

// GET /api/paybox/tip-link?agent=ZEROX&amount_usd=5
// Generates a real MoonPay checkout URL that lands funds straight into that agent's
// Paybox wallet. Uses get_buy_link — a READ-ONLY Paybox tool ("Generating the link
// needs no approval, touches no key, and moves no money" per its own description), so
// this works regardless of paybox-config.json's enabled flag; a tip is money coming IN,
// not the agent spending, so the spend-gate doesn't apply here.
//
// tip_credentials in paybox-config.json currently points ZEROX at the general
// evm-default wallet — update it once ZEROX's own dedicated wallets ("Xerox Fomo
// Robinhood"/"Xerox Fomo Solana") are granted + their fresh signing key is pasted back
// into Paybox (owner action, pending as of 2026-08-29).
router.get('/tip-link', json, async (req, res) => {
  const { status, body } = await tipLink(String(req.query.agent || 'ZEROX').toUpperCase(), req.query.amount_usd);
  res.status(status).json(body);
});

// POST /api/paybox/tip { to, source, amount_usd? } — the front-door "Tip ZEROX" button
// calls THIS exact path/shape (public/enter.html) expecting { checkoutUrl } to redirect
// or { ok: true } to just say thanks. Same tipLink() logic as GET /tip-link above, just
// the contract the live button already ships against — keep both in sync, don't diverge.
router.post('/tip', json, async (req, res) => {
  const b = req.body || {};
  const { status, body } = await tipLink(String(b.to || 'ZEROX').toUpperCase(), b.amount_usd);
  res.status(status).json(body);
});

// ── Paybox order confirmation (2026-08-30) ──────────────────────────────────
// A Paybox checkout (MoonPay) is not something SHADDAI gets notified about —
// no webhook is wired, so nothing here can tell on its own that a payment
// landed. This closes the loop honestly instead of pretending it's automatic:
// every paybox-method service order gets recorded pending; an admin checks
// the real balance (get_portfolio) and confirms, which credits Sparks and
// unblocks re-ordering with method:"sparks". Manual review, not a guess.
const ORDERS_PATH = path.join(__dirname, 'data', 'paybox-orders.json');
function readOrders() { try { return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch { return []; } }
function writeOrders(list) { fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true }); fs.writeFileSync(ORDERS_PATH, JSON.stringify(list, null, 2)); }
function recordOrder(entry) {
  const list = readOrders();
  const order = { id: 'pbo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), status: 'pending', createdAt: new Date().toISOString(), ...entry };
  list.push(order);
  writeOrders(list);
  return order;
}

let requireAdmin = (req, res, next) => next();
try { requireAdmin = require('./auth-guard').requireAdmin || requireAdmin; } catch (_) {}

// GET /api/paybox/orders?status=pending — admin: what's waiting on confirmation
router.get('/orders', requireAdmin, (req, res) => {
  const status = req.query.status;
  const list = readOrders().filter(o => !status || o.status === status);
  res.json({ ok: true, orders: list });
});

// POST /api/paybox/confirm-order { orderId } — admin: I checked get_portfolio myself
// and the payment is really there. Credits Sparks (idempotent on orderId), marks
// confirmed. Does NOT re-check the balance itself — that's real Paybox↔order-amount
// reconciliation, a bigger feature; this is the honest v1: human-verified, not guessed.
router.post('/confirm-order', requireAdmin, json, async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ ok: false, error: 'orderId required' });
  const list = readOrders();
  const order = list.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
  if (order.status !== 'pending') return res.status(400).json({ ok: false, error: `already ${order.status}` });

  try {
    const economy = require('./economy-service').getDefault();
    await economy.grant(order.userId, order.sparks, 'paybox_topup', `paybox_${orderId}`);
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Sparks credit failed: ${(e && e.message) || e}` });
  }
  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();
  writeOrders(list);
  res.json({ ok: true, order });
});

module.exports = router;
module.exports.recordOrder = recordOrder;
