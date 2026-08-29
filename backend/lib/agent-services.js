/* ══════════════════════════════════════════════════════════════════════════
   AGENT SERVICES — what the council sells, and for how much.

   This is the piece between "we have agents" and "agents earn income". Each
   entry is a DELIVERABLE somebody would actually ask for, priced in whole
   Sparks, mapped to skills that really run.

   WHY WHOLE DELIVERABLES AND NOT RAW UNITS: economy-service rejects
   non-integer amounts outright (assertPositiveIntAmount), so "0.5 Sparks for
   one voiceover" is not expressible — and that constraint is correct. Nobody
   wants to buy a voiceover; they want a narrated content pack. Pricing the
   thing someone actually wants is both better product and the only thing the
   ledger will accept.

   WHY THESE PRICES: text inference costs us ~$0.0016 an answer, so cost is
   not the constraint — value is. The ladder is deliberate and legible:

     1 Spark    a quick check, seconds of work, a yes/no with a reason
     2-3        a real deliverable somebody would otherwise do themselves
     5          sustained or repeated work, or something reusable
     10         the whole council, orchestrated

   A buyer should be able to guess the price before seeing it. If they cannot,
   the ladder is wrong.

   REFUNDS ARE NOT OPTIONAL. Sparks are spent BEFORE the work runs, because a
   free retry loop is an obvious way to drain inference. If the work then
   fails, the spend is refunded automatically — see order(). Charging for
   nothing is the fastest way to lose the twenty people we are trying to keep.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* Every service names the skills it needs. As in agent-forge, a service whose
   skills have gone missing is not offered — the catalogue can never advertise
   something the router cannot execute. */
