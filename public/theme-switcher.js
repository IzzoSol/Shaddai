/* ══════════════════════════════════════════════════════════════════
   SHADDAI — THEME SWITCHER  (theme-switcher.js)
   The 6 dashboard skins already exist in CSS as html[data-theme-skin="…"]
   but nothing ever SET or PERSISTED the attribute — so they were never
   actually switchable. This wires them up: a floating picker + persistence,
   and exposes window.setThemeSkin(name) so the Command Hub / Settings can
   drive the SAME system. Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__themeSwitcherV1) return; window.__themeSwitcherV1 = true;

  var SKINS = [
    { id: 'glitch', name: 'Neon Glitch', dot: '#00ff88' },
    { id: 'terminal', name: 'Terminal', dot: '#00ff41' },
    { id: 'brutalist', name: 'Brutalist', dot: '#f5c000' },
    { id: 'serif', name: 'Serif', dot: '#3a6b4a' },
    { id: 'void', name: 'Void', dot: '#e8e8e8' },
    { id: 'amber', name: 'Amber', dot: '#ffb000' }
  ];
  var KEY = 'shd_theme_skin';

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  // The single source of truth — anything (picker, Command Hub, Settings) calls this.
  // Full-dashboard palette per skin. The data-theme-skin CSS remaps variables but the
  // dashboard has many hardcoded colors (incl. the black body) that ignore them, and
  // late-linked CSS wins. This forces the main surfaces + text so the WHOLE dashboard
  // re-skins — and light skins invert to dark text.
  var PAL = {
    glitch:   { bg: '#000000', panel: '#0a0a0a', text: '#e8e8e8', muted: '#8a8a8a', border: 'rgba(255,255,255,.09)' },
    terminal: { bg: '#030a03', panel: '#041004', text: '#00ff41', muted: 'rgba(0,255,65,.62)', border: 'rgba(0,255,65,.25)' },
    brutalist:{ bg: '#f5f4f0', panel: '#ffffff', text: '#0a0804', muted: '#5a5248', border: 'rgba(10,8,4,.18)' },
    serif:    { bg: '#f8f6f0', panel: '#ffffff', text: '#1c1710', muted: '#6b5f4e', border: 'rgba(38,28,8,.10)' },
    void:     { bg: '#000000', panel: '#080808', text: '#f2f2f2', muted: '#8f8f8f', border: 'rgba(255,255,255,.10)' },
    amber:    { bg: '#0a0600', panel: '#120c02', text: '#ffcf7a', muted: 'rgba(255,176,32,.65)', border: 'rgba(255,176,32,.22)' }
  };
  function applyForce(id) {
    var P = PAL[id] || PAL.glitch;
    var st = document.getElementById('shd-skin-force');
    // append to BODY (last in source order) so it beats late-linked stylesheets
    if (!st) { st = document.createElement('style'); st.id = 'shd-skin-force'; (document.body || document.documentElement).appendChild(st); }
    var H = 'html[data-theme-skin] ';
    st.textContent =
      H + 'body{background:' + P.bg + ' !important;color:' + P.text + ' !important}' +
      H + '.view,' + H + '#app,' + H + '#mainContent{background:' + P.bg + ' !important}' +
      H + '.card,' + H + '.panel,' + H + '.stat-box,' + H + '.stat-card,' + H + '.settings-section,' + H + '.side-panel,' + H + '.kpi,' + H + '.dossier,' + H + '#mainNav,' + H + '#sbNav,' + H + '#agentBar,' + H + '#statusBar{background:' + P.panel + ' !important;border-color:' + P.border + ' !important;color:' + P.text + ' !important}' +
      H + '.card-title,' + H + '.view-title,' + H + '.settings-title,' + H + 'h1,' + H + 'h2,' + H + 'h3,' + H + '.sb-brand{color:' + P.text + ' !important}' +
      H + '.text-muted,' + H + '.muted,' + H + 'small,' + H + '.sub{color:' + P.muted + ' !important}';
    // LIGHT skins: the dashboard's hardcoded inline text colors are pale (built for a dark
    // bg) and would be unreadable on white. Those inline colors aren't !important, so force
    // readable dark text on painted surfaces (excluding buttons/links, which keep their own
    // contrast) + a faint light outline so text stays crisp.
    if (id === 'brutalist' || id === 'serif') {
      st.textContent +=
        H + '[data-skin-painted] *:not(button):not(.pri):not(.cl):not(a):not(.mqa-btn){color:' + P.text + ' !important}' +
        H + '[data-skin-painted]{text-shadow:0 1px 0 rgba(255,255,255,.35)}';
    }
    // The old data-theme system sets body[data-theme="glitch"]{background} which fought
    // the skin. Inline !important on <body> + <html> always wins, and we clear the stale
    // body data-theme so nothing overrides the whole-page background.
    // SAFETY: 'glitch' is the shipped default. For it we DON'T repaint — instead we CLEAR
    // any inline paint we previously added, so the original design (accent cards, gradients)
    // is 100% untouched. The aggressive repaint only runs for the other, opt-in skins.
    if (id === 'glitch') {
      try {
        document.querySelectorAll('[data-skin-painted]').forEach(function (el) {
          ['background', 'background-color', 'background-image', 'border-color', 'color'].forEach(function (pr) { el.style.removeProperty(pr); });
          el.removeAttribute('data-skin-painted');
        });
        ['background-color', 'background-image', 'color'].forEach(function (pr) { document.body.style.removeProperty(pr); });
        document.documentElement.style.removeProperty('background-color');
      } catch (e) {}
      return;
    }
    try {
      document.body.removeAttribute('data-theme');
      document.body.style.setProperty('background-color', P.bg, 'important');
      document.body.style.setProperty('background-image', 'none', 'important');
      document.body.style.setProperty('color', P.text, 'important');
      document.documentElement.style.setProperty('background-color', P.bg, 'important');
    } catch (e) {}
    // The dashboard paints backgrounds INLINE (gradients) which beat any stylesheet — so
    // repaint the structural surfaces inline with !important (the only thing that wins).
    try {
      var PAGE = '#app,#mainContent,.view,.main-content,#mainNav,#sbNav,#agentBar,#statusBar,footer';
      document.querySelectorAll(PAGE).forEach(function (el) {
        el.style.setProperty('background', el.matches('.view,#app,#mainContent,.main-content') ? P.bg : P.panel, 'important');
        el.style.setProperty('background-image', 'none', 'important');
        el.setAttribute('data-skin-painted', '1');
      });
      document.querySelectorAll('.card,.panel,.stat-box,.stat-card,.settings-section,.settings-plan-card,.side-panel,.kpi,.dossier,#resourcePanel').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 34) return;   // skip tiny chips/badges
        el.style.setProperty('background', P.panel, 'important');
        el.style.setProperty('background-image', 'none', 'important');
        el.style.setProperty('border-color', P.border, 'important');
        el.style.setProperty('color', P.text, 'important');
        el.setAttribute('data-skin-painted', '1');
      });
    } catch (e) {}
  }

  window.setThemeSkin = function (id) {
    if (!SKINS.some(function (s) { return s.id === id; })) id = 'glitch';
    document.documentElement.setAttribute('data-theme-skin', id);
    try { applyForce(id); } catch (e) {}
    // Cards/panels are re-rendered after a view switch (wiping the inline paint), so
    // re-apply a couple beats later to catch freshly-rendered surfaces.
    [250, 800].forEach(function (t) { setTimeout(function () { try { applyForce(id); } catch (e) {} }, t); });
    try { localStorage.setItem(KEY, id); } catch (e) {}
    // reflect selection in the picker if it's mounted
    document.querySelectorAll('.shd-skin-opt').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-skin') === id);
    });
    return id;
  };
  window.getThemeSkin = function () { return document.documentElement.getAttribute('data-theme-skin') || 'glitch'; };

  // Re-apply the skin whenever the dashboard switches views (views render fresh, dark
  // cards). Wrap showView once it exists.
  (function wrapSV(tries) {
    if (window.__shdSkinSVWrapped) return;
    if (typeof window.showView === 'function') {
      window.__shdSkinSVWrapped = true;
      var _sv = window.showView;
      window.showView = function () {
        var r = _sv.apply(this, arguments);
        // PERF: the default 'glitch' skin is the untouched original design — nothing to
        // repaint. Skip the querySelectorAll + repaint entirely on every view switch
        // (huge DOM), so switching views stays cheap for everyone on the default skin.
        try { var id = window.getThemeSkin(); if (id !== 'glitch') { applyForce(id); setTimeout(function () { try { applyForce(id); } catch (e) {} }, 220); } } catch (e) {}
        return r;
      };
    } else if ((tries || 0) < 40) { setTimeout(function () { wrapSV((tries || 0) + 1); }, 250); }
  })(0);

  // Apply the saved skin immediately (script is deferred → runs after parse).
  var start = saved(); if (start) window.setThemeSkin(start);

  function css() {
    if (document.getElementById('shd-skin-css')) return;
    var s = document.createElement('style'); s.id = 'shd-skin-css';
    s.textContent =
      '#shdSkinDock{position:fixed;left:14px;bottom:14px;z-index:100040;font-family:"Chakra Petch",system-ui,sans-serif}' +
      '#shdSkinDock .fab{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(12,10,24,.85);color:#efe9ff;cursor:grab;font-size:17px;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.4);backdrop-filter:blur(6px);touch-action:none}' +
      '#shdSkinDock .fab:hover{border-color:rgba(255,255,255,.4)}' +
      '#shdSkinDock .fab.dragging{cursor:grabbing}' +
      '#shdSkinMenu{position:absolute;left:0;bottom:52px;display:none;flex-direction:column;gap:3px;padding:8px;min-width:172px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(12,10,24,.94);box-shadow:0 10px 34px rgba(0,0,0,.5);backdrop-filter:blur(10px)}' +
      '#shdSkinDock.open #shdSkinMenu{display:flex}' +
      '#shdSkinMenu .hd{font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:#9a86c8;padding:2px 6px 6px}' +
      '.shd-skin-opt{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;border:1px solid transparent;background:none;color:#e7ddff;cursor:pointer;font-family:inherit;font-size:12.5px;text-align:left}' +
      '.shd-skin-opt:hover{background:rgba(255,255,255,.06)}' +
      '.shd-skin-opt.on{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.05)}' +
      '.shd-skin-opt .sw{width:13px;height:13px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor}' +
      '.shd-skin-opt .chk{margin-left:auto;opacity:0;font-size:11px}.shd-skin-opt.on .chk{opacity:1}' +
      '#shdSkinChip{position:fixed;left:14px;bottom:14px;z-index:100040;display:none;width:38px;height:38px;border-radius:50%;border:1px solid rgba(0,255,156,.45);background:rgba(10,16,12,.92);color:#00ff9c;cursor:pointer;font-size:14px;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.45),0 0 14px rgba(0,255,156,.22);backdrop-filter:blur(6px)}' +
      '#shdSkinChip:hover{border-color:rgba(0,255,156,.8);box-shadow:0 0 22px rgba(0,255,156,.45)}';
    document.head.appendChild(s);
  }

  function mount() {
    if (document.getElementById('shdSkinDock')) return;
    css();
    var dock = document.createElement('div'); dock.id = 'shdSkinDock';
    dock.innerHTML =
      '<button class="fab" id="shdSkinFab" title="Theme — drag me · tap to open">◈</button>' +
      '<div id="shdSkinMenu"><div class="hd">Dashboard theme</div>' +
      SKINS.map(function (s) {
        return '<button class="shd-skin-opt" data-skin="' + s.id + '"><span class="sw" style="background:' + s.dot + ';color:' + s.dot + '"></span>' + s.name + '<span class="chk">✓</span></button>';
      }).join('') +
      '<div class="hd" style="margin-top:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px">Widget</div>' +
      '<button class="shd-skin-opt" id="shdSkinMin" title="Minimize the theme button"><span class="sw" style="background:#9a86c8;color:#9a86c8"></span>Minimize<span class="chk">–</span></button>' +
      '<div class="hd" style="margin-top:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px">Privacy</div>' +
      '<button class="shd-skin-opt" id="shdWipe" style="color:#ff8fa3"><span class="sw" style="background:#ff5470;color:#ff5470"></span>Wipe my data (this device)</button>' +
      '</div>';
    document.body.appendChild(dock);
    // Restore a saved drag position.
    try { var sv = JSON.parse(localStorage.getItem('shd_skin_dock_pos') || 'null');
      if (sv && typeof sv.left === 'number') { dock.style.left = sv.left + 'px'; dock.style.top = sv.top + 'px'; dock.style.right = 'auto'; dock.style.bottom = 'auto'; } } catch (e) {}
    var fab = document.getElementById('shdSkinFab');
    // Drag the FAB to move the dock anywhere; a tap (no movement) still toggles the menu.
    var drag = null, suppress = false;
    // ── AUTO-HIDE: after a few seconds idle (menu closed, not hovered, not dragging) the dock
    // collapses to the tiny chip so it stays OUT OF THE WAY on the dashboard. One tap brings it
    // back. Persisted, so it starts collapsed on the next visit.
    var hideTimer = null;
    function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
    function scheduleHide() {
      cancelHide();
      hideTimer = setTimeout(function () {
        hideTimer = null;
        if (dock.classList.contains('open')) { scheduleHide(); return; }  // picking a skin → wait
        if (dock.style.display !== 'none') window.toggleSkinDock();        // expanded → collapse to chip
      }, 4200);
    }
    function down(e) { var p = e.touches ? e.touches[0] : e; var r = dock.getBoundingClientRect();
      cancelHide();
      drag = { dx: p.clientX - r.left, dy: p.clientY - r.top, sx: p.clientX, sy: p.clientY, moved: false };
      fab.classList.add('dragging'); e.preventDefault();
      window.addEventListener('mousemove', move, { passive: true }); window.addEventListener('touchmove', move, { passive: true });
      window.addEventListener('mouseup', up); window.addEventListener('touchend', up); }
    function move(e) { if (!drag) return; var p = e.touches ? e.touches[0] : e;
      if (!drag.moved && (Math.abs(p.clientX - drag.sx) > 4 || Math.abs(p.clientY - drag.sy) > 4)) drag.moved = true;
      if (!drag.moved) return;
      var L = Math.max(4, Math.min(window.innerWidth - dock.offsetWidth - 4, p.clientX - drag.dx));
      var T = Math.max(4, Math.min(window.innerHeight - dock.offsetHeight - 4, p.clientY - drag.dy));
      dock.style.left = L + 'px'; dock.style.top = T + 'px'; dock.style.right = 'auto'; dock.style.bottom = 'auto'; }
    function up() { if (!drag) return; var moved = drag.moved; drag = null; fab.classList.remove('dragging');
      if (moved) suppress = true;
      try { localStorage.setItem('shd_skin_dock_pos', JSON.stringify({ left: dock.offsetLeft, top: dock.offsetTop })); } catch (e) {}
      window.removeEventListener('mousemove', move); window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up);
      scheduleHide(); }
    fab.addEventListener('mousedown', down); fab.addEventListener('touchstart', down, { passive: false });
    fab.addEventListener('click', function (ev) {
      if (suppress) { suppress = false; ev.preventDefault(); return; }
      dock.classList.toggle('open');
      if (dock.classList.contains('open')) cancelHide(); else scheduleHide();
    });
    // Minimize / restore chip (parked where the dock currently is).
    var chip = document.createElement('button'); chip.id = 'shdSkinChip'; chip.title = 'Theme — show the switcher'; chip.textContent = '◈';
    chip.addEventListener('click', function () { window.toggleSkinDock(); cancelHide(); scheduleHide(); });
    document.body.appendChild(chip);
    window.toggleSkinDock = function () {
      var isMin = dock.style.display === 'none';
      dock.style.display = isMin ? 'block' : 'none';
      var pos = null; try { pos = JSON.parse(localStorage.getItem('shd_skin_dock_pos') || 'null'); } catch (e) {}
      var hadPos = pos && typeof pos.left === 'number';
      chip.style.left = hadPos ? pos.left + 'px' : (dock.style.left || '14px');
      chip.style.top = hadPos ? pos.top + 'px' : 'auto';
      chip.style.right = hadPos ? 'auto' : 'auto';
      chip.style.bottom = hadPos ? 'auto' : (dock.style.bottom || '14px');
      chip.style.display = isMin ? 'flex' : 'none';
      try { localStorage.setItem('shd_skin_dock_min', isMin ? '0' : '1'); } catch (e) {}
    };
    document.getElementById('shdSkinMin').addEventListener('click', function () { dock.classList.remove('open'); window.toggleSkinDock(); cancelHide(); scheduleHide(); });
    dock.querySelectorAll('.shd-skin-opt[data-skin]').forEach(function (b) {
      b.addEventListener('click', function () { window.setThemeSkin(b.getAttribute('data-skin')); dock.classList.remove('open'); scheduleHide(); });
    });
    // Keep the dock visible while the pointer is over it (so it never vanishes mid-pick).
    dock.addEventListener('mouseenter', cancelHide);
    dock.addEventListener('mouseleave', scheduleHide);
    chip.addEventListener('mouseenter', cancelHide);
    chip.addEventListener('mouseleave', scheduleHide);
    var wipe = document.getElementById('shdWipe');
    if (wipe) wipe.addEventListener('click', function () {
      if (!confirm('Wipe ALL SHADDAI data stored in THIS browser (chats, notes, projects, settings, identity) and reload? This cannot be undone.')) return;
      try { Object.keys(localStorage).filter(function (k) { return /^shaddai|^shd/i.test(k); }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      location.reload();
    });
    document.addEventListener('click', function (e) { if (!dock.contains(e.target) && !chip.contains(e.target)) { dock.classList.remove('open'); scheduleHide(); } });
    // reflect current selection + restore a previously minimized state
    window.setThemeSkin(window.getThemeSkin());
    try { if (localStorage.getItem('shd_skin_dock_min') === '1') window.toggleSkinDock(); } catch (e) {}
    scheduleHide();
  }

  // PERF: mount the FAB widget on idle so it never competes with the dashboard's first paint.
  var idleMount = function (cb) { return (window.requestIdleCallback || function (f) { setTimeout(f, 350); })(cb); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { idleMount(mount); });
  else idleMount(mount);
})();
