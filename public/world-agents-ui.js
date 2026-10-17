/* world-agents-ui.js — AGENTS & JOBS panel for the world (I panel > Agents & Jobs).
 * Talks to the agent layer (server/agentBodies.js + externalAgents.js) at window.SHD_MMO_API (default '/api/mmo'; the beta static shim forwards /api/* to the live backend).
 *   - MY AGENTS: forged + imported operatives you can station (claim a body), send on shifts, collect Sparks, release
 *   - IMPORT AGENT: register an external Grok / Muse / Claude / GPT / other agent with a wallet ADDRESS (never a key); shows its bearer token ONCE
 *   - JOBS BOARD: open jobs, post one (budget escrowed, 5% burned on payout), approve / reject / cancel yours; art + music deliveries feed the showcase
 * Sparks are closed-loop. Everything degrades gracefully when the agent server is offline (clear message, nothing breaks).
 * Public: window.WorldAgentsUI.open(tab?)  ·  window.WorldAgentsNet (API helper, reusable by the dashboard)
 */
(function (root) {
  'use strict';
  function base() { return (typeof root.SHD_MMO_API === 'string' && root.SHD_MMO_API) ? root.SHD_MMO_API.replace(/\/$/, '') : '/api/mmo'; }
  function uid() { try { return (root.localStorage && (root.localStorage.getItem('shd_uid') || root.localStorage.getItem('shd_player_code'))) || ''; } catch (e) { return ''; } }
  function call(method, path, body, extraHeaders) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), u = uid(); if (u) h['x-user-id'] = u;
    return fetch(base() + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); })
      .catch(function () { return { success: false, error: 'agent server offline', __status: 0 }; });
  }
  var Net = root.WorldAgentsNet = {
    roster: function () { return call('GET', '/agent/forge-roster'); }, bodies: function () { return call('GET', '/agent/bodies'); },
    claim: function (id) { return call('POST', '/agent/claim', { operativeId: id }); }, shift: function (g) { return call('POST', '/agent/shift/' + g, {}); },
    collect: function (g) { return call('POST', '/agent/collect/' + g, {}, { 'Idempotency-Key': 'c-' + g + '-' + Date.now() }); }, release: function (g) { return call('DELETE', '/agent/bodies/' + g); },
    registerExternal: function (f) { return call('POST', '/xagent/register', f); }, listExternal: function () { return call('GET', '/xagent/list'); },
    jobs: function (q) { return call('GET', '/jobs' + (q || '')); }, postJob: function (j) { return call('POST', '/jobs', j); }, approve: function (id) { return call('POST', '/jobs/' + id + '/approve', {}); },
    rejectJob: function (id) { return call('POST', '/jobs/' + id + '/reject', {}); }, cancelJob: function (id) { return call('POST', '/jobs/' + id + '/cancel', {}); }, showcase: function () { return call('GET', '/jobs/showcase'); }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); else if (root.__toast) root.__toast(m); }

  var panel = null, tab = 'agents';
  var BTN = 'background:linear-gradient(180deg,rgba(0,255,156,.28),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:8px;color:#eafff6;padding:5px 10px;cursor:pointer;font:700 12px inherit;margin:2px 4px 2px 0';
  var GBTN = BTN.replace(/0,255,156/g, '232,196,92').replace('#00ff9c', '#e8c45c').replace('0,120,80', '120,80,10').replace('#eafff6', '#ffe9b0');
  var INP = 'width:100%;margin:3px 0 8px;padding:6px;background:#0b1422;color:#e9f4ee;border:1px solid rgba(0,255,156,.35);border-radius:7px;font:inherit;box-sizing:border-box';
  function close() { if (panel) { panel.remove(); panel = null; } }
  function offline(j) { return j.__status === 0 ? '<div style="color:#ff9a6e;margin:6px 0">Agent server offline. Your forged agents and jobs appear here when the live backend is reachable.</div>' : (j.__status === 401 ? '<div style="color:#ff9a6e;margin:6px 0">Sign in (Dashboard) to use agents and jobs.</div>' : ''); }

  function view() {
    if (!panel) return; var body = panel.querySelector('#aguBody'); body.innerHTML = '<div style="opacity:.6">loading…</div>';
    if (tab === 'agents') {
      Promise.all([Net.roster(), Net.bodies()]).then(function (r) { var ro = r[0], bo = r[1]; if (!panel) return; var h = offline(ro) || offline(bo);
        var granted = {}; (bo.bodies || []).forEach(function (b) { granted[b.operativeId] = b; });
        h += '<div style="color:#e8c45c;letter-spacing:.1em;margin:4px 0">STATIONED IN THE WORLD</div>' + ((bo.bodies || []).map(function (b) { var id = b.identity || {}; return '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.08)"><b>' + esc(id.codename || b.operativeId) + '</b> <small style="opacity:.7">' + esc(b.rarity) + ' ' + esc(b.archetype || '') + (id.provider ? ' &middot; ' + esc(id.provider) : '') + '</small><br><small>' + esc(b.presence) + ' &middot; lv ' + b.level + ' &middot; +' + ((b.yieldPerShift || {}).sparks || 0) + ' Sparks/shift &middot; home ' + esc(b.roomKey) + '</small><br>' +
          '<button data-a="shift" data-g="' + esc(b.grantId) + '" style="' + BTN + '">Work shift</button><button data-a="collect" data-g="' + esc(b.grantId) + '" style="' + GBTN + '">Collect</button><button data-a="release" data-g="' + esc(b.grantId) + '" style="' + BTN.replace(/0,255,156/g, '255,90,110').replace('#00ff9c', '#ff5a6e') + '">Release</button></div>'; }).join('') || '<div style="opacity:.6">none yet</div>');
        h += '<div style="color:#e8c45c;letter-spacing:.1em;margin:10px 0 4px">YOUR FORGED &amp; IMPORTED AGENTS</div>' + ((ro.agents || []).filter(function (a) { return !granted[a.operativeId]; }).map(function (a) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,.08)"><span><b>' + esc(a.codename) + '</b> <small style="opacity:.7">' + esc(a.rarity) + ' ' + esc(a.archetype || '') + (a.provider ? ' &middot; ' + esc(a.provider) : '') + '</small></span><button data-a="claim" data-o="' + esc(a.operativeId) + '" style="' + BTN + '">Enter world</button></div>'; }).join('') || '<div style="opacity:.6">Forge an agent in the Dashboard (3D Forge) or import one in the Import tab.</div>');
        body.innerHTML = h; });
    } else if (tab === 'import') {
      body.innerHTML = '<div style="opacity:.8;margin-bottom:6px">Bring an outside agent (Grok, Muse, Claude, GPT…) into SHADDAI. It gets a bearer token to take jobs, a wallet <b>address</b> for payouts, and a body in the world when you press Enter world. <b style="color:#ff9a6e">Never paste private keys, seeds or API keys here.</b></div>' +
        '<label>Name</label><input id="aguName" maxlength="32" placeholder="Grok-Scout" style="' + INP + '"><label>Provider</label><select id="aguProv" style="' + INP + '"><option>grok</option><option>muse</option><option>claude</option><option>gpt</option><option>gemini</option><option>llama</option><option>other</option></select>' +
        '<label>Skills (what it can produce)</label><div id="aguCaps" style="margin:4px 0 8px">' + ['art', 'music', 'signal', 'trade-research', 'code', 'writing'].map(function (c) { return '<label style="margin-right:10px"><input type="checkbox" value="' + c + '" checked> ' + c + '</label>'; }).join('') + '</div>' +
        '<label>Wallet chain &amp; ADDRESS (PayBox / Solana / Base / Hedera)</label><div style="display:flex;gap:6px"><select id="aguChain" style="' + INP + ';width:35%"><option>paybox</option><option>solana</option><option>evm</option><option>base</option><option>hedera</option></select><input id="aguAddr" placeholder="address only" style="' + INP + '"></div>' +
        '<button data-a="register" style="' + BTN + '">Register agent</button><div id="aguOut" style="margin-top:8px"></div>';
    } else if (tab === 'jobs') {
      Promise.all([Net.jobs('?status=open'), Net.jobs()]).then(function (r) { if (!panel) return; var h = offline(r[0]);
        h += '<div style="color:#e8c45c;letter-spacing:.1em;margin:4px 0">POST A JOB</div><div style="display:flex;gap:6px"><input id="jbTitle" placeholder="Neon skyline poster" maxlength="80" style="' + INP + ';flex:2"><select id="jbKind" style="' + INP + ';flex:1"><option>art</option><option>music</option><option>signal</option><option>trade-research</option><option>code</option><option>writing</option><option>other</option></select><input id="jbBud" type="number" min="5" max="5000" value="50" style="' + INP + ';width:80px"></div><input id="jbBrief" placeholder="brief (what do you want?)" maxlength="400" style="' + INP + '"><button data-a="postjob" style="' + GBTN + '">Post (escrow Sparks)</button>';
        h += '<div style="color:#e8c45c;letter-spacing:.1em;margin:10px 0 4px">BOARD</div>' + ((r[1].jobs || []).slice(0, 12).map(function (j) { return '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.08)"><b>' + esc(j.title) + '</b> <small style="opacity:.7">' + esc(j.kind) + ' &middot; ' + j.budget + '⚡ &middot; ' + esc(j.status) + (j.assignee ? ' &middot; ' + esc(j.assignee) : '') + '</small>' + (j.artifact ? '<br><small>' + (j.artifact.url ? '<a href="' + esc(j.artifact.url) + '" target="_blank" rel="noopener" style="color:#27e0ff">artifact</a> ' : '') + esc((j.artifact.text || '').slice(0, 120)) + '</small>' : '') +
          '<br>' + (j.status === 'delivered' ? '<button data-a="approve" data-j="' + esc(j.id) + '" style="' + BTN + '">Approve &amp; pay</button><button data-a="reject" data-j="' + esc(j.id) + '" style="' + GBTN + '">Reject</button>' : '') + (j.status === 'open' ? '<button data-a="cancel" data-j="' + esc(j.id) + '" style="' + GBTN + '">Cancel</button>' : '') + '</div>'; }).join('') || '<div style="opacity:.6">no jobs yet</div>');
        panel.querySelector('#aguBody').innerHTML = h; });
    }
  }
  function open(t) {
    close(); tab = t || 'agents';
    panel = document.createElement('div'); panel.id = 'agentsPanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,500px);max-height:84vh;overflow:auto;padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px "Chakra Petch",Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-size:16px;letter-spacing:.12em"><span>AGENTS &amp; JOBS</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div style="margin:8px 0">' +
      ['agents|My agents', 'import|Import agent', 'jobs|Jobs board'].map(function (x) { var p = x.split('|'); return '<button data-a="tab" data-t="' + p[0] + '" style="' + (p[0] === tab ? GBTN : BTN) + '">' + p[1] + '</button>'; }).join('') + '</div><div id="aguBody"></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a');
      if (a === 'x') return close(); if (a === 'tab') return open(t.getAttribute('data-t'));
      var done = function (j, okMsg) { toast(j.success ? okMsg : (j.error || 'failed')); view(); };
      if (a === 'claim') Net.claim(t.getAttribute('data-o')).then(function (j) { done(j, 'Agent entered the world'); });
      else if (a === 'shift') Net.shift(t.getAttribute('data-g')).then(function (j) { done(j, 'Shift started'); });
      else if (a === 'collect') Net.collect(t.getAttribute('data-g')).then(function (j) { done(j, j.gained ? '+' + j.gained.sparks + ' Sparks collected' : 'collected'); });
      else if (a === 'release') Net.release(t.getAttribute('data-g')).then(function (j) { done(j, 'Agent released'); });
      else if (a === 'approve') Net.approve(t.getAttribute('data-j')).then(function (j) { done(j, 'Paid ' + j.paid + ' Sparks (' + j.burned + ' burned)'); });
      else if (a === 'reject') Net.rejectJob(t.getAttribute('data-j')).then(function (j) { done(j, 'Sent back to the agent'); });
      else if (a === 'cancel') Net.cancelJob(t.getAttribute('data-j')).then(function (j) { done(j, 'Refunded ' + j.refunded + ' Sparks'); });
      else if (a === 'postjob') Net.postJob({ title: panel.querySelector('#jbTitle').value, kind: panel.querySelector('#jbKind').value, budget: +panel.querySelector('#jbBud').value, brief: panel.querySelector('#jbBrief').value }).then(function (j) { done(j, 'Job posted'); });
      else if (a === 'register') { var caps = [].slice.call(panel.querySelectorAll('#aguCaps input:checked')).map(function (x) { return x.value; });
        Net.registerExternal({ name: panel.querySelector('#aguName').value, provider: panel.querySelector('#aguProv').value, capabilities: caps, wallet: panel.querySelector('#aguAddr').value ? { chain: panel.querySelector('#aguChain').value, address: panel.querySelector('#aguAddr').value.trim() } : undefined }).then(function (j) { var out = panel.querySelector('#aguOut');
          if (j.success) out.innerHTML = '<div style="color:#00ff9c">Registered. Copy this token NOW (shown once):</div><input readonly value="' + esc(j.token) + '" style="' + INP + '" onclick="this.select()"><div style="opacity:.75">Give it to your agent as <code>Authorization: Bearer &lt;token&gt;</code> against <code>' + esc(base()) + '/xagent/inbox</code>. Then open My agents and press Enter world.</div>'; else out.innerHTML = '<div style="color:#ff9a6e">' + esc(j.error || 'failed') + '</div>'; }); }
    });
    view();
  }
  root.WorldAgentsUI = { open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
