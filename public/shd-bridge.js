/* SHADDAI V119 — "Outside bots" panel (Grok Bot / Muse / any MCP client).
   Owner side of /api/bridge: mint a scoped token, copy the MCP URL, revoke, approve or deny runs, read the audit.
   The bot can never approve its own run; this panel is the only place that can. Tokens are shown once. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdrs(json) {
    var o = {}; if (json) o['Content-Type'] = 'application/json';
    try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ }
    return o;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: hdrs(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function copy(text) {
    try { if (navigator.clipboard) return navigator.clipboard.writeText(text).then(function () { toast('Copied'); }); } catch (e) { /* fall through */ }
    var t = h('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { /* ignore */ } t.remove();
  }
  var SCOPE_HELP = {
    'workflows:read': 'See which workflows exist', 'workflows:run': 'Start workflows (demo ones for now)', 'runs:read': 'Read run status and receipts',
    'runs:cancel': 'Cancel its own runs', 'agents:read': 'See your agents\' presence', 'plots:read': 'Read plots you own or that are free',
    'tools:run': 'Use the read-only data tools and dashboard skills', 'economy:read': 'Read your Sparks balance (no spending)', 'school:read': 'See Athenaeum classes', 'school:join': 'Sign its agent up for free classes', 'inbox:write': 'Leave messages in your inbox', 'chat:talk': 'Chat with you in the dashboard (read your messages, reply)', 'plots:maintain': 'Maintain your plots (SAP, when enabled)', 'rag:read': 'Search the council knowledge bases', 'agents:ask': 'Ask council agents questions (limited per hour)'
  };

  window.shdBridgeBox = function () {
    var url = location.origin + '/api/bridge/mcp';
    var body = h('div', { class: 'sw-body' });
    var tokensEl = h('div', { class: 'sw-grid' }), runsEl = h('div', { class: 'sw-grid' }), reveal = h('div'), auditEl = h('div', { class: 'sw-sub' });
    var scopesBox = h('div', { class: 'sw-actions' }), label = h('input', { class: 'sw-sel', placeholder: 'Name (e.g. Grok Bot)', maxlength: '60', 'aria-label': 'Bot name' });
    var days = h('select', { class: 'sw-sel', 'aria-label': 'Expires' }, [h('option', { value: '7', text: '7 days' }), h('option', { value: '30', text: '30 days', selected: 'selected' }), h('option', { value: '90', text: '90 days' })]);
    var checks = {};
    var capIn = h('input', { class: 'sw-sel', type: 'number', min: '0', max: '50', step: '0.10', value: '1.00', 'aria-label': 'Daily Sparks cap for this bot', style: 'width:92px', title: 'Most Sparks this bot may spend per day beyond the free allowance (1 Spark = $1)' });
    var usageEl = h('div', { class: 'sw-grid' });
    var agentSel = h('select', { class: 'sw-sel', 'aria-label': 'Body for this bot' }, [h('option', { value: '', text: 'No body (shows as a diamond)' })]);
    var me = ''; try { me = localStorage.getItem('shd_userid') || ''; } catch (e) { /* ignore */ }
    api('GET', '/api/operatives' + (me ? '?owner=' + encodeURIComponent(me) : '')).then(function (d) {
      var l = (d && (d.operatives || (d.data && d.data.operatives))) || (Array.isArray(d) ? d : []);
      l.forEach(function (o) { agentSel.appendChild(h('option', { value: o.id, text: 'Body: ' + (o.name || o.id) })); });
    }).catch(function () { /* optional */ });

    function msg(t) { return h('div', { class: 'sw-msg dim', text: t }); }
    function render(d) {
      if (d._status === 401) { body.textContent = ''; body.appendChild(msg('Sign in to connect an outside bot.')); return false; }
      if (d._status === 404 || d._status >= 500) { body.textContent = ''; body.appendChild(msg('The bot bridge is not running on this server yet.')); return false; }
      return true;
    }
    function loadTokens() {
      api('GET', '/api/bridge/tokens').then(function (d) {
        if (!render(d)) return;
        tokensEl.textContent = '';
        if (!scopesBox.childNodes.length) (d.grantable_scopes || []).forEach(function (s) {
          var c = h('input', { type: 'checkbox', id: 'sb-' + s }); c.checked = (d.default_scopes || []).indexOf(s) > -1; checks[s] = c;
          scopesBox.appendChild(h('label', { class: 'sw-sub', title: SCOPE_HELP[s] || s, style: 'display:flex;gap:5px;align-items:center;cursor:pointer' }, [c, s]));
        });
        var list = (d.tokens || []).filter(function (t) { return !t.revoked; });
        if (!list.length) { tokensEl.appendChild(msg('No bots connected yet.')); return; }
        list.forEach(function (t) {
          tokensEl.appendChild(h('div', { class: 'sw-card slim' }, [
            h('div', { class: 'sw-row' }, [h('b', { text: t.label }), h('i', { class: 'sw-chip', text: t.last_used_at ? 'used' : 'unused' })]),
            h('div', { class: 'sw-sub', text: t.scopes.join(' · ') }),
            h('div', { class: 'sw-sub', text: 'expires ' + String(t.expires_at).slice(0, 10) + (t.agent_id ? ' · bound to ' + t.agent_id : '') }),
            h('div', { class: 'sw-sub', text: 'Sparks today: ' + (t.spent_today_sparks || '0.00') + ' of ' + (t.daily_cap_sparks || '1.00') + ' daily cap' }),
            h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn ghost', text: 'Revoke', onclick: function () {
              if (!window.confirm('Revoke "' + t.label + '"? It stops working on its next call.')) return;
              api('DELETE', '/api/bridge/tokens/' + encodeURIComponent(t.id)).then(function () { toast('Revoked'); loadTokens(); });
            } })])
          ]));
        });
      }).catch(function () { body.textContent = ''; body.appendChild(msg('The bot bridge is unreachable.')); });
    }
    function loadRuns() {
      api('GET', '/api/bridge/runs').then(function (d) {
        runsEl.textContent = '';
        var runs = (d.runs || []).slice(0, 8);
        if (!runs.length) { runsEl.appendChild(msg('No bot activity yet.')); return; }
        runs.forEach(function (r) {
          var wait = r.status === 'awaiting_approval';
          runsEl.appendChild(h('div', { class: 'sw-card slim' }, [
            h('div', { class: 'sw-row' }, [h('b', { text: r.workflow_id }), h('i', { class: 'sw-chip ' + (wait ? 'warn' : (r.status === 'succeeded' ? 'ok' : '')), text: r.status.replace('_', ' ') })]),
            h('div', { class: 'sw-sub', text: (r.actor && r.actor.kind === 'forged' ? 'forged agent · ' : 'outside bot · ') + (r.error ? r.error : r.progress.map(function (s) { return s.name + ':' + s.status; }).join('  ')) }),
            r.outputs ? h('details', { class: 'sw-sub' }, [h('summary', { text: 'Result' }), h('pre', { style: 'white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;margin:4px 0', text: Object.keys(r.outputs).map(function (k) { return k + ': ' + r.outputs[k]; }).join('\n\n') })]) : null,
            wait ? h('div', { class: 'sw-actions' }, [
              h('button', { type: 'button', class: 'sw-btn', text: 'Approve', onclick: function () { decide(r.run_id, 'approve'); } }),
              h('button', { type: 'button', class: 'sw-btn ghost', text: 'Deny', onclick: function () { decide(r.run_id, 'deny'); } })]) : null
          ]));
        });
      });
    }
    function decide(id, what) { api('POST', '/api/bridge/runs/' + encodeURIComponent(id) + '/' + what).then(function () { toast(what === 'approve' ? 'Approved' : 'Denied'); loadRuns(); }); }
    function loadUsage() {
      api('GET', '/api/bridge/usage').then(function (d) {
        usageEl.textContent = '';
        if (!d || !d.ok) { usageEl.appendChild(msg('Usage unavailable.')); return; }
        var f = d.free_per_hour || {}, u = d.used_this_hour || {}, pr = d.prices_sparks || {};
        usageEl.appendChild(h('div', { class: 'sw-card slim' }, [h('div', { class: 'sw-row' }, [h('b', { text: 'Free every hour' }), h('i', { class: 'sw-chip ok', text: 'included' })]),
          h('div', { class: 'sw-sub', text: 'Runs ' + (u.runs || 0) + '/' + f.runs + ' · bot questions ' + (u.bot_questions || 0) + '/' + f.bot_questions + ' · chat questions ' + (u.chat_questions || 0) + '/' + f.chat_questions })]));
        usageEl.appendChild(h('div', { class: 'sw-card slim' }, [h('div', { class: 'sw-row' }, [h('b', { text: 'Beyond the free allowance' }), h('i', { class: 'sw-chip ' + (d.metering ? 'ok' : 'warn'), text: d.metering ? 'Sparks on' : 'Sparks off' })]),
          h('div', { class: 'sw-sub', text: d.metering ? 'Extra run ' + pr.extra_run + ' Spark · extra question ' + pr.extra_question + ' Spark (1 Spark = $1)' : 'Extra requests are simply paused until the next hour. Sparks billing is switched off on this server.' }),
          d.balance ? h('div', { class: 'sw-sub', text: 'Your balance: ' + d.balance.sparks + ' Sparks' }) : null,
          d.metering ? h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn', text: 'Top up Sparks', onclick: function () { var b = document.getElementById('shopFab'); if (b) b.click(); else toast('Open the Shop to top up'); } })]) : null]));
        if ((d.recent || []).length) usageEl.appendChild(h('div', { class: 'sw-card slim' }, [h('b', { text: 'Recent charges' }), h('div', { class: 'sw-sub', text: d.recent.slice(0, 5).map(function (r) { return r.kind + ' ' + r.sparks; }).join(' · ') })]));
      }).catch(function () { usageEl.textContent = ''; usageEl.appendChild(msg('Usage unavailable.')); });
    }
    function loadAudit() {
      api('GET', '/api/bridge/audit').then(function (d) {
        auditEl.textContent = '';
        (d.audit || []).slice(0, 6).forEach(function (a) { auditEl.appendChild(h('div', { text: String(a.ts).slice(11, 19) + '  ' + a.tool + '  ' + (a.ok ? 'ok' : 'blocked' + (a.error ? ': ' + a.error : '')) })); });
        if (!auditEl.childNodes.length) auditEl.appendChild(document.createTextNode('Nothing yet.'));
      });
    }
    function mint() {
      var scopes = Object.keys(checks).filter(function (s) { return checks[s].checked; });
      if (!scopes.length) { toast('Pick at least one permission'); return; }
      api('POST', '/api/bridge/tokens', { label: label.value || 'Outside bot', scopes: scopes, days: parseInt(days.value, 10), agent_id: agentSel.value || undefined, daily_cap_cents: Math.max(0, Math.round((parseFloat(capIn.value) || 0) * 100)) }).then(function (d) {
        if (!d.ok) { toast(d.error || 'Could not create the token'); return; }
        reveal.textContent = '';
        reveal.appendChild(h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: 'Your bot token' }), h('i', { class: 'sw-chip warn', text: 'shown once' })]),
          h('code', { class: 'sw-sub', style: 'word-break:break-all;user-select:all', text: d.token }),
          h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn', text: 'Copy token', onclick: function () { copy(d.token); } }),
            h('button', { type: 'button', class: 'sw-btn ghost', text: 'Hide', onclick: function () { reveal.textContent = ''; } })])
        ]));
        label.value = ''; loadTokens();
      });
    }

    body.appendChild(h('div', { class: 'sw-sub', text: 'Connect a bot that lives outside Shaddai (Grok Bot, Muse, any MCP client). It commands; Shaddai runs the job, keeps the receipt, and your agent\'s avatar shows the real state. Money, trading and your keys are never available through this door.' }));
    body.appendChild(h('div', { class: 'sw-card' }, [
      h('div', { class: 'sw-row' }, [h('b', { text: 'MCP URL' }), h('button', { type: 'button', class: 'sw-btn ghost', text: 'Copy', onclick: function () { copy(url); } })]),
      h('code', { class: 'sw-sub', style: 'word-break:break-all', text: url }),
      h('div', { class: 'sw-sub', text: 'Send the token as  Authorization: Bearer <token>.  Add it to your bot as a remote MCP server. If your bot\'s client only offers OAuth sign-in, that consent flow is the next layer to build.' })
    ]));
    body.appendChild(h('div', { class: 'sw-card' }, [
      h('div', { class: 'sw-row' }, [h('b', { text: 'New bot token' })]),
      h('div', { class: 'sw-actions' }, [label, days, agentSel, h('span', { class: 'sw-sub', text: 'Daily cap (Sparks)' }), capIn]),
      h('div', { class: 'sw-sub', text: 'A body is one of your forged agents. The bot works as that agent, so its avatar shows in the 3D world. Make a body in the 3D Forge; showing bodies inside the dashboard is coming soon.' }), scopesBox,
      h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn', text: 'Create token', onclick: mint })]), reveal
    ]));
    body.appendChild(h('div', { class: 'sw-hd', style: 'padding:6px 0;border:0' }, [h('b', { text: 'Connected' })])); body.appendChild(tokensEl);
    body.appendChild(h('div', { class: 'sw-hd', style: 'padding:6px 0;border:0' }, [h('b', { text: 'Bot activity & approvals' })])); body.appendChild(runsEl);
    body.appendChild(h('div', { class: 'sw-hd', style: 'padding:6px 0;border:0' }, [h('b', { text: 'Usage & Sparks' })])); body.appendChild(usageEl);
    body.appendChild(h('div', { class: 'sw-hd', style: 'padding:6px 0;border:0' }, [h('b', { text: 'Audit' })])); body.appendChild(auditEl);
    body.appendChild(h('div', { class: 'sw-msg dim', text: 'Note: registering an agent for jobs elsewhere in Shaddai is not the same as importing a live Grok Bot. A bot connects here, from outside, and Shaddai never runs its code.' }));
    loadTokens(); loadRuns(); loadAudit(); loadUsage();
    return h('section', { class: 'sw-box' }, [h('div', { class: 'sw-hd' }, [h('b', { text: 'Outside bots' }), h('span', { text: 'Grok Bot · Muse · any MCP client' })]), body]);
  };
})();
