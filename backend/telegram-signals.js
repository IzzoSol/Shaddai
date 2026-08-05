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
const wallets = require('./telegram-wallets');  // tracked wallet cross-reference + ape alerts
const path = require('path');
const fs = require('fs');

// bot banner images — used as fallback when a token has no DexScreener imageUrl
const _BOT_IMG_DIR = path.join(__dirname, '../public/assets/bot');
const _BOT_IMGS = (() => {
  try { return fs.readdirSync(_BOT_IMG_DIR).filter(f => f.startsWith('img-') && f.endsWith('.png')).map(f => path.join(_BOT_IMG_DIR, f)); }
  catch (e) { return []; }
})();
function _randomBotImg() { return _BOT_IMGS.length ? _BOT_IMGS[Math.floor(Math.random() * _BOT_IMGS.length)] : null; }
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
const _ENRICH_CAP = 18;           // max token-detail fetches per trending poll (DexScreener 300 req/min, well within limit)

// ZEROX corpus: block only pre-graduation bonding curve (no liq/vol anyway) + confirmed-dead DEX types
// Venues with 0% 5x+ win rate in 7-day corpus (1642 calls):
//   pumpswap:417, pump-fun:314 — pump.fun's own AMM/bonding; not Raydium graduates
//   pancakeswap:43 — BSC DEX leaking into Solana feed; zero wins
//   meteora-dbc:36, meteora-damm-v2:9, raydium-launchlab:3 — historically dead
// venue:unknown (818 calls, 21% win rate) = real Raydium pairs — intentionally NOT blocked
const _BAD_VENUES = new Set(['pumpswap', 'pump-fun', 'pancakeswap', 'meteora-dbc', 'meteora-damm-v2', 'raydium-launchlab']);

// Scam symbol + name blocklist. Strip non-alphanumeric before testing.
// Patterns confirmed 0% win rate over 700+ calls in 7-day corpus:
//   USO*/USU*/USR*/USW*/AOR*/XUS* = fake stablecoin family
//   USOS:11x, NTFS:11x, GDWR:8x, USWR:6x, AORP:9x, MODA:16x = persistent scam relaunchers
//   OIL*/RESERVE*/USSR*/UNITED* = commodity/nation impersonators (0% win, >90% rug)
//   Non-ASCII dominant = targeting foreign communities with rug tokens
const _SCAM_SYM_RE = /^(USO[A-Z0-9]+|USU[A-Z0-9]+|AOR[A-Z0-9]+|USDX[A-Z0-9]?|USR[A-Z0-9]+|USW[A-Z0-9]+|USDU|XUS[A-Z0-9]+|TNOS|USOS|NTFS|GDWR|OIL[A-Z0-9]*|RESERVE[A-Z0-9]*|USSR[A-Z0-9]*|UNITED[A-Z0-9]*)$/i;
function _isScamSym(sym) {
  if (!sym) return false;
  const s = String(sym).replace(/[^A-Z0-9]/gi, '');
  if (_SCAM_SYM_RE.test(s)) return true;
  // Block non-ASCII dominant symbols (Chinese/Japanese chars etc.) — consistently rug
  const nonAscii = (String(sym).match(/[^\x00-\x7F]/g) || []).length;
  if (nonAscii > 0 && nonAscii >= String(sym).length * 0.4) return true;
  return false;
}
// Name-level scam check for token full names (catches "United States Dollar", "Oil Reserve", etc.)
const _SCAM_NAME_RE = /\b(reserve|united|ussr|soviet|petroleum|crude oil|federal|treasury|central bank)\b/i;
function _isScamName(name) { return !!(name && _SCAM_NAME_RE.test(String(name))); }
// Symbol cooldown: block same symbol if already called within 2h (stops TNOS x3 relaunches)
// Symbol cooldown — persisted to disk so Render deploys don't reset it.
// Prevents MODA/USOH/AORP relaunches from spamming every restart.
const _SYM_CD_FILE = path.join(__dirname, 'data', 'tg-sym-cooldown.json');
const _SYM_CD_TTL = 4 * 60 * 60 * 1000;  // 4h cooldown per symbol (was 2h in-memory)
function _loadSymCooldown() {
  try { const raw = JSON.parse(fs.readFileSync(_SYM_CD_FILE, 'utf8')); const now = Date.now(); const m = new Map(); for (const [k,v] of Object.entries(raw)) { if (now - v < _SYM_CD_TTL) m.set(k, v); } return m; } catch (e) { return new Map(); }
}
function _saveSymCooldown(m) {
  try { const now = Date.now(); const obj = {}; for (const [k,v] of m.entries()) { if (now - v < _SYM_CD_TTL) obj[k] = v; } fs.writeFileSync(_SYM_CD_FILE, JSON.stringify(obj)); } catch (e) {}
}
const _recentSymbols = _loadSymCooldown();
function _symCooldownOk(sym) {
  if (!sym) return true;
  const s = sym.toUpperCase();
  const last = _recentSymbols.get(s);
  return !(last && Date.now() - last < _SYM_CD_TTL);
}
function _trackSym(sym) {
  if (!sym) return;
  _recentSymbols.set(sym.toUpperCase(), Date.now());
  if (_recentSymbols.size > 500) { const f = _recentSymbols.keys().next().value; _recentSymbols.delete(f); }
  _saveSymCooldown(_recentSymbols);
}

// look up DexScreener boost info for a token address — returns null if not boosted
function _boostInfo(addr) { return _boostMap.get(addr) || null; }

// Rejection logger — rolling 200-entry file so we can audit why trending tokens get filtered
const _REJECT_LOG_FILE = path.join(__dirname, 'data', 'tg-rejected.json');
let _rejectLog = [];
try { _rejectLog = JSON.parse(fs.readFileSync(_REJECT_LOG_FILE, 'utf8')); if (!Array.isArray(_rejectLog)) _rejectLog = []; } catch (e) { _rejectLog = []; }
function _logReject(reason, sym, fdv, extra) {
  _rejectLog.push({ ts: Date.now(), reason, sym: sym || '?', fdv: Math.round(fdv || 0), ...extra });
  if (_rejectLog.length > 200) _rejectLog = _rejectLog.slice(-200);
  try { fs.writeFileSync(_REJECT_LOG_FILE, JSON.stringify(_rejectLog)); } catch (e) {}
}

// ── TIME-QUALITY TIERS ────────────────────────────────────────────────────────
// Updated from 300-call 14-day analysis (2026-08-03):
//   Peak: 20h (44%), 22h (44%), 00h (54% — best!), 01h (33%) → extend to 20-01h window
//   Dead: 07-10h (0%), 17h (5%) → drop 11-13h (13h=36%, not dead); keep 15-17h → narrow to 17h+15-16h
//   13h = 36% win rate — was wrongly in dead zone. Now treated as normal.
function _utcHour() { return new Date().getUTCHours(); }
function _isWeekend() { const d = new Date().getUTCDay(); return d === 0 || d === 6; }
function _isPeakHour() { const h = _utcHour(); return h >= 20 || h <= 5; }  // 8pm-5am UTC (00h=54%, 20h/22h=44%, 04h=5 winners incl ANMOND49x/MrSue29x)
function _isDeadHour() { const h = _utcHour(); return (h >= 7 && h <= 10) || (h >= 15 && h <= 17); }  // 0-5% death zone (drop 11-13h: 13h=36%)
function _qualityMult() {
  if (_isPeakHour()) return 1;
  if (_isDeadHour()) return 2;
  if (_isWeekend()) return 0.85;  // weekend: relax gates 15% — higher base hit rate
  return 1.25;
}
function _hourLabel() {
  if (_isPeakHour()) return _isWeekend() ? '🌙⭐ WEEKEND PEAK' : '⭐ PEAK HOUR';
  if (_isDeadHour()) return '⚠️ LOW VOL WINDOW';
  if (_isWeekend()) return '📅 WEEKEND';
  return null;
}
// Peak-aware minFdv. Peak hours (20h-01h UTC) allow full micro-FDV access —
// peak-hour micro-FDV tokens show 54-68% win rate (00h=54% best hour; JIMOTHY 31x, Raccbit 21x all peak).
// Weekday non-peak: raise floor to $15K ($5K-$15K weekday non-peak = 0% win rate per corpus).
// Weekend: cfg.minFdv already=$1K — no adjustment needed.
function _effectiveMinFdv(cfg) {
  if (_isPeakHour()) return cfg.minFdv || 0;               // peak hour: full micro-FDV access
  if (!_isWeekend()) return Math.max(cfg.minFdv || 0, 15000); // weekday non-peak: raise to $15K
  return cfg.minFdv || 0;                                  // weekend: use cfg value ($1K)
}

