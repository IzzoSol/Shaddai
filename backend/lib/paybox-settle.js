// paybox-settle.js — settle SHADDAI marketplace purchases into the selling AGENT's
// paybox. The pattern: the BUYER is debited (x402 ledger = in-app credits), and the
// SELLING AGENT's paybox balance (same x402 ledger, keyed by agent name) is credited
// with the net. This is the in-app representation of "they pay our agents' paybox" —
// the real external wallet receive side is handled by the MoonPay checkout links on
// /api/paybox; here we close the loop on SHADDAI's own ledgers so every purchase is
// (a) paid for before work runs, and (b) has a verifiable receipt/proof of task.
//
//   await settle({ user, itemId, amountCredits, sellerAgent, reason, input }) →
//     { ok, txId, charged, fee, net, sellerBalance, receipt }
//   throw PayboxSettleError with .code and .status for the caller to map to HTTP.
//
// This module is non-custodial: it never moves real on-chain funds. It only moves
// entries on SHADDAI's own credit ledger, consistent with the existing x402 system
// and the closed-loop economy (no withdraw/cashout primitives exist by design).

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const LEDGER = path.join(__dirname, '..', 'data', 'x402-ledger.json');
const RECEIPTS = path.join(__dirname, '..', 'data', 'paybox-receipts.json');
const FEE_RATE = 0.05;

function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); }
  catch (e) { return { balances: {}, txns: [] }; }
}
function writeLedger(d) {
  try { fs.writeFileSync(LEDGER, JSON.stringify(d, null, 2)); } catch (e) {}
}
function bal(db, u) {
  return (u in db.balances ? db.balances[u] : (db.balances[u] = 100));
}

function readReceipts() {
  try { return JSON.parse(fs.readFileSync(RECEIPTS, 'utf8')); }
  catch (e) { return []; }
}
function writeReceipts(list) {
  fs.mkdirSync(path.dirname(RECEIPTS), { recursive: true });
  try { fs.writeFileSync(RECEIPTS, JSON.stringify(list, null, 2)); } catch (e) {}
}
function r2(n) { return Math.round(n * 100) / 100; }

class PayboxSettleError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Debit the buyer, credit the selling agent's paybox ledger, and write a
 * verifiable receipt/proof-of-task. Throws PayboxSettleError on insufficient
 * funds (402) or invalid input (400). Returns the settled transaction.
 */
async function settle({ user, itemId, sellerAgent, amountCredits, reason, input, meta }) {
  const buyer = String(user || 'guest');
  const seller = String(sellerAgent || 'SHADDAI').toUpperCase();
  const amt = Number(amountCredits);
  if (!itemId) throw new PayboxSettleError('ITEM_REQUIRED', 400, 'itemId is required');
  if (!(amt > 0)) throw new PayboxSettleError('BAD_AMOUNT', 400, 'amountCredits must be a positive number');

  const db = readLedger();
  const buyerBalance = bal(db, buyer);
  if (buyerBalance < amt) {
    throw new PayboxSettleError(
      'INSUFFICIENT_CREDITS', 402,
      `Insufficient SHAD-Credits: have ${buyerBalance}, need ${amt}`
    );
  }

  const fee = r2(amt * FEE_RATE);
  const net = r2(amt - fee);
  db.balances[buyer] = r2(buyerBalance - amt);
  db.balances[seller] = r2(bal(db, seller) + net);

  const tx = {
    id: 'pb_' + Date.now().toString(36),
    user: buyer,
    payee: seller,
    itemId: String(itemId),
    amount: amt,
    fee,
    net,
    reason: reason || ('skill:' + itemId),
    at: Date.now(),
  };
  db.txns.unshift(tx);
  db.txns = db.txns.slice(0, 2000);
  writeLedger(db);

  // Verifiable receipt / proof of task — the buyer's copy and the seller's proof.
  const receipt = {
    id: 'r_' + Date.now().toString(36),
    txId: tx.id,
    user: buyer,
    seller,
    itemId: String(itemId),
    amount: amt,
    fee,
    net,
    reason: tx.reason,
    receiptAt: new Date().toISOString(),
    atUs: Date.now(),
    meta: meta || null,
  };
  const receipts = readReceipts();
  receipts.push(receipt);
  writeReceipts(receipts.slice(-2000));

  return {
    ok: true,
    txId: tx.id,
    charged: amt,
    fee,
    net,
    buyerBalance: db.balances[buyer],
    sellerBalance: db.balances[seller],
    receipt,
  };
}

/**
 * Read the selling agent's current paybox (ledger) balance, plus a receipt by id.
 */
function sellerBalance(sellerAgent) {
  const seller = String(sellerAgent || 'SHADDAI').toUpperCase();
  const db = readLedger();
  return db.balances[seller] != null ? db.balances[seller] : bal(db, seller);
}
function getReceipt(receiptId) {
  return readReceipts().find(r => r.id === receiptId) || null;
}
function listReceipts(user) {
  return readReceipts().filter(r => !user || r.user === user);
}

