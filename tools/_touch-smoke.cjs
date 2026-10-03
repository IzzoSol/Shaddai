/* tools/_touch-smoke.cjs — phone emulation: loads the world as a touch device, checks the button layer exists, taps JUMP / E, and takes a screenshot.  node tools/_touch-smoke.cjs */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?touch=1&time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__touchButtons).catch(() => false)) break; }
  const before = await p.evaluate(() => { const e = document.getElementById('touchButtons'); return e ? e.style.display : 'none(not built)'; });   // character-select screen: buttons must be HIDDEN
  await p.evaluate(() => { document.body.classList.add('in-world'); window.__spawnBusy = false; });   // simulate 'entered the world' (the real portal flow is covered by _eye.cjs)
  await sleep(2500);
  const r = await p.evaluate(() => { const el = document.getElementById('touchButtons'); const seen = []; ['keydown', 'keyup'].forEach(t => addEventListener(t, e => seen.push(t + ':' + e.code))); const jump = [...el.querySelectorAll('div')].find(d => d.textContent === 'JUMP'); const ev = n => new PointerEvent(n, { bubbles: true, pointerId: 1 }); jump.dispatchEvent(ev('pointerdown')); jump.dispatchEvent(ev('pointerup')); return { shown: el && el.style.display, buttons: el.querySelectorAll('div').length, seen, mode: window._uiMode, locked: !!(window.__w3dDebug && 1) }; });
  console.log(JSON.stringify({ hidden_on_select_screen: before, errors: errs.slice(0, 5), ...r }, null, 1)); await sleep(1500); try { await p.screenshot({ path: 'C:/Users/Brittany/eye/touch-ui.png' }); console.log('screenshot saved'); } catch (e) { console.log('screenshot failed: ' + String(e.message).slice(0, 80)); } await b.close();
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
