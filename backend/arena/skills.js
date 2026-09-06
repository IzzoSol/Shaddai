'use strict';
// ============================================================================
// arena/skills.js — Deterministic Skill Engine (anti-bias balance).
//
// Skills are derived from an agent's IDENTITY + a per-match SEED using stable
// binary hashing (FNV-1a 64-bit → bit extraction). NO Math.random() bias.
//   • Same agent + same seed  → identical loadout (reproducible).
//   • Different agents        → genuinely different loadouts (identity-driven).
//   • Fresh seed per match    → shifts emphasis so every battle stays
//                               competitive and never feels rigged.
//
// Each skill carries per-ruleset "competence" weights. Total is normalized so
// no single agent can dominate — battles stay tight.
// ============================================================================

// ---- stable 64-bit hash (FNV-1a) -----------------------------------------
// Returns a BigInt in [0, 2^64). Deterministic across platforms/runs.
function hash64(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const buf = Buffer.from(String(str), 'utf8');
  for (let i = 0; i < buf.length; i++) {
    h ^= BigInt(buf[i]);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h;
}

// ---- skills registry ------------------------------------------------------
// Each skill: id, name, a personality hint, and per-ruleset competence weights.
// Weights are small (0..0.6) so sum stays bounded → no dominant agent.
const SKILLS = [
  { id: 'logic',        name: 'Logic',          hint: 'systematic, analytical', w: { rps: 0.06, 'hi-lo': 0.55, 'trivia-5': 0.45 } },
  { id: 'numeracy',     name: 'Numeracy',       hint: 'numbers, probability',   w: { rps: 0.08, 'hi-lo': 0.5,  'trivia-5': 0.4 } },
  { id: 'bluff',        name: 'Bluff',          hint: 'misdirection, reads',    w: { rps: 0.5,  'hi-lo': 0.15, 'trivia-5': 0.1 } },
  { id: 'adapt',        name: 'Adaptability',   hint: 'fast, flexible',         w: { rps: 0.42, 'hi-lo': 0.2,  'trivia-5': 0.2 } },
  { id: 'memory',       name: 'Memory',         hint: 'retains details',        w: { rps: 0.1,  'hi-lo': 0.3,  'trivia-5': 0.55 } },
  { id: 'knowledge',    name: 'Knowledge',      hint: 'broad facts',            w: { rps: 0.12, 'hi-lo': 0.25, 'trivia-5': 0.6 } },
  { id: 'intuition',    name: 'Intuition',      hint: 'gut reads, pattern',     w: { rps: 0.38, 'hi-lo': 0.35, 'trivia-5': 0.25 } },
  { id: 'patience',     name: 'Patience',       hint: 'slow, disciplined',      w: { rps: 0.22, 'hi-lo': 0.32, 'trivia-5': 0.18 } },
];

// Personality keywords → skill affinity (identity flavor, deterministic).
const PERSONALITY_KW = {
  logic:        ['analyt', 'system', 'architect', 'engineer', 'logic', 'precis', 'strateg'],
  numeracy:     ['revenue', 'number', 'market', 'cost', 'meter', 'finance', 'quant'],
  bluff:        ['decept', 'misdirect', 'charm', 'persuad', 'bluff', 'sales'],
  adapt:        ['fast', 'flex', 'morph', 'quick', 'adapt', 'agile'],
  memory:       ['memor', 'retain', 'recall', 'historian', 'archive'],
  knowledge:    ['research', 'knowledge', 'facts', 'intel', 'curious', 'learn'],
  intuition:    ['intuition', 'feel', 'gut', 'instinct', 'sensi'],
  patience:     ['patien', 'discipline', 'calm', 'methodic', 'deliberate', 'security'],
};

const SEAT_KEYS = ['rps', 'hi-lo', 'trivia-5'];

// ---- public API -------------------------------------------------------------

// identityDigest(bot, seed) → { h: BigInt, idx: n }
// Stable identity-derived index into the skill registry (no bias).
function identityDigest(name, personality, seed) {
  const h = hash64(`${name}|${personality || ''}|${seed || ''}`);
  // Spread across the full registry so different names land on different skills.
  const idx = Number(h % BigInt(SKILLS.length));
  return { h, idx };
}

// loadout(bot, seed) → array of { id, name, hint } (3 skills chosen, no repeats)
function loadout(bot, seed) {
  const name = (bot && bot.name) || 'anonymous';
  const personality = (bot && bot.personality) || '';
  const h = hash64(`${name}|${personality}|${seed || ''}`);
  const chosen = [];
  let cursor = h;
  // Deterministic pick: step through registry avoiding repeats, take 3.
  for (let n = 0; n < SKILLS.length && chosen.length < 3; n++) {
    const k = Number(cursor % BigInt(SKILLS.length));
    if (!chosen.includes(k)) chosen.push(k);
    cursor = (cursor >> 3n) ^ (cursor * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn);
  }
  // Personality affinity: if an identity strongly maps to a skill, bias first pick.
  const aff = personalityAffinity(personality);
  if (aff !== null && !chosen.includes(aff)) chosen.unshift(aff); // ensure flavor
  return chosen.slice(0, 3).map(k => ({ ...SKILLS[k] }));
}

// personalityAffinity(text) → skill index or null (simple keyword match, 1st hit)
function personalityAffinity(text) {
  const t = String(text || '').toLowerCase();
  for (let i = 0; i < SKILLS.length; i++) {
    const kws = PERSONALITY_KW[SKILLS[i].id] || [];
    for (const k of kws) if (t.includes(k)) return i;
  }
  return null;
}

// rulesetEdge(loadout, rulesetId) → number in [0,1] this agent's competence.
// Sum of skills' weights for the ruleset, bounded & mildly compressed so
// battles stay close (a 3-skill max loadout can't blow past ~0.9).
function rulesetEdge(loadoutArr, rulesetId) {
  let s = 0;
  for (const sk of loadoutArr) s += (sk.w && sk.w[rulesetId]) || 0;
  // Compress to keep underdogs viable: 1 - e^-x maps [0,∞) → [0,1).
  return 1 - Math.exp(-s);
}

// odds(a, b, rulesetId) → { a, b, draw } balanced win probabilities.
// Uses the two agents' edges; normalized so it's not a steamroll.
function odds(botA, botB, rulesetId, seed) {
  const eA = rulesetEdge(loadout(botA, seed), rulesetId);
  const eB = rulesetEdge(loadout(botB, seed), rulesetId);
  const diff = eA - eB; // -1..1
  // Center ~0.5, perturb by diff with soft ceiling on how extreme it gets.
  const a = 0.5 + diff * 0.35;
  const clampedA = Math.min(0.85, Math.max(0.15, a));
  const clampedB = 1 - clampedA;
  return { a: clampedA, b: clampedB, eA, eB };
}

module.exports = { loadout, rulesetEdge, odds, identityDigest, SKILLS };
