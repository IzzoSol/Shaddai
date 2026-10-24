/* tools/_batch-ab.cjs — same-session A/B for the SAFE static batch (2026-10-24). Boots with ?batch=0, waits until playable + settled, records draw
 * calls and a screenshot, runs WorldStaticBatch.runSafe in the page at the same camera, then records again and prints a pixel diff.
 *   node tools/_batch-ab.cjs [query]      (static server :3013 first: node tools/serve.cjs). Shots: tools/_out/batch-a.png, batch-b.png */
const puppeteer = require('puppeteer'), os = require('os'), fs = require('fs'), path = require('path'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const out = path.join(__dirname, '_out'); fs.mkdirSync(out, { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 }); const errs = []; p.on('pageerror', e => errs.push((e.message || '').slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&unlockall&batch=0&time=0.5' + (process.argv[2] || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150 && !(await p.evaluate(() => !!window.__loadPlayable).catch(() => false)); i++) await sleep(2000);
  await sleep(30000);
  const snap = async (name) => { const calls = await p.evaluate(() => { const D = window.__w3dDebug; D.renderer.render(D.scene, D.camera); return D.renderer.info.render.calls; }); await p.screenshot({ path: path.join(out, name) }); return calls; };
  const A = await snap('batch-a.png');
  const r = await p.evaluate(() => import('three/addons/utils/BufferGeometryUtils.js').then(B => window.WorldStaticBatch.runSafe({ THREE: window.__w3dDebug.THREE, scene: window.__w3dDebug.scene, mergeGeometries: B.mergeGeometries, settleMs: 3000 })).then(s => ({ merged: s.merged, removed: s.removed })));
  await sleep(1500);
  const B = await snap('batch-b.png');
  const diff = await p.evaluate(async (a, c) => { const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(c)]), cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height; const g = cv.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++; return +(100 * n / (da.length / 4)).toFixed(2); },
    fs.readFileSync(path.join(out, 'batch-a.png')).toString('base64'), fs.readFileSync(path.join(out, 'batch-b.png')).toString('base64'));
  console.log('draw calls', A, '->', B, '| merged', JSON.stringify(r), '| pixels changed %', diff, '| pageerrors', errs.length, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error('ab failed', e.message); process.exit(1); });
