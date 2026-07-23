const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppp'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1180, height: 1400, deviceScaleFactor: 1 });
  await p.goto('http://localhost:8123/_presets.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: path.resolve(__dirname, '_presets_shot.png'), fullPage: true });
  await b.close(); console.log('presets shot saved');
})().catch(e => { console.error(e.message); process.exit(1); });
