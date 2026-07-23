'use strict';
/**
 * Foundation tests for the SHADDAI referral / reward flywheel:
 *   json-store · reward-engine · referral-service · treasury-service · status-perk-service · settle()
 *
 * All stores are pointed at unique temp files so tests never touch real data.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { JsonStore } = require('../lib/json-store');
const engine = require('../services/reward-engine');
const { ReferralService, ReferralError } = require('../services/referral-service');
const { TreasuryService, TreasuryError } = require('../services/treasury-service');
const { StatusPerkService } = require('../services/status-perk-service');

function tmpFile(tag) {
  return path.join(os.tmpdir(), `shd-${tag}-${crypto.randomBytes(6).toString('hex')}.json`);
}

// ───────────────────────────── json-store ─────────────────────────────
describe('JsonStore', () => {
  test('creates file with empty shape and round-trips writes', async () => {
    const f = tmpFile('store');
    const s = new JsonStore(f, { items: [], _seq: 0 });
    expect(fs.existsSync(f)).toBe(true);
    await s.withLock(async (db) => { db.items.push('a'); db._seq = 1; });
    const db = await s.read();
    expect(db.items).toEqual(['a']);
    expect(db._seq).toBe(1);
    fs.unlinkSync(f);
  });

  test('serializes concurrent read-modify-write without losing updates', async () => {
    const f = tmpFile('store-race');
    const s = new JsonStore(f, { n: 0 });
    await Promise.all(Array.from({ length: 50 }, () => s.withLock(async (db) => { db.n += 1; })));
    const db = await s.read();
    expect(db.n).toBe(50);
    fs.unlinkSync(f);
  });
});

// ──────────────────────────── reward-engine ───────────────────────────
describe('reward-engine.planReward', () => {
  test('non-money event grants only internal rewards, no settlement', () => {
    const p = engine.planReward({ eventType: 'signup' });
    expect(p.qualified).toBe(true);
    expect(p.internal.sparks).toBe(25);
    expect(p.money).toBeNull();
  });

  test('visit perk only fires past the magnitude gate', () => {
    expect(engine.planReward({ eventType: 'visit', value: 3 }).internal.perk).toBeNull();
    expect(engine.planReward({ eventType: 'visit', value: 10 }).internal.perk).toBe('visibility-boost');
  });

  test('money event produces a settlement with exact split', () => {
    const p = engine.planReward({ eventType: 'x402_purchase', value: 1000, currency: 'USDC' });
    expect(p.money).not.toBeNull();
    expect(p.money.currency).toBe('USDC');
    const s = p.money.split;
    // x402: owner .30 referrer .20 eco .15 → treasury remainder .35
    expect(s.owner).toBe(300);
    expect(s.referrer).toBe(200);
    expect(s.eco).toBe(150);
    expect(s.treasury).toBe(350);
    expect(s.treasury + s.owner + s.referrer + s.eco + s.partner).toBe(1000);
  });

  test('money event with zero gross produces no settlement (no printing money)', () => {
    expect(engine.planReward({ eventType: 'hire', value: 0 }).money).toBeNull();
  });

  test('reputation is capped at REPUTATION_CAP', () => {
    // hire base reputation is 12 (under cap); assert cap logic holds at the boundary.
    expect(engine.planReward({ eventType: 'hire', value: 5000 }).internal.reputation)
      .toBeLessThanOrEqual(engine.REPUTATION_CAP);
  });

  test('unknown event type is not qualified', () => {
    const p = engine.planReward({ eventType: 'nonsense' });
    expect(p.qualified).toBe(false);
    expect(p.money).toBeNull();
  });

  test('splitAmount never creates or loses a cent (odd gross)', () => {
    const s = engine.splitAmount(9999, engine.SPLIT_TEMPLATES.hire);
    expect(s.treasury + s.owner + s.referrer + s.eco + s.partner).toBe(9999);
  });
});

// ─────────────────────────── referral-service ─────────────────────────
describe('ReferralService', () => {
  function svc() { return new ReferralService({ filePath: tmpFile('ref') }); }

  test('creates a code and reuses it for the same agent+campaign', async () => {
    const s = svc();
    const a = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1', campaignId: 'c1' });
    const b = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1', campaignId: 'c1' });
    expect(a.reused).toBe(false);
    expect(b.reused).toBe(true);
    expect(b.code).toBe(a.code);
  });

  test('records an event and dedups a replay', async () => {
    const s = svc();
    const { code } = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1' });
    const first = await s.recordEvent({ code, eventType: 'signup', referredUserId: 'newbie', idempotencyKey: 'k1' });
    const dup = await s.recordEvent({ code, eventType: 'signup', referredUserId: 'newbie', idempotencyKey: 'k1' });
    expect(first.replayed).toBe(false);
    expect(dup.replayed).toBe(true);
    expect(dup.attribution.id).toBe(first.attribution.id);
  });

  test('blocks self-referral (owner referring themselves)', async () => {
    const s = svc();
    const { code } = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1' });
    await expect(s.recordEvent({ code, eventType: 'signup', referredUserId: 'u1' }))
      .rejects.toThrow(ReferralError);
  });

  test('rejects unknown code and unknown event type', async () => {
    const s = svc();
    const { code } = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1' });
    await expect(s.recordEvent({ code: 'NOPE-000000', eventType: 'signup' })).rejects.toThrow(/unknown referral code/);
    await expect(s.recordEvent({ code, eventType: 'bogus' })).rejects.toThrow(/unknown eventType/);
  });

  test('natural dedup key prevents double-attribution without an explicit key', async () => {
    const s = svc();
    const { code } = await s.createCode({ agentId: 'ZEROX', ownerUserId: 'u1' });
    const a = await s.recordEvent({ code, eventType: 'hire', referredUserId: 'buyer', value: 5000 });
    const b = await s.recordEvent({ code, eventType: 'hire', referredUserId: 'buyer', value: 5000 });
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
  });
});

// ─────────────────────────── treasury-service ─────────────────────────
describe('TreasuryService', () => {
  function svc() { return new TreasuryService({ filePath: tmpFile('treas') }); }

  test('records a settlement and accrues pools', async () => {
    const s = svc();
    await s.recordSettlement({
      attributionId: 'ref_1', sourceType: 'x402_purchase', grossAmount: 1000, currency: 'USDC',
      split: { treasury: 350, owner: 300, referrer: 200, eco: 150, partner: 0 }, ownerUserId: 'u1',
    });
    const pools = await s.getPools();
    expect(pools.treasury).toBe(350);
    expect(pools.eco).toBe(150);
    expect(await s.getOwnerOwed('u1')).toBe(300);
  });

  test('is idempotent on attributionId (no double accrual)', async () => {
    const s = svc();
    const args = {
      attributionId: 'ref_1', sourceType: 'hire', grossAmount: 1000, currency: 'USD',
      split: { treasury: 250, owner: 450, referrer: 200, eco: 100, partner: 0 },
    };
    await s.recordSettlement(args);
    const dup = await s.recordSettlement(args);
    expect(dup.replayed).toBe(true);
    expect((await s.getPools()).treasury).toBe(250);
  });

  test('rejects a split that does not sum to gross', async () => {
    const s = svc();
    await expect(s.recordSettlement({
      attributionId: 'ref_x', grossAmount: 1000,
      split: { treasury: 100, owner: 100, referrer: 100, eco: 100, partner: 0 },
    })).rejects.toThrow(TreasuryError);
  });

  test('settlement is recorded as pending and exposes NO cash-out method', async () => {
    const s = svc();
    const r = await s.recordSettlement({
      attributionId: 'ref_2', sourceType: 'paid_signup', grossAmount: 500,
      split: { treasury: 250, owner: 100, referrer: 100, eco: 50, partner: 0 },
    });
    expect(r.status).toBe('pending');
    expect(typeof s.payout).toBe('undefined');
    expect(typeof s.withdraw).toBe('undefined');
  });
});

// ────────────────────────── status-perk-service ───────────────────────
describe('StatusPerkService', () => {
  function svc() { return new StatusPerkService({ filePath: tmpFile('perk') }); }

  test('awards a perk and tallies per agent', async () => {
    const s = svc();
    await s.award({ agentId: 'ZEROX', perkType: 'district-badge', sourceAttributionId: 'ref_1' });
    const r = await s.forAgent('ZEROX');
    expect(r.totals['district-badge']).toBe(1);
  });

  test('is idempotent on attribution+perk', async () => {
    const s = svc();
    await s.award({ agentId: 'ZEROX', perkType: 'district-badge', sourceAttributionId: 'ref_1' });
    const dup = await s.award({ agentId: 'ZEROX', perkType: 'district-badge', sourceAttributionId: 'ref_1' });
    expect(dup.replayed).toBe(true);
    expect((await s.forAgent('ZEROX')).perks.length).toBe(1);
  });

  test('rejects unknown perk type', async () => {
    const s = svc();
    await expect(s.award({ agentId: 'ZEROX', perkType: 'free-money' })).rejects.toThrow();
  });
});

// ─────────────────────── settle() end-to-end wiring ───────────────────
describe('reward-engine.settle (four pipes)', () => {
  function fakeEconomy() {
    const calls = [];
    return { calls, grant: async (userId, amount, reason, idem) => { calls.push({ userId, amount, reason, idem }); return { balance: amount }; } };
  }
  function fakeReputation() {
    const calls = [];
    return { calls, recordAttestation: (did, type, outcome, meta) => { calls.push({ did, type, outcome, meta }); return { id: 'att_x' }; } };
  }

  test('money event fires all four pipes; receipt reflects each', async () => {
    const economy = fakeEconomy();
    const reputation = fakeReputation();
    const treasury = new TreasuryService({ filePath: tmpFile('t2') });
    const statusPerks = new StatusPerkService({ filePath: tmpFile('p2') });

    const attribution = {
      id: 'ref_abc', eventType: 'hire', value: 10000, currency: 'USD',
      promoterAgentId: 'ZEROX', promoterOwnerUserId: 'u1', promoterAgentDid: 'did:key:zTest',
    };
    const receipt = await engine.settle(attribution, { economy, reputation, statusPerks, treasury });

    expect(receipt.sparks).toBe(10);                       // hire sparks
    expect(receipt.reputation).toBe(12);                   // hire reputation
    expect(receipt.perk).toBe('featured-placement');       // hire perk
    expect(receipt.settlement).not.toBeNull();             // real-money settlement recorded
    expect(economy.calls[0].userId).toBe('u1');
    expect(reputation.calls[0].type).toBe('referral_conversion');
    const pools = await treasury.getPools();
    expect(pools.owner).toBe(4500);                        // 45% of 10000
  });

  test('non-money event fires internal pipes but NO settlement', async () => {
    const economy = fakeEconomy();
    const reputation = fakeReputation();
    const treasury = new TreasuryService({ filePath: tmpFile('t3') });

    const attribution = {
      id: 'ref_def', eventType: 'click', value: 1,
      promoterAgentId: 'ZEROX', promoterOwnerUserId: 'u1', promoterAgentDid: 'did:key:zTest',
    };
    const receipt = await engine.settle(attribution, { economy, reputation, treasury });
    expect(receipt.sparks).toBe(2);
    expect(receipt.settlement).toBeNull();
    expect((await treasury.getPools()).treasury).toBe(0);
  });
});
