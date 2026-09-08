/**
 * Pro Signals API Routes
 * - GET /api/pro-signals/feed — filtered signals based on user preferences
 * - GET /api/pro-signals/top-dex — top 25 DEX tokens
 * - GET /api/pro-signals/tracked-wallets — what tracked wallets are holding
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Load calls from tg-calls.json
function loadCalls() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tg-calls.json'), 'utf8'));
    return data.calls || [];
  } catch {
    return [];
  }
}

// Load user preferences (strictness, risk filter, etc)
function loadUserPrefs(userId) {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'user-prefs.json'), 'utf8'));
    return prefs[userId] || { strictness: 50, riskFilter: 'all', showQuickXs: true };
  } catch {
    return { strictness: 50, riskFilter: 'all', showQuickXs: true };
  }
}

// Save user preferences (only affects their dashboard, not TG)
function saveUserPrefs(userId, prefs) {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'user-prefs.json'), 'utf8')) || {};
    all[userId] = prefs;
    fs.writeFileSync(path.join(DATA_DIR, 'user-prefs.json'), JSON.stringify(all, null, 2));
  } catch (e) {
    console.error('Error saving prefs:', e);
  }
}

// Categorize call by risk
function getRiskTier(call) {
  const source = call.source || '';
  if (source.includes('pre')) return 'risky'; // pre-bond
  if (source.includes('bond') || source.includes('seed')) return 'medium'; // bonded, seed
  if (source.includes('trending') || source.includes('gecko')) return 'safe'; // established
  return 'medium';
}

// Check if call hit 2x+ quickly
function isQuickXs(call) {
  if (!call.peakMult) return false;
  const now = Date.now();
  const age = now - call.ts;
  const dayMs = 24 * 60 * 60 * 1000;
  return call.peakMult >= 2 && age < dayMs * 7; // Hit 2x+ within 7 days
}

// Filter calls by strictness (0-100 scale)
// 0-25: only established (safe)
// 25-50: established + medium
// 50-75: all risk tiers
// 75-100: all + more signals
function filterByStrictness(calls, strictness) {
  return calls.filter(call => {
    const risk = getRiskTier(call);
    if (strictness < 25) return risk === 'safe';
    if (strictness < 50) return ['safe', 'medium'].includes(risk);
    return true; // all tiers
  });
}

// Score calls for "bid recommendations" (top opportunities)
function scoreCall(call) {
  let score = 0;

  // Current multiplier (higher is better, capped at 10x for scoring)
  if (call.curMult) {
    score += Math.min(call.curMult, 10) * 5;
  }

  // Peak potential (unrealized gains - biggest weight)
  if (call.peakMult && call.curMult) {
    const potential = call.peakMult / call.curMult;
    score += Math.min(potential, 10) * 15; // Heavy weight on upside
  }

  // Milestones hit (momentum indicator)
  if (call.milestones) {
    score += call.milestones.length * 3;
  }

  // Volume trend (if available)
  if (call.volumeTrend && call.volumeTrend > 1) {
    score += Math.min(call.volumeTrend * 5, 20);
  }

  // Holder growth (if available)
  if (call.holderGrowth && call.holderGrowth > 1) {
    score += Math.min(call.holderGrowth * 3, 15);
  }

  // Recency (fresher signals are hotter)
  const age = Date.now() - call.ts;
  const dayMs = 24 * 60 * 60 * 1000;
  if (age < dayMs * 1) score += 25; // < 1 day
  else if (age < dayMs * 3) score += 18; // < 3 days
  else if (age < dayMs * 7) score += 12; // < 1 week
  else if (age < dayMs * 30) score += 6;

  // Risk bonus (risky calls have higher upside, should be rewarded)
  const risk = getRiskTier(call);
  if (risk === 'risky') score += 10;
  else if (risk === 'medium') score += 5;

  // Liquidity bonus (established pools have better entry/exit)
  if (call.liquidity && call.liquidity > 50000) {
    score += Math.min(call.liquidity / 100000, 8);
  }

  // Anti-rug factor (if verified safe)
  if (call.verified || call.safeScore > 80) {
    score += 8;
  }

  return Math.round(score);
}

// Composite safety score (0-100, higher = safer) — ZEROX heuristics:
// buys vs sells pressure, holder quality, supply control, LP lock, socials
function safetyScore(call) {
  let s = 50; // base neutral
  // Holder quality
  const holders = Number(call.holders) || 0;
  if (holders >= 500) s += 15;
  else if (holders >= 200) s += 10;
  else if (holders >= 50) s += 5;
  else if (holders > 0) s -= 5;
  // Top 10 concentration (lower = safer)
  const top10 = Number(call.top10Pct) || 0;
  if (top10 <= 30) s += 10;
  else if (top10 <= 50) s += 5;
  else if (top10 >= 70) s -= 15;
  // Insiders / bundlers / snipers (red flags)
  if (call.insiders > 0) s -= Math.min(call.insiders * 3, 15);
  if (call.bundlers) s -= 10;
  if (call.snipers) s -= 10;
  // LP lock
  const lp = Number(call.lpPct) || 0;
  if (lp >= 99) s += 10;
  else if (lp >= 80) s += 5;
  else if (lp > 0) s -= 5;
  else s -= 10;
  // RugCheck score (internal safety score, higher = safer)
  const rug = Number(call.rugScore) || 0;
  if (rug >= 80) s += 10;
  else if (rug >= 60) s += 5;
  else if (rug > 0 && rug < 40) s -= 10;
  // Liquidity depth
  const liq = Number(call.liq) || Number(call.liquidity) || 0;
  if (liq >= 100000) s += 5;
  else if (liq >= 25000) s += 2;
  else if (liq > 0 && liq < 10000) s -= 5;
  // Source credibility
  const src = call.source || '';
  if (src.includes('trending')) s += 3;
  else if (src.includes('bond') || src.includes('seed')) s -= 2;
  // Clamp 0-100
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Filter dead/rugged calls — keep only pro signals with life
function filterDead(calls) {
  const now = Date.now();
  return calls.filter(c => {
    // Skip seed/test calls
    if (c.source === 'seed') return false;
    // Must have a mint and entry
    if (!c.mint || !c.entryFdv) return false;
    const curMult = Number(c.curMult) || 1;
    const curFdv = Number(c.curFdv) || c.entryFdv;
    const ageMs = now - (c.ts || now);
    const hourMs = 3600000;
    // Dead: FDV ≤ $4k for >1h (pruneRugs criteria)
    if (curFdv <= 4000 && ageMs > hourMs) return false;
    // Dead: no live price (pair gone) and old >6h with curMult < 0.8 (pruneDead criteria)
    const hasLivePrice = curFdv > 0 && curFdv !== c.entryFdv;
    if (!hasLivePrice && ageMs > 6 * hourMs && curMult < 0.8) return false;
    // Dead: closed flag
    if (c.closed) return false;
    // Keep pro-origin signals (trending, bonded, helios, gecko)
    const proSources = ['trending', 'bonded', 'helios', 'gecko', 'prebond'];
    const isPro = proSources.some(s => src.includes(s));
    return true; // for now keep all non-seed; can tighten to isPro
  });
}

// ─── API ENDPOINTS ───────────────────────────────────────────

// GET /api/pro-signals/feed — filtered signals
router.get('/feed', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'guest';
    const { strictness, riskFilter, showQuickXs } = req.query;

    // Load user prefs or use query params
    let prefs = loadUserPrefs(userId);
    if (strictness !== undefined) prefs.strictness = parseInt(strictness);
    if (riskFilter !== undefined) prefs.riskFilter = riskFilter;
    if (showQuickXs !== undefined) prefs.showQuickXs = showQuickXs === 'true';

    // Load and filter calls
    let calls = loadCalls();

    // Filter dead/rugged calls first
    calls = filterDead(calls);

    // Apply strictness filter
    calls = filterByStrictness(calls, prefs.strictness);

    // Apply risk filter
    if (prefs.riskFilter !== 'all') {
      calls = calls.filter(c => getRiskTier(c) === prefs.riskFilter);
    }

    // Sort by score (bid opportunities first)
    calls = calls.map(c => ({
      ...c,
      score: scoreCall(c),
      safetyScore: safetyScore(c),
      riskTier: getRiskTier(c),
      isQuickXs: isQuickXs(c),
    })).sort((a, b) => b.score - a.score);

    res.json({
      userId,
      prefs,
      count: calls.length,
      calls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pro-signals/prefs — save user preferences
router.post('/prefs', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'guest';
    const { strictness, riskFilter, showQuickXs } = req.body;

    const prefs = { strictness, riskFilter, showQuickXs };
    saveUserPrefs(userId, prefs);

    res.json({ success: true, prefs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/top-dex — top 25 DEX tokens
/* GET /top-dex?limit=25 — the busiest Solana pairs right now, WITH logos and
   socials. The previous implementation called /latest/dex/pairs/solana?limit=25,
   which is not a DexScreener endpoint — it returned an HTML error page, so the
   route answered "Unexpected token '<'". See lib/token-enrich.js. */
