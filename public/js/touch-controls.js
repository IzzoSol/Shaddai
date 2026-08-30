/* ============================================================================
   SHDTouch - shared on-screen touch layer for the SHADDAI action games
   (dodgeball, soccer, xt-adventure).

   These three games share ONE input model: a global `keys{}` truth-map that the
   per-frame update loop reads, plus a handful of edge-triggered action
   functions fired from keydown/keyup. So the helper does exactly two things:

     - a virtual stick that writes into that same `keys{}` map
     - hold/tap buttons that call the same action functions

   Nothing here touches the keyboard or mouse paths - they keep working as-is.
   The layer is only created on touch-capable devices; on a desktop this file
   defines SHDTouch and then does nothing at all.

   Multi-touch: the stick tracks one touch identifier and each button tracks its
   own, so a thumb on the stick and a thumb on a button are fully independent.
   ========================================================================= */
(function (global) {
  'use strict';

  function isTouchDevice() {
    try {
      return ('ontouchstart' in global) ||
             (global.matchMedia && global.matchMedia('(pointer: coarse)').matches) ||
             (global.navigator && global.navigator.maxTouchPoints > 0);
    } catch (e) { return false; }
  }

  var CSS_ID = 'shd-touch-css';
  var CSS = [
    '#shd-tc{position:fixed;inset:0;z-index:9000;pointer-events:none;',
    '  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;',
    '  font-family:Orbitron,system-ui,sans-serif;transition:opacity .18s ease;}',
    '#shd-tc.shd-tc-off{opacity:0;pointer-events:none;}',
    '#shd-tc .shd-stick{position:absolute;left:14px;bottom:18px;',
    '  width:132px;height:132px;border-radius:50%;',
    '  pointer-events:auto;touch-action:none;',
    '  background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.05),rgba(0,0,0,.30));',
    '  border:2px solid rgba(0,240,255,.34);box-shadow:0 0 18px rgba(0,240,255,.18);}',
    '#shd-tc .shd-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;',
    '  border-radius:50%;background:rgba(0,240,255,.30);border:2px solid rgba(0,240,255,.70);',
    '  box-shadow:0 0 16px rgba(0,240,255,.45);pointer-events:none;}',
    '#shd-tc .shd-btns{position:absolute;right:12px;bottom:16px;display:flex;',
    '  flex-wrap:wrap-reverse;justify-content:flex-end;align-items:flex-end;gap:10px;max-width:52vw;}',
    '#shd-tc .shd-btn{pointer-events:auto;touch-action:none;min-width:60px;min-height:60px;',
    '  padding:0 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    '  font-size:12px;font-weight:800;letter-spacing:.5px;text-align:center;line-height:1.05;',
    '  color:#eafcff;background:rgba(8,16,24,.45);border:2px solid rgba(0,255,136,.45);',
    '  box-shadow:0 0 14px rgba(0,255,136,.16);text-shadow:0 0 6px rgba(0,255,136,.6);}',
    '#shd-tc .shd-btn.shd-wide{min-width:76px;min-height:76px;font-size:13px;',
    '  border-color:rgba(255,43,214,.6);box-shadow:0 0 18px rgba(255,43,214,.22);',
    '  text-shadow:0 0 6px rgba(255,43,214,.7);}',
    '#shd-tc .shd-btn.shd-on{background:rgba(0,255,136,.34);transform:scale(.94);}',
    '@media (max-height:430px){#shd-tc .shd-stick{width:112px;height:112px}',
    '  #shd-tc .shd-knob{width:50px;height:50px;margin:-25px 0 0 -25px}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Stop the browser's own touch gestures (scroll / pull-to-refresh / double-tap
     zoom) inside the game surface ONLY. The rest of the page is untouched. */
  function lockCanvas(canvas) {
    if (!canvas) return;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  }

  /**
   * create(opts)
   *   keys     : the game's live keys{} map (required for the stick)
   *   keyNames : {up,down,left,right} key strings to write (default wasd)
   *   canvas   : canvas element to apply touch-action:none to
   *   deadzone : 0..1 fraction of the stick radius (default .22)
   *   buttons  : [{ label, wide?, down(), up()? }]
   *   visible  : optional () => boolean, polled to show/hide the overlay
   */
  function create(opts) {
    opts = opts || {};
    if (!isTouchDevice()) return null;
    if (document.getElementById('shd-tc')) return null;
    injectCss();
    lockCanvas(opts.canvas);

    var keys = opts.keys || {};
    var kn = opts.keyNames || { up: 'w', down: 's', left: 'a', right: 'd' };
    var dead = typeof opts.deadzone === 'number' ? opts.deadzone : 0.22;

    var root = document.createElement('div');
    root.id = 'shd-tc';

    /* ---------------- stick ---------------- */
    var stick = document.createElement('div');
    stick.className = 'shd-stick';
    stick.setAttribute('aria-label', 'movement stick');
    var knob = document.createElement('div');
    knob.className = 'shd-knob';
    stick.appendChild(knob);
    root.appendChild(stick);

    var stickId = null, cx = 0, cy = 0, radius = 66;

    function clearMove() {
      keys[kn.up] = false; keys[kn.down] = false;
      keys[kn.left] = false; keys[kn.right] = false;
      knob.style.transform = 'translate(0px,0px)';
    }

    function applyVec(dx, dy) {
      var r = radius || 66;
      var len = Math.hypot(dx, dy);
      if (len > r) { dx = dx / len * r; dy = dy / len * r; len = r; }
      knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      if (len / r < dead) {
        keys[kn.up] = false; keys[kn.down] = false;
        keys[kn.left] = false; keys[kn.right] = false;
        return;
      }
      var nx = dx / r, ny = dy / r;
      keys[kn.left]  = nx < -dead;
      keys[kn.right] = nx >  dead;
      keys[kn.up]    = ny < -dead;
      keys[kn.down]  = ny >  dead;
    }

    function pickTouch(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }

    stick.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (stickId !== null) return;
      var t = e.changedTouches[0];
      stickId = t.identifier;
      var r = stick.getBoundingClientRect();
      // A hidden/zero-size context would give radius 0; fall back to the styled
      // size so the vector maths still resolves a direction.
      var w = r.width || 132, h = r.height || 132;
      cx = r.left + w / 2; cy = r.top + h / 2;
      radius = w / 2;
      applyVec(t.clientX - cx, t.clientY - cy);
    }, { passive: false });

    stick.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (stickId === null) return;
      var t = pickTouch(e.changedTouches, stickId);
      if (!t) return;
      applyVec(t.clientX - cx, t.clientY - cy);
    }, { passive: false });

    function endStick(e) {
      if (stickId === null) return;
      if (e && e.changedTouches && !pickTouch(e.changedTouches, stickId)) return;
      if (e) e.preventDefault();
      stickId = null;
      clearMove();
    }
    stick.addEventListener('touchend', endStick, { passive: false });
    stick.addEventListener('touchcancel', endStick, { passive: false });

    /* Public handle. Declared before the buttons so their handlers can record
       what fired - this is also what the automated touch tests read. */
    var api = {
      root: root, stick: stick, knob: knob, buttons: null,
      keys: keys, keyNames: kn, lastAction: null, lastError: null,
      show: function () { root.classList.remove('shd-tc-off'); },
      hide: function () { root.classList.add('shd-tc-off'); },
      destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };

    /* ---------------- buttons ---------------- */
    var wrapB = document.createElement('div');
    wrapB.className = 'shd-btns';
    var made = [];
    (opts.buttons || []).forEach(function (spec) {
      var b = document.createElement('div');
      b.className = 'shd-btn' + (spec.wide ? ' shd-wide' : '');
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', spec.label);
      b.dataset.act = spec.label;
      b.textContent = spec.label;
      var myId = null;

      b.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (myId !== null) return;
        myId = e.changedTouches[0].identifier;
        b.classList.add('shd-on');
        api.lastAction = spec.label + ':down';
        try { if (spec.down) spec.down(); } catch (err) { api.lastError = String(err); }
      }, { passive: false });

      function up(e) {
        if (myId === null) return;
        if (e && e.changedTouches && !pickTouch(e.changedTouches, myId)) return;
        if (e) e.preventDefault();
        myId = null;
        b.classList.remove('shd-on');
        api.lastAction = spec.label + ':up';
        try { if (spec.up) spec.up(); } catch (err) { api.lastError = String(err); }
      }
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      wrapB.appendChild(b);
      made.push(b);
    });
    root.appendChild(wrapB);

    (document.body || document.documentElement).appendChild(root);

    /* Release everything if the window loses focus mid-hold. */
    global.addEventListener('blur', function () { stickId = null; clearMove(); });

    api.buttons = made;

    /* Optional visibility gate (fade the pad out on menus / cutscenes). It stays
       in the DOM either way so nothing has to be rebuilt. */
    if (typeof opts.visible === 'function') {
      var last = null;
      var poll = function () {
        var v;
        try { v = !!opts.visible(); } catch (e) { v = true; }
        if (v !== last) { last = v; if (v) api.show(); else api.hide(); }
      };
      poll();
      setInterval(poll, 200);
    }
    return api;
  }

  global.SHDTouch = { isTouchDevice: isTouchDevice, create: create, lockCanvas: lockCanvas };
})(window);