// ── VOLUME ACCELERATION CHECK ─────────────────────────────────────────────────
// h1 volume at > 1.5x the h24 hourly average = token is accelerating RIGHT NOW.
// From data: most winners were called during active momentum, not stale accumulation.
function _isAccelerating(pair) {
  const h24 = Number(pair && pair.volume && pair.volume.h24) || 0;
  const h1  = Number(pair && pair.volume && pair.volume.h1)  || 0;
  if (!h24 || !h1) return false;
  return (h1 * 24) > (h24 * 1.5);   // current-hour pace > 1.5x daily average
}

// ── BUY PRESSURE (from DexScreener pair.txns — zero extra API calls) ──────────
// Uses buy/sell tx counts across m5+h1 windows to measure accumulation vs dump.
// Returns { ratio: 0-1, label, bullish }  where ratio > 0.55 = net buying.
function _buyPressure(pair) {
  const t = pair && pair.txns;
  if (!t) return { ratio: 0.5, label: '', bullish: null };
  const m5B = Number(t.m5 && t.m5.buys) || 0;
  const m5S = Number(t.m5 && t.m5.sells) || 0;
  const h1B = Number(t.h1 && t.h1.buys) || 0;
  const h1S = Number(t.h1 && t.h1.sells) || 0;
  // Weight 5-min heavier (most recent sentiment)
  const buys = h1B + m5B * 3;
  const total = buys + h1S + m5S * 3;
  if (total < 3) return { ratio: 0.5, label: '', bullish: null };
  const ratio = buys / total;
  const pct = Math.round(ratio * 100);
  const label = ratio >= 0.65
    ? `🟢 ${pct}% buys` : ratio >= 0.55
    ? `🟡 ${pct}% buys` : ratio <= 0.35
    ? `🔴 ${pct}% buys (dump)` : `⚪ ${pct}% buys`;
  return { ratio, label, bullish: ratio >= 0.55 };
}

