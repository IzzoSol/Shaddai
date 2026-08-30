/* ══════════════════════════════════════════════════════════════════════════
   PRE-LANDING INTRO — the sovereign boot.

   WHAT CHANGED AND WHY: this was a quiet Seed-of-Life bloom, which read as
   thin next to the dashboard's own boot cinematic (#shaddai-boot-overlay —
   glitch wordmark, scanlines, ticking diagnostics, agents coming online one by
   one). The front door is the first thing anyone sees, so the weakest
   cinematic was on the most important screen. This ports that language out to
   where it counts and then goes further: the boot resolves INTO the geometry,
   and the geometry becomes the doors.

   RECOLOURED ON THE WAY OVER. The dashboard version gives each of the seven
   agents its own hue — seven saturated colours at once, which is exactly the
   rainbow the front door was just cleaned of. Here the whole sequence is
   emerald, with gold arriving only at the moment the council completes.

   THE RULES IT STILL OBEYS, because an intro that ignores these becomes the
   thing people hate about a site:
     · once per session, never on every navigation
     · skippable by ANY input, at any moment
     · skipped entirely under prefers-reduced-motion
     · hard ceiling — if anything stalls it removes itself anyway
     · never blocks the doors underneath; they are already there
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'shd_intro_seen';
  var CEILING = 5200;          // absolute maximum on screen, whatever happens
  var EM = '#00ff9c', GOLD = '#e8c45c';

  function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce || seen()) { mark(); return; }
  mark();

  /* The seven, in the order they come online. Roles are the real ones from
     the agent registry, not invented for the animation. */
  var AGENTS = [
    ['SHADDAI', 'SOVEREIGN ORCHESTRATOR'],
    ['NEXUS',   'TECHNICAL ARCHITECT'],
    ['ZEROX',   'REVENUE ENGINE'],
    ['ORACLE',  'INTELLIGENCE MATRIX'],
    ['TURTLE',  'CREATIVE SYSTEMS'],
    ['QUILL',   'COMMS ARRAY'],
    ['PIKADON', 'SECURITY PERIMETER'],
  ];
  /* Diagnostics that are TRUE. Inventing "QUANTUM BRIDGE SYNCHRONIZED" is the
     kind of detail that makes someone trust the rest of the product less once
     they realise it means nothing. */
  var DIAGS = [
    ['KNOWLEDGE BASE', '401,767 PASSAGES'],
    ['TOOL REGISTRY', '554 EXECUTABLE'],
    ['AGENT COUNCIL', '7 ONLINE'],
    ['SIGNAL FEED', 'LIVE'],
    ['KEY VAULT', 'AES-256-GCM'],
    ['MCP BRIDGE', 'READY'],
  ];

  var css = document.createElement('style');
  css.textContent = [
    '#shd-boot{position:fixed;inset:0;z-index:9000;background:#04060a;display:grid;place-items:center;',
      'font-family:"IBM Plex Mono",ui-monospace,monospace;overflow:hidden;',
      'transition:opacity .5s ease, clip-path .7s cubic-bezier(.4,0,.2,1)}',
    '#shd-boot.out{opacity:0;pointer-events:none}',
    '#shd-boot .scan{position:absolute;inset:0;pointer-events:none;opacity:.55;',
      'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,156,.028) 2px,rgba(0,255,156,.028) 4px);',
      'animation:shd-scan 9s linear infinite}',
    '@keyframes shd-scan{to{background-position:0 10px}}',
    '#shd-boot .vig{position:absolute;inset:0;pointer-events:none;',
      'background:radial-gradient(120% 90% at 50% 45%,transparent 42%,rgba(0,0,0,.85) 100%)}',
    '#shd-boot canvas{position:absolute;inset:0;width:100%;height:100%}',
    '#shd-boot .inner{position:relative;z-index:2;width:min(760px,90vw);display:flex;',
      'flex-direction:column;align-items:center;gap:clamp(14px,2.6vw,26px)}',
    '#shd-boot .word{font-family:"Cinzel",serif;font-weight:900;letter-spacing:.22em;',
      'font-size:clamp(30px,8.5vw,68px);color:#e9efe9;line-height:1;position:relative}',
    '#shd-boot .word.glitch::before,#shd-boot .word.glitch::after{content:attr(data-t);position:absolute;left:0;top:0;width:100%}',
    '#shd-boot .word.glitch::before{color:' + EM + ';animation:shd-gl1 .55s steps(2) 3}',
    '#shd-boot .word.glitch::after{color:' + GOLD + ';animation:shd-gl2 .55s steps(2) 3}',
    '@keyframes shd-gl1{0%,100%{transform:none;opacity:0}20%{transform:translate(-3px,1px);opacity:.85}60%{transform:translate(2px,-1px);opacity:.5}}',
    '@keyframes shd-gl2{0%,100%{transform:none;opacity:0}35%{transform:translate(3px,-1px);opacity:.7}75%{transform:translate(-2px,1px);opacity:.4}}',
    '#shd-boot .ver{font-size:clamp(8px,1.5vw,10px);letter-spacing:.34em;color:#5c6b64;text-transform:uppercase}',
    '#shd-boot .rule{width:100%;height:1px;background:linear-gradient(90deg,transparent,' + EM + '55,transparent);',
      'transform:scaleX(0);transform-origin:50%;transition:transform .7s cubic-bezier(.22,.7,.2,1)}',
    '#shd-boot .rule.on{transform:scaleX(1)}',
    '#shd-boot .cols{display:grid;grid-template-columns:1fr 1fr;gap:clamp(10px,2vw,22px);width:100%}',
    '@media(max-width:560px){#shd-boot .cols{grid-template-columns:1fr;gap:9px}',
      '#shd-boot .col:last-child{display:none}}',   /* one column on a phone, not two cramped ones */
    '#shd-boot .col{border:1px solid rgba(120,150,140,.2);background:rgba(10,14,19,.6);padding:10px 12px;min-height:0}',
    '#shd-boot .ch{font-size:8.5px;letter-spacing:.24em;color:' + EM + ';text-transform:uppercase;margin-bottom:8px;opacity:.8}',
    '#shd-boot .ln{display:flex;justify-content:space-between;gap:10px;font-size:clamp(9px,1.8vw,11px);',
      'color:#93a49b;padding:2.5px 0;opacity:0;transform:translateY(3px);transition:opacity .3s,transform .3s}',
    '#shd-boot .ln.on{opacity:1;transform:none}',
    '#shd-boot .ln b{color:#e9efe9;font-weight:500}',
    '#shd-boot .ln .v{color:' + EM + ';white-space:nowrap}',
    '#shd-boot .ln.gold .v{color:' + GOLD + '}',
    '#shd-boot .foot{font-size:9px;letter-spacing:.2em;color:#5c6b64;text-transform:uppercase;',
      'display:flex;gap:8px;align-items:center}',
    '#shd-boot .bar{width:min(300px,60vw);height:2px;background:rgba(120,150,140,.18);overflow:hidden}',
    '#shd-boot .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,' + EM + ',' + GOLD + ');',
      'transition:width .3s linear}',
    '#shd-boot .skip{position:absolute;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:3;',
      'font-size:9px;letter-spacing:.2em;color:#4f5d57;text-transform:uppercase;',
      'border:1px solid rgba(120,150,140,.2);background:none;padding:9px 13px;min-height:38px;cursor:pointer}',
    '#shd-boot .skip:hover{color:#e9efe9}',
  ].join('');
  document.head.appendChild(css);

  var ov = document.createElement('div');
  ov.id = 'shd-boot';
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML =
    '<canvas id="shdGeo"></canvas><div class="scan"></div><div class="vig"></div>' +
    '<div class="inner">' +
      '<div style="text-align:center">' +
        '<div class="word glitch" data-t="SHADDAI">SHADDAI</div>' +
        '<div class="ver" style="margin-top:9px">Sovereign Terminal · Seven Agents</div>' +
      '</div>' +
      '<div class="rule" id="shdRule"></div>' +
      '<div class="cols">' +
        '<div class="col"><div class="ch">▸ Council</div><div id="shdA"></div></div>' +
        '<div class="col"><div class="ch">▸ Systems</div><div id="shdD"></div></div>' +
      '</div>' +
      '<div class="foot"><span class="bar"><i id="shdBar"></i></span><span id="shdPct">0%</span></div>' +
    '</div>' +
    '<button class="skip" type="button">Skip</button>';
  (document.body || document.documentElement).appendChild(ov);

  var A = ov.querySelector('#shdA'), D = ov.querySelector('#shdD');
  AGENTS.forEach(function (a) {
    var d = document.createElement('div');
    d.className = 'ln';
    d.innerHTML = '<b>' + a[0] + '</b><span class="v">ONLINE</span>';
    d.title = a[1];
    A.appendChild(d);
  });
  DIAGS.forEach(function (x) {
    var d = document.createElement('div');
    d.className = 'ln';
    d.innerHTML = '<b>' + x[0] + '</b><span class="v">' + x[1] + '</span>';
    D.appendChild(d);
  });

  /* ── the geometry, behind the terminal ──────────────────────────────────
     Seven circles for seven agents — the figure already in the product's
     language. Drawn in one hue and scaled up through the sequence so the
     boot resolves INTO the geometry rather than cutting to it. */
  var cv = ov.querySelector('#shdGeo'), ctx = cv.getContext('2d');
  var t0 = performance.now(), raf = 0;
  function frame(now) {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var W = ov.offsetWidth, H = ov.offsetHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var p = Math.min((now - t0) / 4200, 1);
    var ease = 1 - Math.pow(1 - p, 3);
    var R = Math.min(W, H) * (0.16 + ease * 0.5);
    var cx = W / 2, cy = H / 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,255,156,' + (0.30 * (1 - p * 0.55)) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i + ease * 0.32;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,196,92,' + (0.18 * ease) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, R * 2, 0, Math.PI * 2); ctx.stroke();

    if (p < 1) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  /* ── the sequence ──────────────────────────────────────────────────────── */
  var lines = [].slice.call(ov.querySelectorAll('.ln'));
  var bar = ov.querySelector('#shdBar'), pct = ov.querySelector('#shdPct');
  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  at(420, function () { ov.querySelector('#shdRule').classList.add('on'); });

  // Agents and systems interleave so both columns fill together.
  var order = [];
  for (var i = 0; i < Math.max(AGENTS.length, DIAGS.length); i++) {
    if (i < AGENTS.length) order.push(lines[i]);
    if (i < DIAGS.length) order.push(lines[AGENTS.length + i]);
  }
  order.forEach(function (el, i) {
    at(620 + i * 145, function () {
      el.classList.add('on');
      var done = (i + 1) / order.length;
      bar.style.width = Math.round(done * 100) + '%';
      pct.textContent = Math.round(done * 100) + '%';
      // the last line lands in gold — one hue holding, one hue arriving
      if (i === order.length - 1) el.classList.add('gold');
    });
  });

  function close() {
    if (ov.classList.contains('out')) return;
    ov.classList.add('out');
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 560);
  }

  at(620 + order.length * 145 + 480, close);
  at(CEILING, close);                       // hard ceiling, whatever stalled

  // ANY input dismisses it — a cinematic you cannot escape is a bug.
  ['click', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
    ov.addEventListener(ev, close, { passive: true });
    document.addEventListener(ev, close, { passive: true, once: true });
  });
})();
