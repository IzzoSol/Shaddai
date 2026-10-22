/* tools/_council-probe.cjs — are the 7 council agents right IN GAME? (2026-10-22, after the baked-clip fix)
 *   node tools/_council-probe.cjs            needs: python -m http.server 3013 --directory public ; refuses below 1000 MB free RAM
 * Boots the world headless (same sequence as tools/_eye.cjs), waits for the bodies, then per agent reports: baked set or not,
 * clip count, height in metres (bone union, world units / PM), arm drop from horizontal (T-pose ~0 deg, idle >> 20 deg),
 * forearm/upper-arm length ratio vs bind (stretch check, must stay 1.00), and takes a close shot of each => C:/Users/Brittany/eye/council-<CODE>.png */
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
  const CODES = ['SHADDAI', 'ZEROX', 'NEXUS', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
  const find = () => p.evaluate((codes) => { const D = window.__w3dDebug, out = {}; D.scene.traverse(o => { const a = o.userData && o.userData.agent; if (a && o.userData.__hasMixer) { const c = String(a.codename || '').toUpperCase(); if (codes.includes(c)) out[c] = 1; } }); return Object.keys(out); }, CODES).catch(() => []);
  for (let i = 0; i < 60 && (await find()).length < 7; i++) await sleep(3000);
  console.log('stage: bodies ' + JSON.stringify(await find())); await sleep(6000);
  let rep = null; for (let k = 0; k < 5 && !rep; k++) rep = await p.evaluate((codes) => {
    const D = window.__w3dDebug, T = D.THREE, PM = 7 / 1.8, res = [];
    D.scene.traverse(o => {
      const a = o.userData && o.userData.agent; if (!a || !o.userData.__hasMixer) return; const code = String(a.codename || '').toUpperCase(); if (!codes.includes(code)) return;
      const bone = {}; o.traverse(n => { if (n.isBone) bone[n.name] = n; }); o.updateMatrixWorld(true);
      const P = n => new T.Vector3().setFromMatrixPosition(bone[n].matrixWorld);
      let lo = Infinity, hi = -Infinity; Object.values(bone).forEach(n => { const y = new T.Vector3().setFromMatrixPosition(n.matrixWorld).y; lo = Math.min(lo, y); hi = Math.max(hi, y); });
      const drop = s => { const d = P(s + 'ForeArm').sub(P(s + 'Arm')).normalize(); return Math.asin(Math.min(1, Math.abs(d.y))) * 180 / Math.PI; };
      const len = (x, y) => P(x).distanceTo(P(y));
      let sk = null; o.traverse(n => { if (n.isSkinnedMesh) sk = n; });
      const ratio = s => { const bi = sk.skeleton.boneInverses, bs = sk.skeleton.bones, ix = k => bs.findIndex(q => q.name === k); const bp = k => new T.Vector3().setFromMatrixPosition(bi[ix(k)].clone().invert());
        const bind = bp(s + 'ForeArm').distanceTo(bp(s + 'Hand')) / bp(s + 'Arm').distanceTo(bp(s + 'ForeArm')); return (len(s + 'ForeArm', s + 'Hand') / len(s + 'Arm', s + 'ForeArm')) / bind; };
      res.push({ code, x: Math.round(o.position.x), z: Math.round(o.position.z), heightM: +((hi - lo) / PM).toFixed(2), armDropL: +drop('Left').toFixed(0), armDropR: +drop('Right').toFixed(0), stretchL: +ratio('Left').toFixed(3), stretchR: +ratio('Right').toFixed(3), visible: o.visible });
    });
    return res;
  }, CODES).catch(async () => { await sleep(5000); return null; });
  rep = rep || [];
  console.log(JSON.stringify(rep, null, 0).replace(/},{/g, '},\n{'));
  await p.evaluate(() => { const D = window.__w3dDebug; if (!window.__camLock) { const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; } });
  for (const r of rep) {
    await p.evaluate((code) => { const D = window.__w3dDebug, L = window.__camLock; let body = null; D.scene.traverse(o => { const a = o.userData && o.userData.agent; if (a && o.userData.__hasMixer && String(a.codename || '').toUpperCase() === code) body = o; });
      const bx = new D.THREE.Box3().setFromObject(body), c = bx.getCenter(new D.THREE.Vector3()), h = bx.max.y - bx.min.y, f = Math.atan2(-c.x, -c.z);   // bodies face the center
      D.playerPos.x = c.x + Math.sin(f) * h * 1.6; D.playerPos.z = c.z + Math.cos(f) * h * 1.6;
      Object.assign(L, { on: true, px: c.x + Math.sin(f) * h * 1.3, py: c.y + h * 0.15, pz: c.z + Math.cos(f) * h * 1.3, tx: c.x, ty: c.y, tz: c.z }); }, r.code);
    await sleep(4500); await p.screenshot({ path: OUT + '/council-' + r.code + '.png' });
  }
  console.log('LOGS\n' + logs.slice(0, 20).join('\n')); console.log('ERRS', JSON.stringify(errs.slice(0, 5)));
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
