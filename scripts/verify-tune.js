const puppeteer = require('puppeteer');

// Seams (must match the HTML): MW=0.2255 WD=0.4555 DL=0.5455 LS=0.7745
// Pin points chosen inside each beat.
const SHOTS = [
  { name: 't-water',    p: 0.34,  note: 'water surface (mid water beat)' },
  { name: 't-water2',   p: 0.42,  note: 'water low skim (later water beat)' },
  { name: 't-grass',    p: 0.62,  note: 'grass/life beat' },
  { name: 't-pyramids', p: 0.865, note: 'pyramids hero/leap (sky beat)' },
];

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE ERROR: '+m.text()); });
  page.on('pageerror', e => errors.push('PAGE ERROR: '+e.message));

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil:'networkidle2', timeout:30000 });
  await new Promise(r=>setTimeout(r,1500));

  const glOk = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && c.getContext && c.getContext('webgl2'));
  });
  const fallbackShown = await page.evaluate(() => {
    const f = document.getElementById('fallback');
    return f && getComputedStyle(f).display !== 'none';
  });

  console.log('WebGL2 acquired:', glOk, '| fallback shown:', fallbackShown);

  for (const s of SHOTS) {
    await page.evaluate(v => { window.__forceP = v; }, s.p);
    await new Promise(r=>setTimeout(r, 900)); // let frames settle at pinned p
    const dbg = await page.evaluate(() => window.__DBG || null);
    await page.screenshot({ path: 'scripts/'+s.name+'.png' });
    console.log(`shot ${s.name} @ p=${s.p} (${s.note})  DBG=`, JSON.stringify(dbg));
  }

  console.log('\n--- ERRORS ('+errors.length+') ---');
  errors.forEach(e=>console.log(e));

  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch(e=>{ console.error('HARNESS FAIL', e); process.exit(3); });
