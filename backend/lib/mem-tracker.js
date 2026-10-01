'use strict';
// Memory tracker — samples process memory on an interval into a ring buffer so
// /api/memory can show current use, peak, trend and % of the host's limit.
// Render kills on RSS (not heap), so RSS is the number that matters.

const SAMPLE_MS = 60 * 1000;
const MAX_SAMPLES = 1440; // 24h at 1/min
const LIMIT_MB = Number(process.env.MEMORY_LIMIT_MB) || 512; // Render free tier
const WARN_PCT = 80;
const CRIT_PCT = 92;

const samples = [];
let timer = null;
let peak = { rssMB: 0, ts: 0 };
let lastLevel = 'ok';
let onCritical = null; // optional relief valve (e.g. drop caches)
let onBand = null;     // notify(bandPct, snapshot, direction) — fires on every 20% step
let lastBand = -1;     // highest 20% step announced; drops only after a 5% hysteresis

const mb = (n) => +(n / 1048576).toFixed(1);

function sample() {
  const m = process.memoryUsage();
  const s = {
    ts: Date.now(),
    rssMB: mb(m.rss),
    heapUsedMB: mb(m.heapUsed),
    heapTotalMB: mb(m.heapTotal),
    externalMB: mb(m.external),
    arrayBuffersMB: mb(m.arrayBuffers || 0),
  };
  samples.push(s);
  if (samples.length > MAX_SAMPLES) samples.shift();
  if (s.rssMB > peak.rssMB) peak = { rssMB: s.rssMB, ts: s.ts };

  const level = levelFor(s.rssMB);
  if (level !== lastLevel && level !== 'ok') {
    if (level === 'critical' && onCritical) { try { onCritical(); if (global.gc) global.gc(); } catch (_) {} }
    console.warn(`[mem] ${level.toUpperCase()} — RSS ${s.rssMB} MB of ${LIMIT_MB} MB (${pct(s.rssMB)}%) · heap ${s.heapUsedMB} MB`);
  }
  lastLevel = level;

  // 20% steps: 0,20,40,60,80,100. Fire on each new step up, and on a step down (after 5% hysteresis).
  const p = pct(s.rssMB);
  const band = Math.min(100, Math.floor(p / 20) * 20);
  if (lastBand === -1) { lastBand = band; if (onBand) fireBand(band, s, 'start'); }
  else if (band > lastBand) { lastBand = band; fireBand(band, s, 'up'); }
  else if (band < lastBand && p <= lastBand - 5) { lastBand = band; fireBand(band, s, 'down'); }
  return s;
}

const pct = (rssMB) => Math.round((rssMB / LIMIT_MB) * 100);
function levelFor(rssMB) {
  const p = pct(rssMB);
  return p >= CRIT_PCT ? 'critical' : p >= WARN_PCT ? 'warn' : 'ok';
}

function fireBand(band, s, dir) {
  try { if (onBand) onBand(band, { rssMB: s.rssMB, heapUsedMB: s.heapUsedMB, limitMB: LIMIT_MB, percent: pct(s.rssMB) }, dir); } catch (_) {}
}

function start(opts = {}) {
  if (opts.onCritical) onCritical = opts.onCritical;
  if (opts.onBand) onBand = opts.onBand;
  if (timer) return;
  sample();
  timer = setInterval(sample, SAMPLE_MS);
  if (timer.unref) timer.unref();
}

// MB/hour growth of RSS over the last `windowMin` minutes (least-squares-free: endpoints).
function trendMBPerHour(windowMin = 60) {
  const cutoff = Date.now() - windowMin * 60000;
  const w = samples.filter((s) => s.ts >= cutoff);
  if (w.length < 2) return 0;
  const a = w[0], b = w[w.length - 1];
  const hrs = (b.ts - a.ts) / 3600000;
  return hrs > 0 ? +((b.rssMB - a.rssMB) / hrs).toFixed(1) : 0;
}

function snapshot({ points = 120 } = {}) {
  const cur = samples[samples.length - 1] || sample();
  const trend = trendMBPerHour(60);
  const headroom = LIMIT_MB - cur.rssMB;
  const minsToLimit = trend > 0 ? Math.round((headroom / trend) * 60) : null;
  const step = Math.max(1, Math.ceil(samples.length / points));
  return {
    ok: true,
    level: levelFor(cur.rssMB),
    limitMB: LIMIT_MB,
    current: cur,
    percentOfLimit: pct(cur.rssMB),
    peak: { rssMB: peak.rssMB, percent: pct(peak.rssMB), at: peak.ts ? new Date(peak.ts).toISOString() : null },
    trendMBPerHour: trend,
    minutesToLimitAtTrend: minsToLimit,
    uptimeSec: Math.round(process.uptime()),
    sampleCount: samples.length,
    history: samples.filter((_, i) => i % step === 0),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { start, sample, snapshot, LIMIT_MB };
