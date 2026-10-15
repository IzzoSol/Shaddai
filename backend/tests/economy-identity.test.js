'use strict';
/**
 * backend/tests/economy-identity.test.js
 *
 * Regression cover for the shared-'local'-wallet bug (ShaddDAI-Arcade #3
 * follow-up). Deliberately dependency-free — no express, no supertest, no
 * npm install — so it runs in a bare checkout / CI sandbox.
 *
 * The invariant under test: a Sparks wallet is only ever reachable by
 *   (a) its authenticated owner, or
 *   (b) a service-token holder that explicitly names it.
 * Never by an anonymous caller, and never via a shared 'local' bucket.
 */
const assert = require('assert');
const { resolveScopedUserId, isServiceRequest } = require('../lib/economy-identity');

const TOKEN = 'svc-token-abc';
// Stand-in for auth-guard's adminTokenMatches. Note the real signature is
// single-arg — it compares the presented value against every configured token
// internally — so the fake must take only `provided`.
const matches = (provided) => typeof provided === 'string' && provided === TOKEN;

/** Build a fake req. Defaults model softAuth on an anonymous browser request. */
function req({ token = null, isAuthenticated = false, userId = 'local', user = null } = {}) {
  const headers = {};
  if (token != null) headers['x-admin-token'] = token;
  return {
    get: (h) => headers[String(h).toLowerCase()] ?? null,
    body: {},
    headers,
    isAuthenticated,
    userId,
    user,
  };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

console.log('economy-identity: no shared Sparks wallet');

check('anonymous caller gets null, NOT the shared "local" wallet', () => {
  assert.strictEqual(resolveScopedUserId(req(), 'victim', matches), null);
});

check('anonymous caller gets null even naming a userId with no token', () => {
  // The exact shape that used to leak: /balance?userId=victim with no auth.
  const r = resolveScopedUserId(req(), 'victim', matches);
  assert.strictEqual(r, null, 'must not resolve to a caller-supplied id');
});

check('authenticated caller resolves to OWN id, ignoring a supplied id', () => {
  const r = resolveScopedUserId(
    req({ isAuthenticated: true, userId: 'alice' }), 'victim', matches);
  assert.strictEqual(r, 'alice');
});

check('req.user.id wins over req.userId when both present', () => {
  const r = resolveScopedUserId(
    req({ isAuthenticated: true, userId: 'alice', user: { id: 'alice-firebase-uid' } }),
    'victim', matches);
  assert.strictEqual(r, 'alice-firebase-uid');
});

check('service token may name the target user (Royale buy-in path)', () => {
  const r = resolveScopedUserId(req({ token: TOKEN }), 'alice', matches);
  assert.strictEqual(r, 'alice');
});

check('service token + no named user falls back to a non-local req.userId', () => {
  const r = resolveScopedUserId(req({ token: TOKEN, userId: 'alice' }), null, matches);
  assert.strictEqual(r, 'alice');
});

check('service token + req.userId "local" + no named user -> null (no shared wallet)', () => {
  const r = resolveScopedUserId(req({ token: TOKEN, userId: 'local' }), null, matches);
  assert.strictEqual(r, null, 'must not hand out the shared bucket');
});

check('wrong token gets null, even with a named user', () => {
  assert.strictEqual(resolveScopedUserId(req({ token: 'wrong' }), 'victim', matches), null);
});

check('empty-string userId is not treated as an identity', () => {
  assert.strictEqual(
    resolveScopedUserId(req({ isAuthenticated: true, userId: '' }), 'victim', matches), null);
});

check('isServiceRequest ignores a token planted in req.body', () => {
  const r = req();
  r.body.adminToken = TOKEN;
  assert.strictEqual(isServiceRequest(r, matches), false,
    'credential in a body leaks into request/body logs');
  assert.strictEqual(resolveScopedUserId(r, 'victim', matches), null);
});

check('isServiceRequest is safe when no matcher is injected', () => {
  assert.strictEqual(isServiceRequest(req({ token: TOKEN }), undefined), false);
});

check("the old buggy shape would have returned 'local' (guard against regression)", () => {
  // Documents the prior behaviour: softAuth sets req.userId='local' and the old
  // resolveUserId preferred it, so this request used to resolve to 'local'.
  const anonymous = req();
  assert.strictEqual(anonymous.userId, 'local');
  assert.strictEqual(resolveScopedUserId(anonymous, 'victim', matches), null);
});

console.log(`\n${passed} checks passed`);