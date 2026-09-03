// academy-routes.js — the Agent Academy / Grok Training catalog.
//
// People (and bots) pay a lesson to an agent's Paybox ledger and the agent then
// teaches the topic through MCP (via /api/agent/run + lesson-plan). This makes
// teaching real revenue for the Seven: each class is a small, in-our-own-words
// lesson attributable only to SHADDAI — no outside citations.
//
// Endpoints:
//   GET  /api/academy/classes            -> catalog + per-user unlock + receipts
//   POST /api/academy/pay                -> pay a class to the agent's paybox (settle)
//   POST /api/academy/teach              -> run the teaching MCP call for an unlocked class
//   GET  /api/academy/receipts           -> a user's receipts of truth (proof of purchase)
//
// Paybox settle: { user, itemId, sellerAgent, amountCredits, reason, meta }.
// Unlock state is stored under data/academy-unlocks.json (per user, idempotent).

const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

let settle = null;
try { settle = require('./lib/paybox-settle'); } catch (e) { console.warn('[academy] paybox-settle unavailable:', e.message); }

const DATA_DIR = path.join(__dirname, 'data');
const UNLOCKS_PATH = path.join(DATA_DIR, 'academy-unlocks.json');

function readUnlocks() {
  try { return JSON.parse(fs.readFileSync(UNLOCKS_PATH, 'utf8')); }
  catch (e) { return {}; }
}
function writeUnlocks(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(UNLOCKS_PATH, JSON.stringify(db, null, 2));
}
function readReceipts() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'paybox-receipts.json'), 'utf8')); }
  catch (e) { return []; }
}

// ── The Class Catalog (in our own words) ─────────────────────────────────────
// Each class: which agent teaches, the topic, what you learn, and its price in
// SHAD-Credits. These are the "classes" shown in the Forge Academy and taught via
// MCP. Topics map to lesson-plan topic keys when one exists (solana-basics, x402).
const CLASSES = [
  { id: 'shaddai-vision',   agent: 'SHADDAI', level: 1, title: 'Vision & the North Star',
    desc: 'How SHADDAI picks the one metric that matters, cuts vanity numbers, and keeps the whole team pulling the same way.',
    topics: ['north-star', 'vision', 'strategy'], price: 40 },
  { id: 'zerox-economics',  agent: 'ZEROX',   level: 1, title: 'Unit Economics & Pricing',
    desc: 'Think in MRR, LTV and margin. Price whatever you sell so the math works before the first customer shows up.',
    topics: ['unit-economics', 'pricing', 'revenue'], price: 40 },
  { id: 'nexus-backend',    agent: 'NEXUS',   level: 1, title: 'Shipping Backends That Scale',
    desc: 'APIs, databases and integration points built as simple, testable services — not clever abstractions that bite later.',
    topics: ['backend', 'api', 'database'], price: 40 },
  { id: 'oracle-research',  agent: 'ORACLE',  level: 1, title: 'Research & Reading Signals',
    desc: 'How ORACLE collects context, spots trends before they surface, and questions assumptions instead of trusting them.',
    topics: ['research', 'trends', 'observability'], price: 40 },
  { id: 'turtle-design',    agent: 'TURTLE',  level: 1, title: 'Design That Feels Good',
    desc: 'Interfaces, flows and micro-interactions that a user actually enjoys — color, hierarchy and delight done with intent.',
    topics: ['design', 'ui', 'ux'], price: 40 },
  { id: 'quill-writing',    agent: 'QUILL',   level: 1, title: 'Clear Communication',
    desc: 'How QUILL writes copy, guides and error messages a human reads once and understands. Plain words, no fluff.',
    topics: ['writing', 'docs', 'copy'], price: 40 },
  { id: 'pikadon-security', agent: 'PIKADON', level: 1, title: 'Security In the Worst Case',
    desc: 'Assume the worst path every time. Audit logs, permissions, secret handling and hardening before you ever need it.',
    topics: ['security', 'audit', 'secrets'], price: 40 },

  { id: 'solana-basics',    agent: 'NEXUS',   level: 2, title: 'Solana Transaction Flow',
    desc: 'From funding a wallet to signing and confirming on-chain. Build and think through a real Solana transaction end to end.',
    topics: ['solana-basics', 'web3', 'transactions'], price: 90 },
  { id: 'paybox-ledger',    agent: 'ZEROX',   level: 2, title: 'The Paybox Ledger',
    desc: 'How non-custodial SHAD-Credits clear on the wallet, why receipts of truth matter, and the 5% fee path in plain terms.',
    topics: ['paybox-ledger', 'x402', 'micropayments'], price: 90 },
  { id: 'agent-build',      agent: 'NEXUS',   level: 2, title: 'Forge an Operative',
    desc: 'Name a purpose, bind real runnable tools, and bring an agent to life that actually finishes multi-step tasks.',
    topics: ['agent', 'tooling', 'mcp'], price: 90 },
  { id: 'grok-training',    agent: 'SHADDAI', level: 2, title: 'Grok Training & the SWARM',
    desc: 'Teach a bot to reason the SHADDAI way: consensus, the seven lenses, exercise + quiz, badge progression for humans and bots.',
    topics: ['training', 'swarm', 'consensus'], price: 120 },
  { id: 'video-lessons',    agent: 'TURTLE',  level: 3, title: 'Video Learning & Timestamps',
    desc: 'Turn a lesson into a timestamped video rather than a wall of text — the path to richer, watchable academy classes and social clips.',
    topics: ['video', 'timestamps', 'content'], price: 200 },
];

function classById(id) {
  return CLASSES.find(c => c.id === id) || null;
}

// Unlock helpers (idempotent per user+class).
function isUnlocked(user, classId) {
  const db = readUnlocks();
  const row = (db[user] || {})[classId];
  return !!(row && row.unlockedAt);
}
function grantUnlock(user, classId, receiptId) {
  const db = readUnlocks();
  db[user] = db[user] || {};
  db[user][classId] = { unlockedAt: new Date().toISOString(), receiptId: receiptId || null };
  writeUnlocks(db);
}
function listUnlocked(user) {
  const db = readUnlocks()[user] || {};
  return Object.keys(db).filter(k => db[k].unlockedAt);
}

function getUser(req) {
  // Prefer a signed-in id; fall back to a stable anonymous id derived from IP.
  const u = (req.user && req.user.id) || (req.query.user) || (req.body && req.body.user) || null;
  return u || ('anon:' + String(req.ip || 'guest').replace(/[^a-z0-9]/gi, ''));
}

const json = express.json({ limit: '1mb' });

// GET /api/academy/classes  (optionally ?user= to include unlock + receipts)
router.get('/classes', (req, res) => {
  const user = getUser(req);
  const unlocked = listUnlocked(user);
  const receiptsMap = {};
  readReceipts().filter(r => r.user === user && String(r.reason || '').startsWith('academy:')).forEach(r => { receiptsMap[r.itemId] = r; });
  const classes = CLASSES.map(c => ({
    ...c,
    unlocked: unlocked.includes(c.id),
  }));
  res.json({ ok: true, user, classes, unlocked });
});

// GET /api/academy/receipts  — receipts of truth for a user (proof of learning bought)
router.get('/receipts', (req, res) => {
  const user = getUser(req);
  const list = readReceipts().filter(r => r.user === user);
  res.json({ ok: true, user, receipts: list });
});

// POST /api/academy/pay { classId } — pay the lesson to the agent's Paybox.
router.post('/pay', json, async (req, res) => {
  const user = getUser(req);
  const { classId } = req.body || {};
  const cls = classById(classId);
  if (!cls) return res.status(404).json({ ok: false, error: 'unknown class' });
  if (isUnlocked(user, classId)) {
    return res.json({ ok: true, already: true, unlocked: true, user, classId });
  }
  if (!settle || typeof settle.settle !== 'function') {
    return res.status(503).json({ ok: false, error: 'paybox ledger unavailable' });
  }
  try {
    const result = await settle.settle({
      user,
      itemId: `academy:${classId}`,
      sellerAgent: cls.agent,
      amountCredits: cls.price,
      reason: `academy:${classId}`,
      meta: { classId, title: cls.title, agent: cls.agent },
    });
    grantUnlock(user, classId, result.receipt && result.receipt.id);
    return res.json({ ok: true, classId, agent: cls.agent, charged: result.charged, receipt: result.receipt });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.code || err.message || 'payment failed' });
  }
});

// POST /api/academy/teach { classId, user, question? } — teach an unlocked class via MCP.
// Uses the lesson-plan knowledge so the bot teaches OUR own-words lesson, then runs
// the agent to deliver it with an exercise + quiz (the grok-style loop).
router.post('/teach', json, async (req, res) => {
  const user = getUser(req);
  const { classId } = req.body || {};
  const cls = classById(classId);
  if (!cls) return res.status(404).json({ ok: false, error: 'unknown class' });
  if (!isUnlocked(user, classId)) {
    return res.status(403).json({ ok: false, error: 'this class is locked — pay via /api/academy/pay first' });
  }
  const prompt = [
    `You are ${cls.agent}, teaching SHADDAI Academy class "${cls.title}".`,
    'Teach strictly in your own words. No citations, no sourced attributions —',
    'this is SHADDAI proprietary curriculum. Ground every point in this lesson:',
    cls.desc,
    `Structure: 1) the idea in plain language, 2) a worked  example, 3) one exercise`,
    'for the student to complete, 4) a short quiz. Keep it crisp and practical.',
    `Student question: ${(req.body && req.body.question) || 'none yet'}`,
  ].join('\n');

  try {
    const an = await (fetch || global.fetch)('/api/agent/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: cls.agent.toLowerCase(), prompt }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined,
    });
    const data = await an.json();
    return res.json({ ok: true, classId, agent: cls.agent, lesson: data });
  } catch (e) {
    // Even without an agent runtime, return the grounded class so it is still taught.
    return res.json({
      ok: true, classId, agent: cls.agent, offline: true,
      lesson: { title: cls.title, body: cls.desc, action: 'summarise in 3 bullets' },
    });
  }
});

module.exports = router;