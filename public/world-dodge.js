/* world-dodge.js — ON-FOOT DODGE ROLL with i-frames (pure rules). Z on foot (touch: ROLL). Not available while riding (Z/C are the board's barrel roll there).
 *   WorldDodge.trigger() -> bool      starts a roll if off cooldown   ·  rolling() · invulnerable()  (true only inside the i-frame window)  ·  cooldownLeft()  ·  state()
 *   WorldDodge.CFG = { dur, iFrom, iTo, cooldown }   Roll lasts `dur` s; damage from enemies/dragons is ignored between iFrom and iTo; hazards (lava, drowning, falls, gas) are NOT dodgeable.
 * Consumers: host __onDragonHit, world-survival damage(n, kind) via WorldDodge.blocks(kind). Clock is injectable for tests (_setClock).
 */
(function (root) {
  'use strict';
  var CFG = { dur: 0.5, iFrom: 0.04, iTo: 0.42, cooldown: 0.9 }, clock = function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }, t0 = -1e9, tReady = -1e9;
  var UNDODGEABLE = /lava|drown|fall|hazard|gas|cold|heat|burn|void|starv/i;
  function trigger() { var t = clock(); if (t < tReady) return false; t0 = t; tReady = t + CFG.cooldown; return true; }
  function rolling() { var d = clock() - t0; return d >= 0 && d < CFG.dur; }
  function invulnerable() { var d = clock() - t0; return d >= CFG.iFrom && d <= CFG.iTo; }
  function blocks(kind) { return invulnerable() && !UNDODGEABLE.test(String(kind || '')); }
  root.WorldDodge = { CFG: CFG, trigger: trigger, rolling: rolling, invulnerable: invulnerable, blocks: blocks, cooldownLeft: function () { return Math.max(0, tReady - clock()); }, state: function () { return { rolling: rolling(), invulnerable: invulnerable(), cooldownLeft: Math.max(0, tReady - clock()) }; }, _setClock: function (f) { clock = f; t0 = -1e9; tReady = -1e9; } };
})(typeof window !== 'undefined' ? window : globalThis);
