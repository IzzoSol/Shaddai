// backend/forge/forge-routes.js — Operative Forge API (mounted at /api/forge).
// POST /api/forge   → validate build, assemble prompt, call FLUX (server-side
//                     token), persist portrait, return NFT metadata.
// GET  /api/forge/operatives?owner=  → list an owner's forged operatives.
// The HF token NEVER leaves the server.
const express = require('express');
const fs = require('fs');
const path = require('path');
const core = require('./forge-core');
const hf = require('../lib/hf-keys'); // HF key pool + auto-rotation

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const IMG_DIR = path.join(DATA_DIR, 'agent-images');
const ART_DIR = path.join(DATA_DIR, 'forge-art'); // pre-generated premium archetype portraits
const STATE_FILE = path.join(DATA_DIR, 'forge-state.json');

function ensureDirs(){ for (const d of [DATA_DIR, IMG_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function loadState(){ try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { nextTokenId: 1, operatives: [] }; } }
function saveState(s){ fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// (HF calls now go through ../lib/hf-keys → server-side keys + auto-rotation)

// POST /api/forge  { build, owner?, name? }
router.post('/', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    let { build, archetype, owner = 'anon', name = '' } = req.body || {};
    // convenience: caller may pass just {archetype} → loadout the full 9-slot look server-side
    if ((!build || core.validateBuild(build).length) && archetype && core.ARCHETYPES[archetype]) build = core.loadoutFor(archetype);
    const errs = core.validateBuild(build);
    if (errs.length) return res.status(400).json({ ok: false, error: 'invalid build', details: errs });

    if (!hf.keys().length) {
      console.warn('[forge] No HF token configured. Set HF_TOKENS env (or backend/data/runtime-keys.json). Forge needs a real Hugging Face token — no mock.');
      return res.status(503).json({ ok: false, error: 'Image generation is temporarily unavailable — please try again shortly.' });
    }

    ensureDirs();
    const state = loadState();
    const tokenId = state.nextTokenId;
    const prompt = core.assemblePrompt(build, tokenId);

    let img;
    try { img = await hf.generate(prompt); } // rotates across keys on depletion
    catch (e) { return res.status(502).json({ ok: false, error: 'forge render failed', detail: e.message }); }

    const file = `forge-${tokenId}.png`;
    fs.writeFileSync(path.join(IMG_DIR, file), img);
    const imageUrl = `/api/forge/image/${file}`;
    const metadata = core.forgeMetadata(build, tokenId, imageUrl, owner);
    metadata.codename = name || metadata.name;

    state.nextTokenId++;
    state.operatives.push({ tokenId, codename: metadata.codename, owner, rarity: metadata.rarity,
      archetype: build.archetype, buildHash: metadata.buildHash, build, image: imageUrl, at: Date.now() });
    saveState(state);

    // also return a data URI so the UI can paint instantly without a second fetch
    const dataUri = `data:image/png;base64,${img.toString('base64')}`;
    res.json({ ok: true, metadata, image: imageUrl, dataUri });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// GET /api/forge/operatives?owner=foo
router.get('/operatives', (req, res) => {
  const state = loadState();
  const owner = req.query.owner;
  const list = owner ? state.operatives.filter(o => o.owner === owner) : state.operatives;
  res.json({ ok: true, operatives: list });
});

// GET /api/forge/models → list generated 3D archetype models (manifest).
const MODELS_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
router.get('/models', (req, res) => {
  const mf = path.join(MODELS_DIR, 'manifest.json');
  if (!fs.existsSync(mf)) return res.json({ ok: true, archetypes: {} });
  try {
    const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
    res.json({ ok: true, ...manifest });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// GET /api/forge/art/arch-vanguard.png → serve a pre-generated premium archetype portrait.
// BULLETPROOF: always returns a colorful image (falls back to a guaranteed preset) so agent
// tiles never render blank/broken — they load every time.
const DEFAULT_ART = ['arch-ghost.png', 'arch-vanguard.png', 'arch-oracle.png'];
function _sendArt(res, fp, maxAge) {
  res.set('Cache-Control', 'public, max-age=' + (maxAge || 86400));
  return res.type('png').send(fs.readFileSync(fp));
}
router.get('/art/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const fp = path.join(ART_DIR, safe);
  if (fp.startsWith(ART_DIR) && fs.existsSync(fp)) return _sendArt(res, fp, 86400);
  // self-heal: if a council character image is missing (e.g. fresh box where forge-art is
  // gitignored), kick off regeneration in the background for next load.
  const m = /^char-([a-z0-9_-]+)\.png$/.exec(safe);
  if (m) { try { require('../lib/char-gen').ensureCouncilChar(m[1]); } catch (e) {} }
  // never break the UI — fall back to a guaranteed colorful preset
  for (const d of DEFAULT_ART) { const dp = path.join(ART_DIR, d); if (fs.existsSync(dp)) return _sendArt(res, dp, 3600); }
  try { const any = fs.readdirSync(ART_DIR).find(f => f.endsWith('.png')); if (any) return _sendArt(res, path.join(ART_DIR, any), 3600); } catch (e) {}
  return res.status(404).end();
});

// GET /api/forge/image/forge-1.png  → serve a forged portrait
router.get('/image/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const fp = path.join(IMG_DIR, safe);
  if (!fp.startsWith(IMG_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  res.type('png').send(fs.readFileSync(fp));
});

module.exports = router;
