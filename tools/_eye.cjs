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
  const p = await b.newPage(); await p.setViewport({ width: +(process.env.EYE_W||1000), height: +(process.env.EYE_H||600) }); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto((process.env.EYE_BASE || 'http://localhost:3013') + '/SHADDAI-WORLD-3D.html' + (process.env.EYE_QS || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (mode === 'intro') { await sleep(4500); await p.screenshot({ path: OUT + '/intro-1.png' }); await sleep(7500); await p.screenshot({ path: OUT + '/intro-2.png' }); console.log('shot intro'); console.log('ERRS', JSON.stringify(errs.slice(0, 3))); await b.close(); return; }   // loading screen: wordmark glitch + slideshow
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
  if (mode === 'eval') { console.log('EVAL', JSON.stringify(await p.evaluate(new Function('return (' + process.argv[3] + ')')))); }   // node tools/_eye.cjs eval "expression"
  else if (mode === 'avatar') {   // node tools/_eye.cjs avatar FORGE-VANGUARD FORGE-GHOST ...  : third-person shots of the chosen operative standing in the world
    const codes = process.argv.slice(3).length ? process.argv.slice(3) : ['FORGE-VANGUARD'], U = 7 / 1.8;
    for (const code of codes) {
      await p.evaluate(c => { window.setPlayerCharacter(c); }, code); await sleep(14000);
      const info = await p.evaluate(() => { const q = window.__w3dDebug.playerPos; return [q.x, q.y, q.z]; });
      for (const [tag, ox, oz] of [['front', 0, -5.5], ['side', 5.5, 0]]) {
        await p.evaluate((x, y, z, ox, oz, U) => { const L = window.__camLock; L.on = true; L.px = x + ox * U; L.py = y + 1.5 * U; L.pz = z + oz * U; L.tx = x; L.ty = y + 1.0 * U; L.tz = z; }, info[0], info[1], info[2], ox, oz, U);
        await sleep(4500); await p.screenshot({ path: OUT + '/avatar-' + code + '-' + tag + '.png' }); console.log('shot avatar', code, tag);
      }
    }
  } else if (mode === 'deck') {   // node tools/_eye.cjs deck : the Sky Nexus deck + Sky Dock (absolute camera heights; the world camera is locked, the player stays on the ground)
    const info = await p.evaluate(() => ({ sky: window.SHADDAI_SKY ? { y: window.SHADDAI_SKY.nexusY, r: window.SHADDAI_SKY.nexusR } : null, dock: window.__skyDock ? { v: window.__skyDock.vendor, pads: window.__skyDock.pads.map(q => [Math.round(q.x), Math.round(q.z)]) } : null }));
    console.log('DECK', JSON.stringify(info)); if (info.sky && info.dock) {
      const U = 7 / 1.8, y = info.sky.y, v = info.dock.v;
      const cam = async (name, px, py, pz, tx, ty, tz) => { await p.evaluate((px, py, pz, tx, ty, tz) => { const L = window.__camLock; L.on = true; L.px = px; L.py = py; L.pz = pz; L.tx = tx; L.ty = ty; L.tz = tz; }, px, py, pz, tx, ty, tz); await sleep(5500); await p.screenshot({ path: OUT + '/' + name + '.png' }); console.log('shot', name); };
      await cam('deck-overview', 0, y + 70 * U, 140 * U, 0, y, 0);
      await cam('deck-vendor', v.x * 0.45, y + 6 * U, v.z * 0.45, v.x, y + 3 * U, v.z);
      await cam('deck-pad', info.dock.pads[0][0] * 0.55, y + 5 * U, info.dock.pads[0][1] * 0.55, info.dock.pads[0][0], y, info.dock.pads[0][1]);
    }
  } else if (mode === 'env') {   // node tools/_eye.cjs env      (use EYE_QS="?time=0.02" for midnight, 0.5 noon, 0.8 sunset)
    const info = await p.evaluate(async () => {
      const D = window.__w3dDebug, half = (D.terrainV4.meta || {}).half_units, allow = await window.WorldGrass.loadGreenMask('/assets/terrain/color.jpg', half, 256), U = 7 / 1.8; let best = null;
      for (let x = -half; x < half; x += 160) for (let z = -half; z < half; z += 160) { if (!allow(x, z)) continue; const r = Math.hypot(x, z); if (r < 1800 * U) continue; let ok = 0; for (let k = 0; k < 8; k++) if (allow(x + Math.cos(k) * 120, z + Math.sin(k) * 120)) ok++; if (ok >= 7 && (!best || r < best.r)) best = { x, z, r }; }
      return { half, best, coverage: allow.coverage, night: window.__skyExtras && window.__skyExtras.stats().night, grassReady: !!window.__grass };
    });
    console.log('ENV', JSON.stringify(info)); if (!info.best) { console.log('no green spot'); } else {
      const U = 7 / 1.8, x = info.best.x, z = info.best.z;
      await p.evaluate((x, z) => { window.__w3dDebug.playerPos.x = x; window.__w3dDebug.playerPos.z = z; }, x, z); await sleep(9000);
      console.log('GRASS', JSON.stringify(await p.evaluate(() => window.__grass ? window.__grass.stats() : null)), 'SKY', JSON.stringify(await p.evaluate(() => window.__skyExtras ? window.__skyExtras.stats() : null)));
      await shot('env-horizon', x, z, x + 60 * U, 0, z - 80 * U, 1.7 * U, 14 * U);
      await shot('env-sky', x, z, x + 40 * U, 0, z - 60 * U, 1.7 * U, 70 * U);
      await shot('env-grass', x, z, x + 6 * U, 0, z - 4 * U, 1.5 * U, 0.2 * U);
    }
  } else if (mode === 'probe') { console.log(JSON.stringify(await p.evaluate(() => { const S = window.SHADDAI_SKY || null, E = window.__shaddaiElevators || null, D = window.__w3dDebug, H = D.terrainV4 || D.terrain; return { sky: S && { nexusY: S.nexusY, nexusR: S.nexusR, temple: S.templeX != null ? [S.templeX, S.templeZ] : null, keys: Object.keys(S).slice(0, 30) }, elevators: !!E, platforms: E && E.platforms ? E.platforms.length : 0, ents: (window.__entrances || []).map(e => [e.code, Math.round(e.x), Math.round(e.z)]), groundAtOrigin: H.heightAt(0, 0), bTop: window.__measuredFootprints ? Object.keys(window.__measuredFootprints).length : 0 }; }))); }
  else if (mode === 'list') { console.log(JSON.stringify(await p.evaluate(() => window.__entrances))); }
  else if (mode === 'entrances') {
    const only = process.argv.slice(3), ents = (await p.evaluate(() => window.__entrances || [])).filter(e => !only.length || only.includes(e.code));
    for (const e of ents) {
      await shot('ent-' + e.code + '-a', e.x + e.nx * 45, e.z + e.nz * 45, e.x, 0, e.z, 9, 12);
      await shot('ent-' + e.code + '-b', e.x + e.nx * 20 + e.nz * 8, e.z + e.nz * 20 - e.nx * 8, e.x, 0, e.z, 3.5, 6);
    }
  } else if (mode === 'colo') {   // node tools/_eye.cjs colo [field...]  -> eye-level views from the arena floor (default fields: sand lava water)
    const fields = process.argv.slice(3).length ? process.argv.slice(3) : ['sand', 'lava', 'water'], U = 7 / 1.8;
    console.log(await p.evaluate(() => window.__travel.colospot('arena'))); await sleep(14000);
    for (const f of fields) {
      console.log(await p.evaluate(f => window.__travel.field(f), f)); await sleep(5000);
      for (const [tag, dx, dz, up] of [['n', 0, -1, 1.7], ['e', 1, 0, 1.7], ['down', 0.001, -0.001, 40]]) {
        await p.evaluate((dx, dz, up, U) => { const D = window.__w3dDebug, L = window.__camLock, pp = D.playerPos; L.on = true; L.px = pp.x; L.py = pp.y + up * U; L.pz = pp.z; L.tx = pp.x + dx * 30 * U; L.ty = up > 5 ? pp.y : pp.y + 4 * U; L.tz = pp.z + dz * 30 * U; }, dx, dz, up, U);
        await sleep(3500); await p.screenshot({ path: OUT + '/colo-' + f + '-' + tag + '.png' }); console.log('shot colo', f, tag);
      }
    }
    console.log('POS', JSON.stringify(await p.evaluate(() => { const q = window.__w3dDebug.playerPos; return [q.x | 0, q.y | 0, q.z | 0]; })));
  } else if (mode === 'ride') {   // node tools/_eye.cjs ride kart-sedan kart-pod car-van board : third-person side + 3/4 shots of the rider ON each ride ('board' = the hoverboard)
    const U = 7 / 1.8; for (const id of process.argv.slice(3)) {
      await p.evaluate((id, U) => { const D = window.__w3dDebug; D.playerPos.x = 0; D.playerPos.z = -800 * U; const x = D.playerPos.x, z = D.playerPos.z;   /* quiet north avenue, away from the spawn-plaza crowd */ if (window.__mountRide && window.__mountRide.isRiding()) window.__mountRide.dismount(); if (id === 'board') window.__rideBoard('obsidian'); else window.__mountRide.rentRace(id, x, z, 0); }, id, U);
      await sleep(4000);
      for (const [nm, ox, oz, oy] of [['side', 5.5, 0, 1.4], ['q34', 4, -4.5, 2.2]]) {
        await p.evaluate((ox, oz, oy, U) => { const D = window.__w3dDebug, L = window.__camLock, P = D.playerPos, H = D.terrainV4 || D.terrain, gy = H.heightAt(P.x, P.z); L.on = true; L.px = P.x + ox * U; L.py = gy + oy * U + 1.5 * U; L.pz = P.z + oz * U; L.tx = P.x; L.ty = P.y + 0.3 * U; L.tz = P.z; }, ox, oz, oy, U);
        await sleep(2500); await p.screenshot({ path: OUT + '/ride-' + id + '-' + nm + '.png' }); console.log('shot', id, nm);
      }
    }
  } else if (mode === 'districts') {   // node tools/_eye.cjs districts : one street-level view in each Grid district (Campus NE, Commons SE, Plots SW, Race NW) for the QA gate
    const U = 7 / 1.8; for (const [nm, x, z, yaw] of [['campus', 380, -380, 45], ['commons', 380, 380, 135], ['plots', -380, 380, 225], ['race', -380, -380, 315]]) await shot('district-' + nm, x * U + Math.sin(yaw * Math.PI / 180) * 70 * U, z * U + Math.cos(yaw * Math.PI / 180) * 70 * U, x * U, 0, z * U, 14 * U, 22 * U);
  } else if (mode === 'at') {
    const [name, x, z, dist = 40, h = 8, yaw = 0] = process.argv.slice(3); const U = 7 / 1.8, a = (+yaw) * Math.PI / 180;
    await shot(name, +x * U + Math.sin(a) * +dist * U, +z * U + Math.cos(a) * +dist * U, +x * U, 0, +z * U, +h * U, 4 * U);
  }
  console.log('ERRS', JSON.stringify(errs.slice(0, 3))); await b.close();
})();