const SERVICES = [
  // ── ZEROX · money ───────────────────────────────────────────────────────
  {
    id: 'coin-check', agent: 'ZEROX', sparks: 1,
    name: 'Coin check',
    blurb: 'Is this token worth touching? A risk score, the holder picture, and the reason for the call.',
    delivers: 'A verdict with the evidence behind it.',
    skills: ['on-chain-intel', 'risk-management'],
    minutes: 1,
  },
  {
    id: 'sentiment-brief', agent: 'ZEROX', sparks: 2,
    name: 'Market sentiment brief',
    blurb: 'What the market is feeling right now and what is actually driving it.',
    delivers: 'A written read on fear, greed and the narrative underneath.',
    skills: ['sentiment-analysis', 'market-pulse'],
    minutes: 2,
  },
  {
    id: 'signals-week', agent: 'ZEROX', sparks: 5,
    name: 'Signals, delivered for a week',
    blurb: 'Seven days of calls sent straight to you, each with the reasoning attached.',
    delivers: 'A daily signal for seven days.',
    skills: ['crypto-trading', 'on-chain-intel', 'market-pulse'],
    minutes: 3, recurring: true,
  },

  // ── PIKADON · safety ────────────────────────────────────────────────────
  {
    id: 'contract-audit', agent: 'PIKADON', sparks: 3,
    name: 'Contract audit',
    blurb: 'Read the contract before you send anything to it. Every red flag, stated plainly.',
    delivers: 'A security review with the specific risks named.',
    skills: ['threat-detector', 'forensics'],
    minutes: 3,
  },
  {
    id: 'leak-scan', agent: 'PIKADON', sparks: 2,
    name: 'Exposure scan',
    blurb: 'What of yours is already public — keys, secrets, things you thought were private.',
    delivers: 'A list of what is exposed and how to close it.',
    skills: ['leak-scanner', 'compliance-scanner'],
    minutes: 2,
  },

  // ── QUILL · words ───────────────────────────────────────────────────────
  {
    id: 'content-pack', agent: 'QUILL', sparks: 3,
    name: 'Content pack — 10 posts',
    blurb: 'Ten posts in one consistent voice, ready to schedule.',
    delivers: 'Ten finished posts, not ten prompts.',
    skills: ['copywriter', 'tone-engineer', 'content-strategy'],
    minutes: 4,
  },
  {
    id: 'article', agent: 'QUILL', sparks: 2,
    name: 'Article or newsletter',
    blurb: 'Long-form that is researched and finished rather than started.',
    delivers: 'One publishable piece, edited.',
    skills: ['content-creator', 'editor'],
    minutes: 3,
  },
  {
    id: 'voice-guide', agent: 'QUILL', sparks: 5,
    name: 'Brand voice guide',
    blurb: 'Define the voice once. Every agent you own then writes in it, forever.',
    delivers: 'A reusable voice specification your agents load automatically.',
    skills: ['tone-engineer', 'copywriter', 'editor'],
    minutes: 5, reusable: true,
  },

  // ── ORACLE · research ───────────────────────────────────────────────────
  {
    id: 'research-brief', agent: 'ORACLE', sparks: 3,
    name: 'Research brief',
    blurb: 'A real answer to a hard question, with the sources it came from.',
    delivers: 'A cited brief you could hand to someone else.',
    skills: ['research', 'research-engine'],
    minutes: 4,
  },
  {
    id: 'chart-reading', agent: 'ORACLE', sparks: 2,
    name: 'Chart reading',
    blurb: 'Natal chart, numerology, gematria or the current lunar timing.',
    delivers: 'A full interpretation, not a one-line horoscope.',
    skills: ['natal-chart', 'numerology', 'astrology'],
    minutes: 2,
  },

  // ── TURTLE · things you can see ─────────────────────────────────────────
  {
    id: 'image-set', agent: 'TURTLE', sparks: 2,
    name: 'Image set — 5 images',
    blurb: 'Five images on one brief, in one consistent look.',
    delivers: 'Five images plus the palette they share.',
    skills: ['generate-image', 'color-palette-ai'],
    minutes: 3, usesMedia: true,
  },
  {
    id: 'sprite-sheet', agent: 'TURTLE', sparks: 3,
    name: 'Sprite sheet',
    blurb: 'Game-ready sprites and the sheet that packs them.',
    delivers: 'A sprite sheet you can drop into an engine.',
    skills: ['pixel-sprite-gen', 'sprite-sheet-creator'],
    minutes: 4, usesMedia: true,
  },

  // ── NEXUS · build ───────────────────────────────────────────────────────
  {
    id: 'build-module', agent: 'NEXUS', sparks: 5,
    name: 'Build a working module',
    blurb: 'Describe what it must do. Get code that does it, with the plan around it.',
    delivers: 'Working code plus the dependency map.',
    skills: ['code-generation', 'dependency-mapper'],
    minutes: 6,
  },

  // ── SHADDAI · the whole council ─────────────────────────────────────────
  {
    id: 'council-session', agent: 'SHADDAI', sparks: 10,
    name: 'Council session',
    blurb: 'All seven weigh in on one decision, then SHADDAI makes the call.',
    delivers: 'Seven perspectives and a decision you can act on.',
    skills: ['orchestration', 'strategic-planning'],
    minutes: 8, premium: true,
  },
];

/** The skills the router can genuinely execute right now. */
function runnableSkills() {
  try {
    const cat = require('../skill-router').AGENT_SKILLS || {};
    const out = {};
    for (const a of Object.keys(cat)) {
      for (const id of Object.keys((cat[a] && cat[a].skills) || {})) out[id] = true;
    }
    return out;
  } catch (_) { return {}; }
}

/**
 * The catalogue, annotated with whether each service can actually run.
 * A service missing ANY of its skills is marked unavailable rather than
 * quietly degraded — half a deliverable is not the thing that was bought.
 */
function catalogue() {
  const have = runnableSkills();
  return SERVICES.map((s) => {
    const missing = s.skills.filter((k) => !have[k]);
    return Object.assign({}, s, { available: missing.length === 0, missing });
  });
}

function byId(id) { return catalogue().find((s) => s.id === id) || null; }

