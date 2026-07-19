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
// log the full feature fingerprint of a posted call → token-db (powers ZEROX winner/loser analysis)
function _logFeatures(o) { try { require('./token-db').recordOutcome(o); } catch (e) { console.warn('[token-db] _logFeatures error:', e.message); } }
const DS_BOOSTS = 'https://api.dexscreener.com/token-boosts/latest/v1';
const DS_TOKEN = (chain, addr) => `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
// pump.fun graduated ("bonded") coins — unofficial public API, best-effort.
const PF_COINS = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false';
// advanced pump.fun API — richer graduated data (holders, snipers, dev%, ATH, bonding progress)
const PF_GRADUATED = 'https://advanced-api-v2.pump.fun/coins/graduated?limit=50';
const PF_HEADERS = { accept: 'application/json', origin: 'https://pump.fun', 'user-agent': 'Mozilla/5.0 (SHADDAI-signals)' };

const _seen = new Set();          // trending token addresses already posted (dedupe)
const _seenBond = new Set();      // bonded mints already posted (dedupe)
const _boostMap = new Map();      // tokenAddress → { amount, totalAmount, description, links } — DexScreener paid boosts
let _bondSeeded = false;          // first bonded poll only SEEDS (no dump of existing graduates)
let _trendSeeded = false;         // first trending poll only SEEDS (prevents re-post spree on restart)
const _SEEN_CAP = 4000;
// DexScreener free tiers: ~60 req/min (boosts/profiles), ~300 req/min (tokens/pairs).
// Stay FAR under: 1 boosts call + a capped number of token lookups per poll.
const _ENRICH_CAP = 10;           // max token-detail fetches per trending poll (rate safety — was 18, lowered)

// look up DexScreener boost info for a token address — returns null if not boosted
function _boostInfo(addr) { return _boostMap.get(addr) || null; }

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
    rugMinScore: Number(cc.rugMinScore) || 60,
    minHolders: Number(cc.minHolders) || 40,
    minLiqPct: Number(cc.minLiqPct) || 3,
    bullishOnly: cc.bullishOnly !== false,
    // social requirements
    requireWebsite: cc.requireWebsite === true,
    requireTwitter: cc.requireTwitter === true,
    requireSocial: cc.requireSocial === true,
    requireLocked: cc.requireLocked === true,
    minSocialScore: Number(cc.minSocialScore) || 0,
    // holder/sniper requirements
    maxTop10Pct: Number(cc.maxTop10Pct) || 100,
    maxBundlerPct: Number(cc.maxBundlerPct) || 12,
    requireNoSnipers: cc.requireNoSnipers === true,
    requireNoBundlers: cc.requireNoBundlers === true,
    // poll cadences (env-tunable) — balanced for free tier rate limits
    interval: Math.max(120000, parseInt(process.env.TG_SIGNALS_INTERVAL || '600000', 10) || 600000),      // 10 min default (DexScreener: ~60 req/min free)
    bondedInterval: Math.max(60000, parseInt(process.env.TG_BONDED_INTERVAL || '180000', 10) || 180000), // 3 min default (pump.fun: generous)
    geckoInterval: Math.max(120000, parseInt(process.env.TG_GECKO_INTERVAL || '300000', 10) || 300000),  // 5 min default (GeckoTerminal: generous)
  };
}
// FDV gate — min + max (was min-only; max was deferred to _overCap but that allowed billion-FDV leaks)
function _passesFdv(cfg, fdv) {
  if (cfg.minFdv && fdv < cfg.minFdv) return false;
  if (cfg.maxFdv && fdv > cfg.maxFdv) return false;
  return true;
}
// over the max-mcap cap? allowed only if it's a premium-safety coin (fits all params)
function _overCap(cfg, fdv, rs) { return cfg.maxFdv && fdv > cfg.maxFdv && !(rs && rs.checked && rs.score >= 80); }
// liquidity must "match" the token — at least minLiqPct% of mcap (thin book vs big mcap = red flag)
function _liqMatches(cfg, liq, fdv) { if (!fdv || !cfg.minLiqPct) return true; return (Number(liq) || 0) >= (cfg.minLiqPct / 100) * fdv; }
// holders gate — must clear the minimum when we have the data
function _holdersOk(cfg, rs) { return !(rs && rs.checked && rs.holders && rs.holders < cfg.minHolders); }
// top10 concentration gate — must be under the max
function _top10Ok(cfg, rs) { return !(rs && rs.checked && rs.top10Pct && cfg.maxTop10Pct && rs.top10Pct > cfg.maxTop10Pct); }
// locked LP gate — LP must be ≥80% locked (with grace: new pools re-checked next cycle)
function _lpLockedOk(cfg, rs) {
  if (!cfg.requireLocked) return true;
  if (!rs || !rs.checked) return false;   // no data = reject
  return rs.lp >= 80;
}
// BIG-bundler gate — a small bundle is fine, but a bundle holding more than
// maxBundlerPct (default 12%) of supply will dump. Reject only the big ones.
function _bundlersOk(cfg, rs) {
  if (!rs || !rs.checked || !cfg.maxBundlerPct) return true;
  return !(rs.hasBundlers && (rs.bundlePct || 0) > cfg.maxBundlerPct);
}
// sniper/bundler gate — reject if snipers+bundlers combined ≥ 10% of holders
function _snipersOk(cfg, rs) {
  if (!rs || !rs.checked) return true;  // fail-open if no data
  if (!cfg.maxSnipersPct) return true;
  const total = rs.holders || 100;
  const bad = (rs.hasSnipers ? 1 : 0) + (rs.hasBundlers ? 1 : 0);
  const pct = total > 0 ? (bad / total * 100) : 0;
  return pct < cfg.maxSnipersPct;
}

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

// ── HOLDER CONVICTION SCORE (0-100) — separate bullish signal dimension ──────
// Evaluates: holder count, whale conviction, distribution quality, whale stability
// High scores = strong holder base with conviction = more bullish
function _holderConvictionScore(topHolders, totalHolders, cfg) {
  const th = topHolders || [];
  const result = { score: 0, label: '', signals: [] };

  // ── SIGNAL 1: HOLDER COUNT (0-25 pts) ──────────────────────────────────
  const hc = totalHolders || th.length;
  let holderPts = 0;
  if (hc >= 200) holderPts = 25;
  else if (hc >= 100) holderPts = 20;
  else if (hc >= 50) holderPts = 15;
  else if (hc >= 20) holderPts = 10;
  else if (hc >= 10) holderPts = 5;
  result.score += holderPts;
  if (hc >= 100) result.signals.push('👥 ' + hc + ' holders');

  // ── SIGNAL 2: WHALE CONVICTION (0-30 pts) ─────────────────────────────
  // Large single holder = early believer with skin in the game
  const topHolder = th[0] || {};
  const topPct = Number(topHolder.pct) || 0;
  let whalePts = 0;
  if (topPct >= 50) { whalePts = 30; result.signals.push('🐋 whale ' + topPct.toFixed(1) + '%'); }
  else if (topPct >= 30) { whalePts = 20; result.signals.push('🐋 whale ' + topPct.toFixed(1) + '%'); }
  else if (topPct >= 15) { whalePts = 10; result.signals.push('🐋 whale ' + topPct.toFixed(1) + '%'); }
  result.score += whalePts;

  // ── SIGNAL 3: HOLDER DISTRIBUTION (0-25 pts) ──────────────────────────
  // Even spread = healthier token ecosystem
  const top10Pct = th.slice(0, 10).reduce((sum, h) => sum + (Number(h.pct) || 0), 0);
  let distPts = 0;
  if (top10Pct < 70) distPts = 25;
  else if (top10Pct < 85) distPts = 15;
  else distPts = 5;
  result.score += distPts;
  result.signals.push('📊 top10 ' + top10Pct.toFixed(1) + '%');

  // ── SIGNAL 4: WHALE STABILITY (0-20 pts) ──────────────────────────────
  // Clean/round amounts = real holders; bot-like amounts = dump risk
  const amounts = th.slice(0, 10).map(h => Number(h.amount) || 0).filter(a => a > 0);
  let stableWhales = 0;
  for (const amt of amounts) {
    // Real holders tend to have round-ish amounts (not exact bot multiples)
    const isRound = amt % 1000000 === 0 || amt % 500000 === 0 || amt % 100000 === 0;
    const isBot = amounts.filter(a => Math.abs(a - amt) / Math.max(amt, 1) < 0.05).length >= 3;
    if (isRound && !isBot) stableWhales++;
  }
  let stablePts = 0;
  if (stableWhales >= 5) stablePts = 20;
  else if (stableWhales >= 3) stablePts = 15;
  else if (stableWhales >= 1) stablePts = 10;
  result.score += stablePts;
  if (stableWhales >= 3) result.signals.push('💎 ' + stableWhales + ' stable whales');

  result.score = Math.min(100, result.score);
  result.label = result.signals.length ? result.signals.join(' · ') : '';
  return result;
}

// ── RUG SCORE (Solana, rugcheck.xyz full report) — 0..100 ─────────────────────
// Owner params: LP must be 100% locked; top holder < 30% (unless LP locked);
// danger/warn flags penalise. Borderline coins still pass but score lower.
// Fail-open: if the API errors, return a neutral score so good calls aren't lost.
// SNIPER/BUNDLER DETECTION: top10 concentration, insider flags, similar amounts
async function _rugScore(mint) {
  if (!mint) return { checked: false, score: 60, label: '', top10Pct: 0, hasSnipers: false, hasBundlers: false };
  try {
    const r = await fetch('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report', { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { checked: false, score: 60, label: '', top10Pct: 0, hasSnipers: false, hasBundlers: false };
    const j = await r.json();
    let score = 100; const notes = [];
    // LP locked %
    let lp = 0;
    try { const m = (j.markets || [])[0]; const L = m && m.lp; lp = Number((L && (L.lpLockedPct != null ? L.lpLockedPct : L.lpLocked)) || 0); } catch (e) {}
    if (lp >= 99) notes.push('🔒 LP 100%');
    else if (lp >= 50) { score -= 25; notes.push('🔓 LP ' + lp.toFixed(0) + '%'); }
    else { score -= 55; notes.push('🔓 LP unlocked'); }
    // top holder concentration — CRITICAL for anti-sniper
    let topPct = 0;
    let top10Pct = 0;
    let hasSnipers = false;
    let hasBundlers = false;
    let bundlePct = 0;        // combined supply % held by a detected bundle cluster
    let lockedHeldPct = 0;    // % of top holders that are LP/lock/burn (NOT dumping whales)
    let insiders = 0;
    try {
      const th = j.topHolders || [];
      // Lock/burn/LP holders aren't whales that dump. A project that BURNS or LOCKS a big
      // chunk of supply shows up as "high top-holder concentration" but is actually safer.
      // Exclude those from the concentration metrics so they don't trip the whale gate.
      const BURN_RE = /1nc1nerator|^1{20,}$|dead0000|burn/i;
      const LOCK_RE = /lp|amm|pool|lock|burn|vault|market|escrow|stream|raydium|meteora|orca/i;
      const isLocked = (h) => { const o = String(h.owner || h.address || ''); return BURN_RE.test(o) || LOCK_RE.test(o); };
      insiders = th.filter(h => h.insider).length;
      const ranked = th.slice(0, 10);
      lockedHeldPct = ranked.filter(isLocked).reduce((s, h) => s + (Number(h.pct) || 0), 0);
      top10Pct = ranked.filter(h => !isLocked(h)).reduce((s, h) => s + (Number(h.pct) || 0), 0);
      // Bundler detection over REAL (non-lock) holders: a cluster of ≥3 near-equal amounts
      // = a bundle. Sum their supply % → bundlePct. Small bundles are fine; big ones dump.
      const real = th.filter(h => !isLocked(h)).slice(0, 12)
        .map(h => ({ amt: Number(h.amount) || 0, pct: Number(h.pct) || 0 })).filter(a => a.amt > 0)
        .sort((a, b) => b.amt - a.amt);
      if (real.length >= 3) {
        const bundle = new Set();
        for (let i = 0; i < real.length - 1; i++) {
          const ratio = real[i].amt > 0 ? real[i + 1].amt / real[i].amt : 0;
          if (ratio > 0.85 && ratio < 1.15) { bundle.add(i); bundle.add(i + 1); }
        }
        if (bundle.size >= 3) { hasBundlers = true; bundlePct = [...bundle].reduce((s, i) => s + real[i].pct, 0); }
      }
      hasSnipers = insiders > 0;
      const nonLp = th.filter(h => !isLocked(h) && !h.insider);
      topPct = (nonLp[0] && Number(nonLp[0].pct)) || 0;
    } catch (e) {}
    if (topPct > 30) { score -= (lp >= 99 ? 8 : 25); notes.push('🐋 top ' + topPct.toFixed(0) + '%'); }
    if (top10Pct > 50) { score -= 15; notes.push('👥 top10 ' + top10Pct.toFixed(0) + '%'); }
    if (hasSnipers) { score -= 10; notes.push('🔫 ' + insiders + ' insider(s)'); }
    if (hasBundlers) { score -= (bundlePct > 12 ? 20 : 8); notes.push('📦 bundle ' + bundlePct.toFixed(0) + '%'); }
    if (lockedHeldPct >= 10) notes.push('🔐 ' + lockedHeldPct.toFixed(0) + '% locked/burned');
    // holders — must have some
    let holders = Number(j.totalHolders || (j.token && j.token.holders) || 0);
    if (holders) { notes.push('👥 ' + holders); if (holders < 40) score -= 30; }
    // risk flags
    const risks = j.risks || [];
    const danger = risks.filter(x => String(x.level || '').toLowerCase() === 'danger').length;
    const warn = risks.filter(x => String(x.level || '').toLowerCase() === 'warn').length;
    score -= danger * 25 + warn * 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const badge = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    // compute holder conviction score (separate bullish signal)
    const conviction = _holderConvictionScore(j.topHolders || [], holders, {});
    return { checked: true, score, lp, topPct, top10Pct, holders, hasSnipers, hasBundlers, bundlePct, lockedHeldPct, insiders,
      conviction: conviction.score, convictionLabel: conviction.label, convictionSignals: conviction.signals,
      risks: risks,
      label: `🛡 Safety ${badge} <b>${score}/100</b>${notes.length ? '  ·  ' + notes.join(' ') : ''}` };
  } catch (e) { return { checked: false, score: 60, label: '', top10Pct: 0, hasSnipers: false, hasBundlers: false }; }
}

// ── SOCIAL SCORE (website, X, TG, Discord, locked) — 0..8 ───────────────────
// Returns { score, has, label } where has = { website, twitter, telegram, discord, locked }
// Pump.fun tokens have social data in their API response
async function _socialScore(pumpData, mint) {
  const has = { website: false, twitter: false, telegram: false, discord: false, locked: false };
  let score = 0;
  if (pumpData) {
    if (pumpData.website) { has.website = true; score += 2; }
    if (pumpData.twitter) { has.twitter = true; score += 2; }
    if (pumpData.telegram) { has.telegram = true; score += 1; }
    if (pumpData.discord) { has.discord = true; score += 1; }
  }
  // Check locked supply via rugcheck if we have mint
  if (mint && !has.locked) {
    try {
      const r = await fetch('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report/summary', { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const j = await r.json();
        const m = (j.markets || [])[0];
        const lp = m && m.lp;
        const lockedPct = Number((lp && (lp.lpLockedPct != null ? lp.lpLockedPct : lp.lpLocked)) || 0);
        if (lockedPct >= 50) { has.locked = true; score += 2; }
        else if (lockedPct >= 25) { score += 1; }
        has.lockedPct = lockedPct;
      }
    } catch (e) {}
  }
  const tags = [];
  if (has.website) tags.push('🌐');
  if (has.twitter) tags.push('𝕏');
  if (has.telegram) tags.push('📱');
  if (has.discord) tags.push('💬');
  if (has.locked) tags.push('🔒');
  const label = tags.length ? tags.join(' ') : '';
  return { score, has, label };
}

function _passesSocial(cfg, social) {
  if (!social) return true;  // fail-open if no social data
  if (cfg.requireWebsite && !social.has.website) return false;
  if (cfg.requireTwitter && !social.has.twitter) return false;
  if (cfg.requireSocial && social.score < 3) return false;
  if (cfg.requireLocked && !social.has.locked) return false;
  if (cfg.minSocialScore && social.score < cfg.minSocialScore) return false;
  return true;
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
function _ageStr(ms) {
  if (!ms || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h' + (mins % 60 ? (mins % 60) + 'm' : '');
  const days = Math.floor(hrs / 24);
  return days + 'd' + (hrs % 24 ? (hrs % 24) + 'h' : '');
}

function _signalCard(chain, pair, socialLabel) {
  const b = pair.baseToken || {};
  const sym = _esc(b.symbol || 'TOKEN');
  const nm = _esc(b.name || '');
  const price = pair.priceUsd ? '$' + Number(pair.priceUsd).toPrecision(3) : 'n/a';
  const mc = _fmtUsd(pair.fdv || pair.marketCap || 0);
  const liq = _fmtUsd(pair.liquidity && pair.liquidity.usd);
  const vol = _fmtUsd(pair.volume && pair.volume.h24);
  const vol1h = _fmtUsd(pair.volume && pair.volume.h1);
  const chg = _chgStr(pair.priceChange && pair.priceChange.h24);
  const chg1h = _chgStr(pair.priceChange && pair.priceChange.h1);
  const url = _esc(pair.url || '');
  const ca = _esc((b.address) || '');
  // age
  const age = pair.pairCreatedAt ? _ageStr(Date.now() - pair.pairCreatedAt) : '';
  // boost info
  const boost = _boostInfo(ca);
  const boostLine = boost && boost.amount > 0 ? `⚡ <b>PAID BOOST</b> — ${boost.amount} credits\n` : '';
  // volume-to-liq ratio (organic indicator)
  const volLiqRatio = (Number(pair.volume && pair.volume.h24) || 0) / Math.max(Number(pair.liquidity && pair.liquidity.usd) || 1, 1);
  const volHealth = volLiqRatio > 10 ? '🟢' : volLiqRatio > 3 ? '🟡' : '⚪';
  return (
    boostLine +
    `⚡️ <b>$${sym}</b>${nm && nm.toLowerCase() !== sym.toLowerCase() ? '  ' + nm : ''}\n` +
    `${_esc(chain.toUpperCase())}${chg ? '   ' + chg : ''}${chg1h ? '  1h' + chg1h : ''}${socialLabel ? '   ' + socialLabel : ''}\n` +
    `━━━━━━━━━━━━━\n` +
    `💰 MC <b>${mc}</b>   💧 Liq <b>${liq}</b>\n` +
    `📊 Vol24h <b>${vol}</b>   Vol1h <b>${vol1h}</b>\n` +
    `💵 <b>${_esc(price)}</b>${age ? '   ⏱ ' + age : ''}   ${volHealth} Vol/Liq ${volLiqRatio.toFixed(1)}x\n` +
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
  // populate boost map — every boosted token gets tracked (for cards + PnL)
  for (const item of boosts) {
    if (item && item.tokenAddress) {
      _boostMap.set(item.tokenAddress, {
        amount: Number(item.amount) || 0,
        totalAmount: Number(item.totalAmount) || 0,
        description: item.description || '',
        icon: item.icon || '',
        links: item.links || [],
      });
    }
  }
  // first poll after (re)start only SEEDS — prevents re-posting the whole trending list on Render redeploys
  if (!_trendSeeded) { for (const item of boosts) { if (item && item.tokenAddress) _seen.add(item.tokenAddress); } _trendSeeded = true; return; }

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

    // social scoring (fail-open — missing data doesn't block)
    let social = null;
    if (cfg.requireWebsite || cfg.requireTwitter || cfg.requireSocial || cfg.requireLocked || cfg.minSocialScore) {
      social = await _socialScore(null, addr);  // will check rugcheck for locked
      if (!_passesSocial(cfg, social)) { _seen.add(addr); continue; }
    }

    let card = _signalCard(chain, pair, social ? social.label : '');
    let rs = null;
    if (cfg.rugFilter && chain === 'solana') rs = await _rugScore(addr);
    if (rs && rs.checked && rs.score < cfg.rugMinScore) { _seen.add(addr); continue; }
    if (!_holdersOk(cfg, rs)) { _seen.add(addr); continue; }   // must have holders
    if (!_top10Ok(cfg, rs)) { _seen.add(addr); continue; }     // top10 concentration
    if (!_lpLockedOk(cfg, rs)) { _seen.add(addr); continue; }  // LP must be locked ≥50%
    if (!_snipersOk(cfg, rs)) { _seen.add(addr); continue; }   // no snipers/bundlers
    if (!_bundlersOk(cfg, rs)) { _seen.add(addr); continue; }  // no BIG bundles (>maxBundlerPct)
    if (!_liqMatches(cfg, Number(pair.liquidity && pair.liquidity.usd || 0), Number(pair.fdv || pair.marketCap || 0))) { _seen.add(addr); continue; }   // liq must match mcap
    if (_overCap(cfg, Number(pair.fdv || pair.marketCap || 0), rs)) { _seen.add(addr); continue; }   // >maxFdv unless premium
    const ok = (await core.broadcast(card + _detailBlock(rs, social, { liq: Number(pair.liquidity && pair.liquidity.usd || 0), fdv: Number(pair.fdv || pair.marketCap || 0), mint: addr, createdAt: pair.pairCreatedAt || 0, vol24: Number(pair.volume && pair.volume.h24) || 0, vol1h: Number(pair.volume && pair.volume.h1) || 0, websites: (pair.info && pair.info.websites) || [], socialLinks: (pair.info && pair.info.socials) || [] }), { buttons: core.buildButtons(addr, chain, pair.url) })) > 0;
    _seen.add(addr);
    if (ok) { core.markAlerted(addr); posted++; try { pnl.recordCall({ source: 'trending', chain, mint: addr, name: pair.baseToken && pair.baseToken.name, symbol: pair.baseToken && pair.baseToken.symbol, entryFdv: Number(pair.fdv || pair.marketCap || 0), entryPrice: Number(pair.priceUsd || 0), holders: (rs && rs.holders) || 0 }); } catch (e) {}
      _logFeatures({ mint: addr, chain, name: pair.baseToken && pair.baseToken.name, symbol: pair.baseToken && pair.baseToken.symbol, source: 'trending', entryFdv: Number(pair.fdv || pair.marketCap || 0), entryPrice: Number(pair.priceUsd || 0), top10Pct: (rs && rs.top10Pct) || 0, insiders: (rs && rs.insiders) || 0, bundlers: !!(rs && rs.hasBundlers), snipers: !!(rs && rs.hasSnipers), rugScore: (rs && rs.score) || 0, lpPct: (rs && rs.lp) || 0, holders: (rs && rs.holders) || 0, locked: !!(rs && rs.lp >= 80), venue: pair.dexId || '', vol24h: Number(pair.volume && pair.volume.h24) || 0, liquidity: Number(pair.liquidity && pair.liquidity.usd) || 0, sourceCount: 1 }); }
    if (_seen.size > _SEEN_CAP) { const first = _seen.values().next().value; _seen.delete(first); }
  }
}

// ── BONDED (pump.fun graduation) — "as soon as a token bonds" ──────────────
function _bondCard(c) {
  const name = _esc(c.name || 'Token');
  const sym = _esc(c.symbol || '');
  const mc = c.usdMc ? _fmtUsd(c.usdMc) : '';
  const ath = c.athUsd ? _fmtUsd(c.athUsd) : '';
  const liq = c.liq ? _fmtUsd(c.liq) : '';
  const vol = c.vol24h ? _fmtUsd(c.vol24h) : '';
  const mint = c.mint || c.address || '';
  const url = mint ? 'https://pump.fun/' + mint : '';
  const extra = [];
  if (c.holders) extra.push('👥 ' + c.holders);
  if (c.devPct != null && c.devPct > 0) extra.push('👨‍💻 dev ' + Number(c.devPct).toFixed(0) + '%');
  if (c.snipers != null && c.snipers > 0) extra.push('🔫 ' + c.snipers + ' snipers');
  return (
    `🎓 <b>$${sym || name}</b>${sym && name && name !== sym ? '  ' + name : ''} — BONDED\n` +
    `Graduated → Raydium\n` +
    `━━━━━━━━━━━━━\n` +
    (mc ? `💰 MC <b>${mc}</b>${ath ? `   🏔 ATH <b>${ath}</b>` : ''}\n` : '') +
    (liq ? `💧 Liq <b>${liq}</b>` : '') + (vol ? `   📊 Vol <b>${vol}</b>` : '') + '\n' +
    (extra.length ? extra.join('   ') + '\n' : '') +
    (mint ? `\n<code>${_esc(mint)}</code>\n` : '') +
    (url ? `🔗 <a href="${_esc(url)}">pump.fun</a>` : '') +
    `\n\n<i>NFA · rug-check first</i>`
  );
}
async function _pollBonded() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.bonded) return;
  // Prefer the ADVANCED pump.fun API (rich: holders, snipers, dev%, ATH, bonding progress); fall back to frontend-v3.
  let list = [];
  try {
    const r = await fetch(PF_GRADUATED, { headers: PF_HEADERS });
    if (r.ok) {
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j && (j.data || j.coins)) || [];
      list = arr.map(c => ({
        mint: c.coinMint, name: c.name, symbol: c.ticker,
        pumpMc: Number(c.marketCap) || 0, pumpAth: Number(c.allTimeHighMarketCap) || 0,
        holders: Number(c.numHolders) || 0, snipers: Number(c.sniperCount) || 0,
        devPct: Number(c.devHoldingsPercentage) || 0, bcProg: Number(c.bondingCurveProgress) || 0,
      })).filter(c => c.mint);
    }
  } catch (e) {}
  if (!list.length) {   // fallback → frontend-api-v3
    try {
      const r = await fetch(PF_COINS, { headers: PF_HEADERS });
      if (!r.ok) { if (!_bondSeeded) console.warn('[tg-signals] pump.fun bonded poll HTTP', r.status); return; }
      const coins = await r.json();
      const arr = Array.isArray(coins) ? coins : (coins && coins.coins) || [];
      list = arr.filter(c => c.complete === true || !!c.raydium_pool || c.graduated === true)
                .map(c => ({ mint: c.mint || c.address, name: c.name, symbol: c.symbol, holders: 0, devPct: 0, snipers: 0 }));
    } catch (e) { return; }
  }
  let posted = 0;
  for (const c of list) {
    if (posted >= cfg.maxPer) break;
    const mint = c.mint;
    if (!mint || _seenBond.has(mint)) continue;
    _seenBond.add(mint);
    if (_seenBond.size > _SEEN_CAP) { const f = _seenBond.values().next().value; _seenBond.delete(f); }
    if (!_bondSeeded) continue;                       // first poll only seeds (no dump on restart)
    if (core.wasAlerted(mint)) continue;              // global de-dupe
    // pump's own rich data as early gates (owner rules), when present
    if (c.holders && cfg.minHolders && c.holders < cfg.minHolders) continue;
    if (c.devPct && c.devPct > 30) continue;          // dev holding >30% = rug risk
    // ENRICH via DexScreener for reliable USD mcap/liq + confirm it's live on Raydium (else too fresh → next poll)
    let pair = null;
    try {
      const r = await fetch(DS_TOKEN('solana', mint));
      if (r.ok) { const j = await r.json(); pair = ((j && j.pairs) || []).sort((a, b) => (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0))[0]; }
    } catch (e) {}
    if (!pair) continue;                              // not indexed/tradeable yet — catch it next poll
    const usdMc = Number(pair.fdv || pair.marketCap) || 0;
    const liq = Number(pair.liquidity && pair.liquidity.usd) || 0;
    if (usdMc <= 0 || liq <= 0) continue;
    if (!_liqMatches(cfg, liq, usdMc)) continue;      // owner rule: liq must match mcap
    c.usdMc = usdMc; c.liq = liq; c.vol24h = Number(pair.volume && pair.volume.h24) || 0;                     // reliable USD numbers for card + PNL entry
    let card = _bondCard(c);
    let rs = null;
    if (cfg.rugFilter) {
      rs = await _rugScore(mint);
      if (rs.checked && rs.score < cfg.rugMinScore) continue;
      if (_overCap(cfg, usdMc, rs)) continue;         // >maxFdv unless premium-safe
      if (!_holdersOk(cfg, rs)) continue;
      if (!_top10Ok(cfg, rs)) continue;
      if (!_lpLockedOk(cfg, rs)) continue;            // LP MUST be locked
      if (!_snipersOk(cfg, rs)) continue;
      if (!_bundlersOk(cfg, rs)) continue;                          // no BIG bundles (>maxBundlerPct)
    }
    const ok = (await core.broadcast(card + _detailBlock(rs, null, { liq, fdv: usdMc, mint, createdAt: pair.pairCreatedAt || 0, vol24: Number(pair.volume && pair.volume.h24) || 0, vol1h: Number(pair.volume && pair.volume.h1) || 0, websites: (pair.info && pair.info.websites) || [], socialLinks: (pair.info && pair.info.socials) || [] }), { buttons: core.buildButtons(mint, 'solana', pair.url) })) > 0;
    if (ok) {
      core.markAlerted(mint); posted++;
      try { pnl.recordCall({ source: 'bonded', chain: 'solana', mint, name: c.name, symbol: c.symbol, entryFdv: usdMc, entryPrice: Number(pair.priceUsd) || 0, holders: c.holders || 0 }); } catch (e) {}
      _logFeatures({ mint, chain: 'solana', name: c.name, symbol: c.symbol, source: 'bonded', entryFdv: usdMc, entryPrice: Number(pair.priceUsd) || 0, top10Pct: (rs && rs.top10Pct) || 0, insiders: (rs && rs.insiders) || 0, bundlers: !!(rs && rs.hasBundlers), snipers: (c.snipers > 0) || !!(rs && rs.hasSnipers), rugScore: (rs && rs.score) || 0, lpPct: (rs && rs.lp) || 0, holders: c.holders || (rs && rs.holders) || 0, locked: !!(rs && rs.lp >= 80), devPct: c.devPct || 0, venue: pair.dexId || 'pump', vol24h: Number(pair.volume && pair.volume.h24) || 0, liquidity: liq, sourceCount: 1 });
    }
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
  const vol1h = _fmtUsd(a.volume_usd && a.volume_usd.h1);
  const fdv = a.fdv_usd ? _fmtUsd(a.fdv_usd) : '';
  const url = a.address ? `https://www.geckoterminal.com/${net}/pools/${a.address}` : '';
  const tag = kind === 'new_pools' ? '🆕 NEW' : '🔥 HOT';
  const chg = _chgStr(a.price_change_percentage && (a.price_change_percentage.h24 || a.price_change_percentage.h1));
  const age = a.pool_created_at ? _ageStr(Date.now() - new Date(a.pool_created_at).getTime()) : '';
  const volLiqRatio = (Number(a.volume_usd && a.volume_usd.h24) || 0) / Math.max(Number(a.reserve_in_usd) || 1, 1);
  const volHealth = volLiqRatio > 10 ? '🟢' : volLiqRatio > 3 ? '🟡' : '⚪';
  return (
    `${tag}  <b>${name}</b>\n` +
    `${_esc(net.toUpperCase())}${chg ? '   ' + chg : ''}${age ? '   ⏱ ' + age : ''}\n` +
    `━━━━━━━━━━━━━\n` +
    (fdv ? `💰 MC <b>${fdv}</b>   ` : '') + `💧 Liq <b>${liq}</b>\n` +
    `📊 Vol24h <b>${vol}</b>   Vol1h <b>${vol1h}</b>\n` +
    `💵 <b>${_esc(price)}</b>   ${volHealth} Vol/Liq ${volLiqRatio.toFixed(1)}x\n` +
    (addr ? `\n<code>${_esc(addr)}</code>\n` : '') +
    (url ? `🔗 <a href="${_esc(url)}">Chart</a>` : '') +
    `\n\n<i>NFA · rug-check first</i>`
  );
}

