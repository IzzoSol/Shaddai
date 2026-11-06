// node tools/tests/world-hud-corner.test.cjs — bottom-right CORNER TRAY in world-hud-clean.js (2026-11-06, owner: corner buttons must hide).
// Runs the real file in a vm with a tiny fake DOM (no layout engine needed: each fake element carries its own rect + computed style).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-hud-clean.js'), 'utf8');
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };

function el(id, o) {
  o = o || {};
  return { id, tagName: o.tag || 'BUTTON', style: {}, children: [], attrs: {}, textContent: o.text || '',
    _cs: Object.assign({ position: 'fixed', display: 'block', visibility: 'visible', pointerEvents: 'auto', cursor: 'pointer' }, o.cs || {}),
    _r: o.r || { left: 1100, top: 700, width: 40, height: 30 },
    getBoundingClientRect() { return this._r; }, querySelector() { return null; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; } };
}
function boot(store) {
  const kids = [], timers = [];
  const body = { children: kids, appendChild(e) { kids.push(e); return e; } };
  const doc = { body, readyState: 'complete', getElementById: id => kids.find(k => k.id === id) || null,
    createElement: tag => el('', { tag: tag.toUpperCase() }),
    querySelectorAll: sel => { const m = /^\[([\w-]+)\]$/.exec(sel); return m ? kids.filter(k => k.hasAttribute(m[1])) : []; } };
  const win = { document: doc, innerWidth: 1200, innerHeight: 760, location: { search: '' },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    getComputedStyle: e => Object.assign({}, e._cs, e.style.visibility ? { visibility: e.style.visibility } : {}, e.style.display ? { display: e.style.display } : {}),
    addEventListener() { }, setInterval: (f) => { timers.push(f); }, setTimeout() { }, clearTimeout() { }, Date };
  win.window = win;
  vm.createContext(win); vm.runInContext(src, win);
  return { win, kids, tick: () => timers.forEach(f => f()) };
}

const store = {};
const W = boot(store);
const venue = el('portalPlaceMode'), shop = el('shopPill', { r: { left: 1080, top: 650, width: 90, height: 30 } });
const speedo = el('shipSpd', { tag: 'DIV', cs: { pointerEvents: 'none', cursor: 'auto' } });                 // read-out: never folded
const topRight = el('naviBtn', { r: { left: 1100, top: 96, width: 80, height: 30 } });
const leftBtn = el('leftThing', { r: { left: 20, top: 700, width: 40, height: 30 } });
const bigPanel = el('shopPanel', { tag: 'DIV', r: { left: 700, top: 420, width: 500, height: 340 } });       // an opened panel
[venue, shop, speedo, topRight, leftBtn, bigPanel].forEach(e => W.kids.push(e));
W.tick();
const tog = W.kids.find(k => k.id === 'shdCornerTog');

t('folded by default: corner buttons hidden', () => { assert.strictEqual(venue.style.visibility, 'hidden'); assert.strictEqual(shop.style.visibility, 'hidden'); });
t('read-outs, other corners and big panels are left alone', () => { [speedo, topRight, leftBtn, bigPanel].forEach(e => assert.notStrictEqual(e.style.visibility, 'hidden', e.id)); });
t('toggle exists and counts what it tucked away', () => { assert(tog); assert.strictEqual(tog.textContent, '▴ 2'); assert.strictEqual(tog.getAttribute('aria-expanded'), 'false'); });
t('toggle never folds itself', () => assert.notStrictEqual(tog.style.visibility, 'hidden'));
t('click shows them again (restores original visibility)', () => {
  tog.onclick({ stopPropagation() { } }); W.tick();
  assert.strictEqual(venue.style.visibility, ''); assert.strictEqual(shop.style.visibility, ''); assert(!venue.hasAttribute('data-shd-corner'));
  assert.strictEqual(tog.textContent, '▾'); assert.strictEqual(tog.getAttribute('aria-expanded'), 'true');
});
t('choice persists and shows in Navi SETTINGS labels', () => {
  assert.strictEqual(JSON.parse(store.shd_hud_prefs_v1).corner, true); assert(W.win.WorldHudPrefs.LABELS.corner);
});
t('folding again also catches buttons added later', () => {
  W.win.WorldHudPrefs.set('corner', false); const late = el('raceBtn'); W.kids.push(late); W.tick();
  assert.strictEqual(late.style.visibility, 'hidden'); assert.strictEqual(venue.style.visibility, 'hidden'); assert.strictEqual(tog.textContent, '▴ 3');
});
t('toggle hides itself when the corner is empty', () => {
  const W2 = boot({}); W2.tick(); const t2 = W2.kids.find(k => k.id === 'shdCornerTog'); assert.strictEqual(t2.style.display, 'none');
});
console.log(`${pass} passed, 0 failed`);
