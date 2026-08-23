// backend/coin-launch-routes.js — "Coin Launch Kit" productized micro-offer.
// Mounted at /api/coin-launch.
//
// A standalone content-engine workflow (coin_launch_kit) that turns a coin idea
// into a launch pack. Phase-1 principle: TEXT + pure-SVG only = near-free. No paid
// image/video APIs are touched here. Expensive tools come later, funded by prepaid
// credits AFTER a $9 payment (see /checkout).
//
// Workflow: coin_launch_kit  →  [write_coin_posts, generate_meme_ideas,
//                                generate_banner_prompt, render_svg_banner]
//
// POST /api/coin-launch/preview  → FREE subset (3 posts, 3 memes, 1 watermarked
//                                  SVG banner) + a visible tool receipt.
// POST /api/coin-launch/checkout → hands off to the existing hosted-links / Stripe
//                                  layer if a "coin_launch_9" link is configured,
//                                  else returns { enabled:false } (tidy placeholder).
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

let callLLM = null;
try { ({ callLLM } = require('./llm-client')); } catch (_) {}
let xAlgoPromptBlock = () => '';
try { ({ xAlgoPromptBlock } = require('./lib/x-algo-playbook')); } catch (_) {}

// ─── Style presets → color palettes (drive the SVG banner + prompt) ──────────
const STYLES = {
  purple_retro_degen: { name: 'Purple · Retro · Degen', bg: '#1a0b2e', bg2: '#2d0a4e', accent: '#b16cff', accent2: '#00ffd0', ink: '#f3e9ff', grid: true, scan: true },
  neon_cyber:         { name: 'Neon · Cyber',           bg: '#050814', bg2: '#0a1030', accent: '#00e5ff', accent2: '#ff2bd6', ink: '#e6f7ff', grid: true, scan: true },
  gold_lux:           { name: 'Gold · Luxury',          bg: '#0d0b06', bg2: '#1c1608', accent: '#e8c45c', accent2: '#fff4cf', ink: '#fdf6e3', grid: false, scan: false },
  meme_green:         { name: 'Meme · Green',           bg: '#04140a', bg2: '#052b16', accent: '#00ff88', accent2: '#e8ff00', ink: '#eafff2', grid: true, scan: false },
  vapor_pink:         { name: 'Vaporwave · Pink',       bg: '#170a1f', bg2: '#3a0a40', accent: '#ff77e1', accent2: '#7cf9ff', ink: '#fff0fb', grid: true, scan: true },
  minimal_dark:       { name: 'Minimal · Dark',         bg: '#0b0b0d', bg2: '#141418', accent: '#ffffff', accent2: '#8a8f98', ink: '#f5f6f8', grid: false, scan: false },
};
function styleOf(key) { return STYLES[key] || STYLES.purple_retro_degen; }

// ─── helpers ─────────────────────────────────────────────────────────────────
function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function xesc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }
function cleanTicker(t) { return String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'COIN'; }
function coinName(n) { return (String(n || '').trim().slice(0, 48)) || 'Your Coin'; }

// Try to pull a JSON array out of an LLM reply; tolerate prose/code-fences.
function extractArray(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const m = body.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a.map(x => String(x)).filter(Boolean) : null; }
  catch { return null; }
}

async function askList(agentName, prompt, want, fallbackFn, coin) {
  if (callLLM) {
    try {
      const r = await Promise.race([
        callLLM([
          { role: 'system', content: 'You are a crypto-native copywriter. Reply ONLY with a JSON array of strings. No preamble, no markdown.' },
          { role: 'user', content: prompt },
        ], { agentName, maxTokens: 600 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('llm-timeout')), 9000)),
      ]);
      const arr = extractArray(r && r.content);
      if (arr && arr.length) return { items: arr.slice(0, want), source: (r.provider || 'llm') };
    } catch (_) { /* fall through to templates */ }
  }
  return { items: fallbackFn(coin).slice(0, want), source: 'template' };
}

