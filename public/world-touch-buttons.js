/* world-touch-buttons.js — PHONE CONTROLS: thumb-sized action buttons that drive the game's normal keyboard handling (every existing mechanic works from touch).
 * The move stick + look-drag already exist in the host; this adds Jump, Sprint (latch), Interact, Attack, Kick, Flip, Board/Mount, plus Navi / Map / Camera / Passive and a "more" tray.
 *   var tb = WorldTouch.create({ root: window, document: document, onFirstPress: fn, vibrate: fn }); tb.show(); tb.hide(); tb.press(id); tb.release(id)
 *   WorldTouch.BUTTONS  [{ id, label, code, mode: 'hold'|'tap'|'latch', zone: 'main'|'top'|'more' }]
 * Taps dispatch keydown then keyup (60 ms); holds keep the key down while the finger is on the button; latch toggles (sprint). Multi-touch safe (pointer events per button).
 * Layout: main cluster bottom-right (jump is the big one), top strip for Navi/Map/Camera/Passive, a "..." tray for the rest. Safe-area aware, hidden on desktop, never blocks the look zone.
 */
(function (root) {
  'use strict';
  var BUTTONS = [
    { id: 'jump', label: 'JUMP', code: 'Space', key: ' ', mode: 'hold', zone: 'main', big: true },
    { id: 'use', label: 'E', code: 'KeyE', key: 'e', mode: 'tap', zone: 'main', hint: 'Interact / enter / sit' },
    { id: 'attack', label: 'Q', code: 'KeyQ', key: 'q', mode: 'tap', zone: 'main', hint: 'Attack' },
    { id: 'kick', label: 'KICK', code: 'KeyK', key: 'k', mode: 'tap', zone: 'main' },
    { id: 'flip', label: 'F', code: 'KeyF', key: 'f', mode: 'tap', zone: 'main', hint: 'Flip / special' },
    { id: 'sprint', label: 'RUN', code: 'ShiftLeft', key: 'Shift', mode: 'latch', zone: 'main' },
    { id: 'board', label: 'RIDE', code: 'KeyO', key: 'o', mode: 'tap', zone: 'main', hint: 'Hoverboard' },
    { id: 'navi', label: 'NAVI', code: 'KeyY', key: 'y', mode: 'tap', zone: 'more' },   // the on-screen NAVI [Y] pill is already tappable; this one lives in the tray
    { id: 'map', label: 'MAP', code: 'KeyH', key: 'h', mode: 'tap', zone: 'top' },
    { id: 'cam', label: 'VIEW', code: 'KeyV', key: 'v', mode: 'tap', zone: 'top' },
    { id: 'passive', label: 'PEACE', code: 'Backslash', key: '\\', mode: 'tap', zone: 'top', hint: 'Passive mode' },
    { id: 'mount', label: 'MOUNT', code: 'KeyI', key: 'i', mode: 'tap', zone: 'more' },
    { id: 'bike', label: 'BIKE', code: 'KeyB', key: 'b', mode: 'tap', zone: 'more' },
    { id: 'item', label: 'ITEM', code: 'KeyR', key: 'r', mode: 'tap', zone: 'more' },
    { id: 'x', label: 'X', code: 'KeyX', key: 'x', mode: 'tap', zone: 'more' },
    { id: 'grab', label: 'G', code: 'KeyG', key: 'g', mode: 'tap', zone: 'more' },
    { id: 'roll', label: 'ROLL', code: 'KeyZ', key: 'z', mode: 'tap', zone: 'more' },
    { id: 'roll2', label: 'C', code: 'KeyC', key: 'c', mode: 'tap', zone: 'more' },
    { id: 'talk', label: 'TALK', code: 'KeyT', key: 't', mode: 'tap', zone: 'more' },
    { id: 'fast', label: 'TIME', code: 'KeyN', key: 'n', mode: 'tap', zone: 'more' }
  ];
  var BY = {}; BUTTONS.forEach(function (b) { BY[b.id] = b; });
  function create(o) {
    o = o || {}; var win = o.root || root, doc = o.document || (typeof document !== 'undefined' ? document : null), down = {}, latched = {}, first = false, el = null, tray = null, shown = false;
    function fire(type, b) { var ev; try { ev = new win.KeyboardEvent(type, { code: b.code, key: b.key, bubbles: true, cancelable: true }); } catch (e) { ev = { type: type, code: b.code, key: b.key, bubbles: true, preventDefault: function () { }, stopPropagation: function () { } }; } win.dispatchEvent(ev); }
    function buzz() { try { (o.vibrate || (win.navigator && win.navigator.vibrate && win.navigator.vibrate.bind(win.navigator)) || function () { })(8); } catch (e) { } }
    function press(id) {
      var b = BY[id]; if (!b) return false; if (!first) { first = true; if (o.onFirstPress) o.onFirstPress(); }
      buzz();
      if (b.mode === 'latch') { latched[id] = !latched[id]; fire(latched[id] ? 'keydown' : 'keyup', b); paint(id); return true; }
      if (down[id]) return true; down[id] = true; fire('keydown', b); paint(id);
      if (b.mode === 'tap') setTimeout(function () { release(id); }, 60);
      return true;
    }
    function release(id) { var b = BY[id]; if (!b || b.mode === 'latch' || !down[id]) return false; down[id] = false; fire('keyup', b); paint(id); return true; }
    function releaseAll() { Object.keys(down).forEach(function (k) { if (down[k]) release(k); }); Object.keys(latched).forEach(function (k) { if (latched[k]) { latched[k] = false; fire('keyup', BY[k]); paint(k); } }); }
    var nodes = {};
    function paint(id) { var n = nodes[id]; if (!n) return; var on = down[id] || latched[id]; n.style.background = on ? 'rgba(0,255,156,.38)' : 'rgba(6,8,11,.55)'; n.style.borderColor = on ? '#00ff9c' : 'rgba(232,196,92,.55)'; }
    function build() {
      if (!doc || el) return; el = doc.createElement('div'); el.id = 'touchButtons';
      el.style.cssText = 'position:fixed;inset:0;z-index:9000;pointer-events:none;display:none;font:700 12px system-ui,sans-serif;touch-action:none;-webkit-user-select:none;user-select:none';
      var main = doc.createElement('div'), top = doc.createElement('div'); tray = doc.createElement('div');
      main.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:230px;height:230px';
      top.style.cssText = 'position:absolute;right:max(10px,env(safe-area-inset-right));top:max(128px,calc(env(safe-area-inset-top) + 118px));display:flex;gap:8px';
      tray.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));bottom:260px;display:none;flex-wrap:wrap;gap:8px;width:230px;justify-content:flex-end';
      var pos = { jump: [96, 62, 84], use: [8, 118, 62], attack: [60, 168, 56], kick: [136, 0, 58], flip: [170, 70, 56], sprint: [4, 40, 54], board: [166, 138, 56] };   // [x, y, size] inside the 230x230 cluster (y from top)
      BUTTONS.forEach(function (b) {
        var n = doc.createElement('div'); n.textContent = b.label; n.title = b.hint || ''; nodes[b.id] = n;
        var base = 'pointer-events:auto;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#e8f6ee;border:2px solid rgba(232,196,92,.55);background:rgba(6,8,11,.55);backdrop-filter:blur(3px);touch-action:none;';
        if (b.zone === 'main') { var p = pos[b.id] || [0, 0, 54]; n.style.cssText = base + 'position:absolute;left:' + p[0] + 'px;top:' + p[1] + 'px;width:' + p[2] + 'px;height:' + p[2] + 'px;font-size:' + (b.big ? 15 : 12) + 'px'; main.appendChild(n); }
        else if (b.zone === 'top') { n.style.cssText = base + 'width:48px;height:36px;border-radius:12px;font-size:10px'; top.appendChild(n); }
        else { n.style.cssText = base + 'width:50px;height:40px;border-radius:12px;font-size:11px'; tray.appendChild(n); }
        n.addEventListener('pointerdown', function (e) { if (e.preventDefault) e.preventDefault(); if (n.setPointerCapture && e.pointerId != null) { try { n.setPointerCapture(e.pointerId); } catch (x) { } } press(b.id); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { n.addEventListener(t, function () { release(b.id); }); });
      });
      var more = doc.createElement('div'); more.textContent = '...'; more.style.cssText = 'pointer-events:auto;display:flex;align-items:center;justify-content:center;width:48px;height:36px;border-radius:12px;border:2px solid rgba(232,196,92,.55);background:rgba(6,8,11,.55);color:#e8f6ee;font-size:16px';
      more.addEventListener('pointerdown', function (e) { if (e.preventDefault) e.preventDefault(); tray.style.display = tray.style.display === 'none' ? 'flex' : 'none'; }); top.appendChild(more);
      el.appendChild(main); el.appendChild(top); el.appendChild(tray); doc.body.appendChild(el);
    }
    return { show: function () { build(); if (el) el.style.display = 'block'; shown = true; }, hide: function () { if (el) el.style.display = 'none'; releaseAll(); shown = false; }, press: press, release: release, releaseAll: releaseAll, isShown: function () { return shown; }, held: function () { return Object.keys(down).filter(function (k) { return down[k]; }).concat(Object.keys(latched).filter(function (k) { return latched[k]; })); }, el: function () { return el; } };
  }
  root.WorldTouch = { BUTTONS: BUTTONS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
