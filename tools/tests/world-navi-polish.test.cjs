// node tools/tests/world-navi-polish.test.cjs — Navi UI regressions (2026-10-15): dock wraps over ALL modules, every module has a
// line icon (no emoji), unwired slots are hidden (no "SOON" dead buttons), font is the loaded HUD face.
const fs = require('fs'), path = require('path'), assert = require('assert');
const s = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-navi.js'), 'utf8');
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const mods = [...s.slice(s.indexOf('var MODULES = ['), s.indexOf('];', s.indexOf('var MODULES = ['))).matchAll(/id: '(\w+)'/g)].map(m => m[1]);
t('dock wraps by MODULES.length (not a hard-coded count)', () => { assert(!/% 12\b/.test(s)); assert(/MODULES\[\(\(i \+ d\) % NM \+ NM\) % NM\]/.test(s)); });
t('every module has a line icon', () => { const ic = s.slice(s.indexOf('var IC = {'), s.indexOf('function icon(')); mods.forEach(m => assert(ic.includes(' ' + m + ": '<"), 'no icon for ' + m)); assert(mods.length >= 14); });
t('nodes and dock render icon(), not the emoji field', () => { assert(!/m\.ic \+/.test(s)); });
t('no SOON placeholder text', () => assert(!/SOON/.test(s)));
t('font is the HUD-loaded Chakra Petch', () => { assert(/font-family:"Chakra Petch"/.test(s)); assert(!/Rajdhani,sans-serif/.test(s)); });
console.log(`${pass} passed, 0 failed`);
