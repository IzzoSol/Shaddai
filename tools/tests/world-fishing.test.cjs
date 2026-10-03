// node tools/tests/world-fishing.test.cjs — fishing rules: bites by water/time/realm, size skew, tension fight (win/snap/escape), rewards feed taming lures
const assert = require('assert'); global.window = global; require('../../public/world-fishing.js'); const F = global.WorldFishing;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
t('bites follow the realm, the water and the hour: arctic water gives arctic fish, void deeps at night give void eels, nothing mixes', () => {
  const r = seeded(7), count = (water, hour, realm, n) => { const c = {}; for (let i = 0; i < n; i++) { const id = F.rollBite(water, hour, realm, r, 2); if (id) c[id] = (c[id] || 0) + 1; } return c; };
  const arc = count('shallows', 12, 'arctic', 800); assert(Object.keys(arc).length >= 1 && Object.keys(arc).every(k => F.SPECIES[k].realms.includes('arctic')), JSON.stringify(arc));
  const voidN = count('deep', 23, 'void', 1500), voidD = count('deep', 12, 'void', 1500); assert((voidN.voidEel || 0) > (voidD.voidEel || 0) * 3, 'eel prefers night: ' + (voidN.voidEel || 0) + ' vs ' + (voidD.voidEel || 0));
  const coast = count('reef', 12, 'coast', 800); assert(coast.yellowtail > coast.hogfish * 0.8 && !coast.tuna, 'reef has no tuna'); assert.strictEqual(F.rollBite('deep', 12, 'nowhere', r, 1), null);
});
t('better rods bite more often; sizes are skewed small but trophies exist; length and value follow the species model', () => {
  const r = seeded(11); let a = 0, b = 0; for (let i = 0; i < 2000; i++) { if (F.rollBite('bay', 7, 'coast', r, 1)) a++; if (F.rollBite('bay', 7, 'coast', r, 4)) b++; } assert(b > a, 'rod 4 ' + b + ' vs rod 1 ' + a);
  const w = []; for (let i = 0; i < 2000; i++) w.push(F.rollWeight('tuna', r)); w.sort((x, y) => x - y); assert(w[1000] < (3 + 14) / 2 - 2, 'median is small'); assert(w[1990] > 10, 'trophies exist'); assert(w[0] >= 3 && w[1999] <= 14);
  const L = F.fishLengthCm('tuna', 8); assert(L > 50 && L < 100, 'tuna length ' + L); assert(F.fishValue('tuna', 14) > F.fishValue('tuna', 8) * 14 / 8 * 1.0, 'trophy bonus');
});
const play = (id, kg, rod, policy, seed) => { const r = seeded(seed), f = F.createFight(id, kg, rod, r); let o, t0 = 0; for (let i = 0; i < 60 * 120; i++) { o = f.step(1 / 60, policy(o || f.state(), i)); if (o.state !== 'fighting') break; } return o; };
const smart = (o) => o.tension < 0.5 ? true : (o.tension > 0.66 ? false : true);   // reel when slack-ish, ease when hot
t('good play lands a small fish with a basic rod; holding the reel the whole time snaps the line on a strong fish; never reeling lets it escape', () => {
  assert.strictEqual(play('mullet', 1, 1, smart, 3).state, 'caught');
  assert.strictEqual(play('tarpon', 30, 1, () => true, 5).state, 'broke');
  assert.strictEqual(play('jack', 5, 1, () => false, 9).state, 'escaped');
});
t('stronger rods make big fish winnable: the same strong fish that beats a hand line is landed with a master rod using the same smart policy (across seeds)', () => {
  let low = 0, high = 0; for (let s = 1; s <= 12; s++) { if (play('tuna', 11, 1, smart, s).state === 'caught') low++; if (play('tuna', 11, 4, smart, s).state === 'caught') high++; } assert(high > low, 'master ' + high + ' vs hand line ' + low); assert(high >= 8, 'master rod lands most: ' + high);
});
t('fight state is final once decided; tension stays in 0..1.1; the green band is exposed to the UI', () => {
  const f = F.createFight('mullet', 1, 1, seeded(2)); let o; for (let i = 0; i < 4000; i++) { o = f.step(1 / 60, smart(o || f.state())); assert(o.tension >= 0 && o.tension <= 1.1); if (o.state !== 'fighting') break; } const end = o.state; assert.notStrictEqual(end, 'fighting'); assert.strictEqual(f.step(1, true).state, end); assert.deepStrictEqual(o.green, [0.35, 0.7]);
});
t('rewards: Sparks value + raw-fish lures (taming), rare pearl/river-glass, void-dust only from void fish; deterministic with a seed', () => {
  const r = seeded(21); const a = F.rewards('tuna', 12, r); assert(a.sparks > 100 && a.items['raw-fish'] >= 5 && a.length_cm > 50); let dust = 0, pearl = 0, glass = 0; for (let i = 0; i < 3000; i++) { const v = F.rewards('voidEel', 4, r); if (v.items['void-dust']) dust++; if (v.items.pearl) pearl++; const g = F.rewards('goldenCarp', 3, r); if (g.items['river-glass']) glass++; } assert(dust > 150 && dust < 600, 'void dust ~12%: ' + dust); assert(pearl > 20 && pearl < 120, 'pearl ~2%: ' + pearl); assert(glass > 80 && glass < 300, 'river glass ~6%: ' + glass); assert(!F.rewards('tuna', 12, seeded(1)).items['void-dust']);
  assert.deepStrictEqual(F.rewards('mullet', 1, seeded(5)), F.rewards('mullet', 1, seeded(5)));
});
console.log(pass + ' passed');
