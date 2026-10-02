const vm = require('vm'), fs = require('fs'), assert = require('assert');
function el() { const e = { style: {}, children: [], textContent: '', parentNode: null, appendChild(c) { c.parentNode = e; e.children.push(c); return c; } }; return e; }
const body = el(), doc = { body, createElement: () => el() };
const ctx = { console, setTimeout: () => 0, document: doc }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-hitfx.js', 'utf8'), ctx);
const H = ctx.WorldHitFX; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('number style grows with damage; kills are gold and say KILL; heavy hits are orange', () => {
  const a = H.numberStyle(5, false), b = H.numberStyle(60, false), k = H.numberStyle(20, true); assert(b.size > a.size && a.color === '#ffffff' && b.color === '#ff8a3a' && k.color === '#ffd24a' && /KILL/.test(k.text));
});
t('hurt arc: a hit from ahead is 0, from your right +90 deg, from behind 180, and it turns with you', () => {
  const ang = (dx, dz, yaw) => H.arcAngle(dx, dz, yaw) * 180 / Math.PI;
  assert(Math.abs(ang(0, 10, 0)) < 1e-6, 'ahead (+z) when facing +z'); assert(Math.abs(ang(-10, 0, 0) - 90) < 1e-6, 'west is your right when facing south'); assert(Math.abs(Math.abs(ang(0, -10, 0)) - 180) < 1e-6);
  assert(Math.abs(ang(10, 0, Math.PI / 2)) < 1e-6, 'facing east, a hit from the east is ahead');
});
t('damage numbers: pooled (max 20), rise and fade, removed when off screen or after 0.7 s, elements are reused', () => {
  const fx = H.create({ document: doc, audio: false, project: (x, y, z) => ({ x: 400 + x, y: 300, on: z >= 0 }), getYaw: () => 0 });
  for (let i = 0; i < 30; i++) fx.hit({ dmg: 10 + i, x: i, y: 0, z: 1 }); assert.strictEqual(fx._live(), 20, 'capped at 20'); fx.update(0.1); assert(fx._live() === 20);
  fx.update(0.7); assert.strictEqual(fx._live(), 0); const pooled = fx._pool(); assert(pooled >= 20); fx.hit({ dmg: 5, x: 0, y: 0, z: 1 }); assert.strictEqual(fx._pool(), pooled - 1, 'reused from the pool');
  fx.hit({ dmg: 5, x: 0, y: 0, z: -5 }); fx.update(0.05); assert.strictEqual(fx._live(), 1, 'behind the camera is dropped');
});
t('hit marker lasts 0.2 s; kill marker is bigger; hurt vignette scales with damage and decays', () => {
  const fx = H.create({ document: doc, audio: false, project: () => ({ x: 1, y: 1, on: true }), getYaw: () => 0 }); const ov = body.children[body.children.length - 1], mk = ov.children[0], vig = ov.children[1];
  fx.hit({ dmg: 8, x: 0, y: 0, z: 1, killed: false }); fx.update(0.05); assert(+mk.style.opacity > 0.5 && mk.style.transform === 'scale(1)'); fx.update(0.2); assert.strictEqual(+mk.style.opacity, 0);
  fx.hit({ dmg: 30, x: 0, y: 0, z: 1, killed: true }); fx.update(0.02); assert(mk.style.transform === 'scale(1.7)');
  fx.hurt(40, { dx: 0, dz: -5 }); fx.update(0.05); const v1 = +vig.style.opacity; assert(v1 > 0.5); fx.update(0.5); assert.strictEqual(+vig.style.opacity, 0); fx.hurt(5); fx.update(0.01); assert(+vig.style.opacity < v1, 'small hits flash less');
});
console.log(pass + ' passed');
