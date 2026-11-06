/* _stage-clock.cjs — how many loop instances + dt budget per second? */
const puppeteer = require('puppeteer'), os = require('os');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 });
  await p.goto('http://localhost:3013/__stage.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(15000);
  // seed the counters
  await p.evaluate(() => { window.__loopInstances = 0; window.__dtSum = 0; window.__stage.rawDt = true; });
  const t0 = Date.now();
  await p.evaluate(() => { window.__loopInstances = 0; window.__dtSum = 0; });
  await sleep(3000);
  const r = await p.evaluate(() => ({ loops: window.__loopInstances, dtSum: +window.__lastDt, last: +window.__lastDt }));
  const inst = await p.evaluate(() => ({ loops: window.__loopInstances }));
  console.log('3s window: ' + JSON.stringify(inst) + ' lastDt=' + r.last);
  await b.close();
})().catch(e => { console.log('crash ' + e.message); process.exit(2); });
