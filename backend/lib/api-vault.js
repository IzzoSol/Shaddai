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

const CATALOG = [
  // LLM
  { provider: 'openai',       label: 'OpenAI',          category: 'LLM',      envVar: 'OPENAI_API_KEY',       signupUrl: 'https://platform.openai.com/api-keys',          free: false },
  { provider: 'anthropic',    label: 'Anthropic',       category: 'LLM',      envVar: 'ANTHROPIC_API_KEY',    signupUrl: 'https://console.anthropic.com/settings/keys',   free: false },
  { provider: 'groq',         label: 'Groq',            category: 'LLM',      envVar: 'GROQ_API_KEY',         signupUrl: 'https://console.groq.com/keys',                 free: true  },
  { provider: 'gemini',       label: 'Google Gemini',   category: 'LLM',      envVar: 'GEMINI_API_KEY',       signupUrl: 'https://aistudio.google.com/app/apikey',        free: true  },
  { provider: 'openrouter',   label: 'OpenRouter',      category: 'LLM',      envVar: 'OPENROUTER_API_KEY',   signupUrl: 'https://openrouter.ai/keys',                    free: true  },

  // Image / Music / Voice
  { provider: 'suno',         label: 'Suno',            category: 'Music',    envVar: 'SUNO_API_KEY',         signupUrl: 'https://suno.com',                              free: false },
  { provider: 'elevenlabs',   label: 'ElevenLabs',      category: 'Voice',    envVar: 'ELEVENLABS_API_KEY',   signupUrl: 'https://elevenlabs.io/app/settings/api-keys',   free: true  },
  { provider: 'acedatacloud', label: 'AceDataCloud',    category: 'Image',    envVar: 'ACEDATACLOUD_API_KEY', signupUrl: 'https://platform.acedata.cloud',                free: false },

  // Crypto
  { provider: 'helius',       label: 'Helius',          category: 'Crypto',   envVar: 'HELIUS_API_KEY',       signupUrl: 'https://dashboard.helius.dev',                  free: true  },
  { provider: 'birdeye',      label: 'Birdeye',         category: 'Crypto',   envVar: 'BIRDEYE_API_KEY',      signupUrl: 'https://docs.birdeye.so',                       free: true  },
  { provider: 'coingecko',    label: 'CoinGecko',       category: 'Crypto',   envVar: 'COINGECKO_API_KEY',    signupUrl: 'https://www.coingecko.com/en/api/pricing',      free: true  },

  // News
  { provider: 'newsapi',      label: 'NewsAPI',         category: 'News',     envVar: 'NEWSAPI_KEY',          signupUrl: 'https://newsapi.org/register',                  free: true  },
  { provider: 'serpapi',      label: 'SerpApi',         category: 'News',     envVar: 'SERPAPI_KEY',          signupUrl: 'https://serpapi.com/manage-api-key',            free: true  },

  // Social
  { provider: 'telegram',     label: 'Telegram Bot',    category: 'Social',   envVar: 'TELEGRAM_BOT_TOKEN',   signupUrl: 'https://core.telegram.org/bots#botfather',      free: true  },
  { provider: 'discord',      label: 'Discord Bot',     category: 'Social',   envVar: 'DISCORD_BOT_TOKEN',    signupUrl: 'https://discord.com/developers/applications',   free: true  },
  { provider: 'twitter',      label: 'X / Twitter',     category: 'Social',   envVar: 'TWITTER_BEARER_TOKEN', signupUrl: 'https://developer.x.com/en/portal/dashboard',   free: true  },

  // Payments
  { provider: 'stripe',       label: 'Stripe',          category: 'Payments', envVar: 'STRIPE_SECRET_KEY',    signupUrl: 'https://dashboard.stripe.com/apikeys',          free: true  },

  // Security
  { provider: 'virustotal',   label: 'VirusTotal',      category: 'Security', envVar: 'VIRUSTOTAL_API_KEY',   signupUrl: 'https://www.virustotal.com/gui/my-apikey',      free: true  },

  // Storage
  { provider: 'pinata',       label: 'Pinata / IPFS',   category: 'Storage',  envVar: 'PINATA_JWT',           signupUrl: 'https://app.pinata.cloud/developers/api-keys',  free: true  },
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
  const router = express.Router();
  router.use(express.json());

  // GET /catalog — public provider catalog (no secrets)
  router.get('/catalog', (req, res) => {
    res.json({ ok: true, providers: catalog() });
  });

  // GET /mine?user= — providers this user has stored (names only)
  router.get('/mine', (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).json({ ok: false, error: 'user required' });
    res.json({ ok: true, providers: listProviders(user) });
  });

  // POST /key {user,password,provider,key} — store a key
  router.post('/key', (req, res) => {
    const { user, password, provider, key } = req.body || {};
    if (!user || !password || !provider || !key) {
      return res.status(400).json({ ok: false, error: 'user, password, provider, key required' });
    }
    try {
      setKey(user, password, provider, key);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // POST /key/reveal {user,password,provider} — decrypt and return the key
  router.post('/key/reveal', (req, res) => {
    const { user, password, provider } = req.body || {};
    if (!user || !password || !provider) {
      return res.status(400).json({ ok: false, error: 'user, password, provider required' });
    }
    const key = getKey(user, password, provider);
    if (key === null) {
      return res.status(401).json({ ok: false, error: 'wrong password / not found' });
    }
    res.json({ ok: true, key });
  });

  // DELETE /key {user,provider} — remove a stored key
  router.delete('/key', (req, res) => {
    const user = (req.body && req.body.user) || req.query.user;
    const provider = (req.body && req.body.provider) || req.query.provider;
    if (!user || !provider) {
      return res.status(400).json({ ok: false, error: 'user, provider required' });
    }
    const result = removeKey(user, provider);
    res.json(result);
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
