'use strict';
const sma = (a, n) => (a.length < n ? null : a.slice(-n).reduce((s, x) => s + x, 0) / n);

function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

const pctChange = (a, n) =>
  a.length <= n || !a[a.length - 1 - n] ? null : (a[a.length - 1] / a[a.length - 1 - n] - 1) * 100;

const returns = (a) => a.slice(1).map((x, i) => (a[i] ? x / a[i] - 1 : NaN));

const cleanCloses = (arr) => (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  const xs = x.slice(-n), ys = y.slice(-n);
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

module.exports = { sma, rsi, pctChange, returns, cleanCloses, pearson };
