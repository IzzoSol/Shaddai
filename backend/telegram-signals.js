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

const core = require('./telegram-core');   // shared broadcast (channel + every chat the bot is in)
const pnl = require('./telegram-pnl');     // call performance tracker (entry → Xs)
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
  const cc = core.getConfig();   // dashboard-editable filter params + feed toggles
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    channel: process.env.TELEGRAM_CHANNEL || '',
    chains: String(cc.chains || 'solana').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    minLiq: Number(cc.minLiq) || 0,
    minVol24h: Number(cc.minVol24h) || 0,
    minFdv: Number(cc.minFdv) || 0,
    maxFdv: Number(cc.maxFdv) || 0,
    maxPer: Math.max(1, parseInt(cc.maxPer, 10) || 3),
    signals: cc.signals !== false,
    bonded: cc.bonded !== false,
    newpools: cc.newpools !== false,
    trending: cc.trending !== false,
    rugFilter: cc.rugFilter !== false,
    rugMinScore: Number(cc.rugMinScore) || 50,   // require safety score ≥ this (owner: >50%)
    bullishOnly: cc.bullishOnly !== false,
    // poll cadences (env-tunable)
    interval: Math.max(60000, parseInt(process.env.TG_SIGNALS_INTERVAL || '300000', 10) || 300000),
    bondedInterval: Math.max(60000, parseInt(process.env.TG_BONDED_INTERVAL || '120000', 10) || 120000),
    geckoInterval: Math.max(60000, parseInt(process.env.TG_GECKO_INTERVAL || '120000', 10) || 120000),
  };
}
// filters a token's FDV/liq/vol against the current params (0 = disabled)
function _passesFdv(cfg, fdv) { if (cfg.minFdv && fdv < cfg.minFdv) return false; if (cfg.maxFdv && fdv > cfg.maxFdv) return false; return true; }

