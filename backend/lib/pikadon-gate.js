/**
 * PIKADON GATE — safe, additive security layer for the live money rails.
 *
 * This module is deliberately SURGICAL. It does NOT bolt the heavy
 * `security-middleware`/`security-hardening` stacks onto the primary server
 * wholesale (global CSRF, strict 1mb body limits and quote-stripping sanitizers
 * would break the free acquisition funnel). Instead it gives the pay routes the
 * three things that matter most without risking the site:
 *
 *   1. AUDIT  — every money mutation (charge, grant, confirm, tip, debit) is
 *               written to the winston audit.log and the in-memory logger. Secret
 *               values are never logged, only identifiers and amounts.
 *   2. LIMIT  — a stricter per-IP/per-user limiter for the money endpoints so a
 *               burst/card-spam cannot hammer the pay rail.
 *   3. GATE    — the FREE-FUNNEL + X402-ON-PREMIUM policy: by default every
 *               route passes (free), keeping acquisition open; ONLY when
 *               X402_ENABLED==='true' do premium pay-per-call items actually
 *               require an X-PAYMENT header and return 402 when absent.
 */

const express = require('express');

// --- audit sink: prefer the winston audit logger from security-hardening, else console
let auditLogger = null;
try {
  const sh = require('../security-hardening');
  if (sh && sh.auditLogger) auditLogger = sh.auditLogger;
} catch (_) { auditLogger = null; }

function audit(type, details) {
  try {
    if (auditLogger && typeof auditLogger.info === 'function') {
      auditLogger.info(type, { timestamp: new Date().toISOString(), eventType: type, ...details });
    } else {
      console.log(`[PIKADON-AUDIT] ${type}`, details);
    }
  } catch (_) { /* audit must never break the request */ }
}

/** Log a money mutation. Redacts anything that smells like a secret. */
function auditMoney(action, req, extra = {}) {
  const redact = (v) => {
    if (typeof v !== 'string') return v;
    return /(key|token|secret|password|header|payment|signature)/i.test(v) ? '[REDACTED]' : v;
  };
  const body = (req && req.body) ? Object.fromEntries(Object.entries(req.body).map(([k, v]) => [k, redact(v)])) : {};
  audit('BILLING_' + action.toUpperCase(), {
    resource: req && req.originalUrl,
    method: req && req.method,
    ip: req && (req.clientIp || req.ip),
    userId: req && (req.userId || req.user?.id),
    body,
    ...extra
  });
}

/**
 * Stricter limiter for money endpoints.
 * Independent in-memory window: N per minute from the same key (IP, or userId if
 * a caller is authenticated). Returns 429 on exceed. Never throws.
 */
function moneyLimiter({ max = 20, windowMs = 60 * 1000 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    try {
      const key = String(req.userId || req.user?.id || req.clientIp || req.ip || 'anon');
      const now = Date.now();
      const rec = hits.get(key) || [];
      while (rec.length && rec[0] < now - windowMs) rec.shift();
      if (rec.length >= max) {
        audit('RATE_LIMIT_EXCEEDED', { resource: req.originalUrl, key: req.userId ? 'user' : 'ip', limit: max });
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Too many requests on this endpoint. Try again shortly.' });
      }
      rec.push(now);
      hits.set(key, rec);
      if (hits.size > 20000) hits.clear(); // bound memory
    } catch (_) { /* never break on limiter */ }
    next();
  };
}

/** Small promise-based rate limiter for x402-style pay-per-call. */
function x402Limiter(opts) { return moneyLimiter(opts); }

/**
 * FREE-FUNNEL + X402-ON-PREMIUM gate.
 * - X402_ENABLED !== 'true'  → always next() (free; acquisition stays open).
 * - X402_ENABLED === 'true'  → require an X-PAYMENT header and verify it for the
 *   priced key, else 402 (the standard pay-per-call rail). Mirrors
 *   lib/x402.requirePayment but kept local so the emit policy is explicit here.
 */
function premiumGate(priceKey, opts = {}) {
  const enabled = () => process.env.X402_ENABLED === 'true';
  return async (req, res, next) => {
    if (!enabled()) return next();
    let x;
    try { x = require('./x402'); } catch (_) { return next(); } // no x402 lib → free
    if (!x || typeof x.verifyPayment !== 'function' || typeof x.paymentRequirements !== 'function') return next();
    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const reqs = x.paymentRequirements(priceKey, resourceUrl);
    const header = req.headers['x-payment'];
    if (!header) {
      auditMoney('402_REQUIRED', req, { priceKey });
      return res.status(402).json({ x402Version: (x.X402_VERSION || 'v2'), error: 'X-PAYMENT required', accepts: [reqs] });
    }
    const ok = await x.verifyPayment(header, priceKey, reqs).catch(() => false);
    if (!ok) {
      auditMoney('402_INVALID', req, { priceKey });
      return res.status(402).json({ x402Version: (x.X402_VERSION || 'v2'), error: 'payment invalid or unsettled', accepts: [reqs] });
    }
    res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify({ settled: true, resource: priceKey, at: Date.now() })).toString('base64'));
    next();
  };
}

/** Mountable audit middleware for a whole router: audit only money mutations. */
function auditRouter(actions = /(pay|charge|debit|confirm|grant|tip|order|purchase|swap|transfer)/i) {
  return (req, res, next) => {
    res.on('finish', () => {
      if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && actions.test(req.path)) {
        auditMoney('MUTATION', req, { status: res.statusCode });
      }
    });
    next();
  };
}

module.exports = {
  audit,
  auditMoney,
  auditRouter,
  moneyLimiter,
  x402Limiter,
  premiumGate
};
