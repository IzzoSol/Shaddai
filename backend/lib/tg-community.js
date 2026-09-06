// tg-community.js — SHADDAI Hall community engine.
//   • Games (native Telegram dice/dart/ball/bowl/slot/football + CPU arcade) with a
//     FREE paper currency (sparks). No real money, no withdraws, sums are cosmetic.
//   • Referral codes + leaderboards. Every /start ref_X claim is recorded once.
//   • Audited: outcomes are server-side only, writes are atomic (temp+rename),
//     all input sanitized, no trust in client numbers.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'tg-community.json');

const START_SPARKS = 200;
const DAILY_BONUS = 25;
const REF_INVITER_SPARKS = 100;
const REF_REFEREE_SPARKS = 50;
const REF_BONUS_ASKS = 2;         // extra free daily brain-answers per referee
const MAX_BET = 5000;             // hard cap so a typo can never nuke the store
const MIN_BET = 1;
const BET_COOLDOWN_MS = 8000;     // anti-grind: one bet per ~8s
const BET_RATE_MIN = 8;           // soft cap per minute (in-memory, cosmetic)
const CODE_RE = /^ref_[a-z0-9]{3,14}$/i;
const KEY_RE = /^[a-z0-9_:-]{1,64}$/i;

let _store = _read();
// in-memory anti-abuse (resets on restart; enforcing on paper sparks, not money)
const _settleTimes = new Map();   // uid -> [ts, ...last N]

function _today() { return new Date().toISOString().slice(0, 10); }

function _read() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // migrate legacy `gems` field → `sparks` (currency renamed to Sparks everywhere)
    if (s && s.users) for (const k of Object.keys(s.users)) {
      const u = s.users[k];
      if (u && u.gems != null && u.sparks == null) { u.sparks = u.gems; delete u.gems; }
    }
    return s;
  }
  catch (e) { return { users: {} }; }
}
function _write() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_store, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) { /* non-fatal */ }
}
function _uid(u) {
  const uid = String(u == null ? '' : u).trim();
  if (!uid || !KEY_RE.test(uid) || uid === 'anon' || uid === 'undefined' || uid === 'null') return '';
  return uid;
}
function _user(uid) {
  uid = _uid(uid); if (!uid) return null;
  let u = _store.users[uid];
  if (!u) { u = _store.users[uid] = { sparks: START_SPARKS, score: 0, streak: 0, best: 0, plays: 0, wins: 0, lastDay: '', bonused: 0, code: '', referredBy: '', referees: [], asksBonus: 0, audit: [] }; _write(); }
  return u;
}
// Read-only lookup — NEVER creates a record (safe on GET/read paths).
function _peek(uid) {
  uid = _uid(uid); if (!uid) return null;
  return _store.users[uid] || null;
}
function _audit(u, act, delta) {
  u.audit = u.audit || [];
  u.audit.push({ at: Date.now(), act, delta });
  if (u.audit.length > 50) u.audit = u.audit.slice(-50);
}

// ── sparks ───────────────────────────────────────────────────────────────────
function sparks(uid) { const u = _user(uid); return u ? { sparks: u.sparks, score: u.score, streak: u.streak, best: u.best, plays: u.plays, wins: u.wins, code: u.code, referredBy: u.referredBy, referees: (u.referees || []).length, asksBonus: u.asksBonus } : null; }

function dailyBonus(uid) {
  const u = _user(uid); if (!u) return { ok: false };
  const day = new Date().toISOString().slice(0, 10);
  if (u.lastDay === day) return { ok: false, message: 'already claimed today' };
  u.lastDay = day; u.sparks = (u.sparks || 0) + DAILY_BONUS; u.bonused = (u.bonused || 0) + 1;
  _audit(u, 'daily', +DAILY_BONUS); _write();
  return { ok: true, bonus: DAILY_BONUS, sparks: u.sparks };
}

