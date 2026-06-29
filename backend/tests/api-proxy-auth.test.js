const request = require('supertest');
const express = require('express');

let app;
beforeAll(() => {
  process.env.REQUIRE_AUTH = 'true';
  app = express();
  app.use(express.json());
  app.use('/api', require('../api-proxy-routes'));
});
afterAll(() => { delete process.env.REQUIRE_AUTH; });

describe('api-proxy auth enforcement (REQUIRE_AUTH=true)', () => {
  test('DELETE custom skill without auth → 401', async () => {
    const res = await request(app).delete('/api/shaddai/skills/custom/abc');
    expect(res.status).toBe(401);
  });

  test('DELETE custom skill with x-user-id → not 401', async () => {
    const res = await request(app)
      .delete('/api/shaddai/skills/custom/abc')
      .set('x-user-id', 'u1');
    expect(res.status).not.toBe(401);
  });

  test('POST /execute-code without auth → 401', async () => {
    const res = await request(app).post('/api/execute-code').send({ code: '1+1' });
    expect(res.status).toBe(401);
  });
});
