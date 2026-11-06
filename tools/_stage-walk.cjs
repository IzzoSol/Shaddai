/* _stage-walk.cjs — sample movement per 100ms during a W hold to find what limits it.
   node tools/_stage-walk.cjs */
const puppeteer = require('puppeteer'), os = require('os');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 900) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=1200'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 600 });
  p.on('console', m => { const t = m.text(); if (/walk|possess|pivot|dt/.test(t)) console.log('  pg: ' + t.slice(0, 130)); });
  await p.goto('http://localhost:3013/__stage.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(16000);
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  await ev(() => { [...document.querySelectorAll('#row1 button')][3].click(); });
  await ev(() => { [...document.querySelectorAll('#row3 button')].find(x => x.textContent === 'BE SELECTED').click(); });
  await sleep(500);
  const s0 = await ev(() => window.__stage.state());
  console.log('start: ' + JSON.stringify(s0));
  await p.keyboard.down('KeyW');
  const samples = [];
  for (let k = 0; k < 12; k++){
    await sleep(120);
    samples.push(await ev(() => { const s = window.__stage.state(); return { px: +s.px.toFixed(2), pz: +s.pz.toFixed(2), dt: +window.__lastDt.toFixed(3), keyW: window.__stage.keys.KeyW === true, cur: window.__stage.entries[3].cur && window.__stage.entries[3].cur.getClip().name }; }));
  }
  await p.keyboard.up('KeyW');
  console.log(samples.map(s => `${s.px},${s.pz} dt=${s.dt} W=${s.keyW} ${s.cur}`).join('\n'));
  await b.close();
})().catch(e => { console.log('crash ' + e.message); process.exit(2); });
