/* tools/_qa.cjs — VISUAL QUALITY GATE: take a fixed shot list, compare against the blessed baseline, flag regressions.
 *   node tools/_qa.cjs run [label]      take every shot in tools/qa/shots.json into C:/Users/Brittany/eye/qa/<label>/ (default label = short git sha)
 *                                       refuses to start if free RAM < QA_MIN_MB (default 1300) — one heavy job at a time, close Blender/Chrome first
 *   node tools/_qa.cjs compare [label]  diff <label> against baseline/: per-image mean difference + a side-by-side sheet (baseline | current) for review
 *   node tools/_qa.cjs bless [label]    promote <label> to the baseline (ONLY after you looked at the compare sheet)
 *   node tools/_qa.cjs list             show the shot list and what exists
 * Needs the static server: (cd public && python -m http.server 3013).  Shots reuse tools/_eye.cjs modes, so they match what we look at by hand. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..'), QA = process.env.QA_DIR || 'C:/Users/Brittany/eye/qa', EYE = 'C:/Users/Brittany/eye', SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa', 'shots.json'), 'utf8'));
const [cmd = 'list', arg] = process.argv.slice(2);
const sha = () => spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const dir = l => path.join(QA, l);
async function run(label) {
  const need = +(process.env.QA_MIN_MB || 1300), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log('REFUSING: ' + free + ' MB free < ' + need + ' MB needed. Close Blender/Chrome (or set QA_MIN_MB to override) and retry.'); process.exit(3); }
  fs.mkdirSync(dir(label), { recursive: true });
  for (const g of SHOTS.groups) {
    console.log('== ' + g.name + ' (' + g.args.join(' ') + ')');
    const r = spawnSync('node', ['tools/_eye.cjs', ...g.args], { cwd: ROOT, encoding: 'utf8', timeout: 25 * 60 * 1000, env: Object.assign({}, process.env, { EYE_W: '900', EYE_H: '520' }, g.env || {}) });
    console.log((r.stdout || '').split('\n').filter(l => /shot|ERRS/.test(l)).join('\n'));
    for (const f of g.files) { const src = path.join(EYE, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir(label), f)); else console.log('MISSING ' + f); }
  }
  console.log('saved ' + dir(label));
}
async function small(p) { return sharp(p).resize(320, 180, { fit: 'fill' }).removeAlpha().raw().toBuffer(); }
async function compare(label) {
  const base = dir('baseline'), cur = dir(label), rows = [], out = [];
  if (!fs.existsSync(base)) { console.log('no baseline yet — review ' + cur + ' by eye, then: node tools/_qa.cjs bless ' + label); return; }
  for (const f of fs.readdirSync(cur).filter(x => x.endsWith('.png'))) {
    const bp = path.join(base, f), cp = path.join(cur, f);
    if (!fs.existsSync(bp)) { rows.push({ f, diff: null, note: 'NEW (no baseline)' }); continue; }
    const a = await small(bp), b = await small(cp); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); const d = s / a.length / 255;
    rows.push({ f, diff: d, note: d > 0.12 ? 'CHANGED A LOT - look' : d > 0.04 ? 'changed - look' : 'same' });
    if (d > 0.04) out.push({ f, bp, cp });
  }
  rows.sort((x, y) => (y.diff || 1) - (x.diff || 1)); rows.forEach(r => console.log((r.diff == null ? ' new ' : (r.diff * 100).toFixed(1).padStart(5) + '%') + '  ' + r.f + '  ' + r.note));
  for (const o of out.slice(0, 8)) {   // side-by-side: baseline | current
    const w = 720, h = 405, A = await sharp(o.bp).resize(w, h, { fit: 'fill' }).toBuffer(), Bc = await sharp(o.cp).resize(w, h, { fit: 'fill' }).toBuffer();
    const sheet = path.join(cur, 'compare-' + o.f); await sharp({ create: { width: w * 2 + 8, height: h, channels: 3, background: '#ff00aa' } }).composite([{ input: A, left: 0, top: 0 }, { input: Bc, left: w + 8, top: 0 }]).png().toFile(sheet); console.log('sheet ' + sheet + '   (left = baseline, right = current)');
  }
}
(async () => {
  const label = arg || sha();
  if (cmd === 'run') await run(label);
  else if (cmd === 'compare') await compare(label);
  else if (cmd === 'bless') { const b = dir('baseline'); fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(dir(label)).filter(x => x.endsWith('.png') && !x.startsWith('compare-'))) fs.copyFileSync(path.join(dir(label), f), path.join(b, f)); console.log('baseline updated from ' + label); }
  else { SHOTS.groups.forEach(g => console.log(g.name + ': ' + g.files.join(', '))); console.log('runs: ' + (fs.existsSync(QA) ? fs.readdirSync(QA).join(', ') : '(none)')); }
})();
