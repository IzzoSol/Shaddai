/* SETTINGS TIDY (v101.3): every settings section is collapsible. Per tab, only the first section starts open;
   choices are remembered. Nothing is removed. Uses the existing .settings-section / .settings-title markup. */
(function () {
  'use strict';
  var KEY = 'shd_set_open_v1';
  var pref = {}; try { pref = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} }
  function css() {
    if (document.getElementById('settingsTidyCss')) return;
    var s = document.createElement('style'); s.id = 'settingsTidyCss';
    s.textContent =
      '#settingsView .settings-section.shd-collapsed > :not(:first-child){display:none !important}' +
      '#settingsView .settings-section .settings-title{cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none}' +
      '#settingsView .settings-section .settings-title::after{content:"▾";margin-left:auto;opacity:.6;transition:transform .15s}' +
      '#settingsView .settings-section.shd-collapsed .settings-title::after{transform:rotate(-90deg)}' +
      '#settingsView .settings-section .settings-title:hover{color:var(--accent,#00e5a0)}' +
      '#settingsTidyBar{display:flex;gap:6px;margin-left:8px}' +
      '#settingsTidyBar button{min-height:30px;padding:0 10px;border-radius:8px;cursor:pointer;font:600 11px "Rajdhani",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#8a99a6);background:transparent;border:1px solid color-mix(in srgb,var(--text-primary,#e9efe9) 22%,transparent)}' +
      '#settingsTidyBar button:hover{color:var(--accent,#00e5a0);border-color:var(--accent,#00e5a0)}';
    document.head.appendChild(s);
  }
  function secs() { return [].slice.call(document.querySelectorAll('#settingsView .settings-section')); }
  function titleOf(sec) { var t = sec.querySelector('.settings-title'); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function setOpen(sec, open, remember) {
    sec.classList.toggle('shd-collapsed', !open);
    if (remember) { pref[titleOf(sec)] = open ? 1 : 0; save(); }
  }
  function visibleSecs() { return secs().filter(function (s) { return s.style.display !== 'none'; }); }
  function applyDefaults() {
    var first = true;
    visibleSecs().forEach(function (sec) {
      var t = titleOf(sec);
      if (t in pref) setOpen(sec, !!pref[t], false);
      else { setOpen(sec, first, false); }
      first = false;
    });
  }
  function wire() {
    secs().forEach(function (sec) {
      var t = sec.querySelector('.settings-title'); if (!t || t._tidy) return; t._tidy = 1;
      t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0');
      var toggle = function () { setOpen(sec, sec.classList.contains('shd-collapsed'), true); };
      t.addEventListener('click', toggle);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
    var bar = document.getElementById('setTabs');
    if (bar && !document.getElementById('settingsTidyBar')) {
      var w = document.createElement('span'); w.id = 'settingsTidyBar';
      [['Expand all', true], ['Collapse all', false]].forEach(function (o) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = o[0];
        b.addEventListener('click', function () { visibleSecs().forEach(function (s) { setOpen(s, o[1], true); }); });
        w.appendChild(b);
      });
      bar.appendChild(w);
    }
  }
  function wrapTab() {
    if (typeof window.shdSetTab !== 'function' || window.shdSetTab.__tidy) return;
    var orig = window.shdSetTab;
    var w = function () { var r = orig.apply(this, arguments); try { wire(); applyDefaults(); } catch (e) {} return r; };
    w.__tidy = 1; window.shdSetTab = w;
  }
  function boot() {
    css();
    var n = 0, t = setInterval(function () { wrapTab(); wire(); if (++n === 3) applyDefaults(); if (n > 14) clearInterval(t); }, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
