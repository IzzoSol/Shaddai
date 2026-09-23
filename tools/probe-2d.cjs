// node tools/probe-2d.cjs 8790 -> game.html boots clean + fishing bite window works headlessly
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 620 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 130)));
  await p.goto(`http://localhost:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.evaluate(() => { try { sessionStorage.setItem('shd_guest','1'); localStorage.setItem('shaddai.region','beach'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(9000);
  const r = await p.evaluate(() => {
    const okState = typeof state !== 'undefined' ? state : '?';
    const hasReel = typeof reelFish === 'function';
    const hasBite = typeof fishingBite !== 'undefined';
    // simulate a full cast->bite->reel cycle synchronously to prove the chain
    let chain = null;
    try {
      fishingActive = false; fishingBite = false; fishCooldown = 0;
      if (typeof isNearWater === 'function' && isNearWater()) {
        inv.rod = 1;
        castFish();
        const cast = fishingActive === true;
        clearTimeout(fishTimer); fishingActive = false; fishingBite = true;   // force the bite
        reelFish();
        chain = { cast, reeled: fishingBite === false && fishCooldown > 0 };
      } else chain = { noWater: true };
    } catch (e) { chain = { err: String(e).slice(0, 80) }; }
    return { state: okState, hasReel, hasBite, chain };
  });
  console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close(); process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
