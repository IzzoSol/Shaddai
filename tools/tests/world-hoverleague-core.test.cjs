// node tools/tests/world-hoverleague-core.test.cjs — HOVER LEAGUE rules (public/world-hoverleague-core.js)
const assert = require('assert'), path = require('path'), fs = require('fs');
const C = require(path.join(__dirname, '../../public/world-hoverleague-core.js'));
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/assets/world/hoverleague-layout.json'), 'utf8'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
function game(o) { const g = C.create(L, Object.assign({ bots: { cyon: 0, magma: 0 }, seed: 3 }, o)); const you = g.setHuman({ team: 'cyon' }); g.step(0.016, { you: { x: 0, z: 20 } }); g.state.wait = 0; return { g, you }; }
function run(g, secs, you) { let ev = []; for (let i = 0; i < secs * 60; i++) ev = ev.concat(g.step(1 / 60, { you: you })); return ev; }

t('layout: two goals only, no floating rings', () => { assert.strictEqual(L.goals.length, 2); assert.strictEqual((L.rings || []).length, 0); });
t('floor is flat in the middle, quarter-pipe rises to QP_H at the edge', () => {
  const { g } = game(); assert.strictEqual(g.heightAt(0, 0), 0); assert(g.heightAt(L.A - 0.3, 0) > L.QP_H * 0.6); assert(g.heightAt(L.A - 4, 0) > 0 && g.heightAt(L.A - 4, 0) < g.heightAt(L.A - 1, 0));
});
t('south tunnel stays walkable (no rim in the gap)', () => { const { g } = game(); assert.strictEqual(g.heightAt(0, L.B - 1), 0); });
t('wall-ride faces follow the rim and skip the tunnel', () => { const { g } = game(); const w = g.walls(); assert(w.length > 40 && w.length < 48); w.forEach((s) => assert(s.y1 > s.y0)); });
t('kickoff puts the ball on the spawn, nobody holds it', () => { const { g } = game(); assert.strictEqual(g.state.ball.holder, null); assert(Math.abs(g.state.ball.x) < 1e-6 && g.state.ball.y > 3); });
t('touching the loose ball = you hold it, it rides in front of the board', () => {
  const { g } = game(); const b = g.state.ball; b.y = 1.4; b.vy = 0;
  const ev = g.step(1 / 60, { you: { x: 0, y: 0, z: 1.5, psi: Math.PI } }); assert(ev.some((e) => e.type === 'grab'));
  g.step(1 / 60, { you: { x: 10, y: 0, z: 0, psi: Math.PI / 2 } }); assert(Math.abs(b.x - (10 + C.TUNE.holdFwd)) < 1e-6);
});
t('attack while holding shoots along the heading; shot into the magma hoop scores for cyon', () => {
  const { g } = game(); const b = g.state.ball; b.holder = 'you';
  g.step(1 / 60, { you: { x: -30, y: 0, z: 0, psi: -Math.PI / 2 } });    // facing west (-x) toward the magma goal
  let ev = g.step(1 / 60, { you: { x: -30, y: 0, z: 0, psi: -Math.PI / 2, attack: true } }); assert(ev.some((e) => e.type === 'shot')); assert(b.vx < -25);
  b.y = 5.5; b.vy = 4; b.z = 0; ev = run(g, 2, { x: -30, y: 0, z: 0 });
  const goal = ev.find((e) => e.type === 'goal'); assert(goal, 'goal'); assert.strictEqual(goal.team, 'cyon'); assert.strictEqual(g.state.score.cyon, 1);
});
t('carrying the ball through the hoop scores too', () => {
  const { g } = game(); g.state.ball.holder = 'you';
  g.step(1 / 60, { you: { x: -47, y: 4, z: 0, psi: -Math.PI / 2 } });
  const ev = g.step(1 / 60, { you: { x: -51, y: 4, z: 0, psi: -Math.PI / 2 } }); assert(ev.some((e) => e.type === 'goal' && e.carried));
});
t('rammed by a rival = drop the ball + stun', () => {
  const g = C.create(L, { bots: { cyon: 0, magma: 1 }, seed: 5 }); const you = g.setHuman({ team: 'cyon' }); g.step(1 / 60, { you: { x: 0, z: 20 } }); g.state.wait = 0;
  const bot = g.state.players.find((p) => p.bot); g.state.ball.holder = 'you';
  bot.x = -1.5; bot.z = 20; bot.vx = 16; bot.vz = 0; bot.atkCD = 9;
  const ev = g.step(1 / 60, { you: { x: 0, y: 0, z: 20, vx: 0, vz: 0, psi: 0 } });
  assert(ev.some((e) => e.type === 'drop' && e.why === 'ram')); assert.notStrictEqual(g.state.ball.holder, 'you'); assert(you.stun > 0);
});
t('attack without the ball fires a bolt; a bolt hit makes the carrier drop', () => {
  const g = C.create(L, { bots: { cyon: 0, magma: 1 }, seed: 5 }); g.setHuman({ team: 'cyon' }); g.step(1 / 60, { you: { x: 0, z: 0 } }); g.state.wait = 0;
  const bot = g.state.players.find((p) => p.bot); g.state.ball.holder = bot.id; bot.x = 0; bot.z = 14; bot.vx = bot.vz = 0; bot.stun = 5;
  let ev = g.step(1 / 60, { you: { x: 0, y: 0, z: 0, psi: 0, attack: true } }); assert(ev.some((e) => e.type === 'bolt'));
  ev = run(g, 0.6, { x: 0, y: 0, z: 0, psi: 0 }); assert(ev.some((e) => e.type === 'hit' && e.id === bot.id)); assert(ev.some((e) => e.type === 'drop' && e.why === 'bolt'));
});
t('shield blocks bolts (carrier keeps the ball)', () => {
  const g = C.create(L, { bots: { cyon: 0, magma: 1 }, seed: 5 }); g.setHuman({ team: 'cyon' }); g.step(1 / 60, { you: { x: 0, z: 0 } }); g.state.wait = 0;
  const bot = g.state.players.find((p) => p.bot); g.state.ball.holder = bot.id; bot.x = 0; bot.z = 14; bot.stun = 5; bot.power = 'shield'; bot.powerT = 9;
  g.step(1 / 60, { you: { x: 0, y: 0, z: 0, psi: 0, attack: true } }); const ev = run(g, 0.6, { x: 0, y: 0, z: 0, psi: 0 });
  assert(ev.some((e) => e.type === 'hit' && e.blocked)); assert.strictEqual(g.state.ball.holder, bot.id);
});
t('boost: big orb fills, small pad +12, pads respawn', () => {
  const { g, you } = game(); you.boost = 10; const big = g.state.pads.find((p) => p.big);
  g.step(1 / 60, { you: { x: big.x, y: 0, z: big.z } }); assert.strictEqual(you.boost, 100); assert(big.t > 0);
  const sm = g.state.pads.find((p) => !p.big); you.boost = 50; g.step(1 / 60, { you: { x: sm.x, y: 0, z: sm.z } }); assert.strictEqual(you.boost, 62);
});
t('paint mode: skating paints cells, repainting steals them', () => {
  const g = C.create(L, { mode: 'paint', bots: { cyon: 0, magma: 0 } }); g.setHuman({ team: 'cyon' }); g.step(1 / 60, { you: { x: 0, z: 0 } }); g.state.wait = 0;
  for (let x = -20; x <= 20; x += 1) g.step(1 / 60, { you: { x: x, y: 0, z: 0 } });
  assert(g.state.paint.cyon >= 19); assert.strictEqual(g.state.paint.magma, 0);
});
t('ball types: 5 selectable energy/regular balls with distinct physics', () => {
  assert.deepStrictEqual(Object.keys(C.BALLS), ['shaddai', 'regular', 'plasma', 'inferno', 'void', 'solar']);
  const g = C.create(L, { ball: 'void' }); assert(g.ballInfo().grav < C.BALLS.regular.grav); assert.strictEqual(C.create(L, { ball: 'nope' }).ballInfo().id, 'shaddai');
});
t('2v2 bots play a full 5-min match: touches, shots, a result, ball never escapes', () => {
  const g = C.create(L, { bots: { cyon: 2, magma: 2 }, seed: 11 }); const ev = [];
  for (let i = 0; i < 60 * 330 && !g.state.over; i++) { g.step(1 / 60, {}, ev); const b = g.state.ball; assert((b.x * b.x) / (L.A * L.A) + (b.z * b.z) / (L.B * L.B) <= 1.02 || Math.abs(b.x) < L.tunnelHalf, 'ball escaped'); assert(b.y < 30 && b.y > -0.5, 'ball y ' + b.y); }
  assert(g.state.over, 'match ended'); assert(ev.filter((e) => e.type === 'grab').length > 10, 'grabs'); assert(ev.filter((e) => e.type === 'shot').length > 3, 'shots');
  console.log('       result', JSON.stringify(g.state.score), 'grabs', ev.filter((e) => e.type === 'grab').length, 'shots', ev.filter((e) => e.type === 'shot').length, 'drops', ev.filter((e) => e.type === 'drop').length, 'goals', ev.filter((e) => e.type === 'goal').length);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
