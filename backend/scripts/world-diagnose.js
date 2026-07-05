// Headless runtime diagnostic for the 3D world — captures REAL console errors and
// functionally tests collision + interiors. Uses system Chrome via puppeteer-core.
const puppeteer = require('puppeteer-core');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].find(p => { try { return require('fs').existsSync(p); } catch (e) { return false; } });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
           '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ERROR: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQ FAILED: ' + r.url() + ' — ' + (r.failure() && r.failure().errorText)));

  await page.goto('http://localhost:3000/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => errors.push('GOTO: ' + e.message));
  // give the world time to build behind the intro, then force-enter
  await new Promise(r => setTimeout(r, 10000));
  await page.evaluate(() => { try { var b = document.getElementById('enterBtn'); if (b) b.click(); } catch (e) {} }).catch(()=>{});
  await new Promise(r => setTimeout(r, 6000));

  const state = await page.evaluate(() => {
    const out = {};
    try {
      out.WORLD_RESOLVE_POS = typeof window.WORLD_RESOLVE_POS;
      out.WORLD_COLLIDES = typeof window.WORLD_COLLIDES;
      out.WORLD_LAYOUT = !!(window.WORLD_LAYOUT && window.WORLD_LAYOUT.sectors);
      // find QUILL (library) + NEXUS positions
      const secs = (window.WORLD_LAYOUT && window.WORLD_LAYOUT.sectors) || [];
      const q = secs.find(s => s.code === 'QUILL');
      const n = secs.find(s => s.code === 'NEXUS');
      out.quillPos = q ? q.pos : null;
      // FUNCTIONAL collision test: a point AT the building center must collide (solid)
      if (window.WORLD_COLLIDES && q) out.collidesAtQuillCenter = window.WORLD_COLLIDES(q.pos[0], q.pos[1]);
      if (window.WORLD_COLLIDES && n) out.collidesAtNexusCenter = window.WORLD_COLLIDES(n.pos[0], n.pos[1]);
      // resolve test: push a point inside QUILL out — should MOVE
      if (window.WORLD_RESOLVE_POS && q) {
        const p = { x: q.pos[0], z: q.pos[1] };
        window.WORLD_RESOLVE_POS(p);
        out.quillResolveMoved = (Math.abs(p.x - q.pos[0]) + Math.abs(p.z - q.pos[1])) > 0.5;
      }
      // interiors / doors present?
      out.hasInteriors = typeof window.buildWorldInteriors;
      // COLLISION COVERAGE: test a ring of points around QUILL at increasing radius
      if (window.WORLD_COLLIDES && q) {
        const cx = q.pos[0], cz = q.pos[1];
        out.quillCoverage = {};
        [60, 90, 118, 140, 165, 190].forEach(function (r) {
          let hits = 0;
          for (let a = 0; a < 8; a++) { const x = cx + Math.cos(a/8*6.283)*r, z = cz + Math.sin(a/8*6.283)*r; if (window.WORLD_COLLIDES(x, z)) hits++; }
          out.quillCoverage['r' + r] = hits + '/8';
        });
      }
      // DOOR meshes in the scene? search by name/userData
      let doorCount = 0, sceneMeshes = 0;
      if (window.__scene && window.__scene.traverse) {
        window.__scene.traverse(function (o) {
          if (o.isMesh) sceneMeshes++;
          const nm = (o.name || '') + ' ' + JSON.stringify(o.userData || {});
          if (/door/i.test(nm)) doorCount++;
        });
      }
      out.sceneMeshes = sceneMeshes;
      out.doorMeshes = doorCount;
      // DEFINITIVE door check: count meshes AT each building's computed door position.
      out.doorsAtPos = {};
      if (window.__scene && window.__scene.traverse) {
        secs.forEach(function (s) {
          if (s.code === 'SHADDAI' || !s.pos) return;
          const cx = s.pos[0], cz = s.pos[1];
          const flen = Math.hypot(-cx, -cz) || 1;
          const fx = -cx / flen, fz = -cz / flen;   // toward world center
          const R = (s.code === 'QUILL') ? 118 : (s.code === 'NEXUS' || s.code === 'ORACLE' ? 88 : 91);
          const dx = cx + fx * (R + 1), dz = cz + fz * (R + 1);
          let near = 0;
          window.__scene.traverse(function (o) {
            if (!o.isMesh) return;
            const e = o.matrixWorld.elements;
            if (Math.hypot(e[12] - dx, e[14] - dz) < 14) near++;
          });
          out.doorsAtPos[s.code] = near;
        });
      }
      // MEASURE real building footprints from the exposed scene
      const S = window.__scene;
      if (S && S.traverse) {
        const centers = {};
        secs.forEach(function (s) { if (s.code !== 'SHADDAI' && s.pos) centers[s.code] = { cx: s.pos[0], cz: s.pos[1], ext: 0, n: 0 }; });
        S.traverse(function (o) {
          if (!o.isMesh || !o.geometry) return;
          if (!o.geometry.boundingSphere) { try { o.geometry.computeBoundingSphere(); } catch (e) {} }
          const bs = o.geometry.boundingSphere; if (!bs) return;
          const e = o.matrixWorld.elements; const wx = e[12], wz = e[14];
          const sc = Math.hypot(e[0], e[1], e[2]); const rad = bs.radius * sc;
          if (rad > 480) return; // skip ground/terrain
          let best = null, bd = 1e9;
          for (const code in centers) { const c = centers[code]; const d = Math.hypot(wx - c.cx, wz - c.cz); if (d < bd) { bd = d; best = code; } }
          if (best && bd < 160) { const c = centers[best]; c.ext = Math.max(c.ext, bd + rad); c.n++; }
        });
        out.realFootprints = {};
        for (const code in centers) out.realFootprints[code] = { extent: Math.round(centers[code].ext), meshes: centers[code].n };
      }
      out.exposedScene = !!S;
    } catch (e) { out.evalError = e.message; }
    return out;
  }).catch(e => ({ evalFail: e.message }));

  console.log('=== RUNTIME ERRORS (' + errors.length + ') ===');
  errors.slice(0, 25).forEach(e => console.log(e));
  console.log('\n=== RUNTIME STATE ===');
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
})().catch(e => { console.log('FATAL: ' + e.message); process.exit(1); });
