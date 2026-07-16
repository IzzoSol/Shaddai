/* ══════════════════════════════════════════════════════════════════════════
   pipeline.js — 4-stage signal pipeline:
     1. DISCOVER  — scan providers for new tokens (discovery role only)
     2. CONFIRM   — multi-source overlap scoring (confidence bonus)
     3. VALIDATE  — risk checks on shortlisted candidates (risk role only)
     4. ENRICH    — full metrics + social data for passing tokens

   Designed for 24/7 operation with minimal API usage.
   Providers are polled on staggered schedules, not every cycle.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const providers = require('./providers');
const tokenDb = require('./token-db');
const core = require('./telegram-core');

// ── STAGE TIMERS ────────────────────────────────────────────────────────────
let _timers = { discover: null, context: null };
const DISCOVER_INTERVAL = 20000;    // 20s base for discovery
const CONTEXT_INTERVAL = 120000;    // 2 min for context APIs
const CONFIRM_WINDOW = 3600000;     // 1 hour for multi-source confirmation
const ENRICH_DELAY = 5000;          // 5s delay before enriching a candidate

// ── STATS ───────────────────────────────────────────────────────────────────
const _stats = {
  discovered: 0, confirmed: 0, validated: 0, enriched: 0, posted: 0,
  rejected: 0, lastCycle: 0, cycleCount: 0,
};

// ── CANDIDATE QUEUE ─────────────────────────────────────────────────────────
// Tokens that pass discovery → waiting for confirmation → validation → enrich
const _candidates = new Map();   // mint → { mint, chain, name, symbol, sources: Set, metrics, stage, ts }
const _cooldowns = new Map();    // mint → lastPostTs (prevent re-posting within 30 min)
const COOLDOWN_MS = 30 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════════════
//  STAGE 1: DISCOVER
//  Scan discovery providers on staggered intervals.
//  DexScreener boosts: every 20s (primary)
//  GeckoTerminal new pools: every 30s (secondary)
//  CoinGecko trending: every 60s (tertiary)
// ══════════════════════════════════════════════════════════════════════════
let _lastDex = 0, _lastGt = 0, _lastCg = 0;

async function _discover() {
  const now = Date.now();
  const cfg = core.getConfig();
  if (!cfg.signals && !cfg.newpools && !cfg.trending) return;

  // DexScreener boosts (every 20s)
  if (now - _lastDex >= 20000) {
    _lastDex = now;
    try {
      const boosts = await providers.dexBoosts();
      if (Array.isArray(boosts)) {
        for (const item of boosts) {
          const chain = String(item.chainId || '').toLowerCase();
          const addr = item.tokenAddress;
          if (!addr || !cfg.chains.includes(chain)) continue;
          if (_cooldowns.has(addr) && now - _cooldowns.get(addr) < COOLDOWN_MS) continue;
          _addCandidate(addr, chain, 'dexscreener', { boost: true });
        }
      }
    } catch (e) {}
  }

  // GeckoTerminal new pools (every 30s)
  if (now - _lastGt >= 30000) {
    _lastGt = now;
    for (const chain of cfg.chains) {
      if (!cfg.newpools && !cfg.trending) continue;
      try {
        const kinds = [];
        if (cfg.newpools) kinds.push('new_pools');
        if (cfg.trending) kinds.push('trending_pools');
        for (const kind of kinds) {
          const data = await providers.gtPools(chain, kind);
          const pools = (data && data.data) || [];
          for (const p of pools) {
            const a = p && p.attributes; const id = p && p.id;
            if (!a || !id) continue;
            const bt = (p.relationships && p.relationships.base_token && p.relationships.base_token.data && p.relationships.base_token.data.id) || '';
            const addr = bt.indexOf('_') >= 0 ? bt.slice(bt.indexOf('_') + 1) : bt;
            if (!addr) continue;
            if (_cooldowns.has(addr) && now - _cooldowns.get(addr) < COOLDOWN_MS) continue;
            const fdv = Number(a.fdv_usd) || 0;
            const liq = Number(a.reserve_in_usd) || 0;
            const vol = Number(a.volume_usd && a.volume_usd.h24) || 0;
            if (liq < (cfg.minLiq || 1000) || vol < (cfg.minVol24h || 500)) continue;
            if (cfg.maxFdv && fdv > cfg.maxFdv) continue;
            _addCandidate(addr, chain, 'geckoterminal', { fdv, liq, vol, name: a.name, kind });
          }
        }
      } catch (e) {}
    }
  }

  // CoinGecko trending (every 60s)
  if (now - _lastCg >= 60000) {
    _lastCg = now;
    try {
      const trending = await providers.cgTrending();
      const coins = (trending && trending.coins) || [];
      for (const tc of coins) {
        const item = tc.item;
        if (!item || !item.small || !item.data) continue;
        // CoinGecko doesn't give contract address directly, use symbol for tracking
        const sym = (item.item && item.item.symbol) || '';
        if (sym) _addCandidate('cg-' + sym.toLowerCase(), 'solana', 'coingecko', { symbol: sym, name: item.item.name, cgRank: item.item.market_cap_rank });
      }
    } catch (e) {}
  }

  _stats.discovered = _candidates.size;
}

// ══════════════════════════════════════════════════════════════════════════
//  STAGE 2: CONFIRM
//  Multi-source overlap scoring.
//  If a token appears in 2+ discovery sources within CONFIRM_WINDOW → boost.
// ══════════════════════════════════════════════════════════════════════════
function _addCandidate(mint, chain, source, data) {
  if (!_candidates.has(mint)) {
    _candidates.set(mint, {
      mint, chain, name: data.name || '', symbol: data.symbol || '',
      sources: new Set(), metrics: {}, stage: 'discovered', ts: Date.now(),
      confidence: 0,
    });
  }
  const c = _candidates.get(mint);
  c.sources.add(source);
  c.metrics[source] = data;
  if (data.name && !c.name) c.name = data.name;
  if (data.symbol && !c.symbol) c.symbol = data.symbol;
  // record in token-db for persistence
  tokenDb.recordSource(mint, source, { fdv: data.fdv || 0, price: data.price || 0 });
  tokenDb.upsertSnapshot(mint, { chain, name: c.name, symbol: c.symbol, fdv: data.fdv, source });
  // compute overlap bonus
  const ov = tokenDb.overlapBonus(mint);
  c.confidence = ov.bonus;
  c.sourceCount = ov.count;
  c.sourceNames = ov.names;
  if (c.sourceCount >= 2) c.stage = 'confirmed';
  _stats.confirmed = [..._candidates.values()].filter(x => x.stage === 'confirmed' || x.stage === 'validated').length;
}

function _confirm() {
  const now = Date.now();
  for (const [mint, c] of _candidates) {
    if (c.stage !== 'discovered') continue;
    // check if cooldown
    if (_cooldowns.has(mint) && now - _cooldowns.get(mint) < COOLDOWN_MS) { _candidates.delete(mint); continue; }
    // age out candidates that never got confirmed (15 min)
    if (now - c.ts > 15 * 60 * 1000) { _candidates.delete(mint); continue; }
    // check overlap
    const ov = tokenDb.overlapBonus(mint);
    c.confidence = ov.bonus;
    c.sourceCount = ov.count;
    if (c.sourceCount >= 2) c.stage = 'confirmed';
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  STAGE 3: VALIDATE
//  Risk checks on confirmed candidates (RugCheck, GoPlus, Honeypot).
//  Only runs on Solana tokens. Other chains skip risk checks.
//  Risk APIs are candidate-triggered, then cached 5-30 min.
// ══════════════════════════════════════════════════════════════════════════
async function _validate() {
  const cfg = core.getConfig();
  for (const [mint, c] of _candidates) {
    if (c.stage !== 'confirmed') continue;
    if (c.chain !== 'solana') { c.stage = 'validated'; continue; }   // skip risk for non-Solana
    if (!cfg.rugFilter) { c.stage = 'validated'; continue; }

    // RugCheck
    const rc = await providers.rugReport(mint);
    if (rc) {
      const score = (rc.score_normalised != null ? rc.score_normalised : rc.score) || 0;
      const risks = rc.risks || [];
      const danger = risks.filter(x => String(x.level || '').toLowerCase() === 'danger').length;
      const topHolders = rc.topHolders || [];
      const top10Pct = topHolders.slice(0, 10).reduce((s, h) => s + (Number(h.pct) || 0), 0);
      const insiders = topHolders.filter(h => h.insider).length;
      let lpPct = 0;
      try { const m = (rc.markets || [])[0]; lpPct = Number((m && m.lp && (m.lp.lpLockedPct != null ? m.lp.lpLockedPct : m.lp.lpLocked)) || 0); } catch (e) {}
      const holders = Number(rc.totalHolders || 0);

      c.metrics.rugScore = score;
      c.metrics.top10Pct = top10Pct;
      c.metrics.insiders = insiders;
      c.metrics.lpPct = lpPct;
      c.metrics.holders = holders;
      c.metrics.dangerRisks = danger;

      // apply filters — HARD REJECTS (locked liq, sniper/bundler cap under 10%)
      if (score < (cfg.rugMinScore || 45)) { _reject(c, 'rug score ' + score + ' < ' + (cfg.rugMinScore || 45)); continue; }
      if (holders && holders < (cfg.minHolders || 5)) { _reject(c, 'holders ' + holders + ' < ' + (cfg.minHolders || 5)); continue; }
      // locked LP check: LP must be locked ≥50%
      if (cfg.requireLocked && lpPct < 50) { _reject(c, 'LP not locked: ' + lpPct.toFixed(1) + '% < 50%'); continue; }
      // snipers + bundlers combined must be < 10% of holders
      const sniperBundlerPct = holders > 0 ? ((insiders + bundlerClusters) / holders * 100) : 0;
      if (cfg.maxSnipersPct && sniperBundlerPct >= cfg.maxSnipersPct) { _reject(c, 'snipers+bundlers ' + sniperBundlerPct.toFixed(1) + '% >= ' + cfg.maxSnipersPct + '%'); continue; }
      // whale conviction bonus: top10 ≥15% = bullish, ≥50% = extra conviction
      if (top10Pct >= 50) c.confidence += (cfg.top10BullishBonus || 5);
      else if (top10Pct >= (cfg.minTop10Pct || 15)) c.confidence += 3;

      // risk bonus
      if (score >= 70 && danger === 0) c.confidence += 10;
    }

    c.stage = 'validated';
  }
  _stats.validated = [..._candidates.values()].filter(x => x.stage === 'validated' || x.stage === 'enriched').length;
}

function _reject(c, reason) {
  c.stage = 'rejected';
  _stats.rejected++;
  _cooldowns.set(c.mint, Date.now());
  console.log(`[pipeline] REJECTED ${c.symbol || c.mint}: ${reason}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  STAGE 4: ENRICH
//  Full metrics + social data for validated tokens.
//  Returns the final signal card data for posting.
// ══════════════════════════════════════════════════════════════════════════
async function _enrich() {
  const cfg = core.getConfig();
  const results = [];
  for (const [mint, c] of _candidates) {
    if (c.stage !== 'validated') continue;
    // get full DexScreener data
    const ds = await providers.dexToken(c.chain, mint);
    if (ds && ds.pairs && ds.pairs.length > 0) {
      const pair = ds.pairs.sort((a, b) => (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0))[0];
      c.metrics.price = Number(pair.priceUsd) || 0;
      c.metrics.fdv = Number(pair.fdv || pair.marketCap) || c.metrics.fdv || 0;
      c.metrics.vol24h = Number(pair.volume && pair.volume.h24) || 0;
      c.metrics.liq = Number(pair.liquidity && pair.liquidity.usd) || 0;
      c.metrics.change24h = Number(pair.priceChange && pair.priceChange.h24) || 0;
      c.metrics.url = pair.url || '';
      if (pair.baseToken) {
        if (pair.baseToken.name && !c.name) c.name = pair.baseToken.name;
        if (pair.baseToken.symbol && !c.symbol) c.symbol = pair.baseToken.symbol;
      }
    }

    // apply learned weights from ZEROX
    const learnBonus = tokenDb.scoreCandidate({
      sourceCount: c.sourceCount || 1,
      socialScore: (cfg.minSocialScore || 0),
      hasWebsite: false, hasTwitter: false,
      locked: c.metrics.lpPct >= 99,
      top10Pct: c.metrics.top10Pct || 100,
      bundlers: false, snipers: (c.metrics.insiders || 0) > 0,
      rugScore: c.metrics.rugScore || 0,
      fdvAtCall: c.metrics.fdv || 0,
    });
    c.confidence += learnBonus;

    // final filters
    if (cfg.maxFdv && c.metrics.fdv > cfg.maxFdv) { _reject(c, 'fdv $' + (c.metrics.fdv/1000).toFixed(0) + 'K > $' + (cfg.maxFdv/1000).toFixed(0) + 'K'); continue; }
    if (cfg.minLiq && c.metrics.liq < cfg.minLiq) { _reject(c, 'liq $' + c.metrics.liq.toFixed(0) + ' < $' + cfg.minLiq); continue; }
    if (cfg.minVol24h && c.metrics.vol24h < cfg.minVol24h) { _reject(c, 'vol $' + c.metrics.vol24h.toFixed(0) + ' < $' + cfg.minVol24h); continue; }
    if (cfg.bullishOnly && c.metrics.change24h < -10) { _reject(c, 'bearish ' + c.metrics.change24h.toFixed(0) + '%'); continue; }

    c.stage = 'enriched';
    c.finalConfidence = c.confidence;
    results.push(c);
  }
  _stats.enriched = results.length;
  return results;
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN CYCLE — runs all 4 stages
// ══════════════════════════════════════════════════════════════════════════
let _running = false;
async function _cycle() {
  if (_running) return;
  _running = true;
  try {
    _stats.lastCycle = Date.now();
    _stats.cycleCount++;
    await _discover();
    _confirm();
    await _validate();
    const enriched = await _enrich();
    // return enriched candidates for posting
    return enriched;
  } finally {
    _running = false;
  }
}

function getStats() { return Object.assign({}, _stats, { candidates: _candidates.size, cooldowns: _cooldowns.size }); }
function getCandidates() {
  const out = [];
  for (const [, c] of _candidates) {
    out.push({
      mint: c.mint, chain: c.chain, name: c.name, symbol: c.symbol,
      stage: c.stage, confidence: c.confidence, sourceCount: c.sourceCount,
      sourceNames: c.sourceNames, ts: c.ts, metrics: c.metrics,
    });
  }
  return out;
}
function addCooldown(mint) { _cooldowns.set(mint, Date.now()); }

module.exports = { _cycle, getStats, getCandidates, addCooldown };
