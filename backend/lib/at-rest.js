// ============================================================================
// at-rest.js — transparent field-level encryption-at-rest (SHADDAI, PIKADON).
// ----------------------------------------------------------------------------
// Addresses Security Audit Issue #3 ("Unencrypted sensitive data in local
// storage"). Sensitive PII fields (customer email, Stripe customer IDs) are
// encrypted with AES-256-GCM before they are written to disk and decrypted when
// they are loaded back into memory — while every in-memory operation keeps
// working on plaintext values, so nothing in the rest of the app changes.
//
// SAFETY MODEL (non-breaking by design):
//   • Key comes from DATA_ENCRYPTION_KEY (hex, >= 32 bytes / 64 hex chars).
//   • If the key is UNSET, encrypt() is a no-op (returns the plaintext) and
//     decrypt() passes values through untouched → the app works exactly as
//     before on Render, where the key may not be configured.
//   • If a stored value cannot be decrypted (key rotated/lost/corrupt),
//     decrypt() FAILS SOFT: it logs a warning and returns the raw value
//     unchanged rather than throwing, so billing never breaks on a key issue.
//   • Encrypted values are objects { iv, ct, tag } (hex). Plaintext strings and
//     non-string values pass through untouched, making the format self-describing.
// ============================================================================
'use strict';

const crypto = require('crypto');

const KEY = (() => {
  const raw = process.env.DATA_ENCRYPTION_KEY || '';
  if (!raw) return null;
  try {
    // Accept 32-byte raw or 64-hex-char; normalize to a 32-byte Buffer.
    const hex = raw.length === 64 && /^[0-9a-fA-F]{64}$/.test(raw) ? raw : Buffer.from(raw, 'utf8').toString('hex');
    const buf = Buffer.from(hex, 'hex');
    if (buf.length < 32) throw new Error('key too short');
    return buf.slice(0, 32);
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[at-rest] DATA_ENCRYPTION_KEY invalid; encryption disabled (see logs)');
    }
    return null;
  }
})();

const ALGO = 'aes-256-gcm';
const enabled = () => !!KEY;

// Encrypt a single sensitive string value. Non-strings and empty input pass
// through unchanged; disabled mode (no key) passes everything through.
function encryptField(value) {
  if (!enabled()) return value;
  if (value == null || typeof value !== 'string' || value === '') return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('hex'),
    ct: ct.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  });
}

// Decrypt a value previously produced by encryptField. Fail-soft: if it isn't a
// valid envelope, or decryption fails, return the value unchanged + warn once.
function decryptField(value) {
  if (!enabled() || typeof value !== 'string') return value;
  let env;
  try { env = JSON.parse(value); } catch (e) { return value; }
  if (!env || env.v !== 1 || !env.iv || !env.ct || !env.tag) return value;
  try {
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(env.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(env.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(env.ct, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.warn('[at-rest] failed to decrypt field (key changed?): ' + e.message);
    return value;
  }
}

// Map a whitelist of sensitive keys over an object's own enumerable fields.
// Encrypts the listed string fields (and only those); everything else untouched.
function encryptFields(obj, keys) {
  if (!enabled() || !obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = { ...obj };
  for (const k of keys) {
    if (typeof out[k] === 'string') out[k] = encryptField(out[k]);
  }
  return out;
}

// Inverse of encryptFields for a loaded object.
function decryptFields(obj, keys) {
  if (!enabled() || !obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = { ...obj };
  for (const k of keys) {
    if (typeof out[k] === 'string') out[k] = decryptField(out[k]);
  }
  return out;
}

module.exports = { encryptField, decryptField, encryptFields, decryptFields, enabled };
