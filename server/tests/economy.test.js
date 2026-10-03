/* Economy tests (node --test server/tests/economy.test.js < /dev/null). Uses a temp data dir via SHADDAI_MMO_DATA, real express, real fetch. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-econ-'));
process.env.SHADDAI_MMO_DATA = TMP;
const express = require('express');
const core = require('../sparksCore');
const character = require('../characterServer');
const market = require('../marketServer');
const plot = require('../plotServer');
const sparks = require('../sparksRoutes');

let base, server;
const app = express(); app.use(express.json());
app.use('/character', character); app.use('/market', market); app.use('/plot', plot); app.use('/sparks', sparks);

test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); });

async function call(method, url, body, uid) {
  const h = { 'Content-Type': 'application/json' }; if (uid) h['x-user-id'] = uid;
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const CH = path.join(TMP, 'characters.json'), PL = path.join(TMP, 'plots.json'), SK = path.join(TMP, 'skills.json');
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8')), wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const spawn = async uid => (await call('POST', '/character/spawn', {}, uid)).body;

test('spawn links a character to x-user-id and is idempotent; guests get no server wallet', async () => {
  const a = await spawn('user-a'); assert.ok(a.characterId); assert.equal(a.character.currency.sparks, 100);
  const a2 = await spawn('user-a'); assert.equal(a2.characterId, a.characterId); assert.equal(a2.existing, true);
  const g = await call('GET', '/sparks/balance', null, 'guest-123'); assert.equal(g.status, 401);
  assert.equal((await call('GET', '/sparks/balance', null, 'local')).status, 401);
  assert.equal((await call('GET', '/sparks/balance')).status, 401);
  const bal = await call('GET', '/sparks/balance', null, 'user-a'); assert.equal(bal.body.balance, 100); assert.equal(bal.body.characterId, a.characterId);
});

test('spend is server-authoritative: debits, never goes negative, ignores forged amounts', async () => {
  await spawn('user-b');
  assert.equal((await call('POST', '/sparks/spend', { amount: 30, kind: 'ticket' }, 'user-b')).body.balance, 70);
  const bad = await call('POST', '/sparks/spend', { amount: 5000, kind: 'ticket' }, 'user-b'); assert.equal(bad.status, 400);
  assert.equal((await call('GET', '/sparks/balance', null, 'user-b')).body.balance, 70);
  assert.equal((await call('POST', '/sparks/spend', { amount: -5 }, 'user-b')).status, 400);
  assert.equal((await call('POST', '/sparks/spend', { amount: 'lots' }, 'user-b')).status, 400);
});

test('earn: only allow-listed game kinds, capped per call and per day (localStorage-style minting is refused)', async () => {
  await spawn('user-c');
  assert.equal((await call('POST', '/sparks/earn', { amount: 999999999, kind: 'tactics' }, 'user-c')).status, 400);
  assert.equal((await call('POST', '/sparks/earn', { amount: 10, kind: 'jackpot' }, 'user-c')).status, 403);
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/sparks/earn', { amount: 100, kind: 'tactics' }, 'user-c')).status, 200);
  const cap = await call('POST', '/sparks/earn', { amount: 100, kind: 'tactics' }, 'user-c'); assert.equal(cap.status, 429);
  assert.equal((await call('GET', '/sparks/balance', null, 'user-c')).body.balance, 500);
});

test('death penalty (10% of Sparks, dangerous only) is a ledgered sink', async () => {
  const c = await spawn('user-d'); const db = rd(CH); db[c.characterId].currency.sparks = 1000; wr(CH, db);
  const safe = await call('POST', '/character/die', { characterId: c.characterId, dangerous: false }); assert.equal(safe.body.sparksLost, 0);
  const r = await call('POST', '/character/die', { characterId: c.characterId, dangerous: true }); assert.equal(r.body.sparksLost, 100);
  assert.equal(rd(CH)[c.characterId].currency.sparks, 900);
  const e = core.forCharacter(c.characterId).filter(x => x.kind === 'death-penalty'); assert.equal(e.length, 1);
  assert.equal(e[0].delta, -100); assert.equal(e[0].burned, 100); assert.equal(e[0].balanceAfter, 900);
});

test('market burn is no longer silent: buyer debit + seller credit + explicit market-burn entry, and the books balance', async () => {
  const s = await spawn('seller'), b = await spawn('buyer');
  const db = rd(CH); db[s.characterId].inventory = { ore: 3 }; db[b.characterId].currency.sparks = 500; wr(CH, db);
  const sk = fs.existsSync(SK) ? rd(SK) : {};
  // give both a high Total Level so the 5-Sparks soft gate applies (TL >= 10) — build the shape summarize() expects by training via the route if possible
  fs.writeFileSync(SK, JSON.stringify(Object.assign(sk, {})));
  const skills = require('../skillsServer');
  const tlOf = id => skills.readTotalLevel(id);
  // seed skills.json with enough levels; fall back to reading the schema the server itself writes
  let seeded = false;
  for (const shape of [{ mining: { xp: 1e7 }, woodcutting: { xp: 1e7 }, fishing: { xp: 1e7 }, smithing: { xp: 1e7 } }, { mining: 1e7, woodcutting: 1e7, fishing: 1e7, smithing: 1e7 }, { skills: { mining: { xp: 1e7 }, woodcutting: { xp: 1e7 }, fishing: { xp: 1e7 }, smithing: { xp: 1e7 } } }]) {
    wr(SK, Object.assign(rd(SK), { [s.characterId]: shape, [b.characterId]: shape })); if (tlOf(s.characterId) >= 10) { seeded = true; break; }
  }
  assert.ok(seeded, 'could not seed Total Level >= 10 (skills.json shape changed?)');
  const l = await call('POST', '/market/listing', { ownerId: s.characterId, itemName: 'ore', price: 100 }); assert.equal(l.status, 200, JSON.stringify(l.body));
  const done = await call('POST', '/market/complete', { listingId: l.body.listing.id, buyerId: b.characterId, sellerId: s.characterId });
  assert.equal(done.status, 200, JSON.stringify(done.body)); assert.equal(done.body.commission, 5); assert.equal(done.body.softFee, 5); assert.equal(done.body.sellerNet, 90);
  const chars = rd(CH); assert.equal(chars[b.characterId].currency.sparks, 400); assert.equal(chars[s.characterId].currency.sparks, 190);
  const entries = core.readAll().filter(x => x.ref === l.body.listing.id);
  const by = k => entries.find(x => x.kind === k);
  assert.equal(by('market-buy').delta, -100); assert.equal(by('market-sale').delta, 90); assert.equal(by('market-burn').burned, 10);
  assert.equal(by('market-buy').delta + by('market-sale').delta + by('market-burn').burned, 0, 'ledger conserves: -100 + 90 + 10 burned');
  assert.equal(by('market-sale').minted, 0);
});

test('plot faucet: ~72/day per plot (was 1,728), 3-plot cap, fractional accrual is never forfeited', async () => {
  const c = await spawn('landlord'); const db = rd(CH); db[c.characterId].currency.sparks = 1000; wr(CH, db);
  for (const id of ['p1', 'p2', 'p3']) assert.equal((await call('POST', '/plot/buy', { characterId: c.characterId, plotId: id })).status, 200);
  const cap = await call('POST', '/plot/buy', { characterId: c.characterId, plotId: 'p4' }); assert.equal(cap.status, 409); assert.equal(cap.body.code, 'PLOT_CAP');
  assert.equal(rd(CH)[c.characterId].currency.sparks, 700);
  assert.equal((await call('POST', '/plot/assign', { characterId: c.characterId, plotId: 'p1', agentId: 'zerox' })).status, 200);
  // 24 h of banked yield = 72
  let pl = rd(PL); pl.p1.lastCollectAt = Date.now() - 24 * 3600 * 1000; wr(PL, pl);
  const day = await call('POST', '/plot/collect', { characterId: c.characterId, plotId: 'p1' }); assert.equal(day.body.yieldAmount, 72);
  // 7 days away still only banks 24 h
  pl = rd(PL); pl.p1.lastCollectAt = Date.now() - 7 * 24 * 3600 * 1000; wr(PL, pl);
  assert.equal((await call('POST', '/plot/collect', { characterId: c.characterId, plotId: 'p1' })).body.yieldAmount, 72);
  // fractional: 1000 s (0.83 Sparks) pays 0 but keeps the clock, so the remainder pays out later
  pl = rd(PL); const t0 = Date.now() - 1000 * 1000; pl.p1.lastCollectAt = t0; wr(PL, pl);
  assert.equal((await call('POST', '/plot/collect', { characterId: c.characterId, plotId: 'p1' })).body.yieldAmount, 0);
  assert.ok(Math.abs(rd(PL).p1.lastCollectAt - t0) < 50, 'clock must not reset when nothing was paid');
  pl = rd(PL); pl.p1.lastCollectAt = Date.now() - 1300 * 1000; wr(PL, pl);
  assert.equal((await call('POST', '/plot/collect', { characterId: c.characterId, plotId: 'p1' })).body.yieldAmount, 1);
  const kinds = core.forCharacter(c.characterId).map(x => x.kind); assert.ok(kinds.includes('plot-buy') && kinds.includes('plot-yield'));
});

test('vendor purchase: SERVER prices, real debit, item granted, forged price ignored', async () => {
  await spawn('fan');
  const ok = await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'nachos', price: 0 }, 'fan'); assert.equal(ok.status, 200); assert.equal(ok.body.price, 8); assert.equal(ok.body.balance, 92);
  assert.equal((await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'free-money' }, 'fan')).status, 400);
  assert.equal((await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'scarf' }, 'fan')).body.balance, 67);
  const db = rd(CH); const me = Object.values(db).find(c => c.userId === 'fan'); assert.equal(me.inventory.snack_nachos, 1); me.currency.sparks = 2; wr(CH, db);
  assert.equal((await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'scarf' }, 'fan')).status, 400);
});

test('summary reports minted vs burned by kind (the governance view)', async () => {
  const r = await call('GET', '/sparks/summary'); assert.equal(r.status, 200);
  const s = r.body.summary; assert.ok(s.burned >= 110 && s.minted > 0); assert.ok(s.byKind['market-burn'] && s.byKind['death-penalty'] && s.byKind['plot-yield']);
});
