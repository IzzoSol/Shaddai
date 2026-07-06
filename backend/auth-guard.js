// ============================================================================
// auth-guard.js — lightweight, scale-ready safety middleware (PIKADON).
// Designed to be NON-BREAKING locally and ENFORCING in production:
//   • rateLimit            — always on (cheap abuse/cost protection).
//   • softAuth             — attaches req.userId; only HARD-blocks if REQUIRE_AUTH==='true'.
//   • verifyFirebaseToken  — verifies a Firebase ID token from Authorization: Bearer header.
//                            Lazily inits firebase-admin when FIREBASE_SERVICE_ACCOUNT JSON
//                            or GOOGLE_APPLICATION_CREDENTIALS is set. When neither is set
//                            (local dev) falls back to x-user-id header (non-breaking).
//   • requireAdmin         — gates dangerous ops behind ADMIN_TOKEN; if ADMIN_TOKEN is
//                            unset (local/dev) it allows through, so nothing breaks during
//                            development.
// Flip REQUIRE_AUTH=true + set FIREBASE_SERVICE_ACCOUNT + ADMIN_TOKEN for production.
// ============================================================================
const _hits = new Map(); // ip -> { count, ts }

// ── Firebase lazy init ───────────────────────────────────────────────────────
// _adminAuth is null until first call to _getAdminAuth().
let _adminAuth = null;   // firebase-admin Auth instance once initialized
let _adminInitAttempted = false; // only try once to avoid repeated noise

function _getAdminAuth() {
  if (_adminInitAttempted) return _adminAuth;
  _adminInitAttempted = true;

  // Check whether we have any Firebase credential to work with.
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const appCredsFile       = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!serviceAccountJson && !appCredsFile) {
    // No credentials configured — stay in dev-permissive mode.
    return null;
  }

  try {
    const admin = require('firebase-admin');

    // Only initialize once even if this function is somehow re-entered.
    if (!admin.apps.length) {
      let inited = false;
      if (serviceAccountJson) {
        // FIREBASE_SERVICE_ACCOUNT: full service-account JSON as a string.
        try {
          admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
          inited = true;
        } catch (e) {
          // Malformed env var (common: multi-line paste truncated) — fall back to the file.
          console.warn('[auth-guard] FIREBASE_SERVICE_ACCOUNT malformed, trying GOOGLE_APPLICATION_CREDENTIALS:', e.message);
        }
      }
      if (!inited && appCredsFile) {
        // GOOGLE_APPLICATION_CREDENTIALS: path to a service-account JSON file (Render Secret File).
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
        inited = true;
      }
      if (!inited) return null; // no usable credential
      console.log('[auth-guard] firebase-admin initialized');
    }

    _adminAuth = admin.auth();
    return _adminAuth;
  } catch (err) {
    console.warn('[auth-guard] firebase-admin init failed — running in dev-permissive mode:', err.message);
    return null;
  }
}

function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'local').toString();
    const now = Date.now();
    let e = _hits.get(ip);
    if (!e || now - e.ts > windowMs) { e = { count: 0, ts: now }; }
    e.count++; _hits.set(ip, e);
    if (e.count > max) return res.status(429).json({ ok: false, error: 'rate limit exceeded — slow down' });
    next();
  };
}

// Soft auth: identify the caller; only reject when REQUIRE_AUTH is explicitly on.
// TODO(launch): verify a Firebase ID token here instead of trusting the header.
function softAuth(req, res, next) {
  // SECURITY: never trust the x-user-id header in production (spoofable). Only
  // honour it in non-prod so local tooling keeps working.
  const isProd = process.env.NODE_ENV === 'production';
  const headerUid = isProd ? '' : (req.headers['x-user-id'] || '');
  const uid = headerUid || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '';
  req.userId = uid || 'local';
  if (process.env.REQUIRE_AUTH === 'true' && !uid) {
    return res.status(401).json({ ok: false, error: 'authentication required' });
  }
  next();
}

/**
 * verifyFirebaseToken — production-grade auth middleware.
 *
 * Behaviour matrix:
 *
 *  Firebase ready | Bearer token | REQUIRE_AUTH  | Outcome
 *  ───────────────┼──────────────┼───────────────┼─────────────────────────────────
 *  yes            | valid        | any           | req.userId = uid → next()
 *  yes            | invalid/exp  | true          | 401
 *  yes            | invalid/exp  | false/unset   | fall through (dev)
 *  yes            | absent       | true          | 401
 *  yes            | absent       | false/unset   | fall back to x-user-id header
 *  no (dev)       | any          | true          | 401 (no token, no firebase)
 *  no (dev)       | absent       | false/unset   | fall back to x-user-id header
 *
 * The last two rows ensure: if Firebase creds are NOT set locally nothing breaks.
 */
async function verifyFirebaseToken(req, res, next) {
  const requireAuth = process.env.REQUIRE_AUTH === 'true';
  const authHeader  = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const firebaseAuth = _getAdminAuth();

  if (firebaseAuth && bearerToken) {
    // Firebase is ready and a token was supplied — verify it.
    try {
      const decoded = await firebaseAuth.verifyIdToken(bearerToken);
      req.userId = decoded.uid;
      return next();
    } catch (err) {
      // Token is present but invalid / expired.
      if (requireAuth) {
        return res.status(401).json({ ok: false, error: 'invalid or expired token' });
      }
      // Dev-permissive: fall through to header fallback below.
      console.warn('[auth-guard] token verification failed (dev-permissive):', err.message);
    }
  }

  // No token (or Firebase not available).
  if (requireAuth) {
    // In strict mode we can't let anyone through without a verified token.
    return res.status(401).json({ ok: false, error: 'authentication required' });
  }

  // Dev fallback: honour the x-user-id header so existing local tooling keeps
  // working. SECURITY: never trust this spoofable header in production.
  const fallbackUid = process.env.NODE_ENV === 'production' ? '' : (req.headers['x-user-id'] || '');
  req.userId = fallbackUid || 'local';
  next();
}

// Gate dangerous operations. Local/dev (no ADMIN_TOKEN set) => allow, so the
// dashboard keeps working. Production => require the matching admin header.
function requireAdmin(req, res, next) {
  const tok = process.env.ADMIN_TOKEN;
  if (!tok) {
    // Fail CLOSED in production: refuse dangerous ops when no admin token is
    // configured. In dev, keep the pass-through so the dashboard works.
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ ok: false, error: 'admin not configured' });
    }
    return next(); // dev convenience
  }
  if ((req.headers['x-shaddai-admin'] || '') === tok) return next();
  return res.status(403).json({ ok: false, error: 'admin token required for this operation' });
}

module.exports = { rateLimit, softAuth, verifyFirebaseToken, requireAdmin };
