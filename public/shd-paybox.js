/* SHADDAI V119 — PAYBOX WALLETS. Replaces the Solana Pay card. Each agent shows its own PAYBOX wallet balance (credits) from
   GET /api/paybox/agent-wallets. Solana and Hyperliquid are shown as coming soon; nothing here touches a chain.
   "Add funds" asks PAYBOX for a checkout link for that agent (only agents with a funded-and-ready wallet have one),
   "Tip" moves credits from your balance to the agent's PAYBOX ledger through /api/paybox/agent-tip. */
(function () {
  'use strict';
  var ROLE = { SHADDAI: ['Orchestrator', '#f0b429'], ZEROX: ['Wealth', '#00e5a0'], ORACLE: ['Research', '#a78bfa'], NEXUS: ['Backend', '#00b4ff'], TURTLE: ['Design', '#2dd4bf'], QUILL: ['Writing', '#fb923c'], PIKADON: ['Security', '#f43f5e'] };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0, _offline: true }; }); }
  function uid() { try { return localStorage.getItem('shd_userid') || ''; } catch (e) { return ''; } }
  function fmt(n) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var mount, grid, tiles, status, msg, timer;
  function say(t) { if (msg) msg.textContent = t || ''; }
  function chip(txt, cls) { return h('span', { class: 'pbw-chip ' + (cls || ''), text: txt }); }
  function forgedNames() { return api('GET', '/api/operatives').then(function (d) { var l = (d && (d.operatives || (d.data && d.data.operatives))) || []; return l.map(function (o) { return o.codename || o.name; }).filter(Boolean).slice(0, 12); }); }

  function card(a) {
    var meta = ROLE[a.agent] || ['Forged agent', '#00e5a0'], color = meta[1];
    var note = { set textContent(t) { say(t); } };
    var amt = h('input', { class: 'pbw-amt', type: 'number', min: '0.01', step: '0.01', value: '1', 'aria-label': 'Credits to tip ' + a.agent });
    var fund = h('button', { type: 'button', class: 'pbw-btn ghost', text: 'Add funds', onclick: function () {
      note.textContent = 'Asking PAYBOX…';
      api('GET', '/api/paybox/tip-link?agent=' + encodeURIComponent(a.agent)).then(function (d) {
        var u = d && (d.checkout_url || d.checkoutUrl); if (u) { window.open(u, '_blank', 'noopener'); note.textContent = 'Checkout opened in a new tab.'; return; }
        note.textContent = d._offline ? "Can't reach the server right now." : (d._s === 404 ? a.agent + "'s wallet isn't ready for funding yet." : (d.error || 'Funding is not available yet.'));
      }); } });
    var tip = h('button', { type: 'button', class: 'pbw-btn', text: 'Tip', onclick: function () {
      if (!uid()) { note.textContent = 'Sign in first.'; return; }
      var v = Number(amt.value); if (!(v > 0)) { note.textContent = 'Enter an amount above 0.'; return; }
      tip.disabled = true; note.textContent = 'Sending…';
      api('POST', '/api/paybox/agent-tip', { buyerUserId: uid(), agentCodename: a.agent, amountCredits: v }).then(function (d) {
        tip.disabled = false;
        if (d.ok) { note.textContent = 'Sent ' + fmt(v) + ' credits. Net to ' + a.agent + ': ' + fmt(d.net != null ? d.net : v) + '.'; load(); return; }
        note.textContent = d._offline ? "Can't reach the server right now." : (d.error === 'INSUFFICIENT_CREDITS' ? 'Not enough credits.' : (d.error || 'Could not send.'));
      }); } });
    return h('div', { class: 'pbw-card', style: '--c:' + color }, [
      h('div', { class: 'pbw-name', text: a.agent }), h('div', { class: 'pbw-role', text: meta[0] }),
      h('div', { class: 'pbw-bal' }, [h('b', { text: fmt(a.balance) }), h('small', { text: ' credits' })]),
      h('div', { class: 'pbw-row' }, [amt, tip, fund])]);
  }

  var lastLoad = 0;
  function load() {
    if (!mount) return; lastLoad = Date.now();
    forgedNames().then(function (names) {
      return api('GET', '/api/paybox/agent-wallets' + (names.length ? '?agents=' + encodeURIComponent(names.join(',')) : ''));
    }).then(function (d) {
      grid.textContent = ''; tiles.textContent = '';
      if (!d || !d.ok) { grid.appendChild(h('div', { class: 'pbw-empty', text: d && d._offline ? "Can't reach PAYBOX right now." : 'Wallets are not available yet.' })); status.textContent = 'PAYBOX · offline'; return; }
      status.textContent = 'PAYBOX · live'; var total = 0, funded = 0; d.agents.forEach(function (a) { total += a.balance; if (a.balance > 0) funded++; grid.appendChild(card(a)); });
      [['Total balance', fmt(total) + ' cr'], ['Wallets funded', funded + ' / ' + d.agents.length], ['Agents', String(d.agents.length)]].forEach(function (t) { tiles.appendChild(h('div', { class: 'pbw-tile' }, [h('b', { text: t[1] }), h('small', { text: t[0] })])); });
    });
  }
  function build(host) {
    status = chip('PAYBOX · …', 'live'); msg = h('div', { class: 'pbw-note pbw-msg', role: 'status', 'aria-live': 'polite' }); tiles = h('div', { class: 'pbw-tiles' }); grid = h('div', { class: 'pbw-grid' }, [h('div', { class: 'pbw-empty', text: 'Loading wallets…' })]);
    mount = h('section', { class: 'pbw', 'aria-label': 'PAYBOX wallets' }, [
      h('div', { class: 'pbw-head' }, [h('div', null, [h('div', { class: 'pbw-kick', text: 'PAYBOX' }), h('h3', { class: 'pbw-h', text: 'Agent wallets' }), h('p', { class: 'pbw-sub', text: "Every agent has its own PAYBOX wallet. The balance you see is that agent's own." })]),
        h('div', { class: 'pbw-chips' }, [status, chip('Solana · coming soon'), chip('Hyperliquid · coming soon'), h('button', { type: 'button', class: 'pbw-btn ghost', text: 'Refresh', onclick: load })])]),
      msg, tiles, grid]);
    host.appendChild(mount); load();
    /* refresh whenever the panel scrolls or tabs into view, so a balance is never stale when you look at it */
    try { new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; }) && Date.now() - lastLoad > 8000) load(); }).observe(mount); } catch (e) { /* ignore */ } clearInterval(timer); timer = setInterval(function () { if (!document.hidden && mount && mount.offsetParent) load(); }, 60000);
  }
  function init() { var host = document.getElementById('shdPayboxMount'); if (host && !host.dataset.on) { host.dataset.on = '1'; build(host); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.shdPaybox = { refresh: load };
})();
