// node tools/probe-overlap.cjs 8790 -> for each fal placement, list existing scene objects whose XZ footprint overlaps it
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) { await sleep(2000); const s = await p.evaluate(() => window.__worldFalProps && window.__worldFalProps.stats()).catch(() => null); if (s && s.placed >= 19) break; }
  await sleep(4000);
  const r = await p.evaluate(() => {
    const scene = window.__w3dDebug.scene, fal = window.__worldFalProps.group;
    const bbox = (root) => { let a = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity], n = 0; root.updateMatrixWorld(true);
      root.traverse((o) => { if (!o.isMesh || !o.geometry || o.isSprite) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, e = o.matrixWorld.elements; if (!isFinite(bb.min.x)) return;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14]; a[0] = Math.min(a[0], wx); a[1] = Math.max(a[1], wx); a[2] = Math.min(a[2], wy); a[3] = Math.max(a[3], wy); a[4] = Math.min(a[4], wz); a[5] = Math.max(a[5], wz); } n++; });
      return n ? a : null; };
    // candidate existing objects: second-level children of the scene (buildings are usually groups), skip huge planes/terrain/sky
    const cands = [];
    scene.children.forEach((c) => { if (c === fal) return; const kids = (c.children.length > 1 && c.children.length < 400) ? c.children : [c];
      kids.forEach((k) => { const bb = bbox(k); if (!bb) return; const w = bb[1] - bb[0], d = bb[5] - bb[4], h = bb[3] - bb[2]; if (w > 600 || d > 600 || h < 6) return; cands.push({ name: (c.name || '?') + '/' + (k.name || k.type), bb }); }); });
    const out = {};
    fal.children.forEach((h) => { if (!/^fal-bld|^fal-prop-neon|^fal-hub-dock/.test(h.name)) return; const bb = bbox(h);
      const hits = cands.filter((c) => c.bb[0] < bb[1] && c.bb[1] > bb[0] && c.bb[4] < bb[5] && c.bb[5] > bb[4]).map((c) => `${c.name} [${Math.round((c.bb[0] + c.bb[1]) / 2)},${Math.round((c.bb[4] + c.bb[5]) / 2)}] h${Math.round(c.bb[3] - c.bb[2])}`);
      out[h.name] = { footprint: [Math.round(bb[0]), Math.round(bb[1]), Math.round(bb[4]), Math.round(bb[5])], overlaps: hits.slice(0, 6) }; });
    // free-ground map: 10u cells over the city disc (R<370), occupied by any candidate footprint (not the fal group)
    const C = 10, R = 370, occ = new Set();
    cands.forEach((c) => { for (let x = Math.floor(c.bb[0] / C); x <= Math.floor(c.bb[1] / C); x++) for (let z = Math.floor(c.bb[4] / C); z <= Math.floor(c.bb[5] / C); z++) occ.add(x + ',' + z); });
    const T = window.__w3dDebug.terrain, free = (cx, cz, r) => { for (let x = Math.floor((cx - r) / C); x <= Math.floor((cx + r) / C); x++) for (let z = Math.floor((cz - r) / C); z <= Math.floor((cz + r) / C); z++) { if (occ.has(x + ',' + z)) return false; } return Math.hypot(cx, cz) + r < R; };
    const spots = {};
    for (const need of [62, 35, 16]) { const list = []; for (let x = -R; x <= R; x += 10) for (let z = -R; z <= R; z += 10) if (free(x, z, need)) { const h = T.heightAt(x, z); list.push([x, z, Math.round(Math.hypot(x, z)), +h.toFixed(1)]); }
      list.sort((a, b) => a[2] - b[2]); spots['r' + need] = { count: list.length, nearest: need > 60 ? list : list.slice(0, 12) }; }
    // lot search: a half-width box where every overlapping object is SMALL (clearable clutter), ranked by clutter count
    const lots = {};
    for (const [key, hw] of [['shop', 58], ['arcade', 36]]) {
      const res = [];
      for (let x = -340; x <= 340; x += 10) for (let z = -340; z <= 340; z += 10) {
        if (Math.hypot(x, z) + hw * 1.42 > 372 || Math.hypot(x, z) < 70) continue;
        let big = false, small = 0;
        for (const c of cands) { if (c.bb[0] < x + hw && c.bb[1] > x - hw && c.bb[4] < z + hw && c.bb[5] > z - hw) { const w = c.bb[1] - c.bb[0], d = c.bb[5] - c.bb[4], h = c.bb[3] - c.bb[2]; if (h > 16 || w > 20 || d > 20) { big = true; break; } small++; } }
        if (!big && Math.abs(T.heightAt(x, z)) < 3) res.push([x, z, small, Math.round(Math.hypot(x, z))]);
      }
      res.sort((a, b) => a[2] - b[2] || a[3] - b[3]); lots[key] = { count: res.length, best: res.slice(0, 10) };
    }
    return { candidates: cands.length, occupiedCells: occ.size, lots, out };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
