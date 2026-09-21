'use strict';
// Deterministic smoke test: load pixel-people.js with a stub 2D context and
// count actual drawing ops for PRESETS[0].rig at the create-screen draw call.
const fs = require('fs');
const src = fs.readFileSync('public/pixel-people.js', 'utf8');

const ops = [];
const noop = () => {};
const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'canvas') return {};
    ops.push(String(prop));
    return noop;
  },
  set() { return true; }
});

let PP = null;
try {
  // provide the globals pixel-people needs at module load
  const fakeWindow = {};
  const fakeDocument = {
    createElement: () => ({
      getContext: () => ctxStub,
      addEventListener: noop, style: {}, src: '',
    }),
  };
  global.window = fakeWindow;
  global.document = fakeDocument;
  global.Image = class { set src(v) { this._s = v; } get src() { return this._s; } };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  const fn = new Function('window', 'document', 'Image', 'fetch', src + '\n;return window;');
  fakeWindow.PixelPeople = undefined;
  const w = fn(fakeWindow, fakeDocument, global.Image, global.fetch);
  PP = w.PixelPeople;
  if (!PP) { console.log('FAIL: PixelPeople not exported'); process.exit(1); }
  if (!Array.isArray(PP.PRESETS) || PP.PRESETS.length === 0) { console.log('FAIL: no PRESETS'); process.exit(1); }
  console.log('OK PRESETS count:', PP.PRESETS.length);
  console.log('PRESETS[0] name:', PP.PRESETS[0].name);
  const rig = JSON.parse(JSON.stringify(PP.PRESETS[0].rig));
  console.log('rig.sprite:', rig.sprite === undefined ? 'unset' : rig.sprite);
  ops.length = 0;
  try {
    PP.draw(ctxStub, rig, 360, 258, 2.6, 1000);
    const draws = ops.filter(o => /fill|stroke|beginPath|drawImage|translate|scale|save|restore|ellipse|rect/.test(o)).length;
    console.log('draw() ops emitted:', draws, '| distinct:', [...new Set(ops)].join(','));
    console.log(draws > 8 ? 'PASS: voxel fallback emits geometry' : 'FAIL: draw produced no geometry');
  } catch (e) {
    console.log('THREW during draw:', e.message);
    process.exit(1);
  }
  // try the sprite path too (rig.sprite set to a known id) — should NOT throw when unloaded
  const rig2 = { ...rig, sprite: 'shaddai' };
  ops.length = 0;
  try {
    PP.draw(ctxStub, rig2, 360, 258, 2.6, 1000);
    console.log('sprite-set draw() ops:', ops.length, '| distinct:', [...new Set(ops)].join(','));
  } catch (e) {
    console.log('THREW during sprite draw:', e.message);
  }
} catch (e) {
  console.log('LOAD FAIL:', e.message);
  process.exit(1);
}