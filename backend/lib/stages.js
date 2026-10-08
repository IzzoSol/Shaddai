/* ══════════════════════════════════════════════════════════════════════════
   STAGES — who a person is to the dashboard: guest | free | user | client.

   One pure function decides it, so every surface (tabs, wizard, portal,
   routes) asks the same question and gets the same answer.

     free    signed in, no paid plan, no engagement      (Explorer)
     user    active paid plan (tiers.js: pro / elite)    (Builder)
     client  active engagement created by a consultant   (Consultancy)

   Client is a FLAG on top of billing, not a tier: a client who also holds Pro
   keeps the builder features. The stage label shows the highest relationship
   (client > user > free); the feature list is the union of what each grants.

   Inputs come from the server only (verified session + Stripe-mirrored
   entitlement + engagement store). Nothing here reads a client-claimed value.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const FREE_FEATURES = ['onboarding', 'prompt_library', 'run_task_quota', 'starter_agent', 'academy'];
const BUILDER_FEATURES = ['agent_builder', 'workflows', 'agent_office', 'task_history', 'publish_templates', 'media_studio'];
const CLIENT_FEATURES = ['client_portal', 'client_chat', 'client_tasks', 'client_files', 'client_invoices'];

const LIMITS = {
  guest:  { agents: 0,  dailyTasks: 0 },
  free:   { agents: 1,  dailyTasks: 5 },
  user:   { agents: 99, dailyTasks: 500 },
  client: { agents: 1,  dailyTasks: 50 },
};

/* How to get a locked feature — shown on the lock card. */
const HINTS = {
  agent_builder:     { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to build and configure your own agents.' },
  workflows:         { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to chain agents into workflows.' },
  agent_office:      { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to open your Agent Office.' },
  task_history:      { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) for full task history.' },
  publish_templates: { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to publish templates.' },
  media_studio:      { stage: 'user',   how: 'Upgrade to Pro ($49/mo) or Max ($199/mo) to use the Media Studio.' },
  client_portal:     { stage: 'client', how: 'The client portal opens when a SHADDAI consultant starts an engagement with you. Ask for an assessment to get started.' },
};
for (const f of CLIENT_FEATURES) if (!HINTS[f]) HINTS[f] = HINTS.client_portal;

const PAID_TIERS = new Set(['pro', 'elite', 'alpha', 'builder']);

function activeEngagement(engagements) {
  return (Array.isArray(engagements) ? engagements : []).find((e) => e && e.status === 'active') || null;
}

/**
 * @param {{signedIn:boolean, entitlement?:{tier:string,active:boolean}, engagements?:object[]}} input
 */
function resolveStage(input) {
  const { signedIn, entitlement, engagements } = input || {};
  if (!signedIn) return { stage: 'guest', signedIn: false, isPaid: false, isClient: false, features: [], limits: LIMITS.guest, engagementId: null };

  const tier = String((entitlement && entitlement.tier) || 'free').toLowerCase();
  const isPaid = PAID_TIERS.has(tier) && !!(entitlement && entitlement.active);
  const eng = activeEngagement(engagements);
  const isClient = !!eng;

  const stage = isClient ? 'client' : isPaid ? 'user' : 'free';
  const features = new Set(FREE_FEATURES);
  if (isPaid) BUILDER_FEATURES.forEach((f) => features.add(f));
  if (isClient) CLIENT_FEATURES.forEach((f) => features.add(f));

  const limits = isPaid ? LIMITS.user : LIMITS[stage];
  return {
    stage, signedIn: true, tier, isPaid, isClient,
    features: [...features], limits,
    engagementId: eng ? eng.id : null,
    phase: eng ? (eng.phase || null) : null,
  };
}

const can = (resolved, feature) => !!resolved && resolved.features.indexOf(feature) !== -1;
const unlockHint = (feature) => HINTS[feature] || { stage: 'user', how: 'Sign in to see what unlocks this.' };

module.exports = { resolveStage, can, unlockHint, FREE_FEATURES, BUILDER_FEATURES, CLIENT_FEATURES, LIMITS, HINTS };
