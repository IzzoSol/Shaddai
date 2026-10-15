/* sparksCore.js — the ONE append-only Sparks ledger for the MMO/3D economy.
   It does NOT hold balances: the balance stays where it always was (char.currency.sparks in data/characters.json).
   Every server-side mutation of that number is recorded here, so faucets/sinks/burns become measurable:
     minted  = Sparks created (faucet)          burned = Sparks destroyed (sink; also the market commission + soft-gate fee)
   No on-chain code, no cash-out (treasury cash movement needs PIKADON sign-off; leave hooks only). */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'sparks-ledger.jsonl');
let seq = 0;

function ensure() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

/* low-level append. entry: { kind, characterId?, delta, balanceAfter?, minted?, burned?, ref?, note? } */
function record(entry) {
  ensure();
  const row = Object.assign({ id: Date.now().toString(36) + (seq++).toString(36), ts: Date.now(), characterId: null, delta: 0, minted: 0, burned: 0 }, entry);
  row.kind = String(row.kind || 'unknown').slice(0, 40);
  if (row.note) row.note = String(row.note).slice(0, 120);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

/* char already mutated by the caller (existing handlers do their own arithmetic); this records the change. */
function recordChange(char, delta, kind, meta) {
  const bal = char && char.currency ? char.currency.sparks : undefined;
  return record(Object.assign({ kind, characterId: char && char.id, delta, balanceAfter: bal, minted: delta > 0 ? delta : 0, burned: 0 }, meta || {}));
}
/* a sink whose Sparks vanish (purchase from the house, death penalty, market fees) */
function recordSink(char, amount, kind, meta) {
  const bal = char && char.currency ? char.currency.sparks : undefined;
  return record(Object.assign({ kind, characterId: char && char.id, delta: -amount, balanceAfter: bal, burned: amount, minted: 0 }, meta || {}));
}
/* Sparks destroyed with no single character attached (e.g. the market's 5% + soft-gate fee taken from a sale) */
function recordBurn(amount, kind, meta) { return record(Object.assign({ kind, delta: 0, burned: amount, minted: 0 }, meta || {})); }

function readAll() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  return fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
function forCharacter(characterId, limit) { const a = readAll().filter(r => r.characterId === characterId); return limit ? a.slice(-limit) : a; }
function summary(sinceTs) {
  const out = { entries: 0, minted: 0, burned: 0, net: 0, byKind: {} };
  readAll().forEach(r => {
    if (sinceTs && r.ts < sinceTs) return;
    out.entries++; out.minted += r.minted || 0; out.burned += r.burned || 0;
    const k = out.byKind[r.kind] = out.byKind[r.kind] || { count: 0, delta: 0, minted: 0, burned: 0 };
    k.count++; k.delta += r.delta || 0; k.minted += r.minted || 0; k.burned += r.burned || 0;
  });
  out.net = out.minted - out.burned; return out;
}
/* Sparks a character earned today from one faucet kind (used for server-side daily caps) */
function earnedToday(characterId, kind) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return readAll().filter(r => r.characterId === characterId && r.kind === kind && r.ts >= start.getTime() && r.delta > 0).reduce((s, r) => s + r.delta, 0);
}

module.exports = { DATA_DIR, LEDGER_FILE, record, recordChange, recordSink, recordBurn, readAll, forCharacter, summary, earnedToday };
