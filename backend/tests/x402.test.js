const x402 = require('../lib/x402');

function mockRes() {
  return {
    code: null, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}

describe('x402 discovery', () => {
  test('returns x402Version + endpoints with expected fields', () => {
    const d = x402.discovery();
    expect(d.x402Version).toBe(1);
    expect(Array.isArray(d.endpoints)).toBe(true);
    expect(d.endpoints.length).toBeGreaterThan(0);
    const e = d.endpoints[0];
    expect(e).toHaveProperty('resource');
    expect(e).toHaveProperty('path');
    expect(e).toHaveProperty('priceUsd');
    expect(e).toHaveProperty('network');
  });
});

describe('requirePayment middleware', () => {
  afterEach(() => { delete process.env.X402_ENABLED; delete process.env.X402_FACILITATOR_URL; });

  test('is a no-op (free) when X402_ENABLED is unset', async () => {
    const mw = x402.requirePayment('image.premium');
    const req = { headers: {}, protocol: 'http', get: () => 'localhost', originalUrl: '/api/image/generate' };
    const res = mockRes(); let called = false;
    await mw(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.code).toBeNull();
  });

  test('returns 402 with accepts[] when enabled and no X-PAYMENT', async () => {
    process.env.X402_ENABLED = 'true';
    const mw = x402.requirePayment('image.premium');
    const req = { headers: {}, protocol: 'http', get: () => 'localhost', originalUrl: '/api/image/generate' };
    const res = mockRes(); let called = false;
    await mw(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.code).toBe(402);
    expect(res.body.x402Version).toBe(1);
    expect(Array.isArray(res.body.accepts)).toBe(true);
    expect(res.body.accepts[0].scheme).toBe('exact');
    expect(res.body.accepts[0].maxAmountRequired).toMatch(/^\d+$/);
  });

  test('passes + sets X-PAYMENT-RESPONSE when enabled + header (dev-permissive, no facilitator)', async () => {
    process.env.X402_ENABLED = 'true';
    const mw = x402.requirePayment('image.premium');
    const req = { headers: { 'x-payment': 'devpaymentblob' }, protocol: 'http', get: () => 'localhost', originalUrl: '/api/image/generate' };
    const res = mockRes(); let called = false;
    await mw(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.headers['X-PAYMENT-RESPONSE']).toBeTruthy();
  });
});
