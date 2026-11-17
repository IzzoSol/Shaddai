/* ══════════════════════════════════════════════════════════════════════════
   BODY CATALOG — every body a forged agent can wear, and the ONE place that
   decides whether a body pick is real.

   Before this module, three separate places each kept their own model list
   (operatives.js, agent-forge-routes.js, the dashboard viewers) and every
   one of them silently rewrote an unlisted pick to 'SHADDAI'. The eight
   Forge archetype bodies — real GLBs at /assets/forge-models/<id>.glb —
   could never be assigned at all: pick one and the agent quietly wore
   SHADDAI instead, with no error anywhere.

   THE RULE NOW: a pick either persists exactly as picked (canonical key),
   or the API answers with an explicit error naming the valid bodies.
   There is no third outcome. normModel() in operatives.js remains only as
   a defensive default for internal writers that never had a user pick
   (forge-state sync, portrait forge); every user-facing route validates
   through resolveModel() first.

   Canonical keys:
     council    'ZEROX'           → /assets/agents/ZEROX.glb
     archetype  'FORGE-GHOST'     → /assets/forge-models/ghost-final.glb
                                  (the realm's WorldOperatives.glbFor key)
     pixel      'PIXEL'           → no GLB; the pixel-forge sprite body
     glow       (not a model)     → the office glow bot lives in `look`,
                                  never in `model`; see catalogue()

   THE GATE: per the founder flow, the 3D body is the paid step. Which plan
   it belongs to is READ from the plans table (lib/tiers.js) — the lowest
   tier whose unlocks include the body-building unlock — never hardcoded
   here. Off-switch: SHADDAI_FORGE_GATE=0 disables the gate (validation
   still applies). Local/single-user installs ('local' identity) are
   entitled, the same convention the rest of this codebase uses.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const COUNCIL_MODELS = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];

/* The 8 Forge archetypes — keys must match backend/forge/forge-core.js
   ARCHETYPES and public/assets/forge-models/manifest.json. Loaded from
   forge-core so the list can never drift; the literal fallback is the
   same list, used only if forge-core ever fails to load. */
let ARCHETYPE_IDS = ['vanguard', 'ghost', 'artisan', 'oracle', 'street-deity', 'gaia-link', 'psionic', 'harvester'];
let ARCHETYPE_NAMES = {};
try {
  const core = require('../forge/forge-core');
  if (core && core.ARCHETYPES && Object.keys(core.ARCHETYPES).length) {
    ARCHETYPE_IDS = Object.keys(core.ARCHETYPES);
    for (const id of ARCHETYPE_IDS) ARCHETYPE_NAMES[id] = core.ARCHETYPES[id].name || id;
  }
} catch (_) { /* fallback list above */ }
for (const id of ARCHETYPE_IDS) {
  if (!ARCHETYPE_NAMES[id]) ARCHETYPE_NAMES[id] = id.replace(/(^|-)(\w)/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase());
}

const BODY_UNLOCK = 'Build 3D assets for the world';

function gateOff() { return process.env.SHADDAI_FORGE_GATE === '0'; }

/* The plan a 3D body belongs to, read from the plans table at call time so
   a price/tier change in tiers.js propagates with no edit here. Returns
   null when no tier carries the unlock (gate then has nothing to enforce). */
function requiredEntitlement() {
  try {
    const tiers = require('./tiers');
    const list = tiers.TIERS || [];
    for (const t of list) {
      if (t && Array.isArray(t.unlocks) && t.unlocks.includes(BODY_UNLOCK)) {
        return { id: t.id, tier: t.tier, name: t.name, price: t.price, interval: t.interval || 'month' };
      }
    }
  } catch (_) { /* plans table unavailable → no gate */ }
  return null;
}

/* Rank of an entitlement key ('free'|'pro'|'elite'|…) by plans-table order. */
function tierRank(tierKey) {
  try {
    const tiers = require('./tiers');
    const list = tiers.TIERS || [];
    for (let i = 0; i < list.length; i++) if (list[i].tier === tierKey) return i;
    if (tiers.FOUNDER && tiers.FOUNDER.tier === tierKey) {
      for (let i = 0; i < list.length; i++) if (list[i].tier === tiers.FOUNDER.tier) return i;
    }
  } catch (_) { /* fall through */ }
  return tierKey ? 0 : -1;
}

/* Is this caller entitled to assign a 3D body? 'local' (single-user/dev
   install, the codebase-wide convention) always is. Otherwise the caller's
   billing tier must reach the plans-table requirement. */
function callerEntitled(userId, billing) {
  if (gateOff()) return true;
  const req = requiredEntitlement();
  if (!req) return true;
  if (!userId || userId === 'local') return true;
  let tier = 'free';
  try {
    const svc = billing || require('../billing-service');
    const cust = svc && typeof svc.getCustomer === 'function' ? svc.getCustomer(userId) : null;
    if (cust && cust.tier) tier = String(cust.tier);
  } catch (_) { /* no billing record → free */ }
  return tierRank(tier) >= tierRank(req.tier);
}

