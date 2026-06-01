// ============================================================================
// auth-guard.js — lightweight, scale-ready safety middleware (PIKADON).
// Designed to be NON-BREAKING locally and ENFORCING in production:
//   • rateLimit — always on (cheap abuse/cost protection).
//   • softAuth  — attaches req.userId; only HARD-blocks if REQUIRE_AUTH==='true'.
//   • requireAdmin — gates dangerous ops behind ADMIN_TOKEN; if ADMIN_TOKEN is
//     unset (local/dev) it allows through, so nothing breaks during development.
// Flip REQUIRE_AUTH=true + set ADMIN_TOKEN (and wire real Firebase verify in
// softAuth) for a public/multi-user launch.
// ============================================================================
const _hits = new Map(); // ip -> { count, ts }

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
  const uid = req.headers['x-user-id'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '';
  req.userId = uid || 'local';
  if (process.env.REQUIRE_AUTH === 'true' && !uid) {
    return res.status(401).json({ ok: false, error: 'authentication required' });
  }
  next();
}

// Gate dangerous operations. Local/dev (no ADMIN_TOKEN set) => allow, so the
// dashboard keeps working. Production => require the matching admin header.
function requireAdmin(req, res, next) {
  const tok = process.env.ADMIN_TOKEN;
  if (!tok) return next(); // dev convenience
  if ((req.headers['x-shaddai-admin'] || '') === tok) return next();
  return res.status(403).json({ ok: false, error: 'admin token required for this operation' });
}

module.exports = { rateLimit, softAuth, requireAdmin };
