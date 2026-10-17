// node vision/compare.mjs reports/before reports/after
// Shows what an edit changed: findings fixed or newly introduced, performance movement, and
// how much of each screenshot changed.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './png.mjs';
import { diffImages } from './metrics.mjs';

// Timing findings wobble from run to run (especially in software-rendered headless browsers),
// so on their own they never count as a regression — they are reported as a note to re-run.
const NOISY = new Set(['frame-spikes']);

export function compareReports(before, after) {
  const ids = (r) => new Set((r.findings || []).map((f) => f.id));
  const severity = Object.fromEntries((after.findings || []).map((f) => [f.id, f.severity || 'warning']));
  const b = ids(before), a = ids(after);
  const delta = (k) => (before.perf?.[k] != null && after.perf?.[k] != null ? +(after.perf[k] - before.perf[k]).toFixed(1) : null);
  const fixed = [...b].filter((x) => !a.has(x));
  const introduced = [...a].filter((x) => !b.has(x));
  const real = introduced.filter((x) => !NOISY.has(x) && severity[x] !== 'info');
  const noisy = introduced.filter((x) => NOISY.has(x));
  let verdict = real.length ? 'REGRESSION: the edit introduced new findings' : fixed.length ? 'IMPROVED' : 'NO CHANGE in findings';
  if (!real.length && noisy.length) verdict += ` (note: ${noisy.join(', ')} appeared — timing is noisy, re-run to confirm)`;
  return { fixed, introduced, remaining: [...a].filter((x) => b.has(x)), perf: { fps: delta('fps'), p95FrameMs: delta('p95FrameMs'), drawCalls: delta('drawCalls') }, verdict };
}

if (process.argv[1]?.endsWith('compare.mjs')) {
  const [da, db] = process.argv.slice(2);
  if (!da || !db) { console.error('usage: node vision/compare.mjs <before dir> <after dir>'); process.exit(2); }
  const load = (d) => JSON.parse(readFileSync(join(d, 'report.json'), 'utf8'));
  const A = load(da), B = load(db), res = compareReports(A, B);
  console.log(JSON.stringify(res, null, 2));
  A.frames.forEach((f, i) => {
    const g = B.frames[i];
    if (!g || !existsSync(f.file) || !existsSync(g.file)) return;
    try { const d = diffImages(decodePng(readFileSync(f.file)), decodePng(readFileSync(g.file))); console.log(`shot ${i}: ${d.changedPercent}% of pixels changed`, d.bbox ? `in region ${JSON.stringify(d.bbox)}` : ''); }
    catch (e) { console.log(`shot ${i}: ${e.message}`); }
  });
}
