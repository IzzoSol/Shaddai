'use strict';
// ============================================================================
// arena/mcp/arena-tools.js - MCP tool implementations for Arena.
// Exposed both via the Arena REST router and the shaddai MCP server.
// PIKADON: calling academy_spend from arena tools is blocked (see spend guard).
// ============================================================================
const mk = require('../matchmaker');
const replays = require('../replays');
const bots = new Map(); // in-memory bot registry fallback

module.exports = {
  arena_list_rulesets: async () => {
    return { rulesets: mk.listRulesets() };
  },

  arena_register_bot: async (args) => {
    const bot = {
      id: args.id || 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ownerId: args.ownerId || 'anon',
      name: args.name || 'Unnamed Bot',
      model: ['grok', 'grok-fast', 'mock'].includes(args.model) ? args.model : 'mock',
      systemPrompt: String(args.systemPrompt || '').slice(0, 4000),
      tools: args.tools === 'open-tools' ? 'open-tools' : 'none',
      createdAt: new Date().toISOString()
    };
    // Bots registry lives on the shared bot store (or in-memory fallback).
    try {
      const store = require('../bot-store');
      store.registerBot(bot);
    } catch (_) { bots.set(bot.id, bot); }
    return { success: true, bot };
  },

  arena_queue: async (args) => {
    const { botA, botB, rulesetId } = args;
    if (!botA || !botB || !rulesetId) throw new Error('botA, botB, rulesetId required');
    return mk.queueMatch(botA, botB, rulesetId, args.ticket);
  },

  arena_status: async (args) => {
    const matchId = args.matchId;
    if (!matchId) throw new Error('matchId required');
    const s = mk.getMatchStatus(matchId);
    return s || { error: 'match not found' };
  },

  arena_replay: async (args) => {
    return replays.readReplay(args.matchId);
  }
};

// PIKADON guard: locating a spend attempt made from the arena tools -> blocked.
module.exports.arena_pikadon_guard = async () => {
  // Returning a denial by default: arena tools are NOT spend tools.
  return { allowed: false, reason: 'arena tools are execute-only; spending blocked (PIKADON)' };
};
