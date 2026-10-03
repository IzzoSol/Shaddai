// tools/perf/measure-load.cjs — headless load-time probe for SHADDAI-WORLD-3D.html?map=v4 (docs/PERF-LOAD.md)
//
//   node tools/perf/measure-load.cjs [baseUrl] [--query "map=v4"] [--timeout 420] [--gl angle|swiftshader] [--json out.json]
//
// Never opens a visible window. Refuses to start when free RAM < 1.5 GB (owner laptop: HD 620 / 8 GB).
// Injects a long-task observer before any page script runs, then polls the page's own milestones:
//   module start, first rAF, __worldBuilt, ENTER shown (loading gate), playable (intro gone + first world frames),
// clicks ENTER when it appears and keeps sampling long tasks until the page settles.
// Also collects window.__loadTimings (per __mapV4Ready step, added by the host's perf instrumentation) when present.
const os = require('os');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const base = (args[0] && !args[0].startsWith('--')) ? args[0] : 'http://127.0.0.1:3013';
const query = opt('--query', 'map=v4');
const timeoutS = +opt('--timeout', 420);
const gl = opt('--gl', 'angle');
const jsonOut = opt('--json', null);
const pageName = opt('--page', 'SHADDAI-WORLD-3D.html');

function findPuppeteer() {
  const cands = [path.join(__dirname, '../ual/node_modules/puppeteer'), 'C:/Users/Brittany/Shaddai/node_modules/puppeteer', 'puppeteer'];
  for (const c of cands) { try { return require(c); } catch (_) {} }
  throw new Error('puppeteer not found');
}

(async () => {
  const freeMB = os.freemem() / 1048576;
  if (freeMB < 1536 && !args.includes('--force')) { console.error('[measure] free RAM ' + Math.round(freeMB) + ' MB < 1536 MB — not starting (retry later)'); process.exit(3); }
  const puppeteer = findPuppeteer();
  const glFlags = gl === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];
  const exe = opt('--exe', require('path').join(os.homedir(), '.cache/puppeteer/chrome-headless-shell/win64-150.0.7871.24/chrome-headless-shell-win64/chrome-headless-shell.exe'));
  const browser = await puppeteer.launch({ headless: 'shell', executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--no-sandbox', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...glFlags], defaultViewport: { width: 1280, height: 720 } });
  const out = { url: null, gl, milestones: {}, longTasks: [], loadTimings: null, console: [], gpu: null };
  try {
    const page = await browser.newPage();
    page.on('console', m => { const t = m.text(); if (/^\[load\]|\[map-v4\]|\[clusters|\[canon|failed|error/i.test(t)) out.console.push(t.slice(0, 300)); });
    page.on('pageerror', e => out.console.push('PAGEERROR ' + (e && e.message)));
    await page.evaluateOnNewDocument(() => {
      window.__probe = { lt: [], t: {} };
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__probe.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
      let n = 0; const f = () => { n++; if (n === 1) window.__probe.t.firstRaf = performance.now(); if (n < 3) requestAnimationFrame(f); }; requestAnimationFrame(f);
    });
    const url = base.replace(/\/$/, '') + '/' + pageName + '?' + query;
    out.url = url;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    out.gpu = await page.evaluate(() => { try { const c = document.createElement('canvas'), g = c.getContext('webgl2'), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch (e) { return 'err ' + e.message; } });
    let clicked = false, settledAt = 0;
    while ((Date.now() - t0) / 1000 < timeoutS) {
      await new Promise(r => setTimeout(r, 500));
      const s = await page.evaluate(() => {
        const P = window.__probe, now = performance.now(), m = P.t;
        if (window.__worldBuilt && !m.worldBuilt) m.worldBuilt = now;
        if (window.__LD && window.__LD.done && !m.chainDone) m.chainDone = now;
        const b = document.getElementById('enterBtn');
        if (!m.enterShown && ((b && b.classList.contains('show')) || window.__loadPlayable)) m.enterShown = now;
        const intro = document.getElementById('intro'), lsc = document.getElementById('loadScreen');
        const gone = (!intro || intro.style.display === 'none' || intro.classList.contains('gone')) && (!lsc || lsc.style.display === 'none' || lsc.classList.contains('gone'));
        if (gone && !m.introGone) m.introGone = now;
        return { m, now, lastLT: P.lt.length ? P.lt[P.lt.length - 1] : null, q: window.__loadQueueStats ? window.__loadQueueStats() : null };
      });
      if (s.m.enterShown && !clicked) { clicked = true; await page.evaluate(() => { const b = document.getElementById('enterBtn'); if (b && b.offsetParent !== null) b.click(); }); }
      // settle: chain done (or world built) + queue idle + no long task in the last 8 s
      const idle = s.q ? (s.q.queued + s.q.active) === 0 : true;
      const quiet = !s.lastLT || (s.now - (s.lastLT[0] + s.lastLT[1])) > 8000;
      if (s.m.introGone && (s.m.chainDone || s.m.worldBuilt) && idle && quiet) { if (!settledAt) settledAt = Date.now(); if (Date.now() - settledAt > 1500) break; } else settledAt = 0;
    }
    const fin = await page.evaluate(() => ({ t: window.__probe.t, lt: window.__probe.lt, lt2: window.__loadTimings || null, q: window.__loadQueueStats ? window.__loadQueueStats() : null, nav: performance.getEntriesByType('navigation')[0] ? Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) : null, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }));
    out.milestones = Object.fromEntries(Object.entries(fin.t).map(([k, v]) => [k, Math.round(v)]));
    out.milestones.domContentLoaded = fin.nav;
    out.longTasks = fin.lt; out.loadTimings = fin.lt2; out.queue = fin.q; out.heapMB = fin.mem;
    out.wallS = Math.round((Date.now() - t0) / 100) / 10;
  } finally { await browser.close(); }
  const lt = out.longTasks, after = x => lt.filter(e => e[0] >= (x || 0));
  const fr = out.milestones.firstRaf || 0;
  const sum = a => a.reduce((s, e) => s + e[1], 0);
  const max = a => a.reduce((s, e) => Math.max(s, e[1]), 0);
  console.log('\n[measure] ' + out.url + '  gpu=' + out.gpu + '  gl=' + gl + '  wall=' + out.wallS + ' s  heap=' + out.heapMB + ' MB');
  console.log('[measure] milestones (ms from navigation):', JSON.stringify(out.milestones));
  console.log('[measure] long tasks: n=' + lt.length + ' total=' + sum(lt) + ' ms  max=' + max(lt) + ' ms  | after first frame: max=' + max(after(fr)) + ' ms  n>200ms=' + after(fr).filter(e => e[1] > 200).length);
  console.log('[measure] top 12 long tasks [start, dur]:', JSON.stringify(lt.slice().sort((a, b) => b[1] - a[1]).slice(0, 12)));
  if (out.loadTimings) { console.log('[measure] step table:'); console.table(out.loadTimings); }
  if (out.console.length) console.log('[measure] console:\n  ' + out.console.slice(0, 60).join('\n  '));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
})().catch(e => { console.error('[measure] failed:', e && e.stack || e); process.exit(1); });
