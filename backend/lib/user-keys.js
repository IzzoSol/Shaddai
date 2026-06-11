'use strict';
/**
 * Per-user encrypted API-key store (BYOK).
 *
 * Each signed-in user's third-party keys are encrypted at rest (AES-256-GCM)
 * with a server master secret (KEY_ENC_SECRET, env-only) and stored under their
 * own user id — isolated per user, never shared, never returned to the browser.
 *
 * Threat model (honest): protects against stolen disk/backup/DB dumps and
 * accidental leaks (the data is useless without KEY_ENC_SECRET). It does NOT
 * protect against a full live-server compromise — standard SaaS posture, and
 * the keys are rotatable third-party tokens (not funds). Render holds the infra.
 *
 * Store: backend/data/user-keys.json (gitignored) = { "<uid>": { "<ENV>": {iv,tag,ct} } }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'user-keys.json');
const ALGO = 'aes-256-gcm';

// Derive a stable 32-byte key from the server secret. A dev fallback keeps local
// running, but real deployments MUST set KEY_ENC_SECRET (warned once at boot).
let _warned = false;
function masterKey() {
  let secret = process.env.KEY_ENC_SECRET;
  if (!secret) {
    if (!_warned) { console.warn('[user-keys] KEY_ENC_SECRET not set — using DEV fallback. Set a strong KEY_ENC_SECRET in Render/.env for production.'); _warned = true; }
    secret = 'shaddai-dev-fallback-key-change-me';
  }
  return crypto.scryptSync(String(secret), 'shaddai-user-keys-v1', 32);
}

let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { _cache = {}; }
  if (!_cache || typeof _cache !== 'object') _cache = {};
  return _cache;
}
function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(_cache || {}, null, 2), 'utf8'); }
  catch (_) { /* best-effort */ }
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}
function decrypt(rec) {
  try {
    const decipher = crypto.createDecipheriv(ALGO, masterKey(), Buffer.from(rec.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(rec.tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(rec.ct, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch (_) { return ''; } // wrong key / tampered → empty
}

/** Get one decrypted key for a user (or '' if not set / undecryptable). */
function getKey(userId, env) {
  if (!userId || !env) return '';
  const u = load()[String(userId)];
  if (!u || !u[env]) return '';
  return decrypt(u[env]);
}
/** Set (empty value clears) a user's key for an env name. Never logs the value. */
function setKey(userId, env, value) {
  if (!userId || !env) return false;
  const store = load();
  const uid = String(userId);
  if (!store[uid]) store[uid] = {};
  if (value == null || String(value).trim() === '') delete store[uid][env];
  else store[uid][env] = encrypt(String(value).trim());
  _cache = store; save();
  return true;
}
/** Env names this user has saved (for the UI — names only, never values). */
function providersFor(userId) {
  const u = load()[String(userId)];
  return u ? Object.keys(u) : [];
}
/** Booleans per env name — does this user have it? */
function statusFor(userId, names) {
  const out = {};
  (names || []).forEach(n => { out[n] = Boolean(getKey(userId, n)); });
  return out;
}

module.exports = { getKey, setKey, providersFor, statusFor };
