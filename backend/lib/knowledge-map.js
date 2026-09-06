'use strict';
/* ══════════════════════════════════════════════════════════════════════
   KNOWLEDGE-MAP — what each agent actually knows, and why it is theirs.

   The brain stores sources per agent, but nothing declared WHICH SUBJECTS
   belong to WHICH agent. So routing a job, or an agent deciding whether a
   question is its own, was guesswork.

   This declares it. DOMAINS below is the canonical topic→agent map: the
   subjects each agent owns, drawn from its own spec
   (backend/data/agents/<AGENT>.md). Every digest carries topics from the
   same controlled vocabulary as digest-llm.js, so ownership is a set
   intersection rather than an opinion.

   Three things fall out of it, all of which the product needed:
     · an organized index — sources grouped by subject, per agent
     · routing — given a request, which agent owns the subject
     · misfiling — sources sitting in an agent whose domain does not cover
       them, which is how the corpus quietly drifts

   Pure data + set logic. No LLM, no network, no cost.
   ══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const RAG = path.join(__dirname, '..', 'data', 'rag');
const AGENTS_DIR = path.join(__dirname, '..', 'data', 'agents');

/* Canonical ownership. `primary` is what the agent is FOR — a request in one
   of these subjects routes here. `secondary` is what it can competently
   support but should not be first choice for.

   Topics deliberately overlap across agents (business, mindset, blockchain):
   a source about pricing psychology genuinely belongs to both ZEROX and
   ORACLE. Overlap is resolved by primary-beats-secondary, then by how much
   material the agent actually holds. */
const DOMAINS = {
  SHADDAI: {
    theme: 'Supreme Orchestrator',
    owns: 'Strategy, prioritisation, and the final call. Takes a goal and decides who does what.',
    primary: ['strategy', 'leadership', 'discipline', 'productivity'],
    secondary: ['business', 'mindset', 'people', 'learning'],
  },
  ZEROX: {
    theme: 'Revenue Engine',
    owns: 'Anything where money moves — pricing, markets, offers, unit economics.',
    primary: ['trading', 'markets', 'investing', 'money', 'sales', 'offers', 'crypto'],
    secondary: ['business', 'marketing', 'strategy', 'blockchain'],
  },
  ORACLE: {
    theme: 'Intelligence Analyst',
    owns: 'Understanding people and patterns — research, psychology, meaning.',
    primary: ['psychology', 'consciousness', 'spirituality', 'people', 'learning'],
    secondary: ['mindset', 'health', 'storytelling', 'strategy'],
  },
  NEXUS: {
    theme: 'Technical Architect',
    owns: 'Systems that have to hold — backends, APIs, data, and how agents run.',
    primary: ['engineering', 'backend', 'ai', 'agents'],
    secondary: ['blockchain', 'security', 'productivity'],
  },
  TURTLE: {
    theme: 'UI/UX Designer',
    owns: 'How a thing looks and feels — interface, motion, image, sound.',
    primary: ['design', 'art', 'music'],
    secondary: ['storytelling', 'marketing', 'psychology'],
  },
  QUILL: {
    theme: 'Writer & Communicator',
    owns: 'Every word a person reads — copy, docs, threads, narrative.',
    primary: ['writing', 'storytelling', 'marketing', 'negotiation'],
    secondary: ['sales', 'offers', 'people', 'learning'],
  },
  PIKADON: {
    theme: 'Security Guard',
    owns: 'What could go wrong — vulnerabilities, claims that need checking, worst cases.',
    primary: ['security'],
    secondary: ['blockchain', 'crypto', 'engineering', 'agents'],
  },
};

const AGENTS = Object.keys(DOMAINS);

/* -- triggers -------------------------------------------------------------
   Matching a request against the topic words alone does not work: people
   write "trade the best coin on pumpfun", not "trading". These are the words
   and phrases that actually signal a subject in a real request. */