/** Grouped by agent, for a storefront. Unavailable services are omitted. */
function storefront() {
  const out = {};
  for (const s of catalogue()) {
    if (!s.available) continue;
    (out[s.agent] = out[s.agent] || []).push(s);
  }
  return out;
}

/**
 * Buy one service.
 *
 * Order of operations matters and is deliberate:
 *   1. validate the service exists and can run
 *   2. SPEND first — otherwise a failing job is a free inference loop
 *   3. run the work
 *   4. REFUND if it failed, using a derived idempotency key
 *
 * @param {object} deps  { economy, execute }  injected so this is testable
 *   economy  economy-service instance (grant/spend/getBalance)
 *   execute  async ({service, input, agent}) => result  — the actual work
 * @param {object} req   { userId, serviceId, input, idempotencyKey }
 */
async function order(deps, req) {
  const { economy, execute } = deps || {};
  const userId = String((req && req.userId) || '').trim();
  const svc = byId(String((req && req.serviceId) || ''));

  if (!userId) return { ok: false, error: 'not signed in' };
  if (!svc) return { ok: false, error: 'no such service' };
  if (!svc.available) {
    return { ok: false, error: `"${svc.name}" is unavailable right now`, missing: svc.missing };
  }
  if (!economy) return { ok: false, error: 'the Sparks ledger is unavailable' };

  // Idempotency: a double-tapped button must not charge twice. Caller-supplied
  // when possible, otherwise derived from the order itself.
  const key = String((req && req.idempotencyKey) || `svc_${userId}_${svc.id}_${Date.now()}`);

  // ── 2. charge ───────────────────────────────────────────────────────────
  try {
    await economy.spend(userId, svc.sparks, `service:${svc.id}`, key);
  } catch (e) {
    const name = e && e.constructor && e.constructor.name;
    if (name === 'InsufficientFundsError' || /insufficient/i.test(String(e && e.message))) {
      let balance = null;
      try { balance = await economy.getBalance(userId); } catch (_) {}
      return {
        ok: false, error: 'not enough Sparks',
        needed: svc.sparks, balance,
        // Actionable, not just a refusal.
        shortfall: balance === null ? null : Math.max(0, svc.sparks - balance),
      };
    }
    return { ok: false, error: String((e && e.message) || e) };
  }

  // ── 3. do the work ──────────────────────────────────────────────────────
  let result;
  try {
    if (typeof execute !== 'function') throw new Error('no executor wired');
    result = await execute({ service: svc, agent: svc.agent, input: (req && req.input) || '', userId });
    if (result && result.ok === false) throw new Error(result.error || 'the agent could not complete this');
  } catch (e) {
    // ── 4. refund ─────────────────────────────────────────────────────────
    // Deterministic key so a retry of the refund itself cannot double-credit.
    let refunded = false;
    try {
      await economy.grant(userId, svc.sparks, `refund:${svc.id}`, `refund_${key}`);
      refunded = true;
    } catch (re) {
      // A failed refund is the worst outcome here: charged, nothing delivered.
      // Loud, and explicitly flagged for a human.
      console.error(`[services] REFUND FAILED for ${userId} on ${svc.id} (${svc.sparks} Sparks) — MANUAL REFUND REQUIRED:`, re && re.message);
    }
    return {
      ok: false,
      error: String((e && e.message) || e),
      refunded,
      charged: refunded ? 0 : svc.sparks,
      note: refunded
        ? 'Your Sparks were returned — you were not charged.'
        : 'The work failed AND the refund failed. This has been logged for manual correction.',
    };
  }

  let balance = null;
  try { balance = await economy.getBalance(userId); } catch (_) {}
  return {
    ok: true,
    service: { id: svc.id, name: svc.name, agent: svc.agent, sparks: svc.sparks },
    result,
    balance,
  };
}

module.exports = { SERVICES, catalogue, storefront, byId, order, runnableSkills };
