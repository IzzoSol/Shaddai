/* SHADDAI V119 — PLANS. One in-dashboard panel replaces the old /pricing.html and /prove.html pages.
   Nothing is hard-coded here: tiers, prices and credit packs come from the server (/api/stripe/plans, from lib/tiers.js),
   and checkout goes through /api/stripe/create-checkout (Stripe hosted links or sessions). If billing is not switched on,
   the buttons say so instead of pretending. Open with shdPlans.open(), or load the dashboard with ?plans=1. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function getJSON(path, opts) { return fetch(path, opts).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return { ok: false, _offline: true }; }); }
  function money(n, interval) { var v = Number(n); if (!isFinite(v)) return ''; return '$' + (v % 1 ? v.toFixed(2) : v) + (interval ? ' / ' + (interval === 'month' ? 'mo' : interval === 'year' ? 'yr' : interval) : ''); }
  var root = null, prevFocus = null;

  function close() { if (root) { root.remove(); root = null; document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } } } }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function buy(item, btn, note) {
    var uid = ''; try { uid = localStorage.getItem('shd_userid') || ''; } catch (e) { /* ignore */ }
    btn.disabled = true; var was = btn.textContent; btn.textContent = 'Opening checkout…'; note.textContent = '';
    getJSON('/api/stripe/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: item, userId: uid || undefined }) }).then(function (d) {
      if (d && d.url) { location.href = d.url; return; }
      btn.disabled = false; btn.textContent = was;
      note.textContent = (d && (d.message || d.error)) || "Checkout isn't available yet. Please check back soon.";
    });
  }

  function open() {
    if (root) return; prevFocus = document.activeElement;
    var body = h('div', { class: 'pl-body' }, [h('div', { class: 'pl-note', text: 'Loading plans…' })]);
    var note = h('div', { class: 'pl-msg', role: 'status', 'aria-live': 'polite' });
    root = h('div', { class: 'pl-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Plans' }, [
      h('div', { class: 'pl-scrim', onclick: close }),
      h('div', { class: 'pl-card' }, [
        h('button', { type: 'button', class: 'pl-x', 'aria-label': 'Close', text: '×', onclick: close }),
        h('div', { class: 'pl-kick', text: 'PLANS' }), h('h2', { class: 'pl-h', text: 'Pick what fits you' }),
        h('p', { class: 'pl-sub', text: 'Start free. Upgrade when you need more. Bring your own keys and the work you make is yours.' }),
        body, note
      ])
    ]);
    document.body.appendChild(root); document.addEventListener('keydown', onKey);
    var first = root.querySelector('.pl-x'); if (first) first.focus();
    Promise.all([getJSON('/api/stripe/plans'), getJSON('/api/stripe/config')]).then(function (r) {
      var p = r[0] || {}, c = r[1] || {}; body.textContent = '';
      if (!p.ok || !p.tiers) { body.appendChild(h('div', { class: 'pl-note', text: p._offline ? "Can't reach the server right now. Try again in a moment." : 'Plans are not available yet.' })); return; }
      var live = c.enabled !== false;
      if (!live) body.appendChild(h('div', { class: 'pl-banner', text: "Paid plans aren't switched on yet. Everything below shows what's coming; the free plan works today." }));
      var grid = h('div', { class: 'pl-grid' });
      p.tiers.forEach(function (t) {
        var btn = h('button', { type: 'button', class: 'pl-btn' + (t.highlight ? ' hi' : ''), text: live && t.checkout !== false ? 'Choose ' + t.name : (live ? 'Choose ' + t.name : 'Coming soon'), onclick: function () { buy(t.id, btn, note); } });
        if (!live) btn.disabled = true;
        grid.appendChild(h('div', { class: 'pl-tier' + (t.highlight ? ' hi' : '') }, [
          h('div', { class: 'pl-name', text: t.name }), h('div', { class: 'pl-price', text: money(t.price, t.interval) }), t.blurb ? h('div', { class: 'pl-blurb', text: t.blurb }) : null,
          h('ul', { class: 'pl-feat' }, (t.features || []).slice(0, 8).map(function (f) { return h('li', { text: String(f) }); })), btn
        ]));
      });
      body.appendChild(grid);
      if ((p.credits || []).length) {
        body.appendChild(h('div', { class: 'pl-lbl', text: 'Top up credits' }));
        var row = h('div', { class: 'pl-row' });
        p.credits.forEach(function (cr) { var b = h('button', { type: 'button', class: 'pl-btn ghost', text: (cr.label || cr.id) + ' · ' + money(cr.usd), onclick: function () { buy(cr.id, b, note); } }); if (!live) b.disabled = true; row.appendChild(b); });
        body.appendChild(row);
      }
    });
  }
  window.shdPlans = { open: open, close: close };
  try { if (/[?&]plans=1\b/.test(location.search)) window.addEventListener('load', function () { setTimeout(open, 600); }); } catch (e) { /* ignore */ }
})();
