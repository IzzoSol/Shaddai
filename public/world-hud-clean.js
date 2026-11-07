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
  var DEF = { controls: false, helpChip: false, coords: false, title: false, topNav: false, chat: false, modePill: false, corner: false, lookSens: 1.0, invertY: false };
  var P = (function () { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } })();
  var LABELS = { controls: 'Controls strip (keys)', helpChip: '"Press H" help chip', coords: 'Coordinates', title: 'SHADDAI WORLD title', topNav: 'Home / Dashboard buttons', chat: 'Chat button', modePill: 'Cursor / play mode pill', corner: 'Bottom-right buttons' };
  var flash = 0;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  function modePill() { var b = [].slice.call(document.querySelectorAll('button,div')).filter(function (e) { return e.children.length < 3 && /^\W*(CURSOR|PLAY) MODE\W*$/i.test((e.textContent || '').trim()); }); return b[0] || null; }
  function show(el, on) { if (el) el.style.visibility = on ? '' : 'hidden'; }
  function apply() {
    if (uiOff) return;                                                                        // F2 hide-all owns visibility until restored
    var f = Date.now() < flash;
    show(document.getElementById('hint'), P.controls || f);
    show(document.getElementById('helpChip'), P.helpChip);
    show(document.getElementById('coords'), P.coords);
    show(document.getElementById('top'), P.title);
    show(document.getElementById('worldNav'), P.topNav);
    show(document.getElementById('chatBtn'), P.chat);
    show(modePill(), P.modePill);
    sweepCorner();
    if (root.__setLookSens) root.__setLookSens(P.lookSens, P.invertY);
  }
  function set(k, v) { if (!(k in DEF)) return; P[k] = v; save(); apply(); }
  addEventListener('keydown', function (e) { if (e.code === 'F1') { e.preventDefault(); flash = Date.now() + 6000; apply(); setTimeout(apply, 6100); } });
  // MODE PICKERS (Hover League / Naval, tagged data-shd-modal="colo"): Esc closes the top one; leaving the Colosseum closes them all
  addEventListener('keydown', function (e) { if (e.code !== 'Escape') return; var m = document.querySelectorAll('[data-shd-modal]'); if (m.length) { m[m.length - 1].remove(); e.stopImmediatePropagation(); } }, true);
  setInterval(function () { var A = root.__colosseumArena, inside = !!(A && A.group && A.group.visible) || root._currentInterior === 'COLOSSEUM';
    if (!inside) [].forEach.call(document.querySelectorAll('[data-shd-modal="colo"]'), function (n) { n.remove(); }); }, 800);
  // F2 = HIDE ALL UI (2026-11-05, owner: "hide buttons ... make sure nothing is in the way ... help menus or notices can be removed/hidden").
  // Hides every small fixed/absolute overlay (chips, pills, minimap, notices, touch buttons). Big panels the player opened on purpose
  // (Navi, dossier, shops: >40% of the viewport), the 3D canvas, the loading screen and the error box are left alone. Session-only (a
  // fresh load never starts blank); F2 again restores exactly what was showing. ?hideui=0 disables the key.
  var uiOff = false, KEEP = { c3d: 1, intro: 1, errBox: 1, labels: 1, shdUiToast: 1, dossier: 1, district: 1, navi: 1, shdDeath: 1, shdWater: 1 },
    FULLSCREEN_HUD = { hudV4: 1 };   // full-viewport HUD layers (HP / stamina) that are chrome, not a panel; verified in-world 2026-11-05
  function toast(msg) {
    var t = document.getElementById('shdUiToast');
    if (!t) { t = document.createElement('div'); t.id = 'shdUiToast'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100000;pointer-events:none;padding:8px 14px;border-radius:10px;' +
        'background:linear-gradient(180deg,rgba(12,18,30,.92),rgba(5,8,15,.96));border:1px solid rgba(232,196,92,.34);color:#e9f4ee;' +
        "font:600 11px/1 'Chakra Petch','IBM Plex Mono',ui-monospace,sans-serif;letter-spacing:.1em;transition:opacity .35s;opacity:0";
      document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = '0'; }, 2200);
  }
  function sweepUi() {
    if (!uiOff || !document.body) return;
    var vw = innerWidth, vh = innerHeight, kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i]; if (KEEP[e.id] || e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'CANVAS' || e.hasAttribute('data-shd-uioff')) continue;
      var s = getComputedStyle(e); if ((s.position !== 'fixed' && s.position !== 'absolute') || s.display === 'none' || s.visibility === 'hidden') continue;
      var r = e.getBoundingClientRect(); if (r.width * r.height > vw * vh * 0.4 && !FULLSCREEN_HUD[e.id]) continue;   // an opened panel: the player asked for it
      e.setAttribute('data-shd-uioff', e.style.visibility || '-'); e.style.visibility = 'hidden';
    }
  }
  function setUiOff(on) {
    uiOff = !!on;
    if (uiOff) sweepUi();
    else [].forEach.call(document.querySelectorAll('[data-shd-uioff]'), function (e) { var v = e.getAttribute('data-shd-uioff'); e.style.visibility = v === '-' ? '' : v; e.removeAttribute('data-shd-uioff'); });
    if (!uiOff) apply();                                                                    // re-assert the per-piece prefs above
    toast(uiOff ? 'UI HIDDEN · F2 TO SHOW' : 'UI SHOWN');
  }
  if (!/[?&]hideui=0/.test(location.search)) addEventListener('keydown', function (e) {
    if (e.code !== 'F2' || e.repeat) return; var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault(); setUiOff(!uiOff);
  });
  // CORNER TRAY (2026-11-06, owner: "the buttons in the bottom right corner need to be able to be dropped down or hide"): one chevron in
  // the corner folds away every small clickable overlay that sits bottom-right (venue/race/ship/shop/access buttons, whichever module made
  // them). Read-outs that do not take clicks (speedometers, chips with pointer-events:none) stay. Folded by default (clean screen);
  // the chevron shows how many are tucked away. Same switch in NAVI -> SETTINGS ("Bottom-right buttons").
  var CORNER_SKIP = { shdCornerTog: 1, navi: 1, naviBtn: 1 };
  function cornerItem(e, vw, vh) {
    if (KEEP[e.id] || CORNER_SKIP[e.id] || e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'CANVAS') return false;
    var st = getComputedStyle(e); if (st.position !== 'fixed' || st.display === 'none' || st.pointerEvents === 'none') return false;
    if (st.visibility === 'hidden' && !e.hasAttribute('data-shd-corner')) return false;
    var r = e.getBoundingClientRect(); if (!r.width || r.width * r.height > vw * vh * 0.12) return false;          // a real panel, not a button
    if (r.left < vw * 0.6 || r.top < vh * 0.55) return false;                                                    // bottom-right zone only
    return e.tagName === 'BUTTON' || e.tagName === 'A' || st.cursor === 'pointer' || !!e.querySelector('button,a,[onclick]');
  }
  var cornerTog = null;
  function sweepCorner() {
    if (!document.body || uiOff) return;
    var vw = innerWidth, vh = innerHeight, kids = document.body.children, n = 0;
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i]; if (!cornerItem(e, vw, vh)) continue; n++;
      if (!P.corner && !e.hasAttribute('data-shd-corner')) { e.setAttribute('data-shd-corner', e.style.visibility || '-'); e.style.visibility = 'hidden'; }
    }
    if (P.corner) [].forEach.call(document.querySelectorAll('[data-shd-corner]'), function (e) { var v = e.getAttribute('data-shd-corner'); e.style.visibility = v === '-' ? '' : v; e.removeAttribute('data-shd-corner'); });
    if (!cornerTog) {
      cornerTog = document.createElement('button'); cornerTog.id = 'shdCornerTog'; cornerTog.type = 'button';
      cornerTog.style.cssText = 'position:fixed;right:10px;bottom:46px;z-index:100001;min-width:30px;height:24px;padding:0 7px;border-radius:8px;cursor:pointer;' +
        "border:1px solid rgba(0,212,255,.45);background:rgba(5,14,34,.85);color:#7fe3ff;font:700 11px/1 'Chakra Petch',sans-serif;letter-spacing:.08em";
      cornerTog.onclick = function (ev) { ev.stopPropagation(); set('corner', !P.corner); toast(P.corner ? 'CORNER BUTTONS SHOWN' : 'CORNER BUTTONS TUCKED AWAY'); };
      document.body.appendChild(cornerTog);
    }
    cornerTog.style.display = n ? '' : 'none';
    cornerTog.textContent = P.corner ? '▾' : '▴ ' + n;
    cornerTog.title = P.corner ? 'Tuck the corner buttons away' : 'Show ' + n + ' corner button' + (n === 1 ? '' : 's');
    cornerTog.setAttribute('aria-expanded', P.corner ? 'true' : 'false');
  }
  setInterval(sweepCorner, 700);                                                              // buttons that modules add later get folded too
  setInterval(sweepUi, 700);                                                                  // notices/toasts that pop up while hidden stay hidden
  setInterval(apply, 1500);                                                                   // late-built elements (chat button, pill) get the rule too
  if (document.readyState !== 'loading') apply(); else addEventListener('DOMContentLoaded', apply);
  root.WorldHudPrefs = { get: function () { return Object.assign({}, P); }, set: set, apply: apply, LABELS: LABELS };
})(typeof window !== 'undefined' ? window : this);
