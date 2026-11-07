// node tools/tests/world-navi-polish.test.cjs — Navi UI regressions (2026-10-15): dock wraps over ALL modules, every module has a
// line icon (no emoji), unwired slots are hidden (no "SOON" dead buttons), font is the loaded HUD face.
const fs = require('fs'), path = require('path'), assert = require('assert');
const s = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-navi.js'), 'utf8');
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const mods = [...s.slice(s.indexOf('var MODULES = ['), s.indexOf('];', s.indexOf('var MODULES = ['))).matchAll(/id: '(\w+)'/g)].map(m => m[1]);
t('dock wraps by MODULES.length (not a hard-coded count)', () => { assert(!/% 12\b/.test(s)); assert(/MODULES\[\(\(i \+ d\) % NM \+ NM\) % NM\]/.test(s)); });
t('every module has a line icon', () => { const ic = s.slice(s.indexOf('var IC = {'), s.indexOf('function icon(')); mods.forEach(m => assert(ic.includes(' ' + m + ": '<"), 'no icon for ' + m)); assert(mods.length >= 13 && !mods.includes('signals'), 'signals is off the ring for now (owner 2026-10-16)'); });
t('nodes and dock render icon(), not the emoji field', () => { assert(!/m\.ic \+/.test(s)); });
t('no SOON placeholder text', () => assert(!/SOON/.test(s)));
t('font is the HUD-loaded Chakra Petch', () => { assert(/font-family:"Chakra Petch"/.test(s)); assert(!/Rajdhani,sans-serif/.test(s)); });
// 2026-11-06 Navi polish: no demo bots/items, no made-up class/job coords, distinct icons, blur gated to HIGH, nodes scale with the ring.
t('no demo bots or demo inventory seed state', () => { assert(!/AEGIS-7|NYX-3|ORACLE-9|Astral Sentinel|revenue: 412/.test(s)); assert(/bots: \[\]/.test(s) && /inventory: \[\]/.test(s)); });
t('core label reads the real bot system', () => assert(/elCore\.textContent = activeBotName\(\)/.test(s)));
t('no made-up academy/job coordinates', () => { assert(!/x: 200, z: 200|x: -200, z: 300|x: 500, z: -400/.test(s)); assert(/HALL_CLASSES/.test(s) && !/fetch\([^)]*academy\/catalog/.test(s), 'Navi lists the class hall classes, not the API-provider catalog'); });
t('every ring module has its own icon', () => { const ic = s.slice(s.indexOf('var IC = {'), s.indexOf('function icon(')); const bodies = mods.map(m => (ic.match(new RegExp(' ' + m + ": '([^']+)'")) || [])[1]); assert.strictEqual(new Set(bodies).size, mods.length, 'two modules share an icon'); });
t('plate blur only on the HIGH tier', () => { assert(!/#navi \.plate\{backdrop-filter/.test(s)); assert(/#navi\.hq \.plate\{backdrop-filter/.test(s) && /classList\.toggle\('hq'/.test(s)); });
t('ring nodes scale with the ring (no fixed 64px)', () => { assert(!/\.node\{position:absolute;width:64px/.test(s)); assert(/--nd:clamp\(/.test(s)); });
t('academy code countdown ticks while open', () => assert(/nvCodeLeft/.test(s) && /setInterval\(function \(\) \{   \/\/ ACADEMY code/.test(s)));
t('no made-up shop listings', () => { assert(!/seller: (orion|lira|nova)|Stardust Trail|Aureate Strider/.test(s)); assert(/var LISTINGS = \[\];/.test(s)); });
console.log(`${pass} passed, 0 failed`);
