'use strict';
// paybox-settle.js — settle SHADDAI marketplace purchases into the selling AGENT's
// paybox, with a verifiable receipt/proof of task.
//
// This is a MERGE of two generations of this module:
//   • v2 (receipts-only) added idempotent per (user,itemId) receipts.
//   • v1 (ledger+escrow) provided the x402 credit ledger, 5% fee split, and the
//     job escrow rail (hold/release/refund) that /api/jobs and server-production use.
// Keeping BOTH means no caller breaks: settle() is idempotent AND still debits the
// buyer / credits the seller on the shared x402 ledger, and every legacy export
// (sellerBalance, listReceipts, resolveSkill, holdEscrow, releaseEscrow, refundEscrow,
// escrowFor, priceFor, rarityFor, hashStr, PayboxSettleError, FEE_RATE) remains intact.
//
//   await settle({ user, itemId, sellerAgent, amountCredits, reason, input, meta }) →
//     { ok, txId, charged, fee, net, buyerBalance, sellerBalance, receipt }
//   throws PayboxSettleError with .code/.status for the caller to map to HTTP.
//
// Non-custodial: it never moves real on-chain funds, only the in-app SHAD-Credits
// ledger (shared with x402-routes.js). No withdraw/cashout primitives exist by design.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEDGER = path.join(DATA_DIR, 'x402-ledger.json');
const RECEIPTS = path.join(DATA_DIR, 'paybox-receipts.json');
const ESCROW = path.join(DATA_DIR, 'x402-escrow.json');
const START_CREDITS = 100;   // matches x402-routes.js — every new user starts with demo credits
const FEE_RATE = 0.05;       // 5% marketplace fee

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- x402 credit ledger (shared with x402-routes.js) ---------------- */
function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')) || { balances: {}, txns: [] }; }
  catch (e) { return { balances: {}, txns: [] }; }
}
function writeLedger(d) {
  try { fs.writeFileSync(LEDGER, JSON.stringify(d, null, 2)); } catch (e) {}
}
function bal(db, u) { return (u in db.balances ? db.balances[u] : (db.balances[u] = START_CREDITS)); }
function r2(n) { return Math.round(n * 100) / 100; }

/* ---------------- receipts (array format, backward compatible) ---------------- */
function readReceipts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RECEIPTS, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed && parsed.receipts) || [];
  } catch (e) { return []; }
}
function writeReceipts(list) {
  try { fs.writeFileSync(RECEIPTS, JSON.stringify(list.slice(-2000), null, 2)); } catch (e) {}
}
function findReceipt(user, itemId) {
  return readReceipts().find(r => r.user === user && r.itemId === itemId) || null;
}
function generateReceiptId() { return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

class PayboxSettleError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ---------------- settle: idempotent buy (debit buyer, credit seller, receipt) ---------------- */
async function settle({ user, itemId, sellerAgent, amountCredits, reason, input, meta }) {
  const buyer = String(user || 'guest');
  const seller = String(sellerAgent || 'SHADDAI').toUpperCase();
  const amt = Number(amountCredits);
  if (!itemId) throw new PayboxSettleError('ITEM_REQUIRED', 400, 'itemId is required');
  if (!(amt > 0)) throw new PayboxSettleError('BAD_AMOUNT', 400, 'amountCredits must be a positive number');

  const existing = findReceipt(buyer, itemId);
  if (existing) {
    // Idempotent replay: return the original outcome without double-charging.
    return {
      ok: true,
      txId: existing.txId || 'pb_replay',
      charged: existing.amount != null ? existing.amount : existing.amountCredits,
      fee: existing.fee || 0,
      net: existing.net != null ? existing.net : (existing.amount || 0) - (existing.fee || 0),
      buyerBalance: bal(readLedger(), buyer),
      sellerBalance: sellerBalance(seller),
      receipt: existing,
      replayed: true,
    };
  }

  const db = readLedger();
  const buyerBalance = bal(db, buyer);
  if (buyerBalance < amt) {
    throw new PayboxSettleError('INSUFFICIENT_CREDITS', 402, `Insufficient SHAD-Credits: have ${buyerBalance}, need ${amt}`);
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

  const mergedMeta = Object.assign({}, meta || {});
  if (input !== undefined) mergedMeta.input = input;

  const receipt = {
    id: generateReceiptId(),
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
    meta: Object.keys(mergedMeta).length ? mergedMeta : null,
  };
  const receipts = readReceipts();
  receipts.push(receipt);
  writeReceipts(receipts);

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

/* ---------------- balance + receipts queries (legacy) ---------------- */
function sellerBalance(sellerAgent) {
  const seller = String(sellerAgent || 'SHADDAI').toUpperCase();
  return bal(readLedger(), seller);
}
function getReceipt(receiptId) {
  return readReceipts().find(r => r.id === receiptId) || null;
}
function listReceipts(user) {
  return readReceipts().filter(r => !user || r.user === user);
}

/* ---------------- job escrow rail (legacy) ---------------- */
function readEscrow() {
  try { return JSON.parse(fs.readFileSync(ESCROW, 'utf8')) || { holds: {} }; }
  catch (e) { return { holds: {} }; }
}
function writeEscrow(d) {
  try { fs.mkdirSync(path.dirname(ESCROW), { recursive: true }); fs.writeFileSync(ESCROW, JSON.stringify(d, null, 2)); } catch (e) {}
}

async function holdEscrow({ buyer, jobId, amountCredits, reason }) {
  const user = String(buyer || 'guest');
  const amt = Number(amountCredits);
  if (!jobId) throw new PayboxSettleError('JOB_REQUIRED', 400, 'jobId is required');
  if (!(amt > 0)) throw new PayboxSettleError('BAD_AMOUNT', 400, 'amountCredits must be a positive number');

  const db = readLedger();
  const balance = bal(db, user);
  if (balance < amt) {
    throw new PayboxSettleError('INSUFFICIENT_CREDITS', 402, `Insufficient SHAD-Credits to hold escrow: have ${balance}, need ${amt}`);
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

function escrowFor(jobId) {
  return readEscrow().holds[jobId] || null;
}

/* ---------------- deterministic skill pricing (legacy, mirrors skills-market) ---------------- */
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
  START_CREDITS,
};