/**
 * cosmetics-routes.test.js — Forge character-kit cosmetics store.
 * Accessories were removed from the catalog (they didn't render on the forge
 * character), so the store now serves an empty shelf and every purchase is
 * rejected as an unknown accessory. Kept so the route stays honest if the
 * forge is ever re-skinned with a working accessory system.
 */
const express = require('express');
const request = require('supertest');
const routes = require('../cosmetics-routes');

function makeApp(userId) {
  const app = express();
  app.use(express.json());
  if (userId !== undefined) {
    app.use((req, _res, next) => { req.userId = userId; next(); });
  }
  app.use('/api/cosmetics', routes);
  return app;
}

describe('GET /api/cosmetics/catalog', () => {
  test('serves an empty accessory catalog (accessories removed)', async () => {
    const res = await request(makeApp('u1')).get('/api/cosmetics/catalog');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.accessories)).toBe(true);
    expect(res.body.accessories.length).toBe(0);
  });
});

describe('POST /api/cosmetics/purchase', () => {
  test('rejects any accessory purchase when the catalog is empty', async () => {
    const res = await request(makeApp('u1')).post('/api/cosmetics/purchase')
      .send({ operativeId: 'any', accessoryId: 'hat_crown' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unknown accessory');
  });
});