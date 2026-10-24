/* tools/boot-dist-guard.cjs — shared by tools/build-dist.cjs and the servers (2026-10-24). plan() works out the boot bundle names from the
 * SOURCE files (line endings normalised, so Windows CRLF and Linux LF checkouts agree). worldHtml() returns SHADDAI-WORLD-3D.html with
 * window.__BOOT_BUNDLES emptied when the bundles are stale or missing, so the page falls back to the original script files: a forgotten
 * rebuild costs load speed, never correctness (no old code is ever served). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PUB = path.join(__dirname, '..', 'public'), HTML = path.join(PUB, 'SHADDAI-WORLD-3D.html'), N = 3;
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

function plan(html) {
  html = html || read(HTML);
  const tpl = html.match(/<template id="boot-scripts">([\s\S]*?)<\/template>/);
  if (!tpl) return null;
  const srcs = [...tpl[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const files = srcs.map(s => path.join(PUB, s.split('?')[0])), raw = files.map(read);
  const total = raw.reduce((a, s) => a + s.length, 0), chunks = [[]]; let acc = 0;   /* N chunks of similar size, order kept */
  raw.forEach((s, i) => { if (acc > (total / N) * chunks.length && chunks.length < N) chunks.push([]); chunks[chunks.length - 1].push(i); acc += s.length; });
  const names = chunks.map((c, k) => '/dist/boot-' + (k + 1) + '.' + sha(c.map(i => srcs[i] + '\n' + raw[i]).join('\n')) + '.js');
  const mainHash = sha(read(path.join(PUB, 'world-main.js')));
  return { html, srcs, files, raw, chunks, names, mainHash, bundlesLine: 'window.__BOOT_BUNDLES = ' + JSON.stringify(names) + ';' };
}
function fresh(P) { return !!P && P.html.includes(P.bundlesLine) && P.names.every(n => fs.existsSync(path.join(PUB, n))); }

let cache = null, cacheT = 0;
function worldHtml() {
  if (cache && Date.now() - cacheT < 5000) return cache;
  const html = fs.readFileSync(HTML, 'utf8'); let P = null; try { P = plan(html.replace(/\r\n/g, '\n')); } catch (e) { P = null; }
  cache = fresh(P) ? html : html.replace(/window\.__BOOT_BUNDLES = \[[^\]]*\];/, 'window.__BOOT_BUNDLES = [];   /* stale build: original files */');
  if (cache !== html) autoBuild();
  cacheT = Date.now(); return cache;
}
/* no manual rebuild step: a stale build triggers tools/build-dist.cjs in the background (at most once per 10 min); the next page load after
 * it finishes gets the fresh bundles. Until then the original scripts are served. */
let building = false, lastBuild = 0;
function autoBuild() {
  if (building || Date.now() - lastBuild < 600000) return; building = true; lastBuild = Date.now();
  console.warn('[boot-dist] bundles stale - serving original scripts and rebuilding in the background');
  try {
    require('child_process').spawn(process.execPath, [path.join(__dirname, 'build-dist.cjs')], { stdio: 'ignore', windowsHide: true })
      .on('exit', function (code) { building = false; cache = null; console.warn('[boot-dist] rebuild ' + (code === 0 ? 'done' : 'failed (' + code + ')')); })
      .on('error', function () { building = false; });
  } catch (e) { building = false; }
}
module.exports = { plan, fresh, worldHtml, PUB, HTML };
