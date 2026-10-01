// server/lib/ledger.js — ONE place that moves Sparks for agents / jobs, so the standalone MMO server and the production backend never keep two economies.
//   SHADDAI_LEDGER=economy -> backend/economy-service.js (the production closed-loop ledger: idempotent, Postgres or atomic file; no cash-out)
//   default ('mmo')        -> server/data/characters.json + sparksCore (standalone dev server / tests)
// API: balance(uid) · debit(uid, amount, kind, ref, key?) · credit(uid, amount, kind, ref, key?) · burn(amount, kind, ref)   (debit/credit resolve {ok, balance} | {ok:false, why})
const path = require('path');
const sparksCore = require('../sparksCore');
const { readJson, writeJsonAtomic, withLock } = require('./atomic');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, '..', 'data');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
const mode = () => (process.env.SHADDAI_LEDGER === 'economy' ? 'economy' : 'mmo');
let svc = null;
function econ() { if (!svc) svc = require('../../backend/economy-service').getDefault(); return svc; }
function charOf(db, uid) { return Object.values(db).find(c => c.userId === uid) || null; }

async function balance(uid) {
  if (mode() === 'economy') { const b = await econ().getBalance(uid); return typeof b === 'number' ? b : (b && b.balance) || 0; }
  const c = charOf(readJson(CHARS_FILE, {}), uid); return c ? ((c.currency || {}).sparks || 0) : 0;
}
async function debit(uid, amount, kind, ref, key) {
  amount = Math.round(amount); if (!(amount > 0)) return { ok: false, why: 'invalid amount' };
  if (mode() === 'economy') { try { await econ().spend(uid, amount, kind + (ref ? ':' + ref : ''), key || (kind + ':' + ref + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7))); return { ok: true, balance: await balance(uid) }; } catch (e) { return { ok: false, why: /insufficient/i.test(String(e && (e.name || e.message))) ? 'not enough Sparks (' + amount + ')' : String(e && e.message || e) }; } }
  return withLock('chars', async () => { const db = readJson(CHARS_FILE, {}), c = charOf(db, uid); if (!c) return { ok: false, why: 'create a character first' }; c.currency = c.currency || { sparks: 0 }; if ((c.currency.sparks || 0) < amount) return { ok: false, why: 'not enough Sparks (' + amount + ')' }; c.currency.sparks -= amount; writeJsonAtomic(CHARS_FILE, db); sparksCore.recordSink(c, amount, kind, { ref }); return { ok: true, balance: c.currency.sparks }; });
}
async function credit(uid, amount, kind, ref, key) {
  amount = Math.round(amount); if (!(amount > 0)) return { ok: false, why: 'invalid amount' };
  if (mode() === 'economy') { try { await econ().grant(uid, amount, kind + (ref ? ':' + ref : ''), key || (kind + ':' + ref + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7))); return { ok: true, balance: await balance(uid) }; } catch (e) { return { ok: false, why: String(e && e.message || e) }; } }
  return withLock('chars', async () => { const db = readJson(CHARS_FILE, {}), c = charOf(db, uid); if (!c) return { ok: false, why: 'recipient has no character' }; c.currency = c.currency || { sparks: 0 }; c.currency.sparks = (c.currency.sparks || 0) + amount; writeJsonAtomic(CHARS_FILE, db); sparksCore.recordChange(c, amount, kind, { ref }); return { ok: true, balance: c.currency.sparks }; });
}
function burn(amount, kind, ref) { try { sparksCore.recordBurn(amount, kind, { ref }); } catch (e) { } }

module.exports = { mode, balance, debit, credit, burn, _setService: function (x) { svc = x; } };   // _setService: tests inject an isolated economy store
