'use strict';

// scripts/audit-calls-deep.js — the full cross-reference audit over tg-calls.json.
//
// Answers ONE question with data: which measured conditions produced the
// winners, and which produced the deaths? Every rate below is computed on
// MEASURED-outcome rows only (peakMult > 1.01, closed, or milestones crossed).
// Flat 1.00x rows are the dead-tracker artefact (post-mortem FACT-0), not
// losses, and are reported separately so they can never poison a hit rate
// again.
//
//   node scripts/audit-calls-deep.js [path-to-tg-calls.json]

const fs = require('fs');
const path = require('path');

const CALLS_FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'tg-calls.json');
const OVERLAP_FILE = path.join(__dirname, '..', 'data', 'source-overlap.json');

const raw = JSON.parse(fs.readFileSync(CALLS_FILE, 'utf8'));
const calls = Array.isArray(raw) ? raw : (raw.calls || Object.values(raw));
let overlap = {};
try { overlap = JSON.parse(fs.readFileSync(OVERLAP_FILE, 'utf8')); } catch (e) {}

// ── classification ──────────────────────────────────────────────────────────
// The fail-open signature (see telegram-signals.js _rugScore): when rugcheck
// errored, the composite returned score 60 + zero holders/top10 — and the
// call went out UNVETTED. 60-by-measurement is possible but vanishingly rare.
const unvetted = (c) => (c.rugScore === 60 || c.rugScore === 0 || c.rugScore == null) && !(c.holders > 0) && !(c.top10Pct > 0) && !(c.insiders > 0);
const measuredOutcome = (c) => (Number(c.peakMult) || 0) > 1.01 || !!c.closed || (Array.isArray(c.milestones) && c.milestones.length > 0);
const srcCount = (c) => { const o = overlap[c.mint]; return o ? Object.keys(o).filter((k) => k !== 'ts').length : null; };
const band = (v, edges, labels) => { for (let i = 0; i < edges.length; i++) if (v < edges[i]) return labels[i]; return labels[labels.length - 1]; };

function stats(rows) {
  const tracked = rows.filter(measuredOutcome);
  const peaks = tracked.map((c) => Number(c.peakMult) || 1).sort((a, b) => a - b);
  const w2 = peaks.filter((p) => p >= 2).length;
  const w5 = peaks.filter((p) => p >= 5).length;
  const med = peaks.length ? peaks[Math.floor(peaks.length / 2)] : 0;
  return {
    n: rows.length, tracked: tracked.length, flat: rows.length - tracked.length,
    r2: tracked.length ? Math.round((w2 / tracked.length) * 100) : 0,
    r5: tracked.length ? Math.round((w5 / tracked.length) * 100) : 0,
    med: +med.toFixed(2),
  };
}

function row(label, rows) {
  const s = stats(rows);
  return { label, n: s.n, tracked: s.tracked, flat: s.flat, '2x+': s.r2 + '%', '5x+': s.r5 + '%', median: s.med + 'x' };
}

// ── the audit ───────────────────────────────────────────────────────────────
const vetted = calls.filter((c) => !unvetted(c));
const unv = calls.filter(unvetted);
const out = [];
const A = (label, rows) => { if (rows.length) out.push(row(label, rows)); };

console.log(`\n══ DEEP AUDIT · ${calls.length} calls ever made ══\n`);

console.log(`vetted (deep fields present): ${vetted.length} · unvetted (fail-open score-60 signature): ${unv.length}`);
console.log(`flat/unmeasured rows (dead-tracker era, excluded from every rate): ${calls.length - calls.filter(measuredOutcome).length}\n`);

// 1 — vetting: the headline finding
A('VETTED calls', vetted);
A('UNVETTED calls (fail-open)', unv);

// 2 — per source
const sources = [...new Set(calls.map((c) => c.source || '?'))].sort();
sources.forEach((s) => A(`src:${s}`, calls.filter((c) => (c.source || '?') === s)));

