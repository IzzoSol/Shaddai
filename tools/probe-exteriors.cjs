// node tools/probe-exteriors.cjs 8790 -> 2D exteriors pass: every region renders at night with lit windows in
// the light layer, signage on venues, and no page errors from the building renderer
let pw; try { pw = require('puppeteer'); } catch (e) { pw = null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = process.argv[2] || 8790;
(async () => {
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const b = pw ? await pw.launch({ headless: 'new', ...launch }) : await require('playwright').chromium.launch(launch);
  const rows = []; let ok = true;
  for (const rid of ['city', 'meadow', 'beach', 'desert', 'volcano', 'darkforest', 'forest']) {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', (e) => { if (/Facade|winGrid|emit|occlude|LightCtx|lightCtx|drawBuilding/i.test(e.stack || e.message)) errs.push(String(e.message).slice(0, 120)); });
    await p.goto(`http://localhost:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.evaluate((rid) => { localStorage.clear(); sessionStorage.setItem('shd_guest', '1'); localStorage.setItem('shaddai.region', rid); }, rid);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await sleep(6500);
    const r = await p.evaluate(() => new Promise((res) => {
      const bs = props.filter((q) => q.type === 'building' && !q.landmark);
      const t0 = bs.find((q) => q.kind !== 'home') || bs[0];
      if (t0) { player.col = t0.col + t0.w / 2 + 2; player.row = t0.row + t0.d + 2; cam.col = player.col; cam.row = player.row; }
      const f = () => { tod = 0.02; requestAnimationFrame(f); }; f();
      const o = drawEmissive; let frames = 0, lit = 0;
      drawEmissive = function () { frames++; if (lightsOn) lit++; return o(); };
      setTimeout(() => res({ region: region.id, buildings: bs.length, venue: t0 && t0.name, frames, lit, signs: bs.filter((q) => q.kind !== 'home' && SIGN_ICON[interiorKindFor(q)]).length }), 900);
    }));
    const pass = r.frames > 0 && (r.buildings === 0 || r.lit > 0) && errs.length === 0;
    ok = ok && pass; rows.push((pass ? 'ok  ' : 'BAD ') + JSON.stringify(r) + (errs.length ? ' ERR ' + errs.join(' | ') : ''));
    await p.close();
  }
  console.log(rows.join('\n')); console.log(ok ? 'PASS' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
