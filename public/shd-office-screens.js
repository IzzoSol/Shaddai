/* SHADDAI V119 — OFFICE SCREENS. Widgets that live inside the 3D office, so you can watch markets, read news and start workflows
   without leaving it. You choose which ones show (saved per user in shd_o3_screens). Free public data only.
   Every widget says where its data comes from and when it was fetched, and its badge is computed from what really happened:
   LIVE (fetched recently), STALE (an old result is showing), ERROR (nothing loaded), LOADING. Nothing here is financial advice. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var KEY = 'shd_o3_screens';
  function loadSel() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && Array.isArray(j.on)) return j.on; } catch (e) { /* ignore */ } return ['markets', 'news']; }
  function saveSel(on) { try { localStorage.setItem(KEY, JSON.stringify({ on: on })); } catch (e) { /* ignore */ } }
  function money(n) { n = Number(n) || 0; if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return Math.round(n).toLocaleString(); if (n >= 1) return n.toFixed(2); return n.toFixed(4); }
  function ago(ms) { var s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + 's'; var m = Math.round(s / 60); if (m < 60) return m + 'm'; return Math.round(m / 60) + 'h'; }
  function hms(t) { return new Date(t).toTimeString().slice(0, 8); }
  function getJSON(u, ms) { return fetch(u, { signal: AbortSignal.timeout(ms || 9000) }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function api(method, path, body) { var hd = { 'Content-Type': 'application/json' }; try { var t = localStorage.getItem('shd_token'); if (t) hd.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return fetch(path, { method: method, headers: hd, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0, _offline: true }; }); }

  /* the widgets. load() resolves to data or throws; every one names its source. */
  var W = {
    markets: { title: 'Markets', src: 'CoinGecko via TuFish · USD · 24h', every: 60000,
      load: function () { return getJSON('/api/tufish/watch?ids=bitcoin,ethereum,solana').then(function (d) { if (!d || !d.coins || !d.coins.length) throw new Error('no coins returned'); return d.coins; }); },
      draw: function (box, coins) { coins.forEach(function (c) { var ch = Number(c.change24h) || 0, up = ch >= 0; box.appendChild(h('div', { class: 'o3s-row' }, [h('b', { text: String(c.symbol || '').toUpperCase() }), h('span', { text: '$' + money(c.price) }), h('span', { class: up ? 'up' : 'dn', text: (up ? '▲ +' : '▼ ') + ch.toFixed(1) + '%' })])); }); } },
    mood: { title: 'Fear and greed', src: 'Fear and Greed index (crypto only) · 0 to 100', every: 300000,
      load: function () { return getJSON('/api/market/fear-greed', 7000).catch(function () { return getJSON('https://api.alternative.me/fng/?limit=1', 9000); }).then(function (d) { var f = d && (d.data ? d.data[0] : d); if (!f || f.value == null) throw new Error('no value returned'); return { v: parseInt(f.value, 10), label: f.value_classification || '' }; }); },
      draw: function (box, m) { box.appendChild(h('div', { class: 'o3s-big', text: String(m.v) })); box.appendChild(h('div', { class: 'o3s-sub', text: m.label })); box.appendChild(h('div', { class: 'o3s-bar' }, [h('i', { style: 'width:' + Math.max(0, Math.min(100, m.v)) + '%' })])); } },
    news: { title: 'News', src: 'Crypto headlines via TuFish', every: 300000,
      load: function () { return getJSON('/api/tufish/news?q=crypto', 11000).then(function (d) { var it = (d && d.items) || []; if (!it.length) throw new Error('no headlines returned'); return it.slice(0, 6); }); },
      draw: function (box, items) { items.forEach(function (it) { var a = h('a', { href: /^https?:/.test(it.link || '') ? it.link : '#', target: '_blank', rel: 'noopener noreferrer', text: String(it.title || '') }); box.appendChild(h('div', { class: 'o3s-news' }, [h('small', { text: String(it.source || 'news') }), a])); }); } },
    run: { title: 'Quick run', src: 'Your workflows (needs sign in)', every: 0, load: null, custom: true }
  };
  var ORDER = ['markets', 'mood', 'news', 'run'], state = {}, panel = null, body = null, editing = false, timer = null, runBox = null;
  ORDER.forEach(function (k) { state[k] = { ok: 0, err: '', data: null, busy: false }; });
  function badge(k) {
    var s = state[k], w = W[k], now = Date.now(); if (w.custom) return null;
    if (!s.ok) return s.err ? { c: 'error', t: 'ERROR', d: s.err } : { c: 'loading', t: 'LOADING', d: 'Loading' };
    if (s.err) return { c: 'stale', t: 'STALE', d: 'Latest refresh failed (' + s.err + '). Showing the last good result.' };
    return (now - s.ok) > (w.every || 60000) * 2.5 ? { c: 'stale', t: 'STALE', d: 'Not refreshed for ' + ago(now - s.ok) } : { c: 'live', t: 'LIVE', d: 'Fetched ' + ago(now - s.ok) + ' ago' };
  }
  function refresh(k) {
    var w = W[k], s = state[k]; if (!w.load || s.busy) return; s.busy = true;
    w.load().then(function (d) { s.data = d; s.ok = Date.now(); s.err = ''; }).catch(function (e) { s.err = String((e && e.message) || e).slice(0, 80); }).then(function () { s.busy = false; paint(); });
  }
  function runCard() {
    var out = h('div', { class: 'o3s-sub', role: 'status', 'aria-live': 'polite', text: 'Pick one. It runs as you and uses your free allowance.' });
    var topic = h('input', { class: 'o3s-in', type: 'text', maxlength: '80', placeholder: 'topic for Research (e.g. mangroves)', 'aria-label': 'Research topic' });
    function go(wf, label) {
      var params = {}; if (wf === 'research.topic') { if (!topic.value.trim()) { out.textContent = 'Type a topic first.'; topic.focus(); return; } params.query = topic.value.trim(); }
      out.textContent = 'Starting ' + label + '…';
      api('POST', '/api/bridge/run', { workflow_id: wf, params: params, idempotency_key: 'screens-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }).then(function (d) {
        if (!d.ok) { out.textContent = d._s === 401 ? 'Sign in to run workflows.' : d._offline ? "Can't reach the server." : 'Could not start: ' + (d.error || d._s); return; }
        var id = d.run.run_id, tries = 0;
        (function poll() { api('GET', '/api/bridge/runs').then(function (r) {
          var x = ((r && r.runs) || []).filter(function (y) { return y.run_id === id; })[0];
          if (x && x.status === 'succeeded') { var k = x.outputs && Object.keys(x.outputs)[0], v = k ? String(x.outputs[k]) : ''; try { var j = JSON.parse(v); v = j.summary || j.title || (j.price ? (j.symbol || k) + ' ' + j.price : JSON.stringify(j)); } catch (e) { /* plain text */ } out.textContent = label + ': ' + String(v || 'done').slice(0, 280); return; }
          if (x && /failed|expired|cancelled/.test(x.status)) { out.textContent = label + ' ' + x.status + (x.error ? ': ' + x.error : ''); return; }
          if (++tries < 30) { out.textContent = label + ': ' + (x ? x.status.replace('_', ' ') : 'queued') + '…'; setTimeout(poll, 1200); } else out.textContent = label + ' is still running. Check the office for the result.';
        }); })();
      });
    }
    return h('div', null, [topic, h('div', { class: 'o3s-btns' }, [h('button', { type: 'button', class: 'o3s-btn', text: 'Market snapshot', onclick: function () { go('market.snapshot', 'Market snapshot'); } }), h('button', { type: 'button', class: 'o3s-btn', text: 'News digest', onclick: function () { go('news.digest', 'News digest'); } }), h('button', { type: 'button', class: 'o3s-btn', text: 'Research', onclick: function () { go('research.topic', 'Research'); } })]), out]);
  }
  function paint() {
    if (!body || !body.isConnected) return; var on = loadSel(); body.textContent = '';
    if (editing) {
      body.appendChild(h('div', { class: 'o3s-sub', text: 'Choose what shows on your screens. Saved for you.' }));
      ORDER.forEach(function (k) { var cb = h('input', { type: 'checkbox', 'aria-label': W[k].title }); cb.checked = on.indexOf(k) > -1; cb.addEventListener('change', function () { var cur = loadSel().filter(function (x) { return x !== k; }); if (cb.checked) cur.push(k); saveSel(ORDER.filter(function (x) { return cur.indexOf(x) > -1; })); if (cb.checked) refresh(k); }); body.appendChild(h('label', { class: 'o3s-opt' }, [cb, h('span', null, [h('b', { text: W[k].title }), h('small', { text: W[k].src })])])); });
      return;
    }
    if (!on.length) { body.appendChild(h('div', { class: 'o3s-sub', text: 'No screens chosen. Press Edit to add some.' })); return; }
    ORDER.filter(function (k) { return on.indexOf(k) > -1; }).forEach(function (k) {
      var w = W[k], b = badge(k), card = h('section', { class: 'o3s-card', 'aria-label': w.title }), head = h('div', { class: 'o3s-head' }, [h('b', { text: w.title })]);
      if (b) head.appendChild(h('span', { class: 'o3s-chip s-' + b.c, text: b.t, title: b.d }));
      if (w.load) head.appendChild(h('button', { type: 'button', class: 'o3s-mini', text: 'Refresh', 'aria-label': 'Refresh ' + w.title, onclick: function () { refresh(k); } }));
      card.appendChild(head);
      if (w.custom) { if (!runBox) runBox = runCard(); card.appendChild(runBox); }
      else { var box = h('div', { class: 'o3s-body' }); if (state[k].data) w.draw(box, state[k].data); else box.appendChild(h('div', { class: 'o3s-sub', text: b && b.c === 'error' ? 'Could not load: ' + state[k].err : 'Loading…' })); card.appendChild(box); }
      var s = state[k]; card.appendChild(h('div', { class: 'o3s-foot', text: w.src + (s.ok ? ' · fetched ' + hms(s.ok) + ' (' + ago(Date.now() - s.ok) + ' ago)' : '') }));
      body.appendChild(card);
    });
    body.appendChild(h('div', { class: 'o3s-foot', text: 'Free public data. Not financial advice.' }));
  }
  function tick() {
    if (!panel || !panel.isConnected || panel.style.display === 'none') { return; }
    var on = loadSel(), now = Date.now(); on.forEach(function (k) { var w = W[k], s = state[k]; if (w.load && !s.busy && (!s.ok && !s.err || (w.every && now - (s.ok || 0) >= w.every))) refresh(k); }); paint();
  }
  function open(stage) {
    if (!panel) {
      body = h('div', { class: 'o3s-bodywrap' });
      var edit = h('button', { type: 'button', class: 'o3s-mini', text: 'Edit', onclick: function () { editing = !editing; edit.textContent = editing ? 'Done' : 'Edit'; paint(); } });
      panel = h('aside', { class: 'o3s-panel', role: 'region', 'aria-label': 'Office screens', style: 'display:none' }, [h('div', { class: 'o3s-top' }, [h('b', { text: 'Screens' }), h('div', null, [edit, h('button', { type: 'button', class: 'o3s-mini', 'aria-label': 'Close screens', text: '×', onclick: function () { panel.style.display = 'none'; } })])]), body]);
    }
    if (panel.parentElement !== stage) stage.appendChild(panel);
    var show = panel.style.display === 'none'; panel.style.display = show ? 'flex' : 'none'; if (show) { tick(); paint(); }
    if (!timer) timer = setInterval(tick, 5000);
  }
  function wire() {
    var card = document.getElementById('shdOffice3d'); if (!card) return; var hud = card.querySelector('.o3-hud'), stage = card.querySelector('.o3-stage'); if (!hud || !stage || hud.querySelector('.o3s-open')) return;
    var b = h('button', { type: 'button', class: 'o3-btn ghost o3s-open', 'aria-haspopup': 'true', text: 'Screens', onclick: function () { open(stage); } }); hud.insertBefore(b, hud.firstChild);
  }
  new MutationObserver(wire).observe(document.body, { childList: true, subtree: true }); wire();
  window.shdOfficeScreens = { open: function () { var c = document.getElementById('shdOffice3d'); if (c) open(c.querySelector('.o3-stage')); }, state: state };
})();
