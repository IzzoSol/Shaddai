/* tools/_sign-scan.cjs — finds BACKWARD / wall-facing signs automatically (NEXUS method, 2026-10-01).
 * For every plane-like mesh that carries a text/canvas texture, cast a short ray out of its FRONT face; if the ray hits geometry within 1.6 m the sign faces into a wall
 * (backward or buried). Also flags DoubleSide text (mirrored from behind) and negative-scale transforms (mirrored text).
 * Needs: python -m http.server 3013 --directory public. Usage: node tools/_sign-scan.cjs   -> prints a JSON report + writes C:/Users/Brittany/eye/sign-scan.json
 */
const puppeteer = require('puppeteer'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(12000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 80 && !(await p.evaluate(() => window.__spawnBusy === false && !!window.__entrances).catch(() => false)); i++) await sleep(3000);
  await sleep(10000);
  const rep = await p.evaluate(() => {
    const THREE = window.THREE || null; const D = window.__w3dDebug, scene = D.scene; const out = { scanned: 0, wallFacing: [], doubleSidedText: [], mirrored: [] };
    scene.updateMatrixWorld(true);
    const Vec = scene.position.constructor, Ray = (() => { try { return window.__RaycasterCtor; } catch (e) { return null; } })();
    // find Raycaster via a mesh's own prototype chain is not possible; use the camera's class module on window if exposed, else a tiny AABB test below
    const T = window.__THREE, rc = new T.Raycaster(); rc.near = 0.05; rc.far = 5;   // 5 world units = 1.3 m
    const solids = []; scene.traverse(o => { if (o.isMesh && o.visible && o.geometry && !(o.material && o.material.map && o.material.map.isCanvasTexture) && !o.isSkinnedMesh && !/sky|cloud|aurora|star|water|glow|beam|halo|fog/i.test((o.name || '') + (o.parent && o.parent.name || ''))) solids.push(o); });
    function hitsSolid(origin, dir, self) { rc.set(new T.Vector3(origin.x, origin.y, origin.z), new T.Vector3(dir.x, dir.y, dir.z)); const h = rc.intersectObjects(solids, false).filter(x => x.distance < 5 && x.object !== self); const f = h.find(x => !x.face || x.face.normal.clone().transformDirection(x.object.matrixWorld).dot(new T.Vector3(dir.x, dir.y, dir.z)) < -0.2); return f ? (f.object.name || (f.object.parent && f.object.parent.name) || 'mesh') + ' @' + f.distance.toFixed(1) : null; }
    scene.traverse(o => {
      if (!o.isMesh || !o.material) return; const mats = Array.isArray(o.material) ? o.material : [o.material], m = mats[0], map = m && m.map; if (!map || !map.isCanvasTexture) return;
      if (!o.geometry || !/Plane|Box/.test(o.geometry.type)) return; out.scanned++;
      const e = o.matrixWorld.elements, sx = Math.hypot(e[0], e[1], e[2]); const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[1] * (e[4] * e[10] - e[6] * e[8]) + e[2] * (e[4] * e[9] - e[5] * e[8]);
      const pos = { x: +(e[12]).toFixed(1), y: +(e[13]).toFixed(1), z: +(e[14]).toFixed(1) }, tag = (o.name || o.parent && o.parent.name || o.geometry.type);
      if (det < 0) out.mirrored.push({ tag, pos });
      if (m.side === 2) out.doubleSidedText.push({ tag, pos });
      const nz = { x: e[8], y: e[9], z: e[10] }, L = Math.hypot(nz.x, nz.y, nz.z) || 1, n = { x: nz.x / L, y: nz.y / L, z: nz.z / L };
      if (o.geometry.type === 'PlaneGeometry') { const org = { x: pos.x + n.x * 0.05, y: pos.y + n.y * 0.05, z: pos.z + n.z * 0.05, constructor: Object }; const h = hitsSolid(org, n, o); if (h) out.wallFacing.push({ tag, pos, hits: String(h).slice(0, 30) }); }
    });
    out.wallFacing = out.wallFacing.slice(0, 60); out.doubleSidedText = out.doubleSidedText.slice(0, 40); out.mirrored = out.mirrored.slice(0, 40); return out;
  });
  fs.mkdirSync('C:/Users/Brittany/eye', { recursive: true }); fs.writeFileSync('C:/Users/Brittany/eye/sign-scan.json', JSON.stringify(rep, null, 1));
  console.log(JSON.stringify({ scanned: rep.scanned, wallFacing: rep.wallFacing.length, doubleSidedText: rep.doubleSidedText.length, mirrored: rep.mirrored.length }));
  console.log(JSON.stringify(rep.wallFacing.slice(0, 12))); console.log(JSON.stringify(rep.mirrored.slice(0, 8))); await b.close();
})();
