'use strict';

/**
 * SHADDAI tools-ta.js
 * Real technical-analysis tools for the agent engine (ZEROX, ORACLE).
 * Pure indicator math (no external TA libs) over OHLCV fetched from the
 * keyless CoinGecko OHLC endpoint.
 *
 * Merge into the main TOOLS registry with:
 *   try { Object.assign(TOOLS, require('./tools-ta')); } catch (e) {}
 *
 * Tools: ta_rsi, ta_macd, ta_ema, ta_bollinger, ta_atr,
 *        ta_support_resistance, ta_pivots, ta_fibonacci, ta_trend, ta_signal
 */

const axios = require('axios');

const UA = { 'User-Agent': 'SHADDAI-Agent/2.0 (shaddai.ai)' };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function errMsg(err) {
  const d = err && err.response && err.response.data;
  if (d) return typeof d === 'string' ? d.slice(0, 300) : (d.message || JSON.stringify(d).slice(0, 300));
  return err && err.message ? err.message : String(err);
}

/** Map common tickers / aliases to CoinGecko coin ids. */
const TICKER_MAP = {
  btc: 'bitcoin', xbt: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'ethereum', ether: 'ethereum', ethereum: 'ethereum',
  sol: 'solana', solana: 'solana',
  bnb: 'binancecoin', binancecoin: 'binancecoin',
  ada: 'cardano', cardano: 'cardano',
  xrp: 'ripple', ripple: 'ripple',
  doge: 'dogecoin', dogecoin: 'dogecoin',
  matic: 'matic-network', polygon: 'matic-network',
  dot: 'polkadot', polkadot: 'polkadot',
  avax: 'avalanche-2', avalanche: 'avalanche-2',
  link: 'chainlink', chainlink: 'chainlink',
  ltc: 'litecoin', litecoin: 'litecoin',
  usdt: 'tether', tether: 'tether',
  usdc: 'usd-coin'
};

