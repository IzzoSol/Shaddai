// Builds a report from raw capture data, and renders it as Markdown. No side effects on import.
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';
import { frameMetrics, diffImages } from './metrics.mjs';
import { analyze, summarize } from './analyze.mjs';

export function buildReport(raw) {
  let prev = null;
  const frames = raw.frames.map((f) => {
    const img = decodePng(readFileSync(f.file));
    const entry = { t: f.t, file: f.file, metrics: frameMetrics(img), diffFromPrevious: prev ? diffImages(prev, img).changedPercent : null };
    prev = img;
    return entry;
  });
  const report = { ...raw, frames };
  report.findings = analyze(report);
  return report;
}

export function markdown(report) {
  const rows = report.frames.map((f) => `| ${f.t}s | ${f.metrics.mean} | ${f.metrics.std} | ${f.metrics.colourRatio} | ${f.metrics.edgeDensity} | ${f.diffFromPrevious ?? '—'} |`).join('\n');
  return `# Visual review\n\nPerformance: ${report.perf.fps ?? '?'} fps · p95 ${report.perf.p95FrameMs ?? '?'} ms · max ${report.perf.maxFrameMs ?? '?'} ms · draw calls ${report.perf.drawCalls ?? 'n/a'}\n\n## Findings\n\n${summarize(report.findings)}\n\n## Frames\n\n| time | brightness | contrast | colours | edges | change vs previous % |\n|---|---|---|---|---|---|\n${rows}\n\nLook at \`contact.png\` and each \`shot-NN.png\`, then use the checklist in the game-visual-review skill.\n`;
}
