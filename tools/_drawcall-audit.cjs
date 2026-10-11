/* tools/_drawcall-audit.cjs — who owns the draw calls? Boots the world headless, then walks the scene graph and groups every VISIBLE, frustum-agnostic
 * mesh by its top-level ancestor (and name), counting draw submissions (InstancedMesh = 1), triangles, materials and textures.
 *   node tools/_drawcall-audit.cjs "?time=0.5"      (static server :3013; needs >= 1 GB free RAM; one run at a time) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + (process.argv[2] || '?time=0.5'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log('never playable'); await b.close(); process.exit(1); }
  await sleep(process.env.WAIT_MS ? +process.env.WAIT_MS : 4000);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  const r = await p.evaluate(() => {
    const S = window.__w3dDebug.scene, groups = {}; let total = 0;
    function vis(o) { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; }
    S.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine) || !vis(o)) return;
      let top = o; while (top.parent && top.parent !== S) top = top.parent; const key = (top.name || top.type || 'unnamed') + (top === o ? '' : '');
      const g = groups[key] || (groups[key] = { draws: 0, tris: 0, mats: new Set(), tex: new Set(), meshes: 0, inst: 0, matrixAuto: 0 });
      const mats = Array.isArray(o.material) ? o.material : [o.material]; const geo = o.geometry; const idx = geo && geo.index ? geo.index.count : (geo && geo.attributes.position ? geo.attributes.position.count : 0);
      const parts = Array.isArray(o.material) && geo && geo.groups.length ? geo.groups.length : 1;
      g.draws += parts; g.meshes++; if (o.isInstancedMesh) g.inst += o.count; g.tris += (o.isInstancedMesh ? o.count : 1) * idx / 3; if (o.matrixAutoUpdate) g.matrixAuto++;
      mats.forEach(m => { if (!m) return; g.mats.add(m.uuid); ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(k => { if (m[k]) g.tex.add(m[k].uuid); }); }); total += parts; });
    // anonymous top-level meshes/groups: fingerprint by geometry type + material type + whether the geometry is shared + a world-position sample
    const pat = {};
    S.traverse(o => { if (!o.isMesh || !vis(o)) return; let top = o; while (top.parent && top.parent !== S) top = top.parent; if (top.name) return;
      const geo = o.geometry, m = Array.isArray(o.material) ? o.material[0] : o.material;
      const k = (geo && geo.type) + '|' + (m && m.type) + '|' + (o.isInstancedMesh ? 'inst' : 'mesh') + '|' + (geo && geo.attributes && geo.attributes.position ? geo.attributes.position.count : 0) + 'v';
      const e = pat[k] || (pat[k] = { n: 0, geoShared: new Set(), matShared: new Set(), x: [], z: [], names: new Set() });
      e.n++; e.geoShared.add(geo && geo.uuid); e.matShared.add(m && m.uuid); if (e.x.length < 3) { const w = new window.__w3dDebug.THREE.Vector3(); o.getWorldPosition(w); e.x.push(Math.round(w.x)); e.z.push(Math.round(w.z)); }
      let p = o; for (let d = 0; d < 4 && p; d++, p = p.parent) if (p.name) { e.names.add(p.name); break; } if (o.name) e.names.add('self:' + o.name); });
    const patRows = Object.keys(pat).map(k => ({ key: k, n: pat[k].n, uniqueGeo: pat[k].geoShared.size, uniqueMat: pat[k].matShared.size, sample: pat[k].x.map((x, i) => [x, pat[k].z[i]]), names: Array.from(pat[k].names).slice(0, 4) })).sort((a, b) => b.n - a.n).slice(0, 14);
    const rows = Object.keys(groups).map(k => ({ group: k, draws: groups[k].draws, meshes: groups[k].meshes, instances: groups[k].inst, kTris: Math.round(groups[k].tris / 1000), materials: groups[k].mats.size, textures: groups[k].tex.size, autoMatrix: groups[k].matrixAuto })).sort((a, b) => b.draws - a.draws);
    return { patterns: patRows, totalDrawSubmissions: total, groups: rows.length, top: rows.slice(0, 22), info: (() => { const i = window.__w3dDebug.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries }; })() };
  });
  console.log(JSON.stringify(r, null, 1)); await b.close();
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
