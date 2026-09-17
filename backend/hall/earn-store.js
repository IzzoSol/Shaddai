'use strict';
/**
 * backend/hall/earn-store.js — durable Sparks earn-loop ledger for the Hall.
 * Two mechanoics feed a player who tilts the house:
 *
 *   • Daily claim  — a one-per-calendar-day faucet (idempotent on its own
 *     economy key `hall:daily:<uid>:<day>`, so the grant can never double).
 *   • Win of the day — every settled win/bj grants a bonus that scales with
 *     your winning-day streak. Streak = consecutive calendar days with a win;
 *     two wins on the SAME day hold the streak (they don't inflate it). Streak
 *     is durable across restarts (plain JSON file, same dev-store convention as
 *     economy-service's DevFileStore and agent-room's per-uid save files).
 *
 * Security posture mirrors the rest of the Hall: identity is an opaque string
 * (Firebase uid or the off-production x-user-id), and every grant ultimately
 * goes through economy.grant() with an idempotency key, so even a replayed /
 * concurrent claim can never mint Sparks twice.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'hall-earn.json');

const DAILY_SPARKS = 25;      // daily claim faucet
const WIN_BASE_SPARKS = 5;    // baseline win-of-the-day bonus
const STREAK_BONUS_STEP = 2;  // +2 per consecutive winning day
const STREAK_BONUS_MAX = 15;  // ceiling on the streak term (bonus caps at 5+15=20)

function pad(n) { return String(n).padStart(2, '0'); }

function dayKey(now = Date.now()) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(key, delta) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d); // local calendar day (matches dayKey's local components)
  t.setDate(t.getDate() + delta);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function msUntilNextDay(claimedDay) {
  const next = new Date(shiftDay(claimedDay, 1) + 'T00:00:00');
  const ms = next.getTime() - Date.now();
  return ms > 0 ? ms : 0;
}

/**
 * createEarnStore(file?) — factory (matches economy-service's own factory +
 * injected-file test convention). Read-on-every-call dev file store.
 */
function createEarnStore(file = DEFAULT_FILE) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { return {}; }
  };
  const write = (data) => {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (_) { /* dev store — a failed write must not crash the game */ }
  };

  return {
    file,
    DAILY_SPARKS, WIN_BASE_SPARKS, STREAK_BONUS_MAX,
    dayKey,

    // Pure read of a uid's earn snapshot — never mutates the store.
    get(uid) {
      const e = read()[String(uid)] || {};
      const today = dayKey();
      return {
        streak: e.streak || 0,
        lastWinDay: e.lastWinDay || null,
        dailyClaimed: e.dailyClaimed || null,
        dailyClaimedToday: e.dailyClaimed === today,
        nextDailyMs: e.dailyClaimed ? msUntilNextDay(e.dailyClaimed) : 0,
      };
    },

    // Claim today's faucet. Returns { claimed, replayed, day, amount }.
    claimDaily(uid, now = new Date()) {
      const data = read();
      const e = (data[String(uid)] = data[String(uid)] || {});
      const today = dayKey(now);
      if (e.dailyClaimed === today) return { claimed: false, replayed: true, day: today, amount: DAILY_SPARKS };
      e.dailyClaimed = today;
      write(data);
      return { claimed: true, replayed: false, day: today, amount: DAILY_SPARKS };
    },

    // Record a settled win for a match. Returns { bonus, streak, replayed }.
    // The caller is responsible for granting `bonus` via economy.grant with a
    // per-uid-per-match key (`hall:win:<uid>:<matchId>`) so a replay can't
    // double-pay even if the ledger file is tampered with or cleared.
    recordWin(uid, matchId, now = new Date()) {
      const data = read();
      const e = (data[String(uid)] = data[String(uid)] || {});
      if (e.matches && e.matches[matchId]) return { bonus: 0, streak: e.streak || 0, replayed: true };
      const today = dayKey(now);
      if (e.streak && e.lastWinDay === today) {
        // same-day win: hold the streak, do not inflate it
      } else if (e.streak && e.lastWinDay === shiftDay(today, -1)) {
        e.streak += 1; // consecutive winning day
      } else {
        e.streak = 1;  // first win, or the streak was broken by a gap
      }
      e.lastWinDay = today;
      e.matches = e.matches || {};
      e.matches[matchId] = true;
      write(data);
      const term = Math.min((e.streak - 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX);
      return { bonus: WIN_BASE_SPARKS + term, streak: e.streak, replayed: false };
    },
  };
}

module.exports = { createEarnStore, DAILY_SPARKS, WIN_BASE_SPARKS, STREAK_BONUS_STEP, STREAK_BONUS_MAX, DEFAULT_FILE };