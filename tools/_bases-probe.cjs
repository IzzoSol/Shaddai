/* tools/_bases-probe.cjs — street-level shots at the base of each council building + the Athenaeum (2026-10-23, owner: "de clutter the
 * bottoms of the buildings ... make sure the ground is level"). For each sector in WORLD_LAYOUT: stand 70 m out, look at the base
 * => C:/Users/Brittany/eye/base-<code>.png, and count meshes whose bounds touch the ground ring r 20..70 m (the clutter). Read-only. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 540 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; });
  const secs = await p.evaluate(() => { const L = window.WORLD_LAYOUT, U = 7 / 1.8, out = (L.sectors || []).filter(s => s.code && s.pos).map(s => ({ code: s.code, x: s.pos[0], z: s.pos[1] }));
    const A = window.__acadExterior; const g = A && (A.group || A.root || A); if (g && g.position) out.push({ code: 'ATHENAEUM', x: g.position.x, z: g.position.z }); return out; });
  for (const s of secs) {
    const info = await p.evaluate((s) => { const D = window.__w3dDebug, U = 7 / 1.8, H = (x, z) => (window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x, z) : 0);
      const d = Math.hypot(s.x, s.z) || 1, ux = -s.x / d, uz = -s.z / d, px = s.x + ux * 70 * U, pz = s.z + uz * 70 * U, gy = H(px, pz);
      D.playerPos.set(px, gy, pz); Object.assign(window.__camLock, { on: true, px: px, py: gy + 6 * U, pz: pz, tx: s.x, ty: H(s.x, s.z) + 8 * U, tz: s.z });
      const hs = []; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; hs.push(H(s.x + Math.cos(a) * 30 * U, s.z + Math.sin(a) * 30 * U)); }
      return { groundSpreadM: Math.round((Math.max(...hs) - Math.min(...hs)) / U * 10) / 10 }; }, s);
    await sleep(6000); await p.screenshot({ path: 'C:/Users/Brittany/eye/base-' + s.code + '.png' }); console.log('BASE', s.code, JSON.stringify(info));
  }
  await b.close();
})().catch(e => { console.error('bases probe failed', e.message); process.exit(1); });
