/* SHADDAI V119 — FORGE FLOW (dashboard side).
   The Forge opens as its own full-screen window over the dashboard (close, pop out, other forges in a menu) and goes straight to the 3D wizard.
   - Signed-out visitors are sent to the sign-in first and returned to the Forge once they are in, so nothing is lost.
   - The wizard tells us when an agent is created (shd:forged): the window closes and your office opens with the new agent in it.
   - The 3D world opens in the dashboard's own full-screen world mode, never inside the Forge frame.
   - /?view=office (or forge, agents, ...) opens that screen on load. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function local() { return location.hostname === 'localhost' || location.hostname === '127.0.0.1'; }
  if (!window.shdIsSignedIn) {
    window.shdIsSignedIn = function () {
      try { if (window.SHD_AUTH && window.SHD_AUTH.user) return true; if (localStorage.getItem('shd_signed_in') === '1') return true; var u = localStorage.getItem('shd_userid'); if (u && u.indexOf('guest') !== 0 && u !== 'local') return true; } catch (e) { /* ignore */ }
      return local();
    };
  }
  function realSignedIn() { try { return !!(window.SHD_AUTH && window.SHD_AUTH.user) || localStorage.getItem('shd_signed_in') === '1' || (function () { var u = localStorage.getItem('shd_userid'); return !!(u && u.indexOf('guest') !== 0 && u !== 'local'); })(); } catch (e) { return false; } }

  /* sign in first, then continue where you were */
  var waiting = null;
  function needSignIn(after, why) {
    try { if (window.shdGate && shdGate.show) shdGate.show(); } catch (e) { /* ignore */ }
    var m = document.getElementById('shdAuthMsg'); if (m) { m.textContent = why || 'Sign in to continue.'; m.style.color = '#27e0ff'; }
    clearInterval(waiting); var t0 = Date.now();
    waiting = setInterval(function () {
      if (Date.now() - t0 > 600000) { clearInterval(waiting); return; }
      var g = document.getElementById('shdAuthGate'); if (g && g.classList.contains('on')) return;     // still on the sign-in
      if (realSignedIn()) { clearInterval(waiting); after && after(); }
    }, 500);
  }

  /* ── the 3D realm window ───────────────────────────────────────────────
     The dashboard's full-screen world view (#gridView) is nested inside the hidden Documents view by an unclosed element earlier in the
     page, so it was "open" but trapped in a hidden box (0 x 0 px) and the 3D realm buttons showed nothing. Moving it to the top level
     makes it a real full-screen window: portal intro, the world, and the exit button. */
  function mountWorld() { var g = document.getElementById('gridView'); if (g && g.parentElement !== document.body) document.body.appendChild(g); }
  mountWorld(); document.addEventListener('DOMContentLoaded', mountWorld); window.addEventListener('load', mountWorld);
  (function wrapWorld() {
    var f = window.enter3DWorld; if (typeof f !== 'function' || f._mw) { if (typeof f !== 'function') setTimeout(wrapWorld, 400); return; }
    window.enter3DWorld = function () { mountWorld(); return f.apply(this, arguments); }; window.enter3DWorld._mw = true; window.enter3DWorld._lk = f._lk;
  })();

  /* ── the Forge as its own full-screen window ──────────────────────────
     It opens over the dashboard (close button, pop-out, other forges in a menu), instead of living inside a dashboard tab. */
  var app = null, appFrame = null, appPrev = null;
  var FORGES = { '3d': ['/forge-demo.html', 'Forge an agent'], '2d': ['/forge.html', '2D Forge'], market: ['/pixel-forge.html', 'Marketplace'] };
  function closeApp() { if (!app) return; app.remove(); app = null; appFrame = null; document.body.style.overflow = ''; document.removeEventListener('keydown', onAppKey, true); if (appPrev && appPrev.focus) { try { appPrev.focus(); } catch (e) { /* ignore */ } } }
  function onAppKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeApp(); } }
  function openApp(which) {
    var def = FORGES[which] || FORGES['3d'];
    if (app) { appFrame.src = def[0]; app.querySelector('.fg-apptitle').textContent = def[1]; return; }
    appPrev = document.activeElement;
    var menu = h('div', { class: 'fg-menu', role: 'menu', style: 'display:none' }, [
      h('button', { type: 'button', role: 'menuitem', text: 'Forge an agent (3D)', onclick: function () { openApp('3d'); menu.style.display = 'none'; } }),
      h('button', { type: 'button', role: 'menuitem', text: '2D Forge', onclick: function () { openApp('2d'); menu.style.display = 'none'; } }),
      h('button', { type: 'button', role: 'menuitem', text: 'Marketplace', onclick: function () { openApp('market'); menu.style.display = 'none'; } })]);
    var more = h('button', { type: 'button', class: 'fg-btn ghost', text: 'Other forges', 'aria-haspopup': 'menu', onclick: function (e) { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; } });
    appFrame = h('iframe', { class: 'fg-appframe', src: def[0], title: 'Forge', allow: 'fullscreen' });
    app = h('div', { class: 'fg-app', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Forge' }, [
      h('div', { class: 'fg-appbar' }, [h('b', { class: 'fg-apptitle', text: def[1] }), h('div', { class: 'fg-actions' }, [
        h('div', { class: 'fg-more' }, [more, menu]),
        h('button', { type: 'button', class: 'fg-btn ghost', text: 'Pop out', title: 'Open in its own browser window', onclick: function () { window.open(appFrame.src, 'shdForge', 'width=1180,height=820,noopener'); closeApp(); } }),
        h('button', { type: 'button', class: 'fg-btn', text: 'Close', onclick: closeApp })])]),
      appFrame]);
    document.body.appendChild(app); document.body.style.overflow = 'hidden'; document.addEventListener('keydown', onAppKey, true);
    document.addEventListener('click', function () { menu.style.display = 'none'; });
    app.querySelector('.fg-btn:not(.ghost)').focus();
  }
  /* the Forge tab: one clean screen (the old four-tab bar is hidden), with the other forges, full screen and pop out in the header */
  var tabBuilt = false, curTab = '3d';
  function showTab(which) { curTab = which; if (typeof window.switchForgeTab === 'function') window.switchForgeTab(which); var b = document.querySelector('#forgeView .fg-back'); if (b) b.style.display = which === '3d' ? 'none' : ''; }
  function buildTab() {
    var v = document.getElementById('forgeView'); if (!v || tabBuilt) return; tabBuilt = true;
    var tabs = v.querySelector('.forge-tabs'); if (tabs) tabs.style.display = 'none';
    var menu = h('div', { class: 'fg-menu', role: 'menu', style: 'display:none' }, [
      h('button', { type: 'button', role: 'menuitem', text: '2D Forge', onclick: function () { showTab('2d'); menu.style.display = 'none'; } }),
      h('button', { type: 'button', role: 'menuitem', text: 'Marketplace', onclick: function () { showTab('market'); menu.style.display = 'none'; } })]);
    var more = h('button', { type: 'button', class: 'fg-btn ghost', text: 'Other forges', 'aria-haspopup': 'menu', onclick: function (e) { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; } });
    var head = h('div', { class: 'fg-head' }, [
      h('div', { class: 'fg-title' }, [h('b', { text: 'Forge an agent' }), h('span', { text: 'Name it, give it a glow body and real skills, run its first job. It lives in your office and you can connect Grok or an API to it.' })]),
      h('div', { class: 'fg-actions' }, [h('button', { type: 'button', class: 'fg-btn ghost fg-back', style: 'display:none', text: 'Back to the wizard', onclick: function () { showTab('3d'); } }),
        h('div', { class: 'fg-more' }, [more, menu]),
        h('button', { type: 'button', class: 'fg-btn ghost', text: 'Full screen', onclick: function () { openApp(curTab); } }),
        h('button', { type: 'button', class: 'fg-btn ghost', text: 'Pop out', title: 'Open in its own browser window', onclick: function () { window.open((FORGES[curTab] || FORGES['3d'])[0], 'shdForge', 'width=1180,height=820,noopener'); } })])]);
    v.insertBefore(head, v.firstChild); document.addEventListener('click', function () { menu.style.display = 'none'; });
    [].forEach.call(v.querySelectorAll('.forge-panel'), function (p) { p.style.height = 'calc(100vh - 150px)'; p.style.minHeight = '560px'; });
  }
  function wrapShow() {
    var sv = window.showView; if (typeof sv !== 'function' || sv._fg) return;
    window.showView = function (view) {
      if (view === 'forge') {
        if (!realSignedIn() && !local()) { needSignIn(function () { window.showView('forge'); }, 'Sign in to forge an agent.'); return; }
        var res = sv.apply(this, arguments); buildTab(); setTimeout(function () { showTab('3d'); }, 60); return res;      // the Forge is a tab in the dashboard
      }
      return sv.apply(this, arguments);
    };
    window.showView._fg = true;
  }
  wrapShow(); window.addEventListener('load', wrapShow); setTimeout(wrapShow, 1500);

  /* ── messages from the wizard ──────────────────────────────────────── */
  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || !ev.data) return; var d = ev.data;
    if (d.type === 'shd:signin') {
      needSignIn(function () { try { var f = document.getElementById('forgeFrame3d'); if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'shd:signedin' }, location.origin); } catch (e) { /* ignore */ } }, 'Sign in to save your agent. Your choices are kept.');
    } else if (d.type === 'shd:forged') {
      lastForged = { name: d.name || 'Your agent', id: d.id || null };
      toast((d.name || 'Your agent') + ' was created and joined your office.');
      try { if (typeof e5RenderForgedRows === 'function') e5RenderForgedRows(); } catch (e) { /* ignore */ }
      try { if (window.shdWorlds && window.shdWorlds.loadSpace) window.shdWorlds.loadSpace(); } catch (e) { /* ignore */ }
    } else if (d.type === 'shd:goto' && d.view) {
      closeApp(); goView(d.view); if (d.view === 'office' && lastForged) { var lf = lastForged; lastForged = null; setTimeout(function () { showNext(lf); }, 1600); }
    }
  });
  var lastForged = null;
  function showNext(f) {
    var old = document.querySelector('.fg-next'); if (old) old.remove();
    var card = h('aside', { class: 'fg-next', role: 'region', 'aria-label': 'Next steps for ' + f.name }, [
      h('button', { type: 'button', class: 'fg-x', 'aria-label': 'Close', text: '×', onclick: function () { card.remove(); } }),
      h('b', { text: f.name + ' is in your office' }), h('small', { text: 'Next: let Grok or an API control it, and find it in your Gallery.' }),
      window.shdAgentActions ? window.shdAgentActions({ id: f.id, name: f.name, codename: f.name }) : null,
      h('button', { type: 'button', class: 'gl-btn ghost', text: 'See it in the Gallery', onclick: function () { card.remove(); try { window._ogMode = 'agents'; window.showView('office'); setTimeout(function () { if (window.switchOfficeTab) window.switchOfficeTab('gallery'); }, 400); } catch (e) { /* ignore */ } } })]);
    document.body.appendChild(card);
  }
  function goView(view) {
    if (view === 'world') { try { if (window.enter3DWorld) window.enter3DWorld(); } catch (e) { /* ignore */ } return; }
    if (view === 'forge') { window.showView('forge'); return; }
    if (!document.getElementById(view + 'View') && view !== 'dash') return; try { window.showView(view); } catch (e) { return; }
    if (view === 'office') {
      var t = 0, iv = setInterval(function () { t++; var b = document.querySelector('#shdOffice3d .o3-intro button'); var intro = document.querySelector('#shdOffice3d .o3-intro');
        if (b && intro && intro.style.display !== 'none') { b.click(); clearInterval(iv); } else if (t > 20) clearInterval(iv); }, 400);
    }
  }
  /* /?view=office opens that screen once the page is up */
  try { var m = /[?&]view=([a-z0-9-]+)/i.exec(location.search); if (m) window.addEventListener('load', function () { setTimeout(function () { goView(m[1]); }, 1800); }); } catch (e) { /* ignore */ }
  window.shdForgeFlow = { open: openApp, close: closeApp, goView: goView };
})();
