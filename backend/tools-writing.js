/* ══════════════════════════════════════════════════════════════════
   tools-writing.js — REAL writing/marketing tools at scale (LLM-backed).

   Programmatic FAMILIES generate many distinct, real tools from compact
   code: write_for_<platform>, translate_to_<lang>, rewrite_<tone>,
   explain_<style>, <type>_ideas, summarize_<format> — each a genuine
   executor that calls the model. Plus standalone writing tools.

   Every tool works (produces real output via callLLM). Merged into
   agent-engine TOOLS; `agents:[]` routes to the dashboard.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

let callLLM;
try { ({ callLLM } = require('./llm-client')); } catch (e) { callLLM = null; }

const SYS = 'You are a world-class writer/marketer on the SHADDAI team. Output ONLY the requested deliverable — no preamble, no "here is", no meta. Concrete, on-brand, ship-ready. Match the requested format exactly.';
const T = (p, ...keys) => { for (const k of keys) if (p && p[k] != null && String(p[k]).trim()) return String(p[k]); return ''; };

function llmTool(def) {
  return {
    name: def.key, description: def.desc, schema: def.schema || {}, agents: def.agents || ['QUILL'], category: def.category || 'Writing & Marketing',
    async execute(p = {}) {
      if (!callLLM) return JSON.stringify({ error: 'LLM client unavailable' });
      try {
        const r = await callLLM([{ role: 'system', content: SYS }, { role: 'user', content: def.prompt(p || {}) }], { maxTokens: def.maxTokens || 700, temperature: def.temp ?? 0.75, agentName: (def.agents && def.agents[0]) || 'QUILL' });
        const out = (r && r.content ? String(r.content) : '').trim();
        return out || JSON.stringify({ error: 'empty model output' });
      } catch (e) { return JSON.stringify({ error: (e && e.message) || String(e) }); }
    },
  };
}

const TOOLS = {};
const add = (def) => { TOOLS[def.key] = llmTool(def); };

// ── FAMILY: write_for_<platform> ───────────────────────────────────
const PLATFORMS = {
  twitter: 'X/Twitter (≤280 chars, punchy, 1 idea)', linkedin: 'LinkedIn (professional, story + insight, short paragraphs)',
  instagram: 'Instagram caption (visual, emotive, emojis ok, hashtags at end)', tiktok: 'TikTok video caption + on-screen hook',
  youtube: 'YouTube description (SEO intro + timestamps placeholder + CTA)', reddit: 'Reddit post (authentic, non-salesy, discussion-sparking)',
  facebook: 'Facebook post (warm, community tone)', threads: 'Threads post (casual, conversational)',
  medium: 'Medium intro (essayistic hook + promise)', substack: 'Substack newsletter blurb (personal, curious)',
  pinterest: 'Pinterest pin description (keyword-rich, aspirational)', producthunt: 'Product Hunt tagline + first comment',
  hackernews: 'Hacker News Show HN post (technical, humble, no hype)', discord: 'Discord announcement (hype, community, emojis)',
  telegram: 'Telegram broadcast (concise, bold, CTA)',
};
Object.keys(PLATFORMS).forEach((k) => add({
  key: 'write_for_' + k, agents: ['QUILL', 'TURTLE', 'ZEROX', 'ORACLE'], maxTokens: 500, category: 'Social & Content',
  desc: 'Write a post optimized for ' + k + '.',
  schema: { topic: 'string — what to post about', angle: 'string (optional) — the take' },
  prompt: (p) => `Write a post for ${PLATFORMS[k]} about: "${T(p, 'topic', 'subject') || 'AI agents'}".${p.angle ? ' Angle: ' + p.angle + '.' : ''} Native to the platform, ready to publish.`,
}));

// ── FAMILY: translate_to_<lang> ────────────────────────────────────
const LANGS = ['spanish', 'french', 'german', 'italian', 'portuguese', 'dutch', 'russian', 'japanese', 'korean', 'chinese', 'arabic', 'hindi', 'turkish', 'polish', 'swedish', 'indonesian', 'vietnamese', 'thai'];
LANGS.forEach((lang) => add({
  key: 'translate_to_' + lang, agents: ['QUILL', 'ORACLE', 'SHADDAI'], maxTokens: 700, temp: 0.3, category: 'Language',
  desc: 'Translate text into ' + lang + ' (natural, not literal).',
  schema: { text: 'string — text to translate' },
  prompt: (p) => `Translate the following into natural, fluent ${lang}. Return ONLY the translation.\n\n${T(p, 'text', 'content', 'input')}`,
}));

// ── FAMILY: rewrite_<tone> ─────────────────────────────────────────
const TONES = ['professional', 'casual', 'funny', 'luxury', 'hype', 'empathetic', 'bold', 'minimal', 'poetic', 'persuasive', 'technical', 'friendly'];
TONES.forEach((tone) => add({
  key: 'rewrite_' + tone, agents: ['QUILL', 'TURTLE', 'ZEROX'], maxTokens: 600, category: 'Writing & Marketing',
  desc: 'Rewrite text in a ' + tone + ' tone.',
  schema: { text: 'string — text to rewrite' },
  prompt: (p) => `Rewrite the following in a ${tone} tone. Keep the meaning, boost the impact. Return only the rewrite.\n\n${T(p, 'text', 'content', 'input')}`,
}));

// ── FAMILY: explain_<style> ────────────────────────────────────────
const STYLES = { eli5: 'like I\'m 5 years old', teenager: 'to a teenager', expert: 'to a domain expert (precise, technical)', ceo: 'to a busy CEO (bottom line first)', engineer: 'to a software engineer', grandma: 'to a non-technical grandparent', skeptic: 'to a skeptic who needs proof' };
Object.keys(STYLES).forEach((k) => add({
  key: 'explain_' + k, agents: ['ORACLE', 'QUILL', 'SHADDAI', 'NEXUS'], maxTokens: 500, category: 'Knowledge',
  desc: 'Explain a concept ' + STYLES[k] + '.',
  schema: { topic: 'string — concept to explain' },
  prompt: (p) => `Explain "${T(p, 'topic', 'subject', 'concept')}" ${STYLES[k]}. Clear and concrete.`,
}));

// ── FAMILY: <type>_ideas ───────────────────────────────────────────
const IDEA_TYPES = ['blog', 'video', 'product', 'startup', 'campaign', 'tweet', 'newsletter', 'podcast', 'course', 'side_hustle'];
IDEA_TYPES.forEach((ty) => add({
  key: ty + '_ideas', agents: ['ORACLE', 'ZEROX', 'TURTLE', 'SHADDAI'], maxTokens: 500, temp: 0.95, category: 'Ideation',
  desc: 'Brainstorm 12 ' + ty.replace('_', ' ') + ' ideas for a niche/topic.',
  schema: { niche: 'string — the niche/topic' },
  prompt: (p) => `Brainstorm 12 ${ty.replace('_', ' ')} ideas for: "${T(p, 'niche', 'topic', 'subject')}". Each a punchy one-liner. Numbered.`,
}));

// ── FAMILY: summarize_<format> ─────────────────────────────────────
const SUMFMT = { tldr: 'a 1-sentence TL;DR', bullets: '5 bullet key points', executive: 'a 3-sentence executive summary', tweet: 'a single tweet (≤280 chars)', eli5: 'a simple explanation a child would get' };
Object.keys(SUMFMT).forEach((k) => add({
  key: 'summarize_' + k, agents: ['ORACLE', 'QUILL', 'SHADDAI'], maxTokens: 400, temp: 0.4, category: 'Knowledge',
  desc: 'Summarize text as ' + SUMFMT[k] + '.',
  schema: { text: 'string — text to summarize' },
  prompt: (p) => `Summarize the following as ${SUMFMT[k]}. Return only that.\n\n${T(p, 'text', 'content', 'input')}`,
}));

// ── STANDALONE writing/marketing tools ─────────────────────────────
const STANDALONE = [
  ['sales_page', 'ZEROX', 'Write a high-converting sales page (headline, problem, solution, proof, offer, CTA).', 'offer', 1200],
  ['case_study', 'QUILL', 'Write a customer case study (challenge, solution, results with metrics).', 'topic', 800],
  ['webinar_outline', 'QUILL', 'Outline a webinar (hook, agenda, key points, pitch, Q&A).', 'topic', 600],
  ['job_description', 'QUILL', 'Write a compelling job description (role, responsibilities, requirements, perks).', 'role', 600],
  ['bio_writer', 'QUILL', 'Write a professional bio in 3 lengths (1-liner, short, full).', 'about', 500],
  ['about_page', 'QUILL', 'Write an About page (mission, story, values, CTA).', 'brand', 700],
  ['review_response', 'ZEROX', 'Write a professional response to a customer review.', 'review', 400],
  ['apology_email', 'QUILL', 'Write a sincere, brand-safe apology email for an incident.', 'incident', 500],
  ['survey_questions', 'ORACLE', 'Generate 10 unbiased survey questions for a goal.', 'goal', 400],
  ['interview_questions', 'ORACLE', 'Generate 10 strong interview questions for a role.', 'role', 400],
  ['tagline_generator', 'TURTLE', 'Generate 12 taglines for a brand/product.', 'brand', 300],
  ['story_hook', 'TURTLE', 'Write 8 story-driven opening hooks for content.', 'topic', 400],
  ['analogy_maker', 'QUILL', 'Create 6 vivid analogies to explain a concept.', 'concept', 400],
  ['objection_handler', 'ZEROX', 'List 8 common sales objections + a strong rebuttal for each.', 'product', 600],
  ['feature_to_benefit', 'ZEROX', 'Turn a list of features into customer benefits.', 'features', 500],
  ['pitch_deck_outline', 'ZEROX', 'Outline a 10-slide startup pitch deck.', 'startup', 600],
  ['brand_voice', 'TURTLE', 'Define a brand voice (adjectives, do/don\'t, sample lines).', 'brand', 500],
  ['content_repurpose', 'QUILL', 'Repurpose one piece of content into 6 formats/platforms.', 'text', 600],
  ['seo_title_meta', 'ORACLE', 'Write an SEO title + meta description for a page.', 'topic', 300],
  ['keyword_cluster', 'ORACLE', 'Group keywords into topical clusters for a niche.', 'niche', 500],
  ['email_sequence', 'ZEROX', 'Write a 5-email nurture sequence outline for an offer.', 'offer', 800],
  ['push_notification', 'QUILL', 'Write 8 push-notification copy variants for an app event.', 'event', 300],
  ['sms_campaign', 'ZEROX', 'Write 6 SMS marketing messages (≤160 chars) for an offer.', 'offer', 300],
  ['whitepaper_outline', 'ORACLE', 'Outline a whitepaper (abstract, sections, key claims).', 'topic', 600],
  ['comparison_post', 'ORACLE', 'Write a fair "X vs Y" comparison with a verdict.', 'topic', 700],
  ['listicle', 'QUILL', 'Write a listicle ("N ways to…") with punchy items.', 'topic', 800],
  ['how_to_guide', 'QUILL', 'Write a clear step-by-step how-to guide.', 'topic', 800],
  ['glossary', 'ORACLE', 'Create a glossary of 10 key terms for a topic.', 'topic', 500],
  ['motivational_quote', 'TURTLE', 'Write 8 original motivational lines on a theme.', 'theme', 300],
  ['naming_convention', 'NEXUS', 'Propose a consistent naming convention for a system.', 'context', 400],
];
STANDALONE.forEach(([key, agent, desc, field, mt]) => add({
  key, agents: [agent, 'QUILL', 'SHADDAI'].filter((v, i, a) => a.indexOf(v) === i), maxTokens: mt || 600, category: 'Writing & Marketing',
  desc, schema: { [field]: 'string — ' + field },
  prompt: (p) => `${desc}\n\nInput (${field}): ${T(p, field, 'topic', 'text', 'input', 'subject') || '(none given — use a sensible example)'}`,
}));

module.exports = { TOOLS_WRITING: TOOLS, _count: Object.keys(TOOLS).length };
