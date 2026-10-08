/* ══════════════════════════════════════════════════════════════════════════
   ONBOARDING — goal-first wizard logic. Pure functions, no I/O.

   Eight steps (spec §2):
     1 profile     role + vertical
     2 goal        what do you want
     3 readiness   five questions -> score + adoption note
     4 recommend   council agents + starter prompts (computed, not submitted)
     5 agent       the seven user contributions for the first agent
     6 bridge      optional: which existing agents are reachable (NO credentials stored)
     7 firstrun    the task that ran + a short result summary
     8 next        computed next-step card

   Steps 4 and 8 are derived from earlier answers, so the client never submits them.
   Recommendations rank by fit and always return something (no empty exact-match).
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const VERTICALS = {
  coach:        { label: 'Coach',              plural: 'coaches',             work: 'client sessions and follow-ups' },
  real_estate:  { label: 'Real estate agent',  plural: 'real estate agents',  work: 'listings, leads and showings' },
  insurance:    { label: 'Insurance agent',    plural: 'insurance agents',    work: 'quotes, renewals and claims follow-up' },
  accountant:   { label: 'Accountant',         plural: 'accountants',         work: 'client documents, deadlines and reporting' },
  agency:       { label: 'Agency owner',       plural: 'agency owners',       work: 'client delivery, reporting and proposals' },
};

const GOALS = {
  learn:    { label: 'Learn AI' },
  automate: { label: 'Automate my own work' },
  build:    { label: 'Build for clients' },
  sell:     { label: 'Sell AI services' },
};

const READINESS_QUESTIONS = [
  { id: 'time',  text: 'How much time can you give this each week?',            options: ['Under 1 hour', '1–3 hours', '4+ hours'] },
  { id: 'tools', text: 'How much do you already use AI or automation tools?',   options: ['Not yet', 'Occasionally', 'Daily'] },
  { id: 'team',  text: 'Who else would need to adopt this with you?',           options: ['A team I would have to convince', 'A few people who are open to it', 'Just me'] },
  { id: 'risk',  text: 'How comfortable are you letting an agent act for you?', options: ['I want to approve everything', 'Approve the important things', 'Let it run, I will review'] },
  { id: 'pain',  text: 'How clear is the one task that costs you the most time?', options: ['Not sure yet', 'I have a guess', 'I can name it exactly'] },
];

const STEP_NAMES = ['', 'profile', 'goal', 'readiness', 'recommend', 'agent', 'bridge', 'firstrun', 'next'];
const SUBMITTED_STEPS = [1, 2, 3, 5, 6, 7];

const ADOPTION_NOTE = 'Most AI pilots stall on habits, not technology. Pick one task, tell the people it affects, and review the first week together.';

function evaluateReadiness(answers) {
  if (!Array.isArray(answers) || answers.length !== READINESS_QUESTIONS.length) throw new Error('answers: exactly 5 required');
  for (const a of answers) if (!Number.isInteger(a) || a < 0 || a > 2) throw new Error('answers: each must be 0, 1 or 2');
  const score = answers.reduce((s, a) => s + a, 0);
  const band = score >= 8 ? 'ready' : score >= 5 ? 'pilot' : 'foundations';
  const bandNote = {
    ready: 'You can start building right away. Keep a human review step on anything that leaves your business.',
    pilot: 'Start with a small pilot on one task, then widen it once it saves you time.',
    foundations: 'Begin with learning and one low-risk task. A little practice first makes everything after it easier.',
  }[band];
  return { score, max: 10, band, note: bandNote + ' ' + ADOPTION_NOTE };
}

/* ── catalog: council agents the wizard can recommend ─────────────────── */
const AGENTS = [
  { agent: 'ORACLE',  title: 'Research and learning guide',   goals: ['learn', 'sell'],         blurb: 'Finds what matters and explains it plainly.' },
  { agent: 'QUILL',   title: 'Writing and communication',     goals: ['learn', 'automate', 'sell', 'build'], blurb: 'Drafts, rewrites and documents so your voice stays yours.' },
  { agent: 'NEXUS',   title: 'Workflow and systems builder',  goals: ['automate', 'build'],     blurb: 'Turns a repeated task into a working workflow.' },
  { agent: 'ZEROX',   title: 'Offers and numbers',            goals: ['sell', 'automate'],      blurb: 'Shapes offers, pricing conversations and the business case.' },
  { agent: 'TURTLE',  title: 'Design and presentation',       goals: ['build', 'sell'],         blurb: 'Makes decks, pages and client-facing material look right.' },
  { agent: 'PIKADON', title: 'Safety and review',             goals: ['build'],                 blurb: 'Checks what an agent may touch and what needs approval.' },
];

const GOAL_PROMPTS = {
  learn: [
    (v) => `Explain, in plain language, how AI can help a ${v.label.toLowerCase()} with ${v.work}. Give me three small things I can try this week.`,
    (v) => `Quiz me with five questions to find which part of ${v.work} I should hand to an AI first.`,
  ],
  automate: [
    (v) => `List the five most repetitive tasks in a ${v.label.toLowerCase()}'s week around ${v.work}, then draft an automation plan for the top two.`,
    (v) => `Write the step-by-step instructions an agent should follow for my most repeated task in ${v.work}, including when it must stop and ask me.`,
  ],
  build: [
    (v) => `Draft a one-page AI assessment I can run for a ${v.label.toLowerCase()} client: the questions to ask, what to look for, and a recommended first agent.`,
    (v) => `Design a safe first agent for ${v.plural}: what it can do, what it can never do, and which actions need human approval.`,
  ],
  sell: [
    (v) => `Write an offer for AI services aimed at ${v.plural}: the problem, the outcome, the deliverables and how we would work together.`,
    (v) => `Draft a short outreach message to a ${v.label.toLowerCase()} that opens a conversation about ${v.work} without any hype.`,
  ],
};

