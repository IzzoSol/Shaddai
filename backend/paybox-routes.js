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
const pikadon = require('./pikadon-middleware');

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
// or { ok: true } to just say thanks. Same tipLink() logic as GET /tip-line above, just
// the contract the live button already ships against — keep both in sync, don't diverge.
// PIKADON pre-trade review: reject FAIL, offer override WARN, allow PASS.
router.post('/tip', json, async (req, res) => {
  const b = req.body || {};
  // PIKADON review
  const [pikadonStatus, pikadonReasons] = pikadon.review(b);
  if (pikadonStatus === 'FAIL') {
    return res.status(403).json({ ok: false, error: 'PIKADON review FAIL', reasons: pikadonReasons });
  }
  if (pikadonStatus === 'WARN') {
    // WARN: user can proceed by sending an additional flag; for now we log and continue
    console.warn('[PIKADON-WARN] ' + pikadonReasons.join(', '));
  }
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
  try {
    const order = await confirmOrder(orderId);
    return res.json({ ok: true, order });
  } catch (err) {
    const status = (err && (err.code === 'NOT_FOUND' ? 404 : err.code === 'DONE' ? 400 : 500)) || 500;
    return res.status(status).json({ ok: false, error: (err && err.message) || 'confirm failed' });
  }
});
// Shared idempotent confirmation (also used by the REAL Paybox webhook in
// server-production). Marks the order confirmed, grants Sparks, and — when the
// order recorded a payer `address` + `usdc` — credits that wallet 1:1 with
// Ask-ZEROX credits (ZEROX Revenue rule: every confirmed dollar top-up funds the
// pool that pays ZEROX's AI bill; 1 USDC = 1 credit, spent 1-for-1 per question).
async function confirmOrder(orderId) {
  if (!orderId) { const e = new Error('orderId required'); e.code = 'BAD_REQ'; throw e; }
  const list = readOrders();
  const order = list.find(o => o.id === orderId);
  if (!order) { const e = new Error('order not found'); e.code = 'NOT_FOUND'; throw e; }
  if (order.status !== 'pending') { const e = new Error(`already ${order.status}`); e.code = 'DONE'; throw e; }

  try {
    const economy = require('./economy-service').getDefault();
    await economy.grant(order.userId, order.sparks, 'paybox_topup', `paybox_${orderId}`);
  } catch (e) {
    throw new Error(`Sparks credit failed: ${(e && e.message) || e}`);
  }
  // Ask-ZEROX credits — proportional to USDC actually paid; idempotent on orderId.
  let credits = null;
  const payer = order.address || order.from;
  const usdc = Number(order.usdc != null ? order.usdc : (order.amountUsdc || order.amount || order.sparks));
  if (payer && usdc > 0) {
    try {
      const c = require('./lib/zerox-credits');
      credits = c.grant(payer, usdc, `paybox_${orderId}`, 'paybox-topup');
    } catch (e) { console.warn('[paybox] credit grant skipped:', e.message); }
  }

  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();
  order.credits = credits || null;
  writeOrders(list);
  return order;
}

// GET /api/paybox/credit/balance?address= — how many Ask-ZEROX credits a wallet holds.
router.get('/credit/balance', json, (req, res) => {
  try {
    const addr = String(req.query.address || '').trim();
    if (!addr) return res.status(400).json({ ok: false, error: 'address required' });
    const c = require('./lib/zerox-credits');
    return res.json({ ok: true, address: addr, balance: c.balance(addr), unit: 'ask-credit', spend: '1 credit per question' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
// POST /api/paybox/credit/topup { address, usdc, ref } — admin-verified claim:
// after checking the payment reached the ZEROX wallet (same honest flow as
// /confirm-order — human-verified, not guessed), grants proportional credits.
router.post('/credit/topup', requireAdmin, json, async (req, res) => {
  const { address, usdc, ref } = req.body || {};
  if (!address) return res.status(400).json({ ok: false, error: 'address required' });
  if (!(Number(usdc) > 0)) return res.status(400).json({ ok: false, error: 'usdc amount required' });
  if (!ref) return res.status(400).json({ ok: false, error: 'ref required (idempotency key)' });
  try {
    const c = require('./lib/zerox-credits');
    const r = c.grant(address, usdc, String(ref), 'paybox-topup-claim');
    return res.json({ ok: true, ...r });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/paybox/agent-tip { buyerUserId, agentCodename, amountCredits } —
// settles a tip from a user into an agent's paybox ledger (5% fee, non-custodial).
// after debiting buyer, credits the agent's paybox balance under the same ledger.
// PIKADON pre-trade review: lightweight check on required fields.
router.post('/agent-tip', json, async (req, res) => {
  const { buyerUserId, agentCodename, amountCredits } = req.body || {};
  // Basic PIKADON review: verify required fields exist and amount is positive
  const reviewReasons = [];
  if (!buyerUserId) reviewReasons.push('missing buyerUserId');
  if (!agentCodename) reviewReasons.push('missing agentCodename');
  if (isNaN(amountCredits) || amountCredits <= 0) reviewReasons.push('invalid amountCredits');
  if (reviewReasons.length === 0) {
    // proceed to settle
  } else {
    return res.status(400).json({ ok: false, error: 'PIKADON review FAIL', reasons: reviewReasons });
  }
  if (!buyerUserId || !agentCodename || isNaN(amountCredits) || amountCredits <= 0) {
    return res.status(400).json({ ok: false, error: 'buyerUserId, agentCodename, amountCredits required' });
  }
  try {
    const result = await settle({
      user: String(buyerUserId),
      itemId: `agent:${String(agentCodename)}`,
      sellerAgent: String(agentCodename).toUpperCase(),
      amountCredits: Number(amountCredits),
      reason: 'agent-tip',
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.code || err.message || 'agent-tip failed' });
  }
});

module.exports = router;
module.exports.recordOrder = recordOrder;
module.exports.confirmOrder = confirmOrder;
