// node tools/probe-tactics.cjs 8790 -> verify the tactics engine boots + a fight launches + CT loop runs
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 140)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 45; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  await sleep(3000);
  const r1 = await p.evaluate(() => ({
    built: window.__worldBuilt,
    tacticsAPI: !!window.__worldTactics,
    actionsAPI: !!window.__worldActions || !!document.querySelector('div'),
  }));
  const r2 = await p.evaluate(() => {
    const T = window.__worldTactics;
    if (!T) return { launched: false };
    T.startFight({ entry: 50, pool: 0, tier: 0 });
    return { launched: true, visible: document.getElementById('shdTactics').style.display === 'block' };
  });
  await sleep(6000);   // let CT ticks fire + bot turns resolve
  const r3 = await p.evaluate(() => {
    const T = window.__worldTactics;
    const log = document.getElementById('tacLog');
    return {
      logHasCombat: log ? /→|MISS|moves|HEAL/.test(log.textContent) : false,
      logLines: log ? log.textContent.split('›').length : 0,
      turnText: document.getElementById('tacTurn') ? document.getElementById('tacTurn').textContent : null,
    };
  });
  console.log(JSON.stringify({ ...r1, ...r2, ...r3 }));
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await p.screenshot({ path: 'C:/Users/Brittany/Shaddai-3d/fal-assets/spike/tactics-battle.png' });
  await b.close(); process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