// ── PUMP.FUN COIN DETAIL (free, no key) ───────────────────────────────────────
// Extra fields vs the list API: twitter, website, reply_count, last_reply,
// ath_market_cap, ath_market_cap_timestamp, is_banned, nsfw, created_timestamp.
// Fail-open: returns null if not found or network error.
async function _pumpDetail(mint) {
  if (!mint) return null;
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// ── RAYDIUM POOL TVL + PRICE RANGE (free, no key) ────────────────────────────
// Provides: tvl, day/week/month volume, price min/max (volatility), fee APR.
// Only meaningful for Raydium pools (pump.fun graduates).
async function _raydiumPool(mint) {
  if (!mint) return null;
  try {
    const url = `https://api-v3.raydium.io/pools/info/mint?mint1=${mint}&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=1&page=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json();
    const pool = (j.data && j.data.data && j.data.data[0]) || (j.data && Array.isArray(j.data) && j.data[0]);
    if (!pool) return null;
    const d = pool.day || {}; const w = pool.week || {};
    return {
      tvl:      Number(pool.tvl) || 0,
      dayVol:   Number(d.volume) || 0,
      weekVol:  Number(w.volume) || 0,
      dayPriceMin: Number(d.priceMin) || 0,
      dayPriceMax: Number(d.priceMax) || 0,
      feeApr:   Number(d.feeApr) || 0,
      poolType: pool.type || '',
    };
  } catch (e) { return null; }
}

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
    minTop10Pct: Number(cc.minTop10Pct) || 0,
    maxBundlerPct: Number(cc.maxBundlerPct) || 12,
    maxSnipersPct: Number(cc.maxSnipersPct) || 0,
    minVolM5: Number(cc.minVolM5) || 0,
    requireNoSnipers: cc.requireNoSnipers === true,
    requireNoBundlers: cc.requireNoBundlers === true,
    preBonding: cc.preBonding !== false,   // pre-bonding curve feed (pump.fun tokens approaching graduation)
    // poll cadences (env-tunable) — balanced for free tier rate limits
    interval: Math.max(120000, parseInt(process.env.TG_SIGNALS_INTERVAL || '300000', 10) || 300000),      // 5 min default (DexScreener: ~60 req/min free)
    bondedInterval: Math.max(60000, parseInt(process.env.TG_BONDED_INTERVAL || '120000', 10) || 120000), // 2 min default (pump.fun: generous)
    geckoInterval: Math.max(120000, parseInt(process.env.TG_GECKO_INTERVAL || '180000', 10) || 180000),  // 3 min default (GeckoTerminal: generous)
  };
}
// FDV gate — weekend/weekday-aware min, hard max cap
// Weekend: floor drops to $1K (post-grad dip recoveries win at 45% on weekends)
// Weekday non-peak: floor rises to $15K (5K-15K weekday = 0% win rate in ZEROX data)
function _passesFdv(cfg, fdv) {
  const effMin = _effectiveMinFdv(cfg);
  if (effMin && fdv < effMin) return false;
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

// ── GOPLUS SECURITY (Solana, free, no key) ────────────────────────────────────
// Detects: mintable supply, sell tax (honeypot), hidden owner, transfer pause.
// Fail-open: brand-new tokens may not be indexed yet → no-op, don't block.
// Returns { ok, mintable, sellTax, buyTax, hiddenOwner, pausable, label }
async function _goplusCheck(mint) {
  const CLEAN = { ok: true, mintable: false, sellTax: 0, buyTax: 0, hiddenOwner: false, pausable: false, label: '' };
  if (!mint) return CLEAN;
  try {
    const r = await fetch(`https://api.gopluslabs.io/api/v1/token_security/solana?contract_addresses=${mint}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return CLEAN;
    const j = await r.json();
    const d = j && j.result && (j.result[mint] || j.result[mint.toLowerCase()]);
    if (!d) return CLEAN;
    const mintable = d.is_mintable === '1';
    const sellTax = Math.round(Number(d.sell_tax || 0) * 100);   // 0.05 → 5%
    const buyTax = Math.round(Number(d.buy_tax || 0) * 100);
    const hiddenOwner = d.hidden_owner === '1' || d.can_take_back_ownership === '1';
    const pausable = d.transfer_pausable === '1';
    const flags = [];
    if (mintable)    flags.push('⚠️ MINTABLE');
    if (sellTax > 5) flags.push(`⚠️ SELL TAX ${sellTax}%`);
    if (buyTax > 5)  flags.push(`⚠️ BUY TAX ${buyTax}%`);
    if (hiddenOwner) flags.push('⚠️ HIDDEN OWNER');
    if (pausable)    flags.push('⚠️ PAUSABLE');
    const isRisky = mintable || sellTax > 10 || hiddenOwner || pausable;
    return { ok: !isRisky, mintable, sellTax, buyTax, hiddenOwner, pausable, label: flags.join('  ') };
  } catch (e) { return CLEAN; }
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

// ── SOCIAL SCORE (website, X, TG, Discord, Instagram, locked) — 0..10 ────────
// Returns { score, has, label } where has = { website, twitter, telegram, discord, instagram, locked }
// Enriched from: pump.fun coin data, DexScreener pair.info (socials + websites), rugcheck LP lock
async function _socialScore(pumpData, mint, pairData) {
  const has = { website: false, twitter: false, telegram: false, discord: false, instagram: false, locked: false };
  let score = 0;
  if (pumpData) {
    if (pumpData.website) { has.website = true; score += 2; }
    if (pumpData.twitter) { has.twitter = true; score += 2; }
    if (pumpData.telegram) { has.telegram = true; score += 1; }
    if (pumpData.discord) { has.discord = true; score += 1; }
  }
  // Enrich from DexScreener pair.info (covers bonded tokens + tokens with DexScreener profiles)
  if (pairData) {
    const pairSocials = (pairData.info && pairData.info.socials) || [];
    const pairWebsites = (pairData.info && pairData.info.websites) || [];
    if (!has.website && pairWebsites.some(w => w && w.url)) { has.website = true; score += 2; }
    for (const s of pairSocials) {
      const t = String(s && s.type || '').toLowerCase();
      if (!has.twitter && (t === 'twitter' || t === 'x')) { has.twitter = true; score += 2; }
      else if (!has.telegram && t === 'telegram') { has.telegram = true; score += 1; }
      else if (!has.discord && t === 'discord') { has.discord = true; score += 1; }
      else if (!has.instagram && t === 'instagram') { has.instagram = true; score += 1; }
    }
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
  if (has.instagram) tags.push('📸');
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

function _fmtPrice(n) {
  if (!n || !isFinite(n)) return '';
  if (n >= 1000) return '$' + n.toLocaleString('en', { maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(4);
  if (n >= 0.01) return '$' + n.toFixed(6);
  const decs = Math.min(Math.max(2 - Math.floor(Math.log10(n)), 4), 12);
  return '$' + n.toFixed(decs);
}

function _signalCard(chain, pair, socialLabel) {
  const b = pair.baseToken || {};
  const sym = _esc(b.symbol || 'TOKEN');
  const nm = _esc(b.name || '');
  const liqNum = Number(pair.liquidity && pair.liquidity.usd) || 0;
  const fdvNum = Number(pair.fdv || pair.marketCap) || 0;
  const volNum = Number(pair.volume && pair.volume.h24) || 0;
  const vol1hNum = Number(pair.volume && pair.volume.h1) || 0;
  const liqPct = fdvNum > 0 ? (liqNum / fdvNum * 100) : 0;
  const volLiq = liqNum > 0 ? volNum / liqNum : 0;
  const liqTag = liqPct >= 10 ? '🟢' : liqPct >= 5 ? '🟡' : '🔴';
  const volTag = volLiq > 10 ? '🟢' : volLiq > 3 ? '🟡' : '⚪';
  const chg24 = _chgStr(pair.priceChange && pair.priceChange.h24);
  const chg1h = _chgStr(pair.priceChange && pair.priceChange.h1);
  const price = pair.priceUsd ? _esc(_fmtPrice(Number(pair.priceUsd))) : '';
  const age = pair.pairCreatedAt ? _ageStr(Date.now() - pair.pairCreatedAt) : '';
  const boost = _boostInfo(b.address || '');
  const chainLabel = chain === 'solana' ? '◎ SOL' : chain === 'ethereum' ? 'Ξ ETH' : chain === 'bsc' ? '⬡ BSC' : _esc(chain.toUpperCase());
  const venueLabel = pair.dexId ? _esc(pair.dexId.replace(/-/g, ' ').toUpperCase()) : '';
  const title = nm && nm.toLowerCase() !== sym.toLowerCase()
    ? `⚡ <b>$${sym}</b>  <i>${nm}</i>`
    : `⚡ <b>$${sym}</b>`;
  const metaParts = [chainLabel];
  if (venueLabel) metaParts.push(venueLabel);
  if (age) metaParts.push('⏱ ' + age);
  if (chg24) metaParts.push(chg24);
  if (chg1h) metaParts.push('1h ' + chg1h);
  if (socialLabel) metaParts.push(socialLabel);
  let out = title + '\n' + metaParts.join('  ·  ') + '\n';
  if (boost && boost.amount > 0) out += `\n🚀 <b>BOOSTED</b> — ${boost.amount} DexScreener credits\n`;
  out += `\n━━ 📊 MARKET ━━\n`;
  out += `💰 MCap   <b>${_fmtUsd(fdvNum)}</b>\n`;
  out += `💧 Liq    <b>${_fmtUsd(liqNum)}</b>  ${liqTag} ${liqPct >= 1 ? liqPct.toFixed(0) : liqPct.toFixed(1)}% of MC\n`;
  out += `📈 Vol    <b>${_fmtUsd(volNum)}</b> 24h  /  <b>${_fmtUsd(vol1hNum)}</b> 1h\n`;
  out += `${volTag} Vol/Liq <b>${volLiq.toFixed(1)}x</b>`;
  if (price) out += `   💵 <b>${price}</b>`;
  return out;
}

const _profileMap = new Map();   // tokenAddress → {icon, description, links, cto, hasDescription}
const DS_PROFILES = 'https://api.dexscreener.com/token-profiles/latest/v1';
async function _refreshProfiles() {
  try {
    const r = await fetch(DS_PROFILES);
    if (!r.ok) return;
    const items = await r.json();
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && item.tokenAddress) {
        _profileMap.set(item.tokenAddress, {
          icon: item.icon || '',
          header: item.header || '',
          description: item.description || '',
          links: item.links || [],
          cto: !!item.cto,
          hasDescription: !!(item.description && item.description.length > 5),
        });
      }
    }
  } catch (e) {}
}

async function _pollOnce() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.signals) return;   // disabled or trending feed toggled off
  // Refresh profiles in parallel (free data — enhances images + social data)
  _refreshProfiles().catch(() => {});
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
  // First poll seeds only tokens already alerted (persistent file-based dedup).
  // Previously seeded ALL boosts which killed legitimate new boosts on every Render deploy.
  // Now only tokens in tg-alerted.json (already posted) are seeded — fresh boosts still fire.
  if (!_trendSeeded) {
    for (const item of boosts) {
      if (item && item.tokenAddress && core.wasAlerted(item.tokenAddress)) {
        _seen.add(item.tokenAddress);
      }
    }
    _trendSeeded = true;
    // Don't return — fall through so this poll cycle can still call fresh boosts
  }

  // Dead hours: cap at 1. Weekends: allow extra (13.1% hit rate vs 4.6% weekday). Normal: cfg value.
  const _effMaxPer = _isDeadHour() ? 1 : (_isWeekend() ? Math.min(cfg.maxPer + 3, 10) : cfg.maxPer);
  let posted = 0, enrich = 0;
  for (const item of boosts) {
    if (posted >= _effMaxPer) break;
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
                            && _passesFdv(cfg, p.fdv || p.marketCap || 0)
                            && !_BAD_VENUES.has(p.dexId)
                            && (!cfg.minVolM5 || (p.volume && p.volume.m5 || 0) >= cfg.minVolM5))
                  .sort((a, b) => (b.liquidity.usd || 0) - (a.liquidity.usd || 0))[0];
    } catch (e) { continue; }
    if (!pair) { _seen.add(addr); continue; }   // mark seen even if below threshold (don't recheck forever)
    if (cfg.bullishOnly && pair.priceChange && Number(pair.priceChange.h24) < -10) { _seen.add(addr); continue; }   // skip bearish (funnel)
    if (core.wasAlerted(addr)) { _seen.add(addr); continue; }   // GLOBAL de-dupe — already called on another feed
    // TIME-QUALITY GATE: dead hours require 2x vol momentum; cap maxPer to 1 during dead windows
    const _qm = _qualityMult();
    if (_qm > 1) {
      const h1Vol = Number(pair.volume && pair.volume.h1) || 0;
      const m5Vol = Number(pair.volume && pair.volume.m5) || 0;
      const minH1 = (cfg.minVol24h / 24) * _qm;   // scaled hourly minimum
      const minM5 = (cfg.minVolM5 || 0) * _qm;
      if (h1Vol < minH1 || (minM5 && m5Vol < minM5)) { _seen.add(addr); continue; }
    }

    // social scoring — always compute to display icons; also enforce config-gated requirements
    let social = null;
    try {
      social = await _socialScore(null, addr, pair);  // enriches from pair.info + rugcheck LP
    } catch (e) {}
    if (social && (cfg.requireWebsite || cfg.requireTwitter || cfg.requireSocial || cfg.requireLocked || cfg.minSocialScore)) {
      if (!_passesSocial(cfg, social)) { _seen.add(addr); continue; }
    }

    let card = _signalCard(chain, pair, social ? social.label : '');
    let rs = null;
    if (cfg.rugFilter && chain === 'solana') rs = await _rugScore(addr);
    // Trending tokens get a LOWER rug bar: ZEROX corpus shows trending+rug:bad = 50% win rate.
    // These are already DexScreener-boosted (paid) so they have social proof. Use half the threshold.
    const _trendRugMin = Math.max(20, Math.floor(cfg.rugMinScore * 0.6));
    const _tSym2 = pair.baseToken && pair.baseToken.symbol;
    const _tFdv2 = Number(pair.fdv || pair.marketCap || 0);
    if (rs && rs.checked && rs.score < _trendRugMin) { _logReject('rug_score', _tSym2, _tFdv2, { score: rs.score, min: _trendRugMin }); _seen.add(addr); continue; }
    if (!_holdersOk(cfg, rs)) { _logReject('min_holders', _tSym2, _tFdv2, { holders: rs && rs.holders }); _seen.add(addr); continue; }
    if (!_lpLockedOk(cfg, rs)) { _logReject('lp_not_locked', _tSym2, _tFdv2, {}); _seen.add(addr); continue; }
    // DEX FLEX: paid DexScreener boost gets +5pp headroom on top10/bundlers/snipers
    let _isDexFlex = false;
    if (!_top10Ok(cfg, rs) || !_snipersOk(cfg, rs) || !_bundlersOk(cfg, rs)) {
      const _boost = _boostInfo(addr);
      if (_boost && _boost.amount > 0) {
        const _fc = Object.assign({}, cfg, {
          maxTop10Pct:   (cfg.maxTop10Pct   || 55) + 5,
          maxBundlerPct: (cfg.maxBundlerPct  || 3)  + 7,
          maxSnipersPct: (cfg.maxSnipersPct  || 5)  + 5,
        });
        if (_top10Ok(_fc, rs) && _snipersOk(_fc, rs) && _bundlersOk(_fc, rs)) _isDexFlex = true;
        else { _logReject('top10_bundlers_snipers_flex_fail', _tSym2, _tFdv2, { top10: rs && rs.top10Pct, bundlers: rs && rs.hasBundlers, snipers: rs && rs.hasSnipers }); _seen.add(addr); continue; }
      } else { _logReject('top10_bundlers_snipers', _tSym2, _tFdv2, { top10: rs && rs.top10Pct, bundlers: rs && rs.hasBundlers, snipers: rs && rs.hasSnipers }); _seen.add(addr); continue; }
    }
    if (!_liqMatches(cfg, Number(pair.liquidity && pair.liquidity.usd || 0), _tFdv2)) { _logReject('liq_mismatch', _tSym2, _tFdv2, { liq: Number(pair.liquidity && pair.liquidity.usd || 0) }); _seen.add(addr); continue; }
    if (_overCap(cfg, _tFdv2, rs)) { _logReject('over_fdv_cap', _tSym2, _tFdv2, {}); _seen.add(addr); continue; }
    // wallet cross-reference disabled (wallet tracker turned off — too many rug alerts from seeded wallets)
    const walletLine = '';
    // launch wallet / dev analysis
    let launchLine = '';
    try { const lw = wallets.analyzeLaunchWallet((rs && rs.topHolders) || [], rs); if (lw && lw.pct > 15) launchLine = `\n⚠️ <b>Dev wallet</b> ${_esc(lw.shortAddr)} holds ${lw.pct.toFixed(1)}%`; } catch (e) {}
    // scam filter — symbol + name patterns + cooldown
    const _sym = pair.baseToken && pair.baseToken.symbol;
    const _tName = pair.baseToken && pair.baseToken.name;
    if (_sym && _isScamSym(_sym)) { _logReject('scam_sym', _sym, _tFdv2, {}); _seen.add(addr); continue; }
    if (_tName && _isScamName(_tName)) { _logReject('scam_name', _sym, _tFdv2, { name: _tName }); _seen.add(addr); continue; }
    if (!_symCooldownOk(_sym)) { _logReject('sym_cooldown', _sym, _tFdv2, {}); _seen.add(addr); continue; }
    const _extra = { liq: Number(pair.liquidity && pair.liquidity.usd || 0), fdv: Number(pair.fdv || pair.marketCap || 0), mint: addr, url: pair.url || '', createdAt: pair.pairCreatedAt || 0, vol24: Number(pair.volume && pair.volume.h24) || 0, vol1h: Number(pair.volume && pair.volume.h1) || 0, websites: (pair.info && pair.info.websites) || [], socialLinks: (pair.info && pair.info.socials) || [] };
    const _accel = _isAccelerating(pair) ? '\n⚡ <b>MOMENTUM</b> — h1 vol accelerating above daily avg' : '';
    const _hourTag = _hourLabel() ? '\n' + _hourLabel() : '';
    const _flexLine = _isDexFlex ? '\n\n🟡 <b>DEX FLEX</b> — paid boost · metrics slightly outside standard gates · verify extra carefully' : '';
    const _profData = _profileMap.get(addr);
    const _ctoTag = (_profData && _profData.cto) ? '\n👥 <b>CTO</b> — community takeover project' : '';
    // GoPlus: warn on mintable/honeypot flags but don't hard-block trending (already rug-checked)
    let _gpTrendLabel = '';
    if (chain === 'solana') {
      try { const _gpT = await _goplusCheck(addr); if (_gpT && _gpT.label) _gpTrendLabel = '\n' + _gpT.label; } catch (e) {}
    }
    const _msg = card + _detailBlock(rs, social, _extra) + walletLine + launchLine + _gpTrendLabel + _accel + _hourTag + _ctoTag + _flexLine;
    const _boostData = _boostInfo(addr);
    // Image priority: profile icon > boost icon > pair.info.imageUrl > random bot banner
    const _imgUrl = (_profData && _profData.icon) || (_boostData && _boostData.icon) || (pair.info && pair.info.imageUrl) || _randomBotImg();
    const _btns = core.buildButtons(addr, chain, pair.url);
    // CA first — bare address so trading bots (Phanes etc.) catch it immediately
    const _tSym = pair.baseToken && pair.baseToken.symbol;
    await core.broadcast(`<b>$${_esc(_tSym || '')}</b> — ◎ SOL\n<code>${_esc(addr)}</code>`);
    const ok = (_imgUrl
      ? (await core.broadcastPhoto(_imgUrl, _msg, _btns))
      : (await core.broadcast(_msg, { buttons: _btns }))
    ) > 0;
    _seen.add(addr);
    if (ok) { _trackSym(_sym); core.markAlerted(addr); posted++; try { pnl.recordCall({ source: 'trending', chain, mint: addr, name: pair.baseToken && pair.baseToken.name, symbol: pair.baseToken && pair.baseToken.symbol, entryFdv: Number(pair.fdv || pair.marketCap || 0), entryPrice: Number(pair.priceUsd || 0), holders: (rs && rs.holders) || 0, vol1h: Number(pair.volume && pair.volume.h1) || 0, vol24: Number(pair.volume && pair.volume.h24) || 0, liq: Number(pair.liquidity && pair.liquidity.usd) || 0 }); } catch (e) {}
      _logFeatures({ mint: addr, chain, name: pair.baseToken && pair.baseToken.name, symbol: pair.baseToken && pair.baseToken.symbol, source: 'trending', entryFdv: Number(pair.fdv || pair.marketCap || 0), entryPrice: Number(pair.priceUsd || 0), top10Pct: (rs && rs.top10Pct) || 0, insiders: (rs && rs.insiders) || 0, bundlers: !!(rs && rs.hasBundlers), snipers: !!(rs && rs.hasSnipers), rugScore: (rs && rs.score) || 0, lpPct: (rs && rs.lp) || 0, holders: (rs && rs.holders) || 0, locked: !!(rs && rs.lp >= 80), venue: pair.dexId || '', vol24h: Number(pair.volume && pair.volume.h24) || 0, liquidity: Number(pair.liquidity && pair.liquidity.usd) || 0, sourceCount: 1 }); }
    if (_seen.size > _SEEN_CAP) { const first = _seen.values().next().value; _seen.delete(first); }
  }
}

