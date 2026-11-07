/* SHADDAI V119 — GLOW AGENT CARD. The agent card shows the agent's glowing body (the SAME look the 3D office draws: form, gradient, accessory, glow),
   lets the owner change it, shows achievement badges (earned from real activity, pin up to 3), and opens the 3D Forge to forge a new bot.
   Look data is shared with the office: operative.look.orb = { form, c1, c2, acc, glow } (+ localStorage shd_orb_<id> as the offline fallback).
   Nothing about the bots or the office aesthetic changes here; this only lets the same options be edited from the agent card. */
(function () {
  'use strict';
  var FORMS = ['orb', 'crystal', 'figure'], ACCS = ['none', 'halo', 'ring', 'hat', 'antenna', 'crown'], LABEL = { orb: 'Orb', crystal: 'Crystal', figure: 'Figure' };
  var GRADS = [['#00e5a0', '#00b4ff'], ['#a78bfa', '#f43f5e'], ['#f0b429', '#fb923c'], ['#00f0ff', '#7c3aed'], ['#ffffff', '#60a5fa'], ['#34d399', '#fde047']];
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0 }; }); }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function hueOf(id) { var n = 0; id = String(id); for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return n % GRADS.length; }
  function sane(l, id) { var g = GRADS[hueOf(id)], o = l && typeof l === 'object' ? l : {}, hex = /^#[0-9a-fA-F]{6}$/; return { form: FORMS.indexOf(o.form) > -1 ? o.form : 'orb', c1: hex.test(o.c1) ? o.c1 : g[0], c2: hex.test(o.c2) ? o.c2 : g[1], acc: ACCS.indexOf(o.acc) > -1 ? o.acc : 'none', glow: Math.min(1.6, Math.max(0.4, +o.glow || 1)) }; }
  function lookOf(op) { var fromOp = op.look && op.look.orb, local = null; try { local = JSON.parse(localStorage.getItem('shd_orb_' + op.id) || 'null'); } catch (e) { /* ignore */ } return sane(fromOp || local, op.id); }

  /* the glowing body, drawn with CSS so it needs no GPU and matches the office look */
  function drawBody(stage, look) {
    stage.textContent = ''; stage.style.setProperty('--g1', look.c1); stage.style.setProperty('--g2', look.c2); stage.style.setProperty('--gs', look.glow);
    stage.appendChild(h('div', { class: 'gl-aura' })); var body = h('div', { class: 'gl-body ' + look.form }); stage.appendChild(body);
    if (look.acc !== 'none') stage.appendChild(h('div', { class: 'gl-acc ' + look.acc + ' on-' + look.form }));
  }

  function skillChips(op) {
    var list = (op.tools || op.skills || []).map(function (x) { return typeof x === 'string' ? x : (x && (x.name || x.id || x.skill)) || ''; }).filter(Boolean).slice(0, 6); if (!list.length) return null;
    var row = h('div', { class: 'gl-row gl-skills', 'aria-label': 'Skills' }); list.forEach(function (id) { row.appendChild(h('span', { class: 'gl-skill', text: String(id).replace(/^lib\./, '').replace(/[-_.]/g, ' ') })); }); return row;
  }
  function agentCard(op, extra) {
    var look = lookOf(op), L = JSON.parse(JSON.stringify(look)), stage = h('div', { class: 'gl-stage' }), pinned = [], status = h('div', { class: 'gl-note' }), badgeRow = h('div', { class: 'gl-badges' });
    drawBody(stage, look);
    function redraw() { look = sane(L, op.id); drawBody(stage, look); }
    function pillRow(vals, key, label) { var row = h('div', { class: 'gl-row' }); vals.forEach(function (v) { row.appendChild(h('button', { type: 'button', class: 'gl-pill' + (L[key] === v ? ' on' : ''), text: label ? label[v] : (v === 'none' ? 'None' : v[0].toUpperCase() + v.slice(1)), onclick: function (e) { L[key] = v; redraw(); row.querySelectorAll('.gl-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); }); return row; }
    var c1 = h('input', { type: 'color', value: look.c1, 'aria-label': 'Top colour' }), c2 = h('input', { type: 'color', value: look.c2, 'aria-label': 'Bottom colour' });
    c1.addEventListener('input', function () { L.c1 = c1.value; redraw(); }); c2.addEventListener('input', function () { L.c2 = c2.value; redraw(); });
    var grads = h('div', { class: 'gl-row' }); GRADS.forEach(function (g) { grads.appendChild(h('button', { type: 'button', class: 'gl-sw', 'aria-label': 'Gradient ' + g[0] + ' to ' + g[1], style: 'background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')', onclick: function () { L.c1 = g[0]; L.c2 = g[1]; c1.value = g[0]; c2.value = g[1]; redraw(); } })); });
    var glow = h('input', { type: 'range', min: '40', max: '160', value: String(Math.round(look.glow * 100)), 'aria-label': 'Glow', class: 'gl-range' }); glow.addEventListener('input', function () { L.glow = glow.value / 100; redraw(); });
    var panel = h('div', { class: 'gl-panel', style: 'display:none' }, [h('div', { class: 'gl-lbl', text: 'Style' }), pillRow(FORMS, 'form', LABEL), h('div', { class: 'gl-lbl', text: 'Gradient' }), grads, h('div', { class: 'gl-row' }, [c1, c2]), h('div', { class: 'gl-lbl', text: 'Accessory' }), pillRow(ACCS, 'acc'), h('div', { class: 'gl-lbl', text: 'Glow' }), glow,
      h('div', { class: 'gl-row' }, [h('button', { type: 'button', class: 'gl-btn', text: 'Save look', onclick: save }), h('button', { type: 'button', class: 'gl-btn ghost', text: 'Reset', onclick: function () { try { localStorage.removeItem('shd_orb_' + op.id); } catch (e) { /* ignore */ } L = sane(null, op.id); redraw(); c1.value = L.c1; c2.value = L.c2; status.textContent = 'Reset (not saved yet).'; } })]), status,
      h('div', { class: 'gl-note', text: 'Crystal and Figure are upgrade forms: preview now, unlock with Sparks later.' })]);
    function save() {
      var l = sane(L, op.id); try { localStorage.setItem('shd_orb_' + op.id, JSON.stringify(l)); } catch (e) { /* ignore */ }
      api('PATCH', '/api/operatives/' + encodeURIComponent(op.id), { look: Object.assign({}, op.look || {}, { orb: l }) }).then(function (d) { if (d.ok) { op.look = (d.operative && d.operative.look) || Object.assign({}, op.look || {}, { orb: l }); status.textContent = 'Saved. Your office and the 3D world use this look.'; } else status.textContent = 'Saved on this device. Could not save to your agent (' + (d.error || d._s) + ').'; });
    }
    function drawBadges(list) {
      badgeRow.textContent = ''; var earned = list.filter(function (b) { return b.earned; }).length; badgeRow.appendChild(h('div', { class: 'gl-lbl', text: 'Achievements · ' + earned + '/' + list.length + (pinned.length ? ' · pinned ' + pinned.length + '/3' : '') }));
      var wrap = h('div', { class: 'gl-row' }); list.forEach(function (b) { var on = pinned.indexOf(b.id) > -1;
        wrap.appendChild(h('button', { type: 'button', class: 'gl-badge' + (b.earned ? ' earned' : ' locked') + (on ? ' pinned' : ''), title: b.desc + (b.earned ? ' (click to ' + (on ? 'unpin' : 'pin') + ')' : ' · ' + b.progress), 'aria-pressed': on ? 'true' : 'false', onclick: function () {
          if (!b.earned) { status.textContent = b.label + ': ' + b.desc + ' (' + b.progress + ')'; panel.style.display = 'block'; return; } var next = on ? pinned.filter(function (x) { return x !== b.id; }) : pinned.concat([b.id]).slice(-3);
          api('POST', '/api/bridge/agents/' + encodeURIComponent(op.id) + '/badges/pin', { ids: next }).then(function (d) { if (d.ok) { pinned = d.pinned; drawBadges(list); } else toast(d.error || 'Could not pin that badge'); }); } }, [h('i', { text: b.earned ? '★' : '☆' }), b.label])); });
      badgeRow.appendChild(wrap);
    }
    api('GET', '/api/bridge/agents/' + encodeURIComponent(op.id) + '/badges').then(function (d) { if (d.ok && Array.isArray(d.badges)) { pinned = d.pinned || []; drawBadges(d.badges); } else badgeRow.appendChild(h('div', { class: 'gl-note', text: 'Achievements appear once the bot bridge is running on this server.' })); });
    var skills = (op.skills || []).length;
    return h('div', { class: 'gl-card' }, [h('div', { class: 'gl-left' }, [stage, h('button', { type: 'button', class: 'gl-btn ghost', text: 'Style it', onclick: function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; } }), h('button', { type: 'button', class: 'gl-btn ghost', text: 'Import to 3D realm', title: 'Pick the agent body it wears in the 3D realm', onclick: function () { importToWorld(op); } })]),
      h('div', { class: 'gl-main' }, [h('div', { class: 'gl-head' }, [h('b', { text: op.name || op.id }), h('span', { class: 'gl-lvl', text: 'Lv ' + (1 + Math.floor(skills / 2)) + ' · ' + skills + ' skill' + (skills === 1 ? '' : 's') }), h('span', { class: 'gl-sub', text: 'body: ' + String(op.model || 'SHADDAI').toLowerCase() })]), skillChips(op), extra || null, (window.shdAgentActions && op.id ? window.shdAgentActions(op) : null), badgeRow, panel])]);
  }

  /* Import to the 3D realm: the agent keeps its glow body in the office; here you pick the agent body it wears in the 3D realm. */
  var WORLD_BODIES = [['SHADDAI', 'Sovereign', '#f0b429'], ['NEXUS', 'Architect', '#00b4ff'], ['ORACLE', 'Seer', '#a78bfa'], ['TURTLE', 'Creative', '#2dd4bf'], ['QUILL', 'Scribe', '#fb923c'], ['PIKADON', 'Guardian', '#f43f5e'], ['ZEROX', 'Trader', '#00e5a0']];
  function importToWorld(op) {
    var old = document.getElementById('shdImportWorld'); if (old) old.remove();
    var pick = (op.model && WORLD_BODIES.some(function (b) { return b[0] === String(op.model).toUpperCase(); })) ? String(op.model).toUpperCase() : WORLD_BODIES[0][0];
    var note = h('div', { class: 'iw-note', role: 'status', 'aria-live': 'polite' }), grid = h('div', { class: 'iw-grid', role: 'radiogroup', 'aria-label': 'Agent body' }), actions = h('div', { class: 'iw-actions' });
    function paintGrid() { grid.textContent = ''; WORLD_BODIES.forEach(function (b) {
      var card = h('button', { type: 'button', role: 'radio', 'aria-checked': pick === b[0] ? 'true' : 'false', class: 'iw-card' + (pick === b[0] ? ' on' : ''), style: '--c:' + b[2], onclick: function () { pick = b[0]; paintGrid(); } });
      card.innerHTML = (window.shdIcons ? window.shdIcons.mark(b[0], b[2], 54) : '') + '<b></b><small></small>'; card.querySelector('b').textContent = b[0]; card.querySelector('small').textContent = b[1]; grid.appendChild(card); }); }
    function close() { wrap.remove(); }
    var importBtn = h('button', { type: 'button', class: 'gl-btn', text: 'Import', onclick: function () {
      importBtn.disabled = true; note.textContent = 'Importing…';
      var look = Object.assign({}, op.look || {}, { bodyType: 'both', world: { body: pick, imported_at: new Date().toISOString() } });
      api('PATCH', '/api/operatives/' + encodeURIComponent(op.id), { model: pick, look: look }).then(function (d) {
        if (!d.ok && /model/i.test(String(d.error || ''))) return api('PATCH', '/api/operatives/' + encodeURIComponent(op.id), { look: look });
        return d; }).then(function (d) {
        importBtn.disabled = false;
        if (!d.ok) { note.textContent = d._s === 401 ? 'Sign in first.' : 'Could not import: ' + (d.error || d._s || 'try again'); return; }
        op.model = pick; op.look = (d.operative && d.operative.look) || look; note.textContent = (op.name || 'Your agent') + ' is imported. It wears the ' + pick + ' body in the 3D realm and keeps its glow body in your office.';
        actions.textContent = ''; actions.appendChild(h('button', { type: 'button', class: 'gl-btn', text: 'Enter the 3D realm', onclick: function () { close(); try { if (window.enter3DWorld) window.enter3DWorld(); } catch (e) { /* ignore */ } } })); actions.appendChild(h('button', { type: 'button', class: 'gl-btn ghost', text: 'Stay in the office', onclick: close })); }); } });
    actions.appendChild(importBtn); actions.appendChild(h('button', { type: 'button', class: 'gl-btn ghost', text: 'Cancel', onclick: close }));
    var wrap = h('div', { id: 'shdImportWorld', class: 'iw-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import to the 3D realm' }, [h('div', { class: 'iw-scrim', onclick: close }), h('div', { class: 'iw-card' }, [
      h('div', { class: 'iw-kick', text: 'IMPORT' }), h('h3', { class: 'iw-h', text: 'Send ' + (op.name || 'your agent') + ' to the 3D realm' }),
      h('p', { class: 'iw-sub', text: 'Your glow bot stays in the office. In the 3D realm it wears an agent body. Pick one.' }), grid, note, actions])]);
    document.body.appendChild(wrap); paintGrid(); wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    var f = wrap.querySelector('.iw-card.on'); if (f) f.focus();
  }

  /* Forge a bot: opens the 3D Forge from the dashboard and notices when a new agent shows up */
  function forgeButton(onNew) {
    return h('button', { type: 'button', class: 'gl-btn', text: 'Forge a bot', onclick: function () { try { showView('forge'); setTimeout(function () { if (window.switchForgeTab) window.switchForgeTab('3d'); }, 80); } catch (e) { /* ignore */ } watchForge(onNew); } });
  }
  var watching = null;
  function watchForge(onNew) {
    clearInterval(watching); var base = null, t0 = Date.now(), uid = ''; try { uid = localStorage.getItem('shd_userid') || ''; } catch (e) { /* ignore */ }
    function list() { return api('GET', '/api/operatives' + (uid ? '?owner=' + encodeURIComponent(uid) : '')).then(function (d) { return (d && (d.operatives || (d.data && d.data.operatives))) || (Array.isArray(d) ? d : []); }); }
    list().then(function (l) { base = l.map(function (o) { return o.id; }); });
    watching = setInterval(function () {
      if (Date.now() - t0 > 600000) { clearInterval(watching); return; } if (document.hidden || base === null) return;
      list().then(function (l) { var fresh = l.filter(function (o) { return base.indexOf(o.id) < 0; }); if (fresh.length) { base = l.map(function (o) { return o.id; }); toast(fresh[0].name + ' was forged. Open Worlds → My Space to give it a glow.'); if (typeof onNew === 'function') onNew(fresh); try { if (window.shdWorlds && document.getElementById('swTab-space') && document.getElementById('swTab-space').offsetParent) window.shdWorlds.loadSpace(); } catch (e) { /* ignore */ } } });
    }, 4000);
  }
  window.shdGlow = { importToWorld: importToWorld, agentCard: agentCard, forgeButton: forgeButton, lookOf: lookOf, sane: sane, GRADS: GRADS, FORMS: FORMS, ACCS: ACCS };
})();
