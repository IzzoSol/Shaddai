/* dragon-lairs.test.cjs — 2026-10-23 lairs: with opts.lairFor the dragon spawns at its lair asleep, stays asleep while you are far,
 * wakes (alert) when you walk within tune.sleepWake, and wakes when hit. Run: node tools/tests/dragon-lairs.test.cjs */
'use strict';
const path = require('path'), assert = require('assert');
const DR = require(path.join(__dirname, '..', '..', 'public', 'world-dragons.js')), U = DR.U;
let pass = 0, fail = 0; function test(n, f) { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n   ' + e.message); } }
const layout = { stations: [{ id: 'arctic', name: 'Arctic', realm: 'arctic', dragon: 'ice', pos: [0, -2829 * U] }] };
const lair = { x: 0, z: -4000 * U };
function mk(P) { return DR.createDragonsCore({ heightAt: () => 0, layout, lairFor: () => lair, getPlayer: () => ({ pos: P, alive: true }) }); }
test('spawns asleep at its lair', () => { const P = { x: 0, y: 0, z: 0 }, c = mk(P), d = c.dragons[0]; assert.strictEqual(d.state, 'sleep'); assert.ok(Math.hypot(d.f.x - lair.x, d.f.z - lair.z) < 1); });
test('stays asleep while the player is far', () => { const P = { x: 0, y: 0, z: -3700 * U }, c = mk(P); for (let i = 0; i < 120; i++) c.update(1 / 30); assert.strictEqual(c.dragons[0].state, 'sleep'); });
test('wakes when the player comes close', () => { const P = { x: 0, y: 0, z: -3700 * U }, c = mk(P); for (let i = 0; i < 30; i++) c.update(1 / 30); P.z = lair.z + 20 * U; for (let i = 0; i < 30; i++) c.update(1 / 30); assert.notStrictEqual(c.dragons[0].state, 'sleep'); });
test('wakes when hit', () => { const P = { x: 0, y: 0, z: -3000 * U }, c = mk(P); c.update(1 / 30); c.damage(c.dragons[0].id, 5); c.update(1 / 30); assert.notStrictEqual(c.dragons[0].state, 'sleep'); });
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
