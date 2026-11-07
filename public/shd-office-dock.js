/* SHADDAI V119 — DOCKED OFFICE. Press "Dock" in the office and it shrinks to a small live window in the corner that stays open while you
   use any other screen. "Expand" brings it back to Office; "Close" shuts it down. It is the same single office (one canvas, one render
   loop): the existing card is moved, not rebuilt, so nothing reloads. Choosing Office from the menu also brings it back automatically. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var dock = null, docked = false;
  function card() { return document.getElementById('shdOffice3d'); }
  function live() { var c = card(); return !!(c && c.querySelector('canvas') && c._stage && c._stage.style.display !== 'none'); }
  function resize() { window.dispatchEvent(new Event('resize')); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 160); }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function dockIt() {
    var c = card(); if (docked) return; if (!c || !live()) { toast('Open the 3D office first, then dock it.'); return; }
    var body = h('div', { class: 'od-body' });
    dock = h('div', { id: 'shdOfficeDock', role: 'region', 'aria-label': 'Docked office' }, [h('div', { class: 'od-bar' }, [h('b', { text: 'My office' }), h('div', null, [
      h('button', { type: 'button', text: 'Expand', 'aria-label': 'Expand the office', onclick: function () { undock(false); try { window.showView('office'); } catch (e) { /* ignore */ } } }),
      h('button', { type: 'button', text: 'Close', 'aria-label': 'Close the docked office', onclick: function () { undock(true); try { if (window.shdOffice3d) window.shdOffice3d.close(); } catch (e) { /* ignore */ } } })])]), body]);
    document.body.appendChild(dock); body.appendChild(c); docked = true; document.body.classList.add('shd-office-docked'); resize();
    var ov = document.getElementById('officeView'); if (ov && ov.classList.contains('active')) { try { window.showView('dash'); } catch (e) { /* ignore */ } }
  }
  function undock() {
    if (!docked) return; var c = card(), view = document.getElementById('officeView');
    if (c && view) view.insertBefore(c, view.firstChild); if (dock) dock.remove(); dock = null; docked = false; document.body.classList.remove('shd-office-docked'); resize();
  }
  function wireButton() {
    var c = card(); if (!c) return; var hud = c.querySelector('.o3-hud'); if (!hud || hud.querySelector('.o3d-open')) return;
    hud.insertBefore(h('button', { type: 'button', class: 'o3-btn ghost o3d-open', text: 'Dock', title: 'Shrink the office to a corner window that stays open', onclick: dockIt }), hud.firstChild);
  }
  new MutationObserver(wireButton).observe(document.body, { childList: true, subtree: true }); wireButton();
  (function wrap() {
    var sv = window.showView; if (typeof sv !== 'function') { setTimeout(wrap, 500); return; } if (sv._od) return;
    window.showView = function (v) { if (v === 'office' && docked) undock(); return sv.apply(this, arguments); }; window.showView._od = true;
  })();
  window.shdOfficeDock = { dock: dockIt, undock: undock, docked: function () { return docked; } };
})();
