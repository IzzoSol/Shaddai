// node tools/probe-ual.cjs 8790 -> UAL2 clips retargeted onto real agent bodies: frame grid screenshots + page errors
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const out = process.argv[3] || 'ual-probe';
const AGENTS = (process.argv[4] || 'quill,nexus,pikadon,zerox').split(',');
const SHOTS = [['A_TPose', 0.5], ['Sword_Regular_Combo', 0.35], ['Sword_Regular_Combo', 0.9], ['NinjaJump_Start', 0.3]];
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 640 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  p.on('console', (m) => { if (/ual|error/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  for (const a of AGENTS) {
    await p.goto(`http://localhost:${port}/ual-lab.html?agent=${a}&clip=A_TPose`, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.__ready !== undefined, { timeout: 90000 });
    await p.evaluate(() => { document.getElementById('ui').style.display = 'none'; document.getElementById('status').style.display = 'none'; });
    for (let i = 0; i < SHOTS.length; i++) {
      const [clip, t] = SHOTS[i];
      const ok = await p.evaluate((c, tt) => { const r = window.__play(c); window.__setTime(tt); return r; }, clip, t);
      await p.screenshot({ path: `${out}-${a}-${i}.png` });
      if (!ok) errs.push(`${a}: clip ${clip} missing`);
    }
  }
  console.log('ERR:', errs.join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
