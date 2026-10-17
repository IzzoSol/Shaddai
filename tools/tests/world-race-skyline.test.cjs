// Skyline Circuit (grand-course, owner 2026-10-16): long race from Race HQ on the ground, up onto the sky ring, two crossover loops, back to the HQ.
const assert = require('assert'); globalThis.window = globalThis; require('../../public/world-race.js');
const W = window.WorldRace, g = W.TRACKS['grand-course'](), C = W.CIRCUITS['grand-course']; let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ok ', n); };
t('circuit registered, one lap, offered in the menu', () => { assert.ok(C && C.laps === 1 && !C.hidden && C.hq); });
t('meridian circuits are hidden from the menu (kept in code)', () => { assert.ok(W.CIRCUITS['meridian-8'].hidden && W.CIRCUITS['meridian-8-lobe-n'].hidden); });
t('lap is 12.5-14 km (connectors + ring + a Dragon Gate lap)', () => { const L = W.trackLengthM('grand-course'); assert.ok(L > 12500 && L < 14000, L); });
t('starts on the ground beside Race HQ (h 0, within 250 m) and finishes on the Dragon Gate deck', () => { assert.strictEqual(g[0][2], 0); assert.ok(Math.hypot(g[0][0] - 1737, g[0][1] + 303) < 250); assert.strictEqual(g[g.length - 1][2], 0); });
t('owner connectors: north line climbs from Dragon Gate, south line comes back down to it', () => { const dg = W.TRACKS['dragon-gate'](), d = (p) => Math.min.apply(null, dg.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))); assert.ok(d(g[0]) < 30); const k = g.findIndex((p) => p[0] === 1489 && p[1] === -860); assert.ok(k > 0 && g[k][2] > 40); });
t('sky ring is 70 m up everywhere away from the pit', () => { const far = g.filter((p) => Math.hypot(p[0], p[1]) < 1500 && Math.abs(((Math.atan2(p[0], p[1]) * 180 / Math.PI - 102 + 540) % 360) - 180) > 40); assert.ok(far.length > 200 && far.every((p) => p[2] === 70)); });
t('two crossover loops dive >= 500 m inside the ring', () => { const deep = g.filter((p) => Math.hypot(p[0], p[1]) < 950); assert.ok(deep.length >= 4); const bear = deep.map((p) => Math.atan2(p[0], p[1]) * 180 / Math.PI); assert.ok(bear.some((b) => Math.abs(b + 10) < 25) && bear.some((b) => Math.abs(Math.abs(b) - 170) < 25)); });
t('trackWorld carries the min deck height', () => { const w = W.trackWorld('grand-course', 7 / 1.8); assert.strictEqual(w[0].h, 0); assert.ok(w.some((p) => p.h === 70)); });
console.log(pass + ' passed, 0 failed');
