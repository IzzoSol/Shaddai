// backend/lib/grok-connect.js  (PATCH FILE — copy into shaddai-repo, do not edit in place here)
// ─────────────────────────────────────────────────────────────────────────────
// CONNECT A GROK BOT — ONE PASTE, VALIDATE, CONFIRM
//
// The owner pastes ONE thing into one box:
//   (a) a full shaddai-agent-import v1 JSON for a Grok bot, or
//   (b) just the bot's persona / instructions as plain text, or
//   (c) nothing but their xAI API key (bot gets a sensible default persona)
//
// …and this module returns:
//   1. a validated shaddai-agent-import v1 manifest (the exact body for
//      POST /api/agent-forge/import — same bridge as Muse / custom bots), and
//   2. a router lane entry: the bot runs as lane:'grok' on the xAI provider
//      row in providers.json, with its persona as the system prompt — so to
//      free-router.js a connected Grok bot is just another model lane.
//
// Plain text in → we build the manifest for them. Nobody hand-writes JSON.
// Credentials never transfer (per the import-bridge finding): the xAI key
// comes from env (XAI_API_KEY) or the owner's BYOK vault — never from the
// pasted text, and a key-looking string in a paste is REJECTED with a
// pointer to the key box, not stored.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const PERSONA_MAX = 500; // import v1 limits
const NAME_MAX = 40;
const TOOLS_MAX = 20;

const KEY_LOOKING = /\b(xai-[A-Za-z0-9_\-]{10,}|sk-[A-Za-z0-9_\-]{10,}|gsk_[A-Za-z0-9_\-]{10,}|AIza[A-Za-z0-9_\-]{10,})\b/;

const DEFAULT_GROK_PERSONA =
  'You are a Grok-powered agent living in Shaddai. Direct, current, and honest about what you do not know. Say what changed, with the number and the date. Never invent a price, a return, or a fact you could not check.';

/**
 * Turn one paste into a validated Grok connection.
 * @param {object} args
 * @param {string} args.paste        whatever the user pasted (JSON, persona text, or '')
 * @param {string} [args.name]       bot name (optional — derived/defaulted)
 * @param {string} [args.model]      xAI model id (default from providers.json grok lane)
 * @returns {{ok:true, manifest:object, laneEntry:object} | {ok:false, errors:string[]}}
 */
function connectGrok(args = {}) {
  const paste = (args.paste || '').trim();
  const errors = [];

  if (KEY_LOOKING.test(paste)) {
    return { ok: false, errors: ['That paste contains what looks like an API key. Keys never go in the bot box — paste the key in Settings → API Keys instead, then paste just the bot\'s instructions here.'] };
  }

  let manifest = null;
  if (paste.startsWith('{')) {
    try { manifest = JSON.parse(paste); }
    catch (e) { return { ok: false, errors: [`That looks like JSON but does not parse: ${e.message}`] }; }
    if (manifest.format !== 'shaddai-agent-import' || manifest.version !== '1') {
      return { ok: false, errors: ['JSON pasted, but it is not a shaddai-agent-import v1 manifest (format/version missing). Paste the bot\'s plain instructions instead and we will build the manifest.'] };
    }
    if (!manifest.agent || manifest.agent.source !== 'grok') {
      return { ok: false, errors: ['That manifest is not a Grok bot (agent.source must be "grok"). Use the matching connect flow for Muse / custom bots.'] };
    }
  } else {
    // Plain persona text (or empty) → build the manifest for them.
    manifest = {
      format: 'shaddai-agent-import',
      version: '1',
      agent: {
        name: (args.name || 'My Grok Bot').slice(0, NAME_MAX),
        persona: (paste || DEFAULT_GROK_PERSONA).slice(0, PERSONA_MAX),
        source: 'grok',
        model: 'grok',
        role: 'Connected Grok bot',
        description: 'Grok bot connected through the one-paste flow.',
        emoji: '🤖',
      },
      tools: [{ kind: 'shaddai-safe', name: 'search_web' }, { kind: 'shaddai-safe', name: 'calculate' }],
      skills: [],
      economy: { sparks_per_use: 0, wallet: 'none' },
      limits: { max_tools: TOOLS_MAX, name_chars: NAME_MAX, persona_chars: PERSONA_MAX },
      provenance: { author: 'owner', separate_token_note: 'No token.' },
    };
  }

  // Validate against import v1 limits (subset enforced by the bridge schema).
  const a = manifest.agent || {};
  if (!a.name || a.name.length > NAME_MAX) errors.push(`agent.name is required and must be ≤ ${NAME_MAX} chars`);
  if (!a.persona || a.persona.length > PERSONA_MAX) errors.push(`agent.persona is required and must be ≤ ${PERSONA_MAX} chars`);
  if (!Array.isArray(manifest.tools)) errors.push('tools[] is required');
  else if (manifest.tools.length > TOOLS_MAX) errors.push(`tools[] exceeds the import limit of ${TOOLS_MAX}`);
  if (errors.length) return { ok: false, errors };

  const model = args.model || 'grok-4.3'; // providers.json → xai row, lane 'grok' (paid — xAI has no free API tier)
  const laneEntry = {
    ref: `xai/${model}`,
    lane: 'grok',
    systemPrompt: a.persona,
    agentName: a.name,
    // The key is resolved at call time from env XAI_API_KEY or the owner's
    // BYOK vault — it is never part of this object.
    keySource: 'env:XAI_API_KEY|byok',
  };
  return { ok: true, manifest, laneEntry };
}

module.exports = { connectGrok, DEFAULT_GROK_PERSONA };
