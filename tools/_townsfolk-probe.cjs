/* tools/_townsfolk-probe.cjs — world-townsfolk.js in game: every post spawns, animates (not T-pose), stands clear of buildings.
 *   node tools/_townsfolk-probe.cjs     (python -m http.server 3013 --directory public ; >= 1000 MB free RAM) => C:/Users/Brittany/eye/npc-<file>-<label>.png */
const puppeteer = require('puppeteer'), fs = require('fs'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 720, height: 540 }); const errs = [], logs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140))); p.on('console', m => { const t = m.text(); if (/agent body|agent-lib|rig clips|\[ual\] agent/.test(t)) logs.push(t.slice(0, 160)); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  console.log('stage: playable'); await sleep(12000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 80 && !(await p.evaluate(() => window.__spawnBusy === false && !!window.__entrances).catch(() => false)); i++) await sleep(3000);
  console.log('stage: spawned');
  await p.evaluate(() => { const D = window.__w3dDebug; if (!window.__camLock) { const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; } });
  const posts = await p.evaluate(() => (window.__townsfolk ? window.__townsfolk.posts : []).map(q => ({ file: q.file, label: q.label, x: q.x, z: q.z, yaw: q.yaw })));
  console.log('posts', posts.length);
  for (const q of posts) {
    await p.evaluate((q) => { const D = window.__w3dDebug; D.playerPos.x = q.x + Math.sin(q.yaw) * 30; D.playerPos.z = q.z + Math.cos(q.yaw) * 30; }, q);
    let r = null; for (let i = 0; i < 20; i++) { await sleep(2000); r = await p.evaluate((q) => { const g = window.__townsfolk.group.children.find(h => h.name === 'npc-' + q.file + '-' + q.label); if (!g) return null;
      const T = window.__w3dDebug.THREE, b = {}; g.traverse(n => { if (n.isBone) b[n.name] = n; }); g.updateMatrixWorld(true);
      const P = n => new T.Vector3().setFromMatrixPosition(b[n].matrixWorld); const dv = P('LeftForeArm').sub(P('LeftArm')).normalize();
      let lo = 1e9, hi = -1e9; Object.values(b).forEach(n => { const y = new T.Vector3().setFromMatrixPosition(n.matrixWorld).y; lo = Math.min(lo, y); hi = Math.max(hi, y); });
      const ground = window.__w3dDebug.terrainV4 ? window.__w3dDebug.terrainV4.heightAt(g.position.x, g.position.z) : null;
      return { heightM: +((hi - lo) / (7 / 1.8)).toFixed(2), armDrop: Math.round(Math.asin(Math.min(1, Math.abs(dv.y))) * 180 / Math.PI), footY: +(lo - g.position.y).toFixed(2), y: +g.position.y.toFixed(1), ground: ground == null ? null : +ground.toFixed(1), visible: g.visible }; }, q).catch(() => null); if (r) break; }
    console.log(q.file + '@' + q.label, JSON.stringify(r));
    if (!r) continue;
    await p.evaluate((q) => { const L = window.__camLock, D = window.__w3dDebug, y = D.playerPos.y || 0, g = window.__townsfolk.group.children.find(h => h.name === 'npc-' + q.file + '-' + q.label), c = g.position;
      Object.assign(L, { on: true, px: c.x + Math.sin(q.yaw) * 22, py: c.y + 9, pz: c.z + Math.cos(q.yaw) * 22, tx: c.x, ty: c.y + 4, tz: c.z }); }, q);
    await sleep(5000); await p.screenshot({ path: OUT + '/npc-' + q.file + '-' + q.label + '.png' });
  }
  console.log('STATS', JSON.stringify(await p.evaluate(() => window.__townsfolk && window.__townsfolk.stats())));
  console.log('LOGS ' + logs.slice(0, 10).join(' | ')); console.log('ERRS', JSON.stringify(errs.slice(0, 5)));
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
