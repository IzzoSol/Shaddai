/* DASHBOARD GROUPED NAV (v101.3)
   The top bar had ~39 buttons in one overflowing strip. This groups them into a few menus.
   It does NOT replace anything: every original .nav-btn stays in the DOM (hidden) and keeps its
   onclick, guest-lock and active-state logic. Menu items just click the original button.
   Anything not matched below lands in "More", so nothing can go missing. */
(function () {
  'use strict';
  var GROUPS = [
    { id: 'home',    label: 'Home',    keys: [/showView\('dash'\)/, /quickstart/] },
    { id: 'agents',  label: 'Agents',  keys: [/showView\('agents'\)/, /showView\('chat'\)/, /showView\('office'\)/, /showView\('hall'\)/, /showView\('brain'\)/, /showView\('forge'\)/] },
    { id: 'build',   label: 'Build',   keys: [/showView\('workflow'\)/, /showView\('automation'\)/, /showView\('pipeline'\)/, /showView\('toolbrowser'\)/, /showView\('apis'\)/, /showView\('skills'\)/] },
    { id: 'create',  label: 'Create',  keys: [/showView\('media'\)/, /showView\('social'\)/, /showView\('documents'\)/, /showView\('content-studio'\)/] },
    { id: 'markets', label: 'Markets', keys: [/showView\('sentiment'\)/, /showView\('news'\)/, /signals\.html/, /tufish/] },
    { id: 'worlds',  label: 'Worlds',  keys: [/toggleWorldsMenu/, /forge-3d/, /academy/] },
    { id: 'account', label: 'Account', keys: [/showView\('settings'\)/, /showView\('security'\)/, /showView\('aura'\)/, /pricing/, /prove\.html/, /enterStandby/] }
  ];

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#mainNav.sh-grouped > .nav-btn{display:none!important}' +
      '#shGroupNav{display:flex;align-items:center;gap:4px;padding:0 10px;height:100%;overflow:visible}' +
      '#shGroupNav .shg{font:600 11px "Rajdhani","Share Tech Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(190,210,225,.72);' +
        'background:none;border:0;border-bottom:2px solid transparent;padding:8px 14px;cursor:pointer;white-space:nowrap}' +
      '#shGroupNav .shg:hover,#shGroupNav .shg.open{color:#00e5a0;border-bottom-color:rgba(0,229,160,.4)}' +
      '#shGroupNav .shg.on{color:#fff;border-bottom-color:#00e5a0}' +
      '#shGroupNav .shg .c{opacity:.5;margin-left:5px;font-size:9px}' +
      '#shGroupMenu{position:fixed;z-index:99999;min-width:230px;max-height:70vh;overflow:auto;background:#050c14;border:1px solid rgba(0,229,160,.3);' +
        'border-radius:10px;padding:6px;box-shadow:0 18px 50px rgba(0,0,0,.7);display:none}' +
      '#shGroupMenu.on{display:block}' +
      '#shGroupMenu button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;color:#cfe0ea;' +
        'font:500 13px "Rajdhani",system-ui,sans-serif;letter-spacing:.04em;padding:10px 12px;border-radius:7px;cursor:pointer}' +
      '#shGroupMenu button:hover{background:rgba(0,229,160,.1);color:#00ff9c}' +
      '#shGroupMenu button.on{color:#00ff9c;background:rgba(0,229,160,.07)}' +
      '@media(max-width:700px){#shGroupNav{overflow-x:auto}#shGroupNav .shg{padding:8px 10px}}';
    document.head.appendChild(s);
  }

  function labelOf(btn) {
    var t = (btn.getAttribute('title') || '').trim();
    var txt = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    return txt || t || 'Open';
  }
  function clickText(btn) { return (btn.getAttribute('onclick') || '') + ' ' + (btn.id || ''); }

  function build() {
    var nav = document.getElementById('mainNav');
    if (!nav || nav.classList.contains('sh-grouped')) return;
    var btns = [].slice.call(nav.querySelectorAll(':scope > .nav-btn'));
    if (btns.length < 8) return;

    var buckets = {}; GROUPS.forEach(function (g) { buckets[g.id] = []; }); buckets.more = [];
    btns.forEach(function (b) {
      var ct = clickText(b), placed = false;
      for (var i = 0; i < GROUPS.length && !placed; i++) {
        for (var k = 0; k < GROUPS[i].keys.length; k++) {
          if (GROUPS[i].keys[k].test(ct)) { buckets[GROUPS[i].id].push(b); placed = true; break; }
        }
      }
      if (!placed) buckets.more.push(b);
    });

    css();
    var bar = document.createElement('div'); bar.id = 'shGroupNav'; bar.setAttribute('role', 'menubar');
    var menu = document.createElement('div'); menu.id = 'shGroupMenu'; menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    var openId = null;

    function closeMenu() { menu.classList.remove('on'); openId = null; [].forEach.call(bar.children, function (c) { c.classList.remove('open'); }); }
    function openMenu(gid, anchor) {
      if (openId === gid) { closeMenu(); return; }
      closeMenu(); openId = gid; anchor.classList.add('open');
      menu.innerHTML = '';
      buckets[gid].forEach(function (b) {
        var it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitem');
        it.textContent = labelOf(b); if (b.classList.contains('active')) it.classList.add('on');
        it.addEventListener('click', function () { closeMenu(); b.click(); });
        menu.appendChild(it);
      });
      var r = anchor.getBoundingClientRect();
      var bottomNav = document.body.classList.contains('navpos-bottom');
      menu.classList.add('on');
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
      if (bottomNav) { menu.style.top = 'auto'; menu.style.bottom = (innerHeight - r.top + 6) + 'px'; }
      else { menu.style.bottom = 'auto'; menu.style.top = (r.bottom + 4) + 'px'; }
    }

    var gbtns = {};
    GROUPS.concat([{ id: 'more', label: 'More' }]).forEach(function (g) {
      var items = buckets[g.id]; if (!items.length) return;
      var gb = document.createElement('button'); gb.type = 'button'; gb.className = 'shg'; gb.setAttribute('aria-haspopup', 'true');
      gb.innerHTML = g.label + (items.length > 1 ? '<span class="c">▾</span>' : '');
      gb.addEventListener('click', function (e) {
        e.stopPropagation();
        if (items.length === 1) { closeMenu(); items[0].click(); } else openMenu(g.id, gb);
      });
      gbtns[g.id] = gb; bar.appendChild(gb);
    });
    nav.appendChild(bar); nav.classList.add('sh-grouped');

    function sync() {
      Object.keys(buckets).forEach(function (gid) {
        if (!gbtns[gid]) return;
        gbtns[gid].classList.toggle('on', buckets[gid].some(function (b) { return b.classList.contains('active'); }));
      });
    }
    var mo = new MutationObserver(sync);
    btns.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['class'] }); });
    sync();
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    addEventListener('resize', closeMenu);
  }

  function boot() { var tries = 0, t = setInterval(function () { tries++; build(); if (document.getElementById('shGroupNav') || tries > 40) clearInterval(t); }, 250); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
