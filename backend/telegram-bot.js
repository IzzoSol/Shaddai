/* ══════════════════════════════════════════════════════════════════════════
   telegram-bot.js — the interactive SHADDAI Telegram bot (long-polling).
   Commands: /start /help /price /rug /ask /lb /pnl /stats /dist /signals /gm
   Reuses the FREE DexScreener + rugcheck.xyz APIs and the app's own
   LLM (/api/model/chat) for /ask.

   SECURITY: token from env only (TELEGRAM_BOT_TOKEN). No secrets in code.
   Fail-safe: no-op if the token is unset; never throws; never blocks boot.
   Long-polling (getUpdates) so it works with zero webhook/URL config.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const DS_SEARCH = (q) => `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
const RUGCHECK = (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;
const _core = require('./telegram-core');
const _pnl = require('./telegram-pnl');
const _wallets = require('./telegram-wallets');

const _cfg = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  channel: process.env.TELEGRAM_CHANNEL || '',
  port: process.env.PORT || 3000,
});

const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _fmtUsd(n) { const v = Number(n) || 0; if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; return '$' + v.toFixed(2); }
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function _send(token, chatId, html, extra) {
  try {
    await fetch(TG(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {})),
    });
  } catch (e) { /* fail-safe */ }
}

// ── interactive /signals menu ──────────────────────────────────────────────
// Returns the "Signals Hub" card — live channel + one-tap slices of the feed.
function _signalsCard(cfg) {
  let statsLine = '';
  try {
    const s = _pnl.stats('all') || _pnl.stats('day') || '';
    statsLine = s ? '\n' + s : '';
  } catch (e) { /* stats optional */ }
  return (
    '📡 <b>SHADDAI Signals Hub</b>\n' +
    '━━━━━━━━━━━━━━━\n\n' +
    'Live <b>rug-filtered</b> DEX signals with real <b>PNL tracking</b> (Xs, hit-rate, milestone wins).\n\n' +
    (cfg.channel ? `📢 Free signals channel: <b>${_esc(cfg.channel)}</b>\n\n` : '') +
    'Tap a button below for the slice you want 👇\n' +
    '<i>Live · not financial advice · always DYOR</i>'
  );
}
function _signalsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔥 Active calls now', callback_data: 'sig:active' },
       { text: '🏆 Leaderboard',        callback_data: 'sig:lb' }],
      [{ text: '📄 Last 25 calls',      callback_data: 'sig:last25' },
       { text: '📊 Stats / hit-rate',   callback_data: 'sig:stats' }],
      [{ text: '💠 Distribution',       callback_data: 'sig:dist' }],
    ],
  };
}