// ─── Tool 1: write_coin_posts ────────────────────────────────────────────────
function postTemplates(c) {
  const n = c.name, t = '$' + c.ticker;
  return [
    `gm degens ☀️ ${t} is live. ${c.desc || 'the funniest coin on the timeline'}. no VCs, no promises, just vibes. wen ${t}? now. 🐸`,
    `They said a ${c.name.toLowerCase()} coin couldn't moon.\n${t} said "hold my liquidity." 🚀\n\nLP locked. Comms open. Send it.`,
    `${t} holders right now:\n🟣 comfy\n🟣 early\n🟣 not selling\n\nif you know you know. ${c.name} season incoming.`,
    `The chart for ${t} is doing the thing again 📈\nyou were warned. you were early. don't fumble ${n}.`,
    `Roadmap for ${t}:\n1. launch ✅\n2. meme relentlessly\n3. ????\n4. ${c.name} on every timeline\n\nsimple. effective. degen.`,
    `${t} isn't a token, it's a personality trait.\nretweet if you're built different. 🟣`,
    `Nobody:\nAbsolutely nobody:\n${t} chat at 3am: "wen ${c.name} ATH" 😭🚀`,
    `New coin, same energy: ${t} is here to ${c.desc ? c.desc.toLowerCase() : 'take over crypto twitter'}. get in or get memed.`,
    `${t} community is undefeated 🏆\nlowkey the most fun corner of CT right now. pull up.`,
    `If ${t} hits, remember who was early.\nIf it doesn't, we still had the best memes. either way we win. 🟣🚀`,
  ];
}
async function write_coin_posts(c, want) {
  const prompt = `Write ${want} short, punchy crypto-Twitter (X) launch posts for a memecoin.
Coin: ${c.name}  Ticker: $${c.ticker}
Vibe/idea: ${c.desc || 'a fun degen memecoin'}
Style: ${c.styleName}.
Rules: each under 240 chars, native crypto-Twitter voice, emojis ok, NO financial advice, NO hashtag spam (max 1). Return a JSON array of ${want} strings.

${xAlgoPromptBlock()}`;
  return askList('QUILL', prompt, want, postTemplates, c);
}

// ─── Tool 2: generate_meme_ideas ─────────────────────────────────────────────
function memeTemplates(c) {
  const t = '$' + c.ticker, n = c.name;
  return [
    `Drake meme — top (rejecting): "buying blue chips". bottom (approving): "aping ${t} because the logo made me laugh"`,
    `Two buttons / sweating guy — buttons: "take profit" vs "buy more ${t}". caption: "${n} holders every single day"`,
    `Galaxy-brain (4 panels) — small: "index funds" → glowing: "${t} at 3am because the community is unhinged"`,
    `Distracted boyfriend — boyfriend: "me", girlfriend: "my portfolio plan", other girl: "${t}"`,
    `This is fine dog — room on fire labeled "the market", dog labeled "${t} holder": "we're so early"`,
    `Wojak vs Chad — Wojak: "waiting for the perfect entry". Chad: "already aped ${t}, already memeing"`,
    `Expanding brain — final tier: "${n} isn't a coin, it's a lifestyle"`,
    `Pixel-cat/mascot reaction sheet — 4 faces of ${n}: comfy / greedy / rekt / ATH — for community replies`,
  ];
}
async function generate_meme_ideas(c, want) {
  const prompt = `Give ${want} concrete meme CONCEPTS for a memecoin launch.
Coin: ${c.name}  Ticker: $${c.ticker}  Idea: ${c.desc || 'fun degen coin'}  Style: ${c.styleName}.
Each concept = the meme format/template + the exact top/bottom text. Keep each to one line. Return a JSON array of ${want} strings.`;
  return askList('TURTLE', prompt, want, memeTemplates, c);
}

// ─── Tool 3: generate_banner_prompt (cheap text; seeds a future paid image) ───
function generate_banner_prompt(c) {
  const s = c.style;
  const txt = `${c.styleName} crypto banner for "${c.name}" ($${c.ticker}). ` +
    `Bold central wordmark "${c.ticker}", ${c.desc || 'playful degen mascot'}, ` +
    `palette ${s.accent}/${s.accent2} on ${s.bg}, retro grid + subtle scanlines, high-contrast, 3:1 aspect, meme-ready.`;
  return { ok: true, prompt: txt };
}

