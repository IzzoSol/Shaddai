'use strict';

/**
 * SHADDAI social-keys.js
 * BYOK (bring-your-own-key) storage for social posting providers (X + Telegram).
 *
 * Precedence: environment variables ALWAYS win over the saved file, so a
 * production deploy that sets keys in the env is never overridden by a locally
 * saved key. When the env var is absent we fall back to backend/data/social-keys.json
 * (gitignored) so a user who saves keys via POST /api/social/keys can post
 * without restarting the server.
 *
 * The file is read fresh on every call (no cache) so newly-saved keys take
 * effect immediately for the tools in tools-social.js.
 */

const fs   = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, 'data', 'social-keys.json');

function loadFile() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) || {}; }
  catch { return {}; }
}

function saveFile(obj) {
  try { fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true }); } catch {}
  fs.writeFileSync(KEYS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

/** Keep only allowed non-empty string fields. */
function pick(src, allowed) {
  const out = {};
  if (src && typeof src === 'object') {
    for (const k of allowed) {
      if (src[k] != null && String(src[k]).trim() !== '') out[k] = String(src[k]).trim();
    }
  }
  return out;
}

/** Effective X/Twitter keys — env first, saved file as fallback. */
function getXKeys() {
  const f = loadFile().x || {};
  return {
    apiKey:       process.env.X_API_KEY       || f.apiKey       || '',
    apiSecret:    process.env.X_API_SECRET    || f.apiSecret    || '',
    accessToken:  process.env.X_ACCESS_TOKEN  || f.accessToken  || '',
    accessSecret: process.env.X_ACCESS_SECRET || f.accessSecret || '',
    bearer:       process.env.X_BEARER_TOKEN  || f.bearer       || '',
  };
}

/** Effective Telegram keys — env first, saved file as fallback. */
function getTelegramKeys() {
  const f = loadFile().telegram || {};
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || f.botToken || '',
    chatId:   process.env.TELEGRAM_CHAT_ID   || f.chatId   || '',
  };
}

/**
 * Merge-save keys for one provider. Returns the current status() after saving.
 * @param {'x'|'telegram'} provider
 * @param {object} keys
 */
function saveKeys(provider, keys) {
  const p = String(provider || '').toLowerCase();
  const cur = loadFile();
  if (p === 'x') {
    cur.x = { ...(cur.x || {}), ...pick(keys, ['apiKey', 'apiSecret', 'accessToken', 'accessSecret', 'bearer']) };
  } else if (p === 'telegram') {
    cur.telegram = { ...(cur.telegram || {}), ...pick(keys, ['botToken', 'chatId']) };
  } else {
    throw new Error('provider must be "x" or "telegram"');
  }
  saveFile(cur);
  return status();
}

/**
 * Provider readiness. `x` is true when the 4 OAuth1.0a posting keys are present
 * (posting is the primary capability); `telegram` is true when a bot token exists.
 */
function status() {
  const x  = getXKeys();
  const tg = getTelegramKeys();
  return {
    x: !!(x.apiKey && x.apiSecret && x.accessToken && x.accessSecret),
    telegram: !!tg.botToken,
  };
}

module.exports = { getXKeys, getTelegramKeys, saveKeys, status, KEYS_FILE };
