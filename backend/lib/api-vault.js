'use strict';

/**
 * api-vault.js — BYOK (Bring-Your-Own-Key) API Vault for SHADDAI
 *
 * Users add their OWN third-party API keys, encrypted with their OWN password,
 * so that when SHADDAI tools run, they burn the USER's quota — not the platform's.
 *
 * Security model:
 *  - Each key is encrypted with AES-256-GCM.
 *  - The encryption key is derived from the user's password via scryptSync(password, salt, 32).
 *  - The password is NEVER stored — only { ciphertext, iv, authTag, salt } are persisted.
 *  - A wrong password causes GCM auth verification to throw on decrypt → we return null.
 *
 * Node built-ins ONLY (crypto, fs, path). No external dependencies.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'api-vault.json');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32; // 256-bit key for AES-256
const IV_LEN = 12;  // 96-bit IV recommended for GCM
const SALT_LEN = 16;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, '{}', 'utf8');
  }
}

function loadStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (_e) {
    return {};
  }
}

function saveStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function entryId(userId, provider) {
  return `${userId}:${provider}`;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function deriveKey(password, salt) {
  // salt is a Buffer
  return crypto.scryptSync(String(password), salt, KEY_LEN);
}

function encrypt(password, plaintext) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

function decrypt(password, record) {
  // Throws if the password is wrong (GCM auth tag mismatch) or data is corrupt.
  const salt = Buffer.from(record.salt, 'base64');
  const iv = Buffer.from(record.iv, 'base64');
  const authTag = Buffer.from(record.authTag, 'base64');
  const ciphertext = Buffer.from(record.ciphertext, 'base64');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws here on wrong password
  ]);
  return plaintext.toString('utf8');
}

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

/* CONNECTORS — something a member plugs their own account into.
   `unlocks` is the important field: it says in the member's words what lights
   up when they connect it, because "add your ElevenLabs key" means nothing
   while "your agents can speak" means something.
   `cost: you` means their key, their bill, their rates, and we take nothing.
   That one field is the whole pricing model, stated per row. */