// ── RICH DETAIL BLOCK — appends deep coin intel to any signal card ──────────
// Pulls from rugScore, social, and pool data. Safe to call with nulls.
function _detailBlock(rs, social, extra) {
  const lines = [];
  const e = extra || {};

  // ── AGE + VOLUME (from DexScreener pair data) ──────────────────────────
  const age = e.createdAt ? _ageStr(Date.now() - e.createdAt) : '';
  const vol24 = e.vol24 ? _fmtUsd(e.vol24) : '';
  const vol1h = e.vol1h ? _fmtUsd(e.vol1h) : '';
  if (age || vol24) {
    let market = '';
    if (age) market += '⏱ ' + age;
    if (vol24) market += (market ? '  ·  ' : '') + '📊 Vol24h ' + vol24;
    if (vol1h) market += '  ·  Vol1h ' + vol1h;
    lines.push(market);
  }

  // ── BOOST STATUS ──────────────────────────────────────────────────────
  const mint = e.mint || (rs && rs.mint) || '';
  const boost = mint ? _boostInfo(mint) : null;
  if (boost && boost.amount > 0) {
    lines.push('⚡ <b>PAID BOOST</b> — ' + boost.amount + ' DexScreener credits');
  }

  // ── SAFETY SCORE (from RugCheck) ──────────────────────────────────────
  if (rs && rs.checked) {
    const badge = rs.score >= 80 ? '🟢' : rs.score >= 50 ? '🟡' : '🔴';
    let safety = badge + ' Safety <b>' + rs.score + '/100</b>';
    // LP lock status
    if (rs.lp >= 99) safety += '  ·  🔒 LP 100%';
    else if (rs.lp >= 80) safety += '  ·  🔐 LP ' + rs.lp.toFixed(0) + '%';
    else if (rs.lp > 0) safety += '  ·  ⚠️ LP ' + rs.lp.toFixed(0) + '%';
    else safety += '  ·  ⚠️ LP unknown';
    lines.push(safety);
  }

  // ── HOLDERS & WHALE DISTRIBUTION ──────────────────────────────────────
  if (rs && rs.checked && rs.holders) {
    let holders = '👥 <b>' + rs.holders + '</b> holders';
    if (rs.top10Pct) {
      const quality = rs.top10Pct < 50 ? '🟢' : rs.top10Pct < 70 ? '🟡' : '🔴';
      holders += '  ·  Top10 ' + quality + ' ' + rs.top10Pct.toFixed(0) + '%';
    }
    if (rs.insiders) holders += '  ·  🕵️ ' + rs.insiders + ' insider(s)';
    if (rs.hasBundlers) holders += '  ·  📦 bundler';
    if (rs.hasSnipers) holders += '  ·  🔫 sniper';
    lines.push(holders);
  }

  // ── CONVICTION (whale buying signal) ──────────────────────────────────
  if (rs && rs.convictionLabel) {
    lines.push('🐋 <b>Conviction:</b> ' + rs.convictionLabel);
    if (rs.convictionSignals && rs.convictionSignals.length) {
      lines.push('   ' + rs.convictionSignals.join('  ·  '));
    }
  }

  // ── LIQUIDITY HEALTH (liq/mcap ratio) ─────────────────────────────────
  const liqNum = Number(e.liq || 0);
  const fdvNum = Number(e.fdv || 0);
  if (liqNum > 0 && fdvNum > 0) {
    const ratio = (liqNum / fdvNum * 100);
    const health = ratio >= 10 ? '🟢' : ratio >= 5 ? '🟡' : '🔴';
    lines.push(health + ' Liquidity <b>' + ratio.toFixed(1) + '%</b> of mcap');
  }

  // ── WEBSITES & SOCIAL LINKS (from DexScreener info) ───────────────────
  const sites = e.websites || [];
  const socialLinks = e.socialLinks || [];
  if (sites.length || socialLinks.length) {
    const parts = [];
    for (const w of sites) { if (w.url) parts.push('🌐 <a href="' + _esc(w.url) + '">' + _esc(w.label || 'Website') + '</a>'); }
    for (const s of socialLinks) {
      const icon = s.type === 'twitter' ? '🐦' : s.type === 'telegram' ? '📱' : s.type === 'discord' ? '💬' : '🔗';
      if (s.url) parts.push(icon + ' <a href="' + _esc(s.url) + '">' + _esc(s.type || 'social') + '</a>');
    }
    if (parts.length) lines.push(parts.join('  '));
  } else if (social && social.has) {
    // fallback to social score icons
    const icons = [];
    if (social.has.website) icons.push('🌐');
    if (social.has.twitter) icons.push('🐦');
    if (social.has.telegram) icons.push('📱');
    if (social.has.discord) icons.push('💬');
    if (icons.length) {
      lines.push('🔗 Social ' + icons.join(' ') + '  (score ' + (social.score || 0) + '/8)');
    } else {
      lines.push('⚠️ No social presence detected');
    }
  }

  // ── RISK FLAGS (top 2 from RugCheck) ──────────────────────────────────
  if (rs && rs.checked && rs.risks && rs.risks.length) {
    const topRisks = rs.risks.slice(0, 2).map(r => r.name).filter(Boolean);
    if (topRisks.length) lines.push('⚠️ Risks: ' + topRisks.join(', '));
  }

  return lines.length ? '\n' + lines.join('\n') : '';
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
        if (liq < cfg.minLiq || vol < cfg.minVol24h || !_passesFdv(cfg, fdv)) continue;
        const _chg = Number(a.price_change_percentage && a.price_change_percentage.h24);
        if (cfg.bullishOnly && isFinite(_chg) && _chg < -10) continue;   // skip bearish (funnel)
        const _bt = (p.relationships && p.relationships.base_token && p.relationships.base_token.data && p.relationships.base_token.data.id) || '';
        const _taddr = _bt.indexOf('_') >= 0 ? _bt.slice(_bt.indexOf('_') + 1) : _bt;
        const _dk = _taddr || id;   // dedupe key: token address if present, else the pool id (always present)
        if (core.wasAlerted(_dk)) continue;   // GLOBAL persistent de-dupe (fixes GeckoTerminal repeats)
        if (_poolSeeded) {
          let card = _poolCard(net, kind, a, _taddr);
          // social scoring for gecko pools
          let social = null;
          if (cfg.requireWebsite || cfg.requireTwitter || cfg.requireSocial || cfg.requireLocked || cfg.minSocialScore) {
            social = await _socialScore(null, _taddr);
            if (!_passesSocial(cfg, social)) continue;
          }
          let rs = null;
          if (cfg.rugFilter && net === 'solana') { const mint = _mintFromGecko(p); if (mint) rs = await _rugScore(mint); }
          if (rs && rs.checked && rs.score < cfg.rugMinScore) continue;   // below safety floor
          if (!_holdersOk(cfg, rs)) continue;                            // must have holders
          if (!_top10Ok(cfg, rs)) continue;                              // top10 concentration
          if (!_lpLockedOk(cfg, rs)) continue;                           // LP must be locked ≥80%
          if (!_snipersOk(cfg, rs)) continue;                            // no snipers/bundlers
          if (!_bundlersOk(cfg, rs)) continue;                           // no BIG bundles (>maxBundlerPct)
          if (!_liqMatches(cfg, liq, fdv)) continue;                     // liq must match mcap
          if (_overCap(cfg, fdv, rs)) continue;                          // >maxFdv unless premium safety
          const _u = a.address ? `https://www.geckoterminal.com/${net}/pools/${a.address}` : '';
          const ok = (await core.broadcast(card + _detailBlock(rs, social, { liq, fdv, mint: _taddr || _dk, createdAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0, vol24: Number(a.volume_usd && a.volume_usd.h24) || 0, vol1h: Number(a.volume_usd && a.volume_usd.h1) || 0 }), { buttons: core.buildButtons(_taddr || _dk, net, _u) })) > 0;
          if (ok) {
            core.markAlerted(_dk);
            _seenPool.add(id);   // mark seen ONLY after successful post — rejected pools re-evaluate next cycle
            posted++;
            try { pnl.recordCall({ source: kind, chain: net, mint: _taddr || _dk, name: a.name, entryFdv: fdv, entryPrice: Number(a.base_token_price_usd) || 0, holders: (rs && rs.holders) || 0 }); } catch (e) {}
            const _venue = (p.relationships && p.relationships.dex && p.relationships.dex.data && p.relationships.dex.data.id) || '';
            _logFeatures({ mint: _taddr || _dk, chain: net, name: a.name, source: kind, entryFdv: fdv, entryPrice: Number(a.base_token_price_usd) || 0, top10Pct: (rs && rs.top10Pct) || 0, insiders: (rs && rs.insiders) || 0, bundlers: !!(rs && rs.hasBundlers), snipers: !!(rs && rs.hasSnipers), rugScore: (rs && rs.score) || 0, lpPct: (rs && rs.lp) || 0, holders: (rs && rs.holders) || 0, locked: !!(rs && rs.lp >= 80), venue: _venue, vol24h: vol, liquidity: liq, sourceCount: 1 });
          }
        }
        // cap _seenPool size (only posted pools are in here now, so this rarely triggers)
        if (_seenPool.size > _SEEN_CAP) { const f = _seenPool.values().next().value; _seenPool.delete(f); }
      }
    }
  }
  _poolSeeded = true;   // first poll only seeds — then post only NEW pools
}

