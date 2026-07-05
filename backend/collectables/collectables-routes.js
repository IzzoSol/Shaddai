'use strict';

/**
 * collectables-routes.js
 * ----------------------------------------------------------------------------
 * Express router for the SHADDAI Collectables gallery + REAL unlock tracking.
 *
 * Mount (add ONE line in server-production.js):
 *   app.use('/api/collectables', require('./collectables/collectables-routes'));
 *
 * Endpoints:
 *   GET  /list?owner=        -> all 100 cards, each tagged earned:true/false for
 *                               that owner. Locked cards are still returned
 *                               (greyed in the UI) with their `unlockText`.
 *   POST /unlock {owner,action,n?} -> REAL unlock tracking. Increments the
 *                               owner's counter for a real dashboard action and
 *                               returns any cards newly unlocked by crossing a
 *                               threshold. Persisted atomically + idempotent on
 *                               already-unlocked cards.
 *   GET  /image/:file        -> serve a card png (path-safe).
 *   POST /mint {owner,id}    -> HONEST "coming soon" status (no fake success).
 *   GET  /progress?owner=    -> per-action counters + unlock totals (UI header).
 *
 * Storage: backend/data/collectable-unlocks.json
 *   { owners: { "<owner>": { counters:{ <action>:N }, unlocked:["<cardId>"...],
 *                            updatedAt } } }
 *
 * Node built-ins + express only. Atomic writes (tmp + rename). No mock data
 * except the explicitly "coming soon" mint, which returns an honest status.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const data = require('./collectables-data');

const UNLOCKS_FILE = path.join(__dirname, '..', 'data', 'collectable-unlocks.json');

// ─── ACTION -> UNLOCK MAPPING ────────────────────────────────────────────────
// Every card's catalog `earned` text (its milestone) maps to a real dashboard
// ACTION and a THRESHOLD count. When an owner's counter for that action reaches
// the threshold, the card unlocks. The 7 Genesis agent-portrait cards are
// "founder" cards mapped to discrete account milestones.
//
// Real dashboard actions a client POSTs to /unlock:
//   aura_save      — an AURA token-save event (cache/compute-first hit)
//   analyze_news   — ran a news analysis
//   generate_image — generated an image
//   forge_agent    — forged an agent in the Forge
//   clip_video     — produced a video clip
//   connect_api    — connected a BYOK / external API
//   build_workflow — built/saved a workflow
//   sell_skill     — sold a skill on the marketplace
//   sell_pack      — sold a creation pack
//   elite          — reached 90% success rate (set counter to >=1)
//   genesis        — invite-only / founder grant (set counter to >=1)
//   founder        — account-creation founder grant for the 7 agent portraits
//
// MILESTONE_RULES maps the human milestone text -> { action, threshold }.
const MILESTONE_RULES = {
  // ── The 7 Genesis council agent portraits: granted as founder cards ──
  '⚜ Supreme Orchestrator': { action: 'founder', threshold: 1 },
  '＄ Wealth & Revenue': { action: 'founder', threshold: 1 },
  '◯ Research & Intel': { action: 'founder', threshold: 1 },
  '📡 Technical Architect': { action: 'founder', threshold: 1 },
  '🎨 UI/UX & Creative': { action: 'founder', threshold: 1 },
  '✒ Writing & Comms': { action: 'founder', threshold: 1 },
  '🛡 Security & Compliance': { action: 'founder', threshold: 1 },

  // ── AURA token-saver ──
  '💸 First AURA token-save': { action: 'aura_save', threshold: 1 },
  '💸 Saved 50× tokens (AURA)': { action: 'aura_save', threshold: 50 },
  '💸 Saved 100× tokens (AURA)': { action: 'aura_save', threshold: 100 },

  // ── News analysis ──
  '📰 Analyzed news · first time': { action: 'analyze_news', threshold: 1 },
  '📰 Analyzed news · 50×': { action: 'analyze_news', threshold: 50 },

  // ── Image generation ──
  '🎨 Generated your first image': { action: 'generate_image', threshold: 1 },
  '🎨 Generated 50 images': { action: 'generate_image', threshold: 50 },

  // ── Forge ──
  '⚒ Forged your first agent': { action: 'forge_agent', threshold: 1 },

  // ── Clips ──
  '🎬 Clipped your first video': { action: 'clip_video', threshold: 1 },
  '🎬 Clipped 5 videos': { action: 'clip_video', threshold: 5 },
  '🎬 Clipped 20 videos': { action: 'clip_video', threshold: 20 },

  // ── API connections ──
  '🔌 Connected your first API': { action: 'connect_api', threshold: 1 },
  '🔌 Connected 10 APIs': { action: 'connect_api', threshold: 10 },
  '🔌 Connected 20 APIs': { action: 'connect_api', threshold: 20 },

  // ── Workflows ──
  '⬡ Built 10 workflows': { action: 'build_workflow', threshold: 10 },

  // ── Marketplace sales ──
  '＄ Sold your first skill': { action: 'sell_skill', threshold: 1 },
  '📦 Sold a creation pack': { action: 'sell_pack', threshold: 1 },

  // ── Prestige ──
  '✦ Elite · 90% success rate': { action: 'elite', threshold: 1 },
  '⚜ Genesis · invite only': { action: 'genesis', threshold: 1 },
};

// Fallback for any unmapped milestone text: a founder grant so the card is
// reachable rather than permanently locked.
function ruleFor(unlockText) {
  return MILESTONE_RULES[unlockText] || { action: 'founder', threshold: 1 };
}

// Precompute card -> rule once.
function cardRules() {
  return data.cards().map((c) => ({ card: c, rule: ruleFor(c.unlockText) }));
}

// The set of actions a client may legitimately report.
const VALID_ACTIONS = new Set([
  'founder', 'aura_save', 'analyze_news', 'generate_image', 'forge_agent',
  'clip_video', 'connect_api', 'build_workflow', 'sell_skill', 'sell_pack',
  'elite', 'genesis',
]);

// ─── persistence (atomic) ────────────────────────────────────────────────────

function loadStore() {
  try {
    const raw = fs.readFileSync(UNLOCKS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.owners) return parsed;
  } catch (_) { /* missing/corrupt -> fresh */ }
  return { owners: {} };
}

