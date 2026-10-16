// Skyline Circuit (grand-course, owner 2026-10-16): long race from Race HQ on the ground, up onto the sky ring, two crossover loops, back to the HQ.
const assert = require('assert'); globalThis.window = globalThis; require('../../public/world-race.js');
const W = window.WorldRace, g = W.TRACKS['grand-course'](), C = W.CIRCUITS['grand-course']; let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ok ', n); };
t('circuit registered, one lap, offered in the menu', () => { assert.ok(C && C.laps === 1 && !C.hidden && C.hq); });
t('meridian circuits are hidden from the menu (kept in code)', () => { assert.ok(W.CIRCUITS['meridian-8'].hidden && W.CIRCUITS['meridian-8-lobe-n'].hidden); });
t('lap is 11-12.5 km', () => { const L = W.trackLengthM('grand-course'); assert.ok(L > 11000 && L < 12500, L); });
t('starts on the ground in front of Race HQ (h 0, within 120 m of the HQ)', () => { assert.strictEqual(g[0][2], 0); assert.ok(Math.hypot(g[0][0] - 1612, g[0][1] + 296) < 120); });
t('sky ring is 70 m up everywhere away from the pit', () => { const far = g.filter((p) => Math.abs(((Math.atan2(p[0], p[1]) * 180 / Math.PI - 100.4 + 540) % 360) - 180) > 50); assert.ok(far.length > 200 && far.every((p) => p[2] === 70)); });
t('two crossover loops dive >= 500 m inside the ring', () => { const deep = g.filter((p) => Math.hypot(p[0], p[1]) < 950); assert.ok(deep.length >= 4); const bear = deep.map((p) => Math.atan2(p[0], p[1]) * 180 / Math.PI); assert.ok(bear.some((b) => Math.abs(b + 10) < 25) && bear.some((b) => Math.abs(Math.abs(b) - 170) < 25)); });
t('trackWorld carries the min deck height', () => { const w = W.trackWorld('grand-course', 7 / 1.8); assert.strictEqual(w[0].h, 0); assert.ok(w.some((p) => p.h === 70)); });
console.log(pass + ' passed, 0 failed');
