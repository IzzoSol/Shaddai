// backend/aura-routes.js — AURA cost layer over HTTP, mounted at /api/aura.
// The dashboard's auraChat() calls /api/aura/chat before any paid provider; on a
// cache/compute HIT it returns instantly for $0. After a provider answers, the
// dashboard calls /api/aura/record so the next identical prompt is free.
// Backed by lib/aura.js (exact+fuzzy cache + safe local compute, zero deps).
const express = require('express');
const aura = require('./lib/aura');
const router = express.Router();
router.use(express.json({ limit: '512kb' }));

// Pull the last user message text out of an OpenAI-style messages array.
function lastUserPrompt(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  }
  return '';
}

// POST /api/aura/chat { messages, system?, prefer_free? }
// → { ok, cached:true, response, method, tokens_saved } on a hit, else { ok, cached:false }
router.post('/chat', (req, res) => {
  try {
    const prompt = lastUserPrompt(req.body && req.body.messages);
    if (!prompt) return res.json({ ok: true, cached: false });
    const r = aura.route(prompt);
    if (r.hit) {
      return res.json({ ok: true, cached: true, response: r.answer, method: r.method,
        tokens_saved: r.savedTokensEst, similarity: r.similarity });
    }
    return res.json({ ok: true, cached: false });
  } catch (e) { res.json({ ok: false, error: String(e && e.message || e) }); }
});

// POST /api/aura/record { prompt, answer } — store a provider answer for reuse.
router.post('/record', (req, res) => {
  try {
    const { prompt, answer } = req.body || {};
    const ok = aura.recordAnswer(prompt, answer);
    res.json({ ok });
  } catch (e) { res.json({ ok: false, error: String(e && e.message || e) }); }
});

// GET /api/aura/stats — savings summary for the Settings "Cost & AURA" panel.
// Includes the live tool-result cache (real API pulls avoided), if loaded.
router.get('/stats', (req, res) => {
  try {
    let toolCache = null;
    try { toolCache = require('./lib/tool-cache').getStats(); } catch (_) {}
    res.json({ ok: true, ...aura.stats(), toolCache });
  } catch (e) { res.json({ ok: false, error: String(e && e.message || e) }); }
});

// GET /api/aura/tools — live API-pull cache stats on their own (powers the monitor's cache panel).
router.get('/tools', (req, res) => {
  try { res.json(require('./lib/tool-cache').getStats()); }
  catch (e) { res.json({ enabled: false, error: String(e && e.message || e) }); }
});

// POST /api/aura/route { prompt } — raw cache/compute check (used by automation/sentiment).
router.post('/route', (req, res) => {
  try { res.json(aura.route((req.body && req.body.prompt) || '')); }
  catch (e) { res.json({ hit: false }); }
});

// GET /api/aura/bench — run the live self-test (COMPUTE/SAFETY/ROUTING) and report the success rate.
// Powers the "Verify" button on the AURA monitor — proves the deterministic layer is real, on demand.
router.get('/bench', (req, res) => {
  try { res.json(require('./lib/aura-selftest').selfTest()); }
  catch (e) { res.json({ ok: false, error: String(e && e.message || e) }); }
});

// GET /api/aura/health — the dashboard's AURA client pings this on load.
// POST /api/aura/warm { count } — TRAIN AURA: generate realistic prompts, answer each
// once via the shared pool, cache them so future users hit for free. Raises hit-rate.
router.post('/warm', async (req, res) => {
  try {
    const n = (req.body && req.body.count) || 10;
    const out = await require('./aura-warmer').warm(n);
    res.json({ ok: true, ...out });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});

router.get('/health', (req, res) => res.json({ ok: true, status: 'online', layer: 'aura', source: 'lib/aura' }));

// POST /api/aura/task { task, agent?, context?, prefer_free? }
//   Try the free path (cache/compute) on the task text. HIT → cached answer for $0;
//   MISS → { ok:true, cached:false } so the dashboard runs its own LLM chain, then records.
router.post('/task', (req, res) => {
  try {
    const prompt = (req.body && (req.body.task || req.body.prompt)) || '';
    if (!prompt) return res.json({ ok: true, cached: false });
    const r = aura.route(prompt);
    if (r.hit) return res.json({ ok: true, cached: true, response: r.answer, method: r.method, tokens_saved: r.savedTokensEst, similarity: r.similarity });
    return res.json({ ok: true, cached: false });
  } catch (e) { res.json({ ok: false, error: String(e && e.message || e) }); }
});

// POST /api/aura/tools/:name — local tools not available in this lightweight layer.
router.post('/tools/:name', (req, res) => res.json({ ok: false, error: 'tool not available in AURA layer' }));

module.exports = router;
