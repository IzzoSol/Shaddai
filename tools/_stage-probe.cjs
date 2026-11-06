/* _stage-probe.cjs — run the rig stage in real Chrome (proper GL flags), report console + stats + a screenshot.
   node tools/_stage-probe.cjs <out.png> */
const puppeteer = require('puppeteer'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 900) { console.log('refused: low RAM ' + Math.round(os.freemem() / 1048576) + 'MB'); process.exit(3); }
  const out = process.argv[2] || 'stage-probe.png';
  const lines = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=1200'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
  p.on('console', m => lines.push(m.type() + ': ' + m.text().slice(0, 150)));
  p.on('pageerror', e => lines.push('PAGEERROR: ' + String(e.message).slice(0, 200)));
  await p.goto('http://localhost:3013/__stage.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(30000);   // real time: agents + dragon + vehicles
  const stats = await p.evaluate(() => {
    const S = window.__stage; if (!S) return { no: 'stage handle missing' };
    return { tri: S.renderer.info.render.triangles, calls: S.renderer.info.render.calls,
      entries: S.entries.length, dragon: !!S.dragon(), sceneKids: S.scene.children.length,
      dbg: document.getElementById('dbg').textContent, stats: document.getElementById('stats').textContent };
  }).catch(e => ({ err: String(e.message).slice(0, 150) }));
  await p.screenshot({ path: out });
  console.log('STATS ' + JSON.stringify(stats));
  console.log('LINES ' + JSON.stringify(lines.slice(0, 25)));
  await b.close();
})().catch(e => { console.log('crash ' + e.message); process.exit(2); });
