// node tools/probe-arcade.cjs 8790 -> arcade score bridge: fee charged, one capped payout per paid entry, only from the game frame
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
  await p.evaluate(() => { try { sessionStorage.setItem('shd_guest','1'); localStorage.setItem('shd.sparks3d','100'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const out = {};
  out.start = await p.evaluate(() => shdSparks.get());
  // spoof from the top window (not the game frame) -> must be ignored
  await p.evaluate(() => { playArcade('sigil'); window.postMessage({type:'shaddai-game-score', game:'sigil-storm', score:999999, win:true}, '*'); });
  await sleep(600);
  out.afterFeeAndSpoof = await p.evaluate(() => shdSparks.get());          // expect 90
  await sleep(3000);
  const fr = p.frames().find((f) => /sigil-storm/.test(f.url()));
  out.frameFound = !!fr;
  if (fr) {
    await fr.evaluate(() => { parent.postMessage({type:'shaddai-game-score', game:'sigil-storm', score:999999, win:true}, '*'); parent.postMessage({type:'shaddai-game-score', game:'sigil-storm', score:999999, win:true}, '*'); });
    await sleep(600);
  }
  out.afterPayout = await p.evaluate(() => shdSparks.get());               // expect 90 + cap 30 = 120 (second post ignored)
  out.units = await p.evaluate(() => [arcadePayout('basketball', 3, false), arcadePayout('basketball', 12, true), arcadePayout('dodgeball', 0, true), arcadePayout('skate', 0, false)]); // [6,24,20,0]
  const pass = out.afterFeeAndSpoof === 90 && out.afterPayout === 120 && JSON.stringify(out.units) === '[6,24,20,0]';
  console.log(JSON.stringify(out));
  console.log(pass ? 'PASS' : 'FAIL');
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
