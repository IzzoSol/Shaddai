// node tools/tests/world-bot-frames.test.cjs — frame rules (owner 2026-11-05): no wheel bots in the Athenaeum or the Colosseum unless race mode is on.
const assert = require('assert'), store = {}; global.window = global; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
require('../../public/world-bots.js'); const B = global.WorldBots;
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
t('wheel bots are refused in the Athenaeum and the Colosseum (lobby counts, not just the arena floor)', () => {
  B.pickStarter('unicycle');
  for (const place of ['ATHENAEUM', 'COLOSSEUM', 'colosseum']) { const r = B.call('unicycle', 'interior', place); assert.strictEqual(r.ok, false, place); assert(/wait outside/.test(r.why)); }
});
t('wheel bots still work in the city and other interiors', () => { assert.strictEqual(B.call('unicycle', 'city', null).ok, true); assert.strictEqual(B.call('unicycle', 'interior', 'NEXUS').ok, true); });
t('race mode lets wheel bots into the Colosseum', () => { B.setRaceMode(true); assert.strictEqual(B.call('unicycle', 'interior', 'COLOSSEUM').ok, true); B.setRaceMode(false); assert.strictEqual(B.call('unicycle', 'interior', 'COLOSSEUM').ok, false); });
t('humanoid frames are allowed everywhere the rule covers', () => { for (const p of ['ATHENAEUM', 'COLOSSEUM', null]) assert.strictEqual(B.frameAllowed('humanoid', p).ok, true); });
t('every roster bot is either humanoid or wheeled (5 + 5)', () => { const k = B.ROSTER.map(b => b.kind); assert.strictEqual(k.filter(x => x === 'humanoid').length, 5); assert.strictEqual(k.filter(x => x === 'wheeled').length, 5); });
console.log(pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