// ── BONDED (pump.fun graduation) — "as soon as a token bonds" ──────────────
function _bondCard(c, socialLabel, opts) {
  const o = opts || {};
  const name = _esc(c.name || 'Token');
  const sym = _esc(c.symbol || '');
  const mc = c.usdMc ? _fmtUsd(c.usdMc) : '';
  const ath = c.athUsd ? _fmtUsd(c.athUsd) : '';
  const liq = c.liq ? _fmtUsd(c.liq) : '';
  const vol24 = c.vol24h ? _fmtUsd(c.vol24h) : '';
  const vol1h = o.vol1h ? _fmtUsd(o.vol1h) : '';
  const price = o.price ? _fmtPrice(o.price) : '';
  const mint = c.mint || c.address || '';
  const url = mint ? 'https://pump.fun/' + mint : '';
  const bpLabel = o.buyPressure || '';
  const statRow = [];
  if (c.holders) statRow.push('👥 ' + c.holders + ' holders');
  if (c.devPct != null && c.devPct > 0) statRow.push('👨‍💻 dev ' + Number(c.devPct).toFixed(0) + '%');
  if (c.snipers != null && c.snipers > 0) statRow.push('🔫 ' + c.snipers + ' snipers');
  return (
    `🎓 <b>$${sym || name}</b>${sym && name && name !== sym ? '  <i>' + name + '</i>' : ''} — BONDED\n` +
    `Graduated → Raydium${price ? '   💵 ' + _esc(price) : ''}\n` +
    `━━━━━━━━━━━━━\n` +
    (mc ? `💰 MC  <b>${mc}</b>${ath ? `   🏔 ATH <b>${ath}</b>` : ''}\n` : '') +
    (liq ? `💧 Liq  <b>${liq}</b>\n` : '') +
    (vol24 ? `📊 Vol  <b>${vol24}</b> 24h${vol1h ? `   <b>${vol1h}</b> 1h` : ''}\n` : '') +
    (bpLabel ? bpLabel + '\n' : '') +
    (statRow.length ? statRow.join('   ') + '\n' : '') +
    (o.bannerLabel ? o.bannerLabel + (socialLabel ? '   ' + socialLabel : '') + '\n' : (socialLabel ? socialLabel + '\n' : '')) +
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
        imageUri: c.image_uri || c.imageUri || '',
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
                .map(c => ({ mint: c.mint || c.address, name: c.name, symbol: c.symbol, holders: 0, devPct: 0, snipers: 0, imageUri: c.image_uri || '' }));
    } catch (e) { return; }
  }
  const _bondEffMaxPer = _isDeadHour() ? 1 : (_isWeekend() ? Math.min(cfg.maxPer + 3, 10) : cfg.maxPer);
  // Weekend priority sort: process low-FDV tokens first (weekend <15K FDV = 46% win rate vs 15.9% overall)
  // pumpMc is approximate — sort ascending so low-MC fresh graduates get first slot in the maxPer budget
  if (_isWeekend() && list.some(c => c.pumpMc > 0)) {
    list = [...list].sort((a, b) => {
      const aLow = a.pumpMc > 0 && a.pumpMc < 15000;
      const bLow = b.pumpMc > 0 && b.pumpMc < 15000;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      return (a.pumpMc || Infinity) - (b.pumpMc || Infinity);
    });
  }
  let posted = 0;
  for (const c of list) {
    if (posted >= _bondEffMaxPer) break;
    const mint = c.mint;
    if (!mint || _seenBond.has(mint)) continue;
    _seenBond.add(mint);
    if (_seenBond.size > _SEEN_CAP) { const f = _seenBond.values().next().value; _seenBond.delete(f); }
    if (!_bondSeeded) continue;                       // first poll only seeds (no dump on restart)
    if (core.wasAlerted(mint)) continue;              // global de-dupe
    // SCAM CHECK FIRST — before any enrichment/API calls, block known scam symbol/name patterns.
    // Done early so USOX/USUR/AORP/UNITED*/OIL*/RESERVE* can't slip through downstream.
    const _earlyBondSym = c.symbol;
    const _earlyBondName = c.name;
    if (_isScamSym(_earlyBondSym)) { _seenBond.add(mint); continue; }
    if (_isScamName(_earlyBondName)) { _seenBond.add(mint); continue; }
    if (!_symCooldownOk(_earlyBondSym)) { _seenBond.add(mint); continue; }
    // pump's own rich data as early gates (owner rules), when present
    if (c.holders && cfg.minHolders && c.holders < cfg.minHolders) continue;
    if (c.devPct && c.devPct > 25) continue;          // tightened: dev holding >25% = rug risk (was 30%)
    // ENRICH via DexScreener for reliable USD mcap/liq + confirm it's live on Raydium (else too fresh → next poll)
    let pair = null;
    try {
      const r = await fetch(DS_TOKEN('solana', mint));
      if (r.ok) { const j = await r.json(); pair = ((j && j.pairs) || []).sort((a, b) => (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0))[0]; }
    } catch (e) {}
    if (!pair) continue;                              // not indexed/tradeable yet — catch it next poll
    if (_BAD_VENUES.has(pair.dexId)) { _seenBond.add(mint); continue; }   // 0% win rate per ZEROX corpus
    const usdMc = Number(pair.fdv || pair.marketCap) || 0;
    const liq = Number(pair.liquidity && pair.liquidity.usd) || 0;
    if (usdMc <= 0 || liq <= 0) continue;
    // NO-MAN'S-LAND: $5K-$15K FDV = 0% 5x+ win rate (12 calls, 0 five-baggers in 7-day corpus).
    // Sweet spot is <$5K (61-72% 5x+) OR >$15K (validated project, 7% but 23x avg like ANMOND 49x).
    if (usdMc >= 5000 && usdMc < 15000) { _seenBond.add(mint); continue; }
    // HIGH-FDV HOLDER GATE: $15K+ bonded = only 7% 5x+ but those winners all had 200+ holders (ANMOND=201,
    // MrSue=376, SUB=311, Blackmothy=277). Require 100+ holders for $15K+ to filter low-distribution pumps.
    if (usdMc >= 15000 && c.holders > 0 && c.holders < 100) { _seenBond.add(mint); continue; }
    // 5-min momentum gate — for micro-FDV (<$5K) use relative check (5% of mcap) instead of
    // absolute $10K which is physically impossible for a just-graduated $1.5K token.
    // Data: micro-FDV bonded tokens with low holders = 52-72% win rate, 15-18x avg.
    const _m5Vol = Number(pair.volume && pair.volume.m5) || 0;
    if (usdMc >= 5000) {
      if (cfg.minVolM5 && _m5Vol < cfg.minVolM5) continue;
    } else {
      if (_m5Vol < Math.max(50, usdMc * 0.05)) continue;  // 5% of FDV in 5 min, min $50
    }
    if (!_liqMatches(cfg, liq, usdMc)) continue;      // owner rule: liq must match mcap
    // TIME-QUALITY GATE: during dead hours (UTC 11-17), require 2x momentum (volume accel must exist)
    const _bQm = _qualityMult();
    if (_bQm > 1) {
      const bH1 = Number(pair.volume && pair.volume.h1) || 0;
      const bM5 = _m5Vol;
      const bMinH1 = (cfg.minVol24h / 24) * _bQm;
      const bMinM5 = (usdMc >= 5000 ? (cfg.minVolM5 || 0) : Math.max(50, usdMc * 0.05)) * _bQm;
      if (bH1 < bMinH1 || (bMinM5 && bM5 < bMinM5)) continue;
    }
    c.usdMc = usdMc; c.liq = liq; c.vol24h = Number(pair.volume && pair.volume.h24) || 0;                     // reliable USD numbers for card + PNL entry
    // Social presence — enriched from pump.fun coin data AND DexScreener pair.info.
    // Socials are a BULLISH INDICATOR displayed on the card, not a hard gate.
    // Having Twitter/X, website, Discord, Telegram, or Instagram = more committed project.
    const _bondSocial = await _socialScore(c, mint, pair);
    // Banner status check (for card display)
    const _bondProfChk = _profileMap.get(mint);
    const _bondHasBanner = !!(_bondProfChk && _bondProfChk.header) || !!(pair.info && pair.info.header);
    const _bondBannerLabel = usdMc >= 15000 ? (_bondHasBanner ? '✅ DEX BANNER' : '❌ no banner') : '';
    // Buy pressure from DexScreener pair.txns (zero extra API calls)
    const _bp = _buyPressure(pair);
    // DUMP FILTER: if m5+h1 txns are clearly net selling (< 35% buys), skip — dump already underway
    if (_bp.bullish === false && _bp.ratio < 0.35) { _seenBond.add(mint); continue; }
    // Run enrichment APIs in parallel: rugScore + GoPlus + pump.fun detail + Raydium pool
    let gp = null; let rs = null; let pumpDet = null; let raydPool = null;
    if (cfg.rugFilter) {
      [rs, gp, pumpDet, raydPool] = await Promise.all([_rugScore(mint), _goplusCheck(mint), _pumpDetail(mint), _raydiumPool(mint)]);
      // HARD BLOCKS from GoPlus: mintable supply, hidden owner, pausable transfers, sell tax >10%
      if (gp && !gp.ok) { _seenBond.add(mint); continue; }
    } else {
      [gp, pumpDet, raydPool] = await Promise.all([_goplusCheck(mint), _pumpDetail(mint), _raydiumPool(mint)]);
      if (gp && !gp.ok) { _seenBond.add(mint); continue; }
    }
    // pump.fun detail enrichment: ban check, better socials, ATH pump-era MC, reply activity
    if (pumpDet && pumpDet.is_banned) { _seenBond.add(mint); continue; }
    if (pumpDet && pumpDet.nsfw)      { _seenBond.add(mint); continue; }
    // Enrich social with pump.fun detail fields if we didn't already get them
    if (pumpDet) {
      if (!_bondSocial.has.twitter && pumpDet.twitter) { _bondSocial.has.twitter = true; _bondSocial.score += 2; _bondSocial.label = (_bondSocial.label + ' 𝕏').trim(); }
      if (!_bondSocial.has.website && pumpDet.website) { _bondSocial.has.website = true; _bondSocial.score += 2; _bondSocial.label = (_bondSocial.label + ' 🌐').trim(); }
    }
    const _gpLabel = (gp && gp.label) ? '\n' + gp.label : '';
    // Raydium TVL label — confirms DexScreener liq with an independent source
    const _raydLabel = raydPool && raydPool.tvl > 500 ? `\n📊 Raydium TVL <b>${_fmtUsd(raydPool.tvl)}</b>${raydPool.weekVol ? `  7d vol <b>${_fmtUsd(raydPool.weekVol)}</b>` : ''}` : '';
    let card = _bondCard(c, _bondSocial.label, { vol1h: Number(pair.volume && pair.volume.h1) || 0, hasBanner: _bondHasBanner, price: Number(pair.priceUsd) || 0, bannerLabel: _bondBannerLabel, buyPressure: _bp.label });
    if (cfg.rugFilter) {
      if (rs.checked && rs.score < cfg.rugMinScore) continue;
      // Bonded hard cap: $75K — no rug-score exception. $100K-$200K bonded = 0% win rate (7-day data).
      // _overCap's rug-score≥80 exception is disabled here to stop USOX/USUR slipping through as "safe".
      if (usdMc > 75000) { _seenBond.add(mint); continue; }
      if (_overCap(cfg, usdMc, rs)) continue;         // standard maxFdv check (catches anything above global maxFdv)
      if (!_holdersOk(cfg, rs)) continue;
      if (!_lpLockedOk(cfg, rs)) continue;            // LP — not flexed
      // DEX FLEX for bonded: paid boost gets headroom on top10/bundlers/snipers
      let _bondFlex = false;
      if (!_top10Ok(cfg, rs) || !_snipersOk(cfg, rs) || !_bundlersOk(cfg, rs)) {
        const _bst = _boostInfo(mint);
        if (_bst && _bst.amount > 0) {
          const _fc = Object.assign({}, cfg, { maxTop10Pct: (cfg.maxTop10Pct || 25) + 5, maxBundlerPct: (cfg.maxBundlerPct || 3) + 7, maxSnipersPct: (cfg.maxSnipersPct || 5) + 5 });
          if (_top10Ok(_fc, rs) && _snipersOk(_fc, rs) && _bundlersOk(_fc, rs)) _bondFlex = true;
          else continue;
        } else continue;
      }
      card = card + (_bondFlex ? '\n\n🟡 <b>DEX FLEX</b> — paid boost · metrics slightly outside standard gates · verify extra carefully' : '');
    }
    // BANNER REQUIRED at $30K–$75K FDV: DexScreener banners cost ~$200 to publish.
    // Projects that paid for a banner at this MC are committed — rugs don't pay $200 to brand
    // a token they're about to dump. No banner in this FDV range = major red flag.
    // Boost is NOT required — banner only. Check profileMap (global profiles endpoint) and
    // pair.info.header (pairs endpoint) so we catch it from either data source.
    if (usdMc >= 30000 && usdMc <= 75000) {
      const _prof = _profileMap.get(mint);
      const _hasBanner = (_prof && _prof.header) || (pair.info && pair.info.header);
      if (!_hasBanner) { _seenBond.add(mint); continue; }
    }
    // scam filter — block impostor stablecoin symbol patterns + name patterns + relaunch cooldown
    const _bondSym = c.symbol || (pair.baseToken && pair.baseToken.symbol);
    const _bondName = c.name || (pair.baseToken && pair.baseToken.name);
    if (_bondSym && _isScamSym(_bondSym)) continue;
    if (_bondName && _isScamName(_bondName)) continue;
    if (!_symCooldownOk(_bondSym)) continue;
    // Merge social links: DexScreener + pump.fun detail socials
    const _pumpSocials = [];
    if (pumpDet && pumpDet.twitter && !_bondSocial.has.twitter) _pumpSocials.push({ type: 'twitter', url: pumpDet.twitter });
    if (pumpDet && pumpDet.website && !_bondSocial.has.website) _pumpSocials.push({ type: 'website', url: pumpDet.website });
    const _bondExtra = {
      liq, fdv: usdMc, mint, url: pair.url || '',
      createdAt: (pumpDet && pumpDet.created_timestamp) || pair.pairCreatedAt || 0,
      vol24: Number(pair.volume && pair.volume.h24) || 0,
      vol1h: Number(pair.volume && pair.volume.h1) || 0,
      websites: [...(pair.info && pair.info.websites || []), ...(pumpDet && pumpDet.website ? [{ url: pumpDet.website }] : [])],
      socialLinks: [...(pair.info && pair.info.socials || []), ..._pumpSocials],
      pumpReplies: pumpDet && pumpDet.reply_count > 0 ? pumpDet.reply_count : 0,
      pumpAth: pumpDet && pumpDet.ath_market_cap ? pumpDet.ath_market_cap : 0,
    };
    const _bondAccel = _isAccelerating(pair) ? '\n⚡ <b>MOMENTUM</b> — h1 vol accelerating above daily avg' : '';
    const _bondHourTag = _hourLabel() ? '\n' + _hourLabel() : '';
    const _bondDevWarn = (c.devPct === 0 && c.snipers > 15) ? '\n⚠️ Dev hold 0% + high snipers — dev may have sold at launch' : '';
    // pump.fun community activity line
    const _pumpCommunity = pumpDet && pumpDet.reply_count >= 10
      ? `\n💬 <b>${pumpDet.reply_count}</b> pump.fun replies — active community`
      : (pumpDet && pumpDet.reply_count >= 3 ? `\n💬 ${pumpDet.reply_count} replies` : '');
    const _bondMsg = card + _detailBlock(rs, _bondSocial, _bondExtra) + _gpLabel + _raydLabel + _bondAccel + _pumpCommunity + _bondHourTag + _bondDevWarn;
    const _bondProf = _profileMap.get(mint);
    const _bondBoost = _boostInfo(mint);
    const _bondImg = (_bondProf && _bondProf.icon) || (_bondBoost && _bondBoost.icon) || (pair.info && pair.info.imageUrl) || c.imageUri || _randomBotImg();
    const _bondBtns = core.buildButtons(mint, 'solana', pair.url);
    // Send CA-only message first so trading bots (Phanes etc.) that scan for a bare
    // Solana address can parse and auto-buy before the full card arrives.
    await core.broadcast(`<b>$${_esc(_bondSym || c.name)}</b> — BONDED ◎ SOL\n<code>${_esc(mint)}</code>`);
    const ok = (_bondImg
      ? (await core.broadcastPhoto(_bondImg, _bondMsg, _bondBtns))
      : (await core.broadcast(_bondMsg, { buttons: _bondBtns }))
    ) > 0;
    if (ok) {
      _trackSym(_bondSym); core.markAlerted(mint); posted++;
      try { pnl.recordCall({ source: 'bonded', chain: 'solana', mint, name: c.name, symbol: c.symbol, entryFdv: usdMc, entryPrice: Number(pair.priceUsd) || 0, holders: c.holders || 0, vol1h: Number(pair.volume && pair.volume.h1) || 0, vol24: Number(pair.volume && pair.volume.h24) || 0, liq: Number(pair.liquidity && pair.liquidity.usd) || 0 }); } catch (e) {}
      _logFeatures({ mint, chain: 'solana', name: c.name, symbol: c.symbol, source: 'bonded', entryFdv: usdMc, entryPrice: Number(pair.priceUsd) || 0, top10Pct: (rs && rs.top10Pct) || 0, insiders: (rs && rs.insiders) || 0, bundlers: !!(rs && rs.hasBundlers), snipers: (c.snipers > 0) || !!(rs && rs.hasSnipers), rugScore: (rs && rs.score) || 0, lpPct: (rs && rs.lp) || 0, holders: c.holders || (rs && rs.holders) || 0, locked: !!(rs && rs.lp >= 80), devPct: c.devPct || 0, venue: pair.dexId || 'pump', vol24h: Number(pair.volume && pair.volume.h24) || 0, liquidity: liq, sourceCount: 1 });
    }
  }
  _bondSeeded = true;   // subsequent polls only post NEWLY-bonded tokens
}