// rugcheck.xyz (Solana only, free) — safety gate + label. Returns {risky, label, checked}.
// Fail-open: if the API errors/rate-limits, we DON'T block the call (checked=false).
async function _rugCheck(mint) {
  if (!mint) return { risky: false, label: '', checked: false };
  try {
    const r = await fetch('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report/summary', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { risky: false, label: '', checked: false };
    const j = await r.json();
    const risks = (j && j.risks) || [];
    const danger = risks.some(x => String(x.level || '').toLowerCase() === 'danger');
    const score = (j && (j.score_normalised != null ? j.score_normalised : j.score));
    const top = risks.slice(0, 2).map(x => x.name).filter(Boolean).join(', ');
    const label = danger
      ? `⚠️ <b>RUGCHECK: HIGH RISK</b>${top ? ' — ' + _esc(top) : ''}`
      : `🛡 RugCheck: ${score != null ? 'score ' + _esc(String(score)) : 'no major flags'}`;
    return { risky: danger, label, checked: true, score };
  } catch (e) { return { risky: false, label: '', checked: false }; }
}
// extract a Solana mint from a GeckoTerminal base_token id like "solana_<mint>"
function _mintFromGecko(p) { try { const id = p.relationships && p.relationships.base_token && p.relationships.base_token.data && p.relationships.base_token.data.id; if (id && id.startsWith('solana_')) return id.slice(7); } catch (e) {} return null; }

// ── RUG SCORE (Solana, rugcheck.xyz full report) — 0..100 ─────────────────────
// Owner params: LP must be 100% locked; top holder < 30% (unless LP locked);
// danger/warn flags penalise. Borderline coins still pass but score lower.
// Fail-open: if the API errors, return a neutral score so good calls aren't lost.
async function _rugScore(mint) {
  if (!mint) return { checked: false, score: 60, label: '' };
  try {
    const r = await fetch('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report', { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { checked: false, score: 60, label: '' };
    const j = await r.json();
    let score = 100; const notes = [];
    // LP locked %
    let lp = 0;
    try { const m = (j.markets || [])[0]; const L = m && m.lp; lp = Number((L && (L.lpLockedPct != null ? L.lpLockedPct : L.lpLocked)) || 0); } catch (e) {}
    if (lp >= 99) notes.push('🔒 LP 100%');
    else if (lp >= 50) { score -= 25; notes.push('🔓 LP ' + lp.toFixed(0) + '%'); }
    else { score -= 55; notes.push('🔓 LP unlocked'); }
    // top holder concentration
    let topPct = 0;
    try { const th = j.topHolders || []; const nonLp = th.filter(h => !h.insider && !(h.owner && /lp|amm|pool/i.test(String(h.owner)))); topPct = (nonLp[0] && Number(nonLp[0].pct)) || (th[0] && Number(th[0].pct)) || 0; } catch (e) {}
    if (topPct > 30) { score -= (lp >= 99 ? 8 : 25); notes.push('🐋 top ' + topPct.toFixed(0) + '%'); }
    // risk flags
    const risks = j.risks || [];
    const danger = risks.filter(x => String(x.level || '').toLowerCase() === 'danger').length;
    const warn = risks.filter(x => String(x.level || '').toLowerCase() === 'warn').length;
    score -= danger * 25 + warn * 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const badge = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    return { checked: true, score, lp, topPct, label: `🛡 Safety ${badge} <b>${score}/100</b>${notes.length ? '  ·  ' + notes.join(' ') : ''}` };
  } catch (e) { return { checked: false, score: 60, label: '' }; }
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

// clean 24h change chip — just a dot + %, no cheesy labels
function _chgStr(pct) {
  if (pct == null || pct === '') return '';
  const v = Number(pct); if (!isFinite(v)) return '';
  const e = v >= 100 ? '🔥' : v > 0 ? '🟢' : v === 0 ? '⚪' : '🔴';
  return e + ' ' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
}

function _signalCard(chain, pair) {
  const b = pair.baseToken || {};
  const sym = _esc(b.symbol || 'TOKEN');
  const nm = _esc(b.name || '');
  const price = pair.priceUsd ? '$' + Number(pair.priceUsd).toPrecision(3) : 'n/a';
  const mc = _fmtUsd(pair.fdv || pair.marketCap || 0);
  const liq = _fmtUsd(pair.liquidity && pair.liquidity.usd);
  const vol = _fmtUsd(pair.volume && pair.volume.h24);
  const chg = _chgStr(pair.priceChange && pair.priceChange.h24);
  const url = _esc(pair.url || '');
  const ca = _esc((b.address) || '');
  return (
    `⚡️ <b>$${sym}</b>${nm && nm.toLowerCase() !== sym.toLowerCase() ? '  ' + nm : ''}\n` +
    `${_esc(chain.toUpperCase())}${chg ? '   ' + chg : ''}\n` +
    `━━━━━━━━━━━━━\n` +
    `💰 MC <b>${mc}</b>   💧 Liq <b>${liq}</b>\n` +
    `📊 Vol <b>${vol}</b>   💵 <b>${_esc(price)}</b>\n` +
    (ca ? `\n<code>${ca}</code>\n` : '') +
    (url ? `🔗 <a href="${url}">Chart</a>` : '') +
    `\n\n<i>NFA · DYOR</i>`
  );
}

async function _pollOnce() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.signals) return;   // disabled or trending feed toggled off
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
      pair = pairs.filter(p => (p.liquidity && p.liquidity.usd || 0) >= cfg.minLiq
                            && (p.volume && p.volume.h24 || 0) >= cfg.minVol24h
                            && _passesFdv(cfg, p.fdv || p.marketCap || 0))
                  .sort((a, b) => (b.liquidity.usd || 0) - (a.liquidity.usd || 0))[0];
    } catch (e) { continue; }
    if (!pair) { _seen.add(addr); continue; }   // mark seen even if below threshold (don't recheck forever)
    if (cfg.bullishOnly && pair.priceChange && Number(pair.priceChange.h24) < -10) { _seen.add(addr); continue; }   // skip bearish (funnel)
    if (core.wasAlerted(addr)) { _seen.add(addr); continue; }   // GLOBAL de-dupe — already called on another feed

    const ok = (await core.broadcast(_signalCard(chain, pair))) > 0;
    _seen.add(addr);
    if (ok) { core.markAlerted(addr); posted++; try { pnl.recordCall({ source: 'trending', chain, mint: addr, name: pair.baseToken && pair.baseToken.name, symbol: pair.baseToken && pair.baseToken.symbol, entryFdv: Number(pair.fdv || pair.marketCap || 0), entryPrice: Number(pair.priceUsd || 0) }); } catch (e) {} }
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
    `🎓 <b>$${sym || name}</b>${sym && name && name !== sym ? '  ' + name : ''} — BONDED\n` +
    `Graduated → Raydium\n` +
    `━━━━━━━━━━━━━\n` +
    (mc ? `💰 MC <b>${mc}</b>\n` : '') +
    (mint ? `\n<code>${_esc(mint)}</code>\n` : '') +
    (url ? `🔗 <a href="${_esc(url)}">pump.fun</a>` : '') +
    `\n\n<i>NFA · rug-check first</i>`
  );
}
async function _pollBonded() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.bonded) return;
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
    if (_bondSeeded) {   // first poll only seeds
      if (core.wasAlerted(mint)) continue;   // GLOBAL de-dupe — already called on another feed
      let card = _bondCard(c);
      if (cfg.rugFilter) { const rs = await _rugScore(mint); if (rs.checked && rs.score < cfg.rugMinScore) continue; if (rs.label) card += '\n' + rs.label; }
      const ok = (await core.broadcast(card)) > 0;
      if (ok) { core.markAlerted(mint); posted++; try { pnl.recordCall({ source: 'bonded', chain: 'solana', mint, name: c.name, symbol: c.symbol, entryFdv: Number(c.usd_market_cap || c.market_cap || 0), entryPrice: 0 }); } catch (e) {} }
    }
    if (_seenBond.size > _SEEN_CAP) { const f = _seenBond.values().next().value; _seenBond.delete(f); }
  }
  _bondSeeded = true;   // subsequent polls only post NEWLY-bonded tokens
}

