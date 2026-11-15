'use strict';
/**
 * SHADDAI Economy routes — express Router.
 *
 * Mount example (in server-production.js, NOT edited here):
 *   const { softAuth } = require('./auth-guard');
 *   const economyRoutes = require('./economy-routes');
 *   app.use('/api/economy', softAuth, economyRoutes());
 *
 * softAuth is REQUIRED, not optional — see resolveScopedUserId() below.
 *
 * Assumes express.json() is applied globally. All handlers validate input and
 * translate errors into clean 4xx responses — they never 500-crash on bad
 * input. There is NO cash-out / withdraw endpoint (closed-loop by design).
 *
 * User identity: taken from req.user?.id / req.userId ONLY when the request is
 * actually authenticated, or from an explicit userId when the caller presents a
 * service token. A caller-supplied userId is NEVER trusted on its own, and
 * there is deliberately NO shared 'local' fallback wallet.
 */

const express = require('express');
const {
  getDefault,
  InsufficientFundsError,
  ValidationError,
  UNITS_PER_SPARK,
  unitsToSparks
} = require('./economy-service');
const { rateLimit, timingSafeTokenMatch } = require('./auth-guard');

// Shaddai-Arcade issue #3 (PIKADON cross-service auth review): /grant and
// /spend used to accept ONLY the master ADMIN_TOKEN -- the same secret that
// gates admin-routes.js, portal-admin-routes.js, telegram-routes.js, and
// public-api-routes.js across the whole backend. Handing that single
// master token to Royale/Shaddai-Arcade (a SEPARATE, PUBLIC-repo deploy) so
// it could call the Sparks ledger meant a compromise of that public deploy
// would also hand over Telegram bot control, portal admin, and the public
// API's admin surface -- far more blast radius than "can move Sparks."
// ARCADE_SERVICE_TOKEN is a second, narrower credential accepted here (and
// in lens-routes.js) ONLY -- provision Royale with THIS token, not
// ADMIN_TOKEN, so a leak there can't reach anything outside the ledger.
// ADMIN_TOKEN still works too (existing internal tooling may already use
// it against these two routes) -- this is additive, not a breaking change.
function adminTokenMatches(provided) {
  return timingSafeTokenMatch(provided, process.env.ADMIN_TOKEN)
    || timingSafeTokenMatch(provided, process.env.ARCADE_SERVICE_TOKEN);
}
// SHADDAI-Auth follow-up to issue #3 — THE SHARED-'local'-WALLET BUG.
//
// The full reasoning and the fix live in backend/lib/economy-identity.js —
// read that header before changing anything here. Short version: softAuth sets
// req.userId = 'local' on unauthenticated requests, and the old inline
// resolveUserId preferred it over a caller-named userId, so /balance,
// /inventory and /catalog/purchase all silently resolved to ONE shared
// 'local' wallet. There is no shared-wallet path left.
const { resolveScopedUserId: resolveIdentity } = require('./lib/economy-identity');

const moneyMoveLimit = rateLimit({ windowMs: 60000, max: 30 });

/** Header-only token check — never accept the credential from req.body. */
function isServiceCaller(req) {
  return adminTokenMatches(req.get('x-admin-token'));
}

/** Route-facing wrapper: null means "unidentifiable", so the route 401s. */
function resolveScopedUserId(req, provided) {
  return resolveIdentity(req, provided, adminTokenMatches);
}

function sendError(res, err) {
  if (err instanceof InsufficientFundsError) {
    return res.status(402).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code });
  }
  // Unexpected: log server-side, return generic 500 (no stack to client).
  // eslint-disable-next-line no-console
  console.error('[economy-routes] unexpected error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ ok: false, error: 'Internal error', code: 'INTERNAL' });
}

