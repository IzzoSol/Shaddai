/**
 * Prove Edge API Routes
 * - GET  /api/prove-edge/backtest    — honest backtest of stored call history + equity curve
 * - POST /api/prove-edge/portfolio   — create/seed a paper portfolio
 * - GET  /api/prove-edge/portfolio   — fetch portfolio (balance, trades, P&L, equity curve)
 * - POST /api/prove-edge/trade       — record a PAPER trade (no real money, no execution)
 * - GET  /api/prove-edge/equity      — equity curve series alone (for charting)
 *
 * Pure math on user-provided + stored data only. No keys, no real execution.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CALLS_FILE = path.join(DATA_DIR, 'tg-calls.json');
const PORTFOLIOS_FILE = path.join(DATA_DIR, 'paper-portfolios.json');

const CACHE_TTL_MS = 60 * 1000;
let _backtestCache = { key: null, t: 0, value: null };

// ─── helpers ────────────────────────────────────────────────────────────────

function round(n, dp = 6) {
  if (!isFinite(n)) return n;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, obj) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/* ZEROX paybox wallets (receiving addresses, public by design — same source
   the Paybox button uses). Read fresh every time so rotating an address in
   paybox-wallets.json is live on the next call, no redeploy. */
const PAYBOX_FILE = path.join(DATA_DIR, 'paybox-wallets.json');

function loadPayboxWallets() {
  try {
    const raw = readJSON(PAYBOX_FILE, null);
    if (raw && Array.isArray(raw.wallets)) {
      return raw.wallets.map((w) => ({ label: w.label || '', address: w.address || '', chain: w.chain || '', note: w.note || '' }));
    }
  } catch (e) {}
  return [];
}

/* The agent execution wallets — where a LIVE wire would settle (Base ACP +
   Solana agent wallet). Kept on the model so the demo shows exactly which
   addresses a funded run would trade from, while settlement stays paper. */
function agentWallets() {
  return {
    base: process.env.VIRTUALS_BASE_WALLET || '',
    solana: process.env.VIRTUALS_SOL_WALLET || '',
  };
}

function resolveUserId(req, fallback) {
  return (req.user && req.user.id) || req.body.userId || req.query.userId || fallback || 'anon';
}

function loadCalls() {
  const data = readJSON(CALLS_FILE, null);
  if (!data || !Array.isArray(data.calls)) return [];
  return data.calls;
}

function loadPortfolios() {
  return readJSON(PORTFOLIOS_FILE, {});
}

function savePortfolios(portfolios) {
  return writeJSON(PORTFOLIOS_FILE, portfolios);
}

function newPortfolio(userId, startingBalance, perTradeStake) {
  const now = Date.now();
  return {
    userId,
    startingBalance,
    balance: startingBalance,
    perTradeStake,
    paybox: loadPayboxWallets(),
    execution: agentWallets(),
    createdAt: now,
    updatedAt: now,
    openTrades: [],
    closedTrades: [],
    equity: [{ t: now, s: startingBalance }],
  };
}

