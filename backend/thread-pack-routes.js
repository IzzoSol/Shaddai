// backend/thread-pack-routes.js — "Twitter Thread Pack" — second hire-the-Council
// micro-offer. Mounted at /api/thread-pack. Same pattern as coin-launch: TEXT-only,
// near-free, template fallback so it always returns. QUILL is the agent on the job.
//
// Workflow: thread_pack → [write_thread, hook_variants, thread_cta]
//   POST /api/thread-pack/preview  → FREE subset (5-tweet thread, 3 hook variants) + receipt
//   POST /api/thread-pack/checkout → hosted-link handoff else email-capture placeholder
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

let callLLM = null;
try { ({ callLLM } = require('./llm-client')); } catch (_) {}
let xAlgoPromptBlock = () => '';
try { ({ xAlgoPromptBlock } = require('./lib/x-algo-playbook')); } catch (_) {}

const TONES = {
  bold:      'bold, punchy, confident',
  friendly:  'warm, friendly, encouraging',
  contrarian:'contrarian, spicy, pattern-breaking',
  expert:    'calm expert, credible, no hype',
  degen:     'crypto-native, meme-aware, fast',
};
function toneOf(k) { return TONES[k] || TONES.bold; }
function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }

function extractArray(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const m = body.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a.map(x => String(x)).filter(Boolean) : null; }
  catch { return null; }
}
async function askList(prompt, want, fallbackFn, ctx) {
  if (callLLM) {
    try {
      const r = await Promise.race([
        callLLM([
          { role: 'system', content: 'You are QUILL, a viral-thread copywriter. Reply ONLY with a JSON array of strings. No preamble, no markdown fences.' },
          { role: 'user', content: prompt },
        ], { agentName: 'QUILL', maxTokens: 700 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('llm-timeout')), 9000)),
      ]);
      const arr = extractArray(r && r.content);
      if (arr && arr.length) return { items: arr.slice(0, want), source: (r.provider || 'llm') };
    } catch (_) {}
  }
  return { items: fallbackFn(ctx).slice(0, want), source: 'template' };
}

// ─── Tool 1: write_thread ────────────────────────────────────────────────────
function threadTemplates(c) {
  const t = c.topic;
  return [
    `1/ Everyone gets ${t} wrong. Here's what actually works (after way too much trial and error) 🧵`,
    `2/ First, the mistake almost everyone makes: they start with tactics before they understand the goal. Flip that.`,
    `3/ The real unlock with ${t} is simple: pick ONE outcome, then remove everything that doesn't serve it.`,
    `4/ A quick example — most people overcomplicate this. The people who win keep it embarrassingly simple and just ship.`,
    `5/ Do this today: write down your one goal for ${t}, then delete your next 3 "good ideas" that don't move it.`,
    `6/ The compounding part nobody tells you: consistency beats intensity. Show up small, daily, for 30 days.`,
    `7/ If you're stuck, it's usually not a knowledge problem — it's a focus problem. Narrow it down.`,
    `8/ Recap:\n• one goal\n• cut the noise\n• ship small daily\n• let it compound\nThat's the whole game with ${t}.`,
    `9/ That's the thread. If it helped, a repost of tweet 1 helps someone else find it 🙏`,
    `10/ I write about ${c.audience || 'building in public'} — follow for more like this.`,
    `11/ Bonus: the single question to ask before every ${t} decision — "does this move my one goal?" If no, cut it.`,
    `12/ Save this thread. Come back to it the next time you feel busy but not productive.`,
  ];
}
async function write_thread(c, want) {
  const prompt = `Write a ${want}-tweet Twitter/X thread.
Topic: ${c.topic}
Angle: ${c.angle || 'the non-obvious truth about it'}
Audience: ${c.audience || 'builders and creators'}
Tone: ${c.toneName}.
Rules: tweet 1 = a scroll-stopping hook. Number each tweet "n/". Each under 270 chars. No hashtag spam. End with a soft CTA. Return a JSON array of ${want} strings.

${xAlgoPromptBlock()}`;
  return askList(prompt, want, threadTemplates, c);
}

