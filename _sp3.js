const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/pp3'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1180, height: 1400, deviceScaleFactor: 4 });
  await p.goto('http://localhost:8123/_presets.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: path.resolve(__dirname, '_head_zoom.png'), clip: { x: 8, y: 48, width: 240, height: 120 } });
  await b.close(); console.log('head zoom saved');
})().catch(e => { console.error(e.message); process.exit(1); });
