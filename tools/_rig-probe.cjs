/* tools/_rig-probe.cjs — is the player body animated (never T-posed)?  node tools/_rig-probe.cjs <outDir> [CODE ...]   (static server :3013)
 * Enters the world, swaps the player body to each CODE (e.g. FORGE-PSIONIC, SHADDAI), reports window.__playerRig() and screenshots it from behind. */
const puppeteer = require('puppeteer'), os = require('os'), path = require('path'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const [dir, ...codes] = process.argv.slice(2), errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=900'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 480 }); p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  await sleep(20000);
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); D.renderer.render = (s, c) => { const P = D.playerPos; if (window.__camBehind && P) { c.position.set(P.x + 6, P.y + 9, P.z + 14); c.lookAt(P.x, P.y + 5, P.z); c.updateMatrixWorld(true); } r0(s, c); }; window.__camBehind = true; });
  for (const code of codes) {
    await p.evaluate(c => window.setPlayerCharacter(c), code); await sleep(15000);
    const rig = await p.evaluate(() => window.__playerRig ? window.__playerRig() : null);
    console.log(code, JSON.stringify(rig));
    await p.screenshot({ path: path.join(dir, 'rig-' + code + '.png') });
  }
  console.log('errs', JSON.stringify(errs.slice(0, 3))); await b.close();
})().catch(e => { console.log('crash', e.message); process.exit(2); });