// Win/lose application with full validation + audit. Returns settled result.
function settleBet(uid, stake, outcome) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  stake = Math.floor(Number(stake));
  if (!stake || stake < MIN_BET || stake > MAX_BET) return { ok: false, error: 'bet must be ' + MIN_BET + '–' + MAX_BET + ' sparks' };
  if (u.sparks < stake) return { ok: false, error: 'not enough sparks — you have ' + u.sparks };
  // anti-grind: in-memory cooldown + per-minute cap
  const now = Date.now();
  const hist = (_settleTimes.get(uid) || []).filter(ts => now - ts < 60000);
  if (now - (hist[hist.length - 1] || 0) < BET_COOLDOWN_MS) return { ok: false, cool: true, error: '🐢 easy, tiger — one roll at a time' };
  if (hist.length >= BET_RATE_MIN) return { ok: false, cool: true, error: '🐢 sparks recharge next minute — pace yourself' };
  hist.push(now); _settleTimes.set(uid, hist);
  // daily counters (lazy day-rollover)
  const day = _today();
  if (u.day !== day) { u.day = day; u.betCount = 0; u.winCount = 0; }
  const win = !!outcome.win;
  const payout = win ? Math.max(1, Math.floor(stake * outcome.mult)) : 0;
  const delta = win ? payout - stake : -stake;
  u.sparks += delta;
  u.plays = (u.plays || 0) + 1;
  u.betCount = (u.betCount || 0) + 1;
  u.score += win ? payout : 0;
  if (win) { u.wins = (u.wins || 0) + 1; u.streak = (u.streak || 0) + 1; u.winCount = (u.winCount || 0) + 1; }
  else u.streak = 0;
  if (u.score > u.best) u.best = u.score;
  _audit(u, outcome.game, delta);
  _write();
  return { ok: true, win, payout, delta, sparks: u.sparks, streak: u.streak, score: u.score, best: u.best, game: outcome.game, roll: outcome.roll, detail: outcome.detail, plays: u.plays, wins: u.wins };
}

// ── native Telegram dice outcomes (server trusts only OUR sendDice response) ──
// tiers: [[low, high, multiplier]] — first matching tier; multiplier 0 = loss.
const NATIVE_SPECS = {
  dice:  { emoji: '🎲', label: 'DICE',  tiers: [[6, 6, 3], [4, 5, 1.9]] },
  dart:  { emoji: '🎯', label: 'DARTS', tiers: [[6, 6, 3], [4, 5, 1.9]] },
  ball:  { emoji: '🏀', label: 'HOOPS', tiers: [[5, 5, 3], [4, 4, 2.4]] },
  bowl:  { emoji: '🎳', label: 'BOWL',  tiers: [[6, 6, 3], [4, 5, 1.9]] },
  slot:  { emoji: '🎰', label: 'SLOTS', tiers: [[64, 64, 8], [43, 43, 3], [22, 22, 1.5]] },
  footy: { emoji: '⚽', label: 'FOOTY', tiers: [[5, 5, 3], [3, 4, 1.9]] },
};
function nativeSpec(game) { return (NATIVE_SPECS[String(game).toLowerCase()] || {}).emoji ? NATIVE_SPECS[String(game).toLowerCase()] : null; }
function nativeResult(game, value) {
  const spec = nativeSpec(game); if (!spec) return null;
  value = Math.floor(Number(value));
  let mult = 0, detail = '😴 nothing';
  for (const [lo, hi, m] of (spec.tiers || [])) { if (value >= lo && value <= hi) { mult = m; break; } }
  const win = mult > 0;
  if (win) detail = (value === 6 || value === 64) ? '⭐ JACKPOT ' + spec.label + '!' : 'win on ' + spec.label;
  return { game: game, win, mult, roll: value, detail, emoji: spec.emoji, label: spec.label };
}

// CPU arcade battle (headless arcade-sim) — win ≈ double-up, deterministic odds per agent.
function arcadeResult(game, agent) {
  let sim = null;
  try { sim = require('./arcade-sim'); } catch (e) { sim = null; }
  const g = sim && sim.GAMES && sim.GAMES.includes(game) ? game : (sim && sim.GAMES ? sim.GAMES[0] : 'basketball');
  const a = String(agent || 'SHADDAI').toUpperCase();
  let out = { win: false, score: 0, summary: 'CPU won', roll: 0 };
  try { out = sim.play(g, a); } catch (e) {}
  return { game: 'arcade:' + g, win: !!out.win, mult: 2, roll: out.score, detail: (out.summary || 'battle').slice(0, 120), label: g.toUpperCase() };
}