// 3 — FDV bands
[['<10k', 10000], ['10-25k', 25000], ['25-50k', 50000], ['50-100k', 100000], ['100-250k', 250000], ['250k+', Infinity]].forEach(([l, hi]) => {
  A(`fdv:${l}`, calls.filter((c) => (c.entryFdv || 0) < hi && (c.entryFdv || 0) >= (l === '<10k' ? 0 : ({ '10-25k': 10000, '25-50k': 25000, '50-100k': 50000, '100-250k': 100000, '250k+': 250000 }[l]))));
});

// 4 — liquidity depth at entry
A('liq:<10k', calls.filter((c) => (c.liq || 0) > 0 && c.liq < 10000));
A('liq:10-30k', calls.filter((c) => (c.liq || 0) >= 10000 && c.liq < 30000));
A('liq:30k+', calls.filter((c) => (c.liq || 0) >= 30000));

// 5 — liq/FDV ratio (dump-risk mirror)
A('liq/fdv <15%', calls.filter((c) => c.entryFdv > 0 && (c.liq || 0) / c.entryFdv < 0.15));
A('liq/fdv 15-40%', calls.filter((c) => c.entryFdv > 0 && (c.liq || 0) / c.entryFdv >= 0.15 && c.liq / c.entryFdv < 0.40));
A('liq/fdv 40%+', calls.filter((c) => c.entryFdv > 0 && (c.liq || 0) / c.entryFdv >= 0.40));

// 6 — multi-source agreement (from source-overlap.json)
A('srcCount:1', calls.filter((c) => srcCount(c) === 1));
A('srcCount:2', calls.filter((c) => srcCount(c) === 2));
A('srcCount:3+', calls.filter((c) => (srcCount(c) || 0) >= 3));
A('srcCount:unknown', calls.filter((c) => srcCount(c) == null));

// 7 — holders (where measured)
A('holders:<100', calls.filter((c) => c.holders > 0 && c.holders < 100));
A('holders:100+', calls.filter((c) => (c.holders || 0) >= 100));

// 8 — volume character
A('vol1h <10k', calls.filter((c) => (c.vol1h || 0) > 0 && c.vol1h < 10000));
A('vol1h 10-50k', calls.filter((c) => (c.vol1h || 0) >= 10000 && c.vol1h < 50000));
A('vol1h 50k+', calls.filter((c) => (c.vol1h || 0) >= 50000));

// 9 — hour of day (UTC)
for (const [l, h] of [['hour 0-7', [0, 8]], ['hour 8-15', [8, 16]], ['hour 16-23', [16, 24]]]) {
  A(`when:${l}`, calls.filter((c) => { const H = new Date(c.ts).getUTCHours(); return H >= h[0] && H < h[1]; }));
}

// 10 — era: before/after the 2026-08-27 boosts tightening (timestamp guess)
const TIGHTENING = Date.parse('2026-08-27');
A('era:pre-2026-08-27', calls.filter((c) => c.ts < TIGHTENING));
A('era:post-2026-08-27', calls.filter((c) => c.ts >= TIGHTENING));

// 11 — deep-field interactions on VETTED rows only
A('vetted & srcCount 2+', vetted.filter((c) => (srcCount(c) || 0) >= 2));
A('vetted & liq/fdv 15%+', vetted.filter((c) => c.entryFdv > 0 && (c.liq || 0) / c.entryFdv >= 0.15));
A('vetted & fdv<50k', vetted.filter((c) => (c.entryFdv || 0) < 50000));
A('UNVETTED & fdv<25k (worst combo?)', unv.filter((c) => (c.entryFdv || 0) < 25000));

console.table(out);

// baseline for comparison
const base = stats(calls.filter(measuredOutcome));
console.log(`\nBASELINE (all measured outcomes): n=${base.tracked} · 2x+ ${base.r2}% · 5x+ ${base.r5}% · median ${base.med}x`);
console.log('Rows with n(tracked) < 8 are noise — do not gate on them.');
console.log('Flat rows are excluded everywhere: they are missing data, not losses (FACT-0).\n');
