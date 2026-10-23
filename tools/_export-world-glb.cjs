/* tools/_export-world-glb.cjs — export what the GAME actually builds (code-built buildings, Athenaeum exterior, roads, plazas, transit, landmarks)
 * to a GLB for the owner's Blender (2026-10-23, owner: "put everything that will be in game in so I can see it all").
 * Boots the world, waits for the Grid to stream, then collects every mesh whose world centre is within R_M of the centre, SKIPPING the
 * groups the Blender scene already has from data (grid fabric buildings, canon-v4, terrain, water, sky, clouds, edge realms, bazaar).
 * InstancedMeshes are baked into plain geometry; materials are reduced to their colour. Writes C:/Users/Brittany/eye/world-export.glb (or reef-export.glb with an ONLY filter).
 *   node tools/_export-world-glb.cjs [R_M=1700] */
const puppeteer = require('puppeteer'), os = require('os'), fs = require('fs'), sleep = ms => new Promise(r => setTimeout(r, ms));
const R_M = +(process.argv[2] || 5200), ONLY = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;   /* e.g. node tools/_export-world-glb.cjs 5200 "^reef" = only those top groups */
/* vendor has no GLTFExporter: inject the dev-only copy from tools/ual (r160; uses only core three APIs) as a blob module, pointed at the page's own three instance */
const EXP_SRC = fs.readFileSync(require('path').join(__dirname, 'ual/node_modules/three/examples/jsm/exporters/GLTFExporter.js'), 'utf8')
  .replace("from 'three';", "from 'http://localhost:3013/vendor/three/three.module.js';")
  .replace("import { decompress } from './../utils/TextureUtils.js';", "const decompress = (t) => t;");
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 });
  p.on('console', m => { const t = m.text(); if (t.indexOf('[export]') === 0) console.log(t.slice(0, 3000)); });
  p.on('pageerror', e => console.log('PAGEERR', (e.message || '').slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&bazaar=0&edgerealms=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(30000);
  const b64 = await p.evaluate(async (R_M, EXP_SRC, ONLY_SRC) => {
    const ONLY_RX = ONLY_SRC ? new RegExp(ONLY_SRC, 'i') : null;
    const D = window.__w3dDebug, S = D.scene, T = D.THREE, U = 7 / 1.8;
    const { GLTFExporter } = await import(URL.createObjectURL(new Blob([EXP_SRC], { type: 'text/javascript' })));
    const SKIP = /^(grid-fabric|world-canon|world-terrain|world-water|sky|world-sky|edge-realms|underground-bazaar|world-clouds|stars|interior_|world-dragons|air-traffic|world-wildlife|realm-dress)/i;
    const tops = {}; S.children.forEach(o => { tops[o.name || o.type] = (tops[o.name || o.type] || 0) + 1; }); console.log('[export] top groups', JSON.stringify(tops));
    const out = new T.Group(), box = new T.Box3(), c = new T.Vector3(), m4 = new T.Matrix4(); let n = 0, tris = 0;
    const mats = new Map(); const matFor = (m) => { m = Array.isArray(m) ? m[0] : m; const col = m && m.color ? m.color.getHex() : 0x999999, em = m && m.emissive ? m.emissive.getHex() : 0; const k = col + ':' + em; if (!mats.has(k)) mats.set(k, new T.MeshStandardMaterial({ color: col, emissive: em, roughness: 0.6 })); return mats.get(k); };
    S.updateMatrixWorld(true);
    S.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      let top = o; while (top.parent && top.parent !== S) top = top.parent;
      if (ONLY_RX ? !ONLY_RX.test(top.name || '') : SKIP.test(top.name || '')) return;
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
  }, R_M, EXP_SRC, ONLY ? ONLY.source : null);
  fs.writeFileSync('C:/Users/Brittany/eye/' + (ONLY ? 'reef' : 'world') + '-export.glb', Buffer.from(b64, 'base64'));
  console.log('written', (fs.statSync('C:/Users/Brittany/eye/' + (ONLY ? 'reef' : 'world') + '-export.glb').size / 1e6).toFixed(1), 'MB');
  await b.close();
})().catch(e => { console.error('export failed', e.message); process.exit(1); });
