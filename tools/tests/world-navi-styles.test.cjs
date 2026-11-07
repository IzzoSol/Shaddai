// node tools/tests/world-navi-styles.test.cjs — Navi styles (2026-11-07, owner: "different navi styles").
// Checks: 4 styles declared, each has CSS scoped to #navi[data-style=<id>], the root gets data-style at build, the choice is saved
// in localStorage 'shd_navi_style' (junk falls back to holo), Settings lists a "Navi style" row whose buttons call setStyle, API exported.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-navi.js'), 'utf8');
let pass = 0; const tests = []; const t = (n, fn) => tests.push([n, fn]);

// pull STYLES/getStyle/setStyle out and run them against a fake localStorage
const a = src.indexOf('  var STYLES = ['), b = src.indexOf('  var root,', a);
function load(stored) {
  const store = stored == null ? {} : { shd_navi_style: stored }, events = [];
  const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, THEME: { gold: '#F5A623' }, css: '', root: null, emit: e => events.push(e) };
  vm.createContext(ctx); vm.runInContext(src.slice(a, b).replace(/^  var /gm, 'var '), ctx);
  return { ctx, store, events };
}

t('four styles: holo (default), hex, clean, wrist', () => {
  const { ctx } = load(); assert.deepStrictEqual([...ctx.STYLES.map(s => s[0])], ['holo', 'hex', 'clean', 'wrist']); assert.strictEqual(ctx.getStyle(), 'holo');
});
t('every non-default style has its own scoped CSS', () => {
  const { ctx } = load(); ['hex', 'clean', 'wrist'].forEach(id => assert(ctx.css.includes('#navi[data-style=' + id + ']'), id));
});
t('saved choice is read back; junk falls back to holo', () => {
  assert.strictEqual(load('hex').ctx.getStyle(), 'hex'); assert.strictEqual(load('<script>').ctx.getStyle(), 'holo');
});
t('setStyle saves, updates the root attribute, emits; unknown is refused', () => {
  const { ctx, store, events } = load(); const attrs = {}; ctx.root = { setAttribute: (k, v) => { attrs[k] = v; } };
  assert.strictEqual(ctx.setStyle('clean'), true); assert.strictEqual(store.shd_navi_style, 'clean'); assert.strictEqual(attrs['data-style'], 'clean'); assert.deepStrictEqual(events, ['style']);
  assert.strictEqual(ctx.setStyle('evil'), false); assert.strictEqual(store.shd_navi_style, 'clean');
});
t('build sets data-style; Settings has the row + buttons; API exported', () => {
  assert(/root\.id = 'navi'; root\.setAttribute\('data-style', getStyle\(\)\)/.test(src));
  assert(/id: 'st-navistyle'/.test(src) && /data-a="style:' \+ s\[0\]/.test(src) && /\/\^style:\/\.test\(a\)\) \{ setStyle\(a\.slice\(6\)\)/.test(src));
  assert(/style: getStyle, setStyle: setStyle/.test(src));
});
t('world page loads the bumped Navi', () => { const h = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'SHADDAI-WORLD-3D.html'), 'utf8'); assert(h.includes('/world-navi.js?v=20261107a')); });

(async () => { for (const [n, fn] of tests) { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } }
  console.log(`world-navi-styles: ${pass} passed, ${tests.length - pass} failed`); })();
