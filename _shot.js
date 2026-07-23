const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', userDataDir: require('os').tmpdir()+'/pp'+Date.now(), args: ['--no-sandbox']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1240, height: 620, deviceScaleFactor: 2 });
  const file = path.resolve(__dirname, 'public', '_pixel-spike.html');
  const url = 'file:///' + file.split(path.sep).join('/') + '?inspect';
  await p.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.resolve(__dirname, '_spike_shot.png') });
  // zoomed crop of the first two characters to inspect limb attachment
  await p.evaluate(() => {
    const c = document.getElementById('c');
    const z = document.createElement('canvas'); z.width = 520; z.height = 460;
    z.id = 'zoom'; z.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#0d1017';
    const g = z.getContext('2d'); g.imageSmoothingEnabled = false;
    // source region around the hero row (css px → device px handled by drawImage on the canvas bitmap)
    // inspect mode: character centered at OX=CSSW/2, feet ~ y=238css; grab a tight column
    const bw = c.width;             // bitmap width (css*DPR)
    const cxb = bw * 0.5;
    g.drawImage(c, cxb - 130, 240, 260, 300, 0, 0, 400, 462);
    document.body.appendChild(z);
  });
  await p.screenshot({ path: path.resolve(__dirname, '_spike_zoom.png'), clip: { x:0, y:0, width:520, height:460 } });
  await b.close();
  console.log('shot saved -> _spike_shot.png');
})().catch(e => { console.error(e.message); process.exit(1); });
