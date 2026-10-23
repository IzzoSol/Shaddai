/* tools/_skate-probe.cjs — 2026-10-23: every council agent can walk, run, attack AND ride the hoverboard with tricks. For each agent:
 * setPlayerCharacter, fire attack1/heavy/combo, press O to board, hold W, pop a jump + Shift+W flip, count trick events, dismount. Headless. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 }); const errs = [];
  p.on('pageerror', e => errs.push((e.message || '').slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&unlockall', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(5000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(10000);
  await p.evaluate(() => { window.__tricks = []; window.addEventListener('shaddai:trick', e => window.__tricks.push(e.detail && (e.detail.name || e.detail.kind))); });
  for (const code of ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON']) {
    await p.evaluate(c => window.setPlayerCharacter(c), code); await sleep(7000);
    const atk = await p.evaluate(() => { const A = window.__w3dDebug.playerAnim(); return ['walk', 'run', 'attack1', 'heavy', 'combo'].map(n => n + ':' + (A.clips.indexOf(n) >= 0 || A.once(n) ? 'ok' : 'no')).join(' '); });
    await p.keyboard.press('KeyO'); await sleep(2500);
    const riding = await p.evaluate(() => !!(window.__hover && window.__hover.isRiding()));
    await p.evaluate(() => { window.__tricks.length = 0; });
    await p.keyboard.down('KeyW'); await sleep(1500);
    for (let k = 0; k < 2; k++) { await p.keyboard.down('Space'); await sleep(450); await p.keyboard.down('ShiftLeft'); await sleep(500); await p.keyboard.up('ShiftLeft'); await p.keyboard.up('Space'); await sleep(1800); }
    await p.keyboard.up('KeyW');
    const tricks = await p.evaluate(() => window.__tricks.slice(0, 6));
    await p.keyboard.press('KeyO'); await sleep(1500);
    console.log(code.padEnd(8), atk, '| board:', riding ? 'riding' : 'NOT riding', '| trick events:', JSON.stringify(tricks));
  }
  console.log('pageerrors', errs.length, errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
