// API FORCE REDEPLOY - 2026-09-08 20:52:08
/**
 * Pro Signals API Routes
 * - GET /api/pro-signals/feed â€” filtered signals based on user preferences
 * - GET /api/pro-signals/top-dex â€” top 25 DEX tokens
 * - GET /api/pro-signals/tracked-wallets â€” what tracked wallets are holding
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
  const curMult = Number(call.curMult) || 0;

  // Current multiplier (higher is better, capped at 10x for scoring)
  if (curMult > 0) {
    score += Math.min(curMult, 10) * 5;
    // Live conviction worth extra; crushed coins get NO "potential" fantasy.
    if (curMult >= 1) score += 8;
    else if (curMult >= 0.5) score += 0;
    else score -= 25; // below 0.5x = dying, sink it in the sort
  }

  // Peak potential (unrealized gains) - only counts when coin is alive
  if (call.peakMult && curMult >= 0.5) {
    const potential = call.peakMult / curMult;
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

  // Safety matters for ranking: a 70+ safety call beats a rug-flagged one
  const safe = safetyScore(call);
  if (safe >= 70) score += 10;
  else if (safe >= 55) score += 4;
  else if (safe < 40) score -= 10;

  return Math.max(0, Math.round(score));
}

// Composite safety score (0-100, higher = safer) â€” ZEROX heuristics:
// buys vs sells pressure, holder quality, supply control, LP lock, socials
function safetyScore(call) {
  let s = 55; // neutral base
  // Holder quality (only when known)
  const holders = Number(call.holders);
  if (holders > 0) {
    if (holders >= 500) s += 12;
    else if (holders >= 200) s += 8;
    else if (holders >= 50) s += 3;
    else s -= 6;
  }
  // Top 10 concentration (lower = safer)
  const top10 = Number(call.top10Pct);
  if (top10 > 0) {
    if (top10 <= 30) s += 8;
    else if (top10 <= 50) s += 3;
    else if (top10 >= 70) s -= 12;
  }
  // Insiders / bundlers / snipers (red flags)
  if (call.insiders > 0) s -= Math.min(call.insiders * 2, 12);
  if (call.bundlers) s -= 8;
  if (call.snipers) s -= 8;
  // LP lock (only when known)
  const lp = Number(call.lpPct);
  if (lp > 0) {
    if (lp >= 99) s += 10;
    else if (lp >= 80) s += 5;
    else if (lp < 50) s -= 8;
  }
  // RugCheck score (internal safety score, higher = safer)
  const rug = Number(call.rugScore);
  if (rug > 0) {
    if (rug >= 80) s += 12;
    else if (rug >= 60) s += 6;
    else if (rug >= 40) s += 1;
    else s -= 10;
  }
  // Liquidity depth (only when known)
  const liq = Number(call.liq) || Number(call.liquidity);
  if (liq > 0) {
    if (liq >= 200000) s += 8;
    else if (liq >= 50000) s += 5;
    else if (liq >= 10000) s += 2;
    else s -= 8;
  }
  // Established market cap = survivorship credit
  const fdv = Number(call.curFdv) || Number(call.entryFdv);
  if (fdv > 0) {
    if (fdv >= 1000000) s += 8;
    else if (fdv >= 250000) s += 5;
    else if (fdv >= 50000) s += 3;
    else if (fdv < 8000) s -= 4;
  }
  // Live momentum = market conviction: a coin holding 1x+ has real bids.
  const m = Number(call.curMult);
  if (m > 0) {
    if (m >= 5) s += 12;
    else if (m >= 2) s += 8;
    else if (m >= 1) s += 4;
    else if (m < 0.5) s -= 8;
  }
  // Source credibility
  const src = call.source || '';
  if (src.includes('trending') || src.includes('gecko')) s += 6;
  else if (src.includes('boosted')) s += 2;
  else if (src.includes('new_pools')) s -= 2;
  return Math.max(0, Math.min(100, Math.round(s)));
}
// Deploy marker: pro-signals fix verified 2026-09-08

// Filter dead/rugged calls â€” keep only pro signals with life
function filterDead(calls) {
  const now = Date.now();
  const H = 3600000;
  const DAY = 24 * H;
  return calls.filter(c => {
    // Skip seed/test calls
    if (c.source === 'seed' || c.source === 'test') return false;
    // Must have a mint and entry
    if (!c.mint || !c.entryFdv) return false;
    const curMult = Number(c.curMult) || 1;
    const curFdv = Number(c.curFdv) || 0;
    const ageMs = now - (c.ts || now);
    // Brand new (first 30m): always keep, even if price data is mid-flight
    if (ageMs < 30 * 60000) return true;
    // Dead: FDV â‰¤ $5k for >1h (priced out / rugged to dust)
    if (curFdv > 0 && curFdv <= 5000 && ageMs > H) return false;
    // Dead: crushed below 0.35x for >2h (no bids, no recovery window)
    if (curMult < 0.35 && ageMs > 2 * H) return false;
    // Dead: no live price (pair gone) and old >6h with curMult < 0.8
    if (!(curFdv > 0) && ageMs > 6 * H && curMult < 0.8) return false;
    // Dead: never went anywhere - new pools that flopped after 24h
    if (c.source === 'new_pools' && ageMs > DAY && curMult < 1.2) return false;
    // Dead: closed flag
    if (c.closed) return false;
    // Stale noise older than 14 days with no traction
    if (ageMs > 14 * DAY && curMult < 1) return false;
    return true;
  });
}

// â”€â”€â”€ API ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/pro-signals/feed â€” filtered signals
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

    // Honor ?limit= (the mobile sheet asks for 250). The old handler shipped the
    // FULL record — 680KB+ including per-call topHolders arrays the page never
    // renders — to a phone on a 60-second poll.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 250, 1), 500);

    // Sort by score (bid opportunities first), then project: drop the heavy
    // legacy fields no consumer of this endpoint reads (topHolders is the
    // bulk of the payload; riskScore/viabilityScore were hardcoded fallback
    // constants — see the tg-calls post-mortem).
    calls = calls.map(c => {
      const e = {
        ...c,
        score: scoreCall(c),
        safetyScore: safetyScore(c),
        riskTier: getRiskTier(c),
        isQuickXs: isQuickXs(c),
      };
      delete e.topHolders;
      delete e.riskScore;
      delete e.viabilityScore;
      return e;
    }).sort((a, b) => b.score - a.score);

    calls = calls.slice(0, limit);

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

// POST /api/pro-signals/prefs â€” save user preferences
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

// GET /api/pro-signals/top-dex â€” top 25 DEX tokens
/* GET /top-dex?limit=25 â€” the busiest Solana pairs right now, WITH logos and
   socials. The previous implementation called /latest/dex/pairs/solana?limit=25,
   which is not a DexScreener endpoint â€” it returned an HTML error page, so the
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

/* POST /enrich { mints: [...] } â€” logos, socials and live pair data.
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

// GET /api/pro-signals/tracked-wallets â€” what tracked wallets hold
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

// GET /api/pro-signals/bid-recommendations â€” top 5 calls to bid on
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

// GET /api/pro-signals/hot â€” streaming hot signals (real-time feel)
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

// POST /api/pro-signals/broadcast â€” broadcast signal to TG + store
router.post('/broadcast', async (req, res) => {
  try {
    const { symbol, score, riskTier, action } = req.body;

    if (!symbol || score === undefined) {
      return res.json({ status: 'error', message: 'Missing symbol or score' });
    }

    // Format for Telegram
    const emoji = action === 'long' ? 'ðŸ“ˆ' : action === 'short' ? 'ðŸ“‰' : 'âš¡';
    const riskEmoji = riskTier === 'risky' ? 'âš ï¸' : riskTier === 'medium' ? 'â°' : 'âœ…';
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

// GET /api/pro-signals/history â€” broadcast history
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

// â”€â”€â”€ ASK ZEROX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/pro-signals/zerox/thesis?mint=... â€” direct coin read: thesis,
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

// POST /api/pro-signals/zerox/verify â€” user posts a Solscan txn (or pastes
// the scan URL / signature) as proof of a real buy before pro access is
// granted. Stored to data/zerox-approvals.json for review. Free for now â€”
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
      note: 'Proof recorded. Pro access is currently FREE â€” this unlocks the pay gate later.',
      approval: all.approvals[0],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/pro-signals/zerox/access â€” enter a pro access code. Accepted
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

// POST /api/pro-signals/zerox/sentiment — the "$1 SENTIMENT" batch read from the
// Pro Signals heat tab. One dollar (or one Ask-ZEROX credit) unlocks ZEROX ranking
// the BEST few coins to size into right now, each with sentiment + thesis + entry/
// exit. Same honest gate as pay-ask: credits on a wallet address, OR a Solscan txn
// link/signature pasted as proof of the $1 payment (webhook reconciles later).
router.post('/zerox/sentiment', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const { address, solscanUrl, txn, n, q } = (req.body || {});
    const proof = String(solscanUrl || txn || '').trim();
    const payer = String(address || '').trim();
    const want = Math.max(1, Math.min(parseInt(n, 10) || 5, 12));

    // Same payment gate as pay-ask: credit spend first, txn proof as fallback.
    let paidWith = null;
    if (payer) {
      try {
        const credits = require('../lib/zerox-credits');
        paidWith = credits.spend(payer, 1) ? 'credit' : null;
      } catch (e) { paidWith = null; }
    }
    if (!paidWith && !proof) {
      return res.status(400).json({ ok: false, error: 'no credits on that wallet — paste the Solscan txn link of your $1 payment as proof' });
    }
    if (!paidWith) {
      const looksLikeTxn = /^[A-Za-z0-9]{64,88}$/.test(proof);
      const looksLikeSolscan = /solscan\.io\/tx\//i.test(proof);
      if (!looksLikeTxn && !looksLikeSolscan) {
        return res.status(400).json({ ok: false, error: 'that is not a Solscan transaction link or signature' });
      }
    }

    // Rank the whole call book for "best few coins to size in": priority =
    // healthy + liquid + recent + still climbing (not already 10x'd the trade).
    // Enrich the top candidates live for real current fdv/price, then ZEROX-read.
    const calls = loadCalls();
    let pool = calls.filter(c => !c.closed && (c.symbol || c.mint));
    const now = Date.now();
    pool = pool.map(c => {
      const peak = c.peakMult || 1;
      const cur = typeof c.currentMult === 'number' ? c.currentMult : (c.curMult || 1);
      const age = now - (c.ts || 0);
      const liq = Number(c.liq) || 0;
      const holders = Number(c.holders) || 0;
      const vol = Number(c.vol24) || 0;
      const viab = Number(c.viabilityScore) || 0;
      const risk = Number(c.riskScore) || 0;
      // Recent + liquid + viable + above entry but not exhausted — the "size in now" setup.
      let s = 0;
      s += Math.min(30, liq / 40000 * 30);              // $40K liq = full marks
      s += Math.min(20, holders / 3000 * 20);           // 3K holders = full marks
      s += Math.min(20, vol / 500000 * 20);             // $500K 24h vol = full marks
      s += Math.min(15, viab);                          // ZEROX viability /100
      s += Math.max(-15, 30 - risk * 0.3);              // lower risk = bonus
      s += cur >= 1 && cur < 3 ? 10 : cur >= 3 ? 5 : -10; // climbing but not blown off
      s -= age > 7 * 86400000 ? 8 : age > 3 * 86400000 ? 4 : 0; // freshness
      c._sz = s;
      c._cur = cur;
      return c;
    });
    pool.sort((a, b) => (b._sz || 0) - (a._sz || 0));
    const top = pool.slice(0, want);

    const enrichMod = require('../lib/token-enrich');
    let liveMap = {};
    try {
      const edges = await enrichMod.enrich(top.map(c => c.mint).filter(Boolean));
      if (edges) liveMap = edges;
    } catch (e) { /* live data is a bonus */ }

    const zerox = require('../lib/zerox-thesis');
    const picks = top.map((c, i) => {
      const read = zerox.build(c, liveMap[c.mint] || {});
      return {
        rank: i + 1,
        sizeIn: Math.round((c._sz || 0) * 10) / 10,
        ...read,
      };
    });

    // Record intent for review + reconciliation (one entry per batch; fee = 1).
    const file = path.join(DATA_DIR, 'zerox-approvals.json');
    let all = { approvals: [] };
    try { all = JSON.parse(fs.readFileSync(file, 'utf8')) || all; } catch (e) {}
    all.approvals.unshift({
      kind: paidWith ? 'sentiment-credit' : 'sentiment',
      question: q ? String(q).slice(0, 300) : `ZEROX sentiment — best ${top.length} coins to size in`,
      mints: top.map(c => c.mint).filter(Boolean),
      symbols: top.map(c => c.symbol).filter(Boolean),
      proof,
      payer: payer || null,
      proofKind: paidWith ? 'credit' : (proof.indexOf('solscan.io') >= 0 ? 'solscan' : 'txn'),
      status: 'accepted',
      fee: paidWith ? '1 credit' : '1 USDC',
      submittedAt: Date.now(),
    });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));

    return res.json({
      ok: true,
      status: 'accepted',
      fee: paidWith ? '1 credit · deducted from wallet ' + payer : '1 USDC (paybox webhook confirms real charge later)',
      count: picks.length,
      rows: picks,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/pro-signals/zerox/pay-ask â€" $1 pay-to-ask flow. User sends $1
// USDC to the ZEROX paybox wallet, pastes the Solscan txn as proof, asks a
// question about a coin (mint or symbol). We record the intent for reconciliation
// and answer instantly with the deterministic thesis read. FREE for now; the
// $1 gate flips on when paybox webhooks verify real payments (see servex/paybox).
router.post('/zerox/pay-ask', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const { question, mint, symbol, solscanUrl, txn, address } = (req.body || {});
    const q = String(question || '').trim();
    const proof = String(solscanUrl || txn || '').trim();
    const payer = String(address || '').trim();

    if (!q) return res.status(400).json({ ok: false, error: 'missing question' });
    if (!mint && !symbol) return res.status(400).json({ ok: false, error: 'missing mint or symbol' });

    // Preferred payment: Ask-ZEROX credits keyed to a wallet address (1 question = 1 credit).
    let paidWith = null;
    if (payer) {
      try {
        const credits = require('../lib/zerox-credits');
        paidWith = credits.spend(payer, 1) ? 'credit' : null;
      } catch (e) { paidWith = null; }
    }
    // Fallback: a real USDC txn to the ZEROX wallet (proof recorded for reconciliation).
    if (!paidWith) {
      if (!proof) return res.status(400).json({ ok: false, error: 'no credits on that wallet — paste the Solscan txn link of your $1 payment as proof' });
      const looksLikeTxn = /^[A-Za-z0-9]{64,88}$/.test(proof);
      const looksLikeSolscan = /solscan\.io\/tx\//i.test(proof);
      if (!looksLikeTxn && !looksLikeSolscan) {
        return res.status(400).json({ ok: false, error: 'that is not a Solscan transaction link or signature' });
      }
    }

    // Resolve the coin: mint match first, then symbol match
    const calls = loadCalls();
    let call = calls.find(c => c.mint === mint) || null;
    if (!call && symbol) {
      call = calls.find(c => String(c.symbol || '').toLowerCase() === String(symbol).toLowerCase()) || null;
    }

    // Record intent for review + reconciliation
    const file = path.join(DATA_DIR, 'zerox-approvals.json');
    let all = { approvals: [] };
    try { all = JSON.parse(fs.readFileSync(file, 'utf8')) || all; } catch (e) {}
    all.approvals.unshift({
      kind: paidWith ? 'pay-ask-credit' : 'pay-ask',
      question: q,
      mint: mint || (call && call.mint) || null,
      symbol: symbol || (call && call.symbol) || null,
      proof,
      payer: payer || null,
      proofKind: paidWith ? 'credit' : (looksLikeSolscan ? 'solscan' : 'txn'),
      status: 'accepted',
      fee: paidWith ? '1 credit' : '1 USDC',
      submittedAt: Date.now(),
    });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));

    // Build the answer
    let live = {};
    try {
      const enrichMod = require('../lib/token-enrich');
      const mintKey = (call && call.mint) || mint;
      if (mintKey) {
        const got = await enrichMod.enrich([mintKey]);
        live = (got && got[mintKey]) || {};
      }
    } catch (e) { /* live data is a bonus */ }

    const zerox = require('../lib/zerox-thesis');
    const read = zerox.build(call, live);

    return res.json({
      ok: true,
      status: 'accepted',
      fee: paidWith ? '1 credit · deducted from wallet ' + payer : '1 USDC (paybox webhook confirms real charge later)',
      asked: q,
      ...read,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

