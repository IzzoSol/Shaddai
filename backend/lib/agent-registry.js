// backend/lib/agent-registry.js
'use strict';
//
// One place that answers "who is doing this job?" for the Quick Start runner.
//
// Two sources:
//   • the built-in council (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON)
//   • forged agents the user built themselves, from backend/data/custom_agents.json
//
// The resolved agent is not decoration — it supplies the system prompt that steers the
// LLM, and the visual identity (accent colour, voice) that a generated website is built
// from. Two agents given the same answers produce genuinely different output.

const fs = require('fs');
const path = require('path');

const CUSTOM_AGENTS_FILE = path.join(__dirname, '..', 'data', 'custom_agents.json');

// The council. `voice` steers the writing, `design` steers anything visual, `accent`
// is the colour a site this agent builds is themed around.
const COUNCIL = {
  SHADDAI: {
    id: 'SHADDAI', name: 'SHADDAI', emoji: '👑', role: 'Supreme Orchestrator',
    accent: '#e8c45c', palette: 'minimal_dark',
    voice: 'strategic and decisive — leads with the bottom line, never hedges, thinks in outcomes and tradeoffs',
    design: 'authoritative and considered; dark, gold-accented, generous spacing, nothing decorative without a job',
  },
  ZEROX: {
    id: 'ZEROX', name: 'ZEROX', emoji: '💰', role: 'Wealth & Revenue',
    accent: '#00c853', palette: 'minimal_dark',
    voice: 'growth-focused and numeric — talks in prices, margins and conversion, always names the money',
    design: 'high-conversion; strong offer above the fold, obvious call to action, proof close to the ask',
  },
  ORACLE: {
    id: 'ORACLE', name: 'ORACLE', emoji: '🔮', role: 'Research & Intelligence',
    accent: '#7c4dff', palette: 'minimal_dark',
    voice: 'thorough and curious — structures everything, separates what is known from what is assumed',
    design: 'information-dense and well-organised; clear hierarchy, scannable sections, facts foregrounded',
  },
  NEXUS: {
    id: 'NEXUS', name: 'NEXUS', emoji: '⚙️', role: 'Technical Architect',
    accent: '#00e5ff', palette: 'minimal_dark',
    voice: 'precise and practical — plain language, concrete examples, no cleverness for its own sake',
    design: 'clean and technical; systematic spacing, monospace accents, function over flourish',
  },
  TURTLE: {
    id: 'TURTLE', name: 'TURTLE', emoji: '🎨', role: 'UI/UX & Creative',
    accent: '#ff2bd6', palette: 'bold_neon',
    voice: 'warm and vivid — writes with rhythm and imagery, makes people feel something',
    design: 'bold and expressive; big type, confident colour, motion and personality everywhere',
  },
  QUILL: {
    id: 'QUILL', name: 'QUILL', emoji: '✍️', role: 'Writing & Communication',
    accent: '#c9622a', palette: 'warm_light',
    voice: 'clear and polished — short sentences, zero filler, every word earning its place',
    design: 'editorial and readable; text-led, beautiful typography, light and calm',
  },
  PIKADON: {
    id: 'PIKADON', name: 'PIKADON', emoji: '🛡️', role: 'Security & Compliance',
    accent: '#ff5252', palette: 'minimal_dark',
    voice: 'rigorous and defensive — states risks plainly, flags assumptions, never oversells',
    design: 'sober and trustworthy; restrained colour, clear claims, no hype that could not be defended',
  },
};

const DEFAULT_AGENT_ID = 'SHADDAI';

function loadCustomAgents() {
  try {
    const raw = JSON.parse(fs.readFileSync(CUSTOM_AGENTS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return []; // no forged agents yet, or the file is unreadable — never fatal
  }
}

// A forged agent carries the persona its owner wrote. We keep that system prompt intact
// and derive the visual identity from the colour they picked, so their agent looks like
// theirs rather than being flattened into a council default.
function fromCustom(a) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(a.color || '')) ? a.color : '#00e5ff';
  return {
    id: String(a.id),
    name: String(a.name || 'Custom Agent'),
    emoji: String(a.emoji || '🤖'),
    role: String(a.role || 'Custom Agent'),
    accent,
    palette: 'minimal_dark',
    voice: 'as defined by this agent\'s own persona',
    design: 'clean and modern, themed around this agent\'s signature colour',
    systemPrompt: String(a.systemPrompt || ''),
    isCustom: true,
  };
}

/**
 * List every agent available to run a Quick Start job — council first, then forged.
 * Shape is safe to send to the client (it is identity, not prompt engineering).
 */
function listAgents() {
  const council = Object.values(COUNCIL).map((a) => ({
    id: a.id, name: a.name, emoji: a.emoji, role: a.role, accent: a.accent, isCustom: false,
  }));
  const custom = loadCustomAgents().map(fromCustom).map((a) => ({
    id: a.id, name: a.name, emoji: a.emoji, role: a.role, accent: a.accent, isCustom: true,
  }));
  return council.concat(custom);
}

/**
 * Resolve an agent id to the full record used to run a job.
 * Unknown or missing ids fall back to the default rather than failing — a bad id in a
 * URL should never cost the user their answers.
 */
function resolveAgent(agentId) {
  const wanted = String(agentId || '').trim();
  if (!wanted) return COUNCIL[DEFAULT_AGENT_ID];

  const upper = wanted.toUpperCase();
  if (COUNCIL[upper]) return COUNCIL[upper];

  const found = loadCustomAgents().find((a) => String(a.id) === wanted);
  if (found) return fromCustom(found);

  return COUNCIL[DEFAULT_AGENT_ID];
}

/**
 * Build the system prompt for a job: the agent's identity first, then the job's own
 * instructions. A forged agent's own persona is used verbatim so the thing the user
 * built is the thing that answers.
 */
function systemPromptFor(agent, jobInstruction) {
  const identity = agent.isCustom && agent.systemPrompt
    ? agent.systemPrompt
    : `You are ${agent.name}, ${agent.role} of the SHADDAI council. Your voice is ${agent.voice}.`;

  return `${identity}\n\nStay in that voice for everything you produce.\n\nYour task:\n${jobInstruction}`;
}

module.exports = { COUNCIL, DEFAULT_AGENT_ID, listAgents, resolveAgent, systemPromptFor, loadCustomAgents };