function portfolioSummary(p) {
  const pnl = round(p.balance - p.startingBalance, 2);
  return {
    exists: true,
    userId: p.userId,
    startingBalance: p.startingBalance,
    balance: p.balance,
    perTradeStake: p.perTradeStake,
    paybox: (p.paybox && p.paybox.length ? p.paybox : loadPayboxWallets()),
    execution: p.execution || agentWallets(),
    pnl,
    returnsPct: round(p.startingBalance ? (pnl / p.startingBalance) * 100 : 0, 4),
    openTrades: p.openTrades,
    closedTrades: p.closedTrades,
    equity: p.equity,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ─── backtest computation ───────────────────────────────────────────────────

function computeBacktest(calls, stake) {
  const st = Math.min(Math.max(stake, 0.001), 0.5);

  const evals = [];
  for (const c of calls) {
    const m = c && typeof c.curMult === 'number' ? c.curMult : NaN;
    if (!isFinite(m) || m <= 0) continue;
    evals.push({
      mult: m,
      symbol: c.symbol || '',
      name: c.name || '',
      ts: c.ts || 0,
      peakMult: c.peakMult || 0,
    });
  }

  if (evals.length === 0) {
    return {
      totalCalls: calls.length,
      evaluatedCalls: 0,
      skippedCalls: calls.length,
      winRate: 0,
      avgWinMult: 0,
      avgWinPct: 0,
      avgLossMult: 0,
      avgLossPct: 0,
      profitFactor: null,
      profitFactorNote: 'no evaluated trades',
      expectancyPct: 0,
      best: null,
      worst: null,
      equityCurve: [],
      finalEquity: 1,
      totalReturnPct: 0,
      stake: st,
    };
  }

  let wins = 0;
  let sumWinMult = 0;
  let sumLossMult = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumReturn = 0;
  let best = evals[0];
  let worst = evals[0];

  const sorted = evals.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  let eq = 1;
  const curve = [];

  for (const e of sorted) {
    const ret = e.mult - 1;
    sumReturn += ret;
    if (ret >= 0) {
      wins += 1;
      sumWinMult += e.mult;
      grossProfit += ret;
    } else {
      sumLossMult += e.mult;
      grossLoss += -ret;
    }
    if (e.mult >= (best ? best.mult : -Infinity)) best = e;
    if (e.mult <= (worst ? worst.mult : Infinity)) worst = e;
    eq *= 1 + st * ret;
    curve.push({ t: e.ts, s: round(eq, 6) });
  }

  const n = evals.length;
  const avgWinMult = wins ? sumWinMult / wins : 0;
  const avgLossMult = evals.length - wins ? sumLossMult / (n - wins) : 0;
  const profitFactor = grossLoss > 0 ? round(grossProfit / grossLoss, 4) : null;

  return {
    totalCalls: calls.length,
    evaluatedCalls: n,
    skippedCalls: calls.length - n,
    wins,
    losses: n - wins,
    winRate: round((wins / n) * 100, 2),
    avgWinMult: round(avgWinMult, 4),
    avgWinPct: round((avgWinMult - 1) * 100, 2),
    avgLossMult: round(avgLossMult, 4),
    avgLossPct: round((1 - avgLossMult) * 100, 2),
    profitFactor,
    profitFactorNote: profitFactor === null ? 'no losing trades in sample' : 'grossProfit / grossLoss ($1 staked per call)',
    expectancyPct: round((sumReturn / n) * 100, 4),
    best: { symbol: best.symbol, name: best.name, mult: round(best.mult, 4), ts: best.ts, peakMult: best.peakMult },
    worst: { symbol: worst.symbol, name: worst.name, mult: round(worst.mult, 4), ts: worst.ts, peakMult: worst.peakMult },
    stake: st,
    equityCurve: curve,
    finalEquity: round(eq, 6),
    totalReturnPct: round((eq - 1) * 100, 4),
    note: 'Backtest uses current curMult for every call (treated as closed today). Not investment advice, no real money.',
  };
}

router.get('/backtest', (req, res) => {
  try {
    let mtime = 0;
    let size = 0;
    try {
      const stat = fs.statSync(CALLS_FILE);
      mtime = stat.mtimeMs;
      size = stat.size;
    } catch (e) {}

    const stake = parseFloat(req.query.stake) || 0.02;
    const key = `${mtime}|${size}|${stake}`;
    const now = Date.now();

    if (_backtestCache.key === key && now - _backtestCache.t < CACHE_TTL_MS && _backtestCache.value) {
      return res.json({ cached: true, generatedAt: _backtestCache.t, ..._backtestCache.value });
    }

    const result = computeBacktest(loadCalls(), stake);
    _backtestCache = { key, t: now, value: result };
    res.json({ cached: false, generatedAt: now, ...result });
  } catch (err) {
    res.status(500).json({ error: 'backtest failed', message: err.message || String(err) });
  }
});

// ─── portfolio ──────────────────────────────────────────────────────────────

router.post('/portfolio', (req, res) => {
  try {
    const userId = resolveUserId(req) || 'anon';
    let startingBalance = parseFloat(req.body.startingBalance);
    if (!isFinite(startingBalance) || startingBalance <= 0) startingBalance = 10000;
    let perTradeStake = parseFloat(req.body.perTradeStake);
    if (!isFinite(perTradeStake) || perTradeStake <= 0 || perTradeStake > 1) perTradeStake = 0.02;

    const portfolios = loadPortfolios();
    const reset = req.query.reset === '1' || req.query.reset === 'true';

    if (portfolios[userId] && !reset) {
      portfolios[userId].updatedAt = Date.now();
      savePortfolios(portfolios);
      return res.json({ seeded: false, note: 'portfolio already exists (pass ?reset=1 to recreate)', ...portfolioSummary(portfolios[userId]) });
    }

    portfolios[userId] = newPortfolio(userId, round(startingBalance, 2), perTradeStake);
    if (!savePortfolios(portfolios)) {
      return res.status(500).json({ error: 'failed to persist portfolio', message: 'paper-portfolios.json write failed' });
    }
    res.json({ seeded: true, ...portfolioSummary(portfolios[userId]) });
  } catch (err) {
    res.status(500).json({ error: 'portfolio create failed', message: err.message || String(err) });
  }
});

router.get('/portfolio', (req, res) => {
  try {
    const userId = resolveUserId(req) || 'anon';
    const portfolios = loadPortfolios();
    const p = portfolios[userId];

    if (!p) {
      return res.json({
        exists: false,
        userId,
        startingBalance: null,
        balance: null,
        perTradeStake: null,
        pnl: null,
        returnsPct: null,
        openTrades: [],
        closedTrades: [],
        equity: [],
        paybox: loadPayboxWallets(),
        execution: agentWallets(),
        message: 'No paper portfolio yet. POST /api/prove-edge/portfolio with { userId, startingBalance } to create one.',
      });
    }

    res.json(portfolioSummary(p));
  } catch (err) {
    res.status(500).json({ error: 'portfolio read failed', message: err.message || String(err) });
  }
});

// ─── paper trades ───────────────────────────────────────────────────────────

router.post('/trade', (req, res) => {
  try {
    const userId = resolveUserId(req) || 'anon';
    const { symbol, side, sizePct, entry, exit, date } = req.body || {};

    if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'symbol is required' });
    if (side !== 'buy' && side !== 'sell') return res.status(400).json({ error: "side must be 'buy' or 'sell'" });

    const portfolios = loadPortfolios();
    let p = portfolios[userId];
    if (!p) {
      return res.status(400).json({
        error: 'no portfolio for this user',
        message: 'Create one first: POST /api/prove-edge/portfolio with { userId, startingBalance }',
      });
    }

    let sz = parseFloat(sizePct);
    if (!isFinite(sz) || sz <= 0) sz = p.perTradeStake || 0.02;
    if (sz > 1) sz = sz / 100; // accept "5" or "0.05" as 5%

    const hasExit = exit !== undefined && exit !== null && exit !== '';
    const exitPrice = hasExit ? parseFloat(exit) : NaN;
    if (hasExit && (!isFinite(exitPrice) || exitPrice <= 0)) {
      return res.status(400).json({ error: 'exit must be a positive number' });
    }

    const t = date || Date.now();

    // If a matching open trade exists, close it instead of opening a duplicate.
    const pos = p.openTrades.find((o) => o.symbol === symbol && o.side === side);

    if (!hasExit) {
      const entryPrice = parseFloat(entry);
      if (!isFinite(entryPrice) || entryPrice <= 0) {
        return res.status(400).json({ error: 'entry must be a positive number when opening a trade' });
      }
      if (pos) {
        return res.json({ error: 'open trade already exists for this symbol/side', trade: pos });
      }
      const notional = p.balance * sz;
      const trade = {
        symbol,
        side,
        sizePct: sz,
        entry: entryPrice,
        notional: round(notional, 4),
        openedAt: t,
        exit: null,
        pnl: null,
        status: 'open',
      };
      p.openTrades.push(trade);
      p.updatedAt = Date.now();
      if (!savePortfolios(portfolios)) {
        return res.status(500).json({ error: 'failed to persist trade', message: 'paper-portfolios.json write failed' });
      }
      return res.json({ status: 'open', trade, balance: p.balance, message: 'Paper position opened. No real money, no execution.' });
    }

    // closing path
    let closed;
    if (pos) {
      const notional = pos.notional || p.balance * (pos.sizePct || p.perTradeStake || 0.02);
      const mult = side === 'buy' ? exitPrice / (pos.entry || exitPrice) : (pos.entry || exitPrice) / exitPrice;
      const pnl = notional * (mult - 1);
      closed = {
        ...pos,
        exit: exitPrice,
        closedAt: t,
        pnl: round(pnl, 4),
        pnlPct: round((mult - 1) * 100, 4),
        status: 'closed',
      };
      p.openTrades = p.openTrades.filter((o) => o !== pos);
    } else {
      const entryPrice = parseFloat(entry);
      if (!isFinite(entry) || entryPrice <= 0) {
        return res.status(400).json({ error: 'entry must be a positive number when closing without an open trade' });
      }
      const notional = p.balance * sz;
      const mult = side === 'buy' ? exitPrice / entryPrice : entryPrice / exitPrice;
      const pnl = notional * (mult - 1);
      closed = {
        symbol,
        side,
        sizePct: sz,
        entry: entryPrice,
        notional: round(notional, 4),
        exit: exitPrice,
        openedAt: t,
        closedAt: t,
        pnl: round(pnl, 4),
        pnlPct: round((mult - 1) * 100, 4),
        status: 'closed',
      };
    }

    p.balance = round(p.balance + closed.pnl, 6);
    p.closedTrades.push(closed);
    p.equity.push({ t: closed.closedAt, s: p.balance });
    p.updatedAt = Date.now();

    if (!savePortfolios(portfolios)) {
      return res.status(500).json({ error: 'failed to persist trade', message: 'paper-portfolios.json write failed' });
    }
    res.json({ status: 'closed', trade: closed, balance: p.balance, pnl: closed.pnl, message: 'Paper position closed. No real money, no execution.' });
  } catch (err) {
    res.status(500).json({ error: 'trade failed', message: err.message || String(err) });
  }
});

// ─── equity curve ───────────────────────────────────────────────────────────

router.get('/equity', (req, res) => {
  try {
    const userId = resolveUserId(req) || 'anon';
    const p = loadPortfolios()[userId];
    res.json({ userId, equity: (p && p.equity) ? p.equity : [] });
  } catch (err) {
    res.status(500).json({ error: 'equity read failed', message: err.message || String(err) });
  }
});

module.exports = router;