// ── GECKOTERMINAL (free, no key) — brand-new pools + trending pools ──────────
const GT_NET = { solana: 'solana', sol: 'solana', base: 'base', eth: 'eth', ethereum: 'eth', bsc: 'bsc', bnb: 'bsc', polygon: 'polygon_pos', arbitrum: 'arbitrum', avax: 'avax' };
const GT = (net, kind, page) => `https://api.geckoterminal.com/api/v2/networks/${net}/${kind}?page=${page || 1}`;
const _seenPool = new Set();
let _poolSeeded = false;

function _poolCard(net, kind, a, addr) {
  const name = _esc(a.name || 'Pool');
  const price = a.base_token_price_usd ? '$' + Number(a.base_token_price_usd).toPrecision(4) : 'n/a';
  const liq = _fmtUsd(a.reserve_in_usd);
  const vol = _fmtUsd(a.volume_usd && a.volume_usd.h24);
  const fdv = a.fdv_usd ? _fmtUsd(a.fdv_usd) : '';
  const url = a.address ? `https://www.geckoterminal.com/${net}/pools/${a.address}` : '';
  const tag = kind === 'new_pools' ? '🆕 NEW' : '🔥 HOT';
  const chg = _chgStr(a.price_change_percentage && (a.price_change_percentage.h24 || a.price_change_percentage.h1));
  return (
    `${tag}  <b>${name}</b>\n` +
    `${_esc(net.toUpperCase())}${chg ? '   ' + chg : ''}\n` +
    `━━━━━━━━━━━━━\n` +
    (fdv ? `💰 MC <b>${fdv}</b>   ` : '') + `💧 Liq <b>${liq}</b>\n` +
    `📊 Vol <b>${vol}</b>   💵 <b>${_esc(price)}</b>\n` +
    (addr ? `\n<code>${_esc(addr)}</code>\n` : '') +
    (url ? `🔗 <a href="${_esc(url)}">Chart</a>` : '') +
    `\n\n<i>NFA · rug-check first</i>`
  );
}
async function _pollGecko() {
  const cfg = _cfg();
  if (!cfg.token || (!cfg.newpools && !cfg.trending)) return;
  const kinds = []; if (cfg.newpools) kinds.push('new_pools'); if (cfg.trending) kinds.push('trending_pools');
  let posted = 0;
  for (const chain of cfg.chains) {
    const net = GT_NET[chain]; if (!net) continue;
    for (const kind of kinds) {
      if (posted >= cfg.maxPer) break;
      let data;
      try { const r = await fetch(GT(net, kind, 1), { headers: { accept: 'application/json' } }); if (!r.ok) continue; const j = await r.json(); data = (j && j.data) || []; } catch (e) { continue; }
      for (const p of data) {
        if (posted >= cfg.maxPer) break;
        const a = p && p.attributes; const id = p && p.id; if (!a || !id) continue;
        if (_seenPool.has(id)) continue;
        const liq = Number(a.reserve_in_usd) || 0, vol = Number(a.volume_usd && a.volume_usd.h24) || 0, fdv = Number(a.fdv_usd) || 0;
        _seenPool.add(id);
        if (liq < cfg.minLiq || vol < cfg.minVol24h || !_passesFdv(cfg, fdv)) continue;
        const _chg = Number(a.price_change_percentage && a.price_change_percentage.h24);
        if (cfg.bullishOnly && isFinite(_chg) && _chg < -10) continue;   // skip bearish (funnel)
        const _bt = (p.relationships && p.relationships.base_token && p.relationships.base_token.data && p.relationships.base_token.data.id) || '';
        const _taddr = _bt.indexOf('_') >= 0 ? _bt.slice(_bt.indexOf('_') + 1) : _bt;
        const _dk = _taddr || id;   // dedupe key: token address if present, else the pool id (always present)
        if (core.wasAlerted(_dk)) continue;   // GLOBAL persistent de-dupe (fixes GeckoTerminal repeats)
        if (_poolSeeded) {
          let card = _poolCard(net, kind, a, _taddr);
          if (cfg.rugFilter && net === 'solana') { const mint = _mintFromGecko(p); if (mint) { const rs = await _rugScore(mint); if (rs.checked && rs.score < cfg.rugMinScore) continue; if (rs.label) card += '\n' + rs.label; } }
          const ok = (await core.broadcast(card)) > 0;
          if (ok) { core.markAlerted(_dk); posted++; try { pnl.recordCall({ source: kind, chain: net, mint: _taddr || _dk, name: a.name, entryFdv: fdv, entryPrice: Number(a.base_token_price_usd) || 0 }); } catch (e) {} }
        }
        if (_seenPool.size > _SEEN_CAP) { const f = _seenPool.values().next().value; _seenPool.delete(f); }
      }
    }
  }
  _poolSeeded = true;   // first poll only seeds — then post only NEW pools
}

