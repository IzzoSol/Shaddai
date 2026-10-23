/* tools/_skin-probe.cjs — every SkinnedMesh in the running world: owner chain, skeleton bone count, undefined bones, max skinIndex, and
 * whether its bones are inside the scene graph (2026-10-23: the player's SHADDAI body renders as a gold spike / shard burst in the halls).
 * Boots, spawns as SHADDAI, dumps outdoors, enters NEXUS, dumps again. Read-only.  node tools/_skin-probe.cjs */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  const dump = (tag) => p.evaluate((tag) => {
    const S = window.__w3dDebug.scene, out = [];
    S.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const sk = o.skeleton, bones = sk ? sk.bones : [], und = bones.filter(x => !x).length;
      const si = o.geometry.attributes.skinIndex; let mx = -1; if (si) for (let i = 0; i < si.array.length; i++) if (si.array[i] > mx) mx = si.array[i];
      let inScene = 0; bones.forEach(bn => { if (!bn) return; let r = bn; while (r.parent) r = r.parent; if (r === S) inScene++; });
      const chain = []; for (let x = o; x && x !== S; x = x.parent) chain.push(x.name || x.type);
      if (mx >= bones.length || und || inScene < bones.length) out.push(tag + ' BAD ' + chain.reverse().join('>').slice(0, 140) + ' bones=' + bones.length + ' und=' + und + ' maxIdx=' + mx + ' bonesInScene=' + inScene + ' visible=' + o.visible);
    });
    return out.length ? out : [tag + ' all skinned meshes ok'];
  }, tag);
  (await dump('OUTDOOR')).forEach(l => console.log(l));
  await p.evaluate(() => window.__interiorsEnter && window.__interiorsEnter('NEXUS')); await sleep(12000);
  (await dump('NEXUS')).forEach(l => console.log(l));
  await b.close();
})().catch(e => { console.error('skin probe failed', e.message); process.exit(1); });
