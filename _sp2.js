const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppz'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1180, height: 1400, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8123/_presets.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  // top-left people block
  await p.screenshot({ path: path.resolve(__dirname, '_presets_zoomA.png'), clip: { x: 20, y: 70, width: 500, height: 330 } });
  // robot rows (bottom of the grid)
  const dims = await p.evaluate(() => ({ h: document.body.scrollHeight }));
  await p.screenshot({ path: path.resolve(__dirname, '_presets_zoomB.png'), clip: { x: 20, y: Math.max(0, dims.h - 300), width: 700, height: 260 } });
  await b.close(); console.log('zoom saved, page h=' + dims.h);
})().catch(e => { console.error(e.message); process.exit(1); });
