/* ══════════════════════════════════════════════════════════════════
   tools-content.js — REAL content & marketing tools (LLM-backed).

   THE FACTORY: each tool is a compact declarative def
     { key, desc, schema, agents, sys, prompt(params) }
   and llmTool() turns it into a real TOOLS entry whose execute() calls
   the live model (callLLM → Groq/Ollama/OpenRouter chain) and returns
   the finished deliverable. No stubs — every call produces real output.

   Adding a tool = adding one def to DEFS. This is how the cluster scales
   toward the 100-tools-per-agent goal without hand-writing executors.

   Merged into agent-engine's TOOLS via Object.assign; `agents:[]` routes
   each tool to those agents in the dashboard swivel / rooms / Bazaar.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

let callLLM;
try { ({ callLLM } = require('./llm-client')); } catch (e) { callLLM = null; }

const DEFAULT_SYS =
  'You are a world-class operator on the SHADDAI AI team. Output ONLY the requested ' +
  'deliverable — no preamble, no meta-commentary, no "here is". Be concrete, specific, ' +
  'and ship-ready. Match the requested format exactly.';

// Turn a declarative def into a real, runnable tool.
function llmTool(def) {
  return {
    name: def.key,
    description: def.desc,
    schema: def.schema || {},
    agents: def.agents || ['QUILL'],
    category: 'Content & Marketing',
    async execute(params = {}) {
      if (!callLLM) return JSON.stringify({ error: 'LLM client unavailable' });
      try {
        const userPrompt = def.prompt(params || {});
        const r = await callLLM(
          [
            { role: 'system', content: def.sys || DEFAULT_SYS },
            { role: 'user', content: userPrompt },
          ],
          { maxTokens: def.maxTokens || 700, temperature: def.temp ?? 0.7, agentName: (def.agents && def.agents[0]) || 'QUILL' }
        );
        const out = (r && r.content ? String(r.content) : '').trim();
        return out || JSON.stringify({ error: 'empty model output' });
      } catch (e) {
        return JSON.stringify({ error: (e && e.message) || String(e) });
      }
    },
  };
}

// helper: coerce a topic-ish param with a friendly fallback
const T = (p, ...keys) => { for (const k of keys) if (p && p[k]) return String(p[k]); return ''; };

const DEFS = [
  { key: 'write_thread', agents: ['QUILL', 'ORACLE', 'SHADDAI'], maxTokens: 900,
    desc: 'Write a punchy X/Twitter thread (5–8 posts) on a topic. Real, ready to post.',
    schema: { topic: 'string — what the thread is about', angle: 'string (optional) — the take/hook' },
    prompt: (p) => `Write a viral X thread of 5–8 posts about: "${T(p,'topic','subject') || 'AI agents'}".${p.angle ? ' Angle: ' + p.angle + '.' : ''} Number each post (1/ 2/ …). Hook hard on post 1, one idea per post, end with a CTA. Under 280 chars each. No hashtags except maybe one on the last.` },

  { key: 'write_blog_post', agents: ['QUILL', 'ORACLE'], maxTokens: 1500,
    desc: 'Write a complete, structured blog post (title, intro, H2 sections, conclusion).',
    schema: { topic: 'string', keywords: 'string (optional) — SEO keywords to include' },
    prompt: (p) => `Write a complete blog post about: "${T(p,'topic','subject')}". Include an SEO title, a hook intro, 3–5 H2 sections with substance, and a short conclusion with a CTA.${p.keywords ? ' Naturally include these keywords: ' + p.keywords + '.' : ''} Use markdown headings.` },

  { key: 'blog_outline', agents: ['QUILL', 'ORACLE'], maxTokens: 500,
    desc: 'Generate a detailed blog post outline (title + H2/H3 bullet structure).',
    schema: { topic: 'string' },
    prompt: (p) => `Create a detailed blog outline for: "${T(p,'topic','subject')}". Give 1 title option, then H2 sections each with 2–3 H3/bullet sub-points.` },

  { key: 'seo_keywords', agents: ['ORACLE', 'QUILL', 'ZEROX'], maxTokens: 400,
    desc: 'Generate a prioritized SEO keyword list (primary, secondary, long-tail) for a topic.',
    schema: { topic: 'string' },
    prompt: (p) => `For the topic "${T(p,'topic','subject')}", list SEO keywords grouped as: PRIMARY (3), SECONDARY (5), LONG-TAIL (7). One per line, no explanation.` },

  { key: 'meta_description', agents: ['QUILL', 'ORACLE'], maxTokens: 200,
    desc: 'Write an SEO meta description (≤155 chars) for a page/topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Write 3 SEO meta descriptions (each ≤155 characters) for a page about: "${T(p,'topic','subject')}". Compelling, keyword-rich. One per line.` },

  { key: 'generate_hooks', agents: ['QUILL', 'TURTLE', 'ZEROX'], maxTokens: 400, temp: 0.9,
    desc: 'Generate 10 scroll-stopping hooks/opening lines for content on a topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Give 10 scroll-stopping opening hooks for short-form content about "${T(p,'topic','subject')}". Varied styles (question, bold claim, stat, story, contrarian). Numbered list, one line each.` },

  { key: 'ad_copy', agents: ['ZEROX', 'QUILL'], maxTokens: 500, temp: 0.85,
    desc: 'Write ad copy variants (headline + body + CTA) for a product/offer.',
    schema: { product: 'string — what you are advertising', audience: 'string (optional)' },
    prompt: (p) => `Write 3 ad variants for: "${T(p,'product','topic','subject')}".${p.audience ? ' Audience: ' + p.audience + '.' : ''} Each = HEADLINE (≤40 chars), BODY (≤90 chars), CTA (≤20 chars). Label them A/B/C.` },

  { key: 'cold_email', agents: ['ZEROX', 'QUILL'], maxTokens: 500,
    desc: 'Write a short, personalized cold outreach email (subject + body).',
    schema: { offer: 'string — what you are pitching', recipient: 'string (optional) — who/role' },
    prompt: (p) => `Write a cold email pitching: "${T(p,'offer','product','topic')}".${p.recipient ? ' Recipient: ' + p.recipient + '.' : ''} Give a SUBJECT line + a 4–6 sentence body. Personal, value-first, one clear ask. No fluff.` },

  { key: 'rewrite_tone', agents: ['QUILL', 'TURTLE'], maxTokens: 700,
    desc: 'Rewrite a piece of text in a specified tone (e.g. professional, casual, hype, luxury).',
    schema: { text: 'string — the text to rewrite', tone: 'string — target tone' },
    prompt: (p) => `Rewrite the following in a ${p.tone || 'clear, professional'} tone. Keep the meaning, improve the impact. Return only the rewrite.\n\nTEXT:\n${T(p,'text','content','input')}` },

  { key: 'summarize_text', agents: ['ORACLE', 'QUILL'], maxTokens: 400,
    desc: 'Summarize long text into key points (TL;DR + bullets).',
    schema: { text: 'string — text to summarize' },
    prompt: (p) => `Summarize the following. Give a 1-sentence TL;DR, then 3–5 bullet key points. Return only that.\n\nTEXT:\n${T(p,'text','content','input')}` },

  { key: 'product_description', agents: ['ZEROX', 'QUILL', 'TURTLE'], maxTokens: 400,
    desc: 'Write a compelling e-commerce product description (benefits-led).',
    schema: { product: 'string — product name/details' },
    prompt: (p) => `Write a compelling e-commerce product description for: "${T(p,'product','topic','subject')}". Lead with the benefit, 2 short paragraphs + a 3-bullet feature list. Persuasive, not salesy.` },

  { key: 'landing_headline', agents: ['ZEROX', 'TURTLE', 'QUILL'], maxTokens: 300, temp: 0.9,
    desc: 'Generate 8 landing-page hero headline + subhead pairs for an offer.',
    schema: { product: 'string' },
    prompt: (p) => `Write 8 landing-page hero options for: "${T(p,'product','topic','subject')}". Each = HEADLINE + one-line SUBHEAD. Varied angles (outcome, speed, status, fear-of-missing-out). Numbered.` },

  { key: 'cta_variants', agents: ['ZEROX', 'QUILL'], maxTokens: 200, temp: 0.9,
    desc: 'Generate 12 call-to-action button/line variants for an offer.',
    schema: { offer: 'string' },
    prompt: (p) => `Give 12 punchy CTA button texts for: "${T(p,'offer','product','topic')}". ≤5 words each. Mix of urgency, value, and curiosity. One per line.` },

  { key: 'hashtag_suggest', agents: ['QUILL', 'TURTLE'], maxTokens: 200,
    desc: 'Suggest relevant hashtags (mix of broad + niche) for a post topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Suggest 15 hashtags for a post about "${T(p,'topic','subject')}": 5 broad, 7 niche, 3 branded-style. Space-separated, include the #.` },

  { key: 'content_calendar', agents: ['ORACLE', 'QUILL'], maxTokens: 700,
    desc: 'Build a 7-day content calendar (platform + hook + format) for a theme.',
    schema: { theme: 'string — the content theme/brand' },
    prompt: (p) => `Build a 7-day content calendar for: "${T(p,'theme','topic','subject')}". For each day: Day | Platform | Format | Hook idea. Keep it tight, one row per day.` },

  { key: 'tweet_variations', agents: ['QUILL', 'TURTLE'], maxTokens: 400, temp: 0.9,
    desc: 'Rewrite a tweet into 6 distinct high-engagement variations.',
    schema: { text: 'string — the base tweet' },
    prompt: (p) => `Rewrite this tweet into 6 distinct high-engagement versions (≤280 chars each), varied hooks. Numbered.\n\nTWEET:\n${T(p,'text','content','input')}` },

  { key: 'youtube_title', agents: ['QUILL', 'TURTLE'], maxTokens: 300, temp: 0.9,
    desc: 'Generate 10 high-CTR YouTube titles for a video topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Write 10 high-CTR YouTube titles for a video about "${T(p,'topic','subject')}". ≤60 chars, curiosity + clarity, no clickbait lies. Numbered.` },

  { key: 'video_script', agents: ['QUILL', 'TURTLE'], maxTokens: 800,
    desc: 'Write a short-form video script (hook, beats, CTA) for a topic.',
    schema: { topic: 'string', seconds: 'number (optional) — target length, default 30' },
    prompt: (p) => `Write a ${p.seconds || 30}-second short-form video script about "${T(p,'topic','subject')}". Format: [HOOK 0-3s], [BEAT], [BEAT], [BEAT], [CTA]. Spoken lines + quick visual notes.` },

  { key: 'press_release', agents: ['QUILL', 'ORACLE'], maxTokens: 700,
    desc: 'Draft a professional press release for an announcement.',
    schema: { announcement: 'string — what is being announced' },
    prompt: (p) => `Draft a professional press release announcing: "${T(p,'announcement','topic','subject')}". Include headline, dateline, 3 body paragraphs, a quote, and a boilerplate line.` },

  { key: 'faq_generate', agents: ['QUILL', 'ORACLE'], maxTokens: 600,
    desc: 'Generate a FAQ (8 Q&A pairs) for a product/topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Write a FAQ of 8 question/answer pairs for: "${T(p,'topic','subject','product')}". Real questions a buyer asks. Q: … / A: … format.` },

  { key: 'email_subject_lines', agents: ['ZEROX', 'QUILL'], maxTokens: 250, temp: 0.9,
    desc: 'Generate 12 high-open-rate email subject lines for a campaign.',
    schema: { topic: 'string' },
    prompt: (p) => `Write 12 high-open-rate email subject lines for a campaign about "${T(p,'topic','subject','offer')}". ≤50 chars, varied (curiosity, urgency, benefit, personal). Numbered.` },

  { key: 'slogan_generate', agents: ['TURTLE', 'QUILL', 'ZEROX'], maxTokens: 250, temp: 1.0,
    desc: 'Generate 10 brand slogans/taglines for a product or brand.',
    schema: { brand: 'string — brand/product name + vibe' },
    prompt: (p) => `Create 10 memorable slogans/taglines for: "${T(p,'brand','product','topic','subject')}". ≤6 words each. Punchy, ownable. Numbered.` },

  { key: 'elevator_pitch', agents: ['ZEROX', 'SHADDAI', 'QUILL'], maxTokens: 300,
    desc: 'Write a tight 30-second elevator pitch for a product/idea.',
    schema: { idea: 'string — the product/idea' },
    prompt: (p) => `Write a 30-second elevator pitch for: "${T(p,'idea','product','topic','subject')}". 4–5 sentences: problem, solution, why-now, the ask. Confident, jargon-free.` },

  { key: 'brand_name_ideas', agents: ['TURTLE', 'ZEROX', 'ORACLE'], maxTokens: 300, temp: 1.0,
    desc: 'Brainstorm 15 brand/product name ideas with a one-line rationale each.',
    schema: { concept: 'string — what the brand is about' },
    prompt: (p) => `Brainstorm 15 brand names for: "${T(p,'concept','product','topic','subject')}". Mix invented, compound, and real-word names. Format: Name — why it works. Numbered.` },

  { key: 'linkedin_post', agents: ['QUILL', 'ZEROX'], maxTokens: 600,
    desc: 'Write a professional LinkedIn post (hook, story/insight, takeaway) on a topic.',
    schema: { topic: 'string' },
    prompt: (p) => `Write a LinkedIn post about "${T(p,'topic','subject')}". Strong 1-line hook, short punchy paragraphs, a concrete insight or story, a takeaway, and a soft engagement question. No hashtag spam (max 3 at end).` },

  { key: 'reddit_post', agents: ['QUILL', 'ORACLE'], maxTokens: 600,
    desc: 'Write an authentic, non-salesy Reddit post (title + body) for a subreddit-style audience.',
    schema: { topic: 'string', subreddit: 'string (optional)' },
    prompt: (p) => `Write an authentic Reddit post about "${T(p,'topic','subject')}"${p.subreddit ? ' for r/' + p.subreddit : ''}. Give a TITLE + BODY. Genuine, value-first, conversational — NOT an ad. It should spark discussion.` },

  { key: 'newsletter_intro', agents: ['QUILL', 'ORACLE'], maxTokens: 400,
    desc: 'Write an engaging newsletter intro paragraph for an issue theme.',
    schema: { theme: 'string — this issue’s theme' },
    prompt: (p) => `Write an engaging 1-paragraph newsletter intro for an issue about "${T(p,'theme','topic','subject')}". Warm, curious, sets up the value. 3–4 sentences.` },

  { key: 'value_prop', agents: ['ZEROX', 'SHADDAI', 'QUILL'], maxTokens: 300,
    desc: 'Write a sharp value proposition + 3 supporting benefit bullets for an offer.',
    schema: { offer: 'string' },
    prompt: (p) => `Write a sharp value proposition for: "${T(p,'offer','product','topic','subject')}". One bold VP sentence, then 3 benefit bullets. No buzzwords.` },

  { key: 'name_the_tone', agents: ['QUILL', 'TURTLE'], maxTokens: 400,
    desc: 'Analyze a text and describe its tone/voice, then suggest how to strengthen it.',
    schema: { text: 'string' },
    prompt: (p) => `Analyze the tone/voice of this text in 3 bullets, then give 3 concrete edits to strengthen its voice.\n\nTEXT:\n${T(p,'text','content','input')}` },
];

const TOOLS_CONTENT = {};
for (const def of DEFS) TOOLS_CONTENT[def.key] = llmTool(def);

module.exports = { TOOLS_CONTENT, _count: DEFS.length };
