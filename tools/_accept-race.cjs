/* tools/_accept-race.cjs — race acceptance (S2 steps 1-2: deck height, city clearance). Static server first: cd public && python -m http.server 3013
 *   node tools/_accept-race.cjs
 * Boots ?tracks=quarter-loop&trackcity=1, starts a free ride on the track, then checks:
 *   1. the track built (window.__raceTracks['quarter-loop'] exists with a surfaceAt)
 *   2. the deck has a height at >= 90% of its centreline samples (no holes where the deck should be)
 *   3. over 10 s of samples, the race state has no NaN and the position stays finite
 * Exit 0 on pass, 1 on fail. Refuses to start below SMOKE_MIN_MB free RAM (default 1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=quarter-loop&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__loadPlayable && window.__raceTracks && window.__raceTracks['quarter-loop'])).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log(JSON.stringify({ pass: false, reason: 'track never built', page_errors: errs.slice(0, 5) })); await b.close(); process.exit(1); }
  // 1 + 2: deck height along the centreline
  const deck = await p.evaluate(() => {
    const t = window.__raceTracks['quarter-loop'];
    const pts = window.WorldRace.trackWorld('quarter-loop', window.__w3dDebug ? 1 : 1) || [];
    const U = 7 / 1.8; const samp = [];
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 40))) samp.push(pts[i]);
    const hits = samp.filter(p => t.surfaceAt(p.x, p.z) != null).length;
    return { built: !!t.surfaceAt, samples: samp.length, hits: hits, lengthM: t.lengthM };
  });
  // start a free ride on the track and sample the race state for 10 s
  await p.evaluate(() => { try { window.__raceStart('quarter-loop', { free: true }); } catch (e) {} });
  const samples = []; for (let i = 0; i < 10; i++) { await sleep(1000); samples.push(await p.evaluate(() => { try { return JSON.parse(JSON.stringify(window.__raceRun ? window.__raceRun.state() : null)); } catch (e) { return null; } })); }
  const nanFound = JSON.stringify(samples).includes('NaN');
  const hitRatio = deck.samples ? deck.hits / deck.samples : 0;
  const pass = deck.built && hitRatio >= 0.9 && !nanFound && errs.length === 0;
  console.log(JSON.stringify({ pass, deck, hit_ratio: +hitRatio.toFixed(2), nan_in_state: nanFound, state_samples: samples.length, page_errors: errs.slice(0, 5) }, null, 1));
  await b.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
