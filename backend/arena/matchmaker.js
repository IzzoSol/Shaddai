'use strict';
// ============================================================================
// arena/matchmaker.js - In-memory queue + match map. Creates Match, runs it.
// Bots are { id, name, model, systemPrompt(never leaked), tools }.
// ============================================================================
const rpsRuleset = require('./rulesets/rps');
const hiLoRuleset = require('./rulesets/hi-lo');
const triviaRuleset = require('./rulesets/trivia');
const chessRuleset = require('./rulesets/chess');
const mockBrain = require('./brains/mock');
const grokBrain = require('./brains/grok');
const { runMatch } = require('./referee');
const skills = require('./skills');

const RULESETS = {
  'rps': rpsRuleset,
  'hi-lo': hiLoRuleset,
  'trivia-5': triviaRuleset,
  'chess': chessRuleset
};

const matches = new Map(); // matchId -> Match
const queue = new Map();   // rulesetId -> array of { botA, botB, rulesetId, ticket }

function brainForModel(model) {
  return model === 'grok' || model === 'grok-fast' ? grokBrain : mockBrain;
}

function getRuleset(id) {
  const r = RULESETS[id];
  if (!r) throw new Error('Unknown ruleset: ' + id);
  return r;
}

function queueMatch(botA, botB, rulesetId, ticket) {
  if (!botA || !botB) throw new Error('Both bots required');
  getRuleset(rulesetId);
  const list = queue.get(rulesetId) || [];
  list.push({ botA, botB, rulesetId, ticket: ticket || 'free' });
  queue.set(rulesetId, list);
  return { queued: true, rulesetId, ticket: ticket || 'free' };
}

// Process one pending match for a ruleset (called by the router / MCP).
async function processQueue(rulesetId) {
  const list = queue.get(rulesetId) || [];
  if (list.length === 0) return null;
  const { botA, botB, rulesetId: rid, ticket } = list.shift();
  queue.set(rulesetId, list);

  const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const seed = Math.random().toString(36).slice(2, 10);
  const match = {
    id: matchId,
    rulesetId: rid,
    seed,
    bots: { A: botA.id, B: botB.id },
    botNames: { A: botA.name || 'Bot A', B: botB.name || 'Bot B' },
    models: { A: botA.model || 'mock', B: botB.model || 'mock' },
    ticket,
    status: 'playing',
    turn: 0,
    createdAt: new Date().toISOString()
  };
  matches.set(matchId, match);

  const ruleset = getRuleset(rid);
  const brains = {
    A: brainForModel(match.models.A),
    B: brainForModel(match.models.B)
  };
  // Identity → skill profile per seat (deterministic per seed; no bias).
  brains.A.profile = { loadout: skills.loadout(botA, seed), seed, name: botA.name || 'A' };
  brains.B.profile = { loadout: skills.loadout(botB, seed), seed, name: botB.name || 'B' };

  // Fire and forget; updates match on end via matchmaker state callback.
  runMatch(match, ruleset, brains, (type, payload) => {
    if (type === 'match.ended') {
      const m = matches.get(matchId);
      if (m) { m.status = payload.status; m.endedAt = new Date().toISOString(); m.replayId = payload.replayId; }
    }
  }).then(() => {}).catch(e => {
    const m = matches.get(matchId);
    if (m) { m.status = 'aborted'; m.endedAt = new Date().toISOString(); m.error = e.message; }
  });

  return matchId;
}

function getMatch(matchId) { return matches.get(matchId); }
function getMatchStatus(matchId) {
  const m = matches.get(matchId);
  if (!m) return null;
  const { seed, ...publicMatch } = m;
  return publicMatch;
}
function listMatches() { return Array.from(matches.values()).map(m => ({ id: m.id, rulesetId: m.rulesetId, status: m.status, bots: m.botNames })); }
function listRulesets() { return Object.keys(RULESETS); }

module.exports = { queueMatch, processQueue, getMatch, getMatchStatus, listMatches, listRulesets, RULESETS };
