/* ══════════════════════════════════════════════════════════════════════
   SHADDAI — SHARED FRONT-DOOR CHROME  (shd-chrome.js)

   The three controls that every front-door screen needs, implemented once:

     theme    six skins, sharing the app-wide `shd_theme_skin` key
     sign-in  optional, never gates anything
     bios     the dwell-to-reveal preference, shared across screens

   The module injects its own styles and its own sheets, so a page only has
   to render buttons and call openTheme() / openAuth(). Consumers style the
   sheets through the tokens they already define (--void2, --edge, --ink…).

   Sign-in uses endpoints that ALREADY EXIST. Nothing under backend/ is
   modified by this file or by anything that calls it:
     POST /api/auth/login                                   email + password
     GET  /api/wallet/nonce  ->  POST /api/wallet/session    Solana signature
   Identity is written to the same localStorage keys shd-tier.js reads, so
   plan/tier resolution keeps working untouched.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  if (root.SHDChrome) return;

  /* A reload starts a clean visitor: identity is scoped to the current tab
     session, so refreshing the page signs you out. Navigation between doors
     (which the browser reports as "navigate") keeps the session, so signing
     in once still carries your work across SHADDAI. Legacy browsers report
     the type via performance.navigation.type instead of the NavigationTiming
     entry. */
  (function freshSession() {
    try {
      var t = null;
      if (performance.getEntriesByType) {
        var nav = performance.getEntriesByType('navigation')[0];
        t = nav && nav.type;
      }
      if (!t && performance.navigation) {
        t = ({ 0: 'navigate', 1: 'reload', 2: 'back_forward', 255: 'reserved' })[performance.navigation.type];
      }
      if (t === 'reload') {
        ['shd_userid', 'shd_token'].forEach(function (k) {
          sessionStorage.removeItem(k); localStorage.removeItem(k);
        });
      }
    } catch (e) {}
  })();

  /* Obsidian stays first and stays the default — emerald/gold/neon is the
     house identity. The three PAIRS below are complements (opposite sides of
     the wheel), which is why they read as designed rather than as two colours
     that happen to be on screen: warm against cool, each carrying its own
     ground so the page is never just a recoloured dark. */
  var SKINS = [
    { id: 'glitch', name: 'Obsidian', dot: '#00ff9c' },
    { id: 'ember', name: 'Ember', dot: '#ff7a2f' },      // orange × violet
    { id: 'royal', name: 'Royal', dot: '#b07cff' },      // violet × gold
    { id: 'tide', name: 'Tide', dot: '#5fe0ff' },        // cyan × emerald
    { id: 'void', name: 'Void', dot: '#e8e8e8' },
    { id: 'terminal', name: 'Terminal', dot: '#00ff41' },
    { id: 'amber', name: 'Amber', dot: '#ffb000' },
    { id: 'brutalist', name: 'Brutalist', dot: '#f5c000' },
    { id: 'serif', name: 'Serif', dot: '#3a6b4a' },
    { id: 'frost', name: 'Frost', dot: '#5b7cff' },     // cool light
    { id: 'linen', name: 'Linen', dot: '#1f7a52' },     // warm light
    { id: 'bone', name: 'Bone', dot: '#c8a227' },       // high-contrast light
    /* GRADIENT SKINS. The others are single-accent; these three carry a real
       two-hue sweep across the page ground, which is why they are named for the
       transition rather than for a colour. Grouped last so the picker reads as
       "solids, then gradients" instead of an unsorted pile. */
    { id: 'nebula', name: 'Nebula', dot: '#b07cff', grad: true },   // violet -> magenta
    { id: 'sunset', name: 'Sunset', dot: '#ff7a2f', grad: true },   // orange -> rose
    { id: 'aurora', name: 'Aurora', dot: '#00ff9c', grad: true }    // emerald -> violet
  ];

  var skinSubs = [], authSubs = [], dwellSubs = [];
  function fire(list, v) { list.forEach(function (f) { try { f(v); } catch (e) {} }); }

  /* ── styles ───────────────────────────────────────────────────────────── */
  /* The pair skins live HERE rather than per-page: injected at runtime into
     <head>, so any screen using the shared chrome picks them up with no
     duplication. Each sets its own ground (--void) as well as its accents —
     a theme that only swaps accents on the same black reads as a filter, not
     a theme. */
  /* --shell is the colour anything drawing ON the page should paint with:
     near-black on dark skins, near-white on light ones. It exists because the
     3D solids bake their shell colour into a material — without a token to
     read, every new light theme silently turns them into black blobs. Set it
     once per skin and the canvas follows automatically. */
  var PAIR_SKINS = [
    ':root{--shell:#06080b}',

    /* ══ GRADIENT SKINS ═════════════════════════════════════════════════════
       A real sweep on the page ground, not a tinted flat colour. Each keeps
       ONE accent for interface elements — the gradient lives in the background
       and the accent stays legible on top of every part of it, which is the
       whole difficulty with gradient themes and the reason most look cheap. */
    'html[data-theme-skin="nebula"]{--shell:#0a0614;--void:#0a0614;--void2:#120a22;' +
      '--panel:#170d2b;--edge:rgba(176,124,255,.22);--accent:#c79cff;--emerald:#c79cff;' +
      '--gold:#ff9ee6;--ink:#f2ecff;--ink-soft:#b4a3cf;--ink-faint:#6f6090;' +
      '--g1:rgba(176,124,255,.13);--g2:rgba(255,110,220,.08);--g3:rgba(90,40,160,.10)}',
    'html[data-theme-skin="nebula"] body{background:' +
      'radial-gradient(120% 85% at 15% 0%,#2a1150 0%,transparent 55%),' +
      'radial-gradient(110% 80% at 90% 100%,#4a1240 0%,transparent 58%),#0a0614}',

    'html[data-theme-skin="sunset"]{--shell:#140806;--void:#140806;--void2:#1e0c08;' +
      '--panel:#26100b;--edge:rgba(255,122,47,.24);--accent:#ff9a5c;--emerald:#ff9a5c;' +
      '--gold:#ffd27a;--ink:#fff0e6;--ink-soft:#d4a992;--ink-faint:#8a6250;' +
      '--g1:rgba(255,122,47,.14);--g2:rgba(255,90,120,.09);--g3:rgba(120,30,10,.12)}',
    'html[data-theme-skin="sunset"] body{background:' +
      'radial-gradient(120% 85% at 10% 0%,#5a1c0a 0%,transparent 55%),' +
      'radial-gradient(115% 80% at 95% 100%,#5c1030 0%,transparent 58%),#140806}',

    'html[data-theme-skin="aurora"]{--shell:#04100e;--void:#04100e;--void2:#071a16;' +
      '--panel:#0a2220;--edge:rgba(0,255,156,.22);--accent:#5cffc4;--emerald:#5cffc4;' +
      '--gold:#b07cff;--ink:#e8fff6;--ink-soft:#8fc4b2;--ink-faint:#4e7a6c;' +
      '--g1:rgba(0,255,156,.12);--g2:rgba(120,90,255,.09);--g3:rgba(0,90,110,.11)}',
    'html[data-theme-skin="aurora"] body{background:' +
      'radial-gradient(120% 85% at 12% 0%,#0a4a3a 0%,transparent 55%),' +
      'radial-gradient(115% 80% at 92% 100%,#231a5c 0%,transparent 58%),#04100e}',


    /* three LIGHT skins, and none of them are the cream-plus-terracotta
       default — Frost is cold, Linen is green, Bone is near-white with gold. */
    'html[data-theme-skin="frost"]{--shell:#f4f6fb;--void:#eef1f7;--void2:#e4e9f2;--panel:#fbfcfe;',
    '--edge:rgba(40,55,90,.16);--ink:#141a26;--ink-soft:#4a5568;--ink-faint:#8a94a6;',
    '--g1:rgba(91,124,255,.16);--g2:rgba(120,200,255,.12);--g3:rgba(160,140,255,.08)}',

    'html[data-theme-skin="linen"]{--shell:#f7f5ee;--void:#f2efe4;--void2:#e8e4d6;--panel:#fbfaf5;',
    '--edge:rgba(30,60,45,.16);--ink:#15201a;--ink-soft:#4b5b51;--ink-faint:#8b978f;',
    '--g1:rgba(31,122,82,.15);--g2:rgba(200,170,80,.12);--g3:rgba(60,110,90,.07)}',

    'html[data-theme-skin="bone"]{--shell:#fcfbf8;--void:#faf9f6;--void2:#efece5;--panel:#ffffff;',
    '--edge:rgba(20,18,12,.18);--ink:#0d0c08;--ink-soft:#4a463c;--ink-faint:#8d887c;',
    '--g1:rgba(200,162,39,.18);--g2:rgba(20,18,12,.06);--g3:rgba(160,130,40,.09)}',

    /* richer mixes on the dark pairs — three stops that actually travel across
       the hue wheel rather than two tints of one colour */
    'html[data-theme-skin="ember"]{--void:#0b0705;--void2:#120b07;--panel:#18100a;',
    '--edge:rgba(255,122,47,.18);--ink:#f6ece4;--ink-soft:#c2a08c;--ink-faint:#7a5a46;',
    '--g1:rgba(255,122,47,.17);--g2:rgba(176,124,255,.13);--g3:rgba(255,45,110,.09)}',
    'html[data-theme-skin="royal"]{--void:#07060d;--void2:#0c0a16;--panel:#120f1f;',
    '--edge:rgba(176,124,255,.18);--ink:#efeaf8;--ink-soft:#a89bc4;--ink-faint:#5f5480;',
    '--g1:rgba(176,124,255,.17);--g2:rgba(232,196,92,.12);--g3:rgba(80,140,255,.09)}',
    'html[data-theme-skin="tide"]{--void:#04090c;--void2:#071016;--panel:#0a171f;',
    '--edge:rgba(95,224,255,.18);--ink:#e6f4f6;--ink-soft:#8fb3bd;--ink-faint:#4a6b75;',
    '--g1:rgba(95,224,255,.16);--g2:rgba(0,255,156,.13);--g3:rgba(120,120,255,.09)}'
  ].join('');

  var CSS = [
    /* blur ONLY while open — a permanent backdrop-filter layer never stops
       compositing, which over a WebGL canvas looks like the page has frozen
       blurry once the sheet closes. visibility removes it outright. */
    '.shdc-scrim{position:fixed;inset:0;z-index:60;background:rgba(3,5,7,.72);opacity:0;',
    'pointer-events:none;visibility:hidden;',
    'transition:opacity .35s cubic-bezier(.22,.7,.2,1),visibility 0s linear .35s}',
    '.shdc-scrim.on{opacity:1;pointer-events:auto;visibility:visible;',
    'transition:opacity .35s cubic-bezier(.22,.7,.2,1),visibility 0s linear 0s}',
    /* sheet = centered modal. Never a bottom drawer: a drawer lands off-screen
       and needs scrolling, and its blur-heavy scrim over the WebGL canvas is
       what read as the whole site freezing. Dropping the blur leaves a plain
       dim scrim that costs nothing to composite. */
    '.shdc-sheet{position:fixed;z-index:61;left:50%;top:50%;width:min(560px,calc(100vw - 32px));',
    'transform:translate(-50%,-58%) scale(.965);transition:transform .4s cubic-bezier(.22,.7,.2,1),opacity .3s;',
    'background:var(--void2,#0a0e13);border:1px solid var(--edge,rgba(120,150,140,.16));',
    'border-radius:6px;padding:22px clamp(16px,4vw,26px) calc(22px + env(safe-area-inset-bottom));',
    'max-height:82dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--ink,#e9efe9);',
    'font-family:var(--f-serif,Georgia,serif);line-height:1.5;opacity:0;visibility:hidden;pointer-events:none;',
    'box-shadow:0 34px 90px rgba(0,0,0,.55)}',
    '.shdc-sheet.on{transform:translate(-50%,-50%) scale(1);opacity:1;visibility:visible;pointer-events:auto}',
    /* sign-in is a popover tucked under the top-right pill — not a sheet, and
       never a grey full-screen scrim. Clicking anywhere else (or Esc) dismisses. */
    '.shdc-auth{left:auto;right:clamp(14px,3.2vw,40px);top:calc(clamp(14px,2.6vw,24px) + 50px + env(safe-area-inset-top));',
    'transform-origin:top right;width:min(352px,calc(100vw - 28px))}',
    '.shdc-auth.on{transform:translate(0,0) scale(1)}',
    '.shdc-auth:not(.on){transform:translate(0,8px) scale(.985)}',
    '.shdc-sheet h2{font-family:var(--f-display,serif);font-weight:700;font-size:16px;letter-spacing:.14em;text-transform:uppercase;margin:0}',
    '.shdc-sheet .hint{font-size:13px;color:var(--ink-faint,#4f5d57);margin:5px 0 0;font-style:italic}',
    '.shdc-x{position:absolute;top:14px;right:14px;font-family:var(--f-mono,monospace);font-size:11px;',
    'letter-spacing:.14em;color:var(--ink-faint,#4f5d57);min-height:40px;min-width:40px;background:none;border:0;cursor:pointer}',
    '.shdc-x:hover{color:var(--ink,#e9efe9)}',
    '.shdc-skins{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}',
    '.shdc-skins button{display:flex;align-items:center;gap:8px;border:1px solid var(--edge,rgba(120,150,140,.14));',
    'border-radius:2px;padding:0 13px;min-height:44px;font-family:var(--f-mono,monospace);font-size:10.5px;',
    'letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft,#93a49b);background:none;cursor:pointer;',
    'transition:border-color .25s,color .25s}',
    '.shdc-skins button:hover,.shdc-skins button.on{color:var(--ink,#e9efe9);border-color:#00ff9c}',
    '.shdc-skins button i{width:9px;height:9px;border-radius:50%;background:var(--d);display:block}',
    '.shdc-f{display:block;margin-top:12px}',
    '.shdc-f span{font-family:var(--f-mono,monospace);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-faint,#4f5d57)}',
    '.shdc-f input{width:100%;margin-top:6px;background:var(--panel,#0e141b);border:1px solid var(--edge,rgba(120,150,140,.14));',
    'border-radius:2px;color:var(--ink,#e9efe9);font-family:var(--f-mono,monospace);font-size:15px;padding:13px 14px;min-height:48px;outline:none}',
    '.shdc-f input:focus{border-color:#00ff9c}',
    '.shdc-btn{width:100%;margin-top:15px;min-height:50px;border-radius:2px;font-family:var(--f-mono,monospace);',
    'font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;border:1px solid #00ff9c;color:#06080b;',
    'background:#00ff9c;font-weight:600;cursor:pointer;transition:filter .2s}',
    '.shdc-btn:hover{filter:brightness(1.1)}.shdc-btn[disabled]{opacity:.45;cursor:default}',
    '.shdc-btn.ghost{background:none;color:var(--ink,#e9efe9);border-color:var(--edge,rgba(120,150,140,.14))}',
    '.shdc-btn.ghost:hover{border-color:#b07cff;color:#b07cff;filter:none}',
    '.shdc-or{text-align:center;font-family:var(--f-mono,monospace);font-size:9.5px;letter-spacing:.24em;',
    'text-transform:uppercase;color:var(--ink-faint,#4f5d57);margin:16px 0 2px}',
    '.shdc-msg{font-family:var(--f-mono,monospace);font-size:11px;margin-top:12px;min-height:16px;color:var(--ink-faint,#4f5d57)}',
    '.shdc-msg.bad{color:#ff6f6f}.shdc-msg.good{color:#00ff9c}',
    /* a user-picked ink overrides every skin's default text colour. Written as
       an equal-specificity attribute rule placed AFTER the pair skins, so the
       later declaration wins; setInk() also derives soft/faint tones. */
    'html[data-ink]{--ink:var(--shd-ink);--ink-soft:var(--shd-ink-soft);--ink-faint:var(--shd-ink-faint)}',
    '.shdc-ink{margin-top:16px;border-top:1px solid var(--edge,rgba(120,150,140,.12));padding-top:14px}',
    '.shdc-ink h3{font-family:var(--f-mono,monospace);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-faint,#4f5d57);margin:0 0 9px}',
    '.shdc-ink .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.shdc-ink button.sw{width:28px;height:28px;border-radius:50%;border:1px solid var(--edge,rgba(120,150,140,.3));cursor:pointer;padding:0;position:relative;background:var(--c,#fff)}',
    '.shdc-ink button.sw.on::after{content:"";position:absolute;inset:-5px;border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)}',
    '.shdc-ink input[type=color]{width:34px;height:34px;padding:0;border:1px solid var(--edge,rgba(120,150,140,.3));border-radius:4px;background:none;cursor:pointer}',
    '.shdc-ink .hex{width:100px;font-family:var(--f-mono,monospace);font-size:12px;background:var(--panel,#0e141b);border:1px solid var(--edge,rgba(120,150,140,.3));border-radius:2px;color:var(--ink,#e9efe9);padding:6px 8px;outline:none}',
    '.shdc-ink .hex:focus{border-color:#00ff9c}',
    '.shdc-ink .reset{margin-left:auto;font-family:var(--f-mono,monospace);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft,#93a49b);background:none;border:0;cursor:pointer}',
    '.shdc-ink .reset:hover{color:var(--ink,#e9efe9)}'
  ].join('');

  function injectOnce() {
    if (document.getElementById('shdc-css')) return;
    var st = document.createElement('style');
    st.id = 'shdc-css'; st.textContent = PAIR_SKINS + CSS;
    document.head.appendChild(st);
  }

  /* ── theme ────────────────────────────────────────────────────────────── */
  function getSkin() { try { return localStorage.getItem('shd_theme_skin') || 'glitch'; } catch (e) { return 'glitch'; } }
  function setSkin(id) {
    if (!SKINS.some(function (s) { return s.id === id; })) id = 'glitch';
    document.documentElement.setAttribute('data-theme-skin', id);
    try { localStorage.setItem('shd_theme_skin', id); } catch (e) {}
    var box = document.getElementById('shdc-skins');
    if (box) box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.skin === id); });
    fire(skinSubs, id);
    return id;
  }

  /* ── ink (font colour) ─────────────────────────────────────────────────
     Independent of the skin: the visitor can pick their own text colour on
     top of any theme. Persisted under shd_theme_ink and applied via the
     html[data-ink] override above, with soft/faint tones derived from it. */
  var INK_PRESETS = ['#e9efe9', '#ffffff', '#00ff9c', '#ff9a5c', '#c79cff', '#5ce6ff'];
  function hexToRgb(h) {
    h = (h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, f) { /* f>0 lighten, f<0 darken toward black */
    var c = hexToRgb(hex); if (!c) return hex;
    return 'rgb(' + Math.round(c.r + (255 - c.r) * Math.max(0, f)) + ',' +
      Math.round(c.g + (255 - c.g) * Math.max(0, f)) + ',' +
      Math.round(c.b + (255 - c.b) * Math.max(0, f)) + ')';
  }
  function getInk() { try { return localStorage.getItem('shd_theme_ink'); } catch (e) { return null; } }
  function applyInk(color) {
    var el = document.documentElement;
    if (!color || !hexToRgb(color)) { el.removeAttribute('data-ink'); el.style.removeProperty('--shd-ink'); return; }
    color = color.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    el.setAttribute('data-ink', '1');
    el.style.setProperty('--shd-ink', '#' + color);
    el.style.setProperty('--shd-ink-soft', shade(color, 0.38));
    el.style.setProperty('--shd-ink-faint', shade(color, 0.62));
  }
  function setInk(color) {
    if (!color) {
      try { localStorage.removeItem('shd_theme_ink'); } catch (e) {}
    } else {
      var c = (color || '').replace('#', '').replace(/[^0-9a-fA-F]/g, '');
      if (c.length !== 6) return getInk();
      try { localStorage.setItem('shd_theme_ink', '#' + c.toLowerCase()); } catch (e) {}
    }
    applyInk(color);
    var row = document.getElementById('shdc-ink-row');
    if (row) paintInkRow(row);
    return getInk();
  }
  function paintInkRow(row) {
    var cur = applyInk ? getInk() : getInk();
    var hexIn = row.querySelector('.hex');
    if (hexIn) hexIn.value = cur || '';
    row.querySelectorAll('button.sw').forEach(function (b) {
      b.classList.toggle('on', !!cur && cur.toLowerCase() === b.dataset.v.toLowerCase());
    });
  }

  /* ── dwell preference ─────────────────────────────────────────────────── */
  function getDwell() { try { return localStorage.getItem('shd_dwell_bios') !== '0'; } catch (e) { return true; } }
  function setDwell(v) {
    try { localStorage.setItem('shd_dwell_bios', v ? '1' : '0'); } catch (e) {}
    fire(dwellSubs, !!v);
    return !!v;
  }

  /* ── identity ─────────────────────────────────────────────────────────── */
  function user() {
    try {
      var u = sessionStorage.getItem('shd_userid') || localStorage.getItem('shd_userid');
      if (u && u.indexOf('guest') !== 0 && u !== 'local') return u;
    } catch (e) {}
    return null;
  }
  function shortId(u) { return u && u.length > 16 ? u.slice(0, 6) + '…' + u.slice(-4) : u; }
  function save(id, token) {
    try {
      if (id) { sessionStorage.setItem('shd_userid', id); localStorage.setItem('shd_userid', id); }
      if (token) { sessionStorage.setItem('shd_token', token); localStorage.setItem('shd_token', token); }
    } catch (e) {}
    fire(authSubs, user());
  }
  function signOut() {
    try {
      ['shd_userid', 'shd_token'].forEach(function (k) {
        sessionStorage.removeItem(k); localStorage.removeItem(k);
      });
    } catch (e) {}
    fire(authSubs, null);
  }

  /* base58 for the wallet signature — the verifier expects it, and this
     avoids pulling a dependency in for twenty lines of arithmetic. */
  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) {
    var d = [], i, j, c;
    for (i = 0; i < bytes.length; i++) {
      c = bytes[i];
      for (j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; }
      while (c > 0) { d.push(c % 58); c = (c / 58) | 0; }
    }
    var out = '';
    for (i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
    for (i = d.length - 1; i >= 0; i--) out += B58[d[i]];
    return out;
  }

  /* ── sheets ───────────────────────────────────────────────────────────── */
  var scrim, themeSheet, authSheet, built = false;

  function build() {
    if (built) return; built = true;
    injectOnce();

    scrim = document.createElement('div');
    scrim.className = 'shdc-scrim';
    scrim.addEventListener('click', closeSheets);

    themeSheet = document.createElement('div');
    themeSheet.className = 'shdc-sheet';
    themeSheet.setAttribute('role', 'dialog');
    themeSheet.setAttribute('aria-modal', 'true');
    themeSheet.innerHTML =
      '<button class="shdc-x" type="button" data-close>✕ close</button>' +
      '<h2>Theme</h2>' +
      '<p class="hint">Shared with the rest of SHADDAI — your choice follows you into the dashboard.</p>' +
      '<div class="shdc-skins" id="shdc-skins"></div>' +
      '<div class="shdc-ink" id="shdc-ink">' +
        '<h3>Font colour</h3>' +
        '<div class="row" id="shdc-ink-row">' +
          '<button type="button" class="reset" data-ink-reset title="Use each theme\u2019s default">reset</button>' +
        '</div>' +
      '</div>';

    authSheet = document.createElement('div');
    authSheet.className = 'shdc-sheet shdc-auth';
    authSheet.setAttribute('role', 'dialog');
    authSheet.setAttribute('aria-modal', 'true');
    authSheet.innerHTML =
      '<button class="shdc-x" type="button" data-close>✕ close</button>' +
      '<h2>Sign in</h2>' +
      '<p class="hint">Optional. Nothing is locked behind it — signing in just carries your work between the doors.</p>' +
      '<form id="shdc-form" autocomplete="on">' +
        '<label class="shdc-f"><span>email</span><input id="shdc-email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@example.com"></label>' +
        '<label class="shdc-f"><span>password</span><input id="shdc-pass" type="password" name="password" autocomplete="current-password" placeholder="••••••••"></label>' +
        '<button class="shdc-btn" id="shdc-go" type="submit">Enter</button>' +
      '</form>' +
      '<div class="shdc-or">or</div>' +
      /* Solana connect removed from the FRONT DOOR. Asking a first-time
         visitor to connect a crypto wallet before they know what the product
         is loses people who would otherwise have signed up with an email —
         and nothing on this page needs an on-chain identity. The wallet flow
         still exists in the dashboard, where a wallet actually does something. */
      '<div class="shdc-msg" id="shdc-msg"></div>' +
      '<button class="shdc-btn ghost" id="shdc-out" type="button" style="display:none">Sign out</button>';

    document.body.appendChild(scrim);
    document.body.appendChild(themeSheet);
    document.body.appendChild(authSheet);

    [themeSheet, authSheet].forEach(function (s) {
      s.querySelector('[data-close]').addEventListener('click', closeSheets);
    });

    var box = themeSheet.querySelector('#shdc-skins');
    SKINS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.skin = s.id; b.style.setProperty('--d', s.dot);
      b.innerHTML = '<i></i>' + s.name;
      b.addEventListener('click', function () {
        setSkin(s.id);
        // close after the selection registers — leaving the sheet open kept a
        // blurred scrim over the page, which reads as the site freezing
        setTimeout(closeSheets, 320);
      });
      box.appendChild(b);
    });

    /* ink row — swatches + a native colour picker + free-typed hex */
    var inkRow = themeSheet.querySelector('#shdc-ink-row');
    INK_PRESETS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sw'; b.dataset.v = c; b.style.setProperty('--c', c);
      b.title = c; b.setAttribute('aria-label', 'Ink ' + c);
      b.addEventListener('click', function () { setInk(c); });
      inkRow.appendChild(b);
    });
    var colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = '#e9efe9';
    colorInput.setAttribute('aria-label', 'Pick font colour');
    colorInput.addEventListener('input', function () { setInk(colorInput.value); });
    inkRow.appendChild(colorInput);
    var hexIn = document.createElement('input');
    hexIn.className = 'hex'; hexIn.placeholder = '#e9efe9'; hexIn.maxLength = 7;
    hexIn.setAttribute('aria-label', 'Hex font colour');
    hexIn.addEventListener('change', function () { setInk(hexIn.value); colorInput.value = getInk() || '#e9efe9'; });
    hexIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setInk(hexIn.value); colorInput.value = getInk() || '#e9efe9'; } });
    inkRow.appendChild(hexIn);
    inkRow.querySelector('[data-ink-reset]').addEventListener('click', function () { setInk(null); colorInput.value = '#e9efe9'; });
    paintInkRow(inkRow);

    var msg = authSheet.querySelector('#shdc-msg');
    var out = authSheet.querySelector('#shdc-out');
    function say(text, cls) { msg.textContent = text || ''; msg.className = 'shdc-msg' + (cls ? ' ' + cls : ''); }

    out.addEventListener('click', function () { signOut(); paintAuthSheet(); say('Signed out.', 'good'); });

    authSheet.querySelector('#shdc-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = authSheet.querySelector('#shdc-email').value.trim();
      var pass = authSheet.querySelector('#shdc-pass').value;
      if (!email || !pass) { say('Email and password, please.', 'bad'); return; }
      var go = authSheet.querySelector('#shdc-go');
      go.disabled = true; say('Checking…');
      fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: pass })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error) || 'Sign-in failed.');
          var j = res.j || {};
          save((j.user && (j.user.id || j.user.userId)) || j.userId || email, j.token || j.accessToken);
          paintAuthSheet(); say('Signed in.', 'good');
          setTimeout(closeSheets, 700);
        })
        .catch(function (err) { say(err.message || 'Sign-in failed.', 'bad'); })
        .then(function () { go.disabled = false; });
    });

    /* The Solana button was removed from the front door (see above), so this
       binds to nothing. Guarded rather than deleted, because the wallet flow
       below is still correct and is wanted in the dashboard — an unguarded
       querySelector on a removed element threw here and killed the whole
       chrome init, which silently emptied the door grid. */
    var _w = authSheet.querySelector('#shdc-wallet');
    if (_w) _w.addEventListener('click', function () {
      var p = root.solana || (root.phantom && root.phantom.solana);
      if (!p || !p.connect) { say('No Solana wallet found in this browser.', 'bad'); return; }
      say('Waiting for your wallet…');
      var address;
      p.connect()
        .then(function (r) {
          address = String((r && r.publicKey) ? r.publicKey : p.publicKey);
          return fetch('/api/wallet/nonce?wallet=' + encodeURIComponent(address)).then(function (x) { return x.json(); });
        })
        .then(function (n) {
          var message = n.message || n.nonce;
          if (!message) throw new Error('Could not get a challenge from the server.');
          return p.signMessage(new TextEncoder().encode(message), 'utf8')
            .then(function (s) { return { message: message, sig: s.signature || s }; });
        })
        .then(function (o) {
          return fetch('/api/wallet/session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: address, message: o.message, signature: b58(o.sig) })
          }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
        })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error) || 'Wallet sign-in failed.');
          save(address, res.j.token);
          paintAuthSheet(); say('Wallet connected.', 'good');
          setTimeout(closeSheets, 700);
        })
        .catch(function (err) { say(err.message || 'Wallet sign-in failed.', 'bad'); });
    });

    function paintAuthSheet() { out.style.display = user() ? '' : 'none'; }
    paintAuthSheet();
    authSheet._paint = paintAuthSheet;
    authSheet._say = say;

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePopListeners(); closeSheets(); }
    });
  }

  function openSheet(el, dim) {
    build();
    closeSheets(true);
    if (dim !== false) scrim.classList.add('on');
    el.classList.add('on');
  }
  function closeSheets(keepScrim) {
    if (!built) return;
    themeSheet.classList.remove('on');
    authSheet.classList.remove('on');
    if (!keepScrim) scrim.classList.remove('on');
  }

  /* sign-in popover: opens under the pill with no grey scrim, and dismisses
     when you tap anywhere outside it. The rest of the page stays live. */
  var popListeners = [];
  function closePopListeners() {
    while (popListeners.length) {
      var h = popListeners.pop();
      document.removeEventListener('click', h, true);
      document.removeEventListener('touchstart', h, true);
    }
  }
  function openAuthSheet() {
    build();
    authSheet._paint(); authSheet._say('');
    if (authSheet.classList.contains('on')) { closeSheets(); return; }  // pill toggles
    closeSheets(true);
    scrim.classList.remove('on');
    authSheet.classList.add('on');
    setTimeout(function () {
      var fn = function (e) {
        if (authSheet.contains(e.target)) return;
        closePopListeners();
        closeSheets();
      };
      resetPopListeners(fn);
    }, 0);
  }
  function resetPopListeners(fn) {
    closePopListeners();
    popListeners.push(fn);
    document.addEventListener('click', fn, true);
    document.addEventListener('touchstart', fn, true);
  }

  root.SHDChrome = {
    SKINS: SKINS,
    init: function () { build(); setSkin(getSkin()); if (getInk()) applyInk(getInk()); return this; },
    skin: getSkin,
    setSkin: setSkin,
    onSkin: function (fn) { skinSubs.push(fn); return this; },
    openTheme: function () { build(); openSheet(themeSheet); },
    openAuth: function () { openAuthSheet(); },
    closeSheets: closeSheets,
    user: user,
    shortId: shortId,
    signOut: signOut,
    onAuth: function (fn) { authSubs.push(fn); return this; },
    dwell: getDwell,
    setDwell: setDwell,
    onDwell: function (fn) { dwellSubs.push(fn); return this; }
  };
})(window);
