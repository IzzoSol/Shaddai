const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppo'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
  await p.goto('http://localhost:8123/_office3.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await p.screenshot({ path: path.resolve(__dirname, '_office3_shot.png') });
  await b.close(); console.log('office shot saved');
})().catch(e => { console.error(e.message); process.exit(1); });
