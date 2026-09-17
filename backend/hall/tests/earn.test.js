'use strict';
/**
 * Unit tests for backend/hall/earn-store.js — the daily claim faucet + the
 * win-of-the-day streak ledger. No HTTP, no economy-service: this proves the
 * ledger math and durability in isolation. Route-level behavior (idempotent
 * economy keys, 401 guards) is covered by routes-integration.test.js.
 * Run: node backend/hall/tests/earn.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEarnStore, DAILY_SPARKS, WIN_BASE_SPARKS, STREAK_BONUS_STEP, STREAK_BONUS_MAX } = require('../earn-store');

const DAY_MS = 24 * 3600 * 1000; // full calendar-day shifts, so dayKey()'s local date truly advances

function tmpFile() {
  return path.join(os.tmpdir(), `hall-earn-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
}

function day(offset) { return new Date(Date.UTC(2026, 8, 17, 12) + offset * DAY_MS); }

async function run() {
  const file = tmpFile();
  try {
    // 1. Daily claim is once-per-day per uid, independent across uids.
    {
      const s1 = createEarnStore(file);
      const c1 = s1.claimDaily('u:alice', day(0));
      assert.deepStrictEqual(c1, { claimed: true, replayed: false, day: '2026-09-17', amount: DAILY_SPARKS });
      const c2 = s1.claimDaily('u:alice', day(0));
      assert.strictEqual(c2.claimed, false); assert.strictEqual(c2.replayed, true);
      const cBob = s1.claimDaily('u:bob', day(0));
      assert.strictEqual(cBob.claimed, true); // different uid, unaffected
      console.log(`PASS: daily claim once/day per uid (amount=${DAILY_SPARKS})`);
    }

    // 2. Same-day re-claim on a FRESH store instance replays (durable file).
    {
      const s2 = createEarnStore(file);
      const again = s2.claimDaily('u:alice', day(0));
      assert.strictEqual(again.replayed, true);
      console.log('PASS: earn ledger persists across store instances (JSON durability)');
    }

    // 3. First win: baseline bonus, streak = 1; same-day second win on a NEW
    //    match pays again but holds the streak at 1.
    {
      const f = tmpFile();
      const s = createEarnStore(f);
      const w1 = s.recordWin('u:carol', 'm1', day(0));
      assert.deepStrictEqual({ bonus: w1.bonus, streak: w1.streak }, { bonus: WIN_BASE_SPARKS, streak: 1 });
      const sameMatch = s.recordWin('u:carol', 'm1', day(0));
      assert.strictEqual(sameMatch.replayed, true); assert.strictEqual(sameMatch.bonus, 0);
      const w2 = s.recordWin('u:carol', 'm2', day(0));
      assert.strictEqual(w2.replayed, false);
      assert.strictEqual(w2.streak, 1); // same day: streak holds, doesn't inflate
      assert.strictEqual(w2.bonus, WIN_BASE_SPARKS);
      console.log('PASS: first win bonus, per-match idempotency, same-day streak holds');
    }

    // 4. Streak grows across consecutive days and caps the bonus term.
    {
      const f = tmpFile();
      const s = createEarnStore(f);
      s.recordWin('u:dave', 'd1', day(0));
      const w2 = s.recordWin('u:dave', 'd2', day(1));
      assert.strictEqual(w2.streak, 2);
      assert.strictEqual(w2.bonus, WIN_BASE_SPARKS + STREAK_BONUS_STEP);
      let d = day(2); let last;
      for (let i = 3; i <= 12; i++) { last = s.recordWin('u:dave', `d${i}`, d); d = day(i); }
      assert.strictEqual(last.streak, 12);
      assert.strictEqual(last.bonus, WIN_BASE_SPARKS + STREAK_BONUS_MAX); // capped, not unbounded
      console.log(`PASS: streak escalates then caps at bonus ${WIN_BASE_SPARKS + STREAK_BONUS_MAX}`);
    }

    // 5. A missed day resets the streak.
    {
      const f = tmpFile();
      const s = createEarnStore(f);
      s.recordWin('u:eve', 'e1', day(0));
      s.recordWin('u:eve', 'e2', day(1));
      const broken = s.recordWin('u:eve', 'e3', day(5)); // gap
      assert.strictEqual(broken.streak, 1);
      assert.strictEqual(broken.bonus, WIN_BASE_SPARKS);
      console.log('PASS: a gap day resets the winning streak');
    }

    // 6. get()/dayKey snapshots match the ledger (used to enrich /profile).
    {
      const f = tmpFile();
      const s = createEarnStore(f);
      s.claimDaily('u:fred', day(0));
      s.recordWin('u:fred', 'f1', day(0));
      const snap = s.get('u:fred');
      assert.strictEqual(snap.dailyClaimedToday, true);
      assert.strictEqual(snap.streak, 1);
      assert.strictEqual(snap.nextDailyMs > 0, true);
      assert.strictEqual(s.get('u:nobody').streak, 0);
      console.log('PASS: get() shape feeds the profile earn enrichment');
    }

    console.log('\nAll earn-store checks passed');
  } finally {
    try { fs.unlinkSync(file); } catch (_) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });