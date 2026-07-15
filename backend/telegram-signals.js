/* ══════════════════════════════════════════════════════════════════════════
   telegram-signals.js — public DEX signals feed.
   Polls the FREE DexScreener API for trending/boosted tokens and posts fresh
   "signals" to a public Telegram channel via the Telegram Bot API.

   SECURITY: reads ALL secrets from the environment — nothing hardcoded.
     TELEGRAM_BOT_TOKEN   the bot token from @BotFather (SECRET — Render env only)
     TELEGRAM_CHANNEL     the public channel, e.g. "@ShaddaiSignals" (bot must be admin)
   Optional tuning:
     TG_SIGNALS_CHAINS    comma list, default "solana"        (solana,base,ethereum,…)
     TG_SIGNALS_INTERVAL  ms between polls, default 300000 (5m)
     TG_SIGNALS_MIN_LIQ   min pair liquidity USD, default 15000
     TG_SIGNALS_MAX_PER   max posts per poll, default 3

   Fail-safe: if the token/channel are unset, the worker is a NO-OP (never throws,
   never blocks server boot). Not financial advice — a disclaimer footer is added.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TG_API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const DS_BOOSTS = 'https://api.dexscreener.com/token-boosts/latest/v1';
const DS_TOKEN = (chain, addr) => `https://api.dexscreener.com/latest/dex/tokens/${addr}`;

const _seen = new Set();          // token addresses already posted (dedupe)
const _SEEN_CAP = 4000;

function _cfg() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    channel: process.env.TELEGRAM_CHANNEL || '',
    chains: (process.env.TG_SIGNALS_CHAINS || 'solana').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    interval: Math.max(60000, parseInt(process.env.TG_SIGNALS_INTERVAL || '300000', 10) || 300000),
    minLiq: parseFloat(process.env.TG_SIGNALS_MIN_LIQ || '15000') || 15000,
    maxPer: Math.max(1, parseInt(process.env.TG_SIGNALS_MAX_PER || '3', 10) || 3),
  };
}

function _fmtUsd(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}

// escape for Telegram HTML parse mode
function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function _send(cfg, html) {
  try {
    const r = await fetch(TG_API(cfg.token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.channel, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); console.warn('[tg-signals] send failed', r.status, t.slice(0, 160)); return false; }
    return true;
  } catch (e) { console.warn('[tg-signals] send error', e && e.message); return false; }
}

function _signalCard(chain, pair) {
  const b = pair.baseToken || {};
  const name = _esc(b.name || b.symbol || 'Token');
  const sym = _esc(b.symbol || '');
  const price = pair.priceUsd ? '$' + Number(pair.priceUsd).toPrecision(4) : 'n/a';
  const liq = _fmtUsd(pair.liquidity && pair.liquidity.usd);
  const vol = _fmtUsd(pair.volume && pair.volume.h24);
  const ch = pair.priceChange && pair.priceChange.h24 != null ? (Number(pair.priceChange.h24) >= 0 ? '🟢 +' : '🔴 ') + Number(pair.priceChange.h24).toFixed(1) + '%' : '';
  const url = _esc(pair.url || '');
  return (
    `⚡ <b>SHADDAI SIGNAL</b> · ${_esc(chain.toUpperCase())}\n` +
    `<b>${name}</b> ($${sym})  ${ch}\n` +
    `💵 Price: <b>${_esc(price)}</b>\n` +
    `💧 Liq: <b>${liq}</b>   📊 24h Vol: <b>${vol}</b>\n` +
    (url ? `🔗 <a href="${url}">Chart on DexScreener</a>\n` : '') +
    `\n<i>Not financial advice. DYOR.</i>`
  );
}

async function _pollOnce() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.channel) return;   // disabled until configured
  let boosts;
  try {
    const r = await fetch(DS_BOOSTS);
    if (!r.ok) return;
    boosts = await r.json();
  } catch (e) { return; }
  if (!Array.isArray(boosts)) return;

  let posted = 0;
  for (const item of boosts) {
    if (posted >= cfg.maxPer) break;
    const chain = String(item.chainId || '').toLowerCase();
    const addr = item.tokenAddress;
    if (!addr || !cfg.chains.includes(chain)) continue;
    if (_seen.has(addr)) continue;

    // enrich → best pair for this token
    let pair = null;
    try {
      const r = await fetch(DS_TOKEN(chain, addr));
      if (!r.ok) continue;
      const j = await r.json();
      const pairs = (j && j.pairs) || [];
      pair = pairs.filter(p => (p.liquidity && p.liquidity.usd) >= cfg.minLiq)
                  .sort((a, b) => (b.liquidity.usd || 0) - (a.liquidity.usd || 0))[0];
    } catch (e) { continue; }
    if (!pair) { _seen.add(addr); continue; }   // mark seen even if below threshold (don't recheck forever)

    const ok = await _send(cfg, _signalCard(chain, pair));
    _seen.add(addr);
    if (ok) posted++;
    if (_seen.size > _SEEN_CAP) { const first = _seen.values().next().value; _seen.delete(first); }
  }
}

let _timer = null;
function startTelegramSignals() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.channel) {
    console.log('[tg-signals] disabled — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL to enable the public DEX signals feed.');
    return;
  }
  if (_timer) return;
  console.log(`[tg-signals] ENABLED → ${cfg.channel} · chains=${cfg.chains.join(',')} · every ${Math.round(cfg.interval / 1000)}s`);
  // first run after a short delay so it doesn't fight server boot
  setTimeout(() => { _pollOnce().catch(() => {}); }, 8000);
  _timer = setInterval(() => { _pollOnce().catch(() => {}); }, cfg.interval);
  if (_timer.unref) _timer.unref();
}

module.exports = { startTelegramSignals, _pollOnce };