let _timer = null, _bondTimer = null, _geckoTimer = null, _pipelineTimer = null;
function startTelegramSignals() {
  const cfg = _cfg();
  if (!cfg.token) {
    console.log('[tg-signals] disabled — set TELEGRAM_BOT_TOKEN to enable the DEX signals feed (broadcasts to the channel + every chat the bot is in).');
    return;
  }
  if (_timer) return;
  if (!core.acquireBroadcastLock()) { console.log('[tg-signals] another instance owns broadcasting — signals not started here (prevents duplicate sends).'); return; }
  console.log(`[tg-signals] ENABLED → ${cfg.channel || '(no channel — DM chats only)'} · chains=${cfg.chains.join(',')} · trending/${Math.round(cfg.interval / 1000)}s · bonded=${cfg.bonded ? Math.round(cfg.bondedInterval / 1000) + 's' : 'off'}`);

  // Start token-db auto-save
  try { require('./token-db').startAutoSave(); } catch (e) {}

  // Pipeline: 4-stage discovery → confirm → validate → enrich (20s cycle)
  const pipeline = require('./pipeline');
  console.log('[tg-signals] pipeline armed — 4-stage discovery cycle');
  setTimeout(() => { _pipelineCycle(pipeline).catch(() => {}); }, 10000);
  _pipelineTimer = setInterval(() => { _pipelineCycle(pipeline).catch(() => {}); }, 20000);
  if (_pipelineTimer.unref) _pipelineTimer.unref();

  // ZEROX learning: every 30 min re-analyze call outcomes → weights + failure patterns + auto-tune suggestions
  const _learnTimer = setInterval(() => {
    try {
      const tokenDb = require('./token-db');
      tokenDb.analyzeOutcomes();
      tokenDb.analyzeFailures();
      tokenDb.autoTune();
    } catch (e) {}
  }, 30 * 60000);
  if (_learnTimer.unref) _learnTimer.unref();

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

// Pipeline cycle: run 4 stages, post enriched candidates
async function _pipelineCycle(pipeline) {
  try {
    const enriched = await pipeline._cycle();
    if (!enriched || !enriched.length) return;
    const cfg = _cfg();
    let regime = null; try { regime = await require('./providers').marketRegime(); } catch (e) {}
    let posted = 0;
    for (const c of enriched) {
      if (posted >= cfg.maxPer) break;
      if (core.wasAlerted(c.mint)) continue;
      // build signal card
      const socialLabel = c.sourceNames ? '📡 ' + c.sourceNames.join('+') : '';
      let card = _signalCard(c.chain, { baseToken: { symbol: c.symbol, name: c.name, address: c.mint }, priceUsd: c.metrics.price, fdv: c.metrics.fdv, marketCap: c.metrics.fdv, liquidity: { usd: c.metrics.liq }, volume: { h24: c.metrics.vol24h }, priceChange: { h24: c.metrics.change24h }, url: c.metrics.url }, socialLabel);
      if (c.conviction && c.conviction.score) { try { card += '\n' + require('./lib/conviction').convictionLine(c.conviction); } catch (e) {} }
      // risk/quality flag chips — show subscribers WHY this scored where it did
      const m = c.metrics || {}, flags = [];
      if (m.lpPct >= 99) flags.push('🔒 LP');
      if (m.goplus && m.goplus.trusted) flags.push('✅ trusted');
      if (m.goplus && m.goplus.mintable) flags.push('⚠️ mintable');
      if (m.goplus && m.goplus.freezable) flags.push('⚠️ freezable');
      if (m.bundlers) flags.push('📦 bundlers');
      if ((m.insiders || 0) > 0) flags.push('🔫 ' + m.insiders + ' insider');
      if (flags.length) card += '\n' + flags.join('  ');
      if (c.confidence > 0) card += `\n🎯 Confidence: <b>+${c.confidence}</b>`;
      if (regime && regime.label) card += `\n🌐 Market: ${regime.label} (${regime.mcapChg >= 0 ? '+' : ''}${regime.mcapChg.toFixed(1)}%)`;
      const ok = (await core.broadcast(card, { buttons: core.buildButtons(c.mint, c.chain, c.metrics.url) })) > 0;
      if (ok) {
        core.markAlerted(c.mint);
        pipeline.addCooldown(c.mint);
        posted++;
        try {
          const tokenDb = require('./token-db');
          tokenDb.recordOutcome({
            mint: c.mint, chain: c.chain, name: c.name, symbol: c.symbol,
            source: 'pipeline', entryFdv: c.metrics.fdv, entryPrice: c.metrics.price,
            sourceCount: c.sourceCount, sources: c.sourceNames,
            socialScore: c.confidence, hasWebsite: false, hasTwitter: false,
            locked: c.metrics.lpPct >= 99, top10Pct: c.metrics.top10Pct || 0,
            insiders: c.metrics.insiders || 0, bundlers: c.metrics.bundlers || false, snipers: (c.metrics.insiders || 0) > 0,
            rugScore: c.metrics.rugScore || 0, lpPct: c.metrics.lpPct || 0,
            holders: c.metrics.holders || 0, vol24h: c.metrics.vol24h, liquidity: c.metrics.liq,
          });
          pnl.recordCall({ source: 'pipeline', chain: c.chain, mint: c.mint, name: c.name, symbol: c.symbol, entryFdv: c.metrics.fdv, entryPrice: c.metrics.price, holders: c.metrics.holders || 0 });
        } catch (e) {}
      }
    }
  } catch (e) { console.warn('[pipeline] cycle error:', e.message); }
}

module.exports = { startTelegramSignals, _pollOnce, _pollBonded, _pollGecko, _socialScore, _passesSocial };