const TRIGGERS = {
  trading:      ['trade', 'trading', 'pumpfun', 'pump.fun', 'dexscreener', 'leverage', 'lev trade',
                 'entry', 'ticker', 'candle', 'swing', 'scalp'],
  markets:      ['market', 'chart', 'price action', 'liquidity', 'volume', 'sentiment'],
  investing:    ['invest', 'portfolio', 'index fund', 'buy and hold', 'valuation', 'dividend'],
  money:        ['money', 'revenue', 'profit', 'margin', 'cash', 'income', 'payout'],
  crypto:       ['coin', 'token', 'memecoin', 'solana', 'airdrop', 'mint'],
  blockchain:   ['blockchain', 'onchain', 'on chain', 'smart contract', 'contract address'],
  sales:        ['sell', 'sales', 'pitch', 'objection', 'funnel'],
  offers:       ['offer', 'pricing', 'price', 'package', 'bundle', 'upsell', 'how much', 'cost'],
  marketing:    ['marketing', 'campaign', 'audience', 'growth', 'viral'],
  design:       ['design', '3d model', '3d asset', 'cover', 'logo', 'mockup',
                 'thumbnail', 'banner', 'layout', 'icon', 'render', 'texture'],
  art:          ['art', 'image', 'picture', 'illustration', 'draw', 'visual', 'artwork'],
  music:        ['music', 'song', 'track', 'beat', 'voiceover', 'voice over', 'audio', 'narration'],
  writing:      ['write', 'copy', 'thread', 'blog', 'post', 'article', 'caption', 'script',
                 'documentation', 'newsletter', 'email'],
  storytelling: ['story', 'narrative', 'hook'],
  negotiation:  ['negotiate', 'deal terms', 'counteroffer'],
security:     ['safe', 'scam', 'rug', 'rugpull', 'audit', 'vulnerab', 'exploit', 'phishing',
               'background check', 'verify', 'legit', 'secure', 'security', 'risk', 'hack', 'threat'],
  engineering:  ['build', 'code', 'refactor', 'deploy', 'architecture', 'system design'],
  backend:      ['backend', 'api', 'database', 'server', 'endpoint', 'schema'],
  ai:           ['llm', 'prompt', 'embedding', 'inference'],
  agents:       ['agent', 'workflow', 'automation', 'n8n', 'orchestrat'],
  psychology:   ['psychology', 'behaviour', 'behavior', 'bias', 'motivation'],
  consciousness:['consciousness', 'awareness', 'meditat', 'manifest'],
  spirituality: ['spiritual', 'soul', 'divine', 'sacred', 'astrolog', 'tarot'],
  people:       ['people', 'relationship', 'hire', 'team', 'partner', 'network'],
  leadership:   ['delegate', 'manage', 'decision'],
  strategy:     ['strategy', 'plan', 'roadmap', 'prioriti'],
  discipline:   ['discipline', 'habit', 'consistency', 'routine'],
  mindset:      ['mindset', 'belief', 'confidence', 'fear'],
  health:       ['health', 'fitness', 'sleep', 'diet', 'workout'],
  learning:     ['learn', 'teach', 'explain', 'understand', 'study'],
  productivity: ['productiv', 'focus', 'time management'],
  business:     ['business', 'startup', 'company', 'customer', 'client'],
};

/* topic -> [agent, weight], so a matched topic credits whoever owns it */
const TOPIC_OWNERS = (() => {
  const m = new Map();
  for (const [A, d] of Object.entries(DOMAINS)) {
    d.primary.forEach((t) => { if (!m.has(t)) m.set(t, []); m.get(t).push([A, 3]); });
    d.secondary.forEach((t) => { if (!m.has(t)) m.set(t, []); m.get(t).push([A, 1]); });
  }
  return m;
})();

const kbDir = (a) => path.join(RAG, 'kb_' + String(a).toLowerCase());

function readDigests(agent) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(kbDir(agent), 'digests.json'), 'utf8'));
    return Array.isArray(s.digests) ? s.digests : [];
  } catch { return []; }
}

/**
 * The organized index for one agent: its subjects, the sources under each,
 * and anything sitting here that its domain does not cover.
 */