function saveStore(store) {
  const dir = path.dirname(UNLOCKS_FILE);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const tmp = path.join(dir, `.collectable-unlocks.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, UNLOCKS_FILE); // atomic on same filesystem
}

function ownerState(store, owner) {
  if (!store.owners[owner]) {
    store.owners[owner] = { counters: {}, unlocked: [], updatedAt: null };
  }
  const s = store.owners[owner];
  if (!s.counters || typeof s.counters !== 'object') s.counters = {};
  if (!Array.isArray(s.unlocked)) s.unlocked = [];
  return s;
}

/**
 * Given an owner's counters, return the list of card ids that ARE unlocked
 * (threshold met). Pure derivation from counters + rules.
 */
function unlockedIdsFor(counters) {
  const out = [];
  for (const { card, rule } of cardRules()) {
    const have = Number(counters[rule.action] || 0);
    if (have >= rule.threshold) out.push(card.id);
  }
  return out;
}

// ─── router ──────────────────────────────────────────────────────────────────

const router = express.Router();
router.use(express.json());

// GET /list?owner=  -> all 100 cards tagged earned for this owner
router.get('/list', (req, res) => {
  try {
    const owner = (req.query.owner || '').toString();
    const store = loadStore();
    const counters = owner ? (ownerState(store, owner).counters) : {};
    const unlocked = new Set(unlockedIdsFor(counters));
    const cards = cardRules().map(({ card, rule }) => ({
      ...card,
      action: rule.action,
      threshold: rule.threshold,
      progress: Number(counters[rule.action] || 0),
      earned: unlocked.has(card.id),
    }));
    res.json({ ok: true, owner: owner || null, total: cards.length, earned: unlocked.size, cards });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// GET /progress?owner= -> per-action counters + unlock totals (UI header)
router.get('/progress', (req, res) => {
  try {
    const owner = (req.query.owner || '').toString();
    if (!owner) return res.status(400).json({ ok: false, error: 'owner required' });
    const store = loadStore();
    const s = ownerState(store, owner);
    const unlocked = unlockedIdsFor(s.counters);
    res.json({
      ok: true,
      owner,
      counters: s.counters,
      unlockedCount: unlocked.length,
      total: data.cards().length,
      updatedAt: s.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// GET /summary?owner= -> achievement rollup for the dashboard header / Achievements view.
// Prepared for wiring: earned/total, points (rarity-weighted), per-rarity + per-faction tallies.
const RARITY_POINTS = { genesis: 100, legendary: 50, epic: 25, rare: 10, common: 5 };
router.get('/summary', (req, res) => {
  try {
    const owner = (req.query.owner || '').toString();
    const store = loadStore();
    const counters = owner ? (ownerState(store, owner).counters) : {};
    const unlocked = new Set(unlockedIdsFor(counters));
    const byRarity = {}, byFaction = {};
    let points = 0, earned = 0;
    cardRules().forEach(({ card }) => {
      const rar = (card.rarity || 'common').toLowerCase();
      byRarity[rar] = byRarity[rar] || { total: 0, earned: 0 };
      byRarity[rar].total++;
      if (unlocked.has(card.id)) {
        earned++; points += (RARITY_POINTS[rar] || 5);
        byRarity[rar].earned++;
        const f = card.faction || 'none';
        byFaction[f] = (byFaction[f] || 0) + 1;
      }
    });
    const total = cardRules().length;
    res.json({ ok: true, owner: owner || null, earned, total,
      percent: total ? Math.round((earned / total) * 100) : 0,
      points, byRarity, byFaction });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// POST /unlock { owner, action, n? } -> REAL unlock tracking
// Increments owner's counter for `action` by n (default 1), persists, and
// returns any cards newly unlocked by this event. Idempotent re: already-
// unlocked cards (they are never returned twice as "newlyUnlocked").
router.post('/unlock', (req, res) => {
  try {
    const body = req.body || {};
    const owner = (body.owner || '').toString();
    const action = (body.action || '').toString();
    let n = Number(body.n);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(Math.floor(n), 1000); // sane cap per call

    if (!owner) return res.status(400).json({ ok: false, error: 'owner required' });
    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({
        ok: false,
        error: `unknown action '${action}'`,
        validActions: [...VALID_ACTIONS],
      });
    }

    const store = loadStore();
    const s = ownerState(store, owner);

    const before = new Set(s.unlocked);

    // Apply the action.
    s.counters[action] = Number(s.counters[action] || 0) + n;
    s.updatedAt = new Date().toISOString();

    // Recompute unlocked set; record any NEW unlocks.
    const nowUnlocked = unlockedIdsFor(s.counters);
    s.unlocked = nowUnlocked.slice();

    const newlyIds = nowUnlocked.filter((id) => !before.has(id));
    saveStore(store);

    const byId = new Map(data.cards().map((c) => [c.id, c]));
    const newlyUnlocked = newlyIds.map((id) => byId.get(id)).filter(Boolean);

    res.json({
      ok: true,
      owner,
      action,
      applied: n,
      counter: s.counters[action],
      newlyUnlocked,
      totalUnlocked: nowUnlocked.length,
      total: byId.size,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// GET /image/:file -> serve a card png, path-safe
router.get('/image/:file', (req, res) => {
  try {
    const full = data.imagePath(req.params.file);
    if (!full) return res.status(404).json({ ok: false, error: 'image not found' });
    res.type('png');
    res.sendFile(full);
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// POST /mint { owner, id } -> HONEST "coming soon" (no fake success)
router.post('/mint', (req, res) => {
  const body = req.body || {};
  const owner = (body.owner || '').toString();
  const id = (body.id || '').toString();
  // We still validate the request so the UI gets accurate feedback.
  const card = data.cards().find((c) => c.id === id);
  if (!owner) return res.status(400).json({ ok: false, error: 'owner required' });
  if (!card) return res.status(404).json({ ok: false, error: 'unknown card id' });

  // Gate: only an EARNED card could ever be minted — tell the truth either way.
  const store = loadStore();
  const counters = ownerState(store, owner).counters;
  const earned = new Set(unlockedIdsFor(counters)).has(id);

  return res.json({
    ok: false,
    status: 'mint_coming_soon',
    earned,
    id,
    message: 'On-chain mint arrives in a later phase',
  });
});

module.exports = router;
