const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppw2'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
  await p.goto('http://localhost:8123/_wardrobe.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // top row of 3 characters (heads + torsos)
  await p.screenshot({ path: path.resolve(__dirname, '_ward_heads.png'), clip: { x: 20, y: 70, width: 760, height: 230 } });
  await b.close(); console.log('ward heads saved');
})().catch(e => { console.error(e.message); process.exit(1); });