// ── help text ──────────────────────────────────────────────────────────────
function _help() {
  return (
    '⬡ <b>THE SHADDAI HALL</b> — commands:\n\n' +
    '🏛 <b>Agents (grounded brain, free daily)</b>\n' +
    '/oracle · /turtle · /nexus · /quill · /pikadon — section experts\n' +
    '/shaddai <code>&lt;q&gt;</code> — the orchestrator\n' +
    '/astro <code>&lt;sign&gt;</code> — ORACLE horoscope + moon\n' +
    '/council <code>&lt;q&gt;</code> — all seven weigh in\n\n' +
    '🛡 <b>Security</b>\n' +
    '/check <code>&lt;url&gt;</code> — PIKADON vets a link before you click\n\n' +
    '🎨 <b>Turtle creates</b>\n' +
    '/design <code>&lt;prompt&gt;</code> — generate art\n' +
    '/music <code>[genre]</code> — procedural track\n\n' +
    '💎 <b>Markets</b>\n' +
    '/price <code>&lt;symbol|address&gt;</code> — live DEX price\n' +
    '/rug <code>&lt;mint&gt;</code> — rug-check a token\n' +
    '/zerox <code>&lt;asset&gt;</code> — ZEROX market analysis\n' +
    '/news — live market pulse\n' +
    '/lb /last25 /pnl /held /stats /dist — PNL + leaderboard\n' +
    '/preset — switch signal filters · /signals — hub\n' +
    '/wallets /watch /unwatch /wallet — smart-money tracking\n\n' +
    '🤝 <b>Monetization</b>\n' +
    '/virtuals — hire ZEROX onchain\n' +
    '/pay — free vs paid tiers\n' +
    '/menu — the 7 sections, one board\n\n' +
    '<i>Not financial advice. Always DYOR.</i>'
  );
}
function _start(cfg) {
  const web = process.env.SHADDAI_WEBSITE || 'https://shaddai-g81x.onrender.com';
  const gh = process.env.SHADDAI_GITHUB || 'https://github.com/IzzoSol';
  const x = process.env.SHADDAI_X || 'https://x.com/IzzoSol';
  const lounge = process.env.SHADDAI_LOUNGE || 'https://t.me/EMERALDLOUNGE';
  return (
    '⬡ <b>Welcome to the SHADDAI Hall</b> — Sovereign AI Agents\n' +
    '━━━━━━━━━━━━━━━\n' +
    'One front door, <b>seven specialists</b>:\n' +
    'ORACLE · TURTLE · ZEROX · NEXUS · QUILL · PIKADON · SHADDAI\n\n' +
    '🤖 Brain-answers are <b>free daily</b>; tool runs, art and deep scans unlock via <code>/pay</code> or <a href="' + (process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents') + '">Virtuals</a>.\n\n' +
    '📡 Live <b>rug-filtered crypto signals</b> with real <b>PNL tracking</b>.\n\n' +
    `🐢 Free procedural music: ${_esc(cfg.channel || '@ShaddaiLabs')}\n` +
    `🌿 Lounge: ${_esc(lounge)}\n` +
    `⭐ GitHub: ${_esc(gh)}\n` +
    `𝕏 ${_esc(x)}\n` +
    `🌐 ${_esc(web)}\n\n` +
    '<b>Try:</b> /menu · /oracle &lt;question&gt; · /design cat logo · /check &lt;url&gt; · /lb\n' +
    'Type /help for the full command list.'
  );
}

// ── price lookup ───────────────────────────────────────────────────────────
async function _price(token, chatId, q) {
  if (!q) return _send(token, chatId, 'Usage: /price <symbol or address>  e.g. <code>/price SOL</code>');
  await _send(token, chatId, '🔎 <b>' + _esc(q) + '</b>…');
  try {
    const r = await fetch(DS_SEARCH(q));
    const j = await r.json();
    const pairs = (j && j.pairs) || [];
    const p = pairs.filter(x => x.liquidity && x.liquidity.usd).sort((a, b) => (b.liquidity.usd || 0) - (a.liquidity.usd || 0))[0];
    if (!p) return _send(token, chatId, '❌ No pairs found for <b>' + _esc(q) + '</b>.');
    const b = p.baseToken || {};
    const ch = p.priceChange && p.priceChange.h24 != null ? (Number(p.priceChange.h24) >= 0 ? '🟢 +' : '🔴 ') + Number(p.priceChange.h24).toFixed(1) + '%' : '';
    return _send(token, chatId,
      `<b>${_esc(b.name || b.symbol || q)}</b> ($${_esc(b.symbol || '')}) · ${_esc((p.chainId || '').toUpperCase())}  ${ch}\n` +
      `💵 <b>$${_esc(Number(p.priceUsd || 0).toPrecision(4))}</b>\n` +
      `💧 Liq: <b>${_fmtUsd(p.liquidity && p.liquidity.usd)}</b>  📊 24h Vol: <b>${_fmtUsd(p.volume && p.volume.h24)}</b>\n` +
      (p.url ? `🔗 <a href="${_esc(p.url)}">DexScreener</a>` : ''));
  } catch (e) { return _send(token, chatId, '⚠️ Lookup failed — try again.'); }
}

// ── rug check ──────────────────────────────────────────────────────────────
async function _rug(token, chatId, mint) {
  if (!mint) return _send(token, chatId, 'Usage: /rug <token mint address>');
  await _send(token, chatId, '🛡 Rug-checking…');
  try {
    const r = await fetch(RUGCHECK(mint.trim()));
    if (!r.ok) return _send(token, chatId, '⚠️ No report for that mint. DYOR.');
    const j = await r.json();
    const score = (j && (j.score_normalised != null ? j.score_normalised : j.score));
    const risks = (j && j.risks) || [];
    const rl = risks.slice(0, 5).map(x => `• ${_esc(x.name || x.description || '')}${x.level ? ' (' + _esc(x.level) + ')' : ''}`).join('\n');
    return _send(token, chatId,
      `🛡 <b>Rug Check</b>\n` +
      (score != null ? `Risk score: <b>${_esc(String(score))}</b>\n` : '') +
      (rl ? `\n<b>Flags:</b>\n${rl}\n` : '\nNo major flags.\n') +
      `\n<i>Always DYOR.</i>`);
  } catch (e) { return _send(token, chatId, '⚠️ Rug check failed — try again.'); }
}

// ── ask agent ──────────────────────────────────────────────────────────────
async function _ask(token, chatId, cfg, q, agent) {
  if (!q) return _send(token, chatId, 'Usage: /ask <your question>');
  await _send(token, chatId, '🧠 Thinking…');
  try {
    const r = await fetch(`http://127.0.0.1:${cfg.port}/api/model/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, agent: agent || 'SHADDAI' }), signal: AbortSignal.timeout(45000),
    });
    const j = await r.json();
    const out = (j && (j.content || j.reply || j.result)) || '';
    return _send(token, chatId, out ? _esc(out).slice(0, 3800) : '⚠️ No answer — engine may be busy.');
  } catch (e) { return _send(token, chatId, '⚠️ Agents busy — try again shortly.'); }
}

// ── command router ─────────────────────────────────────────────────────────
// inline-button taps — 📸 PNL Card button + the interactive /signals menu
async function _handleCallback(cfg, cq) {
  const t = cfg.token;
  const answer = (text) => fetch(TG(t, 'answerCallbackQuery'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id, text: text || '' }) }).catch(() => {});
  try {
    const data = String(cq.data || '');
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    // interactive /signals menu — tap a button to pull the live feed slice you want
    if (data.startsWith('sig:') && chatId) {
      const key = data.slice(4);
      await answer('Loading…');
      let html = null, kb = null;
      if (key === 'active')      html = _pnl.activeCalls ? _pnl.activeCalls() : _pnl.lastCalls(25);
      else if (key === 'lb')     html = _pnl.pnlCaption('week');
      else if (key === 'last25') html = _pnl.lastCalls(25);
      else if (key === 'stats')  html = _pnl.stats('day');
      else if (key === 'dist')   html = _pnl.distribution();
      else if (key === 'menu')   { html = _signalsCard(cfg); kb = _signalsKeyboard(); }
      else return answer('Unknown option');
      if (!html) return answer('No data yet — signals are warming up.');
      const extra = kb ? { reply_markup: kb } : undefined;
      return _send(t, chatId, html, extra);
    }
    if (data.startsWith('pnl:') && chatId) {
      const key = data.slice(4);
      const cap = _pnl.pnlForToken(key) || 'No tracked call found for that token.';
      const call = _pnl._findCall ? _pnl._findCall(key) : null;
      const btns = _core.buildButtons(key, (call && call.chain) || 'solana', null);
      await answer('📸 Generating PNL card…');
      // AI-generated PNL image first (HF keys + Pollinations fallback)
      let img = null;
      try { if (_pnl.pnlImages) img = await _pnl.pnlImages.generatePnlImage(call || { symbol: key, peakMult: 1, curMult: 1 }); } catch (e) {}
      // Fall back to milestone image, then random static pnl image
      if (!img) img = call ? (_pnl.milestoneImage(call.curMult || call.peakMult) || _pnl.pnlImage()) : _pnl.pnlImage();
      if (img) { const ok = await _core.sendPhoto(chatId, img, cap, btns); if (ok) return; }
      return _send(t, chatId, cap);
    }
if (data.startsWith('hall:') && chatId) {
      const key = data.slice(5);
      await answer('');
      if (key === 'pay') return _send(t, chatId, _payCard());
      if (key === 'virtuals') return _send(t, chatId, _virtualsCard());
      if (key === 'council') return _send(t, chatId, '🏛 <b>The Council</b> — all seven weigh in at once:\n<code>/council how should the Hall price its oracle?</code>');
      const A = HALL_AGENTS[key.toUpperCase()] ? key.toUpperCase() : null;
      if (A) {
        let cut = '⬡ <b>' + A + '</b> · ' + HALL_AGENTS[A][1] + '\n\nAsk anything:\n<code>/' + A.toLowerCase() + ' &lt;question&gt;</code>\n';
        if (A === 'PIKADON') cut += 'Or vet a link: <code>/check &lt;url&gt;</code>\n';
        if (A === 'TURTLE') cut += 'Or make art/music:\n<code>/design &lt;prompt&gt;</code>  <code>/music lofi</code>\n';
        if (A === 'ORACLE') cut += 'Or your stars: <code>/astro &lt;zodiac sign&gt;</code>\n';
        if (A === 'SHADDAI') cut += 'Strategy, decisions, final calls — <code>/shaddai &lt;question&gt;</code>\n';
        cut += '\n<i>Free daily taste · <code>/pay</code> for unlimited + tools.</i>';
        return _send(t, chatId, cut);
      }
      return answer('Hall menu');
    }
    return answer();
  } catch (e) { return answer(); }
}

// /music — compose a free procedural track (Turtle Music Bot) and send it as audio.
// Args (any order, all optional): genre (lofi/synthwave/trap/ambient/house/8bit),
// mood (chill/bright/dark/dreamy/hype), and a bar count 4-16.
async function _music(t, chatId, arg) {
  const mg = require('./lib/music-gen-node');
  let genre = null, mood = null, bars = 8;
  String(arg || '').toLowerCase().split(/\s+/).filter(Boolean).forEach((w) => {
    const gk = mg.pickGenre(w), mk = mg.pickMood(w);
    if (!genre && gk) genre = gk;
    else if (!mood && mk) mood = mk;
    else if (/^\d+$/.test(w)) bars = Math.max(4, Math.min(16, parseInt(w, 10)));
  });
  await _send(t, chatId, '🐢 <b>Turtle Music Bot</b> is composing a <b>' + (genre || 'lofi') + '</b> track…');
  try {
    const { wav, meta } = mg.generate({ genre, mood, bars });
    const cap = '🐢 <b>Turtle Music Bot</b> · ' + meta.genreName + ' · ' + meta.bpm + ' BPM · ' + meta.seconds + 's\n' +
      '<i>Free procedural track · ShaddaiLabs</i>\nTry: <code>/music synthwave hype</code>';
    const ok = await _core.sendAudio(chatId, wav, 'turtle-' + meta.genre + '.wav', cap, meta.genreName + ' — Turtle Music Bot');
    if (!ok) return _send(t, chatId, '⚠️ Could not send the track. Try again in a moment.');
  } catch (e) {
    return _send(t, chatId, '⚠️ Music engine hiccup — try <code>/music lofi</code>');
  }
}

// ── The Hall — every agent, one front door ────────────────────────────────
const HALL_AGENTS = {
  ORACLE: ['Research & Intelligence', 'astrology · research · trends · grounded answers'],
  TURTLE: ['UI/UX & Creative', 'design direction · art · procedural music'],
  ZEROX: ['Wealth & Revenue', 'signals · prices · deals · onchain paper trades'],
  NEXUS: ['Technical Architect', 'code · APIs · scale · engineering plans'],
  QUILL: ['Writing & Communication', 'copy · docs · clear sharp words'],
  PIKADON: ['Security & Compliance', 'URL checks · audits · hardening'],
  SHADDAI: ['Supreme Orchestrator', 'strategy · decisions · final calls'],
};
const _HALL_HEADER = '⬡ <b>THE HALL — every agent, one front door</b>\n━━━━━━━━━━━━━━━\n';
function _hallMenuCard() {
  let out = _HALL_HEADER;
  Object.entries(HALL_AGENTS).forEach(([a, d]) => {
    out += '\n▸ <b>' + a + '</b> — ' + d[1] + '\n  <code>/' + a.toLowerCase() + ' &lt;question&gt;</code>';
  });
  out += '\n\n➤ <code>/council &lt;q&gt;</code> all seven · <code>/design &lt;p&gt;</code> art · <code>/music</code> tunes';
  out += '\n➤ <code>/check &lt;url&gt;</code> PIKADON · <code>/signals</code> live · <code>/pay</code> upgrade';
  out += '\n\n<i>Free daily taste · 3 deep brain answers/day · full Hall via /pay or Virtuals.</i>';
  return out;
}
function _hallMenuKeyboard() {
  return { inline_keyboard: [
    [{ text: '🌙 Oracle', callback_data: 'hall:oracle' }, { text: '🐢 Turtle', callback_data: 'hall:turtle' }, { text: '💎 Zerox', callback_data: 'hall:zerox' }],
    [{ text: '🛡 Pikadon', callback_data: 'hall:pikadon' }, { text: '🏛 Council', callback_data: 'hall:council' }, { text: '🤝 Virtuals', callback_data: 'hall:virtuals' }],
    [{ text: '💠 Pay / Upgrade', callback_data: 'hall:pay' }],
  ]};
}
function _virtualsCard() {
  const ref = process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents';
  return '🤝 <b>Hire ZEROX on Virtuals</b>\n━━━━━━━━━━━━━━━\n\nZEROX also lives on the <b>Virtuals agent marketplace</b> — jobs and paid work with <b>onchain escrow</b>.\n\n🔗 <a href="' + ref + '">app.virtuals.io/acp/agents</a>\n\nOr stay inside this Hall: /signals · /price &lt;asset&gt; · /pnl\n\n<i>Hire the Virtuals agent → fees settle onchain · zero blanks.</i>';
}
function _payCard() {
  const ref = process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents';
  return '💠 <b>SHADDAI Hall — free + paid</b>\n━━━━━━━━━━━━━━━\n\n<b>Free every day:</b>\n• /signals · /price · /rug · /news — live markets\n• /music — procedural tracks by TURTLE\n• /menu — browse the 7 sections\n• <b>3</b> deep agent answers (ORACLE, TURTLE, NEXUS…)\n\n<b>Paid onchain:</b>\n• Unlimited agent runs with real tools (/check, /design, /zerox)\n• Hire ZEROX on <a href="' + ref + '">Virtuals</a> — escrow-protected jobs\n• USDC via x402 pay-per-call rails\n\n<i>The free taste is real. The paid Hall is deep.</i>';
}

// Grounded brain answers (RAG) — the free taste. 402 = quota used → nudge.
async function _brain(t, chatId, cfg, agent, q, k) {
  if (!q) return _send(t, chatId, 'Usage: /' + String(agent).toLowerCase() + ' &lt;your question&gt;');
  await _send(t, chatId, '🧠 <b>' + agent + '</b> is thinking…');
  try {
    const url = 'http://127.0.0.1:' + cfg.port + '/api/ask?q=' + encodeURIComponent(q) + '&agent=' + encodeURIComponent(agent) + '&k=' + (k || 4);
    const r = await fetch(url, { headers: { 'X-Telegram-User-Id': String(chatId) }, signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) return _send(t, chatId, '🔒 <b>' + agent + '</b> free answers used up for today.\n\n<code>/pay</code> unlocks the full Hall · or hire on <a href="' + (process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents') + '">Virtuals</a>.');
    const ans = String(j.answer || j.content || '').trim();
    if (!ans) return _send(t, chatId, '⚠️ <b>' + agent + '</b> drew a blank — try again shortly.');
    let out = '<b>' + agent + '</b> · ' + ((HALL_AGENTS[agent] || [])[0] || 'hall section') + '\n━━━━━━━━━━━━━━━\n\n' + _esc(ans).slice(0, 3200);
    const src = (j.sources || []).slice(0, 2).map(s => (s && s.title) || '').filter(Boolean);
    if (src.length) out += '\n\n<i>Sources:</i> ' + src.map(_esc).join(' · ');
    out += '\n<i>' + (j.llm_powered ? 'llm-grounded' : 'knowledge base') + ' · /pay for unlimited</i>';
    return _send(t, chatId, out);
  } catch (e) { return _send(t, chatId, '⚠️ <b>' + agent + '</b> is busy — try again shortly.'); }
}

// The Council — all seven weigh in via the synthesizer.
async function _council(t, chatId, cfg, q) {
  if (!q) return _send(t, chatId, 'Usage: /council &lt;question&gt; — all seven weigh in');
  await _send(t, chatId, '🏛 The Council convenes…');
  try {
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/synthesize?q=' + encodeURIComponent(q), { headers: { 'X-Telegram-User-Id': String(chatId) }, signal: AbortSignal.timeout(90000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) return _send(t, chatId, '🔒 Council free votes used up — <code>/pay</code> to convene again.');
    const ags = (j && j.agents) || [];
    if (!ags.length) return _send(t, chatId, '⚠️ The Council is silent — try again shortly.');
    let out = '🏛 <b>The Council on:</b> ' + _esc(q.slice(0, 70)) + '\n━━━━━━━━━━━━━━━';
    ags.forEach(a => { if (a && a.answer) out += '\n\n<b>' + _esc(String(a.agent || '?').slice(0, 12)) + '</b> · ' + _esc(String(a.answer).slice(0, 420)); });
    if (ags.some(a => a && a.llm_powered)) out += '\n\n<i>llm-grounded · /pay for full depth</i>';
    return _send(t, chatId, out.slice(0, 3900));
  } catch (e) { return _send(t, chatId, '⚠️ Council is busy — try again shortly.'); }
}

// Paid agent runs with real tools (premium-gated server-side).
async function _agentic(t, chatId, cfg, agent, task) {
  await _send(t, chatId, '⚙️ <b>' + agent + '</b> running tools…');
  try {
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/agentic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-User-Id': String(chatId) },
      body: JSON.stringify({ agent: agent, task: task, autoRoute: false }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) return _send(t, chatId, '🔒 <b>' + agent + '</b> runs are paid — <code>/pay</code> to fire tools from Telegram.');
    const out = String(j.response || j.content || j.reply || j.result || '').trim();
    if (!out) return _send(t, chatId, '⚠️ <b>' + agent + '</b> returned nothing — try again.');
    const tools = (j.toolsUsed || []).slice(0, 4).join(', ');
    return _send(t, chatId, '<b>' + agent + '</b>' + (tools ? ' · tools: ' + _esc(tools) : '') + '\n━━━━━━━━━━━━━━━\n\n' + _esc(out).slice(0, 3000) + '\n\n<i>paid run · ' + _esc(String(j.model || j.provider || 'engine')).slice(0, 50) + '</i>');
  } catch (e) { return _send(t, chatId, '⚠️ <b>' + agent + '</b> engine is busy — try again shortly.'); }
}

// TURTLE designs — agent image tool first, keyless Pollinations fallback (never dead-ends).
async function _turtleDesign(t, chatId, cfg, prompt) {
  if (!prompt) return _send(t, chatId, 'Usage: /design &lt;what to create&gt;  e.g. <code>/design a neon cyberpunk phoenix logo</code>');
  await _send(t, chatId, '🐢 TURTLE is designing…');
  try {
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/agentic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-User-Id': String(chatId) },
      body: JSON.stringify({ agent: 'TURTLE', task: 'Generate a high-quality image: ' + prompt + '. If you produce the image, reply with just its URL.', autoRoute: false }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json().catch(() => ({}));
    const resp = String(j.response || j.content || j.reply || '').trim();
    const img = (resp.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|webp)(?:\?\S*)?/i) || [])[0] || null;
    if (img) { const ok = await _core.sendPhoto(chatId, img || '', '🐢 <b>TURTLE design</b> · ' + _esc(prompt.slice(0, 60)) + '\n/design to make another'); if (ok) return; }
    const fb = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt + ' — high quality, detailed') + '?width=1024&height=1024&nologo=true';
    const ok2 = await _core.sendPhoto(chatId, fb, '🐢 <b>TURTLE design</b> · ' + _esc(prompt.slice(0, 60)) + '\n<i>instant render · /design to make another</i>');
    if (ok2) return;
    return _send(t, chatId, resp ? _esc(resp).slice(0, 900) : '⚠️ Image engine hiccup — try <code>/design cat logo</code>');
  } catch (e) { return _send(t, chatId, '⚠️ TURTLE is busy — try again shortly.'); }
}

// PIKADON URL check — local heuristics first, deep scan via the premium agent.
const _suspTld = /\.(zip|top|xyz|click|link|gq|tk|ml|cf|ga|work|icu|stream|download|kim|racing|party|review|faith|loan|date|science|rest|cyou|trade|accountant|mom|lol|quest)$/i;
const _phishWords = /(login|verify|update|wallet|airdrop|claim|reward|free|bonus|password|secure|confirm|recover|signin|2fa|support|prize)/i;
const _brandWords = /(pay|secure|login|verify|wallet|airdrop|shaddai|solana|phantom|binance|coinbase|metamask|token|claim|uniswap|backpack)/i;
function _urlHeuristics(raw) {
  const flags = [];
  let u = null;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (_) { return [raw + ' → <b>not a valid URL</b>']; }
  if (u.protocol !== 'https:') flags.push('non-HTTPS — plaintext traffic');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) flags.push('bare IP host');
  if (u.hostname.startsWith('xn--')) flags.push('punycode (confusable) host');
  const sld = (u.hostname.split('.')[0] || '').toLowerCase();
  if (_brandWords.test(sld)) flags.push('looks like a <b>brand imposter</b>');
  if (_suspTld.test(u.hostname)) flags.push('cheap/abuse-friendly TLD');
  if (_phishWords.test(u.pathname)) flags.push('phishing words in path');
  if (u.username || u.password) flags.push('credentials embedded in URL');
  if (u.pathname.includes('//')) flags.push('unusual path slashes');
  return flags;
}
async function _checkUrl(t, chatId, cfg, raw) {
  if (!raw) return _send(t, chatId, 'Usage: /check &lt;url&gt; — PIKADON vets it before you click.\nExample: <code>/check https://example.com</code>');
  const url = String(raw).trim().replace(/^<|>$/g, '');
  const flags = _urlHeuristics(url);
  await _send(t, chatId, '🛡 PIKADON is examining <b>' + _esc(url.slice(0, 80)) + '</b>…');
  let verdict = '';
  try {
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/agentic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-User-Id': String(chatId) },
      body: JSON.stringify({ agent: 'PIKADON', task: 'Security-audit this URL: ' + url + '. Fetch it if safe to do so. Report a clear RISK LEVEL (safe / caution / dangerous) and the red flags a user should know before clicking. Max 6 lines.', autoRoute: false }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json().catch(() => ({}));
    verdict = String(j.response || j.content || j.reply || j.result || '').trim().slice(0, 1200);
    if (r.status === 402) verdict = '(deep scan is a paid run — <code>/pay</code> to enable)';
  } catch (_) { verdict = '(deep scan unavailable)'; }
  let out = '🛡 <b>PIKADON URL Check</b>\n━━━━━━━━━━━━━━━\n\n<b>' + _esc(url.slice(0, 90)) + '</b>\n\n';
  out += flags.length ? '⚠️ <b>Flags:</b>\n' + flags.map(f => '• ' + f).join('\n') : '✅ <b>Heuristics clean</b> (local only)';
  out += '\n\n<b>Deep scan:</b> ' + verdict;
  return _send(t, chatId, out.slice(0, 3900));
}

async function _handle(cfg, update) {
  if (update.callback_query) return _handleCallback(cfg, update.callback_query);
  const msg = update.message || update.channel_post; if (!msg) return;
  try { _core.addChat(msg.chat); } catch (e) {}
  const chatId = msg.chat && msg.chat.id; const text = (msg.text || '').trim();
  if (!chatId || !text) return;
  const m = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) return;
  const cmd = m[1].toLowerCase(); const arg = (m[2] || '').trim(); const t = cfg.token;
  switch (cmd) {
    case 'start': { const img = require('./telegram-news')._botImage(); const cap = _start(cfg); if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; } return _send(t, chatId, cap); }
    case 'help': return _send(t, chatId, _help());
    case 'price': case 'p': return _price(t, chatId, arg);
    case 'rug': case 'rugcheck': return _rug(t, chatId, arg);
    case 'ask': case 'shaddai': return _ask(t, chatId, cfg, arg);
    case 'zerox': case 'analysis': return _ask(t, chatId, cfg, 'Give a concise crypto market analysis + sentiment right now for: ' + (arg || 'the overall market') + '. 5 lines max.', 'ZEROX');
    case 'news': case 'pulse': { const html = await require('./telegram-news').marketPulse(); return _send(t, chatId, html || '⚠️ Market data unavailable.'); }

    // /music [genre] [mood] [bars] — free procedural track by Turtle Music Bot (ShaddaiLabs)
    case 'music': case 'song': case 'beat': case 'track': return _music(t, chatId, arg);

    // ── The Hall — per-agent sections (grounded brain, free taste) ──
    case 'oracle': return _brain(t, chatId, cfg, 'ORACLE', arg || 'Give me a sharp research briefing on the trend of the day.', 4);
    case 'turtle': return _brain(t, chatId, cfg, 'TURTLE', arg || 'Give me a design direction for a striking brand visual.', 4);
    case 'nexus': return _brain(t, chatId, cfg, 'NEXUS', arg || 'Give me a crisp engineering plan for building something like this.', 4);
    case 'quill': return _brain(t, chatId, cfg, 'QUILL', arg || 'Write something clear and sharp.', 4);
    case 'pikadon': return _brain(t, chatId, cfg, 'PIKADON', arg || 'Give me a security checklist for a public-facing web app.', 4);
    case 'astro': case 'horoscope': case 'stars': {
      const sign = (arg || '').split(/\s+/).slice(0, 2).join(' ') || 'today';
      return _brain(t, chatId, cfg, 'ORACLE', 'Give my ' + sign + ' horoscope plus moon-phase guidance, grounded and honest, in 4 lines.', 4);
    }
    case 'council': case 'synthesize': case 'board': return _council(t, chatId, cfg, arg);
    case 'design': case 'turtleimg': case 'art': return _turtleDesign(t, chatId, cfg, arg);
    case 'check': case 'url': case 'verify': case 'scan': return _checkUrl(t, chatId, cfg, arg);
    case 'virtuals': case 'acp': case 'marketplace': return _send(t, chatId, _virtualsCard());
    case 'pay': case 'upgrade': case 'pro': case 'pricing': return _send(t, chatId, _payCard());
    case 'menu': case 'halls': case 'zones': return _send(t, chatId, _hallMenuCard(), { reply_markup: _hallMenuKeyboard() });

    case 'stats': case 'scorecard': { const per = /week/i.test(arg) ? 'week' : /month/i.test(arg) ? 'month' : 'day'; return _send(t, chatId, _pnl.stats(per)); }

    // /lb — leaderboard (text only, no image, no HF)
    case 'lb': return _send(t, chatId, _pnl.pnlCaption(arg || 'week'));

    // /last, /last25, /last50, /last75, /last100 — last N calls with live PNLs
    case 'last': case 'last25': case 'last50': case 'last75': case 'last100': {
      const n = cmd === 'last' ? (parseInt(arg, 10) || 25) : parseInt(cmd.slice(4), 10);
      return _send(t, chatId, _pnl.lastCalls(n));
    }

    // /active — live calls right now (not rugged, <72h), sorted by current gain
    case 'active': case 'live': case 'open': case 'now':
      return _send(t, chatId, _pnl.activeCalls ? _pnl.activeCalls() : _pnl.lastCalls(25));

    // /pnl <ticker> — PNL card for one token (milestone image if at that level, text always)
    case 'pnl': {
      if (!arg) return _send(t, chatId, 'Usage: /pnl <code>&lt;ticker&gt;</code>  e.g. <code>/pnl SOLANDIER</code>');
      const cap = _pnl.pnlForToken(arg);
      if (!cap) return _send(t, chatId, 'No tracked call found for <b>' + _esc(arg) + '</b>. Try /lb for the leaderboard.');
      // try milestone image first, then saved image, then random pnl image
      const call = _pnl._findCall ? _pnl._findCall(arg) : null;
      const msImg = call ? _pnl.milestoneImage(call.curMult || call.peakMult) : null;
      if (msImg) { const ok = await _core.sendPhoto(chatId, msImg, cap); if (ok) return; }
      const saved = _pnl.savedPnlImage(arg);
      if (saved) { const ok = await _core.sendPhoto(chatId, saved, cap); if (ok) return; }
      return _send(t, chatId, cap);
    }

    case 'dist': case 'distribution': case 'performance': return _send(t, chatId, _pnl.distribution());

    // /held — long-term "conviction holds": calls still green, ranked by how well they held their ATH
    case 'held': case 'holds': case 'survivors': case 'conviction': case 'longterm': {
      const per = /week|wk|7d/i.test(arg) ? 'week' : 'day';
      const cap = _pnl.survivors(per);
      const img = _pnl.pnlImage && _pnl.pnlImage();
      if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; }
      return _send(t, chatId, cap);
    }

    // /preset — view all presets or switch active one
    case 'preset': {
      const presets = _core.listPresets();
      const active = _core.activePresetKey();
      if (!arg) {
        let html = '🎛 <b>Filter Presets</b>\n━━━━━━━━━━━━━\n\n';
        html += 'Current: <b>' + (active ? _core.getPreset(active).label : 'Custom') + '</b>\n\n';
        presets.forEach(p => {
          const isActive = p.key === active;
          html += (isActive ? '▸ ' : '  ') + '<b>' + p.label + '</b>\n';
          html += '  <code>/preset ' + p.key + '</code> — ' + p.desc + '\n\n';
        });
        html += '<i>Switch preset to change all filters at once.</i>';
        return _send(t, chatId, html);
      }
      const result = _core.applyPreset(arg);
      if (!result) return _send(t, chatId, '❌ Unknown preset: <code>' + _esc(arg) + '</code>. Try /preset to see all options.');
      const p = _core.getPreset(arg);
      return _send(t, chatId,
        '✅ <b>Switched to ' + (p ? p.label : arg) + '</b>\n\n' +
        '• Max FDV: <code>$' + (result.maxFdv / 1000).toFixed(0) + 'K</code>\n' +
        '• Min Liq: <code>$' + result.minLiq + '</code>\n' +
        '• Min Vol: <code>$' + result.minVol24h + '</code>\n' +
        '• Min Holders: <code>' + result.minHolders + '</code>\n' +
        '• Rug Score: <code>' + result.rugMinScore + '+</code>\n' +
        '• 🔒 Locked LP: <code>required</code>\n' +
        (result.maxSnipersPct ? '• 🔫 Snipers+Bundlers: <code>&lt;' + result.maxSnipersPct + '%</code>\n' : '') +
        (result.minTop10Pct ? '• 🐊 Whale Top10: <code>≥' + result.minTop10Pct + '%</code> (bullish)\n' : '') +
        (result.top10BullishBonus ? '• 🏋️ Whale Bonus: <code>+' + result.top10BullishBonus + '</code> confidence\n' : '') +
        (result.requireWebsite ? '• 🌐 Website required\n' : '') +
        (result.requireTwitter ? '• 𝕏 Twitter required\n' : '') +
        (result.requireSocial ? '• 📱 Social required (3+)\n' : '') +
        '\nFilters updated instantly.'
      );
    }

    // /watch <address> [label] [type] — add wallet to watchlist
    case 'watch': {
      if (!arg) return _send(t, chatId, 'Usage: <code>/watch &lt;address&gt; [label] [alpha|whale|smart|kol|dev]</code>\n\nExample: <code>/watch ABC...XYZ "Whale Wang" whale</code>');
      const parts = arg.match(/^(\S+)(?:\s+"([^"]+)"|\s+(\S+))?(?:\s+(alpha|whale|smart|kol|dev|fund|team))?$/i);
      const addr = parts ? parts[1] : arg.split(/\s+/)[0];
      const label = parts ? (parts[2] || parts[3] || null) : null;
      const type = (parts && parts[4]) || 'alpha';
      const w = _wallets.addWallet(addr, label, type);
      if (!w) return _send(t, chatId, '❌ Invalid address. Must be a valid Solana address (32-44 chars).');
      _wallets.restartWatcher();
      return _send(t, chatId,
        `✅ <b>Watching</b> ${_wallets._walletEmoji ? '' : ''}wallet\n\n` +
        `Label: <b>${_esc(w.label)}</b>\n` +
        `Type: <b>${_esc(w.type)}</b>\n` +
        `<code>${_esc(w.address)}</code>\n\n` +
        `I'll alert when this wallet apes into something and show when it's in a signal's top holders.`
      );
    }

    case 'unwatch': {
      if (!arg) return _send(t, chatId, 'Usage: <code>/unwatch &lt;address&gt;</code>');
      const removed = _wallets.removeWallet(arg.trim());
      _wallets.restartWatcher();
      return _send(t, chatId, removed ? `✅ Removed from watchlist.` : `❌ Address not found in watchlist.`);
    }

    case 'wallets': case 'watching': return _send(t, chatId, _wallets.walletsListCard());

    case 'wallet': {
      if (!arg) return _send(t, chatId, 'Usage: <code>/wallet &lt;address&gt;</code>\nOr use /wallets to see all watched.');
      return _send(t, chatId, _wallets.walletCard(arg.trim()));
    }

    case 'signals': case 'hub': case 'feed': return _send(t, chatId, _signalsCard(cfg), { reply_markup: _signalsKeyboard() });
    case 'agents': return _send(t, chatId, '⬡ <b>SHADDAI</b> is an AI agent empire — forge agents, chain workflows, walk a 3D/2D world, trade in the Bazaar.\n🌐 https://shaddai-g81x.onrender.com');
    case 'about': case 'project': case 'info': { const news = require('./telegram-news'); const img = news._botImage(); const cap = news.projectPromo(); if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; } return _send(t, chatId, cap); }
    case 'axiom': case 'trade': {
      const cap = '⚡ <b>Unlock the Axiom Edge</b>\n\nOn Phantom? Axiom adds a pro trading layer — stop-losses, advanced orders, and wallet tracking to copy winners &amp; dodge dev wallets/KOLs.\n\n🔗 <a href="https://axiom.trade/@emeraldog">axiom.trade/@emeraldog</a>\n<i>(Rewards go to users who actively trade.)</i>\n\n🎁 Star our GitHub, follow @IzzoSol, and trade via the link → DM for <b>1 week Premium free</b>.';
      const img = require('./telegram-news')._botImage(); if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; } return _send(t, chatId, cap);
    }
    case 'gm': return _send(t, chatId, 'gm ☀️ — go forge something.');
    default: return _send(t, chatId, 'Unknown command. Try /help');
  }
}

