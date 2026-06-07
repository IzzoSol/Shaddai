'use strict';
/**
 * Central API-key resolver — the bridge between the "Connect your APIs" UI and every tool.
 *
 * Resolution order for keys.get(NAME):
 *   1) runtime store (backend/data/runtime-keys.json) — set by the user in the API tab
 *   2) process.env[NAME] — keys configured in .env / Render dashboard
 *
 * So a key pasted in the dashboard is used everywhere immediately, with .env as fallback.
 * Values are NEVER sent to the browser — status()/list() return booleans only.
 * The store file is gitignored (see .gitignore).
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'runtime-keys.json');

let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = {}; }
  if (!_cache || typeof _cache !== 'object') _cache = {};
  return _cache;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(_cache || {}, null, 2), 'utf8');
  } catch (_) { /* best-effort */ }
}

/** Get a key by env-style name (e.g. 'GROQ_API_KEY'). Runtime store wins, then env. */
function get(name) {
  if (!name) return '';
  const store = load();
  const v = store[name];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return process.env[name] || '';
}

/** Set (or clear, with empty value) a key at runtime. Never logs the value. */
function set(name, value) {
  if (!name || typeof name !== 'string') return false;
  const store = load();
  if (value == null || String(value).trim() === '') delete store[name];
  else store[name] = String(value).trim();
  _cache = store; save();
  return true;
}

/** Booleans only — is each provider key present (runtime OR env)? Never reveals values. */
function status(names) {
  const out = {};
  (names || []).forEach(n => { out[n] = Boolean(get(n)); });
  return out;
}

/** Names of keys configured at runtime (for the UI to show what the user has saved). */
function listRuntime() { return Object.keys(load()); }

// ── Curated provider catalog — what the "Connect your APIs" UI offers. ──
// Each: { id, label, env (the env var name tools read), category, free, help }
const CATALOG = [
  { id:'groq',        label:'Groq (fast LLM)',        env:'GROQ_API_KEY',        category:'AI / LLM',  free:true,  help:'console.groq.com/keys — free, powers instant agents' },
  { id:'gemini',      label:'Google Gemini',          env:'GEMINI_API_KEY',      category:'AI / LLM',  free:true,  help:'aistudio.google.com/app/apikey — free tier' },
  { id:'openrouter',  label:'OpenRouter',             env:'OPENROUTER_API_KEY',  category:'AI / LLM',  free:true,  help:'openrouter.ai/keys — free models available' },
  { id:'anthropic',   label:'Anthropic (Claude)',     env:'ANTHROPIC_API_KEY',   category:'AI / LLM',  free:false, help:'console.anthropic.com — premium reasoning' },
  { id:'openai',      label:'OpenAI (GPT/DALL·E)',    env:'OPENAI_API_KEY',      category:'AI / LLM',  free:false, help:'platform.openai.com/api-keys' },
  { id:'huggingface', label:'Hugging Face (FLUX img)',env:'HF_TOKEN',            category:'Image',     free:true,  help:'huggingface.co/settings/tokens — free FLUX images' },
  { id:'together',    label:'Together AI (FLUX)',     env:'TOGETHER_API_KEY',    category:'Image',     free:false, help:'api.together.xyz' },
  { id:'fal',         label:'fal.ai (FLUX, fast)',    env:'FAL_KEY',             category:'Image',     free:false, help:'fal.ai/dashboard/keys' },
  { id:'pika',        label:'Pika (video)',           env:'PIKA_API_KEY',        category:'Video',     free:false, help:'pika.art' },
  { id:'runway',      label:'Runway (video)',         env:'RUNWAY_API_KEY',      category:'Video',     free:false, help:'dev.runwayml.com' },
  { id:'kling',       label:'Kling (video)',          env:'KLING_API_KEY',       category:'Video',     free:false, help:'klingai.com' },
  { id:'heygen',      label:'HeyGen (avatar video)',  env:'HEYGEN_API_KEY',      category:'Video',     free:false, help:'heygen.com' },
  { id:'elevenlabs',  label:'ElevenLabs (voice/TTS)', env:'ELEVENLABS_API_KEY',  category:'Audio',     free:false, help:'elevenlabs.io' },
  { id:'suno',        label:'Suno (music)',           env:'SUNO_API_KEY',        category:'Audio',     free:false, help:'suno.ai' },
  { id:'serpapi',     label:'SerpAPI (web search)',   env:'SERPAPI_KEY',         category:'Research',  free:false, help:'serpapi.com' },
  { id:'newsapi',     label:'NewsAPI',                env:'NEWSAPI_API_KEY',     category:'Research',  free:true,  help:'newsapi.org — free tier' },
  { id:'telegram',    label:'Telegram bot',           env:'TELEGRAM_BOT_TOKEN',  category:'Social',    free:true,  help:'@BotFather — free' },
  { id:'helius',      label:'Helius (Solana RPC)',    env:'HELIUS_API_KEY',      category:'Crypto',    free:true,  help:'helius.dev — free tier' },
  { id:'stripe',      label:'Stripe (card payments)', env:'STRIPE_SECRET_KEY',   category:'Payments',  free:false, help:'dashboard.stripe.com/apikeys' }
];
function catalog() {
  return CATALOG.map(p => ({ ...p, connected: Boolean(get(p.env)) }));
}

// ── Express router: /api/keys ──
function router() {
  const express = require('express');
  const r = express.Router();
  const json = express.json();
  r.get('/catalog', (_req, res) => res.json({ ok: true, providers: catalog() }));
  r.get('/status', (_req, res) => res.json({ ok: true, status: status(CATALOG.map(p => p.env)) }));
  r.post('/set', json, (req, res) => {
    const { env, value } = req.body || {};
    if (!env || !CATALOG.find(p => p.env === env)) return res.status(400).json({ ok: false, error: 'unknown provider env' });
    set(env, value);
    res.json({ ok: true, env, connected: Boolean(get(env)) });
  });
  return r;
}

module.exports = { get, set, status, listRuntime, catalog, CATALOG, router };