// ─── Tool 2: hook_variants ───────────────────────────────────────────────────
function hookTemplates(c) {
  const t = c.topic;
  return [
    `Everyone gets ${t} wrong. Here's what actually works 🧵`,
    `I wasted 2 years on ${t} so you don't have to. 8 lessons:`,
    `The uncomfortable truth about ${t} nobody wants to say:`,
    `${t}, explained in the 6 tweets I wish I'd read first:`,
    `Stop overthinking ${t}. Do these 5 things instead 🧵`,
    `Nobody talks about the boring part of ${t} that actually works:`,
  ];
}
async function hook_variants(c, want) {
  const prompt = `Give ${want} alternative opening-hook tweets for a thread about "${c.topic}" (angle: ${c.angle || 'non-obvious truth'}, audience: ${c.audience || 'builders'}, tone: ${c.toneName}). Each is a standalone scroll-stopper under 220 chars. Return a JSON array of ${want} strings.

${xAlgoPromptBlock()}`;
  return askList(prompt, want, hookTemplates, c);
}

// ─── Tool 3: thread_cta (cheap) ──────────────────────────────────────────────
function thread_cta(c) {
  return {
    ok: true,
    cta: `If this helped, repost tweet 1 and follow for more on ${c.topic}. I share one every week.`,
  };
}

// ─── Workflow: thread_pack ───────────────────────────────────────────────────
async function thread_pack(input, tier) {
  const c = {
    topic: clip(input.topic, 90) || 'growing on Twitter',
    angle: clip(input.angle, 120),
    audience: clip(input.audience, 60),
    tone: input.tone || 'bold',
    toneName: toneOf(input.tone),
  };
  const free = tier !== 'full';
  const wantTweets = free ? 5 : 12;
  const wantHooks = free ? 3 : 8;

  const receipt = [];
  const step = async (tool, fn) => { const t0 = Date.now(); try { const out = await fn(); receipt.push({ tool, ok: true, ms: Date.now() - t0, source: out.source }); return out; } catch (e) { receipt.push({ tool, ok: false, ms: Date.now() - t0, error: e.message }); throw e; } };

  const thread = await step('write_thread', () => write_thread(c, wantTweets));
  const hooks = await step('hook_variants', () => hook_variants(c, wantHooks));
  const cta = await step('thread_cta', async () => ({ ...thread_cta(c), source: 'template' }));

  return {
    ok: true,
    tier: free ? 'free' : 'full',
    topic: { topic: c.topic, tone: c.tone, toneName: c.toneName },
    thread: thread.items,
    hooks: hooks.items,
    cta: cta.cta,
    receipt,
    locked: free ? { tweets: 12 - thread.items.length, hooks: 8 - hooks.items.length, repurpose: 3 } : null,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/tones', (_req, res) => {
  res.json({ ok: true, tones: Object.entries(TONES).map(([id, v]) => ({ id, name: v })) });
});
router.post('/preview', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const { topic, angle, audience, tone } = req.body || {};
    if (!topic) return res.status(400).json({ ok: false, error: 'Give the thread a topic.' });
    res.json(await thread_pack({ topic, angle, audience, tone }, 'free'));
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Thread engine hiccup — try again.' });
  }
});
router.post('/checkout', express.json({ limit: '4kb' }), (req, res) => {
  let link = '';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'payment-config.json'), 'utf8'));
    link = (cfg.links && (cfg.links.thread_pack_9 || cfg.links.thread_pack)) || '';
  } catch (_) {}
  if (link) return res.json({ ok: true, enabled: true, url: link });
  const email = (req.body && String(req.body.email || '')).trim();
  return res.json({ ok: true, enabled: false, captured: !!email,
    message: 'Full Thread Pack checkout is being wired — drop your email and you get it first.' });
});

module.exports = router;
module.exports.thread_pack = thread_pack;
