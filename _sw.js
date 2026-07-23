const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppw'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1050, height: 950, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8123/_wardrobe.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  await p.screenshot({ path: path.resolve(__dirname, '_wardrobe_shot.png'), fullPage: true });
  await b.close(); console.log('wardrobe shot saved');
})().catch(e => { console.error(e.message); process.exit(1); });
