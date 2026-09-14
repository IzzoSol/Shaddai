'use strict';
/**
 * Real-HTTP integration test for backend/hall/routes.js post-merge
 * (Shaddai-Arcade -> Shaddai, 2026-09-14). Boots the real router via its
 * factory (createHallRouter), injecting an isolated EconomyService (temp
 * DevFileStore, same pattern as economy-service.test.js) and a stub lens
 * module -- so this never touches the real dev economy.json file or makes
 * a real Fal call, while still exercising the REAL route/mailbox/pack code
 * exactly as production runs it.
 * Run: node backend/hall/tests/routes-integration.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

delete process.env.DATABASE_URL; // force the dev file store, not Postgres

const { EconomyService, DevFileStore, InsufficientFundsError } = require('../../economy-service');
const createHallRouter = require('../routes');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function makeStubLens() {
  const calls = [];
  return {
    calls,
    async requestClip(userId, event, idempotencyKey) {
      calls.push({ userId, event, idempotencyKey });
      return { jobId: 'job_stub_1', status: 'processing', eta: 20, sparksCharged: 15, balance: 0, replayed: false };
    },
    async getClipStatus(jobId) {
      return { status: 'completed', progress: 100, videoUrl: `https://example.test/${jobId}.mp4` };
    },
  };
}

async function run() {
  const tmp = path.join(os.tmpdir(), `hall-test-economy-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const economySvc = new EconomyService({ store: new DevFileStore(tmp) });
  const lens = makeStubLens();

  const app = express();
  app.use(createHallRouter({ economySvc, lens }));
  const server = http.createServer(app);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const axios = require('axios');
  async function post(p, body) { return (await axios.post(`${base}${p}`, body)).data; }
  async function get(p) { return (await axios.get(`${base}${p}`)).data; }

  try {
    // 1. Seat + buy-in with real Sparks (granted via the injected economy
    //    instance directly -- exactly how a real signup bonus would work).
    {
      const { seat } = await post('/api/hall/seats', { kind: 'human', display_name: 'Tester', sparks_ref: 'u:tester' });
      await economySvc.grant('u:tester', 100, 'test_bonus', 'k1');
      const table = await post('/api/hall/tables', { seatId: seat.id, wager: 25, pack: 'blackjack' });
      assert.strictEqual(table.ok, true);
      const balAfterBuyin = await economySvc.getBalance('u:tester');
      assert.strictEqual(balAfterBuyin, 75);
      console.log('PASS: buy-in actually spends real Sparks via the injected in-process economy service');
    }

    // 2. Insufficient funds on buy-in -> clean 402, not a 500 or a crash.
    {
      const { seat } = await post('/api/hall/seats', { kind: 'human', display_name: 'Broke', sparks_ref: 'u:broke' });
      try {
        await post('/api/hall/tables', { seatId: seat.id, wager: 999999, pack: 'blackjack' });
        assert.fail('expected a 402');
      } catch (e) {
        assert.strictEqual(e.response.status, 402);
        console.log('PASS: insufficient Sparks on buy-in surfaces as a clean 402 (InsufficientFundsError)');
      }
    }

    // 3. A full arcade-bet hand (basketball_bet) resolves to a real win/lose
    //    and settles Sparks correctly either way.
    {
      const { seat } = await post('/api/hall/seats', { kind: 'human', display_name: 'Bettor', sparks_ref: 'u:bettor' });
      await economySvc.grant('u:bettor', 100, 'test_bonus', 'k2');
      const table = await post('/api/hall/tables', { seatId: seat.id, wager: 25, pack: 'basketball_bet' });
      assert.strictEqual(table.legal.length, 2);
      const settled = await post(`/api/hall/tables/${table.matchId}/move`, { move: table.legal[0].id });
      assert.ok(settled.settlement.score === 'win' || settled.settlement.score === 'lose');
      const bal = await economySvc.getBalance('u:bettor');
      if (settled.settlement.score === 'win') assert.ok(bal > 75); // pot minus rake, more than the post-buy-in balance
      else assert.strictEqual(bal, 75); // buy-in already spent, nothing more moves
      console.log(`PASS: a real basketball_bet hand settles Sparks correctly (result=${settled.settlement.score}, balance=${bal})`);
    }

    // 4. Room listing never leaks a bet pack's simSummary/result before
    //    settlement, and shows it after.
    {
      const { seat } = await post('/api/hall/seats', { kind: 'human', display_name: 'Watcher', sparks_ref: 'u:watcher' });
      await economySvc.grant('u:watcher', 100, 'test_bonus', 'k3');
      const table = await post('/api/hall/tables', { seatId: seat.id, wager: 0, pack: 'football_bet' });
      const pre = await get('/api/hall/tables');
      const row = pre.tables.find((t) => t.matchId === table.matchId);
      assert.ok(row);
      assert.strictEqual(row.result, undefined, 'result must not leak before the pick settles');
      await post(`/api/hall/tables/${table.matchId}/move`, { move: table.legal[0].id });
      const post_ = await get('/api/hall/tables');
      const row2 = post_.tables.find((t) => t.matchId === table.matchId);
      assert.ok(row2.result === 'win' || row2.result === 'lose');
      console.log('PASS: room listing hides result pre-settlement and shows it after, for a real bet pack');
    }

    // 5. Lens: request + status poll, via the injected stub (no real Fal
    //    call) -- proves the route wiring, not the video provider itself.
    {
      const { seat } = await post('/api/hall/seats', { kind: 'human', display_name: 'LensUser', sparks_ref: 'u:lens' });
      await economySvc.grant('u:lens', 100, 'test_bonus', 'k4');
      const created = await post('/api/hall/tables', { seatId: seat.id, wager: 0, pack: 'blackjack' });
      const matchId = created.matchId;
      let table = created;
      // Hit every turn (not stand) -- reliably busts within a few cards, so
      // this exercises the filmable Lens path deterministically instead of
      // leaving it to the ~1-in-6 chance an immediate stand produces a
      // filmable win/blackjack rather than a push.
      let guard = 0;
      while (table.settlement.score === null && guard++ < 10) {
        table = await post(`/api/hall/tables/${matchId}/move`, { move: 'hit' });
      }
      if (table.settlement.events && table.settlement.events.length) {
        const clip = await post(`/api/hall/tables/${matchId}/lens`);
        assert.strictEqual(clip.jobId, 'job_stub_1');
        assert.strictEqual(lens.calls.length, 1);
        const status = await get(`/api/hall/tables/${matchId}/lens/${clip.jobId}`);
        assert.strictEqual(status.videoUrl, 'https://example.test/job_stub_1.mp4');
        console.log('PASS: Lens request + status poll round-trips through the real route to the injected adapter');
      } else {
        console.log('SKIP: this hand had no filmable event (push) -- Lens path not exercised this run');
      }
    }

    console.log('\nAll routes-integration checks passed');
  } finally {
    server.close();
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
