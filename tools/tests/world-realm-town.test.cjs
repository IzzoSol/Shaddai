// Realm towns (owner 2026-10-16: finish each realm city): K10 + K10b buildings on streets - no overlaps, nothing on a street, doors face a street.
const assert = require('assert'); globalThis.window = globalThis; require('../../public/world-realm-kits.js');
const K = window.WorldRealmKits, FP = { hall: [24, 18], shop: [14, 12], tower: [16, 16], home: [11, 10], workshop: [18, 14], inn: [18, 14], apartments: [14, 14] };
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok ', n); };
const all = K.BUILDINGS.concat(K.TOWN).map(([k, x, z, yaw]) => { const r = Math.abs(Math.round(yaw / 90)) % 2 === 1, [w, d] = FP[k]; const hw = (r ? d : w) / 2 + 1, hd = (r ? w : d) / 2 + 1; return { k, x, z, yaw, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd }; });
t('21 town buildings + the 5 originals per station', () => { assert.strictEqual(K.TOWN.length, 21); assert.strictEqual(all.length, 26); });
t('no two footprints overlap (1 m margin)', () => { for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], b = all[j]; assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, a.k + '@' + a.x + ',' + a.z + ' vs ' + b.k + '@' + b.x + ',' + b.z); } });
t('no building sits on a street', () => { K.STREETS.forEach(([x0, z0, x1, z1, w]) => { const sx0 = Math.min(x0, x1) - w / 2, sx1 = Math.max(x0, x1) + w / 2, sz0 = Math.min(z0, z1) - w / 2, sz1 = Math.max(z0, z1) + w / 2;
  all.forEach((a) => assert.ok(a.x1 <= sx0 || sx1 <= a.x0 || a.z1 <= sz0 || sz1 <= a.z0, a.k + '@' + a.x + ',' + a.z + ' on street')); }); });
t('every K10b door faces a street (front = yaw 0 -> +z, 180 -> -z, -90 -> -x, 90 -> +x)', () => { K.TOWN.forEach(([k, x, z, yaw]) => { const fx = Math.round(Math.sin(yaw * Math.PI / 180)), fz = Math.round(Math.cos(yaw * Math.PI / 180));
  const hit = K.STREETS.some(([x0, z0, x1, z1, w]) => [10, 20, 30].some((dd) => { const px = x + fx * dd, pz = z + fz * dd; return px >= Math.min(x0, x1) - w / 2 && px <= Math.max(x0, x1) + w / 2 && pz >= Math.min(z0, z1) - w / 2 && pz <= Math.max(z0, z1) + w / 2; }));
  assert.ok(hit, k + '@' + x + ',' + z + ' yaw ' + yaw + ' faces no street'); }); });
console.log(pass + ' passed, 0 failed');
