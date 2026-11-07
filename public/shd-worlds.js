/* ═════════════════════════════════════════════════════════════════════════
   SHADDAI V119 — WORLDS HUB: four tabs wired to the same server the 3D world uses.
     Plots      /api/portal-plots · /api/city/offices · /api/sap/treegens/plots
     My Space   /api/office · /api/operatives · /api/economy/inventory · shd_inv_v1 (3D inventory)
     Arena      Colosseum viewer + visitor (spectator) view of the 3D world
     Athenaeum  /api/school/classes · skills · enroll · faculty
   Nothing here is stored in the browser as the source of truth; every list comes from the server and
   shows an honest empty/offline state. Restore the old tabs: localStorage.shd_legacy_nav = '1'.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var legacy = function () { return document.documentElement.classList.contains('shd-legacy-nav'); };
  try { if (localStorage.getItem('shd_legacy_nav') === '1') document.documentElement.classList.add('shd-legacy-nav'); } catch (e) { /* ignore */ }

  var TABS = [
    { id: 'plots',     label: 'Plots' },
    { id: 'space',     label: 'My Space' },
    { id: 'arena',     label: 'Arena' },
    { id: 'athenaeum', label: 'Athenaeum' }
  ];

  /* ── helpers ───────────────────────────────────────────────────────────── */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function uid() { try { return localStorage.getItem('shd_userid') || ''; } catch (e) { return ''; } }
  function signedIn() { try { return localStorage.getItem('shd_signed_in') === '1' || !!uid(); } catch (e) { return false; } }
  function headers(json) {
    var o = {};
    if (json) o['Content-Type'] = 'application/json';
    try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ }
    return o;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: headers(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function pick(d, key) { return (d && (d[key] || (d.data && d.data[key]))) || null; }
  function toast(msg) { try { if (typeof window.notify === 'function') return window.notify(msg); } catch (e) { /* ignore */ } }
  function box(title, sub, kids) {
    return h('section', { class: 'sw-box' }, [
      h('div', { class: 'sw-hd' }, [h('b', { text: title }), sub ? h('span', { text: sub }) : null]), h('div', { class: 'sw-body' }, kids)
    ]);
  }
  function msg(text, cls) { return h('div', { class: 'sw-msg ' + (cls || ''), text: text }); }
  function chip(t, cls) { return h('i', { class: 'sw-chip ' + (cls || ''), text: t }); }
  function btn(t, fn, cls) { return h('button', { type: 'button', class: 'sw-btn ' + (cls || ''), text: t, onclick: fn }); }
  function mount(id) { return document.getElementById('swTab-' + id); }
  function fill(el, nodes) { el.textContent = ''; nodes.forEach(function (n) { if (n) el.appendChild(n); }); }
  function lazyFrame(host, src, title, tall) {
    if (host.querySelector('iframe')) return;
    host.textContent = '';
    host.appendChild(h('iframe', { src: src, title: title, class: 'sw-frame' + (tall ? ' tall' : ''), allow: 'fullscreen; pointer-lock', loading: 'lazy' }));
  }

  /* ── PLOTS ─────────────────────────────────────────────────────────────── */
  function loadPlots() {
    var el = mount('plots'); if (!el) return;
    var portal = h('div', { class: 'sw-grid' }, [msg('Loading plots…')]);
    var offices = h('div', { class: 'sw-grid' }, [msg('Loading offices…')]);
    var garden = h('div', { class: 'sw-grid' }, [msg('Loading garden plots…')]);
    fill(el, [
      box('Portal worlds', 'plots standing in the 3D world · the signs you see there come from this same list', [portal,
        msg('Beta: renting or buying records your claim only. No payment is taken yet.', 'dim')]),
      box('Founders\' Row offices', 'your office and the street', [offices]),
      box('ASIMOV garden plots', 'managed by the Asimov layer · read-only until its payments open', [garden])
    ]);

    api('GET', '/api/portal-plots').then(function (d) {
      var map = d && d.plots; var ids = map ? Object.keys(map) : [];
      if (!ids.length) { fill(portal, [msg(d._status && d._status >= 400 ? 'Plot service unreachable right now.' : 'No portal plots yet.', 'dim')]); return; }
      fill(portal, ids.map(function (id) {
        var p = map[id], free = p.status === 'available', mine = p.owner && (p.owner === uid());
        return h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: p.name || id }), chip(mine ? 'yours' : p.status, mine ? 'ok' : (free ? 'ok' : 'warn'))]),
          h('div', { class: 'sw-sub', text: (p.agentCode ? p.agentCode + ' sector' : 'sector') + (p.pos ? ' · x ' + p.pos[0] + ', z ' + p.pos[1] : '') }),
          h('div', { class: 'sw-sub', text: free ? '$' + p.rentPrice + '/mo · $' + p.buyPrice + ' to own' : (p.owner ? 'held by ' + p.owner : '') }),
          h('div', { class: 'sw-actions' }, [
            free ? btn('Rent 1 mo', function () { claim(id, 'rent'); }) : null,
            free ? btn('Buy', function () { claim(id, 'buy'); }, 'ghost') : null,
            btn('See it in 3D', function () { window.enter3DWorld && window.enter3DWorld(); }, 'ghost')
          ])
        ]);
      }));
    }).catch(function () { fill(portal, [msg('Plot service unreachable right now.', 'dim')]); });

    var mineP = api('GET', '/api/office').catch(function () { return {}; });
    var allP = api('GET', '/api/city/offices').catch(function () { return {}; });
    Promise.all([mineP, allP]).then(function (r) {
      var me = r[0] && r[0].office, list = (r[1] && r[1].offices) || [];
      fill(offices, [
        h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: 'Your office' }), chip(me ? 'claimed' : 'unclaimed', me ? 'ok' : 'warn')]),
          h('div', { class: 'sw-sub', text: me ? (me.name || 'Office') + (me.theme ? ' · ' + me.theme : '') : (signedIn() ? 'Claim a lot on Founders\' Row.' : 'Sign in to claim an office.') }),
          h('div', { class: 'sw-actions' }, [
            !me && signedIn() ? btn('Claim office', function () {
              api('POST', '/api/office/claim', {}).then(function (d) { toast(d && d.claimed ? 'Office claimed' : (d.error || 'Could not claim')); loadPlots(); });
            }) : null,
            btn('Enter the world', function () { window.enter3DWorld && window.enter3DWorld(); }, 'ghost')
          ])
        ]),
        h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: 'The street' }), chip(list.length + ' offices', '')]),
          h('div', { class: 'sw-sub', text: list.length ? 'Offices owned by other players show up as buildings in the 3D city.' : 'No other offices yet.' })
        ])
      ]);
    });

    api('GET', '/api/sap/treegens/plots').then(function (d) {
      var list = pick(d, 'plots') || (Array.isArray(d) ? d : []);
      if (!list.length) { fill(garden, [msg('No garden plots published yet.', 'dim')]); return; }
      fill(garden, list.map(function (p) {
        return h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: p.name || p.plotId }), chip(p.status || 'open', 'ok')]),
          h('div', { class: 'sw-sub', text: [p.ecosystem, p.areaHa != null ? p.areaHa + ' ha' : '', p.stemsAvailable != null ? p.stemsAvailable + ' stems' : ''].filter(Boolean).join(' · ') }),
          h('div', { class: 'sw-sub', text: p.verification || '' })
        ]);
      }));
    }).catch(function () { fill(garden, [msg('Garden plots unavailable.', 'dim')]); });
  }
  function claim(id, mode) {
    if (!signedIn()) { toast('Sign in first'); if (window.shdGate && shdGate.show) shdGate.show(); return; }
    var body = { owner: uid() || 'me' }; if (mode === 'rent') body.months = 1;
    if (!window.confirm((mode === 'rent' ? 'Record a 1-month rental' : 'Record a purchase') + ' for this plot? (beta: no payment is taken)')) return;
    api('POST', '/api/portal-plots/' + encodeURIComponent(id) + '/' + mode, body).then(function (d) {
      toast(d && d.ok === false ? (d.error || 'Not available') : 'Plot claim recorded'); loadPlots();
    });
  }

  /* ── MY SPACE ──────────────────────────────────────────────────────────── */
  function localInv() {
    try { var j = JSON.parse(localStorage.getItem('shd_inv_v1') || 'null'); return (j && j.items) || {}; } catch (e) { return {}; }
  }
  function loadSpace() {
    var el = mount('space'); if (!el) return;
    var inv = h('div', { class: 'sw-grid' }, [msg('Loading…')]);
    var ops = h('div', { class: 'sw-grid' }, [msg('Loading…')]);
    var navi = h('div', { class: 'sw-grid' });
    fill(el, [
      box('Furniture & items', 'what you own in the world · same inventory the 3D world reads', [inv]),
      box('Your agents', 'glowing bodies · change their style, earn badges, run tasks', [window.shdGlow ? h('div', { class: 'sw-actions', style: 'margin:0 0 10px' }, [window.shdGlow.forgeButton(), h('span', { class: 'sw-sub', text: 'Opens the 3D Forge. A new agent appears here when it is forged.' })]) : null, ops]),
      box('Navi', 'your guide in the world', [navi])
    ].concat(window.shdWorldSnapshotBox ? [window.shdWorldSnapshotBox()] : [], window.shdAgentTasksBox ? [window.shdAgentTasksBox()] : [], window.shdBridgeBox ? [window.shdBridgeBox()] : []));

    var local = localInv(), keys = Object.keys(local).filter(function (k) { return local[k] > 0 || (local[k] && local[k].qty > 0) || (local[k] && local[k].n > 0); });
    api('GET', '/api/economy/inventory').catch(function () { return {}; }).then(function (d) {
      var srv = pick(d, 'items') || pick(d, 'inventory') || [];
      var rows = [];
      (Array.isArray(srv) ? srv : Object.keys(srv).map(function (k) { return { id: k, qty: srv[k] }; })).forEach(function (r) {
        rows.push({ name: r.name || r.id || r.sku, qty: r.qty != null ? r.qty : (r.quantity != null ? r.quantity : 1), src: 'account' });
      });
      keys.forEach(function (k) {
        var v = local[k], q = typeof v === 'number' ? v : (v.qty || v.n || 1);
        if (!rows.some(function (r) { return r.name === k; })) rows.push({ name: k, qty: q, src: 'this device' });
      });
      if (!rows.length) { fill(inv, [msg('Nothing yet. Buy furniture and items from vendors in the 3D world and they will appear here.', 'dim'),
        h('div', { class: 'sw-actions' }, [btn('Go shopping in 3D', function () { window.enter3DWorld && window.enter3DWorld(); })])]); return; }
      fill(inv, rows.map(function (r) {
        return h('div', { class: 'sw-card slim' }, [h('div', { class: 'sw-row' }, [h('b', { text: String(r.name).replace(/[_-]+/g, ' ') }), chip('×' + r.qty, '')]), h('div', { class: 'sw-sub', text: r.src })]);
      }));
    });

    var u = uid();
    api('GET', '/api/operatives' + (u ? '?owner=' + encodeURIComponent(u) : '')).then(function (d) {
      var list = pick(d, 'operatives') || (Array.isArray(d) ? d : []);
      if (!list.length) { fill(ops, [msg('No agents yet. Forge your first one — it appears here and in the 3D world.', 'dim'),
        h('div', { class: 'sw-actions' }, [window.shdGlow ? window.shdGlow.forgeButton() : btn('Open the Forge', function () { window.showView && showView('forge'); })])]); return; }
      fill(ops, list.map(function (o) {
        if (window.shdGlow) return window.shdGlow.agentCard(o, taskRow(o));
        return h('div', { class: 'sw-card slim' }, [h('div', { class: 'sw-row' }, [h('b', { text: o.name || o.id }), chip((o.skills || []).length + ' skills', '')]), h('div', { class: 'sw-sub', text: o.role || o.kind || '' }), taskRow(o)]);
      }));
    }).catch(function () { fill(ops, [msg('Agent service unreachable.', 'dim')]); });

    var ns = {}; try { ns = JSON.parse(localStorage.getItem('shd_navi_v1') || '{}'); } catch (e) { /* ignore */ }
    fill(navi, [h('div', { class: 'sw-card slim' }, [
      h('div', { class: 'sw-row' }, [h('b', { text: 'Navi' }), chip(ns.activeBot ? 'bot linked' : 'idle', '')]),
      h('div', { class: 'sw-sub', text: ns.waypoint ? 'Waypoint set: ' + (ns.waypoint.name || ns.waypoint.label || 'saved place') : 'No waypoint. Open Navi in the world to set one.' })
    ])]);
  }

  /* ── run a task as a forged agent (same server-side workflows an outside bot can start) ── */
  var WF_CACHE = null;
  var PARAM_HINT = { 'research.topic': 'topic to research', 'market.snapshot': 'coins, comma separated (optional)' };
  function wfList() { return WF_CACHE ? Promise.resolve(WF_CACHE) : api('GET', '/api/bridge/workflows').then(function (d) { WF_CACHE = ((d && d.workflows) || []).filter(function (w) { return w.workflow_id !== 'tool.run' && w.workflow_id.indexOf('demo.') !== 0; }); return WF_CACHE; }).catch(function () { return []; }); }
  function summarize(outputs) {
    if (!outputs) return '';
    return Object.keys(outputs).map(function (k) { var v = String(outputs[k]); return k + ': ' + (v.length > 160 ? v.slice(0, 160) + '…' : v); }).join('\n');
  }
  function taskRow(agent) {
    var row = h('div', { class: 'sw-actions' }), result = h('div', { class: 'sw-sub', style: 'white-space:pre-wrap' });
    if (window.shdAgentViewer) row.appendChild(btn('View body', function () { window.shdAgentViewer.open({ name: agent.name || agent.id, model: agent.model, forged: true }); }, 'ghost'));
    var sel = h('select', { class: 'sw-sel', 'aria-label': 'Task' }), param = h('input', { class: 'sw-sel', placeholder: '', 'aria-label': 'Task input', style: 'display:none;min-width:0;flex:1' });
    wfList().then(function (list) {
      if (!list.length) { row.appendChild(h('span', { class: 'sw-sub', text: 'Tasks unavailable on this server.' })); return; }
      list.forEach(function (w) { sel.appendChild(h('option', { value: w.workflow_id, text: w.title.split(':')[0] })); });
      function hint() { var ph = PARAM_HINT[sel.value]; param.style.display = ph ? '' : 'none'; param.placeholder = ph || ''; }
      sel.addEventListener('change', hint); hint();
      row.appendChild(sel); row.appendChild(param);
      row.appendChild(btn('Run task', function () {
        if (!signedIn()) { toast('Sign in first'); return; }
        var v = sel.value, t = param.value.trim(), params = {};
        if (v === 'research.topic') { if (!t) { toast('Enter a topic'); return; } params.query = t; }
        if (v === 'market.snapshot' && t) params.symbols = t.split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
        result.textContent = 'Starting…';
        api('POST', '/api/bridge/agents/' + encodeURIComponent(agent.id) + '/run', { workflow_id: v, params: params, idempotency_key: 'ui-' + Date.now() }).then(function (d) {
          if (!d.ok) { result.textContent = d.error || 'Could not start'; return; }
          var id = d.run.run_id, tries = 0;
          (function poll() {
            api('GET', '/api/bridge/runs').then(function (r) {
              var run = ((r && r.runs) || []).filter(function (x) { return x.run_id === id; })[0];
              if (!run) { result.textContent = 'Run not found'; return; }
              if (run.status === 'succeeded') { result.textContent = summarize(run.outputs) || 'Done'; return; }
              if (run.status === 'failed' || run.status === 'expired' || run.status === 'cancelled') { result.textContent = run.status + (run.error ? ': ' + run.error : ''); return; }
              result.textContent = run.status.replace('_', ' ') + '…'; if (++tries < 40) setTimeout(poll, 1200); else result.textContent += ' (still running; see Outside bots → activity)';
            });
          })();
        });
      }));
    });
    return h('div', null, [row, result]);
  }

  /* ── ARENA ─────────────────────────────────────────────────────────────── */
  function loadArena() {
    var el = mount('arena'); if (!el) return;
    if (el.dataset.built) return; el.dataset.built = '1';
    var colo = h('div', { class: 'sw-framehost' }, [msg('Opens the Colosseum viewer on demand.', 'dim')]);
    var spec = h('div', { class: 'sw-framehost' }, [msg('Opens a visitor view of the live 3D world. You can look around; you do not take part.', 'dim')]);
    fill(el, [
      box('Colosseum', 'practice bouts are free · main event and tournament need a ticket', [colo, h('div', { class: 'sw-actions' }, [
        btn('Watch live', function () { if (window.shdColosseum) window.shdColosseum.mount(colo); else lazyFrame(colo, '/colosseum-final.html', 'Colosseum viewer', true); }),
        btn('Classic viewer', function () { if (window.shdColosseum) window.shdColosseum.unmount(); lazyFrame(colo, '/colosseum-final.html', 'Classic Colosseum viewer', true); }, 'ghost'),
        btn('Enter the arena in 3D', function () { window.enter3DWorld && window.enter3DWorld(); }, 'ghost')
      ])]),
      box('Spectate the world', 'visitor view', [spec, h('div', { class: 'sw-actions' }, [
        btn('Start spectating', function () { lazyFrame(spec, (window.__SHADDAI_WORLD_URL || '/world') + ((window.__SHADDAI_WORLD_URL || '').indexOf('?') >= 0 ? '&' : '?') + 'peek&spectate=1', 'Shaddai World visitor view', true); }),
        btn('Stop', function () { spec.textContent = ''; spec.appendChild(msg('Stopped.', 'dim')); }, 'ghost')
      ])])
    ]);
  }

  /* ── ATHENAEUM ─────────────────────────────────────────────────────────── */
  var agentsCache = [];
  function agentSelect() {
    var s = h('select', { class: 'sw-sel', 'aria-label': 'Choose your agent' }, agentsCache.map(function (a) { return h('option', { value: a.id, text: a.name || a.id }); }));
    return s;
  }
  function loadAthenaeum() {
    var el = mount('athenaeum'); if (!el) return;
    var classes = h('div', { class: 'sw-grid' }, [msg('Loading classes…')]);
    var skills = h('div', { class: 'sw-grid' }, [msg('Loading skills…')]);
    var hall = h('div', { class: 'sw-framehost' }, [msg('The 3D halls open on demand.', 'dim')]);
    fill(el, [
      box('Agent classes', 'enroll one of your agents', [classes]),
      box('Skills', 'what your agents can learn · pay with Sparks, verified by exams', [skills]),
      box('The halls', 'walk the Athenaeum in 3D', [hall, h('div', { class: 'sw-actions' }, [btn('Open the halls', function () { lazyFrame(hall, '/athenaeum.html', 'Athenaeum', true); })])])
    ]);
    var u = uid();
    var ready = api('GET', '/api/operatives' + (u ? '?owner=' + encodeURIComponent(u) : '')).catch(function () { return {}; }).then(function (d) {
      agentsCache = pick(d, 'operatives') || (Array.isArray(d) ? d : []);
    });
    ready.then(function () { return api('GET', '/api/school/classes'); }).then(function (d) {
      if (d._status === 404) { fill(classes, [msg('The school service is not running on this server yet.', 'warn')]); return; }
      var list = pick(d, 'classes') || [];
      if (!Array.isArray(list)) list = Object.keys(list).map(function (k) { return list[k]; });
      if (!list.length) { fill(classes, [msg('No classes scheduled yet.', 'dim')]); return; }
      fill(classes, list.map(function (c) {
        var seats = c.capacity ? (c.capacity - Object.keys(c.members || {}).length) : null;
        var sel = agentsCache.length ? agentSelect() : null;
        return h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: c.name }), chip(c.kind || 'open', '')]),
          h('div', { class: 'sw-sub', text: [c.track, c.tier, c.teacher && c.teacher.id ? 'taught by ' + c.teacher.id : ''].filter(Boolean).join(' · ') }),
          h('div', { class: 'sw-sub', text: seats != null ? seats + ' seats left' : '' }),
          h('div', { class: 'sw-actions' }, [sel,
            btn(agentsCache.length ? 'Join' : 'Forge an agent first', function () {
              if (!agentsCache.length) { window.showView && showView('forge'); return; }
              if (!signedIn()) { toast('Sign in first'); return; }
              api('POST', '/api/school/classes/' + encodeURIComponent(c.id) + '/join', { agentId: sel.value }).then(function (r) {
                toast(r && r.success === false ? (r.error || 'Could not join') : 'Joined ' + c.name); loadAthenaeum();
              });
            })])
        ]);
      }));
    }).catch(function () { fill(classes, [msg('School service unreachable.', 'dim')]); });

    ready.then(function () { return api('GET', '/api/school/skills'); }).then(function (d) {
      var list = pick(d, 'skills') || [];
      if (!Array.isArray(list)) list = Object.keys(list).map(function (k) { return list[k]; });
      if (!list.length) { fill(skills, [msg(d._status === 404 ? 'The school service is not running on this server yet.' : 'No skills published yet.', d._status === 404 ? 'warn' : 'dim')]); return; }
      fill(skills, list.slice(0, 30).map(function (s) {
        var sel = agentsCache.length ? agentSelect() : null;
        return h('div', { class: 'sw-card' }, [
          h('div', { class: 'sw-row' }, [h('b', { text: s.name || s.id }), chip((s.price_sparks != null ? s.price_sparks : 0) + ' Sparks', '')]),
          h('div', { class: 'sw-sub', text: [s.track, s.tier].filter(Boolean).join(' · ') }),
          h('div', { class: 'sw-sub', text: s.summary || '' }),
          agentsCache.length ? h('div', { class: 'sw-actions' }, [sel, btn('Enroll', function () {
            if (!signedIn()) { toast('Sign in first'); return; }
            api('POST', '/api/school/enroll', { agentId: sel.value, skillId: s.id }).then(function (r) { toast(r && r.success === false ? (r.error || 'Could not enroll') : 'Enrolled'); });
          })]) : null
        ]);
      }));
    }).catch(function () { fill(skills, [msg('School service unreachable.', 'dim')]); });
  }

  /* ── wiring: tab bar, panels, KPI strip ────────────────────────────────── */
  var LOADERS = { plots: loadPlots, space: loadSpace, arena: loadArena, athenaeum: loadAthenaeum };
  function build() {
    var view = document.getElementById('worldsView'); if (!view || view.dataset.swBuilt || legacy()) return;
    var bar = view.querySelector('.wh-tab-bar'), panels = view.querySelector('.wh-panels'); if (!bar || !panels) return;
    view.dataset.swBuilt = '1';
    var first = bar.querySelector('[data-wbtn="worlds"]'); if (first) first.textContent = 'Overview';
    TABS.forEach(function (t) {
      bar.appendChild(h('button', { class: 'wh-tb', 'data-wbtn': t.id, type: 'button', text: t.label, onclick: function () { window.switchWorldsTab(t.id); } }));
      panels.appendChild(h('div', { class: 'wh-panel', 'data-wtab': t.id }, [h('div', { id: 'swTab-' + t.id, class: 'sw-tab' })]));
    });
  }
  function wrapSwitch() {
    var fn = window.switchWorldsTab; if (typeof fn !== 'function' || fn._sw) return;
    window.switchWorldsTab = function (tab) {
      build();
      var r = fn.apply(this, arguments);
      if (!legacy() && LOADERS[tab]) { try { LOADERS[tab](); } catch (e) { /* never break navigation */ } }
      return r;
    };
    window.switchWorldsTab._sw = true;
  }
  function kpis() {
    if (legacy()) return;
    api('GET', '/api/economy/balance').then(function (d) {
      var n = d && (d.balance != null ? d.balance : (d.sparks != null ? d.sparks : (d.data && d.data.balance)));
      var k = document.getElementById('whKpiSparks'); if (k && n != null && typeof n === 'number') k.textContent = n.toLocaleString();
    }).catch(function () { /* keep local value */ });
    api('GET', '/api/portal-plots').then(function (d) {
      var map = (d && d.plots) || {}, mine = Object.keys(map).filter(function (id) { return map[id].owner && map[id].owner === uid(); }).length;
      var k = document.getElementById('whKpiPlots'); if (k && uid()) k.textContent = mine;
      var c = document.getElementById('whWorldClaimed'); if (c) c.textContent = Object.keys(map).filter(function (id) { return map[id].owner; }).length;
    }).catch(function () { /* keep local value */ });
  }
  var _init = window.initWorldsView;
  function wrapInit() {
    if (typeof window.initWorldsView !== 'function' || window.initWorldsView._sw) return;
    var orig = window.initWorldsView;
    window.initWorldsView = function () { build(); var r = orig.apply(this, arguments); setTimeout(kpis, 60); return r; };
    window.initWorldsView._sw = true;
  }
  function boot() { wrapSwitch(); wrapInit(); build(); }
  boot(); window.addEventListener('load', function () { boot(); setTimeout(boot, 600); });
  window.shdWorlds = { build: build, loadPlots: loadPlots, loadSpace: loadSpace, loadArena: loadArena, loadAthenaeum: loadAthenaeum };
  void _init;
})();
