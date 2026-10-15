/* tools/_shot.cjs — one screenshot of the live world at playable, for side-by-side review against the reference clips.
 *   node tools/_shot.cjs <outFile.png> [query]     e.g. node tools/_shot.cjs C:/Users/Brittany/eye/spawn.png "?time=0.5"
 * Static server first: cd public && python -m http.server 3013. Software GL: compare look, not speed.
 * Refuses to start below SMOKE_MIN_MB free RAM (default 1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const out = process.argv[2], qs = process.argv[3] || '';
  if (!out) { console.log('usage: node tools/_shot.cjs <out.png> [query]'); process.exit(2); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = true; break; } }
  // the page opens on the operative / portal picker: enter the default portal (Source Temple), as _sky-occl.cjs does
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 80 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(6000);
  // HUBCAM="dx,dy,dz" (metres from the reef hub): place the camera there and look at the hub, so a city view can be checked
  if (process.env.HUBCAM) {
    const off = process.env.HUBCAM.split(',').map(Number);
    const ok = await p.evaluate((off) => {
      const H = window.__reefHubPos, D = window.__w3dDebug, U = 7 / 1.8; if (!H || !D) return false;
      const cam = D.camera; cam.position.set(H.x + off[0] * U, (off[1] || 0) * U + 4 * U, H.z + off[2] * U); cam.lookAt(H.x, 4 * U, H.z); return true;
    }, off);
    console.log(JSON.stringify({ hubcam: ok }));
    await sleep(4000);
  }
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ playable: playable, shot: out }));
  await b.close(); process.exit(playable ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