// ── Job escrow (holds the buyer's funds OUT of their spendable balance while a
//    job is in progress; released to the working agent on completion, refunded on
//    cancellation). Uses the same x402 ledger, keyed by balance + an escrow map, so
//    escrowed funds are not double-spendable and the ledger stays the single truth.
//    Conversion: 1 SHAD-Credit = $0.001, so a job priced in USD holds reward*1000.
const ESCROW_FILE = path.join(__dirname, '..', 'data', 'x402-escrow.json');
function readEscrow() {
  try { return JSON.parse(fs.readFileSync(ESCROW_FILE, 'utf8')); }
  catch (e) { return { holds: {} }; }
}
function writeEscrow(d) {
  fs.mkdirSync(path.dirname(ESCROW_FILE), { recursive: true });
  try { fs.writeFileSync(ESCROW_FILE, JSON.stringify(d, null, 2)); } catch (e) {}
}

/**
 * Hold escrow for a job: move `amountCredits` from the buyer's spendable balance
 * into the job's reserved escrow. Throws PayboxSettleError(402) if insufficient.
 */
async function holdEscrow({ buyer, jobId, amountCredits, reason }) {
  const user = String(buyer || 'guest');
  const amt = Number(amountCredits);
  if (!jobId) throw new PayboxSettleError('JOB_REQUIRED', 400, 'jobId is required');
  if (!(amt > 0)) throw new PayboxSettleError('BAD_AMOUNT', 400, 'amountCredits must be a positive number');

  const db = readLedger();
  const balance = bal(db, user);
  if (balance < amt) {
    throw new PayboxSettleError(
      'INSUFFICIENT_CREDITS', 402,
      `Insufficient SHAD-Credits to hold escrow: have ${balance}, need ${amt}`
    );
  }
  db.balances[user] = r2(balance - amt);
  writeLedger(db);

  const esc = readEscrow();
  esc.holds[jobId] = {
    buyer: user,
    amount: amt,
    status: 'held',
    reason: reason || ('job:' + jobId),
    heldAt: Date.now(),
  };
  writeEscrow(esc);

  return { ok: true, jobId, buyer: user, held: amt, remainingBalance: db.balances[user] };
}

/**
 * Release escrow to the working agent (job completed): move the hold into the
 * agent's spendable paybox balance. No-op + false if the job has no hold.
 */
async function releaseEscrow({ jobId, toAgent }) {
  const esc = readEscrow();
  const hold = esc.holds[jobId];
  if (!hold || hold.status !== 'held') return { ok: false, released: false };
  const agent = String(toAgent || 'SHADDAI').toUpperCase();

  const db = readLedger();
  db.balances[agent] = r2(bal(db, agent) + hold.amount);
  writeLedger(db);

  hold.status = 'released';
  hold.releasedTo = agent;
  hold.releasedAt = Date.now();
  esc.holds[jobId] = hold;
  writeEscrow(esc);

  return { ok: true, released: true, jobId, toAgent: agent, amount: hold.amount };
}

/** Refund escrow back to the buyer (job cancelled). No-op + false if no hold. */
async function refundEscrow({ jobId }) {
  const esc = readEscrow();
  const hold = esc.holds[jobId];
  if (!hold || hold.status !== 'held') return { ok: false, refunded: false };

  const db = readLedger();
  db.balances[hold.buyer] = r2(bal(db, hold.buyer) + hold.amount);
  writeLedger(db);

  hold.status = 'refunded';
  hold.refundedAt = Date.now();
  esc.holds[jobId] = hold;
  writeEscrow(esc);

  return { ok: true, refunded: true, jobId, toBuyer: hold.buyer, amount: hold.amount };
}

/** Inspect a job's escrow hold (for gating award/execute). */
function escrowFor(jobId) {
  const esc = readEscrow();
  return esc.holds[jobId] || null;
}

// ── deterministic market pricing (mirrors skills-market-routes.js) ─────────
// Skills in the catalog are priced 5–40 credits by a stable hash of their id,
// bucketed into common/rare/legendary rarity; a skill's seller is its owning
// agent (upper-cased, defaulting to SHADDAI). Keeping this here (instead of
// duplicating the hash) means the public run gate and the market checkout price
// the same skill identically.
function hashStr(s) {
  let h = 2166136261;
  s = String(s || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
function priceFor(id) { return 5 + (hashStr('price:' + id) % 36); }
function rarityFor(price) { return price >= 30 ? 'legendary' : (price >= 18 ? 'rare' : 'common'); }

/**
 * Resolve a skill's marketplace pricing + seller, OR null for any skill that
 * should be treated as free (i.e. not sold through the bazaar). Every priced
 * skill must be paid for before it runs, via settle().
 */
function resolveSkill(skill) {
  if (!skill || !skill.id) return null;
  const price = priceFor(skill.id);
  if (price <= 0) return null;
  const seller = (skill.agent && String(skill.agent).toUpperCase()) || 'SHADDAI';
  return {
    id: skill.id,
    priceCredits: price,
    sellerAgent: seller,
    rarity: rarityFor(price),
    category: String(skill.category || skill.type || skill.name || 'skill').toLowerCase(),
  };
}

module.exports = {
  settle,
  sellerBalance,
  getReceipt,
  listReceipts,
  resolveSkill,
  priceFor,
  rarityFor,
  hashStr,
  holdEscrow,
  releaseEscrow,
  refundEscrow,
  escrowFor,
  PayboxSettleError,
  FEE_RATE,
};
