/* world-colosseum-intro.js — the COLOSSEUM INTRO (2026-10-23, owner: "finish the colosseum intro").
 *
 * When the player enters the arena (interiors open + window.__colosseumArena.group visible), a 5.5 s cinematic plays once per entry:
 * letterbox bars, a descending orbit over the bowl that swoops down to the arena floor, "SHADDAI COLOSSEUM" title + subtitle, and a
 * synthesised crowd swell (WebAudio noise + two drum hits, no files). Any key / click / tap skips. The camera is driven through a
 * render hook (renderer.render wrapped once) so no game system has to know; control returns the moment it ends.
 *   WorldColosseumIntro.init({ isInside(): bool })   ?colointro=0 = off   WorldColosseumIntro.play() = replay (debug)
 */
(function (root) {
  'use strict';
  var st = { on: false, t0: 0, dur: 5.5, center: null, size: 200, was: false, last: 0 }, ov = null, ctx = null, hooked = false;
  function arena() { var A = root.__colosseumArena; return A && A.group && A.group.visible ? A : null; }
  function hook() {
    var D = root.__w3dDebug; if (hooked || !D || !D.renderer) return; hooked = true;
    var r0 = D.renderer.render.bind(D.renderer);
    D.renderer.render = function (s, c) {
      if (st.on && st.center) {
        var k = Math.min(1, (performance.now() - st.t0) / 1000 / st.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in-out
        var R = st.size * (0.6 - 0.38 * e), Hh = st.size * (0.38 - 0.31 * e), a = -1.1 + 2.0 * e;
        c.position.set(st.center.x + Math.sin(a) * R, st.center.y + Hh, st.center.z + Math.cos(a) * R);
        c.lookAt(st.center.x, st.center.y + st.size * 0.02, st.center.z); c.updateMatrixWorld(true);
        if (k >= 1) end();
      }
      r0(s, c);
    };
  }
  function crowd() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return; ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime, len = ctx.sampleRate * 5, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 900));
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
      s.connect(f); f.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.2); s.start(t); s.stop(t + 5.3);
      [1.2, 3.4].forEach(function (dt) { var o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(90, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.5); o.connect(og); og.connect(ctx.destination); og.gain.setValueAtTime(0.5, t + dt); og.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.7); o.start(t + dt); o.stop(t + dt + 0.8); });
    } catch (e) { }
  }
  function overlay() {
    ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;pointer-events:auto;cursor:pointer;font-family:"Chakra Petch",system-ui,sans-serif';
    ov.innerHTML = '<div style="position:absolute;left:0;right:0;top:0;height:11vh;background:#000;transform:translateY(-100%);transition:transform .5s"></div>' +
      '<div style="position:absolute;left:0;right:0;bottom:0;height:11vh;background:#000;transform:translateY(100%);transition:transform .5s"></div>' +
      '<div style="position:absolute;left:0;right:0;bottom:16vh;text-align:center;opacity:0;transition:opacity 1s 1.2s">' +
      '<div style="font:700 clamp(28px,5vw,64px)/1 \'Chakra Petch\',system-ui;letter-spacing:.32em;color:#f5d27a;text-shadow:0 0 24px rgba(232,196,92,.6)">SHADDAI COLOSSEUM</div>' +
      '<div style="margin-top:10px;font:600 clamp(12px,1.4vw,18px) system-ui;letter-spacing:.4em;color:#e8f6ff;opacity:.85">THE ARENA AWAITS</div></div>' +
      '<div style="position:absolute;right:20px;bottom:calc(11vh + 12px);font:600 12px system-ui;color:#cfe;opacity:.6">any key · skip &nbsp;·&nbsp; inside: ] spectator cams, X back</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.children[0].style.transform = 'none'; ov.children[1].style.transform = 'none'; ov.children[2].style.opacity = 1; });
    ov.addEventListener('click', end);
  }
  function onKey() { if (st.on) end(); }
  function play() {
    var A = arena(), T = root.__w3dDebug && root.__w3dDebug.THREE; if (!A || !T) return;
    hook();
    if (!st.center) { var box = new T.Box3().setFromObject(A.group), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()); st.center = { x: c.x, y: box.min.y, z: c.z }; st.size = Math.max(60, Math.max(sz.x, sz.z)); }
    st.on = true; st.t0 = performance.now(); st.last = Date.now(); overlay(); crowd();
    addEventListener('keydown', onKey, true);
  }
  function end() {
    if (!st.on) return; st.on = false; removeEventListener('keydown', onKey, true);
    if (ov) { var o = ov; ov = null; o.style.transition = 'opacity .45s'; o.style.opacity = 0; setTimeout(function () { o.remove(); }, 480); }
  }
  function init(o) {
    if (typeof location !== 'undefined' && /[?&]colointro=0/.test(location.search || '')) return;
    setInterval(function () {
      var inA = !!(arena() && (!o || !o.isInside || o.isInside()));
      if (inA && !st.was && Date.now() - st.last > 60000) play();   // once per entry (and not again within a minute)
      st.was = inA;
    }, 250);
  }
  root.WorldColosseumIntro = { init: init, play: play, end: end };
})(typeof window !== 'undefined' ? window : this);
