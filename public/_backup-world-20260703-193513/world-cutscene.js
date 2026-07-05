/* world-cutscene.js — cinematic building-entry / exit transition overlay.
 *
 * API:
 *   window.buildWorldCutscene() → { play(opts, done), isPlaying() }
 *
 *   play(opts, done)
 *     opts.name   {string}  — destination label, e.g. "THE MUSEUM"
 *     opts.color  {number}  — accent color as 0xRRGGBB integer (default 0x34e5b0)
 *     opts.kind   {string}  — 'enter' | 'exit'   (default 'enter')
 *     done        {function} — invoked ONCE at the visual midpoint (≈420 ms),
 *                              when the screen is fully covered. The world swaps
 *                              scene here; the overlay then reveals the new scene.
 *
 *   isPlaying() → boolean
 *
 * Visual:
 *   1. Two letterbox bars (top + bottom) slide in with a neon-glowing inner edge.
 *   2. A dark radial overlay fades in behind them (full occlusion by ~380 ms).
 *   3. A conic warp-streak pattern spins slowly at screen centre.
 *   4. A neon iris ring blooms at centre.
 *   5. "ENTERING · THE MUSEUM" title card + sub-line fade in.
 *   → done() fires at ~420 ms (screen fully covered / teleport window).
 *   6. Exit phase (~780 ms): bars slide out, overlay fades, iris bursts outward.
 *   Total duration: ~1.2 s.
 *
 * Pure DOM/CSS — no WebGL, no per-frame allocations.
 * Appends one <style> tag to <head> (once), temporary overlay to <body>.
 * Guards against double-play.  Cancels cleanly via an internal timer list.
 */
