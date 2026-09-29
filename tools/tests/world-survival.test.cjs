// node tools/tests/world-survival.test.cjs — respawn spots, save-at-rest-point, dive + breath + drowning -> death -> respawn
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const store = {}; const els = {};
const mk = () => ({ style: {}, appendChild() {}, firstChild: { style: {} }, set innerHTML(v) {}, set textContent(v) { this._t = v; } });
const win = { __w3dDebug: { playerPos: { x: 500, y: 0, z: 500 } }, WORLD_LAYOUT: { stations: [{ id: 'bazaar', pos: [-100, 100] }] }, __playerHP: 100 };
const ctx = { window: win, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  document: { createElement: mk, body: { appendChild() {} }, getElementById: () => null }, setTimeout: (f) => { win.__later = f; }, console };
win.window = win; vm.createContext(Object.assign(ctx, win, { window: win }));
vm.runInContext(fs.readFileSync('public/world-survival.js', 'utf8'), Object.assign(ctx, {}));
const WS = ctx.window.WorldSurvival || win.WorldSurvival; assert(WS, 'module loaded');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('default respawn is the Bazaar (middle of Shaddai City)', () => { assert.strictEqual(WS.active().id, 'bazaar'); WS.respawn(); assert.deepStrictEqual([win.__w3dDebug.playerPos.x, win.__w3dDebug.playerPos.z], [-100, 100]); });
t('cannot save a spot away from a rest point', () => { win.__w3dDebug.playerPos.x = 500; assert.strictEqual(WS.saveHere(), null); });
t('rest points save; auto picks home > plot > office > bed > bazaar', () => {
  win.__w3dDebug.playerPos.x = 500; win.__w3dDebug.playerPos.z = 500;
  WS.registerRestPoint({ id: 'bed1', kind: 'realm-bed', name: 'Sand bed pod', x: 500, z: 500, r: 6 }); WS.saveHere();
  assert.strictEqual(WS.active().id, 'bed1');
  win.__w3dDebug.playerPos.x = 540; WS.registerRestPoint({ id: 'home1', kind: 'home', name: 'My home', x: 540, z: 500, r: 6 }); WS.saveHere();
  assert.strictEqual(WS.active().id, 'home1'); WS.setActive('bed1'); assert.strictEqual(WS.active().id, 'bed1'); assert.strictEqual(WS.isAuto(), false);
  WS.setActive('auto'); assert.strictEqual(WS.active().id, 'home1');
});
t('death respawns at the chosen spot with full HP', () => {
  win.__w3dDebug.playerPos.x = 1; win.__playerHP = 0; WS.die('dragon'); assert.strictEqual(WS.state.dead, true); win.__later(); assert.strictEqual(WS.state.dead, false);
  assert.deepStrictEqual([win.__w3dDebug.playerPos.x, win.__w3dDebug.playerPos.z], [540, 500]); assert.strictEqual(win.__playerHP, 100);
});
t('diving below the surface drains breath; at 0 you drown', () => {
  const c = { swimming: true, waterY: 0, floorY: -60, U: 3.89, wantDive: true, wantUp: false }; let off = 0;
  for (let i = 0; i < 120; i++) off = WS.diveOffset(1 / 60, c); assert(off > 0.9 * 3.89 && WS.state.underwater, 'submerged after 2 s: ' + off);
  const b0 = WS.state.breath; for (let i = 0; i < 600; i++) WS.diveOffset(1 / 60, c); assert(WS.state.breath < b0, 'breath drains');
  for (let i = 0; i < 60 * 40 && !WS.state.dead; i++) WS.diveOffset(1 / 60, c); assert(WS.state.dead, 'drowned after breath ran out');
  win.__later();
});
t('never dives through the seabed; surfacing refills breath', () => {
  const c = { swimming: true, waterY: 0, floorY: -8, U: 3.89, wantDive: true, wantUp: false }; let off = 0; for (let i = 0; i < 300; i++) off = WS.diveOffset(1 / 60, c);
  assert(off <= (8 - 0) - 1.3 * 3.89 + 0.01 || off <= 8 * 3.89, 'clamped above the floor: ' + off);
  c.wantDive = false; c.wantUp = true; for (let i = 0; i < 300; i++) WS.diveOffset(1 / 60, c); assert(!WS.state.underwater && WS.state.breath > 0.6, 'breath back: ' + WS.state.breath);
});
console.log(pass + ' passed'); 