// ── Telegram long-polling loop ─────────────────────────────────────────────
async function _getUpdates(token, offset) {
  const r = await fetch(TG(token, 'getUpdates') + `?timeout=30&offset=${offset}`, { signal: AbortSignal.timeout(40000) });
  const j = await r.json();
  return (j && j.result) || [];
}

// Register commands so they show up in Telegram's "/" menu
// Must register for EACH scope — default only covers private chats
async function _registerCommands(token) {
  const commands = [
    { command: 'start',   description: 'Welcome + links' },
    { command: 'help',    description: 'All commands list' },
    { command: 'active',  description: 'Live calls right now — not rugged, sorted by gain' },
    { command: 'lb',      description: 'Leaderboard — top calls ranked by Xs' },
    { command: 'last25',  description: 'Last 25 calls with live PNLs' },
    { command: 'last50',  description: 'Last 50 calls with live PNLs' },
    { command: 'last100', description: 'Last 100 calls with live PNLs' },
    { command: 'pnl',     description: 'PNL card for a token  e.g. /pnl PORK' },
    { command: 'held',    description: 'Conviction holds — calls still green' },
    { command: 'stats',   description: 'Hit-rate + best calls scorecard' },
    { command: 'dist',    description: 'Performance distribution breakdown' },
    { command: 'price',   description: 'Live DEX price  e.g. /price BONK' },
    { command: 'rug',     description: 'Rug-check a Solana mint' },
    { command: 'preset',  description: 'View/switch signal filter presets' },
    { command: 'ask',     description: 'Ask a SHADDAI agent anything' },
    { command: 'music',   description: 'Free music track  e.g. /music synthwave hype' },
    { command: 'zerox',   description: 'ZEROX market analysis + sentiment' },
    { command: 'news',    description: 'Live market pulse' },
    { command: 'signals', description: 'Interactive signals hub — active calls, leaderboard, stats' },
    { command: 'agents',  description: 'What is SHADDAI' },
    { command: 'wallets', description: 'List tracked wallets (smart money)' },
    { command: 'watch',   description: 'Track a wallet — get ape alerts' },
    { command: 'unwatch', description: 'Stop tracking a wallet' },
    { command: 'wallet',  description: 'Wallet profile + links' },
    { command: 'axiom',   description: 'Axiom trading edge + referral' },
    { command: 'gm',      description: 'gm ☀️' },
    { command: 'menu',    description: 'The 7 Hall sections, one board' },
    { command: 'oracle',  description: 'ORACLE — research, astrology, trends' },
    { command: 'turtle',  description: 'TURTLE — design direction, art, music' },
    { command: 'nexus',   description: 'NEXUS — code, APIs, scale' },
    { command: 'quill',   description: 'QUILL — writing, copy, docs' },
    { command: 'pikadon', description: 'PIKADON — security, audits' },
    { command: 'astro',   description: 'ORACLE horoscope + moon guidance' },
    { command: 'council', description: 'All seven agents weigh in on a question' },
    { command: 'design',  description: 'TURTLE generates art from a prompt' },
    { command: 'check',   description: 'PIKADON URL safety check  e.g. /check https://…' },
    { command: 'virtuals', description: 'Hire ZEROX onchain via Virtuals' },
    { command: 'pay',     description: 'Free vs paid tiers — unlock the full Hall' },
  ];
  // Register for all scopes so "/" menu works in private chats, groups, and channels
  const scopes = [
    { type: 'default' },
    { type: 'all_private_chats' },
    { type: 'all_group_chats' },
    { type: 'all_chat_administrators' },
  ];
  for (const scope of scopes) {
    try {
      await fetch(TG(token, 'setMyCommands'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands, scope }),
      });
    } catch (e) { /* non-fatal */ }
  }
}

let _running = false;
async function _loop() {
  const cfg = _cfg();
  await _registerCommands(cfg.token);
  let offset = 0, fails = 0;
  while (_running) {
    try {
      const updates = await _getUpdates(cfg.token, offset);
      fails = 0;
      for (const u of updates) { offset = u.update_id + 1; _handle(_cfg(), u).catch(() => {}); }
    } catch (e) { fails++; await _sleep(Math.min(30000, 2000 * fails)); }
  }
}

function startTelegramBot() {
  const cfg = _cfg();
  if (!cfg.token) { console.log('[tg-bot] disabled — set TELEGRAM_BOT_TOKEN to enable.'); return; }
  if (_running) return;
  _running = true;
  console.log('[tg-bot] ENABLED — /lb /pnl /price /rug /preset /ask /stats /dist /signals /gm');
  _loop().catch(e => { console.warn('[tg-bot] loop ended:', e && e.message); _running = false; });
}
function stopTelegramBot() { _running = false; }

module.exports = { startTelegramBot, stopTelegramBot };
