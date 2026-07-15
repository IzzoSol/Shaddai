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
// pump.fun graduated ("bonded") coins — unofficial public API, best-effort.
const PF_COINS = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false';

const _seen = new Set();          // trending token addresses already posted (dedupe)
const _seenBond = new Set();      // bonded mints already posted (dedupe)
let _bondSeeded = false;          // first bonded poll only SEEDS (no dump of existing graduates)
const _SEEN_CAP = 4000;
// DexScreener free tiers: ~60 req/min (boosts/profiles), ~300 req/min (tokens/pairs).
// We stay far under: 1 boosts call + a capped number of token lookups per poll.
const _ENRICH_CAP = 18;           // max token-detail fetches per trending poll (rate safety)

function _cfg() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    channel: process.env.TELEGRAM_CHANNEL || '',
    chains: (process.env.TG_SIGNALS_CHAINS || 'solana').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    interval: Math.max(60000, parseInt(process.env.TG_SIGNALS_INTERVAL || '300000', 10) || 300000),
    minLiq: parseFloat(process.env.TG_SIGNALS_MIN_LIQ || '15000') || 15000,
    maxPer: Math.max(1, parseInt(process.env.TG_SIGNALS_MAX_PER || '3', 10) || 3),
    // "as soon as a token bonds" — pump.fun graduation detector (fires fast, cheap poll)
    bonded: (process.env.TG_BONDED || 'true').toLowerCase() !== 'false',
    bondedInterval: Math.max(60000, parseInt(process.env.TG_BONDED_INTERVAL || '120000', 10) || 120000),
    bondedMax: Math.max(1, parseInt(process.env.TG_BONDED_MAX || '5', 10) || 5),
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

  let posted = 0, enrich = 0;
  for (const item of boosts) {
    if (posted >= cfg.maxPer) break;
    if (enrich >= _ENRICH_CAP) break;              // rate safety: cap token-detail fetches per poll
    const chain = String(item.chainId || '').toLowerCase();
    const addr = item.tokenAddress;
    if (!addr || !cfg.chains.includes(chain)) continue;
    if (_seen.has(addr)) continue;

    // enrich → best pair for this token
    let pair = null;
    enrich++;
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

// ── BONDED (pump.fun graduation) — "as soon as a token bonds" ──────────────
function _bondCard(c) {
  const name = _esc(c.name || 'Token');
  const sym = _esc(c.symbol || '');
  const mc = c.usd_market_cap ? _fmtUsd(c.usd_market_cap) : (c.market_cap ? _fmtUsd(c.market_cap) : '');
  const mint = c.mint || c.address || '';
  const url = mint ? 'https://pump.fun/' + mint : '';
  return (
    `🎓 <b>BONDED</b> · pump.fun\n` +
    `<b>${name}</b> ($${sym}) just completed its bonding curve — now live on Raydium.\n` +
    (mc ? `💰 Market cap: <b>${mc}</b>\n` : '') +
    (url ? `🔗 <a href="${_esc(url)}">View on pump.fun</a>\n` : '') +
    (mint ? `<code>${_esc(mint)}</code>\n` : '') +
    `\n<i>Not financial advice. Always rug-check before aping.</i>`
  );
}
async function _pollBonded() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.channel || !cfg.bonded) return;
  let coins;
  try {
    const r = await fetch(PF_COINS, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (SHADDAI-signals)' } });
    if (!r.ok) { if (!_bondSeeded) console.warn('[tg-signals] pump.fun bonded poll HTTP', r.status, '(unofficial API — may be geo/CF-blocked)'); return; }
    coins = await r.json();
  } catch (e) { return; }
  const list = Array.isArray(coins) ? coins : (coins && coins.coins) || [];
  let posted = 0;
  for (const c of list) {
    if (posted >= cfg.bondedMax) break;
    const mint = c && (c.mint || c.address);
    if (!mint) continue;
    const bonded = c.complete === true || !!c.raydium_pool || c.graduated === true;
    if (!bonded) continue;
    if (_seenBond.has(mint)) continue;
    _seenBond.add(mint);
    if (_bondSeeded) { const ok = await _send(cfg, _bondCard(c)); if (ok) posted++; }  // first poll only seeds
    if (_seenBond.size > _SEEN_CAP) { const f = _seenBond.values().next().value; _seenBond.delete(f); }
  }
  _bondSeeded = true;   // subsequent polls only post NEWLY-bonded tokens
}

let _timer = null, _bondTimer = null;
function startTelegramSignals() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.channel) {
    console.log('[tg-signals] disabled — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL to enable the public DEX signals feed.');
    return;
  }
  if (_timer) return;
  console.log(`[tg-signals] ENABLED → ${cfg.channel} · chains=${cfg.chains.join(',')} · trending/${Math.round(cfg.interval / 1000)}s · bonded=${cfg.bonded ? Math.round(cfg.bondedInterval / 1000) + 's' : 'off'}`);
  // trending feed (DexScreener boosts) — first run after a short delay so it doesn't fight boot
  setTimeout(() => { _pollOnce().catch(() => {}); }, 8000);
  _timer = setInterval(() => { _pollOnce().catch(() => {}); }, cfg.interval);
  if (_timer.unref) _timer.unref();
  // bonded feed (pump.fun graduations) — seed first (no dump), then post only NEW bonds
  if (cfg.bonded) {
    setTimeout(() => { _pollBonded().catch(() => {}); }, 4000);
    _bondTimer = setInterval(() => { _pollBonded().catch(() => {}); }, cfg.bondedInterval);
    if (_bondTimer.unref) _bondTimer.unref();
  }
}

module.exports = { startTelegramSignals, _pollOnce, _pollBonded };
