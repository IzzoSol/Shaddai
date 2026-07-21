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
  window.setThemeSkin = function (id) {
    if (!SKINS.some(function (s) { return s.id === id; })) id = 'glitch';
    document.documentElement.setAttribute('data-theme-skin', id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    // reflect selection in the picker if it's mounted
    document.querySelectorAll('.shd-skin-opt').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-skin') === id);
    });
    return id;
  };
  window.getThemeSkin = function () { return document.documentElement.getAttribute('data-theme-skin') || 'glitch'; };

  // Apply the saved skin immediately (script is deferred → runs after parse).
  var start = saved(); if (start) window.setThemeSkin(start);

  function css() {
    if (document.getElementById('shd-skin-css')) return;
    var s = document.createElement('style'); s.id = 'shd-skin-css';
    s.textContent =
      '#shdSkinDock{position:fixed;left:14px;bottom:14px;z-index:100040;font-family:"Chakra Petch",system-ui,sans-serif}' +
      '#shdSkinDock .fab{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(12,10,24,.85);color:#efe9ff;cursor:pointer;font-size:17px;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.4);backdrop-filter:blur(6px)}' +
      '#shdSkinDock .fab:hover{border-color:rgba(255,255,255,.4)}' +
      '#shdSkinMenu{position:absolute;left:0;bottom:52px;display:none;flex-direction:column;gap:3px;padding:8px;min-width:172px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(12,10,24,.94);box-shadow:0 10px 34px rgba(0,0,0,.5);backdrop-filter:blur(10px)}' +
      '#shdSkinDock.open #shdSkinMenu{display:flex}' +
      '#shdSkinMenu .hd{font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:#9a86c8;padding:2px 6px 6px}' +
      '.shd-skin-opt{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;border:1px solid transparent;background:none;color:#e7ddff;cursor:pointer;font-family:inherit;font-size:12.5px;text-align:left}' +
      '.shd-skin-opt:hover{background:rgba(255,255,255,.06)}' +
      '.shd-skin-opt.on{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.05)}' +
      '.shd-skin-opt .sw{width:13px;height:13px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor}' +
      '.shd-skin-opt .chk{margin-left:auto;opacity:0;font-size:11px}.shd-skin-opt.on .chk{opacity:1}';
    document.head.appendChild(s);
  }

  function mount() {
    if (document.getElementById('shdSkinDock')) return;
    css();
    var dock = document.createElement('div'); dock.id = 'shdSkinDock';
    dock.innerHTML =
      '<button class="fab" id="shdSkinFab" title="Theme">◈</button>' +
      '<div id="shdSkinMenu"><div class="hd">Dashboard theme</div>' +
      SKINS.map(function (s) {
        return '<button class="shd-skin-opt" data-skin="' + s.id + '"><span class="sw" style="background:' + s.dot + ';color:' + s.dot + '"></span>' + s.name + '<span class="chk">✓</span></button>';
      }).join('') + '</div>';
    document.body.appendChild(dock);
    document.getElementById('shdSkinFab').addEventListener('click', function () { dock.classList.toggle('open'); });
    dock.querySelectorAll('.shd-skin-opt').forEach(function (b) {
      b.addEventListener('click', function () { window.setThemeSkin(b.getAttribute('data-skin')); dock.classList.remove('open'); });
    });
    document.addEventListener('click', function (e) { if (!dock.contains(e.target)) dock.classList.remove('open'); });
    // reflect current selection
    window.setThemeSkin(window.getThemeSkin());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