let _timer = null, _bondTimer = null, _geckoTimer = null;
function startTelegramSignals() {
  const cfg = _cfg();
  if (!cfg.token) {
    console.log('[tg-signals] disabled — set TELEGRAM_BOT_TOKEN to enable the DEX signals feed (broadcasts to the channel + every chat the bot is in).');
    return;
  }
  if (_timer) return;
  if (!core.acquireBroadcastLock()) { console.log('[tg-signals] another instance owns broadcasting — signals not started here (prevents duplicate sends).'); return; }
  console.log(`[tg-signals] ENABLED → ${cfg.channel || '(no channel — DM chats only)'} · chains=${cfg.chains.join(',')} · trending/${Math.round(cfg.interval / 1000)}s · bonded=${cfg.bonded ? Math.round(cfg.bondedInterval / 1000) + 's' : 'off'}`);
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
  // GeckoTerminal new/trending pools — seed first, then post only NEW pools
  setTimeout(() => { _pollGecko().catch(() => {}); }, 6000);
  _geckoTimer = setInterval(() => { _pollGecko().catch(() => {}); }, cfg.geckoInterval);
  if (_geckoTimer.unref) _geckoTimer.unref();
}

module.exports = { startTelegramSignals, _pollOnce, _pollBonded, _pollGecko };
