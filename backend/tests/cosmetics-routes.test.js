/**
 * cosmetics-routes.test.js — Forge character-kit cosmetics store.
 * Catalog serves the accessory file; purchase debits the operative owner's
 * Sparks (billing-service) and equips the accessory idempotently.
 */
const express = require('express');
const request = require('supertest');
const routes = require('../cosmetics-routes');
const operatives = require('../lib/operatives');
const billing = require('../billing-service');

function makeApp(userId) {
  const app = express();
  app.use(express.json());
  if (userId !== undefined) {
    app.use((req, _res, next) => { req.userId = userId; next(); });
  }
  app.use('/api/cosmetics', routes);
  return app;
}

let createdIds = [];
async function makeOperative(owner) {
  const op = operatives.create({ codename: 'CC' + Date.now() + Math.floor(Math.random() * 1e6) });
  if (owner !== undefined) operatives.update(op.id, { owner });
  createdIds.push(op.id);
  return operatives.get(op.id);
}
function startingBalance(owner) {
  const cust = billing.getCustomer(owner) || { creditsRemaining: 0 };
  return cust.creditsRemaining || 0;
}
function seedSparks(owner, amount) {
  try { billing.getOrCreateCustomer(owner); } catch (_) { /* dev: may already exist */ }
  billing.credit(owner, amount, 'test seed');
}

afterAll(() => {
  for (const id of createdIds) { try { operatives.remove(id); } catch (_) {} }
});

describe('GET /api/cosmetics/catalog', () => {
  test('serves the 9-item accessory catalog with slots + prices', async () => {
    const res = await request(makeApp('u1')).get('/api/cosmetics/catalog');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.accessories.length).toBe(9);
    const ids = res.body.accessories.map(a => a.id);
    for (const expectId of ['hat_crown', 'hat_horns', 'mask_visor', 'pet_drone', 'pet_wisp', 'weapon_axe', 'weapon_staff', 'wings_dark', 'wings_feather']) {
      expect(ids).toContain(expectId);
    }
    const wings = res.body.accessories.find(a => a.id === 'wings_dark');
    expect(wings.slot).toBe('wings');
    expect(wings.sparksPrice).toBe(160);
    expect(typeof wings.imageFile).toBe('string');
  });
});

describe('POST /api/cosmetics/purchase', () => {
  test('buys + equips a cosmetic for the named owner and debits Sparks', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const op = await makeOperative(owner);
    const start = startingBalance(owner);

    const res = await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'weapon_axe' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyOwned).toBe(false);
    expect(res.body.sparks).toBe(start - 50);   // weapon_axe = 50 sparks
    expect(res.body.operative.inventory.ownedCosmetics).toContain('weapon_axe');

    expect(billing.getCustomer(owner).creditsRemaining).toBe(start - 50);
  });

  test('is idempotent: repeat purchase is free and stays owned', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const op = await makeOperative(owner);
    const start = startingBalance(owner);

    await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'mask_visor' });
    const afterFirst = startingBalance(owner);

    const again = await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'mask_visor' });

    expect(again.status).toBe(200);
    expect(again.body.alreadyOwned).toBe(true);
    expect(again.body.sparks).toBe(afterFirst);  // unchanged after the repeat
  });

  test('rejects when the named operative belongs to someone else', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const op = await makeOperative(owner);

    const res = await request(makeApp('someone-else')).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'wings_dark' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not your operative');
  });

  test('rejects unauthenticated caller on a named operative', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const op = await makeOperative(owner);

    const res = await request(makeApp(undefined)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'wings_dark' });
    expect(res.status).toBe(401);
  });

  test('rejects with 429 when Sparks are short', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    // No customer record for this owner → zero Sparks → guaranteed shortfall.
    const op = await makeOperative(owner);

    const res = await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'wings_dark' });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('insufficient sparks');
  });

  test('400 for an unknown accessory', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const op = await makeOperative(owner);

    const res = await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: op.id, accessoryId: 'not-a-real-item' });
    expect(res.status).toBe(400);
  });

  test('404 for a missing operative', async () => {
    const owner = 'cosmetic-test-' + Math.floor(Math.random() * 1e7);
    seedSparks(owner, 1000);
    const res = await request(makeApp(owner)).post('/api/cosmetics/purchase')
      .send({ operativeId: 'does-not-exist', accessoryId: 'wings_dark' });
    expect(res.status).toBe(404);
  });
});