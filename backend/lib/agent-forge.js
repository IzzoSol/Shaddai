/* ══════════════════════════════════════════════════════════════════════════
   AGENT FORGE — create an agent top to bottom in one call.

   Before this, making an agent meant touching four stores by hand and hoping
   they agreed with each other:

     custom_agents.json    identity + system prompt  (read by agent-registry,
                           which is what actually makes an agent answerable)
     data/agents/*.md      the persona file the council members have
     agent_wallets.json    a spend budget, keyed by NAME
     forge-state.json      the portrait, written by the art forge

   Nothing tied them together, so a "created" agent could exist in one store
   and be invisible everywhere else. forgeAgent() writes all of them from one
   validated spec, in a fixed order, and rolls back what it wrote if a later
   step fails — a half-made agent is worse than no agent, because it looks
   real in a list and then does nothing when hired.

   WHAT IT DELIBERATELY DOES NOT DO: invent capability. An agent may only be
   granted skills that exist in skill-router's catalogue and can actually be
   executed. Granting "trade" to an agent that has no trading code would be a
   lie told to the person who paid for it.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CUSTOM_AGENTS_FILE = path.join(DATA_DIR, 'custom_agents.json');
const WALLETS_FILE = path.join(DATA_DIR, 'agent_wallets.json');
const PERSONA_DIR = path.join(DATA_DIR, 'agents', 'custom');

/* ── storage helpers ─────────────────────────────────────────────────────── */

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

// Temp file + rename. A truncated custom_agents.json fails JSON.parse, and
// agent-registry treats an unreadable file as "no custom agents" — so a crash
// mid-write would silently delete every agent a person had made.
function writeJSON(file, value) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ── what an agent can be given ──────────────────────────────────────────── */

/* The jobs a person actually asks for, each mapped onto skills that exist in
   skill-router. The catalogue there is organised by which council member owns
   the skill; this is organised by what someone wants done, which is the only
   thing they can be expected to know when naming their agent. */
const JOB_KITS = {
  trade: {
    label: 'Trade & analyse coins',
    blurb: 'Reads the market, scores a token, sizes the position, and explains the call before it makes it.',
    skills: ['crypto-trading', 'on-chain-intel', 'sentiment-analysis', 'risk-management', 'market-pulse'],
    needsWallet: true,
  },
  content: {
    label: 'Write content packs',
    blurb: 'Threads, posts, headlines and captions in one consistent voice — a pack at a time.',
    skills: ['copywriter', 'tone-engineer', 'content-strategy', 'editor'],
    needsWallet: false,
  },
  blog: {
    label: 'Write blogs & long-form',
    blurb: 'Articles, newsletters and stories, researched and finished rather than started.',
    skills: ['content-creator', 'storyteller', 'editor', 'research'],
    needsWallet: false,
  },
  merch: {
    label: 'Design & sell merch',
    blurb: 'Makes the artwork, picks the palette, writes the listing and prices it.',
    skills: ['generate-image', 'color-palette-ai', 'pixel-sprite-gen', 'copywriter', 'scaling-models'],
    needsWallet: true,
  },
  research: {
    label: 'Research & investigate',
    blurb: 'Digs through sources across any topic and comes back with what is actually true.',
    skills: ['research', 'research-engine', 'strategic-planning'],
    needsWallet: false,
  },
  build: {
    label: 'Write code',
    blurb: 'Builds and fixes — JS, Python, Solidity, Rust — and plans the work around it.',
    skills: ['code-generation', 'workflow-orchestrator', 'dependency-mapper'],
    needsWallet: false,
  },
  guard: {
    label: 'Check safety',
    blurb: 'Audits a contract, scans for leaks, and says plainly what could go wrong.',
    skills: ['threat-detector', 'leak-scanner', 'compliance-scanner', 'forensics', 'risk-management'],
    needsWallet: false,
  },
  money: {
    label: 'Run the numbers',
    blurb: 'Cashflow, unit economics, growth models and what a thing should cost.',
    skills: ['finance-tools', 'scaling-models', 'strategic-planning'],
    needsWallet: false,
  },
  art: {
    label: 'Make art & game assets',
    blurb: 'Images, sprites, sheets, tilemaps, palettes and fractals.',
    skills: ['generate-image', 'pixel-sprite-gen', 'sprite-sheet-creator', 'tilemap-builder', 'fractal-generator'],
    needsWallet: false,
  },
  esoteric: {
    label: 'Read charts & symbols',
    blurb: 'Natal charts, numerology, gematria, sacred geometry and lunar timing.',
    skills: ['natal-chart', 'numerology', 'gematria', 'astrology', 'sacred-geometry', 'moon-phase'],
    needsWallet: false,
  },
};