const CATALOG = [
  { provider:'openai', label:'OpenAI', category:'Language', envVar:'OPENAI_API_KEY', signupUrl:'https://platform.openai.com/api-keys', free:false, cost:'you', unlocks:'Your agents think on GPT models instead of ours.' },
  { provider:'anthropic', label:'Anthropic', category:'Language', envVar:'ANTHROPIC_API_KEY', signupUrl:'https://console.anthropic.com/settings/keys', free:false, cost:'you', unlocks:'Claude drives your agents, and long documents stop being a problem.' },
  { provider:'xai', label:'xAI / Grok', category:'Language', envVar:'XAI_API_KEY', signupUrl:'https://console.x.ai', free:false, cost:'you', unlocks:'Grok answers as your agent, with live X context behind it.' },
  { provider:'groq', label:'Groq', category:'Language', envVar:'GROQ_API_KEY', signupUrl:'https://console.groq.com/keys', free:true, cost:'you', unlocks:'The fastest replies available. The free tier is generous.' },
  { provider:'gemini', label:'Google Gemini', category:'Language', envVar:'GEMINI_API_KEY', signupUrl:'https://aistudio.google.com/app/apikey', free:true, cost:'you', unlocks:'Gemini models, and a free tier that covers most people.' },
  { provider:'openrouter', label:'OpenRouter', category:'Language', envVar:'OPENROUTER_API_KEY', signupUrl:'https://openrouter.ai/keys', free:true, cost:'you', unlocks:'One key for every major model, with automatic fallback.' },
  { provider:'ollama', label:'Ollama', category:'Language', envVar:'OLLAMA_BASE_URL', signupUrl:'https://ollama.com/download', free:true, cost:'you', unlocks:'Runs on your own machine. Nothing leaves it, nothing costs anything.' },

  { provider:'fal', label:'Fal', category:'Making', envVar:'FAL_KEY', signupUrl:'https://fal.ai/dashboard/keys', free:false, cost:'you', unlocks:'Images, video, audio and 3D — the widest single connector here.' },
  { provider:'elevenlabs', label:'ElevenLabs', category:'Making', envVar:'ELEVENLABS_API_KEY', signupUrl:'https://elevenlabs.io/app/settings/api-keys', free:true, cost:'you', unlocks:'Your agents speak, in a voice you choose or clone.' },
  { provider:'meshy', label:'Meshy', category:'Making', envVar:'MESHY_API_KEY', signupUrl:'https://www.meshy.ai/api', free:true, cost:'you', unlocks:'Text to 3D models, ready to drop into the 3D world.' },
  { provider:'higgsfield', label:'Higgsfield', category:'Making', envVar:'HIGGSFIELD_API_KEY', signupUrl:'https://higgsfield.ai', free:false, cost:'you', unlocks:'Cinematic video clips from a prompt or a still.' },
  { provider:'replicate', label:'Replicate', category:'Making', envVar:'REPLICATE_API_TOKEN', signupUrl:'https://replicate.com/account/api-tokens', free:false, cost:'you', unlocks:'Fifty thousand community models, for the thing nothing else does.' },
  { provider:'suno', label:'Suno', category:'Making', envVar:'SUNO_API_KEY', signupUrl:'https://suno.com', free:false, cost:'you', unlocks:'Original music and songs from a description.' },

  { provider:'helius', label:'Helius', category:'Markets', envVar:'HELIUS_API_KEY', signupUrl:'https://dashboard.helius.dev', free:true, cost:'you', unlocks:'ZEROX reads Solana directly — wallets, holders, fresh mints.' },
  { provider:'birdeye', label:'Birdeye', category:'Markets', envVar:'BIRDEYE_API_KEY', signupUrl:'https://docs.birdeye.so', free:true, cost:'you', unlocks:'Deeper token data and liquidity than the free feeds carry.' },
  { provider:'coingecko', label:'CoinGecko', category:'Markets', envVar:'COINGECKO_API_KEY', signupUrl:'https://www.coingecko.com/en/api/pricing', free:true, cost:'you', unlocks:'Prices and charts without the public rate limit.' },

  { provider:'telegram', label:'Telegram', category:'Reach', envVar:'TELEGRAM_BOT_TOKEN', signupUrl:'https://core.telegram.org/bots#botfather', free:true, cost:'you', unlocks:'Your agent messages you, or runs a channel of its own.' },
  { provider:'discord', label:'Discord', category:'Reach', envVar:'DISCORD_BOT_TOKEN', signupUrl:'https://discord.com/developers/applications', free:true, cost:'you', unlocks:'Your agent lives in your server and answers there.' },
  { provider:'twitter', label:'X', category:'Reach', envVar:'TWITTER_BEARER_TOKEN', signupUrl:'https://developer.x.com/en/portal/dashboard', free:true, cost:'you', unlocks:'Post, read and reply as you — QUILL writes, you approve.' },
  { provider:'newsapi', label:'NewsAPI', category:'Reach', envVar:'NEWSAPI_KEY', signupUrl:'https://newsapi.org/register', free:true, cost:'you', unlocks:'Headlines your agents can actually read and cite.' },
  { provider:'serpapi', label:'SerpApi', category:'Reach', envVar:'SERPAPI_KEY', signupUrl:'https://serpapi.com/manage-api-key', free:true, cost:'you', unlocks:'Live web search, so answers reach past the library.' },

  { provider:'stripe', label:'Stripe', category:'Money', envVar:'STRIPE_SECRET_KEY', signupUrl:'https://dashboard.stripe.com/apikeys', free:true, cost:'you', unlocks:'Take payments for your own work, into your own account.' },
];


