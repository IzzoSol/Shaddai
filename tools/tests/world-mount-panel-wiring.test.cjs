// node tools/tests/world-mount-panel-wiring.test.cjs — static wiring audit of the I panel (world-mount-ride.js):
// every data-a action the panel emits has a click handler, every module the handlers open exports that entry point,
// and every Colosseum floor the panel offers is supported by the arena.
const fs = require('fs'), path = require('path'), assert = require('assert');
const P = f => fs.readFileSync(path.join(__dirname, '..', '..', 'public', f), 'utf8');
const src = P('world-mount-ride.js');
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };

const emitted = new Set();
for (const m of src.matchAll(/data-a="([a-z0-9]+)"/g)) emitted.add(m[1]);
for (const m of src.matchAll(/data-a="' \+ \(own \? '(\w+)' : '(\w+)'\)/g)) { emitted.add(m[1]); emitted.add(m[2]); }
const handled = new Set([...src.matchAll(/a === '([a-z0-9]+)'/g)].map(m => m[1]));

t('every emitted panel action has a handler', () => {
  const missing = [...emitted].filter(a => !handled.has(a));
  assert.deepStrictEqual(missing, [], 'unhandled: ' + missing.join(','));
  assert(emitted.size >= 19, 'panel lost buttons: ' + emitted.size);
});
t('every module the panel opens exports its entry point', () => {
  const need = { 'world-arcade.js': /open\s*:/, 'world-gear.js': /open\s*:/, 'world-quests.js': /open\s*:/, 'world-farm.js': /open\s*:/,
    'world-offices.js': /open\s*:/, 'world-race-select.js': /open\s*:/, 'world-agents-ui.js': /open\s*:/, 'world-bots.js': /buy\s*:[\s\S]*call\s*:|call\s*:[\s\S]*buy\s*:/,
    'world-mounts.js': /buy\s*:/, 'world-race-challenge.js': /openBuilder:\s*openBuilder,\s*openBoard:\s*openBoard/ };
  for (const [f, re] of Object.entries(need)) assert(re.test(P(f)), f + ' is missing its entry point');
});
t('host defines the globals the panel calls (__rideBoard, __skateJam, __naval, __raceChallenge, __travel.*)', () => {
  const h = P('SHADDAI-WORLD-3D.html') + '\n' + P('world-main.js');   // 2026-11-05: the inline module was extracted to world-main.js (SPEED-BRIEF phase 3)
  for (const g of ['window.__rideBoard =', 'window.__skateJam =', 'window.__naval =', 'window.__raceChallenge =', 'window.__travel = {'])
    assert(h.includes(g), 'missing ' + g);
  for (const k of ['maglev:', 'park:', 'colosseum:', 'colospot:', 'field:', 'grid:']) assert(new RegExp('\\n  ' + k).test(h), '__travel.' + k + ' missing');
});
t('every arena floor button is a mode the arena supports', () => {
  const offered = (src.match(/\['sand', 'water', 'lava', 'void', 'grass', 'ice'\]/) || [''])[0];
  assert(offered, 'floor list changed - update this test');
  const arena = P('world-colosseum.js');
  for (const f of ['sand', 'water', 'lava', 'void', 'grass', 'ice']) assert(arena.includes("'" + f + "'"), 'arena lacks ' + f);
});
console.log(`${pass} passed, 0 failed`);
