/*	zerox-credits.js — Ask-ZEROX usage credits.
 *
 *	ZEROX (revenue) + NEXUS (ledger) design, v1:
 *	  • Every confirmed Paybox payment credits the payer's wallet 1:1 (USDC → credit).
 *	  • Every Ask-ZEROX question spends exactly 1 credit (metered, predictable).
 *	  • Idempotent on `ref` so double-confirmation can never double-mint.
 *	  • Anti-hoard: per-address balance cap + per-7d grant cap (PIKADON guard).
 *	  • Credits never expire but go stale after 12 months of zero use (inactive
 *	    balances are lapsed, not burned — ZEROX can re-deploy them into the pool).
 *
 *	Data: backend/data/zerox-credits.json  (runtime — never committed; safe to stay dirty)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'zerox-credits.json');
const BALANCE_CAP = 10000;           // max credits one address can hold (no endless hoarding)
const GRANT_CAP_7D = 2000;           // max credits an address can receive per rolling 7 days
const INACTIVE_MS = 12 * 30 * 24 * 3600 * 1000;  // 12 months of zero use → lapse balance

function _read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function _write(db) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) { try { console.warn('[zerox-credits] write failed:', e && e.message); } catch (_) {} }
}
function _norm(addr) {
  return String(addr || '').trim().toLowerCase();
}
function _now() { return Date.now(); }

function _entry(db, addr) {
  if (!db[addr]) db[addr] = { balance: 0, ledger: [], updatedAt: _now() };
  return db[addr];
}

// grant(addr, amount, ref, kind) → { credited, balance } — idempotent on ref; capped.
function grant(addr, amount, ref, kind) {
  const a = _norm(addr);
  if (!/^[a-z0-9]{20,60}$/.test(a)) throw new Error('invalid address');
  const amt = Number(amount);
  if (!(amt > 0) || !isFinite(amt)) throw new Error('invalid amount');
  if (!ref || typeof ref !== 'string') throw new Error('ref required (idempotency key)');

  const db = _read();
  const entry = _entry(db, a);

  // idempotency: same (address, ref) never double-mints
  const existing = (entry.ledger || []).find(l => l.kind === 'grant' && l.ref === ref);
  if (existing) return { credited: 0, balance: round2(entry.balance) };

  // PIKADON anti-hoard: rolling 7-day grant cap
  const weekAgo = _now() - 7 * 24 * 3600 * 1000;
  const granted7d = (entry.ledger || [])
    .filter(l => l.kind === 'grant' && l.ts >= weekAgo)
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  if (granted7d + amt > GRANT_CAP_7D) throw new Error('weekly grant cap reached');

  const next = Math.min(round2(entry.balance + amt), BALANCE_CAP);
  entry.balance = next;
  entry.ledger.push({ kind: 'grant', ref: String(ref), amount: amt, ts: _now(), note: kind || 'paybox' });
  entry.updatedAt = _now();
  _write(db);
  return { credited: round2(amt), balance: next };
}

// spend(addr, amount) → true/false — atomic debit; false when the balance is short.
function spend(addr, amount) {
  const a = _norm(addr);
  const amt = Number(amount);
  if (!(amt > 0) || !isFinite(amt)) return false;
  const db = _read();
  const entry = db[a];
  if (!entry || (Number(entry.balance) || 0) < amt) return false;
  entry.balance = round2(Number(entry.balance) - amt);
  entry.ledger.push({ kind: 'spend', ref: 'ask_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), amount: amt, ts: _now() });
  entry.updatedAt = _now();
  _write(db);
  return true;
}

// balance(addr) → number
function balance(addr) {
  const a = _norm(addr);
  if (!a) return 0;
  const entry = _read()[a];
  if (!entry) return 0;
  // lapse inactive balances (no spend activity in 12 months)
  const last = (entry.ledger || []).filter(l => l.kind === 'spend').slice(-1)[0];
  if (last && (last.ts || 0) > 0 && (_now() - last.ts) > INACTIVE_MS) return 0;
  return Number(entry.balance) || 0;
}

function _round2(n) { return Math.round(Number(n) * 100) / 100; }
const round2 = _round2;

module.exports = { grant, spend, balance, BALANCE_CAP, GRANT_CAP_7D };