function forAgent(agent) {
  const A = String(agent || '').toUpperCase();
  const dom = DOMAINS[A];
  if (!dom) return null;
  const digests = readDigests(A);
  const own = new Set([...dom.primary, ...dom.secondary]);

  const bySubject = new Map();
  const misfiled = [];
  let organized = 0;

  for (const d of digests) {
    const topics = Array.isArray(d.topics) ? d.topics : [];
    if (topics.length) organized++;
    const entry = {
      name: d.name,
      title: d.title || d.name,
      thesis: d.thesis || '',
      topics,
      url: d.url || null,
      chapters: (d.chapters || []).length,
      quotes: (d.quotes || []).length,
    };
    const mine = topics.filter((t) => own.has(t));
    if (topics.length && !mine.length) misfiled.push(entry);
    for (const t of (mine.length ? mine : topics)) {
      if (!bySubject.has(t)) bySubject.set(t, []);
      bySubject.get(t).push(entry);
    }
  }

  const subjects = [...bySubject.entries()]
    .map(([topic, sources]) => ({
      topic,
      rank: dom.primary.includes(topic) ? 'primary' : own.has(topic) ? 'secondary' : 'adjacent',
      count: sources.length,
      sources,
    }))
    .sort((a, b) => (a.rank === b.rank ? b.count - a.count
      : a.rank === 'primary' ? -1 : b.rank === 'primary' ? 1
      : a.rank === 'secondary' ? -1 : 1));

  return {
    agent: A,
    theme: dom.theme,
    owns: dom.owns,
    primary: dom.primary,
    secondary: dom.secondary,
    sources: digests.length,
    organized,                       // how many carry synthesized topics yet
    subjects,
    misfiled,
  };
}

/** Every agent, plus a corpus-wide subject roll-up. */
function all() {
  const agents = AGENTS.map(forAgent).filter(Boolean);
  const roll = new Map();
  agents.forEach((a) => a.subjects.forEach((s) => {
    if (!roll.has(s.topic)) roll.set(s.topic, { topic: s.topic, total: 0, agents: [] });
    const r = roll.get(s.topic);
    r.total += s.count;
    r.agents.push({ agent: a.agent, rank: s.rank, count: s.count });
  }));
  const subjects = [...roll.values()].sort((a, b) => b.total - a.total);
  subjects.forEach((s) => s.agents.sort((x, y) => (
    x.rank === y.rank ? y.count - x.count : x.rank === 'primary' ? -1 : 1
  )));
  return {
    generatedAt: new Date().toISOString(),
    agents,
    subjects,
    totals: {
      sources: agents.reduce((n, a) => n + a.sources, 0),
      organized: agents.reduce((n, a) => n + a.organized, 0),
    },
  };
}

/**
 * Which agent owns a request? Returns a ranked list, best first.
 * Matches request text against the topic vocabulary, then against each
 * agent's declared domain. Falls back to SHADDAI, whose job is deciding
 * who does what when nothing else claims it.
 */
function route(text, { limit = 3 } = {}) {
  const q = ' ' + String(text || '').toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const scores = new Map(AGENTS.map((a) => [a, 0]));
  const matched = new Set();

  // an explicit /agent or a named agent is an instruction, not a hint
  let explicit = null;
  for (const A of AGENTS) {
    if (q.includes(' ' + A.toLowerCase() + ' ')) { explicit = A; break; }
  }

  for (const [topic, words] of Object.entries(TRIGGERS)) {
    // Word-boundary match so "smart" / "price action" cleanly match while a
    // substring inside another word cannot (e.g. "art" inside "smart" must NOT
    // route to TURTLE). A trigger clears if ANY of its words matches bounded.
    let hit = false;
    for (const w of words) {
      if (w.includes(' ')) { if (q.includes(' ' + w + ' ')) { hit = true; break; } }
      else if (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(q)) { hit = true; break; }
    }
    if (!hit) continue;
    matched.add(topic);
    for (const [A, weight] of (TOPIC_OWNERS.get(topic) || [])) {
      scores.set(A, scores.get(A) + weight);
    }
  }

  // holding more material on a matched subject means better placed to answer
  if (matched.size) {
    for (const A of AGENTS) {
      const idx = forAgent(A);
      if (!idx) continue;
      const depth = idx.subjects
        .filter((x) => matched.has(x.topic))
        .reduce((n, x) => n + x.count, 0);
      if (depth) scores.set(A, scores.get(A) + Math.min(2, depth * 0.25));
    }
  }

  if (explicit) scores.set(explicit, scores.get(explicit) + 10);

  let ranked = [...scores.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([agent, score]) => ({
      agent, score: Math.round(score * 100) / 100, theme: DOMAINS[agent].theme,
    }));

  // deciding who does what IS SHADDAI's job when nothing else claims it
  if (!ranked.length) {
    ranked = [{ agent: 'SHADDAI', score: 0, theme: DOMAINS.SHADDAI.theme, fallback: true }];
  }
  return { matchedTopics: [...matched], explicit, ranked };
}

module.exports = { DOMAINS, TRIGGERS, AGENTS, forAgent, all, route };
