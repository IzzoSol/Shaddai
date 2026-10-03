/* tools/_draw-profile.cjs — WHO is spending the draw calls?  node tools/_draw-profile.cjs [query]   (static server on :3013)
 * After the world is playable, walks the scene and groups every drawn object (visible, in the camera frustum or never-culled) by its top-level owner + type,
 * printing draw calls and triangles per group, biggest first, plus the never-culled and the unbatched-clone offenders. Use it to decide what to merge/instance/LOD. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 700, height: 420 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + (process.argv[2] || '?time=0.5'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  for (let i = 0; i < 90 && !(await p.evaluate(() => !!window.__batchReport).catch(() => false)); i++) await sleep(1000);   // wait for the static batcher (skip with ?batch=0)
  const rep = await p.evaluate(() => window.__batchReport || null); console.log('batch report', JSON.stringify(rep)); await sleep(2000);
  const out = await p.evaluate(() => {
    const D = window.__w3dDebug, scene = D.scene, cam = D.camera, THREE_ = cam.constructor; const fr = {}; let tot = { calls: 0, tris: 0 };
    const vis = o => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
    const owner = o => { let a = o; while (a.parent && a.parent !== scene) a = a.parent; if (a.name) return a.name; let first = a; while (first.children && first.children.length && !first.isMesh) first = first.children[0]; const kids = (function c(x) { let n = 0; x.traverse(() => n++); return n; })(a); return a.type + '#' + scene.children.indexOf(a) + ' nodes=' + kids + ' first=' + (first.name || first.type) + ' at=' + Math.round(a.position.x) + ',' + Math.round(a.position.z); };
    const tri = o => { const g = o.geometry; if (!g) return 0; const n = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0); return n * (o.isInstancedMesh ? o.count : 1); };
    const groups = {}, culled = { never: 0, neverTris: 0 }; const unb = {};
    scene.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !vis(o)) return; if (o.isInstancedMesh && o.count === 0) return; if (o.material && o.material.visible === false) return;
      const key = owner(o) + ' [' + (o.isInstancedMesh ? 'instanced' : o.isSkinnedMesh ? 'skinned' : o.isPoints ? 'points' : o.isLine ? 'line' : o.isSprite ? 'sprite' : 'mesh') + ']';
      const g = groups[key] = groups[key] || { calls: 0, tris: 0, neverCulled: 0 }; const mats = Array.isArray(o.material) ? o.material.length : 1; g.calls += mats; g.tris += tri(o); if (o.frustumCulled === false) g.neverCulled += mats; tot.calls += mats; tot.tris += tri(o);
      if (!o.isInstancedMesh && o.geometry) { const k = o.geometry.uuid; unb[k] = (unb[k] || 0) + 1; } });
    const dup = Object.values(unb).filter(n => n > 8).sort((a, b) => b - a).slice(0, 8);
    const rows = Object.keys(groups).map(k => [k, groups[k].calls, Math.round(groups[k].tris), groups[k].neverCulled]).sort((a, b) => b[1] - a[1]).slice(0, 30);
    return { scene_children: scene.children.length, drawn_candidates: tot, renderer_info: { calls: D.renderer.info.render.calls, triangles: D.renderer.info.render.triangles }, rows, shared_geometry_meshes_over_8: dup, quality: window.__quality };
  });
  console.log('renderer.info calls', out.renderer_info.calls, 'tris', out.renderer_info.triangles, '| candidate meshes', out.drawn_candidates.calls, '| quality', out.quality);
  console.log('shared-geometry clone counts (>8 separate meshes using one geometry = batch/instance candidates):', JSON.stringify(out.shared_geometry_meshes_over_8));
  console.log('calls  tris  neverCulled  group'); out.rows.forEach(r => console.log(String(r[1]).padStart(5), String(r[2]).padStart(8), String(r[3]).padStart(5), ' ', r[0]));
  await b.close();
})().catch(e => { console.log('crash', e.message.slice(0, 200)); process.exit(2); });
