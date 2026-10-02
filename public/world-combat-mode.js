/* world-combat-mode.js — PASSIVE vs FIGHT mode.
 *   Passive: you cannot damage or be damaged by players, and mobs ignore you.
 *   Fight: normal combat. Toggle with WorldCombatMode.toggle(); the choice persists ('shd_cmode_v1').
 *   THE VOID (one area) is the exception: standing in it forces FIGHT and the toggle refuses. setInVoid(fn(x,z)) gives the area test.
 *   API: passive() · locked() · canHurt(victimPassive) · mobsTarget() · toggle() -> {passive, locked, reason?} · update(x, z) per frame · onChange(fn)
 */
(function (root) {
  'use strict';
  var KEY = 'shd_cmode_v1', pref = false, forced = false, inVoid = function () { return false; }, cbs = [];
  try { pref = root.localStorage.getItem(KEY) === '1'; } catch (e) { }
  function eff() { return pref && !forced; }
  function emit() { cbs.forEach(function (f) { try { f(eff(), forced); } catch (e) { } }); }
  function update(x, z) { var f = !!inVoid(x, z); if (f !== forced) { forced = f; emit(); } return eff(); }
  function toggle() {
    if (forced) return { passive: false, locked: true, reason: 'The Void forces you to fight' };
    pref = !pref; try { root.localStorage.setItem(KEY, pref ? '1' : '0'); } catch (e) { } emit();
    return { passive: pref, locked: false };
  }
  root.WorldCombatMode = {
    passive: eff, locked: function () { return forced; }, toggle: toggle, update: update, setInVoid: function (f) { inVoid = f; },
    canHurt: function (victimPassive) { return !eff() && !victimPassive; },
    mobsTarget: function () { return !eff(); }, onChange: function (f) { cbs.push(f); }, _reset: function () { pref = false; forced = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