/**
 * Resolve a user body pick to its canonical model key.
 * @returns {{ok:true, model:string|null, kind:string, glb:string|null, name:string}
 *          |{ok:false, error:string, valid:string[]}}
 * model === null means "no pick" (caller default applies) — that is the
 * only case where a default may be used, and it is never a substitution.
 */
function resolveModel(input) {
  if (input === undefined || input === null || String(input).trim() === '') {
    return { ok: true, model: null, kind: 'none', glb: null, name: '' };
  }
  const raw = String(input).trim();
  const up = raw.toUpperCase();

  if (up === 'PIXEL') return { ok: true, model: 'PIXEL', kind: 'pixel', glb: null, name: 'Pixel body' };

  if (COUNCIL_MODELS.includes(up)) {
    return { ok: true, model: up, kind: 'council', glb: `/assets/agents/${up}.glb`, portrait: `/assets/agents/${up}-portrait.png`, name: up };
  }

  const archId = up.replace(/^FORGE-/, '').toLowerCase();
  if (ARCHETYPE_IDS.includes(archId)) {
    return {
      ok: true, model: 'FORGE-' + archId.toUpperCase(), kind: 'archetype',
      glb: `/assets/forge-models/${archId}-final.glb`, portrait: `/assets/forge-models/${archId}-portrait.png`,
      name: ARCHETYPE_NAMES[archId] || archId,
    };
  }

  if (up === 'GLOW' || up === 'GLOWBOT' || up === 'GLOW-BOT') {
    return {
      ok: false,
      error: `"${raw}" is the office glow body, not a 3D world body — it is saved in the agent's look, not its model. Pick a council or archetype body for the 3D world, or leave the model unset.`,
      valid: validKeys(),
    };
  }

  return { ok: false, error: `unknown body "${raw}" — it cannot be assigned, and no substitute was chosen`, valid: validKeys() };
}

function validKeys() {
  return COUNCIL_MODELS.concat(ARCHETYPE_IDS.map((id) => 'FORGE-' + id.toUpperCase()), ['PIXEL']);
}

function gatedKind(kind) { return kind === 'council' || kind === 'archetype'; }

/* The gate verdict for a resolved pick, for routes to enforce.
   @returns {ok:true} | {ok:false, status:402, error:string, requires:object} */
function checkGate(resolved, userId, billing) {
  if (!resolved || !resolved.ok || !gatedKind(resolved.kind)) return { ok: true };
  if (callerEntitled(userId, billing)) return { ok: true };
  const req = requiredEntitlement();
  return {
    ok: false, status: 402,
    error: `The ${resolved.name} body is a 3D body, which comes with the ${req ? req.name : 'paid'} plan` +
      (req ? ` ($${req.price}/${req.interval})` : '') +
      '. Your agent keeps its free glow body until then — no substitute body was assigned.',
    requires: req,
  };
}

/** The full body catalogue for pickers (wizard + dashboard body step). */
function catalogue(userId, billing) {
  const req = requiredEntitlement();
  const entitled = callerEntitled(userId, billing);
  const gate = (kind) => (gatedKind(kind) ? { required: req, entitled } : { required: null, entitled: true });
  const bodies = [
    {
      key: 'GLOW', kind: 'glow', name: 'Glow bot', assignable: false,
      glb: null, portrait: null,
      note: 'The office body — figure, orb or crystal, with accessories. Free, and always yours. A 3D world body can be added below.',
      gate: { required: null, entitled: true },
    },
  ];
  for (const m of COUNCIL_MODELS) {
    bodies.push({
      key: m, kind: 'council', name: m, assignable: true,
      glb: `/assets/agents/${m}.glb`, portrait: `/assets/agents/${m}-portrait.png`,
      note: 'Council body — a real GLB worn in the 3D world.', gate: gate('council'),
    });
  }
  for (const id of ARCHETYPE_IDS) {
    bodies.push({
      key: 'FORGE-' + id.toUpperCase(), kind: 'archetype', name: ARCHETYPE_NAMES[id] || id, assignable: true,
      glb: `/assets/forge-models/${id}-final.glb`, portrait: `/assets/forge-models/${id}-portrait.png`,
      note: 'Forge archetype body — a real GLB worn in the 3D world.', gate: gate('archetype'),
    });
  }
  bodies.push({
    key: 'PIXEL', kind: 'pixel', name: 'Pixel body', assignable: true,
    glb: null, portrait: null,
    note: 'The pixel-forge sprite body (office). No 3D world GLB.', gate: { required: null, entitled: true },
  });
  return { bodies, required: req, entitled };
}

module.exports = {
  COUNCIL_MODELS, ARCHETYPE_IDS, ARCHETYPE_NAMES,
  resolveModel, validKeys, gatedKind, checkGate,
  requiredEntitlement, callerEntitled, tierRank, catalogue, gateOff,
};
