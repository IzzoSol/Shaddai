/* tools/_export-world-glb.cjs — export what the GAME actually builds (code-built buildings, Athenaeum exterior, roads, plazas, transit, landmarks)
 * to a GLB for the owner's Blender (2026-10-23, owner: "put everything that will be in game in so I can see it all").
 * Boots the world, waits for the Grid to stream, then collects every mesh whose world centre is within R_M of the centre, SKIPPING the
 * groups the Blender scene already has from data (grid fabric buildings, canon-v4, terrain, water, sky, clouds, edge realms, bazaar).
 * InstancedMeshes are baked into plain geometry; materials are reduced to their colour. Writes C:/Users/Brittany/eye/world-export.glb.
 *   node tools/_export-world-glb.cjs [R_M=1700] */
const puppeteer = require('puppeteer'), os = require('os'), fs = require('fs'), sleep = ms => new Promise(r => setTimeout(r, ms));
const R_M = +(process.argv[2] || 1700);
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 });
  p.on('pageerror', e => console.log('PAGEERR', (e.message || '').slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&bazaar=0&edgerealms=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(30000);
  const b64 = await p.evaluate(async (R_M) => {
    const D = window.__w3dDebug, S = D.scene, T = D.THREE, U = 7 / 1.8;
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const SKIP = /^(grid-fabric|world-canon|world-terrain|world-water|sky|world-sky|edge-realms|underground-bazaar|world-clouds|stars|interior_|world-dragons|air-traffic|world-wildlife)/i;
    const out = new T.Group(), box = new T.Box3(), c = new T.Vector3(), m4 = new T.Matrix4(); let n = 0, tris = 0;
    const mats = new Map(); const matFor = (m) => { m = Array.isArray(m) ? m[0] : m; const col = m && m.color ? m.color.getHex() : 0x999999, em = m && m.emissive ? m.emissive.getHex() : 0; const k = col + ':' + em; if (!mats.has(k)) mats.set(k, new T.MeshStandardMaterial({ color: col, emissive: em, roughness: 0.6 })); return mats.get(k); };
    S.updateMatrixWorld(true);
    S.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      let top = o; while (top.parent && top.parent !== S) top = top.parent;
      if (SKIP.test(top.name || '')) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const add = (mw) => { box.copy(o.geometry.boundingBox).applyMatrix4(mw); box.getCenter(c); if (Math.hypot(c.x, c.z) > R_M * U || c.y < -100 * U) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); const g2 = new T.BufferGeometry(); g2.setAttribute('position', g.attributes.position.clone()); g2.applyMatrix4(mw); g2.computeVertexNormals();
        out.add(new T.Mesh(g2, matFor(o.material))); n++; tris += g2.attributes.position.count / 3; };
      if (o.isInstancedMesh) { for (let i = 0; i < Math.min(o.count, 3000); i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); add(m4.clone()); } }
      else add(o.matrixWorld);
    });
    out.scale.setScalar(1 / U);   // world units -> metres for Blender
    const ab = await new Promise((res, rej) => new GLTFExporter().parse(out, res, rej, { binary: true }));
    console.log('[export] meshes', n, 'tris', Math.round(tris));
    let s = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, R_M);
  fs.writeFileSync('C:/Users/Brittany/eye/world-export.glb', Buffer.from(b64, 'base64'));
  console.log('written', (fs.statSync('C:/Users/Brittany/eye/world-export.glb').size / 1e6).toFixed(1), 'MB');
  await b.close();
})().catch(e => { console.error('export failed', e.message); process.exit(1); });