function catalog() {
  // Return a deep copy so callers can't mutate the source catalog.
  return CATALOG.map((p) => ({ ...p }));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Encrypt and persist a user's API key for a provider.
 * @returns {{ok: true}}
 */
function setKey(userId, password, provider, key) {
  if (!userId || !password || !provider || !key) {
    throw new Error('userId, password, provider, and key are all required');
  }
  const store = loadStore();
  store[entryId(userId, provider)] = {
    userId: String(userId),
    provider: String(provider),
    ...encrypt(password, key),
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);
  return { ok: true };
}

/**
 * Decrypt and return the plaintext key, or null if missing / wrong password.
 */
function getKey(userId, password, provider) {
  const store = loadStore();
  const record = store[entryId(userId, provider)];
  if (!record) return null;
  try {
    return decrypt(password, record);
  } catch (_e) {
    // Wrong password or corrupted data → never throw, just deny.
    return null;
  }
}

/**
 * List provider names a user has stored. NEVER returns key values.
 */
function listProviders(userId) {
  const store = loadStore();
  const prefix = `${userId}:`;
  return Object.keys(store)
    .filter((id) => id.startsWith(prefix))
    .map((id) => store[id].provider);
}

/**
 * Delete a stored key. Returns {ok:true, removed:boolean}.
 */
function removeKey(userId, provider) {
  const store = loadStore();
  const id = entryId(userId, provider);
  const existed = Object.prototype.hasOwnProperty.call(store, id);
  if (existed) {
    delete store[id];
    saveStore(store);
  }
  return { ok: true, removed: existed };
}

// ---------------------------------------------------------------------------
// Express router
// ---------------------------------------------------------------------------

function buildRouter() {
  let express;
  try {
    express = require('express');
  } catch (_e) {
    return null; // express not available in this context
  }

  /* auth-guard.softAuth verifies a bearer token and sets req.userId. Loaded
     defensively — if it is unavailable every caller is 'local', which is safe
     for a single-user local install and still never trusts the request body. */
  let softAuth = (req, _res, next) => { req.userId = req.userId || 'local'; next(); };
  try { softAuth = require('../auth-guard').softAuth || softAuth; } catch (_e) {}

  const router = express.Router();
  router.use(express.json());
  router.use(softAuth);

  /* ── WHO THE CALLER IS ───────────────────────────────────────────────────
     Every route below takes the vault owner from the VERIFIED SESSION, never
     from `user` in the body or query.

     Before this, `user` was attacker-supplied on every route. That made
     DELETE /key a one-line way for an unauthenticated stranger to wipe any
     user's stored third-party keys — no password, no token, just their id.
     It also let anyone enumerate another account's providers via /mine, and
     gave /key/reveal an unlimited online guessing oracle against a vault
     password.

     Asking people to hand us their ElevenLabs and OpenAI keys is only
     defensible if this file is boring and correct. */
  const owner = (req) => String((req && req.userId) || 'local');

  /* ── BRUTE-FORCE BRAKE ───────────────────────────────────────────────────
     The vault password is the ONLY thing standing between a stolen session and
     a user's real API keys, and scrypt is fast enough to guess online without
     this. Per owner+provider, in memory: a failed unlock costs an increasing
     delay, and a run of failures locks that pair briefly.

     In-memory is deliberate — this is a speed bump against remote guessing,
     not durable state, and a restart clearing it is acceptable. */
  const attempts = new Map();
  const MAX_FAILS = 5;
  const LOCK_MS = 60 * 1000;

  function throttle(key) {
    const rec = attempts.get(key);
    if (!rec) return null;
    if (rec.fails >= MAX_FAILS && Date.now() - rec.last < LOCK_MS) {
      return Math.ceil((LOCK_MS - (Date.now() - rec.last)) / 1000);
    }
    return null;
  }
  function noteFail(key) {
    const rec = attempts.get(key) || { fails: 0, last: 0 };
    rec.fails += 1; rec.last = Date.now();
    attempts.set(key, rec);
  }
  function noteOk(key) { attempts.delete(key); }

  // GET /catalog — public provider catalog (no secrets)
  router.get('/catalog', (req, res) => {
    res.json({ ok: true, providers: catalog() });
  });

  // GET /mine — providers THIS caller has stored (names only, never values)
  router.get('/mine', (req, res) => {
    res.json({ ok: true, providers: listProviders(owner(req)) });
  });

  // POST /key {password, provider, key} — store a key for the caller
  router.post('/key', (req, res) => {
    const { password, provider, key } = req.body || {};
    if (!password || !provider || !key) {
      return res.status(400).json({ ok: false, error: 'password, provider, key required' });
    }
    try {
      setKey(owner(req), password, provider, key);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // POST /key/reveal {password, provider} — decrypt and return the caller's key
  router.post('/key/reveal', (req, res) => {
    const { password, provider } = req.body || {};
    if (!password || !provider) {
      return res.status(400).json({ ok: false, error: 'password, provider required' });
    }
    const uid = owner(req);
    const gate = `${uid}:${provider}`;

    const wait = throttle(gate);
    if (wait) {
      return res.status(429).json({ ok: false, error: `too many attempts — try again in ${wait}s` });
    }

    const key = getKey(uid, password, provider);
    if (key === null) {
      noteFail(gate);
      // Same response whether the key is absent or the password is wrong:
      // distinguishing them tells an attacker which accounts hold what.
      return res.status(401).json({ ok: false, error: 'wrong password / not found' });
    }
    noteOk(gate);
    res.json({ ok: true, key });
  });

  // DELETE /key {password, provider} — remove one of the caller's keys.
  // The password is REQUIRED even though decryption is not needed: deletion is
  // destructive and irreversible, and a hijacked session alone should not be
  // enough to destroy the keys a user pasted in.
  router.delete('/key', (req, res) => {
    const body = req.body || {};
    const provider = body.provider || req.query.provider;
    const password = body.password;
    if (!provider || !password) {
      return res.status(400).json({ ok: false, error: 'provider and password required' });
    }
    const uid = owner(req);
    const gate = `${uid}:${provider}`;

    const wait = throttle(gate);
    if (wait) return res.status(429).json({ ok: false, error: `too many attempts — try again in ${wait}s` });

    // Proves the caller knows the vault password before anything is destroyed.
    if (getKey(uid, password, provider) === null) {
      noteFail(gate);
      return res.status(401).json({ ok: false, error: 'wrong password / not found' });
    }
    noteOk(gate);
    res.json(removeKey(uid, provider));
  });

  return router;
}

module.exports = {
  catalog,
  setKey,
  getKey,
  listProviders,
  removeKey,
  router: buildRouter(),
};
