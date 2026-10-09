/* tools/_track-shot.cjs — race-track review shots on the terrain lab (light: terrain + track only, no city).
 *   node tools/_track-shot.cjs [circuit] [label]      e.g. dragon-gate v1
 * Saves C:/Users/Brittany/eye/track-<label>-<view>.png: chase cam on a straight, a banked corner (chevrons), a boost pad,
 * the highest pylon span, and an aerial of the whole circuit. Refuses below TERRAIN_MIN_MB free RAM (600). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.TERRAIN_MIN_MB || 600), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const cid = process.argv[2] || 'dragon-gate', label = process.argv[3] || 'v1', errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404/.test(t)) errs.push(t.slice(0, 300)); });
  await p.goto('http://localhost:3013/terrain-v4-lab.html?set=real&noShadow&track=' + cid, { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 120 && !(await p.evaluate(() => !!(window.__lab && window.__lab.track)).catch(() => false)); i++) await sleep(1000);
  const info = await p.evaluate(() => { const T = window.__lab.track, F = T.frames, n = F.length; let corner = 0, high = 0;
    for (let i = 0; i < n; i++) { if (Math.abs(F[i].bank) > Math.abs(F[corner].bank)) corner = i; if (F[i].P.y - F[i].g > F[high].P.y - F[high].g) high = i; }
    let draws = 0; T.group.traverse(o => { if (o.isMesh) draws++; });
    return { n, lengthM: Math.round(T.lengthM), corner, high, highM: +((F[high].P.y - F[high].g) / (7 / 1.8)).toFixed(1), pad: T.pads[0], draws }; });
  console.log(JSON.stringify(info));
  await p.evaluate(() => { const L = window.__lab, r0 = L.renderer.render.bind(L.renderer); L.renderer.render = (s, c) => { const V = window.__view; if (V) { c.position.set(V[0], V[1], V[2]); c.lookAt(V[3], V[4], V[5]); c.updateMatrixWorld(true); } r0(s, c); }; });
  // chase cam: 14 m behind + 4 m above sample i, looking 40 m ahead
  const chase = (i, back, up, ahead) => p.evaluate((i, back, up, ahead) => { const F = window.__lab.track.frames, n = F.length, U = 7 / 1.8, f = F[(i + n) % n], a = F[(i + Math.round(ahead / 4) + n) % n];
    const c = f.P.clone().addScaledVector(f.T, -back * U).addScaledVector(f.N, up * U); window.__view = [c.x, c.y, c.z, a.P.x, a.P.y + 1.5 * U, a.P.z]; }, i, back, up, ahead);
  const views = [['straight', info.pad + 12, 14, 4, 50], ['corner', info.corner - 8, 14, 4, 40], ['boost', info.pad - 6, 10, 3.5, 30], ['pylons', info.high, 60, 18, 20]];
  for (const v of views) { await chase(v[1], v[2], v[3], v[4]); await sleep(9000); await p.screenshot({ path: `C:/Users/Brittany/eye/track-${label}-${v[0]}.png` }); console.log('shot', v[0]); }
  await p.evaluate(() => { const F = window.__lab.track.frames; let cx = 0, cz = 0, y = 0; F.forEach(f => { cx += f.P.x; cz += f.P.z; y = Math.max(y, f.P.y); }); cx /= F.length; cz /= F.length; window.__view = [cx + 900, y + 1300, cz + 1400, cx, y, cz]; });
  await sleep(9000); await p.screenshot({ path: `C:/Users/Brittany/eye/track-${label}-aerial.png` }); console.log('shot aerial');
  console.log(JSON.stringify({ errs: errs.slice(0, 6) }));
  await b.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
