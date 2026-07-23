const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppwc'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1050, height: 950, deviceScaleFactor: 2 });
  const url = 'file:///' + path.resolve(__dirname, '_ward-C.html').split(path.sep).join('/');
  await p.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  await p.screenshot({ path: path.resolve(__dirname, '_wardC_full.png'), fullPage: true });
  // zoom the two hoodie cells: Nike Hoodie (top-left) and Hoodie Up (row2 col3)
  await p.screenshot({ path: path.resolve(__dirname, '_wardC_hoodies.png'), clip: { x: 30, y: 150, width: 300, height: 260 } });
  await b.close(); console.log('done');
})().catch(e => { console.error(e.message); process.exit(1); });