// ─── Tool 4: render_svg_banner (pure SVG = FREE) ─────────────────────────────
function render_svg_banner(c, opts) {
  const s = c.style;
  const W = 1200, H = 400;
  const watermark = opts && opts.watermark;
  const grid = s.grid ? `
    <defs>
      <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="${s.accent}" stroke-opacity="0.10" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>` : '';
  const scan = s.scan ? `<rect width="${W}" height="${H}" fill="url(#sc)"/>
    <defs><linearGradient id="sc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.ink}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${s.ink}" stop-opacity="0.04"/>
      <stop offset="1" stop-color="${s.ink}" stop-opacity="0"/>
    </linearGradient></defs>` : '';
  const ticker = xesc('$' + c.ticker);
  const name = xesc(c.name.toUpperCase());
  const tag = xesc((c.desc || 'the coin the timeline deserves').slice(0, 60));
  const wm = watermark ? `<text x="${W - 22}" y="${H - 20}" text-anchor="end"
      font-family="monospace" font-size="18" fill="${s.ink}" fill-opacity="0.35"
      letter-spacing="2">SHADDAI · sample</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ticker} banner">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${s.bg}"/><stop offset="1" stop-color="${s.bg2}"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${s.accent}"/><stop offset="1" stop-color="${s.accent2}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${grid}${scan}
  <circle cx="${W - 130}" cy="90" r="70" fill="${s.accent}" fill-opacity="0.14"/>
  <circle cx="120" cy="${H - 80}" r="90" fill="${s.accent2}" fill-opacity="0.10"/>
  <text x="60" y="150" font-family="'Trebuchet MS',Verdana,sans-serif" font-weight="900"
        font-size="120" fill="url(#ink)" filter="url(#glow)" letter-spacing="2">${ticker}</text>
  <text x="64" y="205" font-family="'Trebuchet MS',Verdana,sans-serif" font-weight="800"
        font-size="42" fill="${s.ink}" letter-spacing="6">${name}</text>
  <text x="64" y="255" font-family="monospace" font-size="22" fill="${s.ink}" fill-opacity="0.75">${tag}</text>
  <rect x="64" y="290" width="360" height="6" rx="3" fill="url(#ink)"/>
  ${wm}
</svg>`;
  return { ok: true, svg, dataUri: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg), w: W, h: H };
}

// ─── The workflow: coin_launch_kit ───────────────────────────────────────────
async function coin_launch_kit(input, tier) {
  const style = styleOf(input.style);
  const c = { name: coinName(input.name), ticker: cleanTicker(input.ticker), desc: String(input.desc || '').slice(0, 200), style, styleName: style.name };
  const free = tier !== 'full';
  const wantPosts = free ? 3 : 10;
  const wantMemes = free ? 3 : 8;

  const receipt = [];
  const step = async (tool, fn) => { const t0 = Date.now(); try { const out = await fn(); receipt.push({ tool, ok: true, ms: Date.now() - t0, source: out.source }); return out; } catch (e) { receipt.push({ tool, ok: false, ms: Date.now() - t0, error: e.message }); throw e; } };

  const posts = await step('write_coin_posts', () => write_coin_posts(c, wantPosts));
  const memes = await step('generate_meme_ideas', () => generate_meme_ideas(c, wantMemes));
  const bprompt = await step('generate_banner_prompt', async () => ({ ...generate_banner_prompt(c), source: 'template' }));
  const banner = await step('render_svg_banner', async () => ({ ...render_svg_banner(c, { watermark: free }), source: 'svg' }));

  return {
    ok: true,
    tier: free ? 'free' : 'full',
    coin: { name: c.name, ticker: c.ticker, style: input.style || 'purple_retro_degen', styleName: style.name },
    posts: posts.items,
    memes: memes.items,
    bannerPrompt: bprompt.prompt,
    banner: { svg: banner.svg, dataUri: banner.dataUri },
    receipt,
    locked: free ? { posts: 10 - posts.items.length, memes: 8 - memes.items.length, banners: 4, calendarDays: 7 } : null,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/styles', (_req, res) => {
  res.json({ ok: true, styles: Object.entries(STYLES).map(([id, s]) => ({ id, name: s.name })) });
});

// FREE preview — text + SVG only, no paid APIs.
router.post('/preview', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const { name, ticker, desc, style } = req.body || {};
    if (!name && !ticker) return res.status(400).json({ ok: false, error: 'Give your coin a name or ticker.' });
    const pack = await coin_launch_kit({ name, ticker, desc, style }, 'free');
    res.json(pack);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Kit engine hiccup — try again.' });
  }
});

// $9 Full Pack — hand off to the existing hosted-links / Stripe layer if a
// "coin_launch_9" link is configured; else tidy placeholder (no error).
router.post('/checkout', express.json({ limit: '4kb' }), (req, res) => {
  let link = '';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'payment-config.json'), 'utf8'));
    link = (cfg.links && (cfg.links.coin_launch_9 || cfg.links.coin_launch)) || '';
  } catch (_) {}
  if (link) return res.json({ ok: true, enabled: true, url: link });
  // Fallback: capture interest so the $9 demand is measured before we wire Stripe.
  const email = (req.body && String(req.body.email || '')).trim();
  return res.json({ ok: true, enabled: false, captured: !!email,
    message: 'Full Pack checkout is being wired — drop your email and you get it first (and 50% off launch).' });
});

module.exports = router;
module.exports.coin_launch_kit = coin_launch_kit; // exported so agents/other workflows can call it