// ── PRE-BONDING FEED (pump.fun bonding curve — approaching graduation) ────────
// Watches the hottest NON-graduated pump.fun tokens. Posts when they're approaching
// graduation ($45K-$68K MC) with strong volume + community, before the bond-dump crowd.
const PF_VOLUME_HOT = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=volume&order=DESC&includeNsfw=false';
const _seenPreBond = new Set();
const _preBondBannerAlerted = new Set();  // track which pre-bond mints we've sent a "DEX BANNER PAID" alert for
let _preBondSeeded = false;

function _preBondCard(c) {
  const sym = _esc(c.symbol || '');
  const name = _esc(c.name || 'Token');
  const mc = c.usd_market_cap ? _fmtUsd(c.usd_market_cap) : '';
  const replies = c.reply_count || 0;
  const mint = c.mint || '';
  return (
    `⚡ <b>$${sym || name}</b>${sym && name && name !== sym ? '  ' + name : ''} — PRE-BOND\n` +
    `Still in bonding curve · approaching graduation\n` +
    `━━━━━━━━━━━━━\n` +
    (mc ? `💰 MC <b>${mc}</b>  <i>(graduation ~$69K)</i>\n` : '') +
    (c.holder_count ? `👥 <b>${c.holder_count}</b> holders\n` : '') +
    (replies ? `💬 <b>${replies}</b> replies\n` : '') +
    (mint ? `\n<code>${_esc(mint)}</code>\n` : '') +
    (mint ? `🔗 <a href="https://pump.fun/${_esc(mint)}">pump.fun</a>` : '') +
    `\n\n⚡ <b>HIGH RISK</b> — pre-graduation, can fail · NFA`
  );
}