window.buildWorldCutscene = (function () {
  'use strict';

  // ── inject shared CSS once ────────────────────────────────────────────────
  var _cssInjected = false;
  function _injectCSS() {
    if (_cssInjected || document.getElementById('sc-style')) { _cssInjected = true; return; }
    _cssInjected = true;
    var el = document.createElement('style');
    el.id = 'sc-style';
    el.textContent = [
      /* ── overlay shell ── */
      '.sc-overlay{',
        'position:fixed;top:0;left:0;right:0;bottom:0;',
        'z-index:99999;overflow:hidden;pointer-events:all;',
        'opacity:0;transition:opacity 0.07s linear;',
      '}',
      '.sc-overlay.sc-active{opacity:1;}',

      /* ── letterbox bars ── */
      '.sc-bar{',
        'position:absolute;left:0;right:0;height:90px;overflow:hidden;',
        'background:linear-gradient(180deg,#05050f 0%,#09091e 100%);',
      '}',
      '.sc-bar-top{top:0;transform:translateY(-100%);}',
      '.sc-bar-bot{bottom:0;transform:translateY(100%);}',

      /* neon edge on inner face of each bar */
      '.sc-bar-top::after,.sc-bar-bot::after{',
        'content:"";position:absolute;left:0;right:0;height:2px;',
        'background:var(--sc-color,#34e5b0);',
        'box-shadow:0 0 14px 5px var(--sc-color,#34e5b0),',
                   '0 0 36px 12px var(--sc-glow,rgba(52,229,176,0.45));',
      '}',
      '.sc-bar-top::after{bottom:0;}',
      '.sc-bar-bot::after{top:0;}',

      /* ── body fill between bars ── */
      '.sc-body{',
        'position:absolute;left:0;right:0;top:90px;bottom:90px;',
        'background:radial-gradient(ellipse at 50% 50%,',
          'rgba(4,4,18,0.72) 0%,rgba(0,0,8,0.96) 100%);',
        'opacity:0;',
      '}',

      /* ── warp streak layer (conic-gradient set inline per call) ── */
      '.sc-warp{',
        'position:absolute;top:90px;left:0;right:0;bottom:90px;',
        'opacity:0;transform-origin:50% 50%;',
      '}',

      /* ── iris ring ── */
      '.sc-iris{',
        'position:absolute;top:50%;left:50%;',
        'width:176px;height:176px;border-radius:50%;',
        'border:2px solid var(--sc-color,#34e5b0);',
        'transform:translate(-50%,-50%) scale(0);',
        'opacity:0;',
      '}',

      /* ── title card ── */
      '.sc-title{',
        'position:absolute;',
        'top:calc(50% - 18px);left:50%;',
        'transform:translate(-50%,-50%) translateY(10px);',
        'font-family:"Orbitron","Share Tech Mono","Courier New",monospace;',
        'font-size:clamp(12px,1.9vw,19px);',
        'letter-spacing:0.30em;font-weight:700;',
        'color:#fff;opacity:0;white-space:nowrap;',
        'pointer-events:none;user-select:none;',
      '}',

      /* ── sub-line ── */
      '.sc-sub{',
        'position:absolute;',
        'top:calc(50% + 24px);left:50%;',
        'transform:translate(-50%,-50%);',
        'font-family:"Share Tech Mono","Courier New",monospace;',
        'font-size:clamp(8px,1.1vw,11px);',
        'letter-spacing:0.22em;',
        'color:rgba(255,255,255,0.42);opacity:0;',
        'white-space:nowrap;pointer-events:none;user-select:none;',
      '}',

      /* ── ENTER animations ── */
      '.sc-active .sc-bar-top{',
        'animation:sc-barT-in 0.37s cubic-bezier(0.22,0.61,0.36,1) forwards;',
      '}',
      '.sc-active .sc-bar-bot{',
        'animation:sc-barB-in 0.37s cubic-bezier(0.22,0.61,0.36,1) forwards;',
      '}',
      '.sc-active .sc-body{',
        'animation:sc-fadein 0.30s ease forwards 0.05s;',
      '}',
      '.sc-active .sc-warp{',
        'animation:sc-fadein 0.34s ease forwards,sc-spin 3.2s linear infinite;',
      '}',
      '.sc-active .sc-iris{',
        'animation:sc-iris-bloom 0.40s cubic-bezier(0.34,1.46,0.64,1) forwards 0.08s;',
      '}',
      '.sc-active .sc-title{',
        'animation:sc-title-in 0.26s ease forwards 0.15s;',
      '}',
      '.sc-active .sc-sub{',
        'animation:sc-fadein 0.24s ease forwards 0.23s;',
      '}',

      /* ── EXIT animations (override enter with !important) ── */
      '.sc-exit .sc-bar-top{',
        'animation:sc-barT-out 0.56s cubic-bezier(0.65,0,0.35,1) forwards !important;',
      '}',
      '.sc-exit .sc-bar-bot{',
        'animation:sc-barB-out 0.56s cubic-bezier(0.65,0,0.35,1) forwards !important;',
      '}',
      '.sc-exit .sc-body{',
        'animation:sc-fadeout 0.46s ease forwards !important;',
      '}',
      '.sc-exit .sc-warp{',
        'animation:sc-fadeout 0.38s ease forwards !important;',
      '}',
      '.sc-exit .sc-iris{',
        'animation:sc-iris-burst 0.46s ease forwards !important;',
      '}',
      '.sc-exit .sc-title{',
        'animation:sc-fadeout 0.20s ease forwards !important;',
      '}',
      '.sc-exit .sc-sub{',
        'animation:sc-fadeout 0.18s ease forwards !important;',
      '}',

      /* ── keyframes ── */
      '@keyframes sc-barT-in  {to{transform:translateY(0);}}',
      '@keyframes sc-barB-in  {to{transform:translateY(0);}}',
      '@keyframes sc-barT-out {to{transform:translateY(-100%);}}',
      '@keyframes sc-barB-out {to{transform:translateY(100%);}}',
      '@keyframes sc-fadein   {to{opacity:1;}}',
      '@keyframes sc-fadeout  {to{opacity:0;}}',
      '@keyframes sc-spin     {to{transform:rotate(360deg);}}',
      '@keyframes sc-iris-bloom{',
        '0%  {transform:translate(-50%,-50%) scale(0);   opacity:0;}',
        '65% {transform:translate(-50%,-50%) scale(1.09);opacity:1;}',
        '100%{transform:translate(-50%,-50%) scale(1);   opacity:1;}',
      '}',
      '@keyframes sc-iris-burst{',
        'to{transform:translate(-50%,-50%) scale(3.8);opacity:0;}',
      '}',
      '@keyframes sc-title-in{',
        'from{opacity:0;transform:translate(-50%,-50%) translateY(10px);}',
        'to  {opacity:1;transform:translate(-50%,-50%) translateY(0);}',
      '}',
    ].join('');
    document.head.appendChild(el);
  }

  // ── factory ───────────────────────────────────────────────────────────────
  return function buildWorldCutscene() {
    _injectCSS();

    var _playing = false;
    var _timers  = [];

    function _clearTimers() {
      for (var i = 0; i < _timers.length; i++) clearTimeout(_timers[i]);
      _timers.length = 0;
    }

    function _remove(el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    return {

      isPlaying: function () { return _playing; },

      play: function (opts, done) {
        if (_playing) return;    // guard double-play
        _playing = true;
        _clearTimers();

        opts = opts || {};
        var name  = ((opts.name  || 'DESTINATION') + '').toUpperCase();
        var color = (opts.color != null) ? (opts.color | 0) : 0x34e5b0;
        var kind  = opts.kind === 'exit' ? 'LEAVING' : 'ENTERING';

        // extract r/g/b for rgba() strings (no regex, no allocation)
        var cr = (color >> 16) & 0xff;
        var cg = (color >>  8) & 0xff;
        var cb =  color        & 0xff;
        var hex    = '#' + ('000000' + color.toString(16)).slice(-6);
        var glow   = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.45)';
        var ray35  = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.35)';
        var ray12  = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.12)';
        var glowSh = '0 0 24px 8px ' + hex + ',inset 0 0 24px 6px ' + hex;

        var label = kind + ' · ' + name;
        var sub   = kind === 'ENTERING' ? '▣ INITIALIZING SECTOR ▣' : '↩ RETURNING TO WORLD ↩';

        // ── build overlay DOM ───────────────────────────────────────────────
        var ov = document.createElement('div');
        ov.className = 'sc-overlay';
        // CSS custom props flow to all ::before/::after children
        ov.style.cssText = '--sc-color:' + hex + ';--sc-glow:' + glow + ';';

        var barT = document.createElement('div');
        barT.className = 'sc-bar sc-bar-top';

        var barB = document.createElement('div');
        barB.className = 'sc-bar sc-bar-bot';

        var body = document.createElement('div');
        body.className = 'sc-body';

        // warp: 8 thin radial rays as conic-gradient, set inline (color-aware)
        var warp = document.createElement('div');
        warp.className = 'sc-warp';
        warp.style.background = [
          'conic-gradient(from 0deg,',
          'transparent 0deg,'   + ray35 + ' 1.5deg,transparent 3deg,',
          'transparent 41deg,'  + ray12 + ' 42.5deg,transparent 44deg,',
          'transparent 88deg,'  + ray35 + ' 89.5deg,transparent 91deg,',
          'transparent 131deg,' + ray12 + ' 132.5deg,transparent 134deg,',
          'transparent 178deg,' + ray35 + ' 179.5deg,transparent 181deg,',
          'transparent 221deg,' + ray12 + ' 222.5deg,transparent 224deg,',
          'transparent 267deg,' + ray35 + ' 268.5deg,transparent 270deg,',
          'transparent 311deg,' + ray12 + ' 312.5deg,transparent 314deg)',
        ].join('');

        var iris = document.createElement('div');
        iris.className = 'sc-iris';
        iris.style.borderColor = hex;
        iris.style.boxShadow   = glowSh;

        var title = document.createElement('div');
        title.className   = 'sc-title';
        title.textContent = label;
        title.style.textShadow = '0 0 18px ' + hex + ',0 0 38px ' + ray35;

        var subEl = document.createElement('div');
        subEl.className   = 'sc-sub';
        subEl.textContent = sub;

        ov.appendChild(barT);
        ov.appendChild(barB);
        ov.appendChild(body);
        ov.appendChild(warp);
        ov.appendChild(iris);
        ov.appendChild(title);
        ov.appendChild(subEl);
        document.body.appendChild(ov);

        // reflow guard — forces layout before CSS transitions start
        void ov.offsetWidth;
        ov.classList.add('sc-active');

        // ── midpoint: screen fully covered ─────────────────────────────────
        // Bars finish at ~370ms; body overlay opaque by ~350ms.
        // We call done() at 420ms (50ms buffer) then switch to exit phase.
        _timers.push(setTimeout(function () {
          if (typeof done === 'function') {
            try { done(); } catch (e) {}
          }
          ov.classList.add('sc-exit');
        }, 420));

        // ── cleanup: exit phase lasts ~780ms after done() ──────────────────
        _timers.push(setTimeout(function () {
          _remove(ov);
          _playing = false;
        }, 1200));
      }

    }; // return API object
  }; // return factory

}());
