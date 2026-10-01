/* tools/_eye.cjs — "eyes" for the 3D world: boots the game headless, passes the sky-dive, locks the camera and takes PNGs you can read.
 * Needs: python -m http.server 3013 --directory public   (run from the repo root)
 * Usage:
 *   node tools/_eye.cjs entrances                 -> 2 shots per building entrance (front 45 m, close 20 m)  => C:/Users/Brittany/eye/ent-<CODE>-<a|b>.png
 *   node tools/_eye.cjs at <name> <x> <z> [dist] [h] [yawDeg]   -> one shot looking at world (x,z) (metres from Blender space: x east, z = -north)
 *   node tools/_eye.cjs list                      -> prints entrances + player pos and exits
 * Notes: positions are WORLD UNITS for entrances (e.x/e.z from window.__entrances); 'at' takes METRES and converts. One browser at a time (RAM).
 */
const puppeteer = require('puppeteer'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const mode = process.argv[2] || 'entrances';
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 600 }); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(12000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 80 && !(await p.evaluate(() => window.__spawnBusy === false && !!window.__entrances).catch(() => false)); i++) await sleep(3000);
  await sleep(8000);
  await p.evaluate(() => { const D = window.__w3dDebug; if (!window.__camLock) { const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; } });
  async function shot(name, px, pz, tx, ty0, tz, up, ty) {
    await p.evaluate((px, pz, tx, tz, up, ty) => { const D = window.__w3dDebug, H = D.terrainV4 || D.terrain, L = window.__camLock; D.playerPos.x = px; D.playerPos.z = pz; const gy = H.heightAt(px, pz), ty0 = H.heightAt(tx, tz); L.on = true; L.px = px; L.py = gy + up; L.pz = pz; L.tx = tx; L.ty = ty0 + ty; L.tz = tz; }, px, pz, tx, tz, up, ty);
    await sleep(6500); await p.screenshot({ path: OUT + '/' + name + '.png' }); console.log('shot', name);
  }
  if (mode === 'list') { console.log(JSON.stringify(await p.evaluate(() => window.__entrances))); }
  else if (mode === 'entrances') {
    const only = process.argv.slice(3), ents = (await p.evaluate(() => window.__entrances || [])).filter(e => !only.length || only.includes(e.code));
    for (const e of ents) {
      await shot('ent-' + e.code + '-a', e.x + e.nx * 45, e.z + e.nz * 45, e.x, 0, e.z, 9, 12);
      await shot('ent-' + e.code + '-b', e.x + e.nx * 20 + e.nz * 8, e.z + e.nz * 20 - e.nx * 8, e.x, 0, e.z, 3.5, 6);
    }
  } else if (mode === 'at') {
    const [name, x, z, dist = 40, h = 8, yaw = 0] = process.argv.slice(3); const U = 7 / 1.8, a = (+yaw) * Math.PI / 180;
    await shot(name, +x * U + Math.sin(a) * +dist * U, +z * U + Math.cos(a) * +dist * U, +x * U, 0, +z * U, +h * U, 4 * U);
  }
  console.log('ERRS', JSON.stringify(errs.slice(0, 3))); await b.close();
})();
