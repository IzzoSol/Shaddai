/**
 * SHADDAI shared HTTP response / error contract.
 *
 * Mirrors three.ws `api/_lib/http.js`: one place for security headers, a uniform
 * error shape, `no-store` on errors, double-send guards, secret-redacted URL
 * logging, and prod message-hiding.
 *
 * ADDITIVE: existing routers keep working untouched. Adopt incrementally.
 *
 * Design notes:
 *  - `ok()` preserves whatever body callers already send (frontend-parsed
 *    success shapes are NOT changed).
 *  - `fail()` returns `{ error: <code>, message }` and merges any `extra` fields
 *    so routes that must return frontend-consumed fallback fields (e.g.
 *    `content:''`, `pairs:[]`, `choices:[...]`) can preserve them.
 *  - In production the raw error `message` is replaced by a generic string and an
 *    `errorId` is returned; the real error is logged server-side by the caller.
 */

'use strict';

const crypto = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production';

// Query/body keys whose values must never reach a log sink.
const SENSITIVE_QUERY_KEYS = new Set([
  'token', 'access_token', 'refresh_token', 'id_token', 'auth', 'authorization',
  'key', 'apikey', 'api_key', 'apiKey', 'secret', 'client_secret', 'password',
  'passwd', 'pwd', 'session', 'sessionid', 'sid', 'cookie', 'signature', 'sig',
  'private_key', 'privateKey', 'seed', 'mnemonic', 'wallet', 'wallet_address',
  'walletAddress', 'address', 'lat', 'lng', 'lon', 'latitude', 'longitude',
  'coords', 'code', 'otp', 'pin', 'byok', 'bearer'
]);

const REDACTED = 'REDACTED';

/**
 * Redact sensitive query-string values from a URL before logging.
 * Accepts a full URL or a path+query string. Never throws.
 */
function redactUrl(input) {
  if (input == null) return input;
  let str = String(input);
  try {
    // Handle path-relative URLs by giving them a dummy origin.
    const hasOrigin = /^[a-z][a-z0-9+.-]*:\/\//i.test(str);
    const u = new URL(str, hasOrigin ? undefined : 'http://x');
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(k) || SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, REDACTED);
        changed = true;
      }
    }
    if (!changed) return str;
    return hasOrigin ? u.toString() : (u.pathname + (u.search || '') + (u.hash || ''));
  } catch (_) {
    // Fallback: regex-strip common secret query params if URL parsing fails.
    return str.replace(
      /([?&](?:token|key|api_?key|secret|password|auth|authorization|signature|sig|session|wallet|address|lat|lng|lon|code|otp|pin|byok|bearer)=)[^&#\s]*/gi,
      `$1${REDACTED}`
    );
  }
}

/**
 * Redact sensitive keys from a plain object (shallow + one level deep),
 * for safe logging of request bodies / metadata. Never throws, returns a copy.
 */
function redactObject(obj, depth = 2) {
  if (!obj || typeof obj !== 'object' || depth < 0) return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_QUERY_KEYS.has(k) || SENSITIVE_QUERY_KEYS.has(String(k).toLowerCase())) {
      out[k] = REDACTED;
    } else if (v && typeof v === 'object') {
      out[k] = redactObject(v, depth - 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Apply baseline security headers if not already committed. */
function applySecurityHeaders(res) {
  if (res.headersSent) return;
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  } catch (_) { /* headers already flushed */ }
}

/** True if the response can no longer be written to. */
function sent(res) {
  return !!(res.headersSent || res.writableEnded);
}

/**
 * Success responder. Preserves the caller's body verbatim (does not reshape
 * success payloads the frontend parses).
 */
function ok(res, body, { status = 200, headers = {} } = {}) {
  if (sent(res)) return res;
  applySecurityHeaders(res);
  for (const [h, val] of Object.entries(headers)) {
    try { res.setHeader(h, val); } catch (_) {}
  }
  return res.status(status).json(body);
}

/**
 * Error responder — BACKWARD-COMPATIBLE with SHADDAI's existing contract.
 *
 * The frontend reads `data.error` as a human-readable string and displays it,
 * so `error` MUST remain a message string (never a code). We additionally add
 * `code`, `errorId`, `no-store` and security headers as pure improvements.
 *
 * Body: `{ error: <message>, code, errorId, ...extra }`.
 * In production, for 5xx the raw `message` is replaced with a generic string so
 * internal error text / stacks never leak to clients; the caller is expected to
 * log the real error server-side (correlate via `errorId`).
 *
 * @param {import('express').Response} res
 * @param {number} status   HTTP status
 * @param {string} code     machine-readable snake_case code, e.g. 'internal_error'
 * @param {string} [message] human message shown to the client (generic in prod for 5xx)
 * @param {object} [extra]  extra fields merged into the body (e.g. frontend fallbacks
 *                          like { ok:false }, { content:'' }, { pairs:[] })
 */
function fail(res, status = 500, code = 'internal_error', message, extra = {}) {
  const errorId = crypto.randomBytes(6).toString('hex');
  // Keep client-visible `error` as a message string (frontend displays it).
  // Hide raw internal text for 5xx in production.
  const clientError = (IS_PROD && status >= 500)
    ? 'Request failed'
    : (message || code);

  if (sent(res)) return res;
  applySecurityHeaders(res);
  try { res.setHeader('Cache-Control', 'no-store'); } catch (_) {}

  const body = {
    error: clientError,   // string — backward compatible with data.error consumers
    code,                 // NEW: machine-readable code
    errorId,              // NEW: correlate with server logs
    ...(extra && typeof extra === 'object' ? extra : {})
  };
  return res.status(status).json(body);
}

/** 404 matching the existing `/api/*` guard shape (clients unchanged). */
function notFound(res, path, method) {
  if (sent(res)) return res;
  applySecurityHeaders(res);
  try { res.setHeader('Cache-Control', 'no-store'); } catch (_) {}
  return res.status(404).json({ error: 'Not found', path, method });
}

/**
 * Wrap an async route handler so a thrown error / rejected promise routes to
 * Express's error middleware (clean 500) instead of hanging the request.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ok,
  fail,
  notFound,
  asyncHandler,
  redactUrl,
  redactObject,
  applySecurityHeaders,
  SENSITIVE_QUERY_KEYS,
  IS_PROD
};
