/* ══════════════════════════════════════════════════════════════════════════
   FOUNDERS REGISTER — who bought a founding seat, and which one.

   WHY: the webhook's founder grant set tier 'pro' and nothing else, which made
   a founder indistinguishable from a $30 subscriber. pricing.html promises
   three things that a tier alone cannot deliver — "a founder mark never minted
   again", "your name in the build", and "first claim on land" — and every one
   of them needs a durable record with a SEAT NUMBER.

   The cap is enforced here rather than in Stripe. A Payment Link has no
   inventory, so seat 21 can absolutely be sold; when that happens the money is
   already taken and refusing the record would be the worst possible outcome.
   Instead an over-cap purchase is recorded as `overflow: true` with its real
   ordinal — the buyer still gets everything, and the owner gets an explicit
   signal to either honour it or refund, rather than a silent scarcity break.

   Scarcity you later break costs you the people who trusted it first, so the
   number here is the number on the page.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'founders.json');

/** The promise on pricing.html. Changing this changes what was sold. */
const SEATS = 20;

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return []; // no founders yet, or unreadable — never fatal
  }
}

// Temp file + rename: a truncated founders.json would read as "nobody is a
// founder", silently revoking the one thing these people actually bought.
function write(list) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

/**
 * Record a founding purchase. Idempotent on the Stripe session id, because
 * Stripe retries webhooks and a retry must not consume a second seat.
 *
 * @param {string} uid        the buyer
 * @param {object} [meta]     { sessionId, email, amountTotal }
 * @returns {{seat:number, overflow:boolean, alreadyRecorded:boolean}}
 */
function claim(uid, meta) {
  meta = meta || {};
  const list = read();

  // Same session replayed → return the existing seat, consume nothing.
  if (meta.sessionId) {
    const prior = list.find((f) => f && f.sessionId === meta.sessionId);
    if (prior) return { seat: prior.seat, overflow: !!prior.overflow, alreadyRecorded: true };
  }
  // Same person buying twice → they keep their first seat. Charging them again
  // is a refund problem, not a reason to hand out a second one.
  const existing = list.find((f) => f && f.uid === uid);
  if (existing) return { seat: existing.seat, overflow: !!existing.overflow, alreadyRecorded: true };

  const seat = list.length + 1;
  const record = {
    seat,
    uid,
    email: meta.email || null,
    amountTotal: Number(meta.amountTotal) || null,   // cents, as Stripe reports it
    sessionId: meta.sessionId || null,
    overflow: seat > SEATS,
    claimedAt: new Date().toISOString(),
  };
  list.push(record);
  write(list);

  if (record.overflow) {
    console.warn(
      `[founders] SEAT ${seat} SOLD BEYOND THE ${SEATS}-SEAT CAP (uid ${uid}). ` +
      'They have been granted everything. Decide deliberately: honour it, or refund. ' +
      'Take the link down in Stripe to stop further sales.'
    );
  } else {
    console.log(`[founders] seat ${seat} of ${SEATS} claimed by ${uid}`);
  }
  return { seat, overflow: record.overflow, alreadyRecorded: false };
}

/** The founder record for a user, or null. Safe to send to that user. */
function get(uid) {
  const f = read().find((x) => x && x.uid === uid);
  if (!f) return null;
  return { seat: f.seat, overflow: f.overflow, claimedAt: f.claimedAt };
}

function isFounder(uid) { return !!get(uid); }

/** Public scarcity counter for the pricing page. Carries no personal data. */
function status() {
  const list = read();
  const claimed = list.filter((f) => !f.overflow).length;
  return { seats: SEATS, claimed, remaining: Math.max(0, SEATS - claimed), soldOut: claimed >= SEATS };
}

/** The wall — ordered, and deliberately without emails or Stripe ids. */
function roll() {
  return read()
    .sort((a, b) => a.seat - b.seat)
    .map((f) => ({ seat: f.seat, uid: f.uid, claimedAt: f.claimedAt, overflow: !!f.overflow }));
}

module.exports = { SEATS, claim, get, isFounder, status, roll };
