// node tools/tests/world-siege.test.cjs — Castle Siege Day: schedule/phases, 5 dragons, elder shielded, damage credit, drops by role
const assert = require('assert'); global.window = global; require('../../public/world-castle-siege.js'); const S = global.WorldCastleSiege;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('next siege is the coming Saturday 20:00 UTC; after it ends the next one is a week later; phases run idle > announce > gather > live > ended', () => {
  const wed = Date.UTC(2026, 9, 7, 12); const st = S.nextStart(wed); const d = new Date(st); assert.strictEqual(d.getUTCDay(), 6); assert.strictEqual(d.getUTCHours(), 20); assert.strictEqual(d.getUTCDate(), 10);
  const MIN = 60000, H = 3600000; assert.strictEqual(S.phase(st - 30 * H, st), 'idle'); assert.strictEqual(S.phase(st - 5 * H, st), 'announce'); assert.strictEqual(S.phase(st - 5 * MIN, st), 'gather'); assert.strictEqual(S.phase(st + 10 * MIN, st), 'live'); assert.strictEqual(S.phase(st + 100 * MIN, st), 'ended');
  assert.strictEqual(S.nextStart(st + 100 * MIN), st + 7 * 86400000); assert.strictEqual(S.nextStart(st + 10 * MIN), st, 'still live: this siege');
});
t('five dragons; hp scales with the number of fighters; joining forces fight mode', () => { const b = S.create(); assert.strictEqual(Object.keys(b.state().dragons).length, 5); const h0 = b.state().dragons.ember.max; assert(b.join('a', 'c1').fightMode); for (let i = 0; i < 50; i++) b.join('p' + i); assert(b.state().dragons.ember.max > h0); b.join('a', 'c1'); assert.strictEqual(b.state().fighters, 51, 'no double join'); });
t('the Elder Dragon is shielded until the other four are dead', () => {
  const b = S.create(); b.join('a'); const e = b.hit('a', 'elder', 100); assert.strictEqual(e[0].type, 'shielded'); assert.strictEqual(b.state().dragons.elder.hp, b.state().dragons.elder.max);
  ['ember', 'frost', 'storm', 'void'].forEach(k => b.hit('a', k, 1e9)); assert(b.vulnerable('elder')); assert(b.hit('a', 'elder', 100)[0].type === 'hit');
});
t('damage is credited to player and clan; drops: killing blow, top clan members, top player, and everyone with >= 1 % participation (not the 0.5 % one)', () => {
  const b = S.create(); b.join('top', 'red'); b.join('mate', 'red'); b.join('blue1', 'blue'); b.join('killer', 'blue'); b.join('tiny', null); const max = b.state().dragons.ember.max;
  b.hit('top', 'ember', max * 0.4); b.hit('mate', 'ember', max * 0.2); b.hit('blue1', 'ember', max * 0.2); b.hit('tiny', 'ember', max * 0.005); const ev = b.hit('killer', 'ember', 1e9); const down = ev.find(e => e.type === 'dragon-down');
  assert.strictEqual(down.killer, 'killer'); assert.strictEqual(down.topPlayer, 'top'); assert.strictEqual(down.topClan, 'red');
  const by = (who, why) => down.drops.some(d => d.to === who && d.why === why);
  assert(by('killer', 'killing blow') && by('top', 'top damage') && by('top', 'top clan') && by('mate', 'top clan') && !by('blue1', 'top clan') && by('blue1', 'participation') && !by('tiny', 'participation'));
});
t('victory when all five fall; results rank players and clans; hits after the end do nothing', () => {
  const b = S.create(); b.join('a', 'x'); b.join('b', 'y'); let v = false; ['ember', 'frost', 'storm', 'void', 'elder'].forEach(k => { const e = b.hit(k === 'elder' ? 'b' : 'a', k, 1e9); if (e.some(x => x.type === 'victory')) v = true; }); assert(v);
  const r = b.results(); assert(r.done && r.dragons.every(d => d.dead)); assert.strictEqual(r.topPlayers[0].id, 'a'); assert.strictEqual(r.topClans[0].id, 'x'); assert.deepStrictEqual(b.hit('a', 'ember', 5), []);
});
t('invalid hits are ignored: unknown player, unknown dragon, zero/negative damage', () => { const b = S.create(); b.join('a'); assert.deepStrictEqual(b.hit('zz', 'ember', 5), []); assert.deepStrictEqual(b.hit('a', 'nope', 5), []); assert.deepStrictEqual(b.hit('a', 'ember', 0), []); assert.deepStrictEqual(b.hit('a', 'ember', -4), []); });
console.log(pass + ' passed');
