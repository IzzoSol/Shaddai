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
const { createEarnStore } = require('../earn-store');
const { createArcadeArt } = require('../arcade-art');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function makeStubLens() {
  const calls = [];
  return {
    calls,
    async requestClip(userId, event, idempotencyKey) {
      calls.push({ userId, event, idempotencyKey });
      // Mirrors fal's real submit: the adapter returns the queue status URL as
      // jobId. The route must translate that into an opaque path-safe key.
      return { jobId: 'https://queue.fal.run/fal-ai/kling-video/requests/deadbeef/status', status: 'processing', eta: 20, sparksCharged: 15, balance: 0, replayed: false };
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
  const earnFile = path.join(os.tmpdir(), `hall-test-earn-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const earn = createEarnStore(earnFile);
  const artDir = path.join(os.tmpdir(), `hall-test-art-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const arcadeArt = createArcadeArt({ cacheDir: artDir, provider: { async generateSafe() { return { buffer: TINY_PNG, provider: 'stub' }; } } });

  const app = express();
  app.use(createHallRouter({ economySvc, lens, earn, arcadeArt }));
  const server = http.createServer(app);
  let server2 = null;
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const axios = require('axios');
  async function post(p, body) { return (await axios.post(`${base}${p}`, body)).data; }
  async function get(p, cfg) { return (await axios.get(`${base}${p}`, cfg || {})).data; }

  try {
    // 1. Seat + buy-in with real Sparks (granted via the injected economy
    //    instance directly -- exactly how a real signup bonus would work).
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Tester', sparks_ref: 'u:tester' });
      await economySvc.grant('u:tester', 100, 'test_bonus', 'k1');
      const table = await post('/api/casino/tables', { seatId: seat.id, wager: 25, pack: 'blackjack' });
      assert.strictEqual(table.ok, true);
      const balAfterBuyin = await economySvc.getBalance('u:tester');
      assert.strictEqual(balAfterBuyin, 75);
      console.log('PASS: buy-in actually spends real Sparks via the injected in-process economy service');
    }

    // 2. Insufficient funds on buy-in -> clean 402, not a 500 or a crash.
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Broke', sparks_ref: 'u:broke' });
      try {
        await post('/api/casino/tables', { seatId: seat.id, wager: 999999, pack: 'blackjack' });
        assert.fail('expected a 402');
      } catch (e) {
        assert.strictEqual(e.response.status, 402);
        console.log('PASS: insufficient Sparks on buy-in surfaces as a clean 402 (InsufficientFundsError)');
      }
    }

    // 3. A full arcade-bet hand (basketball_bet) resolves to a real win/lose
    //    and settles Sparks correctly either way.
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Bettor', sparks_ref: 'u:bettor' });
      await economySvc.grant('u:bettor', 100, 'test_bonus', 'k2');
      const table = await post('/api/casino/tables', { seatId: seat.id, wager: 25, pack: 'basketball_bet' });
      assert.strictEqual(table.legal.length, 2);
      const settled = await post(`/api/casino/tables/${table.matchId}/move`, { move: table.legal[0].id });
      assert.ok(settled.settlement.score === 'win' || settled.settlement.score === 'lose');
      const bal = await economySvc.getBalance('u:bettor');
      if (settled.settlement.score === 'win') assert.ok(bal > 75); // pot minus rake, more than the post-buy-in balance
      else assert.strictEqual(bal, 75); // buy-in already spent, nothing more moves
      console.log(`PASS: a real basketball_bet hand settles Sparks correctly (result=${settled.settlement.score}, balance=${bal})`);
    }

    // 4. Room listing never leaks a bet pack's simSummary/result before
    //    settlement, and shows it after.
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Watcher', sparks_ref: 'u:watcher' });
      await economySvc.grant('u:watcher', 100, 'test_bonus', 'k3');
      const table = await post('/api/casino/tables', { seatId: seat.id, wager: 0, pack: 'football_bet' });
      const pre = await get('/api/casino/tables');
      const row = pre.tables.find((t) => t.matchId === table.matchId);
      assert.ok(row);
      assert.strictEqual(row.result, undefined, 'result must not leak before the pick settles');
      await post(`/api/casino/tables/${table.matchId}/move`, { move: table.legal[0].id });
      const post_ = await get('/api/casino/tables');
      const row2 = post_.tables.find((t) => t.matchId === table.matchId);
      assert.ok(row2.result === 'win' || row2.result === 'lose');
      console.log('PASS: room listing hides result pre-settlement and shows it after, for a real bet pack');
    }

    // 5. Lens: request + status poll, via the injected stub (no real Fal
    //    call) -- proves the route wiring, not the video provider itself.
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'LensUser', sparks_ref: 'u:lens' });
      await economySvc.grant('u:lens', 100, 'test_bonus', 'k4');
      const created = await post('/api/casino/tables', { seatId: seat.id, wager: 0, pack: 'blackjack' });
      const matchId = created.matchId;
      let table = created;
      // Hit every turn (not stand) -- reliably busts within a few cards, so
      // this exercises the filmable Lens path deterministically instead of
      // leaving it to the ~1-in-6 chance an immediate stand produces a
      // filmable win/blackjack rather than a push.
      let guard = 0;
      while (table.settlement.score === null && guard++ < 10) {
        table = await post(`/api/casino/tables/${matchId}/move`, { move: 'hit' });
      }
      if (table.settlement.events && table.settlement.events.length) {
        const clip = await post(`/api/casino/tables/${matchId}/lens`);
        assert.match(clip.jobId, /^lens_[0-9a-f]{12}$/, 'status URL must be stashed behind an opaque path-safe jobId');
        assert.strictEqual(lens.calls.length, 1);
        const status = await get(`/api/casino/tables/${matchId}/lens/${clip.jobId}`);
        assert.ok(status.videoUrl.includes('queue.fal.run/fal-ai/kling-video/requests/deadbeef/status.mp4'), 'poll must resolve the opaque key back to the real status URL');
        console.log('PASS: Lens request + status poll round-trips through the real route to the injected adapter');
      } else {
        console.log('SKIP: this hand had no filmable event (push) -- Lens path not exercised this run');
      }
    }

    // 6. Earn: GET /api/casino/earn/daily claims once per identity, replays
    //    without re-minting, and the profile reports it. Uses the off-production
    //    x-user-id identity path (softAuth), same as profile.
    {
      const hdr = { headers: { 'x-user-id': 'u:earner' } };
      const c1 = await get('/api/casino/earn/daily', hdr);
      assert.strictEqual(c1.ok, true); assert.strictEqual(c1.claimed, true);
      assert.strictEqual(c1.amount, 25); assert.strictEqual(c1.balance, 25);
      const c2 = await get('/api/casino/earn/daily', hdr);
      assert.strictEqual(c2.claimed, false); assert.strictEqual(c2.replayed, true);
      assert.strictEqual(c2.balance, 25);
      const profile = await get('/api/casino/profile', hdr);
      assert.strictEqual(profile.earn.dailyClaimedToday, true);
      assert.ok(profile.earn.nextDailyMs > 0, 'profile must expose the next-claim countdown');
      try { await get('/api/casino/earn/daily'); assert.fail('expected a 401 without identity'); } catch (e) { assert.strictEqual(e.response.status, 401); }
      console.log('PASS: earn daily route claims once per identity, replays safe, profile + 401 guard correct');
    }

    // 7. Menu art: unknown pack 404, known pack serves the injected stub PNG
    //    (JSON meta + raw=1 bytes). No HF key, no real network.
    {
      try { await get('/api/casino/art?pack=nope'); assert.fail('expected a 404'); } catch (e) { assert.strictEqual(e.response.status, 404); }
      const meta = await get('/api/casino/art?pack=hall&w=96&h=96');
      assert.strictEqual(meta.ok, true);
      assert.ok(meta.url.includes('/api/casino/art?pack=hall'), 'meta carries a self-URL for <img src>');
      assert.strictEqual(meta.width, 96);
      const raw = await axios.get(`${base}${meta.url}`, { responseType: 'arraybuffer' });
      assert.strictEqual(raw.headers['content-type'], 'image/png');
      assert.ok(Buffer.isBuffer(raw.data) && raw.data.length > 0, 'raw=1 streams PNG bytes');
      console.log('PASS: menu art route gates unknown packs (404) and serves meta + raw PNG');
    }

    // 8. Injected economies stay coherent with the REAL lens adapter: when a
    //    custom economySvc is injected, the router binds the lens to it
    //    (createLens). Driving the no-FAL_KEY 503 DISABLED path proves the
    //    spend + refund both hit the INJECTED store (net-zero), never the
    //    default economy.
    {
      const defaultLens = require('../lens-adapter');
      const app2 = express();
      app2.use(createHallRouter({ economySvc, earn, arcadeArt, lens: defaultLens.createLens({ economy: economySvc }) }));
      server2 = http.createServer(app2);
      const port2 = await listen(server2);
      const base2 = `http://127.0.0.1:${port2}`;
      const post2 = (p, b) => axios.post(`${base2}${p}`, b).then((x) => x.data);
      const get2 = (p) => axios.get(`${base2}${p}`).then((x) => x.data);
      const { seat } = await post2('/api/casino/seats', { kind: 'human', display_name: 'Coherent', sparks_ref: 'u:coherent' });
      await economySvc.grant('u:coherent', 100, 'test_bonus', 'k8');
      const created8 = await post2('/api/casino/tables', { seatId: seat.id, wager: 0, pack: 'blackjack' });
      let t8 = created8, g8 = 0;
      while (t8.settlement && t8.settlement.score === null && g8++ < 10) {
        t8 = await post2(`/api/casino/tables/${created8.matchId}/move`, { move: 'hit' });
      }
      const balPre = await economySvc.getBalance('u:coherent');
      if (t8.settlement.events && t8.settlement.events.length) {
        try { await post2(`/api/casino/tables/${created8.matchId}/lens`); assert.fail('expected 503 DISABLED without FAL_KEY'); }
        catch (e) { assert.strictEqual(e.response.status, 503); assert.strictEqual(e.response.data.code, 'DISABLED'); }
        const balPost = await economySvc.getBalance('u:coherent');
        assert.ok(Math.abs(balPost - balPre) <= 5, `lens spend+refund must net ~0 on the INJECTED store (pre=${balPre} post=${balPost})`);
        console.log('PASS: bound lens spends+refunds on the injected economy (503 DISABLED, net-zero)');
      } else {
        console.log('SKIP: no filmable event on this hand -- coherence check not exercised this run');
      }
    }

    // 9. SKATE: a real solo-vs-house match plays end to end through the HTTP
    //    route, auto-filled with a 'bot' seat (skate.js declares minSeats:2,
    //    no real matchmaking exists yet). Also the regression check for the
    //    match.pack mislabeling bug (routes.js used to store `pack.key ||
    //    'blackjack'`, and skate.js never set `.key`, so every skate match
    //    was silently treated as blackjack on every lookup after creation).
    {
      const { seat } = await post('/api/casino/seats', { kind: 'human', display_name: 'Skater', sparks_ref: 'u:skater' });
      await economySvc.grant('u:skater', 100, 'test_bonus', 'k9');
      const created = await post('/api/casino/tables', { seatId: seat.id, wager: 0, pack: 'skate' });
      assert.strictEqual(created.ok, true);
      assert.strictEqual(created.legal.length, 3, 'skate always offers 3 blind style buttons while a round is open');

      const fetched = await get(`/api/casino/tables/${created.matchId}`);
      assert.strictEqual(fetched.state.pack, 'skate', 'BUG REGRESSION: match.pack must be "skate", not "blackjack"');

      let table = created, guard = 0;
      while (table.state.phase !== 'settled' && guard++ < 30) {
        const legal = table.legal.length ? table.legal : (await get(`/api/casino/tables/${created.matchId}`)).legal;
        table = await post(`/api/casino/tables/${created.matchId}/move`, { move: legal[0].id });
      }
      assert.strictEqual(table.state.phase, 'settled', 'a real skate match must settle within a bounded number of rounds');
      assert.ok(['win', 'lose', 'push'].includes(table.settlement.score));
      console.log(`PASS: a real skate-vs-bot match plays end to end via HTTP and settles (result=${table.settlement.score})`);
    }

    console.log('\nAll routes-integration checks passed');
  } finally {
    server.close();
    if (server2) server2.close();
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {}
    try { fs.unlinkSync(earnFile); } catch (_) {}
    try { fs.rmSync(artDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