function createRouter(serviceOverride) {
  const router = express.Router();
  const svc = serviceOverride || getDefault();

  // --- GET /balance -------------------------------------------------------
  // Wallet is per-user and private: you see your own balance, or any balance
  // if you hold a service token. Anonymous callers get 401 rather than a
  // shared 'local' bucket.
  router.get('/balance', async (req, res) => {
    try {
      const userId = resolveScopedUserId(req, req.query.userId);
      if (!userId) return res.status(401).json({ ok: false, error: 'authentication required', code: 'UNAUTHORIZED' });
      const balance = await svc.getBalance(userId);
      // Balance unit convention (see economy-service.js): the stored
      // integer is ledger UNITS, 100 units = 1 Spark. `sparks_balance`
      // keeps its historical raw-units meaning for existing consumers;
      // `balance_sparks` is the display number (units / 100) the header
      // and City panel show — never display the raw integer as Sparks.
      return res.json({ ok: true, userId, sparks_balance: balance, balance_units: balance, balance_sparks: unitsToSparks(balance), units_per_spark: UNITS_PER_SPARK });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- GET /inventory -----------------------------------------------------
  router.get('/inventory', async (req, res) => {
    try {
      const userId = resolveScopedUserId(req, req.query.userId);
      if (!userId) return res.status(401).json({ ok: false, error: 'authentication required', code: 'UNAUTHORIZED' });
      const items = await svc.getInventory(userId);
      return res.json({ ok: true, userId, items });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- GET /catalog -------------------------------------------------------
  // Public, read-only list of ACTIVE shop items. No money mutation. Never
  // 500-crashes on empty catalog. Normalizes each row to a stable shape so
  // the frontend can render decor/cosmetic/upgrade/premium uniformly.
  router.get('/catalog', async (req, res) => {
    try {
      const raw = await svc.listCatalog();
      const items = (Array.isArray(raw) ? raw : []).map((it) => {
        const sparks = (it.sparks_price == null || Number(it.sparks_price) <= 0)
          ? null
          : Number(it.sparks_price);
        const usd = (it.usd_price_cents == null || Number(it.usd_price_cents) <= 0)
          ? null
          : Number(it.usd_price_cents);
        return {
          id: it.id,
          name: it.name,
          kind: it.kind,
          rarity: it.rarity != null ? it.rarity : null,
          sparks_price: sparks,
          usd_price_cents: usd,
          description: it.description != null ? it.description : null,
          category: it.category != null ? it.category : null
        };
      });
      return res.json({ ok: true, items });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- POST /catalog/purchase --------------------------------------------
  // Body: { userId?, catalogId, idempotencyKey, qty? }
  // Validates the catalog item is active + sparks-priced, then spends Sparks
  // and grants the item. Idempotency keys are derived so a client retry of the
  // same purchase neither double-charges nor double-grants.
  router.post('/catalog/purchase', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = resolveScopedUserId(req, body.userId);
      if (!userId) return res.status(401).json({ ok: false, error: 'authentication required', code: 'UNAUTHORIZED' });

      const catalogId = body.catalogId;
      if (typeof catalogId !== 'string' || !catalogId.trim()) {
        return res.status(400).json({ ok: false, error: 'catalogId required', code: 'VALIDATION' });
      }
      const idempotencyKey = body.idempotencyKey;
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
        return res.status(400).json({ ok: false, error: 'idempotencyKey required', code: 'VALIDATION' });
      }
      let qty = body.qty == null ? 1 : body.qty;
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ ok: false, error: 'qty must be a positive integer', code: 'VALIDATION' });
      }

      const item = await svc.getCatalogItem(catalogId);
      if (!item || item.active === false) {
        return res.status(404).json({ ok: false, error: 'Catalog item not found or inactive', code: 'NOT_FOUND' });
      }
      const unitPrice = Number(item.sparks_price);
      const usdCents = Number(item.usd_price_cents);
      const hasSparksPrice = Number.isInteger(unitPrice) && unitPrice > 0;
      // PREMIUM (real-$) item: usd_price_cents set, not Sparks-priced. Do NOT
      // spend Sparks — hand off to Stripe (implemented in sub-billing). We
      // return a hint so the frontend routes to the unlock/checkout flow.
      if (!hasSparksPrice && Number.isInteger(usdCents) && usdCents > 0) {
        return res.status(200).json({
          ok: true,
          requiresStripe: true,
          userId,
          catalogId,
          qty,
          item: {
            id: item.id,
            name: item.name,
            kind: item.kind,
            rarity: item.rarity != null ? item.rarity : null,
            usd_price_cents: usdCents
          }
        });
      }
      if (!hasSparksPrice) {
        return res.status(400).json({ ok: false, error: 'Item is not purchasable with Sparks', code: 'NOT_PURCHASABLE' });
      }
      const total = unitPrice * qty;
      if (!Number.isSafeInteger(total)) {
        return res.status(400).json({ ok: false, error: 'qty too large', code: 'VALIDATION' });
      }

      // Derive stable idempotency keys for the two sub-operations from the
      // client key so retries are safe end-to-end. spend runs first (rejects
      // on insufficient funds BEFORE any item is granted).
      const spendKey = `purchase:${idempotencyKey}:spend`;
      const grantKey = `purchase:${idempotencyKey}:grant`;

      const spendResult = await svc.spend(
        userId, total, `purchase:${catalogId} x${qty}`, spendKey, { refId: catalogId }
      );
      // Only after a successful (or replayed) spend do we grant the item.
      const grantResult = await svc.grantItem(userId, catalogId, qty, grantKey);

      return res.json({
        ok: true,
        userId,
        catalogId,
        qty,
        spent: total,
        balance: spendResult.balance,
        item: grantResult.item,
        replayed: spendResult.replayed && grantResult.replayed
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- POST /grant  (ADMIN/DEBUG only) ------------------------------------
  // Guarded by ADMIN_TOKEN. Used to seed Sparks for testing the loop.
  // Body: { userId, amount, reason?, idempotencyKey }
  // Header: x-admin-token: <ADMIN_TOKEN>
  router.post('/grant', moneyMoveLimit, async (req, res) => {
    try {
      if (!process.env.ADMIN_TOKEN && !process.env.ARCADE_SERVICE_TOKEN) {
        return res.status(503).json({ ok: false, error: 'Admin grant disabled (neither ADMIN_TOKEN nor ARCADE_SERVICE_TOKEN is set)', code: 'DISABLED' });
      }
      if (!isServiceCaller(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      const body = req.body || {};
      const { userId, amount, idempotencyKey } = body;
      const reason = body.reason || 'admin_grant';
      // Service-layer validation gives clean 400s for bad input.
      const result = await svc.grant(userId, amount, reason, idempotencyKey);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- POST /spend  (ADMIN/SERVER-TO-SERVER only) -------------------------
  // Shaddai-Arcade issue #1: Sparks was only reachable via in-process
  // require() inside this backend. A separate deploy (Royale/Arcade) needs
  // it over HTTP for buy-ins/payouts/rake -- grant() and getBalance() (via
  // GET /balance) already existed here; spend() was the one missing leg of
  // the spend/grant/getBalance trio the Hall spec asks for.
  //
  // Same gate as /grant, deliberately: fails closed (503) if ADMIN_TOKEN is
  // unset, in every environment, not just production -- this is a
  // server-to-server credential (see docs/HALL-PHASE1-SPEC.md's own note:
  // "the admin key must never reach a browser"); PIKADON review (Arcade
  // issue #3) covers the actual cross-service key custody before this ships
  // for real traffic -- this route itself is the safe, tested primitive
  // that review will be reviewing, not a substitute for it.
  // Body: { userId, amount, reason?, idempotencyKey }
  // Header: x-admin-token: <ADMIN_TOKEN>
  router.post('/spend', moneyMoveLimit, async (req, res) => {
    try {
      if (!process.env.ADMIN_TOKEN && !process.env.ARCADE_SERVICE_TOKEN) {
        return res.status(503).json({ ok: false, error: 'Admin spend disabled (neither ADMIN_TOKEN nor ARCADE_SERVICE_TOKEN is set)', code: 'DISABLED' });
      }
      if (!isServiceCaller(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      const body = req.body || {};
      const { userId, amount, idempotencyKey } = body;
      const reason = body.reason || 'admin_spend';
      // Service-layer validation gives clean 400s for bad input;
      // InsufficientFundsError -> sendError() maps this to a clean 402.
      const result = await svc.spend(userId, amount, reason, idempotencyKey);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
