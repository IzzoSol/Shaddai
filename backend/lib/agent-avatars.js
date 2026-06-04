'use strict';
/**
 * Agent avatar portraits — ADDITIVE layer over the existing collectibles/customization
 * system. Stores a per-agent portrait URL in data/agent-avatars.json. Does NOT touch
 * collectibles.json or agent-rooms.json (those remain the cosmetic/equip layer).
 *
 * Portraits use the keyless Pollinations image path (same as /api/image/generate),
 * so generation is instant + free + deterministic per prompt.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'agent-avatars.json');

// Per-agent default portrait prompts (styled to each council member's vibe).
const DEFAULT_PROMPTS = {
  SHADDAI: 'regal golden AI sovereign, glowing crown, command throne, pixel-art portrait, dark background',
  ZEROX:   'orange cyber trader agent, holographic market charts, neon, pixel-art portrait, dark background',
  ORACLE:  'violet mystic researcher AI, constellation eyes, data streams, pixel-art portrait, dark background',
  NEXUS:   'cyan architect robot, circuit halo, blueprint grid, pixel-art portrait, dark background',
  TURTLE:  'magenta creative artist agent, paint and music notes, pixel-art portrait, dark background',
  QUILL:   'gold scribe AI with glowing quill and scrolls, pixel-art portrait, dark background',
  PIKADON: 'red guardian security AI, shield and lock, alert aura, pixel-art portrait, dark background'
};

function _read() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function _write(obj) {
  try { fs.writeFileSync(STORE, JSON.stringify(obj, null, 2)); return true; } catch { return false; }
}

/** Build a keyless Pollinations portrait URL for a prompt. */
function buildAvatarUrl(prompt, seed) {
  const p = encodeURIComponent(String(prompt || 'pixel-art AI agent portrait'));
  const s = seed != null ? `&seed=${encodeURIComponent(seed)}` : '';
  return `https://image.pollinations.ai/prompt/${p}?width=512&height=512&nologo=true&model=flux${s}`;
}

/** Get a stored avatar for an agent (or null). */
function getAvatar(agent) {
  const all = _read();
  return all[String(agent).toUpperCase()] || null;
}

/**
 * Generate (and persist) a portrait for an agent.
 * @param {string} agent
 * @param {string} [prompt] custom prompt; defaults to the agent's styled prompt
 * @returns {{uri, prompt, generatedAt}}
 */
function generateAvatar(agent, prompt) {
  const name = String(agent).toUpperCase();
  const usePrompt = prompt || DEFAULT_PROMPTS[name] || `${name} AI agent, pixel-art portrait, dark background`;
  const entry = { uri: buildAvatarUrl(usePrompt, name), prompt: usePrompt, generatedAt: new Date().toISOString() };
  const all = _read();
  all[name] = entry;
  _write(all);
  return entry;
}

module.exports = { getAvatar, generateAvatar, buildAvatarUrl, DEFAULT_PROMPTS };
