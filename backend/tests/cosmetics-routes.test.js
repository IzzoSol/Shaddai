const request = require('supertest');
const express = require('express');
const operatives = require('../lib/operatives');
const billing = require('../billing-service');

let app;
let opId;
const TEST_OWNER = 'test-cosmetics-owner';

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/cosmetics', require('../cosmetics-routes'));

  const op = operatives.create({ owner: TEST_OWNER, codename: 'COSMETICS-TEST-OP' });
  opId = op.id;
  await billing.getOrCreateCustomer(TEST_OWNER);
});

afterAll(() => {
  operatives.remove(opId);
});

describe('cosmetics routes', () => {
  test('GET /catalog returns the accessory list', async () => {
    const res = await request(app).get('/api/cosmetics/catalog');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.accessories)).toBe(true);
    expect(res.body.accessories.length).toBeGreaterThan(0);
  });

  test('POST /purchase with unknown accessory -> 404', async () => {
    const res = await request(app).post('/api/cosmetics/purchase').send({ operativeId: opId, accessoryId: 'does_not_exist' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('POST /purchase with unknown operative -> 404', async () => {
    const catalog = require('../../public/assets/accessories/catalog.json');
    const res = await request(app).post('/api/cosmetics/purchase').send({ operativeId: 'op_does_not_exist', accessoryId: catalog[0].id });
    expect(res.status).toBe(404);
  });

  test('POST /purchase with insufficient balance -> 402, not debited, not owned', async () => {
    const catalog = require('../../public/assets/accessories/catalog.json');
    const item = catalog.find(a => a.sparksPrice > 0) || catalog[0];
    const cust = billing.getCustomer(TEST_OWNER) || await billing.getOrCreateCustomer(TEST_OWNER);
    billing.debit(TEST_OWNER, cust.creditsRemaining || 0, 'test:drain'); // force balance to 0
    const res = await request(app).post('/api/cosmetics/purchase').send({ operativeId: opId, accessoryId: item.id });
    expect(res.status).toBe(402);
    expect(res.body.success).toBe(false);
    const op = operatives.get(opId);
    expect(op.inventory.cosmetics || []).not.toContain(item.id);
  });

  test('POST /purchase with sufficient balance -> debits Sparks, records ownership, idempotent on repeat', async () => {
    const catalog = require('../../public/assets/accessories/catalog.json');
    const item = catalog.find(a => a.sparksPrice > 0) || catalog[0];
    billing.credit(TEST_OWNER, item.sparksPrice + 100, 'test:topup'); // ensure enough balance

    const before = (billing.getCustomer(TEST_OWNER) || {}).creditsRemaining || 0;
    const res = await request(app).post('/api/cosmetics/purchase').send({ operativeId: opId, accessoryId: item.id });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.operative.inventory.cosmetics).toContain(item.id);
    const after = (billing.getCustomer(TEST_OWNER) || {}).creditsRemaining || 0;
    expect(before - after).toBe(item.sparksPrice);

    // repeat purchase — idempotent, no second debit
    const res2 = await request(app).post('/api/cosmetics/purchase').send({ operativeId: opId, accessoryId: item.id });
    expect(res2.status).toBe(200);
    expect(res2.body.note).toBe('already owned');
    const afterRepeat = (billing.getCustomer(TEST_OWNER) || {}).creditsRemaining || 0;
    expect(afterRepeat).toBe(after);
  });

  test('purchase preserves existing inventory.files/collectables (no wholesale overwrite)', async () => {
    operatives.update(opId, { inventory: { files: ['existing-file.txt'], collectables: ['card-1'], cosmetics: [] } });
    const catalog = require('../../public/assets/accessories/catalog.json');
    const item = catalog.find(a => a.sparksPrice === 0) || catalog[0];
    billing.credit(TEST_OWNER, 100000, 'test:topup2');
    await request(app).post('/api/cosmetics/purchase').send({ operativeId: opId, accessoryId: item.id });
    const op = operatives.get(opId);
    expect(op.inventory.files).toEqual(['existing-file.txt']);
    expect(op.inventory.collectables).toEqual(['card-1']);
  });
});
