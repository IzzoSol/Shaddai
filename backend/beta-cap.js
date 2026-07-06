'use strict';
// ============================================================================
// beta-cap.js — optional cap on total distinct beta accounts.
// Keeps us within Firebase free-tier headroom AND lets us control beta size.
// EXISTING users are always admitted; only a BRAND-NEW uid is gated once the cap
// is reached. Count is derived from the canonical billing customer store.
//
// Configure with env BETA_USER_CAP:
//   unset / 0  → no cap (default — feature is inert)
//   e.g. 250   → admit at most 250 distinct accounts; new signups past that get
//                a friendly "beta is full" so we never exceed free-tier limits.
// ============================================================================
const fs = require('fs');
const path = require('path');

const CAP = Number(process.env.BETA_USER_CAP) || 0; // 0 = unlimited

// Total distinct accounts. Prefer billing-service; fall back to counting the
// customers.json store. Cheap enough at beta scale; never throws.
function count() {
  try {
    const billing = require('./billing-service');
    if (typeof billing.getCustomerCount === 'function') return billing.getCustomerCount();
  } catch (_) {}
  try {
    const f = path.join(__dirname, 'data', 'customers.json');
    return Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))).length;
  } catch (_) { return 0; }
}

// check(uid, isExisting) → { admit, cap, count, full }
// Existing accounts always admit. New accounts admit only while under the cap.
function check(uid, isExisting) {
  if (!CAP) return { admit: true, cap: 0, count: count() };            // unlimited
  if (isExisting) return { admit: true, cap: CAP, count: count(), existing: true };
  const c = count();
  return { admit: c < CAP, cap: CAP, count: c, full: c >= CAP };
}

// Express middleware for new-account endpoints. Requires req.userId + a way to
// know if the user already exists (passed via opts.isExisting(req) or defaults to
// treating unknown uids as new). Non-blocking when CAP is 0.
function guard(isExisting) {
  return (req, res, next) => {
    if (!CAP) return next();
    const uid = req.userId || (req.body && req.body.uid);
    let existing = false;
    try { existing = typeof isExisting === 'function' ? !!isExisting(req) : false; } catch (_) {}
    const r = check(uid, existing);
    if (r.admit) return next();
    return res.status(403).json({ ok: false, full: true, error: "SHADDAI's private beta is full right now — join the waitlist and we'll let you in soon.", cap: r.cap });
  };
}

module.exports = { check, guard, count, CAP };