async function _pollPreBonded() {
  const cfg = _cfg();
  if (!cfg.token || !cfg.preBonding) return;
  try {
    const r = await fetch(PF_VOLUME_HOT, { headers: PF_HEADERS });
    if (!r.ok) return;
    const coins = await r.json();
    const arr = Array.isArray(coins) ? coins : (coins && coins.coins) || [];
    // Filter: NOT graduated, approaching graduation ($40K-$68K MC), some community
    const candidates = arr.filter(c =>
      !c.complete && !c.raydium_pool &&
      (c.usd_market_cap || 0) >= 40000 &&
      (c.usd_market_cap || 0) < 68500 &&
      (c.reply_count || 0) >= 5 &&
      c.mint
    );
    if (!_preBondSeeded) {
      for (const c of candidates) _seenPreBond.add(c.mint);
      _preBondSeeded = true;
      return;
    }
    let posted = 0;
    // BANNER UPGRADE ALERT: check if any already-seeded pre-bond token just got a DexScreener banner/profile
    // (project paid for branding BEFORE graduation = strong commitment signal → high-priority alert)
    for (const c of candidates) {
      if (posted >= 1) break;
      const mint = c.mint;
      if (!_seenPreBond.has(mint)) continue;         // only for already-seeded tokens
      if (_preBondBannerAlerted.has(mint)) continue; // already sent this alert
      const prof = _profileMap.get(mint);
      if (!prof || !prof.header) continue;            // no banner yet
      _preBondBannerAlerted.add(mint);
      const sym = c.symbol || c.ticker || '';
      const fdv = Number(c.usd_market_cap) || 0;
      const fdvLabel = fdv ? _fmtUsd(fdv) : '';
      const bannerMsg = (
        `🚨 <b>DEX BANNER PAID — PRE-BOND</b>\n` +
        `$${_esc(sym)}${c.name && c.name !== sym ? '  <i>' + _esc(c.name) + '</i>' : ''} just paid for a DexScreener banner BEFORE graduation.\n` +
        `${fdvLabel ? `💰 MC <b>${fdvLabel}</b>  ` : ''}${c.holder_count ? `👥 <b>${c.holder_count}</b> holders  ` : ''}⚡ approaching graduation\n` +
        `This is a strong commitment signal — teams that pay ~$200 pre-bond believe in their token.\n` +
        `\n<code>${_esc(mint)}</code>\n` +
        `🔗 <a href="https://pump.fun/${_esc(mint)}">pump.fun</a>  📊 <a href="https://dexscreener.com/solana/${_esc(mint)}">DexScreener</a>\n` +
        `\n<i>NFA · still in bonding curve · can fail to graduate</i>`
      );
      const imgUrl = (prof && prof.icon) || c.image_uri || _randomBotImg();
      const btns = core.buildButtons(mint, 'solana', 'https://dexscreener.com/solana/' + mint);
      if (imgUrl) await core.broadcastPhoto(imgUrl, bannerMsg, btns);
      else await core.broadcast(bannerMsg, { buttons: btns });
      posted++;
    }
    for (const c of candidates) {
      if (posted >= 2) break;
      const mint = c.mint;
      if (_seenPreBond.has(mint) || core.wasAlerted(mint)) continue;
      _seenPreBond.add(mint);
      const sym = c.symbol || '';
      if (sym && _isScamSym(sym)) continue;
      if (!_symCooldownOk(sym)) continue;
      const card = _preBondCard(c);
      // CA first so trading bots can parse the address immediately
      await core.broadcast(`<b>$${_esc(sym || c.name)}</b> — PRE-BOND ◎ SOL\n<code>${_esc(mint)}</code>`);
      const imgUrl = c.image_uri || _randomBotImg();
      const btns = core.buildButtons(mint, 'solana', 'https://pump.fun/' + mint);
      const ok = (imgUrl
        ? await core.broadcastPhoto(imgUrl, card, btns)
        : await core.broadcast(card, { buttons: btns })
      ) > 0;
      if (ok) {
        _trackSym(sym); core.markAlerted(mint); posted++;
        try { pnl.recordCall({ source: 'pre_bonding', chain: 'solana', mint, name: c.name || sym, symbol: sym, entryFdv: Number(c.usd_market_cap) || 0, entryPrice: 0, holders: Number(c.holder_count) || 0, vol1h: 0, vol24: 0, liq: 0 }); } catch (e) {}
      }
    }
    if (_seenPreBond.size > 2000) { const f = _seenPreBond.values().next().value; _seenPreBond.delete(f); }
  } catch (e) { console.warn('[tg-signals] pre-bond poll error:', e && e.message); }
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
  const e = extra || {};
  const parts = [];

  // ── SAFETY BLOCK ──────────────────────────────────────────────────────
  if (rs && rs.checked) {
    parts.push('\n━━ 🛡 SAFETY ━━');
    const badge = rs.score >= 80 ? '🟢' : rs.score >= 50 ? '🟡' : '🔴';
    parts.push(`Score    ${badge} <b>${rs.score}/100</b>`);
    // LP lock
    if (rs.lp >= 99)      parts.push(`LP Lock  🔒 <b>100%</b>`);
    else if (rs.lp >= 80) parts.push(`LP Lock  🔐 <b>${rs.lp.toFixed(0)}%</b>`);
    else if (rs.lp > 0)   parts.push(`LP Lock  ⚠️ <b>${rs.lp.toFixed(0)}%</b> — unlocked`);
    else                  parts.push(`LP Lock  ⚠️ unknown`);
    // Holders + top10 concentration
    if (rs.holders) {
      const top10badge = rs.top10Pct < 30 ? '🟢' : rs.top10Pct < 50 ? '🟡' : '🔴';
      let h = `Holders  <b>${rs.holders}</b>`;
      if (rs.top10Pct) h += `   Top10 ${top10badge} <b>${rs.top10Pct.toFixed(0)}%</b>`;
      if (rs.insiders)  h += `   🕵️ ${rs.insiders}`;
      parts.push(h);
    }
    // Bundlers / Snipers status
    const bSt = rs.hasBundlers ? `📦 ${rs.bundlePct ? rs.bundlePct.toFixed(0) + '%' : 'yes'}` : '✅ clean';
    const sSt = rs.hasSnipers  ? `🔫 ${rs.insiders || '?'} insider(s)` : '✅ clean';
    parts.push(`Bundlers ${bSt}   Snipers ${sSt}`);
    // Whale conviction + social commitment composite
    if (rs.convictionLabel || (social && social.score > 0)) {
      let convLine = '';
      if (rs.convictionLabel) convLine = `🐋 Conviction  <b>${rs.convictionLabel}</b>`;
      if (social && social.score >= 3) {
        const socialStr = `🔗 Socials ${social.score >= 6 ? '🟢' : '🟡'} <b>${social.label}</b>`;
        convLine = convLine ? convLine + '   ' + socialStr : socialStr;
      } else if (social && social.score > 0 && social.label) {
        convLine = (convLine ? convLine + '   ' : '') + `🔗 <b>${social.label}</b>`;
      }
      if (convLine) parts.push(convLine);
    }
    // Top risk flags (max 2)
    if (rs.risks && rs.risks.length) {
      const topR = rs.risks.slice(0, 2).map(r => r.name).filter(Boolean);
      if (topR.length) parts.push(`⚠️ ${topR.join('  ·  ')}`);
    }
  }

  // ── LINKS BLOCK ───────────────────────────────────────────────────────
  const sites = e.websites || [];
  const socials = e.socialLinks || [];
  const linkParts = [];
  for (const w of sites) if (w.url) linkParts.push(`🌐 <a href="${_esc(w.url)}">${_esc(w.label || 'Website')}</a>`);
  for (const s of socials) {
    const icon = s.type === 'twitter' || s.type === 'x' ? '𝕏' : s.type === 'telegram' ? '📱' : s.type === 'discord' ? '💬' : s.type === 'instagram' ? '📸' : '🔗';
    if (s.url) linkParts.push(`${icon} <a href="${_esc(s.url)}">${_esc(s.type || 'social')}</a>`);
  }
  if (!linkParts.length && social && social.has) {
    if (social.has.website) linkParts.push('🌐 Web');
    if (social.has.twitter) linkParts.push('𝕏 Twitter');
    if (social.has.telegram) linkParts.push('📱 TG');
    if (social.has.discord) linkParts.push('💬 Discord');
  }
  if (e.url) linkParts.push(`📊 <a href="${_esc(e.url)}">Chart</a>`);
  if (linkParts.length) parts.push('\n' + linkParts.join('  '));

  // ── CONTRACT ADDRESS ──────────────────────────────────────────────────
  if (e.mint) parts.push(`\n<code>${_esc(e.mint)}</code>`);

  // ── FOOTER ────────────────────────────────────────────────────────────
  parts.push('\n<i>NFA · DYOR</i>');

  return '\n' + parts.join('\n');
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
          // For new_pools on Solana: only call tokens that graduated from pump.fun.
          // Direct Raydium launches (no pump.fun history) have a near-zero win rate vs pump.fun graduates.
          if (kind === 'new_pools' && net === 'solana' && _taddr) {
            const _pumpCheck = await _pumpDetail(_taddr);
            if (!_pumpCheck) { _seenPool.add(id); continue; }   // not pump.fun origin — skip silently
            if (_pumpCheck.is_banned || _pumpCheck.nsfw) { _seenPool.add(id); continue; }
          }
          let card = _poolCard(net, kind, a, _taddr);
          // Sleeper revival detection: pool/token created >30 days ago but showing fresh momentum.
          // Old tokens that have been dormant then suddenly spike 15%+ = high-asymmetry recovery play.
          const _poolCreatedAt = a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0;
          const _poolAgeMs = _poolCreatedAt > 0 ? Date.now() - _poolCreatedAt : 0;
          const _isRevival = _poolAgeMs > 30 * 86400000 && isFinite(_chg) && _chg >= 15;
          if (_isRevival) {
            const _ageLabel = _ageStr(_poolAgeMs);
            card = `🌅 <b>REVIVAL PLAY</b> — ${_ageLabel} old · +${Math.round(_chg)}% today\n` + card;
          }
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
          const ok = (await core.broadcast(card + _detailBlock(rs, social, { liq, fdv, mint: _taddr || _dk, url: _u, createdAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0, vol24: Number(a.volume_usd && a.volume_usd.h24) || 0, vol1h: Number(a.volume_usd && a.volume_usd.h1) || 0 }), { buttons: core.buildButtons(_taddr || _dk, net, _u) })) > 0;
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

  // Wallet watcher disabled — ape alerts from seeded RAC-cluster wallets were flagging rugs
  // Re-enable: wallets.startWalletWatcher() here when better wallet sources are identified

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
  // pre-bonding feed (pump.fun tokens approaching graduation — early entry before the bond)
  if (cfg.preBonding) {
    setTimeout(() => { _pollPreBonded().catch(() => {}); }, 5000);
    const _preBondTimer = setInterval(() => { _pollPreBonded().catch(() => {}); }, 3 * 60000);   // every 3 min
    if (_preBondTimer.unref) _preBondTimer.unref();
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