/* Resolve JOB_KITS against the live skill catalogue. A kit lists what it wants;
   this returns only what skill-router can really run, so the agent's advertised
   abilities and its actual abilities can never drift apart as skills change. */
function availableSkills() {
  let catalogue = {};
  try { catalogue = require('../skill-router').AGENT_SKILLS || {}; } catch (_) { return {}; }
  const out = {};
  for (const agentKey of Object.keys(catalogue)) {
    const skills = (catalogue[agentKey] && catalogue[agentKey].skills) || {};
    for (const id of Object.keys(skills)) {
      // first owner wins; the same skill id under two agents is the same capability
      if (!out[id]) out[id] = { id, desc: skills[id].desc || id, owner: agentKey };
    }
  }
  return out;
}

/** The kits, each annotated with the skills that are genuinely runnable today. */
function listKits() {
  const have = availableSkills();
  return Object.keys(JOB_KITS).map((id) => {
    const kit = JOB_KITS[id];
    const granted = kit.skills.filter((s) => have[s]);
    return {
      id,
      label: kit.label,
      blurb: kit.blurb,
      needsWallet: kit.needsWallet,
      skills: granted,
      // Honest signal for the UI: a kit whose skills have all gone away should
      // not be offered as though it works.
      available: granted.length > 0,
    };
  });
}

/* ── persona ─────────────────────────────────────────────────────────────── */

const TRAITS = {
  blunt: 'Say the thing directly. No preamble, no hedging, no apologising for the answer.',
  warm: 'Be encouraging and human. Assume the person is trying their best.',
  precise: 'Be exact. Prefer a number to an adjective, and name your sources.',
  playful: 'Keep it light. A little wit, never at the cost of being useful.',
  formal: 'Keep a professional register. Complete sentences, no slang.',
  skeptical: 'Question the premise before answering it. Say what would have to be true.',
};

/* The persona file. Written as real markdown because that is what the seven
   council members use (backend/data/agents/*.md) — a forged agent should be
   the same kind of thing as a built-in one, editable by hand afterwards, not a
   JSON string nobody can find. */
function personaMarkdown(spec) {
  const traitLines = (spec.traits || [])
    .filter((t) => TRAITS[t])
    .map((t) => `- **${t}** — ${TRAITS[t]}`);

  return [
    `# ${spec.name}`,
    '',
    `> ${spec.role}`,
    '',
    '## Who this is',
    '',
    spec.description || `${spec.name} is a forged SHADDAI agent.`,
    '',
    '## How it speaks',
    '',
    traitLines.length ? traitLines.join('\n') : '- No particular character. Answer plainly and get out of the way.',
    '',
    '## What it does',
    '',
    (spec.kits || []).map((k) => `- ${(JOB_KITS[k] && JOB_KITS[k].label) || k}`).join('\n') || '- General work.',
    '',
    '## Rules',
    '',
    '- Never claim to have done something that was not done.',
    '- If a task needs money, say what it will cost before spending it.',
    '- If the answer is not known, say so rather than filling the gap.',
    '',
    `<!-- forged ${new Date().toISOString()} · owner ${spec.owner} -->`,
    '',
  ].join('\n');
}

/* The runtime system prompt. agent-registry.systemPromptFor() uses this
   verbatim for a custom agent, so what someone writes here is literally what
   answers them. Modes:
     authored  persona composed from the traits they picked
     none      no character at all — some people want a tool, not a personality
     custom    their own markdown, used exactly as written */
