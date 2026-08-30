/* ══════════════════════════════════════════════════════════════════════
   PRE-LANDING INTRO — the doors being forged.

   Not a separate movie. The Seed of Life draws itself, expands past the
   frame, and the six doors arrive in its wake — so the cutscene IS the
   interface appearing, rather than a thing you sit through before the
   interface appears.

   Seven circles because there are seven agents; the figure is the one
   already in the product's language (home.html's chakra spine, the sacred
   geometry running through the descent).

   MONOCHROME, deliberately. Each circle used to carry its own agent's accent —
   seven saturated hues blooming at once, which read as a rainbow rather than
   as a rite. The figure is now drawn entirely in emerald, with gold arriving
   only at the moment the seed completes. One hue holding, one hue landing.

   RULES IT OBEYS, because an intro that ignores these becomes the thing
   people hate about a site:
     · once per session, never on every navigation
     · skippable by any input, at any moment
     · skipped entirely under prefers-reduced-motion
     · hard ceiling — if anything stalls, it removes itself anyway
     · never blocks the page underneath; the doors are already there
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var KEY = 'shd_intro_seen';
  var DUR = 2600;          // total run
  var CEILING = 4200;      // absolute kill, whatever happens

  function alreadySeen() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function play(opts) {
    opts = opts || {};
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || alreadySeen() || opts.force === false) { return finish(null, opts); }
    markSeen();

    var host = document.createElement('div');
    host.id = 'shdIntro';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML =
      '<canvas id="shdIntroC"></canvas>' +
      '<div class="ii-word">SHADDAI</div>' +
      '<button class="ii-skip" type="button">skip</button>';
    document.body.appendChild(host);

    var style = document.createElement('style');
    style.textContent = [
      '#shdIntro{position:fixed;inset:0;z-index:400;background:var(--void,#06080b);',
      'display:grid;place-items:center;transition:opacity .55s cubic-bezier(.22,.7,.2,1)}',
      '#shdIntro.out{opacity:0;pointer-events:none}',
      '#shdIntroC{position:absolute;inset:0;width:100%;height:100%;display:block}',
      '.ii-word{position:relative;font-family:var(--f-display,"Cinzel",serif);font-weight:900;',
      'letter-spacing:.42em;font-size:clamp(20px,4.6vw,46px);color:var(--ink,#e9efe9);',
      'opacity:0;transform:translateY(6px);text-indent:.42em;',
      'transition:opacity .9s cubic-bezier(.22,.7,.2,1),transform .9s cubic-bezier(.22,.7,.2,1)}',
      '.ii-word.in{opacity:1;transform:none}',
      '.ii-skip{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));left:50%;',
      'transform:translateX(-50%);font-family:var(--f-mono,monospace);font-size:10px;',
      'letter-spacing:.24em;text-transform:uppercase;color:var(--ink-faint,#4f5d57);',
      'background:none;border:0;cursor:pointer;min-height:44px;padding:0 18px}',
      '.ii-skip:hover{color:var(--ink,#e9efe9)}'
    ].join('');
    document.head.appendChild(style);

    var cv = host.querySelector('#shdIntroC');
    var ctx = cv.getContext('2d');
    var word = host.querySelector('.ii-word');
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var W = 0, H = 0;

    function size() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    root.addEventListener('resize', size);

    /* the seven agents' accents, in council order */
    var HUES = ['#e8c45c', '#00ff9c', '#e8c45c', '#00ff9c', '#00ff9c', '#e8c45c', '#e8c45c'];

    var t0 = performance.now();
    var done = false;
    var raf = 0;

    function ease(p) { return 1 - Math.pow(1 - p, 3); }

    function frame(now) {
      if (done) return;
      var t = (now - t0) / DUR;              // 0..1
      if (t > 1) t = 1;

      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2;
      var R = Math.min(W, H) * 0.17;

      /* 0 → .18   the seed: one point of light
         .18 → .72 six circles draw around it, staggered
         .72 → 1   the whole figure expands past the frame and dissolves    */
      var expand = t < 0.72 ? 0 : ease((t - 0.72) / 0.28);
      var scale = 1 + expand * 2.6;
      var fade = 1 - expand;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = fade;
      ctx.lineWidth = 1.15;

      // the centre point, breathing
      var seed = Math.min(1, t / 0.18);
      if (seed > 0) {
        var pr = 2.6 + Math.sin(now / 160) * 0.9;
        ctx.beginPath();
        ctx.arc(cx, cy, pr * seed, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff9c';
        ctx.shadowColor = '#00ff9c'; ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // seven circles — the centre plus six on the hex
      for (var i = 0; i < 7; i++) {
        var start = 0.18 + i * 0.072;
        var p = (t - start) / 0.30;
        if (p <= 0) continue;
        if (p > 1) p = 1;
        p = ease(p);

        var ang = (i - 1) * (Math.PI / 3) - Math.PI / 2;
        var ox = i === 0 ? cx : cx + Math.cos(ang) * R;
        var oy = i === 0 ? cy : cy + Math.sin(ang) * R;

        ctx.beginPath();
        ctx.arc(ox, oy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        ctx.strokeStyle = HUES[i];
        ctx.globalAlpha = fade * (0.30 + 0.55 * p);
        ctx.shadowColor = HUES[i]; ctx.shadowBlur = 12 * p;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // the spoke out to each centre — the council joined to the crown
        if (i > 0 && p > 0.4) {
          var sp = (p - 0.4) / 0.6;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (ox - cx) * sp, cy + (oy - cy) * sp);
          ctx.globalAlpha = fade * 0.22 * sp;
          ctx.stroke();
        }
      }
      ctx.restore();

      if (t > 0.42) word.classList.add('in');
      if (t >= 1) return end();
      raf = requestAnimationFrame(frame);
    }

    function end() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      host.classList.add('out');
      setTimeout(function () {
        try { host.remove(); style.remove(); } catch (e) {}
        finish(host, opts);
      }, 560);
    }

    host.querySelector('.ii-skip').addEventListener('click', end);
    host.addEventListener('click', end);
    root.addEventListener('keydown', end, { once: true });
    root.addEventListener('touchstart', end, { once: true, passive: true });
    setTimeout(end, CEILING);          // never strand a visitor behind it

    raf = requestAnimationFrame(frame);
  }

  /* the doors arrive in the figure's wake, staggered */
  function finish(host, opts) {
    var tiles = document.querySelectorAll('.slot');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* The solids are drawn on ONE shared fixed canvas, scissored per tile from
       each tile's rect — it has no idea a tile is mid-fade. Left alone, the
       geometry hangs in empty space while the tiles are still at opacity 0.
       Fade the whole canvas with the stagger and hand it back afterwards. */
    var gl = document.getElementById('gl');
    if (reduced) {
      tiles.forEach(function (t) { t.style.opacity = ''; t.style.transform = ''; });
      if (gl) { gl.style.opacity = ''; gl.style.transition = ''; }
      return;
    }
    if (gl) { gl.style.opacity = '0'; gl.style.transition = 'opacity .8s cubic-bezier(.22,.7,.2,1)'; }
    tiles.forEach(function (t, i) {
      t.style.opacity = '0';
      t.style.transform = 'translateY(14px)';
      setTimeout(function () {
        t.style.transition = 'opacity .7s cubic-bezier(.22,.7,.2,1), transform .7s cubic-bezier(.22,.7,.2,1)';
        t.style.opacity = ''; t.style.transform = '';
        // hand styling back to the stylesheet so hover still works
        setTimeout(function () { t.style.transition = ''; }, 760);
      }, 60 + i * 85);
    });
    // bring the solids up once the last door has landed
    var last = 60 + Math.max(0, tiles.length - 1) * 85;
    setTimeout(function () {
      if (gl) gl.style.opacity = '1';
      setTimeout(function () { if (gl) { gl.style.transition = ''; gl.style.opacity = ''; } }, 850);
    }, last + 120);

    if (opts && typeof opts.onDone === 'function') opts.onDone();
  }

  root.SHDIntro = { play: play, seen: alreadySeen };
})(window);
