/* tools/_perf-drill.cjs — second-level perf + error drill (2026-10-23): (1) skinned meshes whose skeleton has a missing bone (the
 * red "matrixWorld of undefined" banner), with their ancestor names; (2) shadow cost: draw calls with shadow maps on vs skipped for
 * one frame, casting lights, caster count; (3) the anonymous top-level Mesh/Group draws, grouped by material + geometry + parent name.
 * Read-only. node tools/_perf-drill.cjs  (server on 3013; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(30000);
  const r = await p.evaluate(() => new Promise(res => {
    const D = window.__w3dDebug, S = D.scene, R = D.renderer, out = { badSkin: [], shadow: {}, anon: {} };
    const path = o => { const a = []; for (let x = o; x && x !== S; x = x.parent) a.push(x.name || x.type); return a.reverse().join(' > ').slice(0, 160); };
    let casters = 0;
    S.traverse(o => {
      if (o.isSkinnedMesh) { const bones = o.skeleton && o.skeleton.bones || []; const miss = bones.filter(x => !x).length; if (miss || !o.skeleton) out.badSkin.push({ path: path(o), bones: bones.length, missing: miss, visible: o.visible }); }
      if (o.isMesh && o.castShadow) casters++;
    });
    const lights = []; S.traverse(o => { if (o.isLight && o.castShadow) lights.push((o.type) + ':' + (o.name || '') + ' map ' + (o.shadow && o.shadow.mapSize ? o.shadow.mapSize.x : '?')); });
    out.shadow = { enabled: R.shadowMap.enabled, type: R.shadowMap.type, autoUpdate: R.shadowMap.autoUpdate, casters, lights };
    S.traverse(o => {
      if (!(o.isMesh) || !o.visible) return; let top = o; while (top.parent && top.parent !== S) top = top.parent;
      if (top.name) return;
      const k = (o.material && (o.material.name || o.material.type)) + ' | ' + (o.geometry && (o.geometry.name || o.geometry.type)) + ' | ' + (o.parent && o.parent !== S ? (o.parent.name || o.parent.type) : '-') + (o.isInstancedMesh ? ' [inst]' : '');
      out.anon[k] = (out.anon[k] || 0) + 1;
    });
    out.anon = Object.entries(out.anon).sort((a, c) => c[1] - a[1]).slice(0, 25);
    const measure = (skipShadow, cb) => { const au = R.shadowMap.autoUpdate, en = R.shadowMap.enabled; if (skipShadow) { R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = false; }
      requestAnimationFrame(() => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => { const c = R.info.render.calls, t = R.info.render.triangles; R.info.autoReset = true; R.shadowMap.autoUpdate = au; R.shadowMap.enabled = en; cb({ calls: c, tris: t }); }); }); };
    measure(false, a => measure(true, c => { out.shadow.withShadows = a; out.shadow.shadowsFrozen = c; res(out); }));
  }));
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
  await b.close();
})().catch(e => { console.error('drill failed', e.message); process.exit(1); });