function systemPromptFor(spec) {
  if (spec.personaMode === 'custom' && spec.persona) return String(spec.persona).slice(0, 8000);

  const jobs = (spec.kits || [])
    .map((k) => (JOB_KITS[k] && JOB_KITS[k].label.toLowerCase()) || k)
    .join(', ');

  if (spec.personaMode === 'none') {
    return [
      `You are ${spec.name}. You have no persona and no character voice.`,
      jobs ? `You handle: ${jobs}.` : '',
      'Answer plainly and completely. Do not roleplay, do not perform, do not sign off.',
      'Never claim to have done something you did not do.',
    ].filter(Boolean).join(' ');
  }

  const traits = (spec.traits || []).filter((t) => TRAITS[t]).map((t) => TRAITS[t]);
  return [
    `You are ${spec.name}, ${spec.role}.`,
    spec.description ? spec.description : '',
    jobs ? `Your work: ${jobs}.` : '',
    traits.length ? `How you speak: ${traits.join(' ')}` : '',
    'Never claim to have done something you did not do. If a task needs money, say what it costs before spending it. If you do not know, say so.',
  ].filter(Boolean).join('\n');
}

/* ── validation ──────────────────────────────────────────────────────────── */

function validate(spec) {
  const errs = [];
  const name = String((spec && spec.name) || '').trim();

  if (!name) errs.push('name is required');
  else if (name.length > 32) errs.push('name must be 32 characters or fewer');
  // The name becomes a wallet key and part of a filename. Restricting it here
  // is what keeps it from becoming a path traversal or a colliding wallet.
  else if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name)) {
    errs.push('name may use letters, numbers, spaces, hyphens and underscores only');
  }

  if (spec && spec.color && !/^#[0-9a-fA-F]{6}$/.test(String(spec.color))) {
    errs.push('color must be a hex value like #00ff9c');
  }

  const modes = ['authored', 'none', 'custom'];
  if (spec && spec.personaMode && modes.indexOf(spec.personaMode) === -1) {
    errs.push(`personaMode must be one of: ${modes.join(', ')}`);
  }
  if (spec && spec.personaMode === 'custom' && !String((spec.persona) || '').trim()) {
    errs.push('personaMode "custom" needs a persona');
  }

  const kits = (spec && spec.kits) || [];
  if (!Array.isArray(kits)) errs.push('kits must be a list');
  else for (const k of kits) if (!JOB_KITS[k]) errs.push(`unknown kit: ${k}`);

  return errs;
}

/* ── the forge ───────────────────────────────────────────────────────────── */

/**
 * Create an agent end to end.
 *
 * @param {object} spec
 *   name         required, becomes the wallet key and persona filename
 *   role         a one-line job title
 *   description  a sentence about it, used in the persona file
 *   emoji, color identity
 *   personaMode  'authored' | 'none' | 'custom'
 *   traits       trait ids, when personaMode is 'authored'
 *   persona      markdown, when personaMode is 'custom'
 *   kits         job kit ids — what it is allowed to do
 *   owner        who it belongs to
 *   wallet       { budget_daily, budget_per_tx, requires_approval_above } — optional
 *
 * @returns {{ok:true, agent:object}|{ok:false, error:string, details?:string[]}}
 */
