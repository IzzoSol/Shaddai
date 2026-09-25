// node tools/probe-mapv3.cjs 8790 [shot.png] -> Map v3 checks: colosseum exterior + doors from layout, transit spokes/hubs,
// collider overlaps, errors; optional top-down whole-map screenshot (compare with the owner's atlas).
// Reuses ONE browser profile (PROBE_PROFILE or ./.probe-profile) so repeated runs don't fill %TEMP%.
const puppeteer = require('puppeteer');
const path = require('path');
const port = process.argv[2] || 8790, shot = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, userDataDir: process.env.PROBE_PROFILE || path.join(__dirname, '..', '.probe-profile'),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 140)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true && !!window.__worldTransit).catch(() => false)) break; }
  await sleep(6000);
  const r = await p.evaluate(() => {
    const L = window.WORLD_LAYOUT, C = L.realmColliders, T = window.__w3dDebug.terrain, H = (x, z) => +T.heightAt(x, z).toFixed(1);
    const cw = window.COLOSSEUM_WORLD, ext = window.__colosseumExt;
    // doors actually registered by world-interiors (sector table)
    const I = window.__w3dDebug.interiors, doorGroups = [];
    window.__w3dDebug.scene.traverse((o) => { if (/^outdoor-door:(COLOSSEUM|FORTRESS|CASTLE)/.test(o.name)) doorGroups.push(o.name.split(':')[1] + '@' + Math.round(o.position.x) + ',' + Math.round(o.position.z)); });
    // overlaps: colosseum shell/lobby vs everything that is not colosseum
    const colo = C.filter((c) => /^colosseum-/.test(c.label)), other = C.filter((c) => !/^colosseum-/.test(c.label)), hits = [];
    colo.forEach((q) => other.forEach((o) => { if (Math.hypot(q.x - o.x, q.z - o.z) < q.r + (o.r || 0)) hits.push((o.label || '?') + '@' + o.x + ',' + o.z); }));
    const py = C.filter((c) => c.label === 'maglev-pylon'), ph = [];
    py.forEach((q) => other.filter((o) => o.label !== 'maglev-pylon').forEach((o) => { if (Math.hypot(q.x - o.x, q.z - o.z) < q.r + (o.r || 0)) ph.push(o.label + '@' + q.x + ',' + q.z); }));
    return {
      colosseum: cw ? { centre: [cw.x, cw.z], door: cw.door.map(Math.round), built: !!(ext && ext.group), plazaH: H(cw.x, cw.z), doorH: H(cw.door[0], cw.door[1]), shellColliders: colo.length } : null,
      doors: doorGroups, overlapsColosseum: [...new Set(hits)].slice(0, 10), overlapsPylons: [...new Set(ph)].slice(0, 10),
      prompt: (() => { const nd = (x, z) => { const d = I.nearestDoor(x, z); return d ? (d.code || d) : null; }, f = cw.front, fo = C.find((c) => c.label === 'hero-fortress'), ca = C.find((c) => c.label === 'hero-castle');
        const fr = (c, k) => { const l = Math.hypot(c.x, c.z); return [c.x - c.x / l * (c.r + k), c.z - c.z / l * (c.r + k)]; };
        return { atColoDoor: nd(cw.door[0] + f[0] * 8, cw.door[1] + f[1] * 8), coloSide: nd(cw.x + 420, cw.z), coloFar20m: nd(cw.door[0] + f[0] * 80, cw.door[1] + f[1] * 80), oldV2Spot: nd(-14, 460),
          fortressFront: nd(...fr(fo, 8)), castleFront: nd(...fr(ca, 8)), fortressBack: nd(fo.x + fo.x / Math.hypot(fo.x, fo.z) * (fo.r + 8), fo.z + fo.z / Math.hypot(fo.x, fo.z) * (fo.r + 8)) }; })(),
      hubs: window.__worldTransit.hubs.length, stations: window.__worldTransit.stations.length,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  if (shot) {
    await p.evaluate(() => { window.__probeCam = { pos: [0, 5600, 400], look: [0, 0, 380] }; const c = window.__w3dDebug.camera; c.far = 9000; c.updateProjectionMatrix(); window.__w3dDebug.scene.fog = null; });
    await sleep(12000);
    await p.screenshot({ path: shot }); console.log('shot →', shot);
    await p.evaluate(() => { const cw = window.COLOSSEUM_WORLD; window.__probeCam = { pos: [cw.door[0] + 500, 420, cw.door[1] - 700], look: [cw.x, 80, cw.z] }; });
    await sleep(10000);
    const s2 = shot.replace(/\.png$/, '-colosseum.png'); await p.screenshot({ path: s2 }); console.log('shot →', s2);
  }
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
