/* tools/_shot-select.cjs — opens the race select ride screen and saves a screenshot. node tools/_shot-select.cjs out.png */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1180, height: 900 }); const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160))); p.on('console', m => { const t = m.text(); if (/thumbnail|race-select/i.test(t)) errs.push('console: ' + t.slice(0, 200)); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=meridian-tri&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.WorldRaceSelect && window.__raceTrackDone && window.__raceStart && window.WorldRaceSelect.open)).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log('not ready', errs); await b.close(); process.exit(1); }
  await p.evaluate(() => { try { window.WorldRaceSelect.open({ cid: 'meridian-tri' }); } catch (e) { window.__selErr = String(e); } });
  await sleep(2500);
  await p.evaluate(() => { const c = document.querySelector('[data-a="ride"][data-r="kart-bike-emerald"]'); if (c) c.click(); });
  await sleep(800);
  await p.screenshot({ path: process.argv[2] || 'docs/ref/select.png', fullPage: false });
  console.log(JSON.stringify({ errs, selErr: await p.evaluate(() => window.__selErr || null) })); await b.close();
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
