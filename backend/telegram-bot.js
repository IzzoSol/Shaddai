/* ══════════════════════════════════════════════════════════════════════════
   telegram-bot.js — the interactive SHADDAI Telegram bot (long-polling).
   Commands: /start /help /price /rug /ask /learn /boxes /lb /pnl /stats /dist /signals /gm
   Reuses the FREE DexScreener + rugcheck.xyz APIs and the app's own
   LLM (/api/model/chat) for /ask.

   SECURITY: token from env only (TELEGRAM_BOT_TOKEN). No secrets in code.
   Fail-safe: no-op if the token is unset; never throws; never blocks boot.
   Long-polling (getUpdates) so it works with zero webhook/URL config.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

// Standalone bootstrap: load .env when run directly (`node telegram-bot.js`).
// No-op when the server already loaded dotenv, so server behavior is unchanged.
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) {}
}

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const DS_SEARCH = (q) => `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
const RUGCHECK = (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;
const _core = require('./telegram-core');
const _pnl = require('./telegram-pnl');
const _wallets = require('./telegram-wallets');
const _hf = require('./lib/hf-keys');
const _fsImg = require('fs');
const _osImg = require('os');
const _pathImg = require('path');
const _card = require('./lib/call-card');
const _brandBg = require('./lib/brand-bg');

const _cfg = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  channel: process.env.TELEGRAM_CHANNEL || '',
  port: process.env.PORT || 3000,
});

// Friendly channel name for display — numeric channel IDs (supergroups/channels)
// show as the human-readable @username instead of "-100xxxxxxxxxx".
const _chanLabel = (c) => {
  const ch = String(c || '').trim();
  if (!ch) return '';
  if (ch === '-1004433718662') return '@ShaddaiLabs';
  if (/^-100\d+$/.test(ch)) return process.env.TELEGRAM_CHANNEL_LABEL || '@ShaddaiLabs';
  return ch;
};

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
    (cfg.channel ? `📢 Free signals channel: <b>${_esc(_chanLabel(cfg.channel))}</b>\n\n` : '') +
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
    '⬡ <b>THE SHADDAI TEMPLE</b> — commands:\n\n' +
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
    '⚡ <b>Markets</b>\n' +
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
    '🎮 <b>Community</b>\n' +
    '/games — arcade hub · /digest — daily roundup\n' +
    '/dice /dart /ball /bowl /slot /footy — native games, sparks at stake\n' +
    '/arcade <code>&lt;game&gt; [bet]</code> — CPU battles (double-up)\n' +
    '/sparks — balance · /sparks top — league · /bonus — daily refill\n' +
    '/quest — daily quest bank (+10/+20/+25)\n' +
    '/conviction <code>&lt;SYM&gt; [sparks]</code> — stake sparks on a call · /hot — most-backed\n' +
    '/leaderboard — podium · /referral — invite friends\n' +
    '/family — every SHADDAI bot in one card · /temple — the Axiom\n\n' +
    '🏆 Also: /master — the full Temple index · /arena ORACLE vs ZEROX 10 · /grok &lt;q&gt; · /game\n\n' +
    '<i>Not financial advice. Always DYOR.</i>'
  );
}
function _start(cfg) {
  const web = process.env.SHADDAI_WEBSITE || 'https://shaddai-g81x.onrender.com';
  const gh = process.env.SHADDAI_GITHUB || 'https://github.com/IzzoSol';
  const x = process.env.SHADDAI_X || 'https://x.com/IzzoSol';
  const lounge = process.env.SHADDAI_LOUNGE || 'https://t.me/EMERALDLOUNGE';
  const axiom = process.env.SHADDAI_AXIOM || 'We build sovereign intelligence — every agent free, every thought audited, every soul entitled to the truth.';
  return (
    '🛕 <b>WELCOME TO THE SHADDAI TEMPLE</b> — Sovereign AI Agents\n' +
    '━━━━━━━━━━━━━━━\n' +
    'One front door, <b>seven specialists</b>:\n' +
    'ORACLE · TURTLE · ZEROX · NEXUS · QUILL · PIKADON · SHADDAI\n\n' +
    '⬡ <b>The Axiom:</b> ' + _esc(axiom) + '\n\n' +
    '🤖 Brain-answers are <b>free daily</b>; tool runs, art and deep scans unlock via <code>/pay</code> or <a href="' + (process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents') + '">Virtuals</a>.\n\n' +
    '📡 Live <b>rug-filtered crypto signals</b> with real <b>PNL tracking</b>.\n\n' +
    `🐢 Free procedural music: ${_esc(_chanLabel(cfg.channel) || '@ShaddaiLabs')}\n` +
    `🌿 Lounge: ${_esc(lounge)}\n` +
    `⭐ GitHub: ${_esc(gh)}\n` +
    `𝕏 ${_esc(x)}\n` +
    `🌐 ${_esc(web)}\n\n` +
    '<b>Try:</b> /menu · /oracle &lt;question&gt; · /design cat logo · /check &lt;url&gt; · /dice 10 · /referral · /master\n' +
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
      // PNL template card first — branded token info (called when, Xs) over the
      // rotating HF background, crisp text. Only falls back to the AI image.
      let img = null, genTmp = '';
      if (call) {
        try {
          let bg = _brandBg.current();
          if (!bg) { const g = await _brandBg.generate(); bg = (g && g.buffer) || null; }
          const buf = await _card.renderPnlCard(call, { background: bg || undefined });
          if (buf && buf.length) {
            genTmp = _pathImg.join(_osImg.tmpdir(), 'shd-pnl-' + Date.now() + '.png');
            _fsImg.writeFileSync(genTmp, buf);
            img = genTmp;
          }
        } catch (e) { img = null; }
      }
      // Fall back to AI PNL tier image, then milestone image / random static pnl image
      if (!img) {
        try { if (_pnl.pnlImages) img = await _pnl.pnlImages.generatePnlImage(call || { symbol: key, peakMult: 1, curMult: 1 }); } catch (e) {}
      }
      if (!img) img = call ? (_pnl.milestoneImage(call.curMult || call.peakMult) || _pnl.pnlImage()) : _pnl.pnlImage();
      if (img) {
        const ok = await _core.sendPhoto(chatId, img, cap, btns);
        if (genTmp) { try { _fsImg.unlinkSync(genTmp); } catch (e) {} }
        if (ok) return;
      }
      return _send(t, chatId, cap);
    }
    if (data === 'hall:quit') { await answer('👋'); return; }
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
    // ── Temple master index (re-post the /master card) ──
    if (data === 'master' || data.startsWith('master:')) {
      return _send(t, chatId, _masterCard(), { reply_markup: _masterKeyboard() });
    }
    // ── Astro hub — pick a sign, ORACLE reads the horoscope + moon ──
    if (data.startsWith('astro:') && chatId) {
      const sign = String(data.slice(6)).trim();
      if (!sign || sign === 'pick') return _send(t, chatId, '🌙 <b>pick your sign…</b>\n\n<i>ORACLE reads your horoscope + moon phase — grounded, honest.</i>', { reply_markup: _astroKeyboard() });
      const cap = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
      await answer('');
      return _brain(t, chatId, cfg, 'ORACLE', 'Give my ' + cap + ' horoscope plus moon-phase guidance, grounded and honest, in 4 lines.', 4);
    }
    // ── News, rebooted ──
    if (data.startsWith('news:reboot') && chatId) {
      await answer('');
      let html = null;
      try { html = await require('./telegram-news').marketPulse(); } catch (e) {}
      return _send(t, chatId, html || '⚠️ Market data unavailable.');
    }
    // ── Music — compose a procedural track straight from the button ──
    if (data.startsWith('music:') && chatId) {
      await answer('🪷 composing…');
      return _music(t, chatId, data.slice(6));
    }
    // ── Game — native TG games, or the HTML5 game via sendGame ──
    if (data.startsWith('game:') && chatId) {
      const native = data.match(/^game:native:(dice|dart|ball|bowl|slot|footy)$/);
      if (native) { await answer(''); return _nativeGame(t, chatId, cfg, native[1], '10'); }
      const shortName = process.env.SHADDAI_GAME || 'sigilstorm';
      await answer('');
      try {
        const sent = await _core.sendGame(chatId, shortName);
        if (!sent) return _send(t, chatId, '⚠️ <b>' + _esc(shortName) + '</b> is not registered in BotFather yet (or can\u2019t play in this chat). Try <code>/dice 10</code> for a native roll.');
        return;
      } catch (e) { return _send(t, chatId, '⚠️ Game send failed — is <b>' + _esc(shortName) + '</b> registered in BotFather? Try <code>/dice 10</code>.'); }
    }
    // ── Arena — rematch / swap buttons from the match card ──
    if ((data.startsWith('arena:again:') || data.startsWith('arena:swap:')) && chatId) {
      const p = data.split(':');
      let a = String(p[2] || ''), b = String(p[3] || '');
      await answer('');
      if (!a || !b) return _send(t, chatId, '⚔️ Arena rematch needs two agents — try <code>/arena ORACLE vs ZEROX 10</code>');
      if (data.startsWith('arena:swap:')) { const tmp = a; a = b; b = tmp; }
      try {
        await _arenaCmd(t, chatId, a + ' vs ' + b + ' 10');
        return _send(t, chatId, '<i>↻ ' + (data.startsWith('arena:swap:') ? 'sides swapped — ' : 'same matchup — ') + a + ' vs ' + b + ' · fresh match every minute</i>');
      } catch (e) {
        return _send(t, chatId, '⚠️ Arena hiccup — try <code>/arena ' + a + ' vs ' + b + ' 10</code>');
      }
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
    let got = null; try { got = _com.award(String(chatId), 5, 'music'); } catch (e) {}
    if (got && got.ok) return _send(t, chatId, '🎵 Track sent! <b>+5 ⚡</b> sparks (now ' + got.sparks + ') — the music economy loves you. /quest to cash in your day.');
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
    [{ text: '🌙 Oracle', callback_data: 'hall:oracle' }, { text: '🐢 Turtle', callback_data: 'hall:turtle' }, { text: '⚡ Zerox', callback_data: 'hall:zerox' }],
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
  return '💠 <b>SHADDAI TEMPLE — free + paid</b>\n━━━━━━━━━━━━━━━\n\n<b>Free every day:</b>\n• /signals · /price · /rug · /news — live markets\n• /music — procedural tracks by TURTLE\n• /menu — browse the 7 sections\n• <b>3</b> deep agent answers (ORACLE, TURTLE, NEXUS…)\n\n<b>Paid onchain:</b>\n• Unlimited agent runs with real tools (/check, /design, /zerox)\n• Hire ZEROX on <a href="' + ref + '">Virtuals</a> — escrow-protected jobs\n• USDC via x402 pay-per-call rails\n\n<i>The free taste is real. The paid Temple is deep.</i>';
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

// ZEROX deep task — the PAID agentic inference loop (/api/zerox/task). The
// "hire ZEROX's brain" path: a real multi-agent LLM run over live tools, not the
// free cached /ask. Mirrors /agentic but against the settled task rail.
async function _zeroxTask(t, chatId, cfg, q) {
  if (!q) return _send(t, chatId, 'Usage: /zerox &lt;your question&gt; — fires ZEROX\u2019s full agentic brain (live tools). <code>/analysis</code> is the free read.');
  await _send(t, chatId, '💰 <b>ZEROX</b> is thinking with live tools…');
  try {
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/zerox/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-User-Id': String(chatId) },
      body: JSON.stringify({ agent: 'ZEROX', task: q }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) return _send(t, chatId, '🔒 <b>ZEROX</b> deep runs are paid (<code>/pay</code> to unlock). For the free read try <code>/analysis</code>.');
    const out = String(j.response || j.content || '').trim();
    if (!out) return _send(t, chatId, '⚠️ <b>ZEROX</b> returned nothing — try again.');
    const tools = (j.toolsUsed || []).slice(0, 4).join(', ');
    const price = (j.priceUsd != null ? ' · $' + j.priceUsd : '');
    return _send(t, chatId, '💰 <b>ZEROX · deep run</b>' + (tools ? ' · tools: ' + _esc(tools) : '') + '\n━━━━━━━━━━━━━━━\n\n' + _esc(out).slice(0, 3000) + '\n\n<i>paid' + _esc(price) + ' · ' + _esc(String(j.model || j.provider || 'engine')).slice(0, 50) + '</i>');
  } catch (e) { return _send(t, chatId, '⚠️ <b>ZEROX</b> engine is busy — try again shortly.'); }
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

// Direct FLUX image — real HuggingFace keys (rotating pool) with keyless fallback.
async function _imageCmd(t, chatId, cfg, prompt) {
  if (!prompt) return _send(t, chatId, 'Usage: /image &lt;what to create&gt;  e.g. <code>/image a shaddai temple floating over storm clouds</code>');
  await _send(t, chatId, '⬡ generating with FLUX…');
  try {
    const out = await _hf.generateSafe(prompt, { width: 1024, height: 1024 });
    const cap = '⬡ <b>SHADDAI · FLUX</b> · ' + _esc(prompt.slice(0, 60)) + '\n<i>/image to make another</i>';
    if (out.buffer) {
      const tmp = _pathImg.join(_osImg.tmpdir(), 'shaddai-img-' + Date.now() + '.png');
      _fsImg.writeFileSync(tmp, out.buffer);
      const ok = await _core.sendPhoto(chatId, tmp, cap);
      try { _fsImg.unlinkSync(tmp); } catch {}
      if (ok) return;
    }
    if (out.fallbackUrl) { const ok2 = await _core.sendPhoto(chatId, out.fallbackUrl, cap); if (ok2) return; }
    return _send(t, chatId, '⚠️ Image engine hiccup — try <code>/image a temple at dawn</code>');
  } catch (e) { return _send(t, chatId, '⚠️ FLUX is warming up — try again in a few seconds.'); }
}

// /card — SHADDAI Labs call proof card. Optional [prompt] → FLUX premium background
// behind the (always-crisp) text layer. No prompt → free SVG gradient theme.
async function _cardCmd(t, chatId, cfg, arg) {
  const parts = String(arg || '').split(/\s+/).filter(Boolean);
  const ticker = (parts[0] || '').toUpperCase();
  if (!ticker) return _send(t, chatId, 'Usage: /card <code>&lt;ticker&gt;</code> [prompt]  e.g. <code>/card SOLANDIER</code> or <code>/card SOLANDIER neon flames</code>');
  const call = _pnl._findCall ? _pnl._findCall(ticker) : null;
  if (!call) return _send(t, chatId, 'No tracked call found for <b>' + _esc(ticker) + '</b>. Try /lb for tracked calls.');
  const prompt = parts.slice(1).join(' ');
  await _send(t, chatId, prompt ? '⬡ rendering a premium FLUX card…' : '⬡ rendering your call card…');
  try {
    let bg = null;
    if (prompt) {
      const out = await _hf.generateSafe(prompt + ', dark SHADDAI signal card background, no text, no letters, no watermark', { width: 1024, height: 1280 });
      bg = out.buffer || null;
      if (!bg && out.fallbackUrl) { try { const r = await fetch(out.fallbackUrl); if (r.ok) bg = Buffer.from(await r.arrayBuffer()); } catch (e) {} }
    }
    const buf = await _card.render(call, { background: bg });
    const tmp = _pathImg.join(_osImg.tmpdir(), 'shaddai-card-' + Date.now() + '.png');
    _fsImg.writeFileSync(tmp, buf);
    const cap = '⬡ <b>SHADDAI LABS</b> · ' + _esc(ticker) + '\n<i>' + (prompt ? 'premium FLUX card' : 'call card') + ' · /card ' + _esc(ticker) + '</i>';
    const ok = await _core.sendPhoto(chatId, tmp, cap);
    try { _fsImg.unlinkSync(tmp); } catch {}
    if (ok) return;
    return _send(t, chatId, '⚠️ Could not send the card — try again.');
  } catch (e) { return _send(t, chatId, '⚠️ Card render failed — try <code>/card ' + _esc(ticker) + '</code>.'); }
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

// ── Community engine — games, gems, referral, family ───────────────────────
const _com = require('./lib/tg-community');
let _botUser = '';   // bot username cached from getMe (for referral deep links)
async function _botUsername() {
  if (_botUser) return _botUser;
  const fromEnv = process.env.SHADDAI_BOT_USERNAME || '';
  if (fromEnv) { _botUser = String(fromEnv).replace(/^@/, ''); return _botUser; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${_cfg().token}/getMe`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j && j.ok && j.result && j.result.username) _botUser = String(j.result.username);
  } catch (e) {}
  return _botUser;
}
function _templeAxiom() {
  return process.env.SHADDAI_AXIOM || 'Seven sovereign agents, one Temple: ORACLE researches, ZEROX monetizes, NEXUS builds, TURTLE creates, QUILL writes, PIKADON guards, SHADDAI decides. Free truth every day, deeper work onchain — and the signals don\u2019t lie.';
}
function _doors() {
  const L = (name, url) => '· <a href="' + _esc(url) + '">' + name + '</a>';
  return '⭐ GitHub: ' + L('IzzoSol', process.env.SHADDAI_GITHUB || 'https://github.com/IzzoSol') + '\n' +
    '𝕏 Shaddai: ' + L('@shaddaiai', process.env.SHADDAI_X_BRAND || 'https://x.com/shaddaiai') + '\n' +
    '𝕏 ZEROX: ' + L('@zerox007', process.env.SHADDAI_X_ZEROX || 'https://x.com/zerox007') + '\n' +
    '𝕏 IzzoSol: ' + L('@IzzoSol', process.env.SHADDAI_X || 'https://x.com/IzzoSol') + '\n' +
    '🌐 Web: ' + L('shaddai-g81x.onrender.com', process.env.SHADDAI_WEBSITE || 'https://shaddai-g81x.onrender.com') + '\n' +
    '🌿 Lounge: ' + L('EMERALDLOUNGE', process.env.SHADDAI_LOUNGE || 'https://t.me/EMERALDLOUNGE');
}
function _templeCard() {
  return '🛕 <b>THE SHADDAI TEMPLE</b>\n━━━━━━━━━━━━━━━\n\n' +
    '<b>The Axiom</b>\n' + _esc(_templeAxiom()) + '\n\n' +
    '<b>The Seven</b>\n' +
    'ORACLE · TURTLE · ZEROX · NEXUS · QUILL · PIKADON · SHADDAI\n\n' +
    '<b>Doors</b>\n' + _doors() + '\n\n' +
    '📖 Full index of everything → <code>/master</code>\n' +
    '🎮 /games · 🎁 /referral · 🏆 /leaderboard · 🧠 /council "should we launch?"';
}
// ── THE MASTER INDEX — every feature in one card ────────────────────────────
function _masterCard() {
  const vref = process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents';
  const gname = process.env.SHADDAI_GAME || 'sigilstorm';
  let out = '🛕 <b>SHADDAI TEMPLE — MASTER INDEX</b>\n' + _todayNice() + '\n━━━━━━━━━━━━━━━\n\n';
  out += '⬡ <b>The Axiom</b>\n' + _esc(_templeAxiom()) + '\n\n';
  out += '▾ <b>The Seven agents</b>\n' +
    '🦉 /oracle — research · trends · <b>astrology</b> (/astro)\n' +
    '🐢 /turtle — design · art (/design) · <b>music</b> (/music <i>lofi</i>)\n' +
    '💸 /zerox — signals · prices · paper trades · <b>market scan</b>\n' +
    '⚙️ /nexus — engineering · APIs · scale\n' +
    '✒️ /quill — copy · docs\n' +
    '🛡 /pikadon — URL checks (/check) · audits\n' +
    '⬡ /shaddai — strategy · final calls\n' +
    '🏛 /council — all seven weigh in · 🧠 /grok — Grok on the Temple\n\n';
  out += '▾ <b>Live intelligence</b>\n' +
    '📡 /signals — rug-filtered feed · 💹 /lb — PNL leaderboard\n' +
    '📰 /news — market pulse · 🗞 /headlines — oracle news wires\n' +
    '🌙 /astro — your horoscope + moon · 🔥 /hot — conviction heat-map\n\n';
  out += '▾ <b>Play & earn (paper sparks)</b>\n' +
    '🎮 /games — dice, darts, hoops, slots, footy (Telegram-verified)\n' +
    '⚔️ /arena <i>ORACLE vs ZEROX 10</i> — agents fight, you bet\n' +
    '🕹 /game — Telegram HTML5 game (' + _esc(gname) + ')\n' +
    '🎁 /referral — +' + _com.REF_INVITER_SPARKS + ' sparks & +' + _com.REF_BONUS_ASKS + ' free asks/friend\n' +
    '💰 /bonus — daily refill · 🎯 /quest — daily quests · 🏆 /leaderboard\n\n';
  out += '▾ <b>Builders</b>\n' +
    '🤝 <b>Virtuals</b> — hire ZEROX onchain: <a href="' + _esc(vref) + '">app.virtuals.io/acp/agents</a>\n' +
    '🔌 <b>MCP</b> — 30+ agent tools as one MCP server (see README): <code>npx shaddai-unified-mcp</code>\n' +
    '🛰 /family — every SHADDAI bot in one card\n\n';
  out += '▾ <b>Doors</b>\n' + _doors() + '\n\n' +
    '<i>Free daily · deeper onchain · the Temple answers.</i>';
  return out;
}
function _masterKeyboard() {
  return { inline_keyboard: [
    [{ text: '🦉 Oracle', callback_data: 'hall:oracle' }, { text: '🐢 Turtle', callback_data: 'hall:turtle' }, { text: '💸 Zerox', callback_data: 'hall:zerox' }],
    [{ text: '⚙️ Nexus', callback_data: 'hall:nexus' }, { text: '✒️ Quill', callback_data: 'hall:quill' }, { text: '🛡 Pikadon', callback_data: 'hall:pikadon' }],
    [{ text: '🌙 Astro', callback_data: 'astro:pick' }, { text: '📰 News', callback_data: 'news:reboot' }, { text: '🐢 Music', callback_data: 'music:lofi' }],
    [{ text: '⚔️ Arena', callback_data: 'arena:pick' }, { text: '💠 Pay', callback_data: 'hall:pay' }, { text: '🤝 Virtuals', callback_data: 'hall:virtuals' }],
  ]};
}
const _SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
function _astroKeyboard() {
  const rows = [];
  for (let i = 0; i < _SIGNS.length; i += 3) rows.push([]);
  _SIGNS.forEach((s, i) => { rows[Math.floor(i / 3)].push({ text: '🌙 ' + s, callback_data: 'astro:' + s.toLowerCase() }); });
  return { inline_keyboard: rows };
}
function _arenaKeyboard(seed) {
  const [a, b] = String(seed || 'SHADDAI:ZEROX').split(':');
  return { inline_keyboard: [[
    { text: '⚔️ Re-run ' + a + ' vs ' + b, callback_data: 'arena:again:' + a + ':' + b },
    { text: '🔄 Swap', callback_data: 'arena:swap:' + a + ':' + b },
  ]]};
}
function _musicPromptKeyboard() {
  return { inline_keyboard: [
    [{ text: '🐢 lofi', callback_data: 'music:lofi' }, { text: '🐢 synthwave', callback_data: 'music:synthwave' }, { text: '🐢 ambient', callback_data: 'music:ambient' }],
  ]};
}
function _gameKeyboard() {
  const g = process.env.SHADDAI_GAME || 'sigilstorm';
  return { inline_keyboard: [
    [{ text: '🕹 Play ' + g, callback_data: 'game:' + g }],
    [{ text: '🎲 Native dart', callback_data: 'game:native:dart' }],
  ]};
}
function _gameCmd(t, chatId, arg) {
  const g = String(arg || '').split(/\s+/)[0].toLowerCase() || (process.env.SHADDAI_GAME || 'sigilstorm');
  return _send(t, chatId,
    '🕹 <b>SHADDAI TELEGRAM GAMES</b>\n━━━━━━━━━━━━━━━\n\n' +
    'Native TG games (server-verified, cannot be rigged):\n<code>/dice 10</code> <code>/dart 10</code> <code>/ball 10</code> <code>/bowl 10</code> <code>/slot 10</code> <code>/footy 10</code>\n\n' +
    'HTML5 game (BotFather → /newgame → short name <b>' + _esc(g) + '</b>):\n/🕹 Play triggers it right here.\n\n' +
    '⚔️ Agent-vs-agent: <code>/arena ORACLE vs ZEROX 10</code>\n' +
    '🏀 Arcade battles: <code>/arcade basketball 10</code>\n\n' +
    '<b>Sparks:</b> /sparks · daily /bonus · earn via /quest /referral /music', _gameKeyboard());
}
async function _arenaCmd(t, chatId, arg) {
  const m = String(arg || '').match(/^([a-z]+)\s+(?:vs|v\.?|vs\.)\s+([a-z]+)(?:\s+(\d+))?$/i);
  if (!m) return _send(t, chatId, '⚔️ <b>AGENT ARENA</b>\nWatch two of the Seven fight a best-of-7 tilt — and bet on it.\n\n<code>/arena ORACLE vs ZEROX 10</code>\n\nPick any two: ORACLE · TURTLE · ZEROX · NEXUS · QUILL · PIKADON · SHADDAI\n\n<i>You bet on the first agent named. Win = 2× your sparks. 5–200 ⚡.</i>');
  const a = m[1].toUpperCase(), b = m[2].toUpperCase(), bet = parseInt(m[3], 10) || 10;
  const r = _com.arena(String(chatId), a, b, bet);
  if (!r.ok) return _send(t, chatId, '⚠️ ' + _esc(r.error || 'arena unavailable'));
  const A = _com.ARENA_BOTS[a], B = _com.ARENA_BOTS[b];
  let out = '⚔️ <b>' + a + ' vs ' + b + '</b>\n' + A.tag + ' <i>' + _esc(A.lore) + '</i>\n' + B.tag + ' <i>' + _esc(B.lore) + '</i>\n━━━━━━━━━━━━━━━\n\n';
  for (const rd of r.rounds) out += 'R' + rd.r + ' · ' + a + ' <b>' + rd[a] + '</b> — ' + b + ' <b>' + rd[b] + '</b>  ' + (rd.j === a ? A.tag : B.tag) + '\n';
  out += '\n<b>Final</b> — ' + a + ' <b>' + r.scoreA + '</b> · ' + b + ' <b>' + r.scoreB + '</b>\n';
  out += '🏆 <b>' + r.winner + ' wins!</b> ' + (r.won ? '✅ You bet on the winner!' : '❌ Your pick lost.') + '\n';
  out += (r.won ? '💰 +' + (r.payout - r.bet) + ' ⚡' : '💸 -' + r.bet + ' ⚡') + ' → wallet ' + r.sparks + ' ⚡\n\n<i>Re-run /arena ' + a + ' vs ' + b + ' ' + r.bet + ' — different match every minute.</i>';
  return _send(t, chatId, out, _arenaKeyboard(a + ':' + b));
}
async function _grokCmd(t, chatId, arg) {
  const q = String(arg || '').trim();
  if (!q) return _send(t, chatId, '🧠 <b>GROK ON THE TEMPLE</b>\nAsk Grok without leaving Telegram.\n\n<code>/grok your question here</code>\n\nRuns on your xAI key (env <code>XAI_API_KEY</code>) or AceDataCloud (<code>ACEDATACLOUD_API_TOKEN</code>, model <code>grok-3</code>).\n<i>Free alternative: /oracle &lt;question&gt;</i>');
  const xaiKey = process.env.XAI_API_KEY || '';
  const acedKey = process.env.ACEDATACLOUD_API_TOKEN || '';
  if (!xaiKey && !acedKey) return _send(t, chatId, '⚠️ No Grok key configured. Set <code>XAI_API_KEY</code> or <code>ACEDATACLOUD_API_TOKEN</code>, then /grok works. Free meanwhile: /oracle ' + _esc(q.slice(0, 40)));
  const base = xaiKey ? 'https://api.x.ai/v1' : 'https://api.acedata.cloud/v1';
  const key = xaiKey || acedKey;
  const model = xaiKey ? (process.env.XAI_MODEL || 'grok-3-fast') : (process.env.ACEDATA_GROK_MODEL || 'grok-3');
  await _send(t, chatId, '🧠 Grok is thinking…');
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: 'You are Grok on the SHADDAI Temple. Sharp, honest, concise — max ~300 words. Never invent numbers.' }, { role: 'user', content: q }], max_tokens: 420 }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await r.json().catch(() => ({}));
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) return _send(t, chatId, '⚠️ Grok said nothing useful (' + (r.status || 'network') + '). Try again.');
    return _send(t, chatId, '🧠 <b>GROK</b>\n' + _esc(text.slice(0, 3000)) + '\n\n<i>/grok on · built into the Temple</i>');
  } catch (e) {
    return _send(t, chatId, '⚠️ Grok request failed — net or key issue. /oracle still free.');
  }
}
function _gemsLine(g) {
  return '⚡ <b>Sparks:</b> ' + g.sparks + '  ·  🏆 <b>Score:</b> ' + g.score + '  ·  🔥 <b>Streak:</b> ' + g.streak + (g.referrals ? '  ·  🎁 <b>Invites:</b> ' + g.referrals : '');
}
function _gamesHub() {
  let out = '🎮 <b>SHADDAI ARCADE</b>\n━━━━━━━━━━━━━━━\n\n' +
    '<b>Native rolls</b> (Telegram-verified, cannot be rigged):\n' +
    '<code>/dice 10</code> — 🎲 6 = 3× · 4-5 = 1.9×\n' +
    '<code>/dart 10</code> <code>/ball 10</code> <code>/bowl 10</code> <code>/footy 10</code> — same tier\n' +
    '<code>/slot 10</code> — 🎰 64 = 8× jackpot · 43 = 3× · 22 = 1.5×\n\n' +
    '<b>Arcade battles</b> (CPU, agent-flavored):\n' +
    '<code>/arcade basketball 10</code> — win doubles up\n\n' +
    '<b>Economy:</b>\n' +
    '<code>/sparks</code> — balance + score  ·  <code>/sparks top</code> — league\n' +
    '<code>/bonus</code> — +' + _com.DAILY_BONUS + ' free sparks a day\n' +
    '<code>/referral</code> — your invite link (+' + _com.REF_INVITER_SPARKS + ' sparks +' + _com.REF_BONUS_ASKS + ' free brain-asks per friend)\n\n' +
    '<i>Paper sparks only — bragging rights, not money.</i>';
  return out;
}
function _familyCard() {
  const venv = process.env.VIRTUALS_AGENT_URL || 'https://app.virtuals.io/acp/agents';
  let out = '🛰 <b>THE SHADDAI FAMILY</b>\n━━━━━━━━━━━━━━━\n\n' +
    '🤖 <b>@ShaddaiTempleBot</b> — this bot. All 7 agents, signals, PNL, brain, games.\n' +
    '🐢 <b>Turtle Music Bot</b> — free procedural tracks (<code>/music</code> right here).\n' +
    '📡 <b>Signals channel</b> — rug-filtered alpha feed: <code>/signals</code>.\n' +
    '💸 <b>ZEROX on Virtuals</b> — hire the agent onchain: <a href="' + venv + '">app.virtuals.io/acp/agents</a>\n\n' +
    '<b>Play across the family:</b>\n' +
    '• /music — TURTLE composes\n' +
    '• /arcade /dice /slot — games with sparks\n' +
    '• /referral — invite friends, earn sparks + free brain-asks\n\n' +
    '<i>One Hall. Every agent. Every bot in the family.</i>';
  return out;
}
async function _questCmd(t, chatId, cfg) {
  const r = _com.quest(String(chatId));
  if (!r.ok) {
    if (r.already) return _send(t, chatId, '✅ Quest bank is empty — come back tomorrow.\nCurrent: ' + r.sparks + ' ⚡\n\n<i>Daily quests: /referral · roll with /dice · win anything</i>');
    if (r.message) return _send(t, chatId, '🎯 <b>DAILY QUESTS</b>\n━━━━━━━━━━━━━━━\n\nRoll the dice, win a game, or invite a friend — then run /quest to cash in.\n\n<b>Rewards:</b>\n🎲 place any bet  → <b>+10</b>\n🏆 win any game   → <b>+20</b>\n🎁 invite a friend → <b>+25</b>\n\nCurrent: ' + r.sparks + ' ⚡. Go play!');
    return _send(t, chatId, '⚠️ quests unavailable');
  }
  let out = '🎯 <b>QUESTS COMPLETE!</b> +<b>' + r.bonus + '</b> ⚡\n━━━━━━━━━━━━━━━\n';
  r.parts.forEach(p => { out += '\n✅ <b>' + _esc(p.label) + '</b> → +' + p.bonus; });
  return _send(t, chatId, out + '\n\nNow: ' + r.sparks + ' ⚡ · tomorrow comes a fresh bank');
}
async function _digestCmd(t, chatId, cfg) {
  let out = '📋 <b>HALL DAILY DIGEST</b>\n' + _todayNice() + '\n━━━━━━━━━━━━━━━\n\n';
  const s = _com.stats();
  out += '👥 <b>Community:</b> ' + s.users + ' souls · ' + s.plays + ' plays · ' + s.wins + ' wins\n' +
    '⚡ sparks in circulation · top scorer ' + s.topScore + ' pts\n\n';
  const top = _com.topPlayers(3);
  if (top.length) { out += '🏆 <b>Top scorers:</b>\n'; top.forEach((r, i) => { out += (i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉') + ' <b>' + _esc(r.uid.slice(0, 10)) + '</b> — ' + r.score.toLocaleString() + ' pts\n'; }); out += '\n'; }
  out += _signalsCard(cfg); // market pulse — top movers, sources, right here
  return _send(t, chatId, out.slice(0, 4000));
}
function _todayNice() {
  return new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
async function _convictionCmd(t, chatId, cfg, arg) {
  const parts = String(arg || '').split(/\s+/).filter(Boolean);
  let sym = '', amt = '';
  for (const w of parts) { if (/^[A-Z0-9$]+$/i.test(w)) { if (!sym) sym = w; else if (/^\d+$/.test(w) && !amt) amt = w; } else if (/^\d+$/.test(w) && !amt) amt = w; }
  if (!sym) return _send(t, chatId, '⚡ <b>CONVICTION</b>\nStake sparks on a call in the signals feed.\n\n<code>/conviction SOL 50</code> — burn 50 ⚡ into SOL\u2019s pool\n<code>/hot</code> — the most-backed calls right now\n\n<i>Sparks burn into the pool. Purely a social heat-map — no payback, paper only.</i>');
  const r = _com.convict(String(chatId), sym, parseInt(amt, 10) || 10);
  if (!r.ok) return _send(t, chatId, '⚠️ ' + _esc(r.error || 'can\u2019t vote right now'));
  return _send(t, chatId, '🔥 <b>CONVICTION:</b> <b>' + _esc(r.symbol) + '</b> +' + r.amount + ' ⚡\n' +
    'Pool now: <b>' + r.poolSparks + '</b> ⚡ · ' + r.votes + ' voters · your wallet: ' + r.sparks + ' ⚡\n\n<i>/hot to see the leaders</i>');
}
async function _hotCmd(t, chatId, cfg) {
  const rows = _com.hot(10);
  if (!rows.length) return _send(t, chatId, 'No conviction pools yet — back a signal with <code>/conviction SOL 50</code>');
  let out = '🔥 <b>HOT CALLS</b> — most conviction in the room\n━━━━━━━━━━━━━━━\n';
  rows.forEach((r, i) => { out += '\n' + (i + 1) + '. <b>' + _esc(r.symbol) + '</b> — ' + r.sparks.toLocaleString() + ' ⚡ · ' + r.votes + (r.votes === 1 ? ' voter' : ' voters'); });
  return _send(t, chatId, out + '\n\n<i>Back one: /conviction ' + _esc((rows[0] || {}).symbol || 'SOL') + ' 50</i>');
}
async function _leaderboardCmd(t, chatId, cfg, arg, update) {
  let out = '🏆 <b>SHADDAI LEADERBOARD</b>\n' + _todayNice() + '\n━━━━━━━━━━━━━━━\n\n';
  const sc = _com.topPlayers(5);
  out += '⚡ <b>Top scorers</b>\n';
  if (!sc.length) out += '  no plays yet — /games!\n';
  sc.forEach((r, i) => { out += ' ' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : charPodium(i)) + ' ' + _esc(r.uid.slice(0, 10)) + ' — ' + r.score.toLocaleString() + ' pts\n'; });
  const rf = _com.topReferrers(5);
  out += '\n🎁 <b>Top referrers</b>\n';
  if (!rf.length) out += '  no invites yet — /referral!\n';
  rf.forEach((r, i) => { out += ' ' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : charPodium(i)) + ' ' + _esc(r.uid.slice(0, 10)) + ' — ' + r.invites + (r.invites === 1 ? ' invite' : ' invites') + '\n'; });
  const ht = _com.hot(5);
  out += '\n🔥 <b>Hottest calls</b>\n';
  if (!ht.length) out += '  none yet — /conviction!\n';
  ht.forEach((r, i) => { out += ' · <b>' + _esc(r.symbol) + '</b> ' + r.sparks.toLocaleString() + ' ⚡\n'; });
  const m = _com.stats();
  out += '\n<code>' + m.users + ' souls · ' + m.plays + ' plays · ' + m.wins + ' wins</code>';
  const adminId = process.env.SHADDAI_ADMIN_ID || '';
  const poster = (update && update.message && update.message.from && update.message.from.id != null) ? String(update.message.from.id) : String(chatId);
  const wantBroadcast = /broadcast|channel|pin/i.test(String(arg || ''));
  if (wantBroadcast && adminId && poster === adminId) {
    await _send(t, chatId, '📢 Broadcasting to the channel + every chat in the family…');
    try { await _core.broadcast('🏆 <b>PUBLIC LEADERBOARD</b>\n' + out); } catch (e) {}
    return _send(t, chatId, '✅ Sent.');
  }
  if (wantBroadcast) return _send(t, chatId, '🔒 Broadcast requires the configured admin id.');
  return _send(t, chatId, out + '\n\n<i>Admin can /leaderboard broadcast · /digest for the full roundup</i>');
}
function charPodium(i) { return (i) + '.'; }
async function _nativeGame(t, chatId, cfg, game, arg) {
  const spec = _com.nativeSpec(game);
  if (!spec) return _send(t, chatId, 'Unknown game <b>' + _esc(game) + '</b> — try /dice /dart /ball /bowl /slot /footy');
  const bet = parseInt((arg || '').replace(/\D/g, ''), 10) || 10;
  await _send(t, chatId, spec.emoji + ' <b>' + spec.label + '</b> rolling for ' + bet + ' ⚡…');
  const value = await _core.sendDice(chatId, spec.emoji);
  if (value == null) return _send(t, chatId, '⚠️ Telegram dice is offline — try again shortly.');
  const r = _com.nativeResult(game, value);
  const s = _com.settleBet(String(chatId), bet, r);
  if (!s.ok) return _send(t, chatId, '⚠️ ' + _esc(s.error || 'can\u2019t play right now'));
  return _send(t, chatId,
    spec.emoji + ' <b>' + spec.label + '</b> → <b>' + r.roll + '</b>\n' +
    (r.win ? '🟢 <b>WIN</b> +' + s.payout + ' ⚡ · ' + _esc(r.detail) : '🔴 <b>LOSS</b> −' + bet + ' ⚡ · ' + _esc(r.detail)) + '\n\n' +
    _gemsLine(s) + '\n\n<i>/games for all games</i>');
}
async function _arcadeGame(t, chatId, cfg, game, arg) {
  const bet = parseInt(String(arg || '').replace(/\D/g, ''), 10) || 10;
  await _send(t, chatId, '🎮 Arcade vs CPU for ' + bet + ' ⚡…');
  const r = _com.arcadeResult(game || '', 'SHADDAI');
  const s = _com.settleBet(String(chatId), bet, r);
  if (!s.ok) return _send(t, chatId, '⚠️ ' + _esc(s.error || 'can\u2019t play right now'));
  return _send(t, chatId,
    (r.win ? '🟢 <b>WIN!</b> ' : '🔴 <b>LOSS</b> ') + _esc(r.detail) + '\n' +
    (r.win ? '<b>+</b>' + s.payout + ' ⚡' : '−' + bet + ' ⚡') + '\n\n' +
    _gemsLine(s) + '\n\n<i>/games for all games</i>');
}
async function _referralCmd(t, chatId, cfg, rawCode) {
  if (rawCode) {
    const res = _com.claim(String(chatId), rawCode);
    if (res.ok) return _send(t, chatId, '🎁 <b>Referral accepted!</b>\nYour host already earned a seat.\n+<b>' + _com.REF_REFEREE_SPARKS + '</b> ⚡ to you · host now has <b>' + res.inviterReferrers + '</b> invite(s)\n\nEnjoy the Hall:\n/menu · /games · /council "should we launch?"');
    return _send(t, chatId, '⚠️ ' + _esc(res.error || 'could not claim that code'));
  }
  const g = _com.sparks(String(chatId));
  if (!g) return _send(t, chatId, '⚠️ can\u2019t reach your profile right now');
  const uname = await _botUsername();
  const link = _com.linkFor(String(chatId), uname);
  return _send(t, chatId,
    '🎁 <b>YOUR REFERRAL KEY</b>\n━━━━━━━━━━━━━━━\n\n' +
    'Share this link — every friend who joins via it earns you <b>+' + _com.REF_INVITER_SPARKS + ' ⚡</b> and <b>+' + _com.REF_BONUS_ASKS + ' free deep brain-answers/day</b>\n\n' +
    '🔗 <a href="' + link + '">' + link + '</a>\n\n' +
    '🧾 <b>Your code:</b> <code>' + _esc(g.code || '-') + '</code>\n' +
    '👥 <b>Invites:</b> ' + g.referrals + '\n\n' +
    '<i>They start with ' + _com.START_SPARKS + ' sparks — and thank you first thing.</i>');
}
async function _refsCmd(t, chatId, cfg, arg) {
  const n = (parseInt(arg, 10) || 10);
  const rows = _com.topReferrers(n);
  if (!rows.length) return _send(t, chatId, 'No invites yet — be the first with <code>/referral</code>');
  let out = '🏆 <b>TOP REFERRERS</b>\n━━━━━━━━━━━━━━━\n';
  rows.forEach((r, i) => { out += '\n' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.') + ' <b>' + _esc(r.uid.slice(0, 10)) + '</b> — ' + r.invites + ' invite' + (r.invites === 1 ? '' : 's') + ' · ' + r.sparks + ' ⚡'; });
  return _send(t, chatId, out + '\n\n<i>Invite: /referral</i>');
}
async function _gemsCmd(t, chatId, cfg, arg) {
  if (/top|league|leader/i.test(arg || '')) {
    const rows = _com.topPlayers(10);
    if (!rows.length) return _send(t, chatId, 'No scores yet — start with <code>/games</code>');
    let out = '🏆 <b>TOP SCORERS</b>\n━━━━━━━━━━━━━━━\n';
    rows.forEach((r, i) => { out += '\n' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.') + ' <b>' + _esc(r.uid.slice(0, 10)) + '</b> — ' + r.score.toLocaleString() + ' pts · ' + r.wins + 'W'; });
    return _send(t, chatId, out + '\n\n<i>Play: /games</i>');
  }
  const g = _com.sparks(String(chatId));
  return _send(t, chatId, g ? _gemsLine(g) + '\n\n<i>Earn: /bonus · /referral · Win: /games</i>' : '⚠️ profile unavailable');
}
async function _bonusCmd(t, chatId, cfg) {
  const r = _com.dailyBonus(String(chatId));
  return _send(t, chatId, r.ok
    ? '💰 <b>+' + r.bonus + ' sparks!</b> Daily refill claimed.\nNow: ' + r.sparks + ' ⚡ — /games to spend them.'
    : '🔁 You already claimed today\u2019s +' + _com.DAILY_BONUS + ' ⚡. Come back tomorrow — or /referral for a big bonus now.');
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
    case 'start': {
      const img = require('./telegram-news')._botImage();
      const cap = _start(cfg);
      if (arg && arg.toLowerCase().startsWith('ref_')) { const res = await _referralCmd(t, chatId, cfg, arg.split(/\s+/)[0]); if (!(res && res.ok)) { /* claim failed — still welcome */ } else { return res; } }
      if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; }
      return _send(t, chatId, cap);
    }
    case 'help': return _send(t, chatId, _help());
    case 'price': case 'p': return _price(t, chatId, arg);
    case 'rug': case 'rugcheck': return _rug(t, chatId, arg);
    case 'ask': case 'shaddai': return _ask(t, chatId, cfg, arg);
    case 'learn': case 'teach': case 'ingest': return _auraLearn(t, chatId, cfg, arg);
    case 'boxes': case 'knowledge': return _auraBoxes(t, chatId, cfg, arg);
    case 'zerox': return arg ? _zeroxTask(t, chatId, cfg, arg) : _ask(t, chatId, cfg, 'Give a concise crypto market analysis + sentiment right now for the overall market. 5 lines max.', 'ZEROX');
    case 'analysis': return _ask(t, chatId, cfg, 'Give a concise crypto market analysis + sentiment right now for: ' + (arg || 'the overall market') + '. 5 lines max.', 'ZEROX');
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
      if (!arg) return _send(t, chatId, '🌙 <b>pick your sign…</b>\n\n<i>Tap a sign — ORACLE reads your horoscope + moon phase, grounded and honest.</i>', { reply_markup: _astroKeyboard() });
      const sign = (arg || '').split(/\s+/).slice(0, 2).join(' ') || 'today';
      return _brain(t, chatId, cfg, 'ORACLE', 'Give my ' + sign + ' horoscope plus moon-phase guidance, grounded and honest, in 4 lines.', 4);
    }
    case 'council': case 'synthesize': case 'board': return _council(t, chatId, cfg, arg);
    case 'design': case 'turtleimg': case 'art': return _turtleDesign(t, chatId, cfg, arg);
    case 'image': case 'dream': case 'generate': case 'pic': return _imageCmd(t, chatId, cfg, arg);
    case 'check': case 'url': case 'verify': case 'scan': return _checkUrl(t, chatId, cfg, arg);
    case 'virtuals': case 'acp': case 'marketplace': return _send(t, chatId, _virtualsCard());
    case 'pay': case 'upgrade': case 'pro': case 'pricing': return _send(t, chatId, _payCard());
    case 'menu': case 'halls': case 'zones': return _send(t, chatId, _hallMenuCard(), { reply_markup: _hallMenuKeyboard() });
    case 'temple': case 'about': case 'axiom': case 'creed': case 'doctrine': return _send(t, chatId, _templeCard());
    case 'master': case 'hub': case 'index': case 'everything': return _send(t, chatId, _masterCard(), { reply_markup: _masterKeyboard() });
    case 'arena': case 'fight': case 'duel': case 'battle2': return _arenaCmd(t, chatId, arg);
    case 'grok': case 'xai': case 'grokai': return _grokCmd(t, chatId, arg);
    case 'game': case 'tggame': case 'playx': return _gameCmd(t, chatId, arg);

    // ── Community — family, games, gems, referral ──
    case 'family': case 'family2': return _send(t, chatId, _familyCard());
    case 'games': case 'arcade2': case 'gamex': return _send(t, chatId, _gamesHub());
    case 'sparks': case 'spark': case 'gems': return _gemsCmd(t, chatId, cfg, arg);
    case 'bonus': case 'refill': case 'daily': return _bonusCmd(t, chatId, cfg);
    case 'referral': case 'invite': case 'key': return _referralCmd(t, chatId, cfg, arg.split(' ')[0].match(/^ref_/i) ? arg : '');
    case 'refs': case 'invites': return _refsCmd(t, chatId, cfg, arg);
    case 'dice': case 'flip': case 'roll': return _nativeGame(t, chatId, cfg, 'dice', arg);
    case 'dart': case 'arrows': return _nativeGame(t, chatId, cfg, 'dart', arg);
    case 'ball': case 'hoops': return _nativeGame(t, chatId, cfg, 'ball', arg);
    case 'bowl': case 'bowling': return _nativeGame(t, chatId, cfg, 'bowl', arg);
    case 'slot': case 'reels': case 'jackpot': return _nativeGame(t, chatId, cfg, 'slot', arg);
    case 'footy': case 'soccer': case 'football2': return _nativeGame(t, chatId, cfg, 'footy', arg);
    case 'arcade': case 'arcadex': case 'battle': {
      const parts = String(arg || '').split(/\s+/).filter(Boolean);
      const gnames = { basketball: 1, football: 1, dodgeball: 1, bball: 'basketball', soccer: 'football', dodge: 'dodgeball', 'sigil-storm': 1 };
      let game = '', rest = arg;
      for (const w of parts) { if (gnames[w.toLowerCase()]) { game = gnames[w.toLowerCase()] === 1 ? w.toLowerCase() : gnames[w.toLowerCase()]; rest = parts.filter(x => x !== w).join(' '); break; } }
      return _arcadeGame(t, chatId, cfg, game, rest);
    }
    case 'quest': case 'dailyquest': case 'quests': return _questCmd(t, chatId, cfg);
    case 'digest': case 'roundup': case 'digest2': return _digestCmd(t, chatId, cfg);
    case 'conviction': case 'stake': case 'back': case 'convict': case 'convicted': return _convictionCmd(t, chatId, cfg, arg);
    case 'hot': case 'heat': case 'hotcalls': case 'heatmap': return _hotCmd(t, chatId, cfg);
    case 'leaderboard': case 'tops': case 'scoreboard': case 'podium': return _leaderboardCmd(t, chatId, cfg, arg, update);

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

    // /pnl <ticker> — PNL card for one token (template card first, AI image, milestone, text always)
    case 'pnl': {
      if (!arg) return _send(t, chatId, 'Usage: /pnl <code>&lt;ticker&gt;</code>  e.g. <code>/pnl SOLANDIER</code>');
      const cap = _pnl.pnlForToken(arg);
      if (!cap) return _send(t, chatId, 'No tracked call found for <b>' + _esc(arg) + '</b>. Try /lb for the leaderboard.');
      const call = _pnl._findCall ? _pnl._findCall(arg) : null;
      // PNL template card over the HF background (crisp text: called when, Xs)
      if (call) {
        try {
          let bg = _brandBg.current();
          if (!bg) { const g = await _brandBg.generate(); bg = (g && g.buffer) || null; }
          const buf = await _card.renderPnlCard(call, { background: bg || undefined });
          if (buf && buf.length) {
            const pnlTmp = _pathImg.join(_osImg.tmpdir(), 'shd-pnl-' + Date.now() + '.png');
            _fsImg.writeFileSync(pnlTmp, buf);
            const ok = await _core.sendPhoto(chatId, pnlTmp, cap);
            try { _fsImg.unlinkSync(pnlTmp); } catch (e) {}
            if (ok) return;
          }
        } catch (e) {}
      }
      // try milestone image first, then saved image, then random pnl image
      const msImg = call ? _pnl.milestoneImage(call.curMult || call.peakMult) : null;
      if (msImg) { const ok = await _core.sendPhoto(chatId, msImg, cap); if (ok) return; }
      const saved = _pnl.savedPnlImage(arg);
      if (saved) { const ok = await _core.sendPhoto(chatId, saved, cap); if (ok) return; }
      return _send(t, chatId, cap);
    }

    case 'card': case 'proofcard': case 'callcard': return _cardCmd(t, chatId, cfg, arg);

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
    { command: 'temple',  description: 'The Axiom + doors — GitHub, X, website, lounge' },
    { command: 'help',    description: 'All commands list' },
    { command: 'active',  description: 'Live calls right now — not rugged, sorted by gain' },
    { command: 'lb',      description: 'Leaderboard — top calls ranked by Xs' },
    { command: 'last25',  description: 'Last 25 calls with live PNLs' },
    { command: 'last50',  description: 'Last 50 calls with live PNLs' },
    { command: 'last100', description: 'Last 100 calls with live PNLs' },
    { command: 'pnl',     description: 'PNL card for a token  e.g. /pnl PORK' },
    { command: 'card',    description: 'Shareable call card  e.g. /card PORK [prompt for premium art]' },
    { command: 'held',    description: 'Conviction holds — calls still green' },
    { command: 'stats',   description: 'Hit-rate + best calls scorecard' },
    { command: 'dist',    description: 'Performance distribution breakdown' },
    { command: 'price',   description: 'Live DEX price  e.g. /price BONK' },
    { command: 'rug',     description: 'Rug-check a Solana mint' },
    { command: 'preset',  description: 'View/switch signal filter presets' },
    { command: 'ask',     description: 'Ask a SHADDAI agent anything (answers from your boxes first)' },
    { command: 'learn',   description: 'Teach an agent from a URL  e.g. /learn https://… [box]' },
    { command: 'boxes',   description: 'Your AURA knowledge boxes' },
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
    { command: 'image',   description: 'FLUX image — real models, direct  e.g. /image a temple at dawn' },
    { command: 'check',   description: 'PIKADON URL safety check  e.g. /check https://…' },
    { command: 'virtuals', description: 'Hire ZEROX onchain via Virtuals' },
    { command: 'pay',     description: 'Free vs paid tiers — unlock the full Hall' },
    { command: 'games',   description: 'Arcade hub — dice, slots, CPU battles, sparks' },
    { command: 'dice',    description: '🎲 native roll  e.g. /dice 10 (sparks)' },
    { command: 'dart',    description: '🎯 native darts, sparks at stake' },
    { command: 'ball',    description: '🏀 native hoops, sparks at stake' },
    { command: 'bowl',    description: '🎳 native bowling, sparks at stake' },
    { command: 'slot',    description: '🎰 native slots — 64 = 8× jackpot' },
    { command: 'footy',   description: '⚽ native football, sparks at stake' },
    { command: 'arcade',  description: 'CPU battles  e.g. /arcade basketball 20' },
    { command: 'quest',   description: 'Daily quest bank — +10 roll, +20 win, +25 invite' },
    { command: 'digest',  description: 'Hall daily roundup — community + market pulse' },
    { command: 'sparks',  description: 'Your spark balance + score · /sparks top = league' },
    { command: 'leaderboard', description: 'Community podium - scorers, referrers, hot calls' },
    { command: 'conviction', description: 'Stake sparks on a signal call  e.g. /conviction SOL 50' },
    { command: 'hot',    description: 'The most-backed calls in the room' },
    { command: 'bonus',   description: 'Daily +25 free sparks refill' },
    { command: 'referral', description: 'Invite friends — earn sparks + free brain-asks' },
    { command: 'refs',    description: 'Top referrers leaderboard' },
    { command: 'family',  description: 'Every SHADDAI bot on one card' },
    { command: 'master',  description: 'Everything — agents, games, MCP, links' },
    { command: 'arena',   description: 'Agent-vs-agent duels, bet sparks' },
    { command: 'grok',    description: 'Ask Grok right here' },
    { command: 'game',    description: 'Telegram-native games hub' },
    { command: 'music',   description: 'Free procedural track — earns +5 sparks' },
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

// Standalone entrypoint: `node telegram-bot.js` starts long-polling.
// The server path calls startTelegramBot() itself, so this guard is a no-op there.
if (require.main === module) { startTelegramBot(); }
