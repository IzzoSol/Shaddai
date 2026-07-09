#!/usr/bin/env node
'use strict';
/*
 * AURA reproducible benchmark (A5.5).
 *
 * Feeds a representative SAMPLE of ~60 prompts through aura.route() and reports:
 *   - hit-rate (hits / total)
 *   - method breakdown (fetch / seed / compute / skill / chain / query / miss)
 *   - average + p95 latency (ms) per route() call
 *
 * NOTE: this is a hand-picked VARIED SAMPLE (~60 prompts), NOT a 500-prompt corpus.
 * Numbers are real (measured live from this process) — nothing here is faked.
 * The mix intentionally spans: pure-compute (should HIT via compute), stable facts
 * (may HIT via seed if aura-seed.json has them), and open-ended/volatile prompts
 * (should MISS and pass through to a real LLM). So a hit-rate well under 100% is
 * EXPECTED and correct — the misses prove AURA declines what it can't truly answer.
 *
 * Run:  node backend/lib/aura-benchmark.js
 *       node backend/lib/aura-benchmark.js --json   (machine-readable output)
 *
 * All diagnostics go to stderr via console.error so stdout stays parseable when --json.
 */
const path = require('path');
const aura = require(path.join(__dirname, 'aura.js'));

// ── Representative sample (SAMPLE, not exhaustive) ──────────────────────────
// Grouped by expectation for readability; order is shuffled at run time so
// caching between prompts doesn't bias the numbers toward earlier entries.
const COMPUTE_LIKELY = [
  '12 * 12', '(3 + 4) * 5', '2^10', '15% of 240', '20% off 80', '20% markup on 50',
  'average of 12, 18, 30', 'sum of 5 10 15', 'max of 3, 9, 4', 'median of 2, 5, 9',
  'stddev of 2, 4, 4, 4, 5, 5, 7, 9', '255 in hex', '0b1010 in decimal',
  'roman numeral for 2025', 'XIV in decimal', 'factorial of 5', 'gcd of 12 and 8',
  'lcm of 4 and 6', 'is 17 prime', '10th fibonacci number', '3 hours in minutes',
  '1 gb to mb', '10 km to miles', '100 c to f', '500 ml to liters',
  'compound interest on 1000 at 10% for 2 years', 'monthly payment on 10000 at 5% for 3 years',
  'ordinal of 21', '123 in words', "count vowels in 'hello'", "sha256 of 'hello'",
  'url encode hello world', 'unix timestamp for 2024-01-01', '#FF5733 to rgb',
  'clamp 150 between 0 and 100', 'base64 encode hello', 'reverse: abc',
  'uppercase: hello world', 'word count of: the quick brown fox',
  'simplify ratio 12:8', 'round 3.14159 to 2 decimal places', '3 out of 4 as a percent',
  'sqrt of 144', '17 mod 5', 'hypotenuse of 3 and 4', 'is 2024 a leap year',
];

// Stable factual / FAQ-style — may HIT via SEED if present, else legitimately MISS.
const FACT_MAYBE = [
  'what is aura', 'what is shaddai', 'how many agents does shaddai have',
  'what does zerox do', 'what is the pro tier price',
];

// Open-ended / volatile — SHOULD MISS (AURA must not fabricate these).
const SHOULD_MISS = [
  'write a haiku about autumn rain', 'what is the meaning of life',
  'should I buy Tesla stock', 'what is the current price of bitcoin',
  'summarize the French revolution', 'give me a marketing slogan for shoes',
  'what should I cook for dinner', 'explain quantum entanglement to a child',
  'latest crypto news', 'what is the weather right now',
];

const SAMPLE = [...COMPUTE_LIKELY, ...FACT_MAYBE, ...SHOULD_MISS];

// Deterministic shuffle (seeded) so runs are reproducible.
function shuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function run() {
  const prompts = shuffle(SAMPLE, 42);
  const byMethod = {};
  const latencies = [];
  let hits = 0;

  for (const p of prompts) {
    const t0 = process.hrtime.bigint();
    const r = aura.route(p);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    latencies.push(ms);
    const method = r.hit ? (r.method || 'hit') : 'miss';
    byMethod[method] = (byMethod[method] || 0) + 1;
    if (r.hit) hits++;
  }

  const total = prompts.length;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const avg = latencies.reduce((s, v) => s + v, 0) / (total || 1);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] || 0;

  return {
    sample: true,
    total,
    hits,
    misses: total - hits,
    hitRate: Math.round((hits / (total || 1)) * 1000) / 1000,
    byMethod,
    latencyMs: {
      avg: Math.round(avg * 1000) / 1000,
      p95: Math.round(p95 * 1000) / 1000,
      max: Math.round((sorted[sorted.length - 1] || 0) * 1000) / 1000,
    },
    ranAt: new Date().toISOString(),
  };
}

const out = run();

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} else {
  const lines = [];
  lines.push('');
  lines.push('=== AURA BENCHMARK (representative SAMPLE, ' + out.total + ' prompts — not a 500-prompt corpus) ===');
  lines.push('hit-rate:  ' + (out.hitRate * 100).toFixed(1) + '%   (' + out.hits + ' hits / ' + out.misses + ' misses)');
  lines.push('latency:   avg ' + out.latencyMs.avg + ' ms · p95 ' + out.latencyMs.p95 + ' ms · max ' + out.latencyMs.max + ' ms');
  lines.push('method breakdown:');
  for (const [m, n] of Object.entries(out.byMethod).sort((a, b) => b[1] - a[1])) {
    lines.push('   ' + m.padEnd(10) + ' ' + n);
  }
  lines.push('');
  lines.push('note: misses are EXPECTED for open-ended/volatile prompts — AURA declines what it');
  lines.push('      cannot deterministically answer, so those pass through to the real LLM.');
  lines.push('');
  // Human report → stdout is fine here (no --json); keep it readable.
  process.stdout.write(lines.join('\n') + '\n');
}
