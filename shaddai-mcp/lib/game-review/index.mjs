// One entry point for tools and agents:  reviewGame(options)  and  compareRuns(beforeDir, afterDir)
// The CLI (review.mjs, compare.mjs) and the SHADDAI MCP both go through here.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capture } from './capture.mjs';
import { buildReport, markdown } from './report.mjs';
import { compareReports } from './compare.mjs';

export const LIMITS = { maxSeconds: 60, maxShots: 12, minSize: 200, maxSize: 3840, maxActions: 100 };

// Hosts a local review may open without an explicit opt-in: your own machine and private networks.
export function isLocalUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol === 'file:') return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const h = url.hostname.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local');
}

export function validate(o) {
  if (!o.url || typeof o.url !== 'string') throw new Error('url is required');
  if (!isLocalUrl(o.url) && !o.allowRemote) throw new Error('only local URLs (localhost, 127.x, private networks, file://) are allowed unless allowRemote is true');
  const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number.isFinite(+v) && v !== undefined ? +v : d));
  const actions = Array.isArray(o.actions) ? o.actions : [];
  if (actions.length > LIMITS.maxActions) throw new Error(`too many actions (max ${LIMITS.maxActions})`);
  for (const a of actions) {
    if (!(a && typeof a.at === 'number' && a.at >= 0 && a.at <= LIMITS.maxSeconds)) throw new Error('every action needs an "at" time in seconds');
    if (a.key !== undefined && (typeof a.key !== 'string' || a.key.length > 20)) throw new Error('action key must be a short string');
    if (a.type !== undefined && (typeof a.type !== 'string' || a.type.length > 200)) throw new Error('action type text is too long');
    if (a.click !== undefined && !(Array.isArray(a.click) && a.click.length === 2 && a.click.every((n) => Number.isFinite(n)))) throw new Error('action click must be [x, y]');
  }
  return {
    url: o.url, actions,
    seconds: clamp(o.seconds, 1, LIMITS.maxSeconds, 8), shots: Math.round(clamp(o.shots, 2, LIMITS.maxShots, 6)),
    width: Math.round(clamp(o.width, LIMITS.minSize, LIMITS.maxSize, 1280)), height: Math.round(clamp(o.height, LIMITS.minSize, LIMITS.maxSize, 720)),
  };
}

export async function reviewGame(options, outDir) {
  const opts = validate(options);
  mkdirSync(outDir, { recursive: true });
  const raw = await capture({ ...opts, outDir });
  const report = buildReport(raw);
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'REPORT.md'), markdown(report));
  return { report, markdown: markdown(report), dir: outDir, contactSheet: join(outDir, 'contact.png') };
}

export function compareRuns(beforeDir, afterDir) {
  const load = (d) => JSON.parse(readFileSync(join(d, 'report.json'), 'utf8'));
  return compareReports(load(beforeDir), load(afterDir));
}
