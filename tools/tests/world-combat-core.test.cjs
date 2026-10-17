// world-combat-core.js — combat core v2 (pure rules).
const CC = require('../../public/world-combat-core.js');
const RNG = require('../../public/world-rng.js');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const DT = 1 / 120;
function run(f, secs) { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) f.step(DT); }
function mkDodge() { let now = 0, rdy = 0; return { CFG: { dur: 0.5, iFrom: 0.04, iTo: 0.42, cooldown: 0.9 }, tick(d) { now += d; }, trigger() { if (now < rdy) return false; rdy = now + 0.9; return true; } }; }
const HIT = (o) => Object.assign({ dmg: 10, dir: { x: 1, z: 0 }, kind: 'melee' }, o || {});

// --- combo chain via buffer
{
  const f = CC.create();
  t('light starts attack1', f.input('light') && f.state() === 'attack1');
  run(f, 0.30);                       // into recovery (0.22 start of recovery = 0.44 total? startup+active=0.22)
  t('still attack1 mid recovery', f.state() === 'attack1');
  f.input('light');                    // buffered in recovery
  run(f, 0.30);
  t('buffered light chains attack1 -> attack2', f.state() === 'attack2');
  run(f, 0.25); f.input('light'); run(f, 0.3);
  t('chains attack2 -> attack3', f.state() === 'attack3');
  run(f, 0.2); f.input('light'); run(f, 1.0);
  t('attack3 does not chain further', f.state() === 'idle');
}
{ // press too early (outside 0.25 s buffer) -> no chain
  const f = CC.create();
  f.input('light'); f.input('light');  // buffered at t=0, attack1 total 0.44 > 0.25
  run(f, 0.6);
  t('early press outside buffer window does NOT chain', f.state() === 'idle');
}
// --- roll cancels recovery, not startup
{
  const f = CC.create();
  f.input('light'); run(f, 0.30);
  t('roll cancels recovery', f.input('roll') && f.state() === 'roll');
  const g = CC.create();
  g.input('light'); run(g, 0.05);
  g.input('roll');
  t('roll cannot cancel startup (buffered instead)', g.state() === 'attack1');
}
// --- i-frames
{
  const d = mkDodge(), f = CC.create({ dodge: d });
  f.input('roll');
  run(f, 0.02);
  t('before iFrom: hit applies', f.hit(HIT()).applied === true);
}
{
  const d = mkDodge(), f = CC.create({ dodge: d });
  f.input('roll'); run(f, 0.1);
  const r = f.hit(HIT());
  t('inside i-frames: hit not applied', r.applied === false && r.dodged === true && f.hp() === 100);
  t('hazard kinds are undodgeable', f.hit(HIT({ kind: 'lava' })).applied === true);
  const g = CC.create({ dodge: mkDodge() });
  g.input('roll'); run(g, 0.45);
  t('after iTo: hit applies', g.hit(HIT()).applied === true);
}
// --- parry / block
{
  const f = CC.create(); f.input('block'); run(f, 0.1);
  const r = f.hit(HIT({ dmg: 20 }));
  t('parry inside 0.15 s', r.parried === true && f.hp() === 100 && f.stamina() === 100);
  const g = CC.create(); g.input('block'); run(g, 0.3);
  const s0 = g.stamina(), r2 = g.hit(HIT({ dmg: 20 }));
  t('block reduces 60%', Math.abs(r2.dmg - 8) < 1e-9 && Math.abs(g.hp() - 92) < 1e-9 && g.state() === 'block');
  t('block-hit costs stamina', Math.abs(s0 - g.stamina() - 6) < 1e-9);
}
// --- stamina
{
  const f = CC.create();
  for (let i = 0; i < 40; i++) { f.input('roll'); run(f, 1.0); }
  t('stamina never negative', f.stamina() >= 0);
  const g = CC.create(); g.input('light'); // -8 => 92
  run(g, 0.5); // attack ended (0.44); regen delay 0.6 passes at 0.6
  const s1 = g.stamina();
  run(g, 0.05);   // t=0.55 < 0.6
  t('no regen inside delay', g.stamina() === s1 && s1 === 92);
  run(g, 0.35);
  t('regen after delay', g.stamina() > 92);
}
{ // heavy refused without stamina
  let pool = 10; const ext = { get: () => pool, spend: (n) => { pool = Math.max(0, pool - n); } };
  const f = CC.create({ stamina: ext });
  t('heavy refused (10 < 22)', f.input('heavy') === false && f.state() === 'idle');
  t('light accepted via injected stamina', f.input('light') && pool === 2);
  pool = 100; const g = CC.create({ stamina: { get: () => pool, spend: (n) => { pool -= n; } } });
  t('heavy accepted with stamina', g.input('heavy') && g.state() === 'heavy' && pool === 78);
}
// --- hit-stop scaling / hitstun / dead
{
  const f = CC.create({ cfg: { hp: 1000 } });
  const a = f.hit(HIT({ dmg: 1 })).stopMs, b = f.hit(HIT({ dmg: 20 })).stopMs, c = f.hit(HIT({ dmg: 500 })).stopMs;
  t('hit-stop within [40,90]', [a, b, c].every(v => v >= 40 && v <= 90));
  t('hit-stop scales with dmg', a < b && b < c && c === 90 && a === 41.5);
  const g = CC.create({ cfg: { hp: 1000 } }); g.hit(HIT({ dmg: 20 }));
  t('hitstun state entered; knockback along dir', g.state() === 'hitstun');
  run(g, 0.6); t('hitstun ends', g.state() === 'idle');
  const p = CC.create({ cfg: { hp: 1000 } }), q = CC.create({ cfg: { hp: 1000 } });
  p.hit(HIT({ dmg: 30 })); q.hit(HIT({ dmg: 30, poise: 1 }));
  run(p, 0.2); run(q, 0.2);
  t('poise shortens hitstun', p.state() === 'hitstun' && q.state() === 'idle');
}
{
  const f = CC.create(); let kills = 0; f.on('kill', () => kills++);
  const r = f.hit(HIT({ dmg: 999 })); f.hit(HIT({ dmg: 999 }));
  t('dead after lethal, exactly one kill', f.state() === 'dead' && kills === 1 && r.state === 'dead' && f.hp() === 0);
  t('dead ignores input', f.input('light') === false);
}
// --- active events
{
  const f = CC.create(), log = [];
  f.on('active', e => log.push([e.move, e.start ? 's' : 'e', +f.timeInState().toFixed(3)]));
  f.input('light'); run(f, 1.0);
  t('active start/end exactly once', log.length === 2 && log[0][1] === 's' && log[1][1] === 'e');
  t('active start ~0.10, end ~0.22', Math.abs(log[0][2] - 0.10) < 0.01 && Math.abs(log[1][2] - 0.22) < 0.01);
  const g = CC.create(), l2 = []; g.on('active', e => l2.push(e.start ? 's' : 'e'));
  g.input('light'); run(g, 0.15); g.hit(HIT());
  t('interrupted active still emits end once', l2.join('') === 'se');
}
// --- attackFor clips
{
  const f = CC.create();
  t('attackFor clips', f.attackFor('attack1').clip === 'Sword_Regular_A' && f.attackFor('attack3').clip === 'Sword_Regular_C' &&
    f.attackFor('heavy').clip === 'Sword_Heavy_Combo' && f.attackFor('block').clip === 'Sword_Block' &&
    f.attackFor('roll').clip === 'Roll' && f.attackFor('hitstun').clip === 'Hit_Knockback');
}
// --- scripted duel determinism
function duel(seed) {
  const rng = RNG.create(seed), log = [];
  const A = CC.create({ cfg: { hp: 400 } }), B = CC.create({ cfg: { hp: 400 } });
  const fs = [['A', A, B], ['B', B, A]], landed = { A: false, B: false };
  fs.forEach(([n, f]) => { ['state', 'active', 'hit', 'kill'].forEach(ev => f.on(ev, e => log.push(n + ':' + ev + ':' + JSON.stringify(e)))); });
  const acts = ['light', 'light', 'heavy', 'roll', 'block', 'release-block', 'move', 'stop'];
  for (let i = 0; i < 30 * 60; i++) {
    for (const [n, me, foe] of fs) {
      if (rng() < 0.06) me.input(rng.pick(acts));
      if (me.isActive()) { if (!landed[n]) { landed[n] = true; const r = foe.hit({ dmg: me.attackFor(me.state()).dmg, dir: { x: 1, z: 0 }, kind: 'melee' }); log.push(n + '>' + JSON.stringify(r)); } }
      else landed[n] = false;
    }
    A.step(1 / 60); B.step(1 / 60);
  }
  log.push('end:' + A.hp() + ':' + B.hp() + ':' + A.stamina().toFixed(4));
  return log;
}
{
  const a = duel(1234), b = duel(1234), c = duel(999);
  t('duel produces events', a.length > 40);
  t('duel identical on two runs', JSON.stringify(a) === JSON.stringify(b));
  t('different seed differs', JSON.stringify(a) !== JSON.stringify(c));
}
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