// ── referral ────────────────────────────────────────────────────────────────
function codeFor(uid) {
  const u = _user(uid); if (!u) return null;
  if (u.code) return u.code;
  let base = 'ref_' + String(uid).replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || ('ref_' + crypto.randomBytes(3).toString('hex'));
  let code = base;
  let n = 1;
  const used = new Set(Object.values(_store.users).map(x => x.code).filter(Boolean));
  while (used.has(code)) { code = base + '_' + (n++); }
  u.code = code; _write();
  return code;
}
function linkFor(uid, botUsername) {
  const code = codeFor(uid); if (!code) return '';
  const u = String(botUsername || '').replace(/^@/, '').trim();
  return 'https://t.me/' + (u || process.env.SHADDAI_BOT_USERNAME || 'ShaddaiTempleBot') + '?start=' + code;
}
function claim(uid, rawCode) {
  const code = String(rawCode || '').trim();
  if (!CODE_RE.test(code)) return { ok: false, error: 'that is not a valid referral code' };
  const me = _user(uid); if (!me) return { ok: false, error: 'unknown user' };
  if (me.referredBy) return { ok: false, error: 'you already used a referral' };
  if (me.code === code) return { ok: false, error: "you can't invite yourself" };
  let inviter = null, inviterUid = '';
  for (const k of Object.keys(_store.users)) { if (_store.users[k].code === code) { inviter = _store.users[k]; inviterUid = k; break; } }
  if (!inviter || inviterUid === uid) return { ok: false, error: 'no such referral code' };
  me.referredBy = inviterUid;
  me.sparks += REF_REFEREE_SPARKS;
  inviter.referees = inviter.referees || [];
  if (!inviter.referees.includes(uid)) { inviter.referees.push(uid); }
  inviter.sparks += REF_INVITER_SPARKS;
  inviter.asksBonus = (inviter.asksBonus || 0) + REF_BONUS_ASKS;
  _audit(me, 'referral-in', +REF_REFEREE_SPARKS);
  _audit(inviter, 'referral-out', +REF_INVITER_SPARKS);
  _write();
  return { ok: true, inviterReferrers: inviter.referees.length, referrerSparks: inviter.sparks };
}
function referredBy(uid) { const u = _peek(uid); return u ? u.referredBy : ''; }
function bonusAsks(uid) { const u = _peek(uid); return u ? (u.asksBonus || 0) : 0; }
function invites(uid) { const u = _peek(uid); return u ? (u.referees || []).length : 0; }
function topReferrers(n) {
  return Object.entries(_store.users)
    .map(([uid, u]) => ({ uid, invites: (u.referees || []).length, sparks: u.sparks, code: u.code || '', asksBonus: u.asksBonus || 0 }))
    .filter(r => r.invites > 0)
    .sort((a, b) => b.invites - a.invites || b.sparks - a.sparks)
    .slice(0, Math.max(1, Math.min(20, Number(n) || 10)));
}
function topPlayers(n) {
  return Object.entries(_store.users)
    .map(([uid, u]) => ({ uid, score: u.score || 0, wins: u.wins || 0, plays: u.plays || 0, best: u.best || 0, sparks: u.sparks }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, Number(n) || 10)));
}

