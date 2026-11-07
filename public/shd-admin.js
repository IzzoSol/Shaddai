/* SHADDAI V119 — ADMIN WINDOW. Replaces the old Admin Panel modal.
   The old panel read fields the server never sends (jobsActive, memoryUsage ...), so it always showed 0s, and its Backup buttons called a stub.
   This window shows only what the server really returns: /api/full-status (server, AI engine, agent processes) and /api/admin/analytics
   (jobs, bids, revenue, sessions, per-agent requests, uptime). The analytics endpoint is admin-only: it needs a verified admin login
   (ADMIN_EMAILS) or the admin token (kept in memory only, never saved). If access is missing it says so; it never shows a made-up number. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var root = null, tokenMem = '', prevFocus = null;
  function close() { if (root) { root.remove(); root = null; document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } } } }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  function idToken() {
    try { var u = (window.firebase && firebase.auth && firebase.auth().currentUser) || (window.SHD_AUTH && window.SHD_AUTH.user); if (u && u.getIdToken) return u.getIdToken(); } catch (e) { /* ignore */ }
    return Promise.resolve(null);
  }
  function getJSON(path, headers) { return fetch(path, { headers: headers || {}, credentials: 'same-origin', signal: AbortSignal.timeout(9000) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { s: r.status, d: d }; }); }).catch(function () { return { s: 0, d: {} }; }); }
  function dur(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); var d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + 'd ' + hh + 'h' : hh ? hh + 'h ' + m + 'm' : m + 'm ' + (sec % 60) + 's'; }
  function has(x) { return x !== undefined && x !== null && x !== ''; }
  function tile(label, value, hint, tone) { return h('div', { class: 'ad-tile' + (tone ? ' ' + tone : ''), title: hint || '' }, [h('b', { text: has(value) ? String(value) : '—' }), h('small', { text: label })]); }

  function load() {
    var body = root.querySelector('.ad-body'), stamp = root.querySelector('.ad-stamp'); body.textContent = ''; body.appendChild(h('div', { class: 'ad-note', text: 'Loading…' }));
    Promise.all([getJSON('/api/full-status'), idToken().then(function (t) { var hd = {}; if (t) hd.Authorization = 'Bearer ' + t; if (tokenMem) hd['x-shaddai-admin'] = tokenMem; return getJSON('/api/admin/analytics', hd); })]).then(function (r) {
      var st = r[0], an = r[1]; body.textContent = ''; stamp.textContent = 'Updated ' + new Date().toTimeString().slice(0, 8);
      // server health (public)
      var health = h('section', { class: 'ad-sec' }, [h('h3', { text: 'Server' })]), grid = h('div', { class: 'ad-grid' }); health.appendChild(grid);
      if (st.s === 200 && st.d && st.d.server) {
        grid.appendChild(tile('Server', st.d.server === 'online' ? 'Online' : String(st.d.server), '', st.d.server === 'online' ? 'ok' : 'bad'));
        grid.appendChild(tile('AI engine (Ollama)', st.d.ollama ? 'Online' : 'Offline', 'The local model runner. Cloud brains still work when it is offline.', st.d.ollama ? 'ok' : 'warn'));
        var ag = st.d.agents || {}, names = Object.keys(ag), on = names.filter(function (k) { return ag[k] === 'online'; }).length;
        grid.appendChild(tile('Agent processes', on + ' / ' + names.length, 'Local agent helper processes (ports 8000 to 8008). They are normally offline on a hosted server.', on ? 'ok' : 'warn'));
        if (names.length) health.appendChild(h('div', { class: 'ad-chips' }, names.map(function (k) { return h('span', { class: 'ad-chip ' + (ag[k] === 'online' ? 'ok' : 'off'), text: k + ' · ' + ag[k] }); })));
      } else health.appendChild(h('div', { class: 'ad-note bad', text: st.s === 0 ? "Can't reach the server right now." : 'Server status is unavailable (HTTP ' + st.s + ').' }));
      body.appendChild(health);
      // analytics (admin only)
      var sec = h('section', { class: 'ad-sec' }, [h('h3', { text: 'Business and traffic' })]); body.appendChild(sec);
      if (an.s === 200 && an.d && an.d.jobs) {
        var d = an.d, g2 = h('div', { class: 'ad-grid' });
        [['Jobs', d.jobs.total, 'All jobs ever posted'], ['Open jobs', d.jobs.open], ['Jobs today', d.jobs.today], ['Jobs this week', d.jobs.thisWeek], ['Completed', d.jobs.completed], ['Bids', d.bids && d.bids.total, d.bids ? 'Average ' + d.bids.avgPerJob + ' per job' : ''], ['Revenue (completed job budgets)', d.revenue && d.revenue.total, 'Sum of budgets on completed jobs, in the units the jobs were posted in'], ['Active sessions', d.sessions && d.sessions.active, d.sessions ? d.sessions.total + ' total' : ''], ['Webhooks', d.events && d.events.webhooks], ['Live connections', d.sseClients], ['Uptime', has(d.uptime) ? dur(d.uptime) : null]].forEach(function (x) { g2.appendChild(tile(x[0], x[1], x[2])); });
        sec.appendChild(g2);
        var ags = d.agents || {}, keys = Object.keys(ags);
        if (keys.length) { var max = Math.max.apply(null, keys.map(function (k) { return ags[k].requests || 0; })) || 1, tb = h('div', { class: 'ad-agents' }, [h('h4', { text: 'Requests per agent' })]);
          keys.forEach(function (k) { var a = ags[k]; tb.appendChild(h('div', { class: 'ad-arow' }, [h('span', { text: k }), h('span', { class: 'ad-bar' }, [h('i', { style: 'width:' + Math.round((a.requests || 0) / max * 100) + '%' })]), h('span', { text: (a.requests || 0) + ' calls · ' + (a.avgMs || 0) + ' ms avg' })])); }); sec.appendChild(tb); }
      } else if (an.s === 401 || an.s === 403) {
        sec.appendChild(h('div', { class: 'ad-note warn', text: 'Admin access is required to see this. Sign in with an admin account, or enter the admin token below. The token is kept in memory only and is never saved.' }));
        var inp = h('input', { class: 'ad-in', type: 'password', placeholder: 'Admin token', autocomplete: 'off', 'aria-label': 'Admin token' });
        sec.appendChild(h('div', { class: 'ad-row' }, [inp, h('button', { type: 'button', class: 'ad-btn', text: 'Unlock', onclick: function () { tokenMem = inp.value; load(); } })]));
      } else if (an.s === 500 && an.d && /not configured/i.test(String(an.d.error || ''))) {
        sec.appendChild(h('div', { class: 'ad-note warn', text: 'Admin is not set up on this server yet. In Render, add ADMIN_EMAILS (your login email) or ADMIN_TOKEN to the environment, then reload this window.' }));
      } else sec.appendChild(h('div', { class: 'ad-note bad', text: an.s === 0 ? "Can't reach the server right now." : 'Analytics are unavailable (HTTP ' + an.s + ').' }));
      body.appendChild(h('div', { class: 'ad-foot', text: 'Backups run on the server and are not available from this window yet. Nothing here is estimated.' }));
    });
  }
  function open() {
    if (root) { load(); return; } prevFocus = document.activeElement;
    root = h('div', { class: 'ad-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Admin' }, [h('div', { class: 'ad-scrim', onclick: close }), h('div', { class: 'ad-card' }, [
      h('div', { class: 'ad-top' }, [h('div', null, [h('div', { class: 'ad-kick', text: 'ADMIN' }), h('h2', { text: 'System status' })]), h('div', { class: 'ad-actions' }, [h('span', { class: 'ad-stamp' }), h('button', { type: 'button', class: 'ad-btn ghost', text: 'Refresh', onclick: load }), h('button', { type: 'button', class: 'ad-btn', text: 'Close', onclick: close })])]), h('div', { class: 'ad-body' })])]);
    document.body.appendChild(root); document.addEventListener('keydown', onKey, true); root.querySelector('.ad-btn:not(.ghost)').focus(); load();
  }
  window.loadAdminPanel = open;
  window.shdAdmin = { open: open, close: close, hasToken: function () { return !!tokenMem; } };
})();
