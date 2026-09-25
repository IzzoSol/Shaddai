// node tools/probe-agents.cjs 8790 -> 7 agent bodies load rigged, UAL moves attach (world agents + picked operative), 0 errors
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 600 });
  const errs = [], rig = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (/🕺|\[ual\]|\[agent body\]|main character|now playing as/.test(t)) rig.push(t.slice(0, 150)); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 140)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  await sleep(25000);
  await p.evaluate(() => { if (window.setPlayerCharacter) window.setPlayerCharacter('ORACLE'); });
  await sleep(12000);
  const r = await p.evaluate(() => { const u = window.__playerUAL; return { playerUAL: u ? { ok: u.ok, clips: Object.keys(u).length && u.names ? u.names.length : 0 } : null }; });
  console.log(rig.join('\n')); console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 8).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
