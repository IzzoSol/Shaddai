/* tools/_export-track.cjs — dump a race circuit's deck frames (centreline, tangent, side, normal, bank, ground) to JSON for Blender.
 *   cd public && python -m http.server 3013 ; node tools/_export-track.cjs [circuit] [out.json] */
const puppeteer = require('puppeteer'), fs = require('fs'), sleep = ms => new Promise(r => setTimeout(r, ms));
const cid = process.argv[2] || 'quarter-loop', out = process.argv[3] || 'docs/track-' + cid + '.json';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 450 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=' + (cid === 'meridian-8b' ? 'meridian-8,meridian-8b' : cid) + '&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(c => !!(window.__raceTracks && window.__raceTracks[c]), cid).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log('track never built'); await b.close(); process.exit(1); }
  const d = await p.evaluate(c => { const t = window.__raceTracks[c], U = 7 / 1.8, r = v => +(v / U).toFixed(2), q = v => +v.toFixed(4);
    return { circuit: c, lengthM: t.lengthM, pads: t.pads, frames: t.frames.map(f => ({ p: [r(f.P.x), r(f.P.y), r(f.P.z)], s: [q(f.S.x), q(f.S.y), q(f.S.z)], bank: q(f.bank), g: r(f.g) })) }; }, cid);
  fs.writeFileSync(out, JSON.stringify(d)); console.log('wrote', out, d.frames.length, 'frames', Math.round(d.lengthM), 'm');
  await b.close();
})();