router.get('/top-dex', async (req, res) => {
  try {
    const enrich = require('../lib/token-enrich');
    const pairs = await enrich.topDex(req.query.limit);
    res.json({ source: 'dexscreener', count: pairs.length, pairs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /enrich { mints: [...] } — logos, socials and live pair data.
   POST because a 300-mint list does not belong in a query string. Enrichment
   is decoration: a failure returns nulls, never an error, so the signals
   still render when DexScreener is down. */
router.post('/enrich', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const enrich = require('../lib/token-enrich');
    const mints = (req.body && req.body.mints) || [];
    if (!Array.isArray(mints)) return res.status(400).json({ ok: false, error: 'mints must be an array' });
    res.json({ ok: true, tokens: await enrich.enrich(mints, req.body.cap) });
  } catch (err) {
    res.json({ ok: false, tokens: {} });
  }
});

// GET /api/pro-signals/tracked-wallets — what tracked wallets hold
router.get('/tracked-wallets', (req, res) => {
  try {
    const { timeframe } = req.query; // 24h, 48h, 1w, 1m, etc

    // Load tracked wallets from config
    let wallets = [];
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wallets.json'), 'utf8'));
      wallets = cfg.wallets || [];
    } catch {
      wallets = [];
    }

    res.json({
      timeframe: timeframe || '24h',
      wallets,
      count: wallets.length,
      note: 'Holdings data would come from Helius/Solana RPC in production',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/bid-recommendations — top 5 calls to bid on
router.get('/bid-recommendations', (req, res) => {
  try {
    let calls = loadCalls()
      .map(c => ({
        ...c,
        score: scoreCall(c),
        riskTier: getRiskTier(c),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({
      recommendations: calls,
      note: 'Top 5 opportunities based on score (potential, momentum, risk)',
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/hot — streaming hot signals (real-time feel)
router.get('/hot', (req, res) => {
  try {
    const calls = loadCalls()
      .map(c => ({
        ...c,
        score: scoreCall(c),
        riskTier: getRiskTier(c),
      }))
      .filter(c => {
        // Only very recent, high-scoring signals
        const age = Date.now() - c.ts;
        const dayMs = 24 * 60 * 60 * 1000;
        return age < dayMs && c.score > 50;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json({
      hot: calls,
      count: calls.length,
      updated: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pro-signals/broadcast — broadcast signal to TG + store
router.post('/broadcast', async (req, res) => {
  try {
    const { symbol, score, riskTier, action } = req.body;

    if (!symbol || score === undefined) {
      return res.json({ status: 'error', message: 'Missing symbol or score' });
    }

    // Format for Telegram
    const emoji = action === 'long' ? '📈' : action === 'short' ? '📉' : '⚡';
    const riskEmoji = riskTier === 'risky' ? '⚠️' : riskTier === 'medium' ? '⏰' : '✅';
    const content = `${emoji} *ZEROX SIGNAL* ${riskEmoji}

*${symbol}*
Score: \`${score}\`
Risk: ${riskTier}
Action: ${action.toUpperCase()}

Posted: ${new Date().toLocaleString()}`;

    // Post to Telegram via social API
    const socialRes = await fetch('http://localhost:3000/api/social/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        content
      })
    }).catch(() => ({ json: async () => ({ status: 'error' }) }));

    const posted = await socialRes.json();

    // Store broadcast in history
    const broadcasts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'broadcasts.json'), 'utf8').catch(() => '[]') || '[]');
    broadcasts.unshift({
      symbol,
      score,
      riskTier,
      action,
      posted: posted.status === 'sent',
      timestamp: Date.now()
    });
    try {
      fs.writeFileSync(path.join(DATA_DIR, 'broadcasts.json'), JSON.stringify(broadcasts.slice(0, 100)));
    } catch (e) {}

    res.json({
      status: 'broadcast',
      symbol,
      score,
      posted: posted.status === 'sent'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pro-signals/history — broadcast history
router.get('/history', (req, res) => {
  try {
    const broadcasts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'broadcasts.json'), 'utf8') || '[]');
    res.json({
      history: broadcasts.slice(0, 50),
      count: broadcasts.length
    });
  } catch (err) {
    res.json({ history: [], count: 0 });
  }
});

// ─── ASK ZEROX ─────────────────────────────────────────────────────────
// GET /api/pro-signals/zerox/thesis?mint=... — direct coin read: thesis,
// sentiment, entry/exit plan. FREE right now; later gated behind the verify
// (Solscan txn proof) + access-code flow below.
router.get('/zerox/thesis', async (req, res) => {
  try {
    const mint = String(req.query.mint || '').trim();
    if (!mint) return res.status(400).json({ error: 'missing mint' });

    const zerox = require('../lib/zerox-thesis');
    const call = loadCalls().find(c => c.mint === mint) || null;

    let live = {};
    try {
      const enrichMod = require('../lib/token-enrich');
      const got = await enrichMod.enrich([mint]);
      live = (got && got[mint]) || {};
    } catch (e) { /* live data is a bonus, not a requirement */ }

    const thesis = zerox.build(call, live);
    return res.json({ ok: true, fromFeed: !!call, ...thesis });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/pro-signals/zerox/verify — user posts a Solscan txn (or pastes
// the scan URL / signature) as proof of a real buy before pro access is
// granted. Stored to data/zerox-approvals.json for review. Free for now —
// this records the intent so the pay gate can be flipped on later.
router.post('/zerox/verify', express.json({ limit: '16kb' }), (req, res) => {
  try {
    const { solscanUrl, txn } = (req.body || {});
    const proof = String(solscanUrl || txn || '').trim();
    if (!proof) return res.status(400).json({ ok: false, error: 'missing solscanUrl or txn' });

    const looksLikeTxn = /^[A-Za-z0-9]{64,88}$/.test(proof);
    const looksLikeSolscan = /solscan\.io\/tx\//i.test(proof);
    if (!looksLikeTxn && !looksLikeSolscan) {
      return res.status(400).json({ ok: false, error: 'that is not a Solscan transaction link or signature' });
    }

    const file = path.join(DATA_DIR, 'zerox-approvals.json');
    let all = { approvals: [] };
    try { all = JSON.parse(fs.readFileSync(file, 'utf8')) || all; } catch (e) {}
    all.approvals.unshift({
      proof,
      kind: looksLikeSolscan ? 'solscan' : 'txn',
      status: 'pending',
      submittedAt: Date.now(),
    });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));

    return res.json({
      ok: true,
      status: 'reviewed',
      note: 'Proof recorded. Pro access is currently FREE — this unlocks the pay gate later.',
      approval: all.approvals[0],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/pro-signals/zerox/access — enter a pro access code. Accepted
// codes live in env ZEROX_ACCESS_CODES (comma-separated) or a codes file.
router.post('/zerox/access', express.json({ limit: '16kb' }), (req, res) => {
  try {
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: 'missing code' });

    // Source of truth: env (preferred) or backend/data/zerox-codes.json
    let valid = new Set(String(process.env.ZEROX_ACCESS_CODES || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
    try {
      const codes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zerox-codes.json'), 'utf8')) || {};
      for (const c of (codes.codes || [])) valid.add(String(c).trim().toUpperCase());
    } catch (e) { /* env-only is fine */ }

    if (!valid.has(code)) return res.status(403).json({ ok: false, error: 'invalid code' });

    return res.json({ ok: true, granted: true, tier: 'pro', note: 'ZEROX theta unlocked for pro members.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
