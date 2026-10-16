// Race HQ (owner 2026-10-16): showroom prices, ownership store, placement beside the Skyline pit straight.
const assert = require('assert'); const store = {}; globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.window = globalThis; require('../../public/world-race-hq.js'); globalThis.window = globalThis; require('../../public/world-race.js');
const Q = window.WorldRaceHQ; let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok ', n); };
t('prices: ships 1500, lightcycles 900, cars 600', () => { assert.strictEqual(Q.PRICE({ ship: true }), 1500); assert.strictEqual(Q.PRICE({ bike: true }), 900); assert.strictEqual(Q.PRICE({}), 600); });
t('ownership reads the shd.raceGarage store', () => { assert.strictEqual(Q._owns('arrow'), false); store['shd.raceGarage'] = JSON.stringify({ owned: ['arrow'] }); assert.strictEqual(Q._owns('arrow'), true); });
t('HQ sits 60-120 m inside the Skyline pit straight start', () => { const g = window.WorldRace.TRACKS['grand-course'](), d = Math.hypot(g[0][0] - Q.POS_M.e, g[0][1] - Q.POS_M.n); assert.ok(d > 60 && d < 120, d); });
console.log(pass + ' passed, 0 failed');
