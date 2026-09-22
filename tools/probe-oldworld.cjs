// node tools/probe-oldworld.cjs 8790 -> inventory what SHADDAI-WORLD-3D builds (scene graph summary + DOM)
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 620 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 180)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/404|WebSocket|favicon|Failed to load resource/i.test(t)) errs.push(t.slice(0, 150)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 120; i++) { await sleep(2500); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  const r = await p.evaluate(() => {
    const out = { worldBuilt: window.__worldBuilt, assetsReady: window.__assetsReady };
    let scene = null;
    // find the three scene by walking the canvas WebGL context is hard; try exposed globs
    try { if (typeof window.__scene !== 'undefined') scene = window.__scene; } catch (e) {}
    // DOM inventory
    out.canvases = [...document.querySelectorAll('canvas')].map((c) => ({ id: c.id, w: c.width, h: c.height }));
    out.scripts = document.scripts.length;
    out.$ = { loadmsg: document.getElementById('loadmsg')?.textContent, title: document.title };
    out.panelIds = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((i) => i.length < 40).slice(0, 120);
    return out;
  });
  // second pass: wait a bit more and try to grab the scene via injected hook absent => use globalThis scan
  const sceneInfo = await p.evaluate(() => {
    // helper scripts create window-level constructors? We'll scan for a known var: many set window names.
    const names = Object.getOwnPropertyNames(window).sort();
    const hits = names.filter((n) => /world|scene|portal|agent|build|terrain|hero/i.test(n) && !/^(window|top|length|name|inner|outer|scroll|pageX|pageY)$/i.test(n)).slice(0, 80);
    return hits;
  });
  console.log(JSON.stringify(r));
  console.log('windowHits:', JSON.stringify(sceneInfo));
  console.log('ERR:', errs.slice(0, 8).join('\n') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });