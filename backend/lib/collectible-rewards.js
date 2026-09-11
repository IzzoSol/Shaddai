'use strict';

// collectible-rewards.js
// "Earn -> collectable -> perks" flywheel.
// Users EARN collectables by completing agent work (not just buying), and
// collectable holders get perks (early token entry, credits, airdrop eligibility).
//
// Self-contained: node built-ins only (fs, path, crypto).
// Persists into the same backend/data/collectibles.json array used by the
// existing collectibles routes (api-proxy-routes.js). Each collectible is
// shaped like { id, name, rarity, owner, mintedAt, signature } and earned ones
// additionally carry source:'task-reward' and taskId.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { softAuth } = require('../auth-guard');

// Trust the server-verified identity (req.userId, set by softAuth) over any
// client-supplied value. Matches the resolveUserId(req, provided) shape used
// by economy-routes.js / work-sessions.js / skill-market-routes.js. Without
// this, `body.user` alone decided who received a real, perk-bearing
// collectible — letting anyone mint one for any named user.
function resolveUserId(req, provided) {
  if (req.user && typeof req.user.id === 'string' && req.user.id) return req.user.id;
  if (typeof req.userId === 'string' && req.userId) return req.userId;
  if (typeof provided === 'string' && provided) return provided;
  return null;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTIBLES_FILE = path.join(DATA_DIR, 'collectibles.json');
const REWARDS_FILE = path.join(DATA_DIR, 'collectible-rewards.json');

// --- low-level json helpers (default to safe empty shapes) ---

function loadJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function saveJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch (_) { /* dir may already exist */ }
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadCollectibles() {
  const data = loadJson(COLLECTIBLES_FILE, []);
  return Array.isArray(data) ? data : [];
}

function loadRewards() {
  const data = loadJson(REWARDS_FILE, { awardedTaskIds: [] });
  if (!data || typeof data !== 'object') return { awardedTaskIds: [] };
  if (!Array.isArray(data.awardedTaskIds)) data.awardedTaskIds = [];
  return data;
}

// --- rarity derivation from work value (USD) ---

function rarityForValue(value) {
  const v = Number(value) || 0;
  if (v < 50) return 'common';
  if (v < 200) return 'rare';
  if (v < 500) return 'epic';
  return 'legendary';
}

function nextId(collectibles) {
  let max = 0;
  for (const c of collectibles) {
    const n = Number(c && c.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

// --- core API ---

// Mint + append a NEW collectible owned by userId as a reward for completing
// work. Idempotent per taskId: a given taskId is only ever awarded once.
// opts: { name?, value?, taskId? }
// Returns the new collectible, or the existing one if this taskId was already
// awarded.
function awardForTask(userId, opts) {
  opts = opts || {};
  const owner = userId;
  const taskId = opts.taskId != null ? String(opts.taskId) : null;

  const collectibles = loadCollectibles();

  // Idempotency: never double-award the same taskId.
  if (taskId) {
    const rewards = loadRewards();
    if (rewards.awardedTaskIds.includes(taskId)) {
      const existing = collectibles.find(
        (c) => c && c.source === 'task-reward' && String(c.taskId) === taskId
      );
      if (existing) return existing;
      // Recorded as awarded but collectible missing — fall through and re-mint.
    }
  }

  const ownedCount = collectibles.filter((c) => c && c.owner === owner).length;
  const collectible = {
    id: nextId(collectibles),
    name: opts.name || `Work Token #${ownedCount + 1}`,
    rarity: rarityForValue(opts.value),
    owner,
    mintedAt: new Date().toISOString(),
    signature: crypto.randomBytes(8).toString('hex'),
    source: 'task-reward',
    taskId: taskId,
  };

  collectibles.push(collectible);
  saveJson(COLLECTIBLES_FILE, collectibles);

  if (taskId) {
    const rewards = loadRewards();
    if (!rewards.awardedTaskIds.includes(taskId)) {
      rewards.awardedTaskIds.push(taskId);
      saveJson(REWARDS_FILE, rewards);
    }
  }

  return collectible;
}

// Count collectibles owned by userId and derive holder perks.
// Perk thresholds are the incentive design of the flywheel.
function getPerks(userId) {
  const collectibles = loadCollectibles();
  const count = collectibles.filter((c) => c && c.owner === userId).length;
  return {
    count,
    tokenEarlyEntry: count >= 1,
    freeCredits: count * 100,
    airdropEligible: count >= 3,
    tier: count >= 10 ? 'whale' : count >= 3 ? 'holder' : count >= 1 ? 'member' : 'none',
  };
}

// --- express router ---

const router = express.Router();
router.use(express.json());

// POST /earn { user, taskId, name?, value? } -> award (idempotent per taskId)
router.post('/earn', softAuth, (req, res) => {
  try {
    const body = req.body || {};
    const user = resolveUserId(req, body.user);
    if (!user) return res.status(400).json({ ok: false, error: 'user required' });
    const collectible = awardForTask(user, {
      taskId: body.taskId,
      name: body.name,
      value: body.value,
    });
    res.json({ ok: true, collectible });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// GET /perks?user= -> holder perks
router.get('/perks', (req, res) => {
  try {
    const user = req.query.user;
    if (!user) return res.status(400).json({ ok: false, error: 'user required' });
    res.json({ ok: true, ...getPerks(user) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

module.exports = { awardForTask, getPerks, router };
