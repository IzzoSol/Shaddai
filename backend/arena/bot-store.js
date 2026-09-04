'use strict';
// ============================================================================
// arena/bot-store.js - Simple in-memory BotCard registry (server-side only).
// BotCard.systemPrompt NEVER leaves this module (never in View/socket/replay).
// ============================================================================
const bots = new Map(); // id -> BotCard

function registerBot(bot) {
  if (!bot || !bot.id) throw new Error('bot.id required');
  bots.set(bot.id, bot);
  return bot;
}

function getBot(id) { return bots.get(id) || null; }

function listBots() {
  return Array.from(bots.values()).map(b => ({
    id: b.id, ownerId: b.ownerId, name: b.name, model: b.model, tools: b.tools, createdAt: b.createdAt
  }));
}

module.exports = { registerBot, getBot, listBots };
