// backend/rooms/rooms-routes.js — Operative Rooms API (mounted at /api/rooms).
// A "room" is a personal space where a user's forged operative lives. Users can:
//   - view their operative standing in a FLUX-generated scene,
//   - change clothes / wearables (re-using the forge slot system),
//   - browse files they bought + collectables they earned (read-only here).
//
// Endpoints:
//   GET  /:owner            → that owner's room record (creates a default if none).
//   POST /scene  {owner,theme}   → FLUX scene background (server-side token), persist + return URL.
//   POST /wearable {owner,slot,value} → update operative look-build, validated vs forge-core ASSETS.
//   GET  /image/:file       → serve a generated scene PNG (path-safe).
//
// HARD RULES: HF token is SERVER-SIDE ONLY (never returned to client). No mock images.
// The existing data/agent-rooms.json shape is PRESERVED — we only add keys, never clobber.
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

// forge-core is required READ-ONLY — rooms reuse its SLOTS/ASSETS for "change clothes".
const forge = require('../forge/forge-core');

const router = express.Router();

const HF_API = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
const hf = require('../lib/hf-keys'); // HF key pool + auto-rotation (shared with forge)
const DATA_DIR = path.join(__dirname, '..', 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'agent-rooms.json');
const IMG_DIR = path.join(DATA_DIR, 'agent-rooms-images');

// Curated scene themes → FLUX fragment. The UI shows these as a theme picker, but any
// free-text theme is also accepted (sanitised) so the room never feels boxed-in.
const THEMES = {
  'neon-loft':        'a neon cyberpunk penthouse loft, floor-to-ceiling rain-streaked windows, magenta and teal city glow, holographic desk',
  'crystal-sanctum':  'a crystal forest sanctum, towering glowing amethyst crystals, bioluminescent moss, shafts of golden light, mystic temple',
  'command-center':   'a futuristic trading-floor command center, curved wall of glowing market screens, dark glass, gold and teal data streams',
  'void-observatory': 'a deep-space observatory chamber, panoramic window onto a swirling nebula, suspended holographic star charts, ambient blue glow',
  'sakura-dojo':      'a serene cyber-dojo, sliding shoji screens, drifting sakura petals, paper lanterns, neon-trimmed tatami, tranquil',
  'matrix-vault':     'a dark digital vault, cascading green matrix code on the walls, mirrored black floor, server-rack monoliths, eerie glow',
};
const SCENE_STYLE = 'wide cinematic interior establishing shot, empty room with a clear central floor, dramatic volumetric lighting, atmospheric depth, ray-traced reflections, ultra detailed, no people, no text, no watermark';

// ---------------------------------------------------------------------------
// IO helpers (atomic-ish: write temp then rename, so a crash mid-write can't
// truncate the shared agent-rooms.json that other features depend on).
// ---------------------------------------------------------------------------
function ensureDirs() {
  for (const d of [DATA_DIR, IMG_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
function loadRooms() {
  try { return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); } catch { return {}; }
}
function saveRooms(obj) {
  ensureDirs();
  const tmp = ROOMS_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, ROOMS_FILE); // atomic on same volume
}

function hfToken() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN;
  if (process.env.HUGGINGFACE_API_KEY) return process.env.HUGGINGFACE_API_KEY;
  // dev fallback shared with the forge: backend/data/runtime-keys.json { "HF_TOKEN": "..." }
  try {
    const k = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'runtime-keys.json'), 'utf8'));
    return k.HF_TOKEN || k.HUGGINGFACE_API_KEY || '';
  } catch { return ''; }
}

