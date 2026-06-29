const { softAuth, requireAdmin } = require('../auth-guard');

function mockRes() {
  return {
    code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('softAuth', () => {
  afterEach(() => { delete process.env.REQUIRE_AUTH; });

  test('passes through in dev (REQUIRE_AUTH unset), sets userId', () => {
    const req = { headers: {} }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.userId).toBeDefined();
  });

  test('rejects with 401 when REQUIRE_AUTH=true and no uid', () => {
    process.env.REQUIRE_AUTH = 'true';
    const req = { headers: {} }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.code).toBe(401);
  });

  test('accepts x-user-id header when REQUIRE_AUTH=true', () => {
    process.env.REQUIRE_AUTH = 'true';
    const req = { headers: { 'x-user-id': 'u123' } }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.userId).toBe('u123');
  });
});

describe('requireAdmin', () => {
  afterEach(() => { delete process.env.ADMIN_TOKEN; });

  test('passes through when ADMIN_TOKEN unset (dev)', () => {
    const req = { headers: {} }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('403 when ADMIN_TOKEN set and header missing/wrong', () => {
    process.env.ADMIN_TOKEN = 'secret';
    const req = { headers: { 'x-shaddai-admin': 'wrong' } }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.code).toBe(403);
  });

  test('passes when ADMIN_TOKEN set and header matches', () => {
    process.env.ADMIN_TOKEN = 'secret';
    const req = { headers: { 'x-shaddai-admin': 'secret' } }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(true);
  });
});
