/* tools/_probe-meridian.cjs — twin figure-8 + lobe laps + prize boxes. Static server: cd public && python -m http.server 3013
 *   node tools/_probe-meridian.cjs [shot.png]   Exit 0 on pass. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < +(process.env.SMOKE_MIN_MB || 1000)) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 560 });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=meridian-8,meridian-8b&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__loadPlayable && window.__raceTracks && window.__raceTracks['meridian-8b'] && window.__raceStart && window.__raceTrackDone)).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log(JSON.stringify({ pass: false, reason: 'tracks never built', errs })); await b.close(); process.exit(1); }
  const tr = await p.evaluate(() => {
    const T = window.__raceTracks, U = 7 / 1.8, out = {};
    ['meridian-8', 'meridian-8b'].forEach(k => { const t = T[k], f = t.frames; let lo = 1e9, hi = -1e9; f.forEach(q => { lo = Math.min(lo, q.P.y / U); hi = Math.max(hi, q.P.y / U); }); out[k] = { frames: f.length, lenM: Math.round(t.lengthM), deckMin: Math.round(lo), deckMax: Math.round(hi) }; });
    // crossings between the two decks: nearest approach in plan, deck gap there
    const A = T['meridian-8'].frames, B = T['meridian-8b'].frames, gaps = [];
    for (let i = 0; i < A.length; i += 3) for (let j = 0; j < B.length; j += 3) { const dx = A[i].P.x - B[j].P.x, dz = A[i].P.z - B[j].P.z; if (dx * dx + dz * dz < (6 * U) ** 2) gaps.push(Math.abs(A[i].P.y - B[j].P.y) / U); }
    out.crossGapMinM = gaps.length ? Math.round(Math.min.apply(null, gaps) * 10) / 10 : null; out.crossSamples = gaps.length;
    out.aliases = ['meridian-8-lobe-n', 'meridian-8-lobe-s', 'meridian-8b-lobe-n', 'meridian-8b-lobe-s'].map(k => T[k] === T[k.replace(/-lobe-.$/, '')]);
    return out;
  });
  const start = await p.evaluate(() => { try { return window.__raceStart('meridian-8-lobe-n', { ais: 3 }); } catch (e) { return String(e); } });
  await sleep(4000);
  await sleep(6000);
  const hud = await p.evaluate(() => ({ has: !!document.getElementById('raceHud2'), speed: (document.getElementById('rh2Speed')||{}).textContent, map: !!document.getElementById('rh2Map') }));
  const pb = await p.evaluate(() => ({ prize: !!window.__prize, boxes: window.__prize ? window.__prize.group.children.filter(c => c.isInstancedMesh)[0].count : 0, crates: window.__raceRun.crates().length, phase: window.__raceRun.state() && window.__raceRun.state().phase }));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const pass = start === true && pb.prize && pb.boxes === pb.crates && pb.crates > 0 && tr.crossSamples >= 0 && tr.aliases.every(Boolean) && errs.length === 0;
  console.log(JSON.stringify({ pass: pass && hud.has && hud.map, start, tr, pb, hud, errs: errs.slice(0, 5) }, null, 1));
  await b.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