// Build the exact FLUX prompt for a room scene (exported-shape kept simple for tests).
function buildScenePrompt(theme) {
  const key = String(theme || '').toLowerCase().trim();
  let frag = THEMES[key];
  if (!frag) {
    // free-text theme: sanitise to a safe descriptive fragment
    const clean = String(theme || 'a sleek operative habitat').replace(/[^\w\s,'-]/g, '').slice(0, 120).trim();
    frag = clean ? `a ${clean}, richly detailed interior` : 'a sleek operative habitat, richly detailed interior';
  }
  return `${frag}, ${SCENE_STYLE}`;
}

async function fluxImage(prompt, token) {
  const r = await fetch(HF_API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'x-wait-for-model': 'true',
    },
    body: JSON.stringify({ inputs: prompt }),
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.startsWith('image')) {
    let detail = `HF ${r.status}`;
    try { const t = await r.text(); detail += ' ' + t.slice(0, 200); } catch {}
    // 402 = credits depleted — surface a real, specific error (no fake image).
    const err = new Error(detail);
    err.status = r.status;
    throw err;
  }
  return Buffer.from(await r.arrayBuffer());
}

// Default operative look = the "ghost" archetype loadout (every slot valid).
function defaultBuild() {
  return forge.loadoutFor('ghost');
}

// Ensure a room record exists for owner, PRESERVING any pre-existing keys
// (state, mood, items, updatedAt …) already stored by other features.
function ensureRoom(owner) {
  const rooms = loadRooms();
  const existing = rooms[owner] || {};
  let changed = false;
  if (!existing.build || forge.validateBuild(existing.build).length) {
    existing.build = defaultBuild();
    changed = true;
  }
  if (!existing.theme) { existing.theme = 'neon-loft'; changed = true; }
  if (!Array.isArray(existing.files)) { existing.files = existing.files || []; }
  if (!Array.isArray(existing.collectables)) {
    // carry over any legacy "items" as collectables (non-destructive: keep items too)
    existing.collectables = Array.isArray(existing.items) ? existing.items.slice() : [];
  }
  if (!existing.scene) { existing.scene = null; } // {url, theme, prompt, at}
  if (changed) {
    existing.updatedAt = new Date().toISOString();
    rooms[owner] = existing;
    saveRooms(rooms);
  }
  return existing;
}

// ---------------------------------------------------------------------------
// GET /api/rooms/meta  → static catalogue for the UI (themes + slot assets).
// Placed BEFORE /:owner so it isn't swallowed by the param route.
// ---------------------------------------------------------------------------
router.get('/meta', (_req, res) => {
  const slots = {};
  for (const s of forge.SLOTS) {
    slots[s] = Object.entries(forge.ASSETS[s]).map(([key, v]) => ({ key, name: v.name }));
  }
  const themes = Object.keys(THEMES).map(k => ({
    key: k,
    label: k.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
  }));
  res.json({ ok: true, slots, slotOrder: forge.SLOTS, themes });
});

// GET /api/rooms/image/<file>  → serve a generated scene PNG (path-safe).
router.get('/image/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const fp = path.join(IMG_DIR, safe);
  if (!fp.startsWith(IMG_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  res.type('png').send(fs.readFileSync(fp));
});

// GET /api/rooms/:owner  → that owner's room record (creates default if none).
router.get('/:owner', (req, res) => {
  try {
    const owner = String(req.params.owner || 'anon');
    const room = ensureRoom(owner);
    const rarity = (room.build && !forge.validateBuild(room.build).length) ? forge.rarityOf(room.build) : 'common';
    res.json({ ok: true, owner, room, rarity });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/rooms/wearable  { owner, slot, value }  → change clothes / look slot.
router.post('/wearable', express.json({ limit: '64kb' }), (req, res) => {
  try {
    const { owner = 'anon', slot, value } = req.body || {};
    if (!forge.SLOTS.includes(slot)) {
      return res.status(400).json({ ok: false, error: `invalid slot: ${slot}` });
    }
    if (!(value in forge.ASSETS[slot])) {
      return res.status(400).json({ ok: false, error: `invalid ${slot} value: ${value}` });
    }
    const rooms = loadRooms();
    const room = rooms[owner] || ensureRoom(owner);
    // ensureRoom may have written; re-read so we don't lose its default-build write.
    const fresh = loadRooms();
    const r = fresh[owner] || room;
    if (!r.build || forge.validateBuild(r.build).length) r.build = defaultBuild();
    r.build.slots[slot] = value;
    r.updatedAt = new Date().toISOString();
    fresh[owner] = r;
    saveRooms(fresh);
    res.json({ ok: true, owner, slot, value, build: r.build, rarity: forge.rarityOf(r.build) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/rooms/scene  { owner, theme }  → generate + persist a FLUX scene.
router.post('/scene', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const owner = String((req.body && req.body.owner) || 'anon');
    const theme = (req.body && req.body.theme) || 'neon-loft';
    const prompt = buildScenePrompt(theme);

    if (!hf.keys().length) {
      // No token → DO NOT fake an image. Return 503 + the exact prompt that would be sent.
      return res.status(503).json({
        ok: false,
        error: 'No HF token configured. Set HF_TOKENS env (or backend/data/runtime-keys.json). Rooms render scenes with a real Hugging Face token — no mock.',
        prompt,
      });
    }

    let img;
    try {
      img = await hf.generate(prompt); // rotates across keys on depletion
    } catch (e) {
      const status = e.status === 402 ? 402 : 502;
      const msg = e.status === 402
        ? 'Hugging Face image credits are depleted (HTTP 402). Add credits or a new HF token to render rooms.'
        : 'room scene render failed';
      return res.status(status).json({ ok: false, error: msg, detail: e.message });
    }

    ensureDirs();
    const ts = Date.now();
    const file = `${String(owner).replace(/[^\w.-]/g, '_')}-${ts}.png`;
    fs.writeFileSync(path.join(IMG_DIR, file), img);
    const url = `/api/rooms/image/${file}`;

    // persist the scene on the room record (preserving everything else)
    const rooms = loadRooms();
    const r = rooms[owner] || ensureRoom(owner);
    const fresh = loadRooms();
    const rec = fresh[owner] || r;
    rec.theme = String(theme);
    rec.scene = { url, theme: String(theme), prompt, at: ts };
    rec.scenes = Array.isArray(rec.scenes) ? rec.scenes : [];
    rec.scenes.unshift({ url, theme: String(theme), at: ts });
    rec.scenes = rec.scenes.slice(0, 12); // cap history
    rec.updatedAt = new Date().toISOString();
    fresh[owner] = rec;
    saveRooms(fresh);

    res.json({ ok: true, owner, theme: String(theme), prompt, image: url, scene: rec.scene });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// expose pure helpers for tests/harness
router.buildScenePrompt = buildScenePrompt;
router.THEMES = THEMES;

module.exports = router;