/** Ranked council agents + starter prompts for a vertical and goal. Always non-empty for valid input. */
function recommend(vertical, goal, readiness) {
  const v = VERTICALS[vertical];
  if (!v || !GOALS[goal]) throw new Error('unknown vertical or goal');
  const agents = AGENTS
    .map((a) => ({ a, fit: a.goals.indexOf(goal) !== -1 ? 2 : 0 }))
    .filter((x) => x.fit > 0)
    .sort((x, y) => y.fit - x.fit || x.a.agent.localeCompare(y.a.agent))
    .map((x) => ({ agent: x.a.agent, title: x.a.title, blurb: x.a.blurb }));
  // Newer to this? put the writing/learning guide first so the first win is easy.
  if (readiness && readiness.band === 'foundations') {
    agents.sort((x, y) => (['ORACLE', 'QUILL'].indexOf(y.agent) !== -1) - (['ORACLE', 'QUILL'].indexOf(x.agent) !== -1));
  }
  return {
    vertical, goal,
    agents,
    starterPrompts: GOAL_PROMPTS[goal].map((f) => f(v)),
  };
}

/* ── the seven user contributions (shared with the D3 agent builder) ───── */
const AGENT_FIELDS = [
  { key: 'vision',       label: 'Vision and goal',        required: true,  max: 600 },
  { key: 'trigger',      label: 'Trigger',                required: false, max: 300, enum: ['manual', 'schedule', 'event', 'message'] },
  { key: 'instructions', label: 'Instructions',           required: true,  max: 2000 },
  { key: 'preferences',  label: 'Personal preferences',   required: false, max: 600 },
  { key: 'knowledge',    label: 'Knowledge base',         required: false, max: 1000 },
  { key: 'context',      label: 'Context',                required: false, max: 1000 },
  { key: 'audit',        label: 'Audit the output',       required: true,  max: 600 },
];

function validateAgentFields(input) {
  const errors = {}, out = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const f of AGENT_FIELDS) {
    const raw = src[f.key];
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (!val) { if (f.required) errors[f.key] = 'required'; continue; }
    if (val.length > f.max) { errors[f.key] = 'max ' + f.max + ' characters'; continue; }
    if (f.enum && f.enum.indexOf(val) === -1) { errors[f.key] = 'one of ' + f.enum.join(', '); continue; }
    out[f.key] = val;
  }
  return { ok: Object.keys(errors).length === 0, errors, value: out };
}

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

/** Validate one submitted step. Returns { ok, errors, value } where value is the cleaned data to store. */
function validateStep(step, data, state) {
  const d = data && typeof data === 'object' ? data : {};
  const errors = {};
  switch (step) {
    case 1: {
      if (!VERTICALS[d.vertical]) errors.vertical = 'choose a vertical';
      const role = clip(d.role, 60);
      if (!role) errors.role = 'required';
      return { ok: !Object.keys(errors).length, errors, value: { role, vertical: d.vertical } };
    }
    case 2:
      if (!GOALS[d.goal]) return { ok: false, errors: { goal: 'choose a goal' } };
      return { ok: true, errors: {}, value: { goal: d.goal } };
    case 3:
      try { const r = evaluateReadiness(d.answers); return { ok: true, errors: {}, value: { answers: d.answers, ...r } }; }
      catch (e) { return { ok: false, errors: { answers: e.message } }; }
    case 5: return validateAgentFields(d);
    case 6: {
      // Only which of the user's own agents are reachable. Never a token or key.
      const ids = Array.isArray(d.linkedAgents) ? d.linkedAgents.slice(0, 20).map((x) => clip(x, 80)).filter(Boolean) : [];
      return { ok: true, errors: {}, value: { skipped: !!d.skipped || ids.length === 0, linkedAgents: ids } };
    }
    case 7: {
      const summary = clip(d.summary, 1500);
      if (!summary) return { ok: false, errors: { summary: 'required' } };
      return { ok: true, errors: {}, value: { taskId: clip(d.taskId, 80) || null, summary } };
    }
    default: return { ok: false, errors: { step: 'step ' + step + ' is not submitted by the client' } };
  }
}

function nextStepCard(state) {
  const goal = state.goal && state.goal.goal;
  if (goal === 'sell' || goal === 'build') return { id: 'consultant', title: 'Book a consultant', body: 'Talk through your first client engagement with a SHADDAI consultant.', cta: 'Ask for an assessment' };
  return { id: 'upgrade', title: 'Build your own agents', body: 'Pro and Max open the agent builder, workflows and your Agent Office.', cta: 'See plans' };
}

module.exports = {
  VERTICALS, GOALS, READINESS_QUESTIONS, AGENT_FIELDS, STEP_NAMES, SUBMITTED_STEPS, ADOPTION_NOTE,
  evaluateReadiness, recommend, validateAgentFields, validateStep, nextStepCard,
};
