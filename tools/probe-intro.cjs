// node tools/probe-intro.cjs 8790 [home|world] -> intro/loader state + console errors
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const which = process.argv[3] || 'home';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 640 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|Failed to load resource/i.test(t)) errs.push(t.slice(0, 150)); });
  const url = which === 'world' ? 'SHADDAI-WORLD-3D.html' : 'home.html';
  await p.goto(`http://localhost:${port}/${url}`, { waitUntil: 'domcontentloaded' });
  await sleep(7000);
  const r = await p.evaluate(() => {
    const out = { title: document.title };
    const els = ['intro', 'introInner', 'iBootLines', 'enterBtn', 'loadBar', 'loadPct', 'portalCv', 'descentBg', 'descentFallback', 'descentPlayer', 'hero', 'cornerAscend'];
    out.els = {};
    for (const id of els) {
      const e = document.getElementById(id);
      if (!e) { out.els[id] = 'MISSING'; continue; }
      const cs = getComputedStyle(e);
      out.els[id] = { display: cs.display, opacity: cs.opacity, vis: cs.visibility, bg: cs.backgroundColor, z: cs.zIndex, w: e.offsetWidth, h: e.offsetHeight };
    }
    const intro = document.getElementById('intro');
    if (intro) { out.introClasses = intro.className; out.introGone = intro.classList.contains('gone'); }
    const po = document.getElementById('portalCv');
    if (po) { const c = po.getContext('2d'); out.portalHasPixels = c ? !!(c.getImageData(0, 0, Math.min(po.width, 2), Math.min(po.height, 2)).data.some((v) => v > 8)) : null; out.portalSize = [po.width, po.height]; }
    const bg = document.getElementById('descentBg');
    if (bg) { out.descentSrc = bg.getAttribute('src'); out.descentLit = bg.classList.contains('lit'); }
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    out.iframes = [...document.querySelectorAll('iframe')].map((f) => ({ src: f.getAttribute('src') || '', w: f.offsetWidth, h: f.offsetHeight }));
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERR:', errs.slice(0, 10).join('\n') || 'none');
  await p.screenshot({ path: `fal-assets/spike/intro-${which}.png` });
  await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });