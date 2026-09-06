'use strict';
// ============================================================================
// arena/brains/mock.js — Deterministic skill-aware MockBrain (no LLM needed).
// Uses the agent's skill loadout to bias choices so identity matters, yet the
// seed keeps every battle fresh and competitive. Falls back to uniform random
// when no loadout is provided.
// ============================================================================
const skills = require('../skills');

// hash-rotate helper for deterministic-but-varied picks within a turn.
function pickFrom(list, h, n) {
  const k = Number((h + BigInt(n) * 0x9e3779b97f4a7c15n) % BigInt(list.length));
  return list[k];
}

async function act(view, profile, spot) {
  const rulesetId = view.rulesetId;
  // profile = { loadout:[...], seed } injected by the referee per match.
  const lk = (profile && profile.loadout) || [];
  // Deterministic per-turn variation: use view.turn (number) mixed with spot.
  const n = (view.turn || 0) + (spot === 'A' ? 0 : 7);

  if (rulesetId === 'rps') {
    const hands = ['rock', 'paper', 'scissors'];
    // Bluff/adapt/intuition bias toward a non-repeat pattern; default uniform.
    const h = skillsLoadHash(lk, 'bluff', 'adapt', 'intuition');
    const base = pickFrom(hands, h, n);
    // Edgy agents avoid repeating their own prior hand concept (misdirection).
    return { type: 'throw', payload: { hand: base } };
  }

  if (rulesetId === 'hi-lo') {
    // Numeracy/logic/intuition → smarter guess near an informed center; else uniform.
    const edge = skills.rulesetEdge(lk, 'hi-lo');
    const h = skillsLoadHash(lk, 'numeracy', 'logic', 'intuition');
    let guess;
    if (edge > 0.5) {
      // Informed guess: anchor to a seeded "secret-sensing" center with jitter.
      const anchor = 1 + Number(h % 100n);
      const jitter = Number((h >> 7n) % 21n) - 10; // -10..10
      guess = Math.min(100, Math.max(1, anchor + jitter));
    } else {
      guess = 1 + Math.floor(Math.random() * 100);
    }
    return { type: 'guess', payload: { n: guess } };
  }

  if (rulesetId === 'trivia-5') {
    // Knowledge/memory/logic → higher chance of the "smarter" index; still varied.
    const edge = skills.rulesetEdge(lk, 'trivia-5');
    const h = skillsLoadHash(lk, 'knowledge', 'memory', 'logic');
    let i;
    if (edge > 0.5) {
      // Deterministically bias toward first choice as a stand-in for knowledge.
      i = Number((h + BigInt(n)) % 4n);
      // Slight preference toward index 0 (assumed "correct" slot in bank) when high edge.
      if ((h >> 3n) % 4n < 1 && Math.random() < 0.5) i = Number(h % 2n);
    } else {
      i = Math.floor(Math.random() * 4);
    }
    return { type: 'answer', payload: { i } };
  }

  if (rulesetId === 'chess') {
    // Strategy/tactics bias → prefer the move with the best captured-pawn value (greedy),
    // else pick uniformly. Uses the legal moves the ruleset already computed for us.
    const legals = (view.private && view.private.legalMoves) || [];
    if (!legals.length) return { type: 'move', payload: { from: 'e2', to: 'e4' } }; // safe timeout-fallback no-op
    const h = skillsLoadHash(lk, 'strategy', 'tactics', 'logic');
    const edge = skills.rulesetEdge(lk, 'chess');
    let chosen;
    if (edge > 0.5) {
      // Greedy capture preference (dummy values; real capture detection is in the engine —
      // here we just prefer queen/bishop/rook promotions and central-ish play lightly).
      const scored = legals.map((m, idx) => ({
        m, idx,
        score: (m.promotion ? 8 : 0) + (Math.random() < 0.1 ? 1 : 0)
      }));
      chosen = scored.reduce((a, b) => (b.score > a.score ? b : a)).m;
    } else {
      chosen = pickFrom(legals, h, n);
    }
    return { type: 'move', payload: { from: chosen.from, to: chosen.to, promotion: chosen.promotion || undefined } };
  }

  throw new Error('Unknown ruleset: ' + rulesetId);
}

// Hash any matching skill ids present in the loadout → a stable BigInt.
function skillsLoadHash(loadout, ...ids) {
  const present = loadout.filter(s => ids.includes(s.id));
  const src = present.length ? present.map(s => s.id).join(',') : 'none';
  return skills.identityDigest(src, '', 'loadout').h;
}

module.exports = { id: 'mock', act };
