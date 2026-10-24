/* tools/build-dist.cjs — boot bundles for public/SHADDAI-WORLD-3D.html (docs/SPEED-BRIEF-20261024.md, 2026-10-24).
 * The classic scripts listed inside <template id="boot-scripts"> are minified one by one (esbuild transform, no bundling, so globals and
 * load order are unchanged), concatenated in HTML order into N bundles and written to public/dist/boot-<i>.<hash>.js. The hash is taken from
 * the SOURCE files, so `--check` can tell a stale build without esbuild. Also cache-busts /world-main.js?v=<hash> (the extracted module).
 *   node tools/build-dist.cjs           rebuild (run after editing any boot script or world-main.js)
 *   node tools/build-dist.cjs --check   exit 1 if the bundles or world-main hash are stale
 * Runtime fallback: ?bundle=0 loads the original files one by one. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const PUB = path.join(__dirname, '..', 'public'), HTML = path.join(PUB, 'SHADDAI-WORLD-3D.html'), DIST = path.join(PUB, 'dist'), N = 3;
const CHECK = process.argv.includes('--check');
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

let html = fs.readFileSync(HTML, 'utf8');
const tpl = html.match(/<template id="boot-scripts">([\s\S]*?)<\/template>/);
if (!tpl) { console.error('no <template id="boot-scripts"> in the HTML'); process.exit(2); }
const srcs = [...tpl[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const files = srcs.map(s => path.join(PUB, s.split('?')[0]));
const raw = files.map(f => fs.readFileSync(f, 'utf8'));

// split into N chunks of similar size, keeping order
const total = raw.reduce((a, s) => a + s.length, 0), chunks = [[]]; let acc = 0;
raw.forEach((s, i) => { if (acc > (total / N) * chunks.length && chunks.length < N) chunks.push([]); chunks[chunks.length - 1].push(i); acc += s.length; });
const names = chunks.map((c, k) => '/dist/boot-' + (k + 1) + '.' + sha(c.map(i => srcs[i] + '\n' + raw[i]).join('\n')) + '.js');
const mainHash = sha(fs.readFileSync(path.join(PUB, 'world-main.js'), 'utf8'));
const bundlesLine = 'window.__BOOT_BUNDLES = ' + JSON.stringify(names) + ';';

if (CHECK) {
  const ok = html.includes(bundlesLine) && names.every(n => fs.existsSync(path.join(PUB, n))) && html.includes('/world-main.js?v=' + mainHash + '"');
  console.log(ok ? 'dist up to date' : 'dist STALE - run node tools/build-dist.cjs'); process.exit(ok ? 0 : 1);
}

// esbuild is a dev tool only: installed once into a per-user cache, never into the repo's package.json
const TOOLS = path.join(require('os').homedir(), '.cache', 'w3d-build-tools');
let esbuild; try { esbuild = require(path.join(TOOLS, 'node_modules', 'esbuild')); } catch (e) {
  fs.mkdirSync(TOOLS, { recursive: true });
  execFileSync('npm', ['i', '--prefix', TOOLS, 'esbuild@0.24.2', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: process.platform === 'win32' });
  esbuild = require(path.join(TOOLS, 'node_modules', 'esbuild'));
}
const min = raw.map((s, i) => { try { return esbuild.transformSync(s, { minify: true, charset: 'utf8', logLevel: 'error' }).code; } catch (e) { console.error('minify failed', srcs[i], e.message); process.exit(1); } });
fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) if (/^boot-\d+\.[0-9a-f]+\.js$/.test(f)) fs.unlinkSync(path.join(DIST, f));
chunks.forEach((c, k) => {
  const body = c.map(i => '/* @src ' + srcs[i] + ' */\n' + min[i]).join('\n;\n');
  fs.writeFileSync(path.join(PUB, names[k]), body);
  console.log(names[k], c.length + ' files', (body.length / 1024).toFixed(0) + ' KB (src ' + (c.reduce((a, i) => a + raw[i].length, 0) / 1024).toFixed(0) + ' KB)');
});
html = html.replace(/window\.__BOOT_BUNDLES = \[[^\]]*\];/, bundlesLine).replace(/\/world-main\.js\?v=[0-9a-z]+"/, '/world-main.js?v=' + mainHash + '"');
fs.writeFileSync(HTML, html);
console.log('world-main.js ?v=' + mainHash, '| html', (html.length / 1024).toFixed(0) + ' KB');
