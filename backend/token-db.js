/* ══════════════════════════════════════════════════════════════════════════
   token-db.js — Token snapshot persistence, call outcome tracking,
   and ZEROX learning data.

   Stores:
     - Token snapshots (seen across providers, timestamps, metrics)
     - Call outcomes (entry, peak, current, source, multipliers)
     - Feature vectors for ZEROX learning (what made winners win)
     - Provider overlap records (multi-source confirmation)
     - Historical stats (hit rates by source, FDV range, social presence)

   All persisted to JSON files. Designed for 24/7 operation on Render.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

// TG_DATA_DIR lets state live on a Render persistent disk (paid plan) so learning/dedupe/PNL
// survive redeploys. Unset (free plan) = ephemeral local dir; seed-guards mitigate restart repeats.
const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, 'data');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'token-snapshots.json');
const CALLS_FILE = path.join(DATA_DIR, 'token-calls.json');
const LEARNING_FILE = path.join(DATA_DIR, 'zerox-learning.json');
const OVERLAP_FILE = path.join(DATA_DIR, 'source-overlap.json');

function _ensure() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
function _read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function _write(f, o) { try { _ensure(); fs.writeFileSync(f, JSON.stringify(o, null, 2)); } catch (e) {} }

// ══════════════════════════════════════════════════════════════════════════
//  TOKEN SNAPSHOTS — when we first see a token, track its journey
// ══════════════════════════════════════════════════════════════════════════
let _snaps = _read(SNAPSHOTS_FILE, {});

function upsertSnapshot(mint, data) {
  if (!mint) return;
  const now = Date.now();
  if (!_snaps[mint]) {
    _snaps[mint] = {
      mint, chain: data.chain || 'solana',
      name: data.name || '', symbol: data.symbol || '',
      firstSeen: now, lastSeen: now,
      entryFdv: data.fdv || data.entryFdv || 0,
      entryPrice: data.price || data.entryPrice || 0,
      sources: {},          // { dexscreener: { lastSeen, fdv }, geckoterminal: { ... } }
      metrics: {},          // { holders, top10Pct, lpLocked, socialScore, ... }
      confirmed: false,
      validated: false,
      enriched: false,
    };
  }
  const snap = _snaps[mint];
  snap.lastSeen = now;
  if (data.name) snap.name = data.name;
  if (data.symbol) snap.symbol = data.symbol;
  if (data.fdv && !snap.entryFdv) snap.entryFdv = data.fdv;
  if (data.price && !snap.entryPrice) snap.entryPrice = data.price;
  // record which source saw it
  if (data.source) {
    snap.sources[data.source] = { lastSeen: now, fdv: data.fdv || 0, price: data.price || 0, raw: data.raw || null };
  }
  // merge metrics
  if (data.metrics) Object.assign(snap.metrics, data.metrics);
  // cleanup old snapshots (keep 30 days)
  const cutoff = now - 30 * 24 * 3600 * 1000;
  for (const [k, v] of Object.entries(_snaps)) {
    if (v.lastSeen < cutoff) delete _snaps[k];
  }
  return snap;
}

function getSnapshot(mint) { return _snaps[mint] || null; }
function getSnapshots() { return _snaps; }
function saveSnapshots() { _write(SNAPSHOTS_FILE, _snaps); }

// ══════════════════════════════════════════════════════════════════════════
//  CALL OUTCOMES — what happened after we called a token
// ══════════════════════════════════════════════════════════════════════════
let _calls = _read(CALLS_FILE, { calls: [], features: [] });

function recordOutcome(c) {
  const now = Date.now();
  _calls.calls.push({
    mint: c.mint, chain: c.chain || 'solana',
    name: c.name || '', symbol: c.symbol || '',
    source: c.source || 'unknown',
    entryFdv: c.entryFdv || 0, entryPrice: c.entryPrice || 0,
    ts: now,
    peakMult: 1, curMult: 1, curFdv: c.entryFdv || 0,
    // feature vector (what we knew at call time)
    features: {
      sourceCount: c.sourceCount || 1,
      sources: c.sources || [c.source],
      socialScore: c.socialScore || 0,
      hasWebsite: c.hasWebsite || false,
      hasTwitter: c.hasTwitter || false,
      hasTelegram: c.hasTelegram || false,
      hasDiscord: c.hasDiscord || false,
      locked: c.locked || false,
      top10Pct: c.top10Pct || 0,
      insiders: c.insiders || 0,
      bundlers: c.bundlers || false,
      snipers: c.snipers || false,
      rugScore: c.rugScore || 0,
      lpPct: c.lpPct || 0,
      holders: c.holders || 0,
      fdvAtCall: c.entryFdv || 0,
      volAtCall: c.vol24h || 0,
      liqAtCall: c.liquidity || 0,
    },
    // outcome
    milestones: [],
    closed: false,
  });
  if (_calls.calls.length > 5000) _calls.calls = _calls.calls.slice(-5000);   // cap (was unbounded)
  _write(CALLS_FILE, _calls);
}

function updateOutcome(mint, updates) {
  const c = _calls.calls.find(x => x.mint === mint && !x.closed);
  if (!c) return;
  Object.assign(c, updates);
  if (updates.peakMult && updates.peakMult >= 2 && !c.milestones.includes(2)) c.milestones.push(2);
  if (updates.peakMult && updates.peakMult >= 5 && !c.milestones.includes(5)) c.milestones.push(5);
  if (updates.peakMult && updates.peakMult >= 10 && !c.milestones.includes(10)) c.milestones.push(10);
  if (updates.peakMult && updates.peakMult >= 25 && !c.milestones.includes(25)) c.milestones.push(25);
  _write(CALLS_FILE, _calls);
}

function getOutcomes() { return _calls.calls; }
function getWinners() { return _calls.calls.filter(c => c.peakMult >= 2); }
function getLosers() { return _calls.calls.filter(c => c.peakMult < 2 && c.closed); }

// ══════════════════════════════════════════════════════════════════════════
//  ZEROX LEARNING — extract patterns from winners/losers
// ══════════════════════════════════════════════════════════════════════════
let _learning = _read(LEARNING_FILE, {
  lastAnalyzed: 0,
  patterns: {},       // { feature: { winRate, avgMult, sampleSize } }
  weights: {},        // computed weights for scoring
  totalAnalyzed: 0,
});

function analyzeOutcomes() {
  const winners = _calls.calls.filter(c => c.peakMult >= 2);
  const losers = _calls.calls.filter(c => c.peakMult < 2);
  if (winners.length + losers.length < 5) return _learning;   // need data

  const patterns = {};
  const _analyze = (feat, val, isWin) => {
    const key = feat + ':' + val;
    if (!patterns[key]) patterns[key] = { wins: 0, losses: 0, totalMult: 0 };
    if (isWin) { patterns[key].wins++; patterns[key].totalMult += 1; }
    else patterns[key].losses++;
  };

  for (const w of winners) {
    if (!w.features) continue;
    _analyze('sourceCount', Math.min(w.features.sourceCount, 3), true);
    _analyze('socialScore', Math.min(w.features.socialScore, 6), true);
    _analyze('hasWebsite', w.features.hasWebsite, true);
    _analyze('hasTwitter', w.features.hasTwitter, true);
    _analyze('locked', w.features.locked, true);
    _analyze('top10Bucket', w.features.top10Pct < 18 ? 'clean' : w.features.top10Pct < 30 ? 'moderate' : 'heavy', true);
    _analyze('fdvBucket', w.features.fdvAtCall < 50000 ? 'micro' : w.features.fdvAtCall < 200000 ? 'small' : 'mid', true);
    _analyze('rugBucket', w.features.rugScore >= 70 ? 'safe' : w.features.rugScore >= 45 ? 'ok' : 'risky', true);
    _analyze('bundlers', w.features.bundlers, true);
    _analyze('snipers', w.features.snipers, true);
  }
  for (const l of losers) {
    if (!l.features) continue;
    _analyze('sourceCount', Math.min(l.features.sourceCount, 3), false);
    _analyze('socialScore', Math.min(l.features.socialScore, 6), false);
    _analyze('hasWebsite', l.features.hasWebsite, false);
    _analyze('hasTwitter', l.features.hasTwitter, false);
    _analyze('locked', l.features.locked, false);
    _analyze('top10Bucket', l.features.top10Pct < 18 ? 'clean' : l.features.top10Pct < 30 ? 'moderate' : 'heavy', false);
    _analyze('fdvBucket', l.features.fdvAtCall < 50000 ? 'micro' : l.features.fdvAtCall < 200000 ? 'small' : 'mid', false);
    _analyze('rugBucket', l.features.rugScore >= 70 ? 'safe' : l.features.rugScore >= 45 ? 'ok' : 'risky', false);
    _analyze('bundlers', l.features.bundlers, false);
    _analyze('snipers', l.features.snipers, false);
  }

  // compute weights: winRate for each feature
  const weights = {};
  for (const [key, v] of Object.entries(patterns)) {
    const total = v.wins + v.losses;
    const winRate = total > 0 ? v.wins / total : 0.5;
    const avgMult = v.wins > 0 ? v.totalMult / v.wins : 1;
    patterns[key].winRate = Math.round(winRate * 100);
    patterns[key].avgMult = Math.round(avgMult * 10) / 10;
    patterns[key].sampleSize = total;
    weights[key] = Math.round((winRate - 0.5) * 100);   // -50 to +50 bonus
  }

  _learning = { lastAnalyzed: Date.now(), patterns, weights, totalAnalyzed: winners.length + losers.length };
  _write(LEARNING_FILE, _learning);
  return _learning;
}

function getLearning() { return _learning; }
function getWeights() { return _learning.weights || {}; }

// scoring function: apply learned weights to a candidate
function scoreCandidate(features) {
  const w = _learning.weights || {};
  let bonus = 0;
  const _apply = (feat, val) => {
    const key = feat + ':' + val;
    if (w[key] != null) bonus += w[key];
  };
  _apply('sourceCount', Math.min(features.sourceCount || 1, 3));
  _apply('socialScore', Math.min(features.socialScore || 0, 6));
  _apply('hasWebsite', features.hasWebsite || false);
  _apply('hasTwitter', features.hasTwitter || false);
  _apply('locked', features.locked || false);
  _apply('top10Bucket', (features.top10Pct || 100) < 18 ? 'clean' : (features.top10Pct || 100) < 30 ? 'moderate' : 'heavy');
  _apply('fdvBucket', (features.fdvAtCall || 0) < 50000 ? 'micro' : (features.fdvAtCall || 0) < 200000 ? 'small' : 'mid');
  _apply('rugBucket', (features.rugScore || 0) >= 70 ? 'safe' : (features.rugScore || 0) >= 45 ? 'ok' : 'risky');
  _apply('bundlers', features.bundlers || false);
  _apply('snipers', features.snipers || false);
  return bonus;
}

// ══════════════════════════════════════════════════════════════════════════
//  SOURCE OVERLAP — multi-source confirmation tracking
// ══════════════════════════════════════════════════════════════════════════
let _overlap = _read(OVERLAP_FILE, {});

function recordSource(mint, source, data) {
  const now = Date.now();
  if (!_overlap[mint]) _overlap[mint] = {};
  _overlap[mint][source] = { ts: now, fdv: data.fdv || 0, price: data.price || 0 };
  // cleanup old overlap records (keep 2 hours)
  for (const [k, v] of Object.entries(_overlap[mint])) {
    if (now - v.ts > 2 * 3600 * 1000) delete _overlap[mint][k];
  }
  if (Object.keys(_overlap[mint]).length === 0) delete _overlap[mint];
}

function getOverlap(mint) {
  const now = Date.now();
  const sources = _overlap[mint] || {};
  const active = {};
  for (const [k, v] of Object.entries(sources)) {
    if (now - v.ts < 2 * 3600 * 1000) active[k] = v;   // within 2 hours
  }
  return { sources: active, count: Object.keys(active).length, names: Object.keys(active) };
}

function overlapBonus(mint) {
  const o = getOverlap(mint);
  let bonus = 0;
  if (o.count >= 3) bonus += 20;
  else if (o.count >= 2) bonus += 10;
  if (o.names.includes('dexscreener') && o.names.includes('geckoterminal')) bonus += 5;
  if (o.names.includes('coingecko') && o.names.includes('dexscreener')) bonus += 5;
  return { bonus, ...o };
}

function saveOverlaps() { _write(OVERLAP_FILE, _overlap); }

// ══════════════════════════════════════════════════════════════════════════
//  HISTORICAL STATS — for ZEROX dashboard
// ══════════════════════════════════════════════════════════════════════════
function historicalStats() {
  const calls = _calls.calls;
  const total = calls.length;
  const winners = calls.filter(c => c.peakMult >= 2);
  const losers = calls.filter(c => c.peakMult < 2);
  const bySource = {};
  for (const c of calls) {
    if (!bySource[c.source]) bySource[c.source] = { total: 0, wins: 0 };
    bySource[c.source].total++;
    if (c.peakMult >= 2) bySource[c.source].wins++;
  }
  // feature correlation: what % of winners had website, twitter, etc.
  const winFeatures = {};
  for (const w of winners) {
    if (!w.features) continue;
    if (w.features.hasWebsite) winFeatures.hasWebsite = (winFeatures.hasWebsite || 0) + 1;
    if (w.features.hasTwitter) winFeatures.hasTwitter = (winFeatures.hasTwitter || 0) + 1;
    if (w.features.hasTelegram) winFeatures.hasTelegram = (winFeatures.hasTelegram || 0) + 1;
    if (w.features.locked) winFeatures.locked = (winFeatures.locked || 0) + 1;
    if (w.features.bundlers) winFeatures.bundlers = (winFeatures.bundlers || 0) + 1;
    if (w.features.snipers) winFeatures.snipers = (winFeatures.snipers || 0) + 1;
  }
  // convert to percentages
  for (const [k, v] of Object.entries(winFeatures)) {
    winFeatures[k] = winners.length > 0 ? Math.round((v / winners.length) * 100) : 0;
  }
  return {
    total, winners: winners.length, losers: losers.length,
    hitRate: total > 0 ? Math.round((winners.length / total) * 100) : 0,
    avgPeak: winners.length > 0 ? Math.round(winners.reduce((s, c) => s + c.peakMult, 0) / winners.length * 10) / 10 : 0,
    bySource, winFeatures,
    lastUpdated: Date.now(),
  };
}

// periodic save (every 5 min)
let _saveTimer = null;
function startAutoSave() {
  if (_saveTimer) return;
  _saveTimer = setInterval(() => {
    saveSnapshots();
    saveOverlaps();
    _write(CALLS_FILE, _calls);
  }, 5 * 60 * 1000);
  if (_saveTimer.unref) _saveTimer.unref();
}

module.exports = {
  // snapshots
  upsertSnapshot, getSnapshot, getSnapshots, saveSnapshots,
  // outcomes
  recordOutcome, updateOutcome, getOutcomes, getWinners, getLosers,
  // learning
  analyzeOutcomes, getLearning, getWeights, scoreCandidate,
  // overlap
  recordSource, getOverlap, overlapBonus, saveOverlaps,
  // stats
  historicalStats,
  // auto-save
  startAutoSave,
};
