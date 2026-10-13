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
// PIKADON: these three routes trigger real paid provider calls (HF FLUX, Meshy)
// billed on the server's own key — the generic global /api limiter (150/min) is
// far too loose for that; give them their own tight per-route budget.
const { rateLimit } = require('../auth-guard');
const forgeLimit = rateLimit({ windowMs: 60000, max: 10 });
// Unified operative store (single source of truth read by Rooms/Agents/Office/World).
// Loaded defensively so a require failure can never crash the forge route.
let opStore = null; try { opStore = require('../lib/operatives'); } catch (e) { console.warn('[forge] operatives store unavailable:', e && e.message); }

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const IMG_DIR = path.join(DATA_DIR, 'agent-images');
const ART_DIR = path.join(DATA_DIR, 'forge-art'); // pre-generated premium archetype portraits
const STATE_FILE = path.join(DATA_DIR, 'forge-state.json');

function ensureDirs(){ for (const d of [DATA_DIR, IMG_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function loadState(){ try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { nextTokenId: 1, operatives: [] }; } }
function saveState(s){
  // Atomic write: temp file + rename so a crash mid-write can't corrupt forge-state.json
  // (a truncated file would fail JSON.parse and silently reset nextTokenId → duplicate ids).
  try {
    const tmp = STATE_FILE + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('[forge] failed to persist forge-state.json:', e && e.message); }
}

// (HF calls now go through ../lib/hf-keys → server-side keys + auto-rotation)

// POST /api/forge  { build, owner?, name? }
router.post('/', forgeLimit, express.json({ limit: '256kb' }), async (req, res) => {
  try {
    let { build, archetype, owner = 'anon', name = '' } = req.body || {};
    // convenience: caller may pass just {archetype} → loadout the full 9-slot look server-side
    if ((!build || core.validateBuild(build).length) && archetype && core.ARCHETYPES[archetype]) build = core.loadoutFor(archetype);
    const errs = core.validateBuild(build);
    if (errs.length) return res.status(400).json({ ok: false, error: 'invalid build', details: errs });

    ensureDirs();
    const state = loadState();
    const tokenId = state.nextTokenId;
    const prompt = core.assemblePrompt(build, tokenId);

    // Try a real FLUX render. If HF is unavailable (no token) or the render fails,
    // DEGRADE GRACEFULLY: fall back to the pre-generated archetype portrait so the
    // forge still succeeds and the agent is created — never a hard crash / dead forge.
    // The /api/forge/art/:file route has its own bulletproof fallback chain, so this
    // URL always resolves to a real colourful image.
    let imageUrl, dataUri = null, degraded = false, renderNote = '';
    let img = null;
    if (hf.keys().length) {
      try { img = await hf.generate(prompt); } // rotates across keys on depletion
      catch (e) { renderNote = 'render failed: ' + (e && e.message || 'unknown'); }
    } else {
      renderNote = 'no HF token configured';
      console.warn('[forge] No HF token configured (set HF_TOKENS env or backend/data/runtime-keys.json) — using archetype fallback portrait.');
    }

    if (Buffer.isBuffer(img) && img.length) {
      const file = `forge-${tokenId}.png`;
      try {
        fs.writeFileSync(path.join(IMG_DIR, file), img);
        imageUrl = `/api/forge/image/${file}`;
        dataUri = `data:image/png;base64,${img.toString('base64')}`;
      } catch (e) {
        // couldn't persist the fresh render → degrade to the archetype fallback rather than 500
        renderNote = 'could not save portrait: ' + (e && e.message);
        img = null;
      }
    }
    if (!imageUrl) {
      // graceful fallback portrait (served with its own multi-level fallback chain)
      const arch = (build && build.archetype) || archetype || 'ghost';
      imageUrl = `/api/forge/art/arch-${arch}.png`;
      degraded = true;
      console.warn('[forge] degraded to fallback portrait for archetype=' + arch + ' (' + renderNote + ')');
    }

    const metadata = core.forgeMetadata(build, tokenId, imageUrl, owner);
    metadata.codename = name || metadata.name;

    // 3D / forge limit: non-Pro users cap at 3 forged operatives. Pro users unlimited.
    // (Pro detection wired when auth context is plumbed into this route; for now enforce
    // a hard cap of 3 unless ?pro=1 is passed by a Pro-authenticated caller.)
    const isPro = !!(req.query && req.query.pro === '1') || !!(req.body && req.body.__pro);
    const existing = (state.operatives || []).filter(o => o && o.owner === owner);
    const FORGE_CAP_NON_PRO = 3;
    if (!isPro && existing.length >= FORGE_CAP_NON_PRO) {
      return res.status(402).json({ ok:false, error:'forge cap reached', limit:FORGE_CAP_NON_PRO,
        message:'Non-Pro agents can forge up to '+FORGE_CAP_NON_PRO+' operatives. Upgrade to Pro for unlimited 3D forging.' });
    }

    state.nextTokenId++;
    state.operatives.push({ tokenId, codename: metadata.codename, owner, rarity: metadata.rarity,
      archetype: build.archetype, buildHash: metadata.buildHash, build, image: imageUrl, at: Date.now() });
    saveState(state);

    // PERSISTENCE: write the forged agent straight into the unified operative store
    // (backend/data/operatives.json) that the Rooms/Agents/Office/World tabs read.
    // Previously the forge only wrote forge-state.json and relied on the frontend
    // making a second POST /api/operatives — if that call was skipped or failed the
    // agent never showed up. Best-effort + non-fatal: a store hiccup must NOT fail
    // the forge (the portrait already rendered, and a lazy GET /api/operatives sync
    // remains as a backstop).
    let operative = null;
    if (opStore && typeof opStore.create === 'function') {
      try {
        operative = opStore.create({
          owner, codename: metadata.codename,
          archetype: build.archetype,
          rarity: metadata.rarity,
          look: build,
          portrait: imageUrl,
          tools: [],
          buildHash: metadata.buildHash,
        });
      } catch (e) { console.error('[forge] operative store persist failed (non-fatal):', e && e.message); }
    }

    // dataUri (set only when we rendered a fresh portrait) lets the UI paint instantly
    // without a second fetch; on the degraded path the UI loads `image` (fallback art URL).
    res.json({ ok: true, metadata, image: imageUrl, dataUri, operative, degraded });
  } catch (e) {
    console.error('[forge] POST / failed:', (e && e.stack) || e);   // surface real cause in Render logs
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
  // FINAL, always-works fallback: the COMMITTED static council portraits in
  // public/assets/agents/*. forge-art/ is gitignored (empty on Render) and HF self-heal
  // needs credits — so agent-{name}/char-{name}/arch-{name} all 404'd and textures went blank.
  // The static portraits ship with the repo → agent textures now render with zero HF/forge-art dependency.
  try {
    const nm = /(?:agent|char|arch)-([a-z0-9_-]+)\.png$/i.exec(safe);
    if (nm) {
      const up = nm[1].toUpperCase();
      const staticDir = path.join(__dirname, '..', '..', 'public', 'assets', 'agents');
      for (const suffix of ['-portrait.png', '-action.png']) {
        const sp = path.join(staticDir, up + suffix);
        if (sp.startsWith(staticDir) && fs.existsSync(sp)) return _sendArt(res, sp, 86400);
      }
    }
  } catch (e) {}
  // never break the UI — fall back to a guaranteed colorful preset (if any forge-art exists)
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

// ── POST /api/forge/pixel-art → a matching HF FLUX portrait for a Pixel-Forge agent ──
// Free for all users. Builds a prompt from the chosen color + body skin so the rendered
// portrait MATCHES the pixel agent's look, then returns the image URL + data URI.
router.post('/pixel-art', forgeLimit, express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const { color = '#00e5a0', skin = 'operative', name = '' } = req.body || {};
    const clean = (s, n) => String(s == null ? '' : s).replace(/[^a-z0-9 _#-]/gi, '').slice(0, n);
    const nm = clean(name, 24) || 'operative';
    const sk = clean(skin, 24) || 'operative';
    const col = clean(color, 16) || '#00e5a0';
    const prompt = `${nm}, a ${sk} sci-fi operative character, dominant ${col} color scheme, full body hero concept art, neon cyberpunk, dramatic rim lighting, single character, dark background, game character sheet`;
    if (!hf.keys().length) return res.json({ ok: false, error: 'no HF token configured', note: 'set HF_TOKENS to render matching art' });
    let img = null;
    try { img = await hf.generate(prompt); } catch (e) { return res.json({ ok: false, error: 'render failed: ' + (e && e.message || 'unknown') }); }
    if (!Buffer.isBuffer(img) || !img.length) return res.json({ ok: false, error: 'empty render' });
    ensureDirs();
    const file = `pixel-${Date.now().toString(36)}.png`;
    try { fs.writeFileSync(path.join(IMG_DIR, file), img); } catch (e) { return res.json({ ok: false, error: 'save failed' }); }
    res.json({ ok: true, image: `/api/forge/image/${file}`, dataUri: `data:image/png;base64,${img.toString('base64')}` });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});

// ── 3D BODY FORGE (Meshy text-to-3D) — PRO feature; needs MESHY_KEY on the server ──
// POST creates the Meshy task (returns taskId); GET polls it (~1-3 min) and, on success,
// downloads the GLB into public/assets/forge-models/ and returns its URL.
const _meshyKey = () => process.env.MESHY_KEY || '';
router.post('/3d', forgeLimit, express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const { name = '', color = '', skin = 'operative', tier = '', prompt: userPrompt = '' } = req.body || {};
    if (!_meshyKey()) return res.status(503).json({ ok: false, error: 'MESHY_NOT_CONFIGURED', note: 'Set MESHY_KEY on the server to enable 3D body forging (paid Meshy API).' });
    if (String(tier).toLowerCase() !== 'pro') return res.status(402).json({ ok: false, error: 'PRO_REQUIRED', note: 'Forging a 3D body from scratch is a Pro feature.' });
    const clean = (s, n) => String(s == null ? '' : s).replace(/[^a-z0-9 _,#-]/gi, '').slice(0, n);
    const p = clean(userPrompt, 300) || `${clean(skin, 24) || 'operative'} sci-fi operative character named ${clean(name, 24) || 'agent'}, ${clean(color, 16)} color scheme, full body, T-pose, game-ready, clean topology, single character, neon cyberpunk`;
    const r = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', {
      method: 'POST', headers: { Authorization: `Bearer ${_meshyKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'preview', prompt: p, art_style: 'realistic', should_remesh: true }),
    });
    if (r.status !== 202 && !r.ok) return res.status(502).json({ ok: false, error: 'meshy create ' + r.status });
    const j = await r.json();
    res.json({ ok: true, taskId: j.result, note: 'Generating your 3D body — poll GET /api/forge/3d/:taskId (~1-3 min).' });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});
router.get('/3d/:taskId', async (req, res) => {
  try {
    if (!_meshyKey()) return res.status(503).json({ ok: false, error: 'MESHY_NOT_CONFIGURED' });
    const id = String(req.params.taskId).replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    const r = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${id}`, { headers: { Authorization: `Bearer ${_meshyKey()}` } });
    const t = await r.json();
    if (t.status === 'SUCCEEDED') {
      const glbUrl = t.model_urls && t.model_urls.glb;
      let saved = glbUrl || null;
      if (glbUrl) {
        try {
          const g = await fetch(glbUrl); const buf = Buffer.from(await g.arrayBuffer());
          const dir = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
          fs.mkdirSync(dir, { recursive: true });
          const file = `pixel-${id.slice(0, 12)}.glb`;
          fs.writeFileSync(path.join(dir, file), buf);
          saved = `/assets/forge-models/${file}`;
        } catch (e) { /* keep remote url */ }
      }
      return res.json({ ok: true, status: 'SUCCEEDED', progress: 100, glb: saved, thumbnail: t.thumbnail_url || null });
    }
    if (t.status === 'FAILED') return res.json({ ok: false, status: 'FAILED', error: (t.task_error && t.task_error.message) || 'failed' });
    res.json({ ok: true, status: t.status || 'PENDING', progress: t.progress || 0 });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});

module.exports = router;
