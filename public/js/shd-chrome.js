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

  var SKINS = [
    { id: 'glitch', name: 'Obsidian', dot: '#00ff9c' },
    { id: 'void', name: 'Void', dot: '#e8e8e8' },
    { id: 'terminal', name: 'Terminal', dot: '#00ff41' },
    { id: 'amber', name: 'Amber', dot: '#ffb000' },
    { id: 'brutalist', name: 'Brutalist', dot: '#f5c000' },
    { id: 'serif', name: 'Serif', dot: '#3a6b4a' }
  ];

  var skinSubs = [], authSubs = [], dwellSubs = [];
  function fire(list, v) { list.forEach(function (f) { try { f(v); } catch (e) {} }); }

  /* ── styles ───────────────────────────────────────────────────────────── */
  var CSS = [
    '.shdc-scrim{position:fixed;inset:0;z-index:60;background:rgba(3,5,7,.72);opacity:0;pointer-events:none;',
    'transition:opacity .35s cubic-bezier(.22,.7,.2,1);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.shdc-scrim.on{opacity:1;pointer-events:auto}',
    '.shdc-sheet{position:fixed;z-index:61;left:50%;bottom:0;width:min(560px,100%);',
    'transform:translate(-50%,102%);transition:transform .45s cubic-bezier(.22,.7,.2,1);',
    'background:var(--void2,#0a0e13);border:1px solid var(--edge,rgba(120,150,140,.14));border-bottom:0;',
    'border-radius:6px 6px 0 0;padding:20px clamp(16px,4vw,26px);padding-bottom:calc(22px + env(safe-area-inset-bottom));',
    'max-height:82dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--ink,#e9efe9);',
    'font-family:var(--f-serif,Georgia,serif);line-height:1.5}',
    '.shdc-sheet.on{transform:translate(-50%,0)}',
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
    '.shdc-msg.bad{color:#ff6f6f}.shdc-msg.good{color:#00ff9c}'
  ].join('');

  function injectOnce() {
    if (document.getElementById('shdc-css')) return;
    var st = document.createElement('style');
    st.id = 'shdc-css'; st.textContent = CSS;
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
      var u = localStorage.getItem('shd_userid');
      if (u && u.indexOf('guest') !== 0 && u !== 'local') return u;
    } catch (e) {}
    return null;
  }
  function shortId(u) { return u && u.length > 16 ? u.slice(0, 6) + '…' + u.slice(-4) : u; }
  function save(id, token) {
    try {
      if (id) localStorage.setItem('shd_userid', id);
      if (token) localStorage.setItem('shd_token', token);
    } catch (e) {}
    fire(authSubs, user());
  }
  function signOut() {
    try { localStorage.removeItem('shd_userid'); localStorage.removeItem('shd_token'); } catch (e) {}
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
      '<div class="shdc-skins" id="shdc-skins"></div>';

    authSheet = document.createElement('div');
    authSheet.className = 'shdc-sheet';
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
      '<button class="shdc-btn ghost" id="shdc-wallet" type="button">◎ Connect Solana wallet</button>' +
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
      b.addEventListener('click', function () { setSkin(s.id); });
      box.appendChild(b);
    });

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

    authSheet.querySelector('#shdc-wallet').addEventListener('click', function () {
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

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheets(); });
  }

  function openSheet(el) {
    build();
    closeSheets(true);
    scrim.classList.add('on');
    el.classList.add('on');
  }
  function closeSheets(keepScrim) {
    if (!built) return;
    themeSheet.classList.remove('on');
    authSheet.classList.remove('on');
    if (!keepScrim) scrim.classList.remove('on');
  }

  root.SHDChrome = {
    SKINS: SKINS,
    init: function () { build(); setSkin(getSkin()); return this; },
    skin: getSkin,
    setSkin: setSkin,
    onSkin: function (fn) { skinSubs.push(fn); return this; },
    openTheme: function () { build(); openSheet(themeSheet); },
    openAuth: function () { build(); authSheet._paint(); authSheet._say(''); openSheet(authSheet); },
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