// ── daily quests, awards, stats ─────────────────────────────────────────────
// Quests: idempotent per day, evaluate from stored daily counters (no input trusts).
function quest(uid) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  const day = _today();
  if (u.questDay === day) return { ok: false, already: true, message: 'quests refill tomorrow', sparks: u.sparks };
  if (u.day !== day) { u.day = day; u.betCount = 0; u.winCount = 0; }
  const parts = [];
  if ((u.betCount || 0) >= 1) parts.push({ q: 'roll', bonus: 10, done: true, label: 'Place any bet' });
  if ((u.winCount || 0) >= 1) parts.push({ q: 'win', bonus: 20, done: true, label: 'Win any game' });
  if ((u.referees || []).length >= 1) parts.push({ q: 'invite', bonus: 25, done: true, label: 'Invite a friend' });
  if (!parts.length) return { ok: false, message: 'nothing complete yet — roll, win, or invite, then /quest to cash in', sparks: u.sparks };
  let bonus = 0; parts.forEach(p => { bonus += p.bonus; });
  u.sparks = (u.sparks || 0) + bonus;
  u.questDay = day;
  _audit(u, 'quest', +bonus); _write();
  return { ok: true, bonus, parts, sparks: u.sparks, message: 'quests complete!' };
}
// Non-game gem gift (e.g. music bot /community cross-awards). Small, capped.
function award(uid, amount, note) {
  const u = _user(uid); if (!u) return { ok: false };
  amount = Math.floor(Number(amount));
  if (!amount || amount < 1 || amount > 100) return { ok: false, error: 'award out of range 1–100' };
  u.sparks = (u.sparks || 0) + amount;
  _audit(u, 'award:' + (String(note || 'gift').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)), +amount);
  _write();
  return { ok: true, sparks: u.sparks, amount };
}
function stats() {
  let plays = 0, wins = 0, sparks = 0, referrers = 0, topScore = 0;
  for (const u of Object.values(_store.users)) {
    plays += u.plays || 0; wins += u.wins || 0; sparks += u.sparks || 0;
    if ((u.referees || []).length) referrers++;
    if ((u.score || 0) > topScore) topScore = u.score || 0;
  }
  return { users: Object.keys(_store.users).length, plays, wins, referrers, topScore, sparks };
}

// ── signals conviction economy ──────────────────────────────────────────────
// sparks-fueled conviction votes on signal calls ("skin-in-the-game" heat map).
// Sparks burn into pool (never paid back) — purely social signal, cosmetic.
const SYM_RE = /^[A-Z0-9$]{1,14}$/i;
const CONVICT_MAX = 2000;
function convict(uid, symbol, amount) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  symbol = String(symbol || '').trim().toUpperCase();
  if (!SYM_RE.test(symbol)) return { ok: false, error: 'SYMBOL must be letters/numbers/$ (max 14)' };
  amount = Math.floor(Number(amount));
  if (!amount || amount < 1 || amount > CONVICT_MAX) return { ok: false, error: 'amount must be 1–' + CONVICT_MAX + ' sparks' };
  if (u.sparks < amount) return { ok: false, error: 'not enough sparks — you have ' + u.sparks };
  const now = Date.now();
  const hist = (_settleTimes.get(uid) || []).filter(ts => now - ts < 60000); // shared anti-grind window
  if (now - (hist[hist.length - 1] || 0) < 4000) return { ok: false, cool: true, error: '🐢 one conviction vote every few seconds' };
  hist.push(now); _settleTimes.set(uid, hist);
  u.sparks -= amount;
  _store.top = _store.top || {};
  const t = _store.top[symbol] = _store.top[symbol] || { sparks: 0, votes: 0, last: now };
  t.sparks += amount; t.votes += 1; t.last = now;
  _audit(u, 'convict:' + symbol, -amount); _write();
  return { ok: true, symbol, amount, sparks: u.sparks, votes: t.votes, poolSparks: t.sparks };
}
function hot(n) {
  return Object.entries(_store.top || {}).map(([sym, t]) => ({ symbol: sym, sparks: t.sparks, votes: t.votes, last: t.last }))
    .sort((a, b) => b.sparks - a.sparks || b.votes - a.votes)
    .slice(0, Math.max(1, Math.min(20, Number(n) || 10)));
}

