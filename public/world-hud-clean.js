/* world-hud-clean.js — CLEAN SCREEN while playing (2026-10-23, owner: "the game buttons and camera angle movements in settings in the navi,
 * better clear screen when playing, not so many buttons all over unless toggled").
 *   Hidden by default: the controls strip (#hint), the "Press H" chip (#helpChip), coordinates (#coords), the title block (#top), the
 *   Home / Dashboard bar (#worldNav), the CHAT button (#chatBtn) and the cursor/play-mode pill. Crosshair, HP/stamina, NAVI and the
 *   Sparks counter stay. F1 flashes the controls for 6 s; NAVI -> SETTINGS toggles each piece + camera sensitivity / invert Y.
 *   Prefs: localStorage 'shd_hud_prefs_v1' (per player, cosmetic only).
 *   WorldHudPrefs.get() · .set(key, value) · .apply()
 */
(function (root) {
  'use strict';
  var KEY = 'shd_hud_prefs_v1';
  var DEF = { controls: false, helpChip: false, coords: false, title: false, topNav: false, chat: false, modePill: false, lookSens: 1.0, invertY: false };
  var P = (function () { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } })();
  var LABELS = { controls: 'Controls strip (keys)', helpChip: '"Press H" help chip', coords: 'Coordinates', title: 'SHADDAI WORLD title', topNav: 'Home / Dashboard buttons', chat: 'Chat button', modePill: 'Cursor / play mode pill' };
  var flash = 0;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  function modePill() { var b = [].slice.call(document.querySelectorAll('button,div')).filter(function (e) { return e.children.length < 3 && /^\W*(CURSOR|PLAY) MODE\W*$/i.test((e.textContent || '').trim()); }); return b[0] || null; }
  function show(el, on) { if (el) el.style.visibility = on ? '' : 'hidden'; }
  function apply() {
    var f = Date.now() < flash;
    show(document.getElementById('hint'), P.controls || f);
    show(document.getElementById('helpChip'), P.helpChip);
    show(document.getElementById('coords'), P.coords);
    show(document.getElementById('top'), P.title);
    show(document.getElementById('worldNav'), P.topNav);
    show(document.getElementById('chatBtn'), P.chat);
    show(modePill(), P.modePill);
    if (root.__setLookSens) root.__setLookSens(P.lookSens, P.invertY);
  }
  function set(k, v) { if (!(k in DEF)) return; P[k] = v; save(); apply(); }
  addEventListener('keydown', function (e) { if (e.code === 'F1') { e.preventDefault(); flash = Date.now() + 6000; apply(); setTimeout(apply, 6100); } });
  // MODE PICKERS (Hover League / Naval, tagged data-shd-modal="colo"): Esc closes the top one; leaving the Colosseum closes them all
  addEventListener('keydown', function (e) { if (e.code !== 'Escape') return; var m = document.querySelectorAll('[data-shd-modal]'); if (m.length) { m[m.length - 1].remove(); e.stopImmediatePropagation(); } }, true);
  setInterval(function () { var A = root.__colosseumArena, inside = !!(A && A.group && A.group.visible) || root._currentInterior === 'COLOSSEUM';
    if (!inside) [].forEach.call(document.querySelectorAll('[data-shd-modal="colo"]'), function (n) { n.remove(); }); }, 800);
  setInterval(apply, 1500);                                                                   // late-built elements (chat button, pill) get the rule too
  if (document.readyState !== 'loading') apply(); else addEventListener('DOMContentLoaded', apply);
  root.WorldHudPrefs = { get: function () { return Object.assign({}, P); }, set: set, apply: apply, LABELS: LABELS };
})(typeof window !== 'undefined' ? window : this);
