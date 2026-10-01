// Runs a game in headless Chromium and records what a player would see and what the machine saw.
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// (or set GAME_REVIEW_BROWSER to the path of any installed Chrome/Chromium/Edge)
//
// Optional hook: if the game defines  window.__gameProbe = () => ({ drawCalls, triangles, ... })
// the numbers are included in the report (e.g. return renderer.info.render.calls).
//
// actions: [{ at: seconds, key: 'ArrowRight', hold: 0.4 } | { at, click: [x, y] } | { at, type: 'text' }]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function capture({ url, seconds = 8, shots = 6, width = 1280, height = 720, actions = [], outDir }) {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); }
  mkdirSync(outDir, { recursive: true });

  // GAME_REVIEW_BROWSER=<path to chrome/chromium/edge> uses an existing browser instead of Playwright's own download.
  const browser = await chromium.launch(process.env.GAME_REVIEW_BROWSER ? { executablePath: process.env.GAME_REVIEW_BROWSER } : {});
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleLog = [], failed = [];
  page.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => consoleLog.push({ type: 'pageerror', text: String((e && e.message) || e) }));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), status: 0 }));
  page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
  await page.addInitScript(() => {
    window.__frameTimes = [];
    let last = performance.now();
    (function tick(now) { window.__frameTimes.push(now - last); last = now; if (window.__frameTimes.length < 4000) requestAnimationFrame(tick); })(last);
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  // One merged, time-ordered list of things to do: screenshots and inputs.
  const events = [];
  for (let i = 0; i < shots; i++) events.push({ at: 0.5 + (i * (seconds - 0.5)) / Math.max(1, shots - 1), shot: i });
  for (const a of actions) events.push({ ...a });
  events.sort((a, b) => a.at - b.at);

  const frames = [];
  let inputs = 0;
  const t0 = Date.now();
  for (const ev of events) {
    const wait = ev.at * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    if (ev.shot !== undefined) {
      const file = join(outDir, `shot-${String(ev.shot).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      frames.push({ t: +((Date.now() - t0) / 1000).toFixed(2), file });
    } else if (ev.key) {
      await page.keyboard.down(ev.key); await sleep((ev.hold ?? 0.15) * 1000); await page.keyboard.up(ev.key); inputs++;
    } else if (ev.click) { await page.mouse.click(ev.click[0], ev.click[1]); inputs++; }
    else if (ev.type) { await page.keyboard.type(ev.type); inputs++; }
  }

  const canvas = await page.evaluate(() => {
    const all = [...document.querySelectorAll('canvas')].map((c) => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top, vw: innerWidth, vh: innerHeight }; });
    all.sort((a, b) => b.w * b.h - a.w * a.h);
    return all[0] || null;
  });
  const times = (await page.evaluate(() => window.__frameTimes || [])).slice(5);
  const probe = await page.evaluate(() => (typeof window.__gameProbe === 'function' ? window.__gameProbe() : null)).catch(() => null);
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.length ? times.reduce((s, x) => s + x, 0) / times.length : null;
  const perf = {
    fps: mean ? +(1000 / mean).toFixed(1) : null,
    p95FrameMs: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) : null,
    maxFrameMs: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : null,
    drawCalls: probe?.drawCalls ?? null, triangles: probe?.triangles ?? null,
  };

  // Contact sheet: all screenshots in one image, so one look shows the whole run.
  const imgs = frames.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f.file).toString('base64')}"><figcaption>t = ${f.t}s</figcaption></figure>`).join('');
  const sheet = await browser.newPage({ viewport: { width: 1320, height: 800 } });
  await sheet.setContent(`<style>body{margin:8px;background:#111;color:#ccc;font:12px sans-serif;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%;display:block}figure{margin:0}</style>${imgs}`);
  await sheet.screenshot({ path: join(outDir, 'contact.png'), fullPage: true });
  await browser.close();

  return { frames, console: consoleLog, failedRequests: failed, perf, canvas, inputsSent: inputs, viewport: { width, height } };
}

export function loadActions(file) { return file ? JSON.parse(readFileSync(file, 'utf8')) : []; }
export { writeFileSync };
