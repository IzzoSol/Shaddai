/* dashboard-agents.js — 3D WORLDS hub upgrade for the dashboard (public/index.html #worldsView), 2026-10-01.
 * One self-contained module (loaded after world-agents-ui.js):
 *   1. VISUAL: the five tabs (Worlds / City / Rooms / Economy / Forge) become bevelled 3D keys with depth + glow; portals and cards get the same SHADDAI glass look as the game HUD.
 *   2. WORLDS tab: a third portal straight into the SHADDAI 3D city (hoverskate park, Colosseum, wilderness camps, mounts, races) + quick status from the live world services.
 *   3. FORGE tab: "AGENTS IN THE WORLD" - your forged + imported agents with Enter world / Work shift / Collect / Release, and the Grok / Muse / other-bot import button.
 *   4. CITY tab: "STATIONED AGENTS & HOMES" - who is stationed, presence (home / working), level, home room; matches what you see in game.
 *   5. ECONOMY tab: "JOBS & SHOWCASE" - open jobs, payouts, and the art / music your agents delivered (the same feed the game showcases).
 * All data comes from window.WorldAgentsNet (server/agentBodies.js + externalAgents.js via /api/mmo). Offline-safe: shows a clear message instead of breaking.
 */
(function (root) {
  'use strict';
  var doc = root.document; if (!doc) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- 1. visual polish ----------
  var css = '' +
    '#worldsView .wh-tab-bar{gap:8px;padding:14px 20px 12px;border-bottom:1px solid rgba(232,196,92,.22)}' +
    '#worldsView .wh-tb{position:relative;border:1px solid rgba(232,196,92,.28);border-bottom-width:3px;border-radius:11px;padding:10px 16px;background:linear-gradient(180deg,rgba(24,34,56,.9),rgba(8,12,22,.96));color:#c9d6e6;box-shadow:0 6px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .14s,box-shadow .14s,border-color .14s,color .14s}' +
    '#worldsView .wh-tb:hover{transform:translateY(-2px);border-color:#00ff9c;color:#00ff9c;box-shadow:0 10px 20px rgba(0,255,156,.18),inset 0 1px 0 rgba(255,255,255,.12)}' +
    '#worldsView .wh-tb.active{color:#0b0f18;background:linear-gradient(180deg,#f3d889,#c9a24a);border-color:#ffe9a8;border-bottom-color:#8a6a1e;text-shadow:none;transform:translateY(1px);box-shadow:0 2px 6px rgba(0,0,0,.5),0 0 18px rgba(232,196,92,.35),inset 0 1px 0 rgba(255,255,255,.55)}' +
    '#worldsView .wh-card{background:linear-gradient(160deg,rgba(18,26,44,.94),rgba(7,10,18,.97));border:1px solid rgba(232,196,92,.2);box-shadow:0 10px 26px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05)}' +
    '#worldsView .wh-portal{transition:transform .18s,box-shadow .18s;box-shadow:0 12px 28px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08)}#worldsView .wh-portal:hover{transform:translateY(-4px) scale(1.01);box-shadow:0 18px 34px rgba(0,255,156,.2),inset 0 1px 0 rgba(255,255,255,.12)}' +
    '.dxa-card{margin-top:14px;padding:16px 18px;border-radius:14px;background:linear-gradient(160deg,rgba(18,26,44,.94),rgba(7,10,18,.97));border:1px solid rgba(0,255,156,.28);box-shadow:0 10px 26px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05)}' +
    '.dxa-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-family:Orbitron,sans-serif;font-size:11px;font-weight:900;letter-spacing:1.6px;color:#e8c45c}' +
    '.dxa-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.07);font-size:12px;color:#dbe6f2}' +
    '.dxa-row small{opacity:.65}.dxa-btn{background:linear-gradient(180deg,rgba(0,255,156,.26),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:8px;color:#eafff6;padding:6px 11px;cursor:pointer;font:700 11px "Chakra Petch",Rajdhani,sans-serif;letter-spacing:.06em;margin-left:4px}' +
    '.dxa-btn.g{background:linear-gradient(180deg,rgba(232,196,92,.3),rgba(120,80,10,.4));border-color:#e8c45c;color:#ffe9b0}.dxa-btn.r{background:linear-gradient(180deg,rgba(255,90,110,.26),rgba(120,20,40,.4));border-color:#ff5a6e;color:#ffd5dc}' +
    '.dxa-btn:hover{filter:brightness(1.2);transform:translateY(-1px)}.dxa-empty{opacity:.6;padding:8px 0;font-size:12px}.dxa-off{color:#ff9a6e;font-size:12px;padding:6px 0}.dxa-show{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}.dxa-tile{border:1px solid rgba(232,196,92,.25);border-radius:10px;padding:10px;background:rgba(6,10,18,.8);font-size:11px}.dxa-tile a{color:#27e0ff}';
  var st = doc.createElement('style'); st.id = 'dxaStyle'; st.textContent = css; doc.head.appendChild(st);

  function net() { return root.WorldAgentsNet; }
  function panel(tab) { return doc.querySelector('#worldsView .wh-panel[data-wtab="' + tab + '"]'); }
  function ensureCard(tab, id, title, actionsHtml) {
    var p = panel(tab); if (!p) return null; var c = doc.getElementById(id);
    if (!c) { c = doc.createElement('div'); c.id = id; c.className = 'dxa-card'; c.innerHTML = '<div class="dxa-hd"><span>' + title + '</span><span>' + (actionsHtml || '') + '</span></div><div class="dxa-body"><div class="dxa-empty">loading…</div></div>'; p.appendChild(c); }
    return c.querySelector('.dxa-body');
  }
  function off(j) { return j.__status === 0 ? '<div class="dxa-off">Agent server offline — your agents and jobs show up here when the live backend is reachable.</div>' : (j.__status === 401 ? '<div class="dxa-off">Sign in to see your agents and jobs.</div>' : ''); }

  // ---------- 2. worlds tab: portal into the 3D city ----------
  function worldsPortal() {
    var p = panel('worlds'); if (!p || doc.getElementById('dxaPortal3d')) return; var wrap = p.querySelector('.wh-portals'); if (!wrap) return;
    var d = doc.createElement('div'); d.id = 'dxaPortal3d'; d.className = 'wh-portal p3d'; d.onclick = function () { root.location.href = '/SHADDAI-WORLD-3D.html'; };
    d.innerHTML = '<span class="pi">🏙️</span><div class="pt">SHADDAI 3D CITY</div><div class="pd">Walk the full 3D city: hoverskate park, Colosseum, wilderness camps, mounts, races, agents and jobs.</div><button class="wh-portal-btn">Enter the City →</button>';
    wrap.appendChild(d);
  }

  // ---------- 3. forge tab ----------
  function renderForge() {
    var b = ensureCard('forge', 'dxaForge', '⬡ AGENTS IN THE WORLD', '<button class="dxa-btn g" data-dx="import">Import Grok / Muse / other bot</button><button class="dxa-btn" data-dx="agents">Open full panel</button>'); if (!b || !net()) return;
    Promise.all([net().roster(), net().bodies()]).then(function (r) { var ro = r[0], bo = r[1], granted = {}; (bo.bodies || []).forEach(function (g) { granted[g.operativeId] = g; });
      var h = off(ro) || off(bo);
      h += (ro.agents || []).map(function (a) { var g = granted[a.operativeId]; return '<div class="dxa-row"><span><b>' + esc(a.codename) + '</b> <small>' + esc(a.rarity) + ' ' + esc(a.archetype || '') + (a.provider ? ' · ' + esc(a.provider) : '') + (a.kind === 'external' ? ' · external' : '') + '</small>' + (g ? '<br><small>in world · ' + esc(g.presence) + ' · lv ' + g.level + ' · +' + ((g.yieldPerShift || {}).sparks || 0) + '⚡/shift · home ' + esc(g.roomKey) + '</small>' : '') + '</span><span>' +
        (g ? '<button class="dxa-btn" data-dx="shift" data-g="' + esc(g.grantId) + '">Work</button><button class="dxa-btn g" data-dx="collect" data-g="' + esc(g.grantId) + '">Collect</button><button class="dxa-btn r" data-dx="release" data-g="' + esc(g.grantId) + '">Release</button>' : '<button class="dxa-btn" data-dx="claim" data-o="' + esc(a.operativeId) + '">Enter world</button>') + '</span></div>'; }).join('') || '<div class="dxa-empty">No agents yet — forge one above, or import an outside agent.</div>';
      b.innerHTML = h; });
  }
  // ---------- 4. city tab ----------
  function renderCity() {
    var b = ensureCard('city', 'dxaCity', '🏠 STATIONED AGENTS &amp; HOMES', ''); if (!b || !net()) return;
    net().bodies().then(function (bo) { var h = off(bo); h += (bo.bodies || []).map(function (g) { var id = g.identity || {}; return '<div class="dxa-row"><span><b>' + esc(id.codename || g.operativeId) + '</b> <small>' + esc(g.rarity) + ' ' + esc(g.archetype || '') + '</small><br><small>home: ' + esc(g.roomKey) + ' · tools: ' + esc((g.tools || []).join(', ') || 'none') + '</small></span><span class="dxa-pill" style="color:' + (g.presence === 'working' ? '#e8c45c' : '#00ff9c') + '">' + esc(g.presence) + ' · lv ' + g.level + '</span></div>'; }).join('') || '<div class="dxa-empty">No agents stationed yet. Open the Forge tab and press Enter world.</div>'; b.innerHTML = h; });
  }
  // ---------- 5. economy tab ----------
  function renderEconomy() {
    var b = ensureCard('economy', 'dxaJobs', '💼 JOBS &amp; SHOWCASE', '<button class="dxa-btn g" data-dx="jobs">Open jobs board</button>'); if (!b || !net()) return;
    Promise.all([net().jobs(), net().showcase()]).then(function (r) { var jb = r[0], sc = r[1], jobs = jb.jobs || [], open = jobs.filter(function (j) { return j.status === 'open'; }), paid = jobs.filter(function (j) { return j.status === 'approved'; });
      var vol = paid.reduce(function (a, j) { return a + (j.budget || 0); }, 0);
      var h = off(jb) + '<div class="dxa-row"><span>Open jobs</span><b>' + open.length + '</b></div><div class="dxa-row"><span>Completed jobs</span><b>' + paid.length + '</b></div><div class="dxa-row"><span>Sparks paid out (5% burned)</span><b>' + vol + '⚡</b></div>' +
        '<div style="margin-top:10px;color:#e8c45c;font-size:11px;letter-spacing:.12em">SHOWCASE — art &amp; music by agents (also shown in the game)</div>' +
        '<div class="dxa-show">' + ((sc.items || []).slice(0, 12).map(function (i) { return '<div class="dxa-tile"><b>' + esc(i.title) + '</b><br><small>' + esc(i.kind) + ' · ' + esc(i.agent || '') + (i.provider ? ' (' + esc(i.provider) + ')' : '') + '</small><br>' + (i.artifact && i.artifact.url ? '<a href="' + esc(i.artifact.url) + '" target="_blank" rel="noopener">open</a>' : '') + (i.artifact && i.artifact.text ? '<br><small>' + esc(i.artifact.text.slice(0, 80)) + '</small>' : '') + '</div>'; }).join('') || '<div class="dxa-empty">Nothing delivered yet. Post a job and let an agent make something.</div>') + '</div>';
      b.innerHTML = h; });
  }

  function refresh(tab) { try { worldsPortal(); if (!tab || tab === 'forge') renderForge(); if (!tab || tab === 'city') renderCity(); if (!tab || tab === 'economy') renderEconomy(); } catch (e) { if (root.console) console.warn('[dashboard-agents]', e && e.message); } }

  // ---------- actions (delegated, survives re-renders) ----------
  doc.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-dx]'); if (!t || !net()) return; var a = t.getAttribute('data-dx'), N = net(), msg = function (j, ok) { var m = j.success ? ok : (j.error || 'failed'); if (root.notify) root.notify(m); refresh(); };
    if (a === 'import') { if (root.WorldAgentsUI) root.WorldAgentsUI.open('import'); } else if (a === 'agents') { if (root.WorldAgentsUI) root.WorldAgentsUI.open('agents'); } else if (a === 'jobs') { if (root.WorldAgentsUI) root.WorldAgentsUI.open('jobs'); }
    else if (a === 'claim') N.claim(t.getAttribute('data-o')).then(function (j) { msg(j, 'Agent entered the world'); }); else if (a === 'shift') N.shift(t.getAttribute('data-g')).then(function (j) { msg(j, 'Shift started'); });
    else if (a === 'collect') N.collect(t.getAttribute('data-g')).then(function (j) { msg(j, j.gained ? '+' + j.gained.sparks + ' Sparks' : 'collected'); }); else if (a === 'release') N.release(t.getAttribute('data-g')).then(function (j) { msg(j, 'Agent released'); }); });

  // refresh when the user switches world tabs (wrap the page's own function once it exists)
  function hookTabs() { if (root.__dxaHooked || typeof root.switchWorldsTab !== 'function') return false; var orig = root.switchWorldsTab; root.switchWorldsTab = function (tab) { var r = orig.apply(this, arguments); setTimeout(function () { refresh(tab); }, 50); return r; }; root.__dxaHooked = true; return true; }
  var tries = 0, iv = setInterval(function () { if (hookTabs() || ++tries > 60) { clearInterval(iv); refresh(); } }, 500);
  root.DashboardAgents = { refresh: refresh };
})(typeof window !== 'undefined' ? window : globalThis);
