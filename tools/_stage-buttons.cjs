/* _stage-buttons.cjs v2 — every button + keyboard, with state tracing.
   node tools/_stage-buttons.cjs */
const puppeteer = require('puppeteer'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 900) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=1200'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
  const R = [];
  const ev = (fn, ...args) => p.evaluate(fn, ...args);
  const t = (name, fn) => fn().then(v => R.push((v === true || v === 'true' ? 'PASS ' : 'FAIL ') + name + (typeof v === 'string' ? ' | ' + v : '')))
    .catch(e => R.push('FAIL ' + name + ' | EXC: ' + String(e.message).slice(0, 120)));
  await p.goto('http://localhost:3013/__stage.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(16000);

  // click every row2 move and verify the selected agent's clip switched
  const moves = await ev(() => [...document.querySelectorAll('#row2 button')].filter(x => !x.disabled).map(x => x.textContent));
  for (const mv of moves){
    await t('move ' + mv, async () => {
      const want = { IDLE: 'Idle_FoldArms_Loop', WALK: 'Walking', RUN: 'Running', SWORD: 'Sword_Regular_A', HEAVY: 'Sword_Heavy_Combo', FLIP: 'Backflip', ROLL: 'Roll', SIT: 'Sit_Chair_Loop', BLOCK: 'Sword_Block', HIT: 'Hit_Knockback', DOWN: 'Lie_Down' }[mv];
      await ev((m, w) => { const b2 = [...document.querySelectorAll('#row2 button')].find(x => x.textContent === m); b2.click();
        window.__want = w; }, mv, want);
      await sleep(500);
      return await ev(() => { const e = window.__stage.entries[0]; return (e.cur && e.cur.getClip().name === window.__want) || ('wanted ' + window.__want + ' got ' + (e.cur ? e.cur.getClip().name : 'none')); });
    });
  }

  await t('possess', async () => {
    await ev(() => { [...document.querySelectorAll('#row1 button')][3].click(); });
    await ev(() => { [...document.querySelectorAll('#row3 button')].find(x => x.textContent === 'BE SELECTED').click(); });
    await sleep(400);
    return await ev(() => { const s = window.__stage.state(); return s.possessed === 'TURTLE' || ('possessed=' + s.possessed); });
  });

  await t('keys reach page', async () => {
    await p.keyboard.down('KeyW'); await sleep(250);
    const k = await ev(() => window.__stage.keys.KeyW === true || ('keys.KeyW=' + window.__stage.keys.KeyW));
    await p.keyboard.up('KeyW');
    return k === true || ('keys.KeyW=' + k);
  });

  await t('WASD walk', async () => {
    const p0 = await ev(() => { const s = window.__stage.state(); return { x: s.px, z: s.pz }; });
    await p.keyboard.down('KeyW'); await sleep(1300); await p.keyboard.up('KeyW');
    const p1 = await ev(() => { const s = window.__stage.state(); return { x: s.px, z: s.pz, st: JSON.stringify(s) }; });
    const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    return d > 2 || ('moved ' + d.toFixed(2) + ' ' + p1.st);
  });

  await t('board mount (O)', async () => {
    await p.keyboard.press('KeyO'); await sleep(400);
    return await ev(() => window.__stage.state().riding === true || ('riding=' + window.__stage.state().riding));
  });
  await t('board ride (W)', async () => {
    const p0 = await ev(() => { const s = window.__stage.state(); return { x: s.px, z: s.pz, bk: s.BK.vel }; });
    await p.keyboard.down('KeyW'); await sleep(1500); await p.keyboard.up('KeyW');
    const p1 = await ev(() => { const s = window.__stage.state(); return { x: s.px, z: s.pz, bk: s.BK.vel }; });
    const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    return d > 4 || ('moved ' + d.toFixed(1) + ' vel ' + p0.bk.toFixed(1) + '->' + p1.bk.toFixed(1));
  });
  await t('board pop (Space)', async () => {
    await p.keyboard.down('Space'); await sleep(400); await p.keyboard.up('Space');
    const y = await ev(() => window.__stage.state().py + '|' + window.__stage.state().BK.y);
    return (parseFloat(y.split('|')[1]) > 0.5) || ('BK.y=' + y);
  });
  await t('dismount + exit (O, F)', async () => {
    await sleep(2200); await p.keyboard.press('KeyO'); await sleep(200); await p.keyboard.press('KeyF'); await sleep(300);
    return await ev(() => { const s = window.__stage.state(); return (!s.possessed && !s.riding) || JSON.stringify(s); });
  });

  await t('stage fight engages dragon', async () => {
    await ev(() => { [...document.querySelectorAll('#row3 button')].find(x => x.textContent.startsWith('STAGE FIGHT')).click(); });
    await sleep(14000);
    const r = await ev(() => { const D = window.__stage.dragon(), d = D.dragons[0];
      return d.state + '@' + Math.round(d.f.x) + ',' + Math.round(d.f.z) + ' hits=' + D.core.stats.hits; });
    return (r.split('@')[0] !== 'perch') || ('dragon: ' + r);
  });

  await p.screenshot({ path: path.join(process.env.TEMP || '.', 'opencode', 'stage-buttons.png') });
  console.log(R.join('\n'));
  await b.close();
})().catch(e => { console.log('crash ' + e.message); process.exit(2); });
