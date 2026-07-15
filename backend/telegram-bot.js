/* ══════════════════════════════════════════════════════════════════════════
   telegram-bot.js — the interactive SHADDAI Telegram bot (long-polling).
   Commands: /start /help /price /bonded /rug /signals /agents /ask /gm
   Reuses the FREE DexScreener + pump.fun + rugcheck.xyz APIs and the app's own
   LLM (/api/model/chat) for /ask.

   SECURITY: token read from env only (TELEGRAM_BOT_TOKEN). No secrets in code.
   Fail-safe: no-op if the token is unset; never throws; never blocks boot.
   Long-polling (getUpdates) so it works with zero webhook/URL config.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const DS_SEARCH = (q) => `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
const PF_COINS = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=40&sort=created_timestamp&order=DESC&includeNsfw=false';
const RUGCHECK = (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;
const _core = require('./telegram-core');   // shared chat registry + broadcast
const _pnl = require('./telegram-pnl');      // hit-rate + best-calls scorecard

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

// ── command handlers ───────────────────────────────────────────────────────
function _help() {
  return (
    '⬡ <b>SHADDAI BOT</b> — commands:\n\n' +
    '/price <code>&lt;symbol|address&gt;</code> — live DEX price, liquidity & volume\n' +
    '/bonded — latest pump.fun tokens that just bonded\n' +
    '/rug <code>&lt;mint&gt;</code> — rug-check a Solana token (rugcheck.xyz)\n' +
    '/ask <code>&lt;question&gt;</code> — ask a SHADDAI agent anything\n' +
    '/zerox <code>&lt;asset&gt;</code> — ZEROX market analysis + sentiment\n' +
    '/news — live market pulse (mcap, BTC/ETH/SOL, trending)\n' +
    '/stats <code>[week|month]</code> — hit-rate + best calls scorecard\n' +
    '/pnl <code>[token]</code> — PNL card (all calls, or one token) + image\n' +
    '/dist — performance distribution (1-2x / 2-5x / 5-10x / 10x+)\n' +
    '/signals — the free live signals channel\n' +
    '/agents — what SHADDAI is\n' +
    '/gm — gm ☀️\n\n' +
    '<i>Not financial advice. Always DYOR.</i>'
  );
}
function _start(cfg) {
  const web = process.env.SHADDAI_WEBSITE || 'https://shaddai-g81x.onrender.com';
  const gh = process.env.SHADDAI_GITHUB || 'https://github.com/IzzoSol';
  const x = process.env.SHADDAI_X || 'https://x.com/IzzoSol';
  const lounge = process.env.SHADDAI_LOUNGE || 'https://t.me/EMERALDLOUNGE';
  return (
    '⬡ <b>Welcome to SHADDAI</b> — Sovereign AI Agents\n' +
    '━━━━━━━━━━━━━━━\n' +
    'Forge AI agents that <b>live, work &amp; earn</b> across a dashboard, a 2D pixel world and a 3D world — intelligence you <b>own</b>, on open rails (Solana · x402).\n\n' +
    'This channel posts <b>live, rug-filtered crypto signals</b> — bonded launches, new pools & trending — each scored for safety (LP-lock, holders, top-holder %) with real <b>PNL tracking</b> (Xs, hit-rate, milestone wins). The bot also answers with real agents.\n\n' +
    '🤖 The council: SHADDAI · ZEROX · ORACLE · NEXUS · TURTLE · QUILL · PIKADON\n\n' +
    `📡 Free signals: ${_esc(cfg.channel || '@ShaddaiLabs')}\n` +
    `🌿 Emerald Vine lounge: ${_esc(lounge)}\n` +
    `⭐ Star the GitHub (giveaways): ${_esc(gh)}\n` +
    `𝕏 ${_esc(x)}  (@IzzoSol)\n` +
    `🌐 ${_esc(web)}\n\n` +
    '<b>Try:</b> /price SOL · /bonded · /dist · /pnl · /rug &lt;mint&gt; · /zerox BTC\n' +
    'Type /help for the full command list.'
  );
}

async function _price(token, chatId, q) {
  if (!q) return _send(token, chatId, 'Usage: /price <symbol or token address>  e.g. <code>/price SOL</code>');
  await _send(token, chatId, '🔎 Looking up <b>' + _esc(q) + '</b>…');
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

async function _bonded(token, chatId) {
  try {
    const r = await fetch(PF_COINS, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (SHADDAI)' } });
    const coins = await r.json();
    const list = (Array.isArray(coins) ? coins : (coins && coins.coins) || []).filter(c => c && (c.complete === true || c.raydium_pool)).slice(0, 5);
    if (!list.length) return _send(token, chatId, 'No freshly-bonded tokens right now — check back soon. 🎓');
    const body = list.map(c => `🎓 <b>${_esc(c.name || '')}</b> ($${_esc(c.symbol || '')}) — ${c.usd_market_cap ? _fmtUsd(c.usd_market_cap) : ''}\n<a href="https://pump.fun/${_esc(c.mint || '')}">pump.fun</a>`).join('\n\n');
    return _send(token, chatId, '🎓 <b>Recently bonded</b>\n\n' + body + '\n\n<i>Not financial advice. Rug-check first.</i>');
  } catch (e) { return _send(token, chatId, '⚠️ pump.fun feed unavailable right now.'); }
}

async function _rug(token, chatId, mint) {
  if (!mint) return _send(token, chatId, 'Usage: /rug <token mint address>');
  await _send(token, chatId, '🛡 Rug-checking…');
  try {
    const r = await fetch(RUGCHECK(mint.trim()));
    if (!r.ok) return _send(token, chatId, '⚠️ rugcheck.xyz had no report for that mint (or is rate-limited). DYOR.');
    const j = await r.json();
    const score = (j && (j.score_normalised != null ? j.score_normalised : j.score));
    const risks = (j && j.risks) || [];
    const rl = risks.slice(0, 5).map(x => `• ${_esc(x.name || x.description || '')}${x.level ? ' (' + _esc(x.level) + ')' : ''}`).join('\n');
    return _send(token, chatId,
      `🛡 <b>Rug Check</b>\n` +
      (score != null ? `Risk score: <b>${_esc(String(score))}</b>\n` : '') +
      (rl ? `\n<b>Flags:</b>\n${rl}\n` : '\nNo major flags reported.\n') +
      `\n<i>Automated check — not a guarantee. Always DYOR.</i>`);
  } catch (e) { return _send(token, chatId, '⚠️ Rug check failed — try again.'); }
}

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
    return _send(token, chatId, out ? _esc(out).slice(0, 3800) : '⚠️ No answer — the engine may be busy.');
  } catch (e) { return _send(token, chatId, '⚠️ Agents are busy — try again shortly, or use the dashboard.'); }
}

async function _handle(cfg, update) {
  const msg = update.message || update.channel_post; if (!msg) return;
  try { _core.addChat(msg.chat); } catch (e) {}   // register every chat for broadcast
  const chatId = msg.chat && msg.chat.id; const text = (msg.text || '').trim();
  if (!chatId || !text) return;
  const m = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) { return; }   // ignore non-commands (avoid spamming groups)
  const cmd = m[1].toLowerCase(); const arg = (m[2] || '').trim(); const t = cfg.token;
  switch (cmd) {
    case 'start': return _send(t, chatId, _start(cfg));
    case 'help': return _send(t, chatId, _help());
    case 'price': case 'p': return _price(t, chatId, arg);
    case 'bonded': case 'bonds': return _bonded(t, chatId);
    case 'rug': case 'rugcheck': return _rug(t, chatId, arg);
    case 'ask': case 'shaddai': return _ask(t, chatId, cfg, arg);
    case 'zerox': case 'analysis': return _ask(t, chatId, cfg, 'Give a concise crypto market analysis + sentiment right now for: ' + (arg || 'the overall market') + '. 5 lines max.', 'ZEROX');
    case 'news': case 'pulse': { const html = await require('./telegram-news').marketPulse(); return _send(t, chatId, html || '⚠️ Market data unavailable right now.'); }
    case 'stats': case 'scorecard': { const per = /week/i.test(arg) ? 'week' : /month/i.test(arg) ? 'month' : 'day'; return _send(t, chatId, _pnl.stats(per)); }
    case 'pnl': {
      let cap;
      if (arg) { cap = _pnl.pnlForToken(arg); if (!cap) return _send(t, chatId, 'No tracked call found for <b>' + _esc(arg) + '</b>. Try /pnl for the full scoreboard.'); }
      else cap = _pnl.pnlCaption();
      const img = _pnl.pnlImage(); if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; } return _send(t, chatId, cap);
    }
    case 'dist': case 'distribution': case 'performance': { const cap = _pnl.distribution(); const img = _pnl.pnlImage(); if (img) { const ok = await _core.sendPhoto(chatId, img, cap); if (ok) return; } return _send(t, chatId, cap); }
    case 'signals': return _send(t, chatId, cfg.channel ? `📡 Free live signals: ${_esc(cfg.channel)}\nBonded tokens, trending pairs & more.` : 'Signals channel not configured yet.');
    case 'agents': return _send(t, chatId, '⬡ <b>SHADDAI</b> is an AI agent empire — forge agents, chain workflows, walk a 3D/2D world, trade in the Bazaar.\n🌐 https://shaddai-g81x.onrender.com');
    case 'about': case 'project': case 'info': return _send(t, chatId, require('./telegram-news').projectPromo());
    case 'gm': return _send(t, chatId, 'gm ☀️ — go forge something.');
    default: return _send(t, chatId, 'Unknown command. Try /help');
  }
}

async function _getUpdates(token, offset) {
  const r = await fetch(TG(token, 'getUpdates') + `?timeout=30&offset=${offset}`, { signal: AbortSignal.timeout(40000) });
  const j = await r.json();
  return (j && j.result) || [];
}

async function _registerCommands(token) {
  try {
    await fetch(TG(token, 'setMyCommands'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [
        { command: 'start', description: 'Welcome + links' },
        { command: 'help', description: 'List all commands' },
        { command: 'price', description: 'Live DEX price of a token' },
        { command: 'bonded', description: 'Latest pump.fun tokens that bonded' },
        { command: 'rug', description: 'Rug-check a Solana mint' },
        { command: 'ask', description: 'Ask a SHADDAI agent' },
        { command: 'zerox', description: 'ZEROX market analysis + sentiment' },
        { command: 'news', description: 'Live market pulse' },
        { command: 'stats', description: 'Hit-rate + best calls scorecard' },
        { command: 'pnl', description: 'PNL card (all or one token)' },
        { command: 'dist', description: 'Performance distribution + top' },
        { command: 'signals', description: 'Free live signals channel' },
        { command: 'agents', description: 'What is SHADDAI' },
        { command: 'about', description: 'The SHADDAI project + links' },
        { command: 'gm', description: 'gm ☀️' },
      ] }),
    });
  } catch (e) { /* non-fatal */ }
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
  if (!cfg.token) { console.log('[tg-bot] disabled — set TELEGRAM_BOT_TOKEN to enable the interactive bot.'); return; }
  if (_running) return;
  _running = true;
  console.log('[tg-bot] ENABLED — long-polling for commands (/start /help /price /bonded /rug /ask /signals /agents /gm)');
  _loop().catch(e => { console.warn('[tg-bot] loop ended:', e && e.message); _running = false; });
}
function stopTelegramBot() { _running = false; }

module.exports = { startTelegramBot, stopTelegramBot };
