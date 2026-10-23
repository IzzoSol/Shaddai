/* tools/_agents-probe.cjs — the 7 council agents as playable bodies (2026-10-23): for each, setPlayerCharacter(code), then check the body is a
 * SkinnedMesh with a mixer, list its clips, and fire attack1 / heavy / combo / kick. Also counts dragons + their material tints, realm roads,
 * spur stop and realm-heart towns. Headless.  node tools/_agents-probe.cjs */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 }); const errs = [];
  p.on('pageerror', e => errs.push((e.message || '').slice(0, 160)));
  p.on('console', m => { const t = m.text(); if (/realm-roads|realm-dress\]|dragons\]/.test(t)) console.log('  console:', t.slice(0, 300)); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&unlockall', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(6000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  for (const code of ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON']) {
    await p.evaluate(c => window.setPlayerCharacter(c), code); await sleep(9000);
    const r = await p.evaluate(() => { const D = window.__w3dDebug, A = D.playerAnim && D.playerAnim(); let skinned = 0, bones = 0; const av = D.playerAvatar || (D.scene && D.scene.getObjectByName('playerAvatar'));
      (D.scene).traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones.length === 24) { skinned++; bones = o.skeleton.bones.length; } });
      const fired = A ? ['attack1', 'heavy', 'combo', 'kick', 'block', 'roll'].map(n => n + ':' + (A.once(n) ? 'ok' : 'no')) : [];
      return { mixer: A && A.mixer, clips: A ? A.clips.length : 0, skinned24: skinned, fired: fired.join(' ') }; });
    console.log(code.padEnd(8), JSON.stringify(r));
  }
  const w = await p.evaluate(() => { const D = window.__dragons, RR = window.__realmRoads, T = window.__worldTransitApi, RD = window.__realmDress;
    const tints = []; const g = D && D.group || (window.__w3dDebug.scene.getObjectByName('world-dragons')); if (g) g.traverse(o => { if (o.isSkinnedMesh && o.material && o.material.color) tints.push(o.material.color.getHexString()); });
    return { dragonTints: [...new Set(tints)].slice(0, 10), roads: RR && RR.stats, starcityStop: !!(T && T.stations.find(s => s.id === 'starcity')), towns2: RD && RD.stats && RD.stats.towns2, dressMissing: RD && RD.stats && RD.stats.missing }; });
  console.log('world', JSON.stringify(w));
  console.log('pageerrors', errs.length, errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
