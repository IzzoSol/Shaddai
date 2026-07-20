// x402-routes.js — off-chain credit ledger for SHADDAI World (x402 pay-per-call).
//   Hiring an agent, entering a paid portal, or unlocking premium debits credits here.
//   Off-chain now (USDC on Solana/Base later). 5% marketplace fee → treasury.
//   GET  /api/x402/balance?user=        — current credit balance
//   GET  /api/x402/txns?user=           — recent transactions
//   POST /api/x402/charge {user,amount,reason,payee}  — debit (402 if insufficient)
//   POST /api/x402/grant  {user,amount} — top-up credits (demo / purchase callback)
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();
const { requireAdmin, softAuth } = require('./auth-guard');
const X = require('./x402-security');   // Phase 0 #2: kill-switch / replay / budgets / PII-safe log

const LEDGER = path.join(__dirname, 'data', 'x402-ledger.json');
const START_CREDITS = 100;        // every new wallet starts with demo credits
const FEE_RATE = 0.05;            // 5% marketplace fee
const TREASURY = 'SHADDAI_TREASURY';

const read = () => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return { balances: {}, txns: [] }; } };
const write = (d) => { try { fs.writeFileSync(LEDGER, JSON.stringify(d, null, 2)); } catch (e) {} };
const bal = (db, u) => (u in db.balances ? db.balances[u] : (db.balances[u] = START_CREDITS));

router.get('/api/x402/balance', (req, res) => {
  const user = String(req.query.user || 'guest');
  const db = read(); const balance = bal(db, user); write(db);
  res.json({ ok: true, user, balance, currency: 'SHAD-Credits' });
});

router.get('/api/x402/txns', (req, res) => {
  const user = String(req.query.user || 'guest'); const db = read();
  const txns = db.txns.filter(t => t.user === user || t.payee === user).slice(0, 30);
  res.json({ ok: true, user, txns });
});

router.post('/api/x402/charge', softAuth, json, (req, res) => {
  // Anti-drain: a signed-in caller can ONLY charge their OWN account — never name a
  // victim in the body. body.user is a fallback for the unauthenticated demo world.
  const user = req.userId ? String(req.userId) : String((req.body && req.body.user) || 'guest');
  const { amount, reason, payee, nonce } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  // ── Phase 0 #2 hardening ──
  if (X.isPaused()) return res.status(503).json({ error: 'x402 payments temporarily paused', gated: true });
  if (nonce) { const rp = X.checkReplay('charge:' + user + ':' + nonce); if (!rp.ok) return res.status(409).json({ error: 'replay detected' }); }
  const bud = X.checkDailyBudget(user, amt);
  if (!bud.ok) return res.status(402).json({ error: 'daily spend limit reached', x402: { limit: bud.limit, spent: bud.spent, remaining: bud.remaining, currency: 'SHAD-Credits' }, gated: true });
  const db = read(); const balance = bal(db, user);
  if (balance < amt) {
    return res.status(402).json({ error: 'Insufficient SHAD-Credits.', x402: { required: amt, balance, currency: 'SHAD-Credits', topup: '/api/x402/grant' }, gated: true });
  }
  const fee = Math.round(amt * FEE_RATE * 100) / 100;
  const net = Math.round((amt - fee) * 100) / 100;
  db.balances[user] = Math.round((balance - amt) * 100) / 100;
  if (payee) db.balances[payee] = Math.round((bal(db, payee) + net) * 100) / 100; // payee receives net
  db.balances[TREASURY] = Math.round((bal(db, TREASURY) + fee) * 100) / 100;       // treasury takes the fee
  const tx = { id: Date.now().toString(36), user, payee: payee || null, amount: amt, fee, net, reason: reason || 'agent call', at: Date.now() };
  db.txns.unshift(tx); db.txns = db.txns.slice(0, 1000); write(db);
  X.recordSpend(user, amt);   // count against the daily budget
  res.json({ ok: true, charged: amt, fee, net, balance: db.balances[user], tx });
});

// Phase 0 #2: admin kill-switch for x402 (pause/resume all charges).
router.post('/api/x402/pause', requireAdmin, json, (req, res) => {
  const paused = X.setPaused(!!(req.body && req.body.paused));
  res.json({ ok: true, paused });
});

router.post('/api/x402/grant', requireAdmin, json, (req, res) => {
  const { user = 'guest', amount } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  const db = read(); db.balances[user] = Math.round((bal(db, user) + amt) * 100) / 100;
  db.txns.unshift({ id: Date.now().toString(36), user, amount: amt, reason: 'top-up', at: Date.now() }); write(db);
  res.json({ ok: true, user, balance: db.balances[user], granted: amt });
});

module.exports = router;
