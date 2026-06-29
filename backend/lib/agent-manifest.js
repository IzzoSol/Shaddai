'use strict';
/**
 * SHADDAI Agent Manifest (spec v1.0) — see specs/AGENT_MANIFEST.md
 * Derives a single portable manifest object from the existing source of truth
 * (brains.js PERSONAS + BRAINS). No DB migration — agents stay defined where they are.
 */
const { PERSONAS, BRAINS } = require('../brains');

const SPEC_VERSION = '1.0';

// Pixel sprite accent colors (matches the dashboard council palette)
const AGENT_COLOR = {
  SHADDAI: '#00e5a0', ZEROX: '#ff7b3d', ORACLE: '#a98bff', NEXUS: '#00c8ff',
  TURTLE: '#ff4ecd', QUILL: '#ffd700', PIKADON: '#ff4070'
};

/**
 * Build a manifest for an agent.
 * @param {string} agentName  e.g. "ORACLE"
 * @param {object} [opts] { tools?:string[], brainId?, voice?, avatar?, wallet?, id?, custom?, createdAt? }
 * @returns {object|null} manifest, or null if the agent is unknown
 */
function buildManifest(agentName, opts = {}) {
  const persona = PERSONAS[agentName] || opts.custom || null;
  if (!persona) return null;

  const brainId = opts.brainId || persona.defaultBrain || 'groq-70b';
  const brain = BRAINS[brainId] || BRAINS['groq-70b'] || {};
  const now = new Date().toISOString();

  return {
    specVersion: SPEC_VERSION,
    id: opts.id || `a_${String(agentName).toLowerCase()}`,
    name: agentName,
    label: persona.label || agentName,
    description: (persona.persona || '').slice(0, 160),
    brain: {
      brainId,
      provider: brain.provider || 'groq',
      model: brain.model || 'llama-3.3-70b-versatile',
      tier: brain.tier || 'standard',
      instructions: persona.persona || `You are ${agentName}, a SHADDAI agent.`
    },
    tools: Array.isArray(opts.tools) ? opts.tools : [],
    voice: opts.voice || null,
    avatar: opts.avatar || { kind: 'pixel', sprite: String(agentName).toLowerCase(), color: AGENT_COLOR[agentName] || '#ffd700' },
    wallet: opts.wallet || { address: null, supportedChains: ['solana', 'base'] },
    tags: opts.tags || (opts.custom ? ['custom'] : ['council']),
    createdAt: opts.createdAt || now,
    updatedAt: now
  };
}

/**
 * Validate a manifest against spec v1.0.
 * @returns {{valid:boolean, errors:string[]}}
 */
function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return { valid: false, errors: ['manifest must be an object'] };
  if (m.specVersion !== SPEC_VERSION) errors.push(`specVersion must be "${SPEC_VERSION}"`);
  if (!m.id || typeof m.id !== 'string') errors.push('id (string) required');
  if (!m.name || typeof m.name !== 'string') errors.push('name (string) required');
  if (!m.brain || typeof m.brain !== 'object') {
    errors.push('brain (object) required');
  } else {
    if (!m.brain.provider) errors.push('brain.provider required');
    if (!m.brain.model) errors.push('brain.model required');
  }
  if (!Array.isArray(m.tools)) errors.push('tools must be an array');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildManifest, validateManifest, SPEC_VERSION };
