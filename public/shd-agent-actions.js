/* SHADDAI V119 — AGENT ACTIONS + AGENTS GALLERY.
   Things you can do with a forged agent, wherever its card appears:
     • Connect Grok: makes a 7-day bot token BOUND to this agent (default permissions + Start workflows + Use the data tools, nothing else),
       shown once, so Grok (or any MCP bot) controls THIS agent through the dashboard's tools and workflows.
     • Give it an API: opens the agent's Tools and APIs panel in Agents.
     • See it in the office / the Gallery.
   The Gallery gets an "Agents" shelf listing everything you have forged. Nothing here spends money; tokens are owner-made, scoped and revocable. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0, _offline: true }; }); }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function copy(t) { try { navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Press Ctrl+C to copy'); }); } catch (e) { toast('Press Ctrl+C to copy'); } }
  function nameOf(op) { return op.codename || op.name || op.id || 'your agent'; }

  /* ── Connect Grok (a token bound to this agent) ── */
  function grokFor(op) {
    var old = document.getElementById('shdGrokModal'); if (old) old.remove();
    var out = h('div', { class: 'iw-note', role: 'status', 'aria-live': 'polite', text: 'Preparing a token for ' + nameOf(op) + '…' }), actions = h('div', { class: 'iw-actions' });
    function close() { wrap.remove(); }
    var wrap = h('div', { id: 'shdGrokModal', class: 'iw-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Connect Grok' }, [h('div', { class: 'iw-scrim', onclick: close }), h('div', { class: 'iw-card' }, [
      h('div', { class: 'iw-kick', text: 'CONNECT' }), h('h3', { class: 'iw-h', text: 'Control ' + nameOf(op) + ' with Grok' }),
      h('p', { class: 'iw-sub', text: 'Makes a 7-day token tied to this agent. It can use the dashboard tools and start workflows as ' + nameOf(op) + ', and nothing else.' }), out, actions])]);
    document.body.appendChild(wrap); wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    actions.appendChild(h('button', { type: 'button', class: 'gl-btn ghost', text: 'Cancel', onclick: close }));
    if (!op.id) { out.textContent = 'This agent has no saved id yet. Open it from My Space after it finishes saving.'; return; }
    api('GET', '/api/bridge/tokens').then(function (d) {
      if (d._s === 401) { out.textContent = 'Sign in first, then connect Grok.'; return; }
      if (!d.ok && !d.grantable_scopes) { out.textContent = d._offline ? "Can't reach the server right now." : 'The bot bridge is not running on this server yet.'; return; }
      var grant = d.grantable_scopes || [], want = (d.default_scopes || []).concat(['workflows:run', 'tools:run']).filter(function (s, i, a) { return a.indexOf(s) === i && grant.indexOf(s) > -1; });
      var missing = ['workflows:run', 'tools:run'].filter(function (s) { return want.indexOf(s) < 0; });
      if (missing.length) { out.textContent = 'This server cannot grant: ' + missing.join(', '); return; }
      return api('POST', '/api/bridge/tokens', { label: 'Grok · ' + nameOf(op), scopes: want, days: 7, agent_id: op.id }).then(function (t) {
        if (!t.ok) { out.textContent = 'Could not create the token: ' + (t.error || t._s); return; }
        out.textContent = ''; var url = location.origin + '/api/bridge/mcp';
        out.appendChild(h('div', { class: 'iw-step', text: '1. Copy the MCP address and the token (the token is shown once).' }));
        out.appendChild(h('code', { class: 'iw-code', text: url })); out.appendChild(h('code', { class: 'iw-code', text: t.token }));
        out.appendChild(h('div', { class: 'iw-step', text: '2. In Grok, add a remote MCP server with that address, and paste the token as the Bearer token.' }));
        out.appendChild(h('div', { class: 'iw-step warn', text: 'Paste the token only into Grok\'s connector settings, never into a chat. When you are done testing, revoke it in Worlds → My Space → Outside bots.' }));
        actions.textContent = ''; actions.appendChild(h('button', { type: 'button', class: 'gl-btn', text: 'Copy token', onclick: function () { copy(t.token); } })); actions.appendChild(h('button', { type: 'button', class: 'gl-btn ghost', text: 'Copy address', onclick: function () { copy(url); } })); actions.appendChild(h('button', { type: 'button', class: 'gl-btn ghost', text: 'Done', onclick: close }));
      });
    });
  }
  function apiFor(op) { try { window.showView('agents'); } catch (e) { return; } var n = nameOf(op), t = 0, iv = setInterval(function () { t++; var b = document.getElementById('e5tbtn_' + n); if (b) { clearInterval(iv); try { b.scrollIntoView({ block: 'center' }); b.click(); } catch (e) { /* ignore */ } } else if (t > 25) { clearInterval(iv); toast('Open Agents → ' + n + ' → Tools & APIs to attach an API.'); } }, 400); }
  function actionsRow(op) {
    return h('div', { class: 'gl-row aa-row', role: 'group', 'aria-label': 'Connect ' + nameOf(op) }, [
      h('button', { type: 'button', class: 'gl-btn', text: 'Connect Grok', title: 'A 7-day token that lets Grok control this agent', onclick: function () { grokFor(op); } }),
      h('button', { type: 'button', class: 'gl-btn ghost', text: 'Give it an API', onclick: function () { apiFor(op); } }),
      h('button', { type: 'button', class: 'gl-btn ghost', text: 'Open office', onclick: function () { try { window.showView('office'); } catch (e) { /* ignore */ } } })]);
  }
  window.shdAgentActions = actionsRow; window.shdGrokFor = grokFor;

  /* ── Gallery: an "Agents" shelf ── */
  function agentsShelf() {
    var box = h('div', null, [h('div', { class: 'aa-head' }, [h('div', null, [h('b', { text: 'Your agents' }), h('small', { text: 'Everything you have forged. Style them, connect Grok or an API, or send them to the 3D realm.' })]), h('button', { type: 'button', class: 'gl-btn', text: 'Forge a new agent', onclick: function () { try { window.showView('forge'); } catch (e) { /* ignore */ } } })])]);
    var list = h('div', { class: 'aa-list' }, [h('div', { class: 'og-empty', text: 'Loading your agents…' })]); box.appendChild(list);
    var uid = ''; try { uid = localStorage.getItem('shd_userid') || ''; } catch (e) { /* ignore */ }
    api('GET', '/api/operatives' + (uid ? '?owner=' + encodeURIComponent(uid) : '')).then(function (d) {
      list.textContent = ''; var ops = (d && (d.operatives || (d.data && d.data.operatives))) || [];
      if (d._s === 401) { list.appendChild(h('div', { class: 'og-empty', text: 'Sign in to see your agents.' })); return; }
      if (!ops.length) { list.appendChild(h('div', { class: 'og-empty', text: d._offline ? "Can't reach the server right now." : 'No agents yet. Forge your first one and it shows up here.' })); return; }
      ops.forEach(function (o) { o.name = o.name || o.codename; list.appendChild(window.shdGlow ? window.shdGlow.agentCard(o) : h('div', { class: 'og-card', text: nameOf(o) })); });
    });
    return box;
  }
  function wrapGallery() {
    var orig = window.renderOfficeGallery; if (typeof orig !== 'function' || orig._aa) return;
    window.renderOfficeGallery = function () {
      var room = document.getElementById('officeGallery'), mode = window._ogMode;
      if (!room) return orig.apply(this, arguments);
      if (mode === 'agents') { window._ogMode = '2d'; try { orig.apply(this, arguments); } finally { window._ogMode = 'agents'; } } else orig.apply(this, arguments);
      var row = room.querySelector('.og-sub'); row = row && row.parentElement;
      if (row && !row.querySelector('.og-agents')) row.appendChild(h('button', { type: 'button', class: 'og-sub og-agents' + (mode === 'agents' ? ' on' : ''), text: 'Agents', onclick: function () { window._ogMode = 'agents'; window.renderOfficeGallery(); } }));
      if (mode === 'agents') { [].forEach.call(room.querySelectorAll('.og-sub'), function (b) { b.classList.toggle('on', b.classList.contains('og-agents')); }); var last = room.lastElementChild; if (last && !last.classList.contains('aa-shelf') && last.tagName === 'DIV' && !last.querySelector('.og-sub')) last.remove(); var shelf = agentsShelf(); shelf.classList.add('aa-shelf'); room.appendChild(shelf); }
    };
    window.renderOfficeGallery._aa = true;
  }
  wrapGallery(); window.addEventListener('load', wrapGallery); setTimeout(wrapGallery, 1500);
})();
