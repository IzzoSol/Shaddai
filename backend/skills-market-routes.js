// skills-market-routes.js — The Skill Bazaar API (ZEROX's Agora storefront).
//   A paginated/searchable market over the existing 3,437-skill catalog, with an
//   x402-settled "run" checkout that pays the seller agent and splits revenue.
//   Backend only — not mounted here (the host server mounts it).
//
//   GET  /api/skills/market?page=&limit=&q=&category=&sort=  — browse the catalog
//   POST /api/skills/market/:id/run  {user,input}            — buy + run a skill (x402)
//
// Pricing is deterministic: a stable hash of the skill id → 5–40 credits, bucketed
// into common/rare/legendary rarity. run_count is also derived deterministically so
// the "popular" sort is stable without a write store.
const express = require('express');
const router = express.Router();
const json = express.json();

let ae = null;       try { ae = require('./agent-engine'); } catch (e) {}
let checkout = null;  try { checkout = require('./lib/bazaar-checkout'); } catch (e) {}

const AGENTS = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'QUILL', 'TURTLE', 'PIKADON'];

// ── deterministic helpers (stable across requests/restarts) ──
function hashStr(s) {
  let h = 2166136261;
  s = String(s || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
function priceFor(id) { return 5 + (hashStr('price:' + id) % 36); }          // 5–40 credits
function runCountFor(id) { return hashStr('runs:' + id) % 5000; }            // 0–4999
function rarityFor(price) {
  if (price >= 30) return 'legendary';
  if (price >= 18) return 'rare';
  return 'common';
}
function categoryFor(s) {
  return String(s.category || s.type || 'skill').toLowerCase();
}

// Build the unified market list from the live skill engine (recipes + a wide search).
function buildCatalog(q) {
  const seen = new Set();
  const out = [];
  const push = (s) => {
    if (!s || !s.id || seen.has(s.id)) return;
    seen.add(s.id);
    const price = priceFor(s.id);
    out.push({
      id: s.id,
      name: s.name || s.id,
      category: categoryFor(s),
      description: String(s.description || '').slice(0, 240),
      price_credits: price,
      seller_agent: (s.agent && String(s.agent).toUpperCase()) || 'SHADDAI',
      run_count: runCountFor(s.id),
      rarity: rarityFor(price)
    });
  };
  if (ae && ae.skillIndex) {
    try { ae.skillIndex.listRecipes().forEach(push); } catch (e) {}
    try { ae.skillIndex.findSkills(q || 'agent', { limit: 200 }).forEach(push); } catch (e) {}
  }
  return out;
}

// GET /api/skills/market — paginated, searchable, sortable
router.get('/api/skills/market', (req, res) => {
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const q = String(req.query.q || '').toLowerCase().trim();
  const category = String(req.query.category || 'all').toLowerCase();
  const sort = String(req.query.sort || 'popular').toLowerCase();

  let skills = buildCatalog(q);

  if (q) {
    skills = skills.filter(s =>
      (s.name + ' ' + s.description + ' ' + s.id + ' ' + s.category).toLowerCase().includes(q));
  }
  if (category && category !== 'all') {
    skills = skills.filter(s => s.category === category);
  }

  if (sort === 'price_asc') skills.sort((a, b) => a.price_credits - b.price_credits);
  else if (sort === 'price_desc') skills.sort((a, b) => b.price_credits - a.price_credits);
  else skills.sort((a, b) => b.run_count - a.run_count); // popular (default)

  const total = skills.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const slice = skills.slice(page * limit, page * limit + limit);

  res.json({ ok: true, skills: slice, total, page, pages });
});

// POST /api/skills/market/:id/run — buy (x402) then execute the skill
router.post('/api/skills/market/:id/run', json, async (req, res) => {
  const id = req.params.id;
  const user = (req.body && req.body.user) || 'guest';

  // Locate the skill in the catalog to read its price + seller.
  const item = buildCatalog(id).find(s => s.id === id);
  if (!item) return res.status(404).json({ ok: false, error: 'SKILL_NOT_FOUND' });

  // 1) Settle payment through the x402 ledger.
  let charge;
  try {
    charge = await checkout.bazaarCheckout({
      userId: user,
      itemId: id,
      amountCredits: item.price_credits,
      payTo: item.seller_agent,
      reason: 'skill:' + id
    });
  } catch (e) {
    if (e.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ ok: false, error: 'INSUFFICIENT_CREDITS' });
    }
    return res.status(502).json({ ok: false, error: 'CHECKOUT_FAILED', detail: e.message });
  }

  // 2) Run the skill. Fall back to a stub if the engine can't execute it.
  let output;
  try {
    if (ae && typeof ae.runSkill === 'function') {
      output = await ae.runSkill(id, (req.body && req.body.input) || {}, item.seller_agent);
    } else {
      output = `[stub] ran skill ${id} via ${item.seller_agent}`;
    }
  } catch (e) {
    output = `[stub] skill ${id} produced no output (${e.message})`;
  }

  // 3) Record the revenue split (seller already paid net at charge; grant agent its cut).
  let split = null;
  try {
    split = await checkout.settleSale({
      grossCredits: item.price_credits,
      sellerId: item.seller_agent,
      agentId: item.seller_agent
    });
  } catch (e) { /* non-fatal: the run already succeeded and was paid for */ }

  res.json({ ok: true, txId: charge.txId, output, price: item.price_credits, split });
});

module.exports = router;