function forgeAgent(spec) {
  spec = spec || {};
  const errs = validate(spec);
  if (errs.length) return { ok: false, error: 'invalid agent', details: errs };

  const name = String(spec.name).trim();
  const owner = String(spec.owner || 'anon');
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const walletKey = name.toUpperCase();

  const kits = (spec.kits || []).filter((k) => JOB_KITS[k]);
  const have = availableSkills();
  // Only skills that can really be executed. See the header note: an agent's
  // advertised abilities must equal its actual ones.
  const skills = [];
  for (const k of kits) {
    for (const s of JOB_KITS[k].skills) if (have[s] && skills.indexOf(s) === -1) skills.push(s);
  }
  const needsWallet = kits.some((k) => JOB_KITS[k].needsWallet);

  const record = {
    id,
    name,
    emoji: String(spec.emoji || '🤖').slice(0, 8),
    role: String(spec.role || 'Custom Agent').slice(0, 64),
    color: /^#[0-9a-fA-F]{6}$/.test(String(spec.color || '')) ? spec.color : '#00e5ff',
    description: String(spec.description || '').slice(0, 600),
    // agent-registry reads exactly this field to answer as the agent
    systemPrompt: systemPromptFor({ ...spec, name, kits }),
    personaMode: spec.personaMode || 'authored',
    traits: (spec.traits || []).filter((t) => TRAITS[t]),
    kits,
    skills,
    owner,
    avatarUrl: spec.avatarUrl || null,
    walletKey: needsWallet ? walletKey : null,
    personaFile: null,
    createdAt: new Date().toISOString(),
  };

  // Track what we wrote so a later failure can be undone. An agent that exists
  // in two of four stores is the exact failure this module exists to prevent.
  const undo = [];

  try {
    // 1 ── persona markdown on disk
    if (!fs.existsSync(PERSONA_DIR)) fs.mkdirSync(PERSONA_DIR, { recursive: true });
    const personaPath = path.join(PERSONA_DIR, `${id}.md`);
    const md = spec.personaMode === 'custom' && spec.persona
      ? String(spec.persona)
      : personaMarkdown({ ...spec, name, owner, kits });
    fs.writeFileSync(personaPath, md, 'utf8');
    undo.push(() => { try { fs.unlinkSync(personaPath); } catch (_) {} });
    record.personaFile = path.relative(path.join(__dirname, '..'), personaPath).replace(/\\/g, '/');

    // 2 ── wallet, only when a kit actually needs to spend
    if (needsWallet) {
      const wallets = readJSON(WALLETS_FILE, {});
      if (wallets[walletKey]) {
        // A wallet under this name already exists — almost certainly a second
        // agent with the same name, and merging them would let one spend the
        // other's balance. Refuse rather than silently share funds.
        throw new Error(`a wallet already exists for "${walletKey}" — choose a different name`);
      }
      const w = spec.wallet || {};
      const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
      wallets[walletKey] = {
        agent: walletKey,
        balance: 0,                                   // funded separately, never by the forge
        budget_daily: num(w.budget_daily, 0.05),
        budget_per_tx: num(w.budget_per_tx, 0.01),
        spent_today: 0,
        day_started: new Date().toISOString().slice(0, 10),
        requires_approval_above: num(w.requires_approval_above, 0.005),
        owner,
        forged: true,
        tx_log: [],
      };
      writeJSON(WALLETS_FILE, wallets);
      undo.push(() => {
        try {
          const cur = readJSON(WALLETS_FILE, {});
          delete cur[walletKey];
          writeJSON(WALLETS_FILE, cur);
        } catch (_) {}
      });
    }

    // 3 ── the registry entry LAST, because this is the one that makes the
    //      agent answerable. Nothing should be able to hire an agent whose
    //      persona or wallet failed to write.
    const list = readJSON(CUSTOM_AGENTS_FILE, []);
    const arr = Array.isArray(list) ? list : [];
    arr.push(record);
    writeJSON(CUSTOM_AGENTS_FILE, arr);

    return { ok: true, agent: record };
  } catch (e) {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]();
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** Every agent an owner has forged. */
function listByOwner(owner) {
  const list = readJSON(CUSTOM_AGENTS_FILE, []);
  if (!Array.isArray(list)) return [];
  const want = String(owner || 'anon');
  return list.filter((a) => a && String(a.owner || 'anon') === want);
}

/** Remove an agent and everything the forge created for it. */
function removeAgent(id, owner) {
  const list = readJSON(CUSTOM_AGENTS_FILE, []);
  const arr = Array.isArray(list) ? list : [];
  const found = arr.find((a) => a && a.id === id);
  // 404 rather than 403 for someone else's agent: confirming that an id exists
  // is itself a leak.
  if (!found || String(found.owner || 'anon') !== String(owner || 'anon')) return { ok: false, error: 'not found' };

  writeJSON(CUSTOM_AGENTS_FILE, arr.filter((a) => a.id !== id));

  if (found.personaFile) {
    try { fs.unlinkSync(path.join(__dirname, '..', found.personaFile)); } catch (_) {}
  }
  if (found.walletKey) {
    const wallets = readJSON(WALLETS_FILE, {});
    const w = wallets[found.walletKey];
    // Keep a wallet that still holds money. Deleting it would destroy the only
    // record of a balance; the owner can empty it and delete it deliberately.
    if (w && !Number(w.balance)) {
      delete wallets[found.walletKey];
      writeJSON(WALLETS_FILE, wallets);
    }
  }
  return { ok: true };
}

module.exports = {
  JOB_KITS, TRAITS,
  listKits, availableSkills,
  validate, forgeAgent, listByOwner, removeAgent,
  personaMarkdown, systemPromptFor,
};