// ── agent-vs-agent arena ────────────────────────────────────────────────────
// Two of the Seven fight a scripted best-of-7 tilt. The caller gambles paper
// sparks on one side (first name listed = your pick). Deterministic per round,
// seeded on 60s buckets so it can't be instant-re-rolled.
const ARENA_BOTS = {
  ORACLE:  { tag: '🦉', atk: 0.55, def: 0.50, luck: 0.55, lore: 'reads every candle before it forms' },
  TURTLE:  { tag: '🐢', atk: 0.40, def: 0.75, luck: 0.60, lore: 'shields first — income, then strikes' },
  ZEROX:   { tag: '💸', atk: 0.75, def: 0.30, luck: 0.50, lore: 'all-in on the upside, hedges after' },
  NEXUS:   { tag: '⚙️', atk: 0.50, def: 0.65, luck: 0.45, lore: 'engineers the arc perfectly' },
  QUILL:   { tag: '✒️', atk: 0.45, def: 0.55, luck: 0.50, lore: 'writes your obituary first' },
  PIKADON: { tag: '🛡️', atk: 0.35, def: 0.85, luck: 0.40, lore: 'vets every move before it lands' },
  SHADDAI: { tag: '⬡',  atk: 0.70, def: 0.70, luck: 0.65, lore: 'coordinates the whole strike' },
};
const ARENA_ROUNDS = 7;
const ARENA_MIN_BET = 5;
const ARENA_MAX_BET = 200;
function _arenaHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function arena(uid, a, b, bet) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  a = String(a || '').toUpperCase().trim(); b = String(b || '').toUpperCase().trim();
  if (!ARENA_BOTS[a]) return { ok: false, error: 'unknown challenger <b>' + _esc(a) + '</b>' };
  if (!ARENA_BOTS[b]) return { ok: false, error: 'unknown challenger <b>' + _esc(b) + '</b>' };
  if (a === b) return { ok: false, error: 'a vs a? pick two different agents' };
  bet = Math.floor(Number(bet));
  if (!bet || bet < ARENA_MIN_BET || bet > ARENA_MAX_BET) return { ok: false, error: 'bet must be ' + ARENA_MIN_BET + '–' + ARENA_MAX_BET + ' sparks' };
  if (u.sparks < bet) return { ok: false, error: 'not enough sparks — you have ' + u.sparks };
  const bucket = Math.floor(Date.now() / 60000);
  const seed = bucket + ':' + uid + ':' + a + '-' + b;
  const A = ARENA_BOTS[a], B = ARENA_BOTS[b];
  let sa = 0, sb = 0, rounds = [];
  for (let i = 0; i < ARENA_ROUNDS; i++) {
    const ra = (_arenaHash(seed + ':' + i + ':a') % 1000) / 1000;
    const rb = (_arenaHash(seed + ':' + i + ':b') % 1000) / 1000;
    const pa = Math.floor(((A.atk * 0.6 + ra * 0.4) * 100) + A.luck * 18);
    const pb = Math.floor(((B.atk * 0.6 + rb * 0.4) * 100) + B.luck * 18);
    sa += pa; sb += pb;
    rounds.push({ r: i + 1, [a]: pa, [b]: pb, j: pa >= pb ? a : b });
  }
  const winA = sa !== sb ? sa > sb : A.luck >= B.luck;
  u.sparks -= bet;
  const payout = winA ? bet * 2 : 0;
  if (winA) u.sparks += payout;
  const bout = { ts: Date.now(), uid, a, b, bet, winA, winner: winA ? a : b, scoreA: sa, scoreB: sb, seed };
  _store.arena = _store.arena || { bouts: [] };
  _store.arena.bouts.unshift(bout);
  _store.arena.bouts = _store.arena.bouts.slice(0, 30);
  _audit(u, 'arena:' + a + '-v-' + b, winA ? +bet : -bet);
  _write();
  return { ok: true, a, b, scoreA: sa, scoreB: sb, winner: winA ? a : b, won: winA, bet, payout, sparks: u.sparks, rounds };
}
function arenaHistory(n) {
  return ((_store.arena || {}).bouts || []).slice(0, Math.max(1, Math.min(20, Number(n) || 10)));
}

module.exports = {
  sparks, dailyBonus, settleBet, nativeSpec, nativeResult, arcadeResult,
  codeFor, linkFor, claim, referredBy, bonusAsks, invites, topReferrers, topPlayers,
  quest, award, stats, convict, hot, arena, arenaHistory,
  START_SPARKS, DAILY_BONUS, REF_INVITER_SPARKS, REF_REFEREE_SPARKS, REF_BONUS_ASKS, ARENA_BOTS, ARENA_ROUNDS,
};