function resolveCoin(input) {
  if (!input || typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  if (TICKER_MAP[key]) return TICKER_MAP[key];
  // Otherwise treat as a CoinGecko slug (e.g. "the-open-network").
  return key.replace(/\s+/g, '-');
}

/**
 * Fetch OHLC candles from CoinGecko (keyless).
 * Returns { ok, candles:[{t,o,h,l,c}], error }.
 */
async function fetchOHLC(coinId, days = 30) {
  if (!coinId) return { ok: false, error: 'coin is required (e.g. "bitcoin", "eth", "SOL")' };
  try {
    const resp = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc`,
      { params: { vs_currency: 'usd', days }, timeout: 8000, headers: UA }
    );
    const raw = resp.data;
    if (!Array.isArray(raw) || !raw.length) {
      return { ok: false, error: `No OHLC data returned for "${coinId}"` };
    }
    const candles = raw
      .filter(r => Array.isArray(r) && r.length >= 5)
      .map(r => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] }))
      .filter(c => [c.o, c.h, c.l, c.c].every(Number.isFinite));
    if (!candles.length) return { ok: false, error: `Malformed OHLC data for "${coinId}"` };
    return { ok: true, candles };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

const round = (v, p = 6) => (Number.isFinite(v) ? +v.toFixed(p) : null);

// ── Pure indicator math ───────────────────────────────────────────────────────

/** Simple moving average of the last `period` values. */
function calcSMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/**
 * Exponential moving average series. Seeds with the SMA of the first `period`.
 * Returns array aligned to input (first period-1 entries are null).
 */
function calcEMASeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Latest EMA value (or null). */
function calcEMA(values, period) {
  const s = calcEMASeries(values, period);
  if (!s) return null;
  return s[s.length - 1];
}

/**
 * Wilder's RSI over close values. Returns latest RSI (0-100) or null.
 */
function calcRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  // Initial average over the first `period` deltas.
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // Wilder smoothing across the rest.
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD over closes. Returns { macd, signal, histogram } or null.
 */
function calcMACD(closes, fast = 12, slow = 26, signalP = 9) {
  if (!Array.isArray(closes) || closes.length < slow + signalP) return null;
  const fastE = calcEMASeries(closes, fast);
  const slowE = calcEMASeries(closes, slow);
  if (!fastE || !slowE) return null;
  // MACD line where both EMAs are defined.
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastE[i] != null && slowE[i] != null) macdLine.push(fastE[i] - slowE[i]);
  }
  if (macdLine.length < signalP) return null;
  const signalSeries = calcEMASeries(macdLine, signalP);
  if (!signalSeries) return null;
  const macd = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macd, signal, histogram: macd - signal };
}

/**
 * Bollinger Bands over closes. Returns { upper, mid, lower } or null.
 */
function calcBollinger(closes, period = 20, mult = 2) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const mid = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: mid + mult * sd, mid, lower: mid - mult * sd, sd };
}

/**
 * Average True Range over candles. Returns latest ATR or null.
 */
function calcATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i], prev = candles[i - 1];
    const tr = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prev.c),
      Math.abs(cur.l - prev.c)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  // Wilder smoothing.
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/** Classic floor-trader pivots from the most recent completed candle. */
function calcPivots(candle) {
  if (!candle) return null;
  const { h, l, c } = candle;
  const pp = (h + l + c) / 3;
  return {
    pp,
    r1: 2 * pp - l,
    s1: 2 * pp - h,
    r2: pp + (h - l),
    s2: pp - (h - l)
  };
}

const closesOf = (candles) => candles.map(c => c.c);

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry (top-level export so agent-engine can Object.assign directly)
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS_TA = {

  ta_rsi: {
    name: 'ta_rsi',
    description: 'Relative Strength Index (RSI) momentum oscillator (Wilder) for a coin over CoinGecko 30d OHLC (keyless). Returns the latest RSI 0-100 with an overbought (>70) / oversold (<30) label. Pass a coin id or ticker, e.g. "bitcoin", "ETH", "SOL".',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH", "SOL"',
      period: 'number — RSI period (default 14)'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol, period = 14 } = {}) {
      const id = resolveCoin(coin || symbol);
      const p = Math.max(parseInt(period, 10) || 14, 2);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const rsi = calcRSI(closesOf(data.candles), p);
      if (rsi == null) return JSON.stringify({ success: false, error: 'Not enough data for RSI', coin: id });
      const label = rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral';
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'RSI',
        coin: id, period: p, rsi: round(rsi, 2), label
      });
    }
  },

  ta_macd: {
    name: 'ta_macd',
    description: 'MACD (12/26/9) trend-momentum indicator for a coin over CoinGecko 30d OHLC (keyless). Returns MACD line, signal line, histogram, and a bullish/bearish read. Pass a coin id or ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const m = calcMACD(closesOf(data.candles));
      if (!m) return JSON.stringify({ success: false, error: 'Not enough data for MACD', coin: id });
      const trend = m.histogram > 0 ? 'bullish' : m.histogram < 0 ? 'bearish' : 'flat';
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'MACD', coin: id,
        macd: round(m.macd, 4), signal: round(m.signal, 4),
        histogram: round(m.histogram, 4), trend
      });
    }
  },

  ta_ema: {
    name: 'ta_ema',
    description: 'Exponential Moving Average (EMA) for a coin over CoinGecko 30d OHLC (keyless). Returns the latest EMA value and where the current price sits relative to it. Pass a coin id/ticker and optional period.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"',
      period: 'number — EMA period (default 20)'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol, period = 20 } = {}) {
      const id = resolveCoin(coin || symbol);
      const p = Math.max(parseInt(period, 10) || 20, 2);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const closes = closesOf(data.candles);
      const ema = calcEMA(closes, p);
      if (ema == null) return JSON.stringify({ success: false, error: 'Not enough data for EMA', coin: id });
      const price = closes[closes.length - 1];
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'EMA', coin: id, period: p,
        ema: round(ema, 4), price: round(price, 4),
        priceVsEma: price > ema ? 'above' : price < ema ? 'below' : 'at'
      });
    }
  },

  ta_bollinger: {
    name: 'ta_bollinger',
    description: 'Bollinger Bands (period 20, 2 SD) for a coin over CoinGecko 30d OHLC (keyless). Returns upper/mid/lower bands plus where price sits (above-upper / below-lower / inside). Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"',
      period: 'number — band period (default 20)'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol, period = 20 } = {}) {
      const id = resolveCoin(coin || symbol);
      const p = Math.max(parseInt(period, 10) || 20, 2);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const closes = closesOf(data.candles);
      const b = calcBollinger(closes, p);
      if (!b) return JSON.stringify({ success: false, error: 'Not enough data for Bollinger Bands', coin: id });
      const price = closes[closes.length - 1];
      const position = price > b.upper ? 'above-upper'
        : price < b.lower ? 'below-lower'
        : price > b.mid ? 'upper-half' : 'lower-half';
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Bollinger', coin: id, period: p,
        upper: round(b.upper, 4), mid: round(b.mid, 4), lower: round(b.lower, 4),
        price: round(price, 4), position
      });
    }
  },

  ta_atr: {
    name: 'ta_atr',
    description: 'Average True Range (ATR) volatility measure (Wilder) for a coin over CoinGecko 30d OHLC (keyless). Returns ATR in USD and as a % of price. Pass a coin id/ticker and optional period.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"',
      period: 'number — ATR period (default 14)'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol, period = 14 } = {}) {
      const id = resolveCoin(coin || symbol);
      const p = Math.max(parseInt(period, 10) || 14, 2);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const atr = calcATR(data.candles, p);
      if (atr == null) return JSON.stringify({ success: false, error: 'Not enough data for ATR', coin: id });
      const price = data.candles[data.candles.length - 1].c;
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'ATR', coin: id, period: p,
        atr: round(atr, 4), price: round(price, 4),
        atrPctOfPrice: price ? round((atr / price) * 100, 2) : null
      });
    }
  },

  ta_pivots: {
    name: 'ta_pivots',
    description: 'Classic floor-trader pivot points (PP, R1, R2, S1, S2) for a coin from the most recent CoinGecko OHLC candle (keyless). Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const last = data.candles[data.candles.length - 1];
      const piv = calcPivots(last);
      if (!piv) return JSON.stringify({ success: false, error: 'Not enough data for pivots', coin: id });
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Pivots', coin: id,
        price: round(last.c, 4),
        pp: round(piv.pp, 4), r1: round(piv.r1, 4), r2: round(piv.r2, 4),
        s1: round(piv.s1, 4), s2: round(piv.s2, 4)
      });
    }
  },

  ta_support_resistance: {
    name: 'ta_support_resistance',
    description: 'Nearest support and resistance for a coin, derived from pivot levels and recent swing high/low over CoinGecko 30d OHLC (keyless). Returns the closest support below and resistance above the current price. Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const candles = data.candles;
      const last = candles[candles.length - 1];
      const price = last.c;
      const piv = calcPivots(last);
      // Recent swing high/low over the lookback window.
      const swingHigh = Math.max(...candles.map(c => c.h));
      const swingLow = Math.min(...candles.map(c => c.l));
      const levels = [piv.r1, piv.r2, piv.s1, piv.s2, piv.pp, swingHigh, swingLow]
        .filter(Number.isFinite);
      const above = levels.filter(v => v > price).sort((a, b) => a - b);
      const below = levels.filter(v => v < price).sort((a, b) => b - a);
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Support/Resistance', coin: id,
        price: round(price, 4),
        nearestResistance: above.length ? round(above[0], 4) : round(swingHigh, 4),
        nearestSupport: below.length ? round(below[0], 4) : round(swingLow, 4),
        swingHigh: round(swingHigh, 4), swingLow: round(swingLow, 4)
      });
    }
  },

  ta_fibonacci: {
    name: 'ta_fibonacci',
    description: 'Fibonacci retracement levels (0, 23.6, 38.2, 50, 61.8, 78.6, 100%) for a coin from the recent swing high/low over CoinGecko 30d OHLC (keyless). Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const candles = data.candles;
      const high = Math.max(...candles.map(c => c.h));
      const low = Math.min(...candles.map(c => c.l));
      const price = candles[candles.length - 1].c;
      const diff = high - low;
      if (!Number.isFinite(diff) || diff <= 0) {
        return JSON.stringify({ success: false, error: 'Invalid swing range for Fibonacci', coin: id });
      }
      // Retracements measured down from the swing high.
      const level = (r) => round(high - diff * r, 4);
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Fibonacci', coin: id,
        swingHigh: round(high, 4), swingLow: round(low, 4), price: round(price, 4),
        levels: {
          '0%': round(high, 4),
          '23.6%': level(0.236),
          '38.2%': level(0.382),
          '50%': level(0.5),
          '61.8%': level(0.618),
          '78.6%': level(0.786),
          '100%': round(low, 4)
        }
      });
    }
  },

  ta_trend: {
    name: 'ta_trend',
    description: 'Trend classification (Bullish / Bearish / Sideways) for a coin via EMA20 vs EMA50 over CoinGecko 30d OHLC (keyless). Returns both EMAs, their spread %, and the trend label. Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const closes = closesOf(data.candles);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50) ?? calcEMA(closes, Math.min(50, Math.max(closes.length - 1, 2)));
      if (ema20 == null || ema50 == null) {
        return JSON.stringify({ success: false, error: 'Not enough data for trend (need EMA20/EMA50)', coin: id });
      }
      const spreadPct = ema50 ? ((ema20 - ema50) / ema50) * 100 : 0;
      let trend;
      if (spreadPct > 0.5) trend = 'Bullish';
      else if (spreadPct < -0.5) trend = 'Bearish';
      else trend = 'Sideways';
      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Trend', coin: id,
        price: round(closes[closes.length - 1], 4),
        ema20: round(ema20, 4), ema50: round(ema50, 4),
        spreadPct: round(spreadPct, 2), trend
      });
    }
  },

  ta_signal: {
    name: 'ta_signal',
    description: 'Combined BUY/SELL/HOLD signal for a coin from RSI + EMA20/EMA50 cross + MACD over CoinGecko 30d OHLC (keyless). Returns the signal, a confidence score, the contributing indicators, and a short reason. Pass a coin id/ticker.',
    schema: {
      coin: 'string — coin id or ticker, e.g. "bitcoin", "ETH"'
    },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ coin, symbol } = {}) {
      const id = resolveCoin(coin || symbol);
      const data = await fetchOHLC(id, 30);
      if (!data.ok) return JSON.stringify({ success: false, error: data.error, coin: id });
      const closes = closesOf(data.candles);
      const rsi = calcRSI(closes, 14);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50) ?? calcEMA(closes, Math.min(50, Math.max(closes.length - 1, 2)));
      const macd = calcMACD(closes);
      if (rsi == null || ema20 == null || ema50 == null || !macd) {
        return JSON.stringify({ success: false, error: 'Not enough data for combined signal', coin: id });
      }

      let score = 0;
      const reasons = [];

      // RSI
      if (rsi <= 30) { score += 1; reasons.push(`RSI ${rsi.toFixed(1)} oversold`); }
      else if (rsi >= 70) { score -= 1; reasons.push(`RSI ${rsi.toFixed(1)} overbought`); }
      else reasons.push(`RSI ${rsi.toFixed(1)} neutral`);

      // EMA cross
      if (ema20 > ema50) { score += 1; reasons.push('EMA20 > EMA50 (uptrend)'); }
      else if (ema20 < ema50) { score -= 1; reasons.push('EMA20 < EMA50 (downtrend)'); }

      // MACD
      if (macd.histogram > 0) { score += 1; reasons.push('MACD bullish'); }
      else if (macd.histogram < 0) { score -= 1; reasons.push('MACD bearish'); }

      let signal;
      if (score >= 2) signal = 'BUY';
      else if (score <= -2) signal = 'SELL';
      else signal = 'HOLD';

      return JSON.stringify({
        success: true, source: 'coingecko', indicator: 'Signal', coin: id,
        signal, score,
        confidence: Math.min(Math.round((Math.abs(score) / 3) * 100), 100),
        price: round(closes[closes.length - 1], 4),
        components: {
          rsi: round(rsi, 2),
          ema20: round(ema20, 4),
          ema50: round(ema50, 4),
          macdHistogram: round(macd.histogram, 4)
        },
        reason: reasons.join('; ')
      });
    }
  }

};

module.exports = TOOLS_TA;
