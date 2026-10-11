'use strict';
/**
 * backend/lib/economy-identity.js — WHO is this request acting as, for the
 * Sparks ledger's user-scoped routes.
 *
 * WHY THIS FILE EXISTS (Shaddai-Arcade issue #3 follow-up, cross-service auth
 * review). The shared-'local'-wallet bug:
 *
 *   backend/auth-guard.js softAuth() sets `req.userId = 'local'` on every
 *   request that does not carry a valid bearer token, and only rejects with
 *   401 when REQUIRE_AUTH=true. The old inline resolveUserId() preferred
 *   `req.userId` over a caller-named userId, so on the real mount
 *   (server-production.js: `app.use('/api/economy', softAuth, economyRoutes())`)
 *   it returned 'local' for EVERY request:
 *
 *     Royale  GET  /balance?userId=<real user>  -> read the 'local' balance
 *     browser POST /catalog/purchase            -> spent 'local', granted 'local'
 *
 *   1. Royale's buy-in affordability check read a DIFFERENT wallet than the
 *      one /spend debited, so a user could be told "insufficient funds"
 *      against a shared bucket — or pass the check and then fail to debit.
 *   2. Every anonymous caller shared ONE 'local' wallet, so anyone could drain
 *      everyone else's balance. The Sparks ledger is deliberately closed-loop
 *      with no cash-out, and a shared wallet breaks that isolation.
 *
 * There is therefore NO 'local' branch here and NO trust in a bare
 * caller-supplied userId. Precedence is strict, and an unidentifiable caller
 * gets null so the route can 401 rather than guess.
 *
 * Deliberately dependency-free (no express, no crypto): the caller injects its
 * own `isServiceCaller` predicate, which keeps this unit-testable in isolation
 * and keeps the token-comparison policy in auth-guard.js where it belongs.
 */

/**
 * isServiceRequest(req, adminTokenMatches) -> boolean
 * Header-only. We do NOT also accept the token from req.body: a credential in
 * a request body is far more likely to be captured by request/body logging
 * than one in a header.
 */
function isServiceRequest(req, adminTokenMatches) {
  if (typeof adminTokenMatches !== 'function') return false;
  const header = typeof req.get === 'function' ? req.get('x-admin-token') : null;
  return !!adminTokenMatches(header);
}

/**
 * resolveScopedUserId(req, provided, adminTokenMatches) -> string | null
 *
 *   1. an authenticated identity  -> that user, regardless of `provided`
 *   2. a service token            -> may name `provided` as the target user
 *   3. otherwise                  -> null  (route should 401)
 *
 * `provided` is the userId the caller *asked* for (query/body). It is honoured
 * ONLY for a token-bearing server-to-server caller, which is what lets Royale
 * read and debit a specific user's wallet.
 */
function resolveScopedUserId(req, provided, adminTokenMatches) {
  if (req.user && typeof req.user.id === 'string' && req.user.id) return req.user.id;

  // softAuth populates both of these; require isAuthenticated so the 'local'
  // placeholder can never be mistaken for a real identity.
  if (req.isAuthenticated === true && typeof req.userId === 'string' && req.userId) {
    return req.userId;
  }

  if (isServiceRequest(req, adminTokenMatches)) {
    if (typeof provided === 'string' && provided) return provided;
    if (typeof req.userId === 'string' && req.userId && req.userId !== 'local') return req.userId;
  }

  return null;
}

module.exports = { resolveScopedUserId, isServiceRequest };