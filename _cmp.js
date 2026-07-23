const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: require('os').tmpdir()+'/ppcmp'+Date.now(), args: ['--no-sandbox'] });
  for (const v of ['A','B','C']) {
    const p = await b.newPage();
    await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
    const url = 'file:///' + path.resolve(__dirname, '_ward-'+v+'.html').split(path.sep).join('/');
    try {
      await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1400));
      await p.screenshot({ path: path.resolve(__dirname, '_cmp-'+v+'.png'), clip: { x: 20, y: 90, width: 760, height: 210 } });
      console.log(v + ' ok');
    } catch (e) { console.log(v + ' FAIL ' + e.message); }
    await p.close();
  }
  await b.close(); console.log('done');
})().catch(e => { console.error(e.message); process.exit(1); });
