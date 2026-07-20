/* ══════════════════════════════════════════════════════════════════
   SHADDAI — ROOMS MANAGER  (rooms-manager.js)
   The "Rooms" tab, coherent with the cohesion architecture:
     World → Office → ROOMS → Agents → Forge.
   Your office is owned property; ROOMS are its modules. This panel lists
   them, lets you CUSTOMIZE (name / type / visibility / theme → PATCH
   /api/agent-rooms/:id) and ADD ROOM. Agent rooms come live from the
   canonical /api/agent-rooms model; functional rooms are fixed property
   modules (Command Sanctum, Pixel Forge, Bazaar, Treasury, Achievements).
   Self-contained, null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__roomsManagerV1) return; window.__roomsManagerV1 = true;

  var VIS = [
    { id: 'private', label: 'Private', hint: 'Only you enter; others see the exterior' },
    { id: 'public-showroom', label: 'Public Showroom', hint: 'Others can visit & inspect, no paid tools' },
    { id: 'hireable-studio', label: 'Hireable Studio', hint: 'Others can request work / pay via x402' }
  ];
  var ROOM_TYPES = ['office', 'studio', 'forge-room', 'shop', 'sanctum', 'gallery', 'treasury', 'request'];
  var TYPE_ICON = { office: '▤', studio: '✦', 'forge-room': '⚒', shop: '◈', sanctum: '☰', gallery: '🖼', treasury: '◆', request: '✉' };

  // Permanent functional rooms — property modules every office has (cohesion spec).
  var FIXED = [
    { key: 'sanctum', icon: '☰', title: 'Command Sanctum', type: 'sanctum', desc: 'HQ · the 7 core agents', act: function () { go('office'); } },
    { key: 'pixelforge', icon: '⬡', title: 'Pixel Forge', type: 'forge-room', desc: 'Forge world-facing 2D agents', act: function () { window.location.href = '/pixel-forge.html'; } },
    { key: 'bazaar', icon: '◈', title: 'Bazaar', type: 'shop', desc: 'Showcase & sell — public storefront', act: function () { go('marketplace'); } },
    { key: 'treasury', icon: '◆', title: 'Treasury', type: 'treasury', desc: 'Sparks · reputation · referrals', act: function () { go('settings'); } },
    { key: 'achievements', icon: '🏆', title: 'Achievements', type: 'gallery', desc: 'Wall of wins & impact', act: function () { window.location.href = '/achievements.html'; } }
  ];

  function go(view) { try { if (typeof window.showView === 'function') window.showView(view); closePanel(); } catch (e) {} }
  function owner() { try { return (typeof window.opOwner === 'function') ? window.opOwner() : 'guest'; } catch (e) { return 'guest'; } }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }

  function injectCss() {
    if (document.getElementById('rmgr-css')) return;
    var s = el('style'); s.id = 'rmgr-css';
    s.textContent =
      '#rmgr{position:fixed;inset:0;z-index:100020;display:none;background:rgba(6,4,16,.86);backdrop-filter:blur(9px);' +
      'font-family:"Chakra Petch",sans-serif;color:#efe9ff;overflow:auto}' +
      '#rmgr.on{display:block}' +
      '#rmgr .rw{max-width:1080px;margin:0 auto;padding:26px 22px 60px}' +
      '#rmgr .rh{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:6px}' +
      '#rmgr .rt{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:22px;letter-spacing:.04em;' +
      'background:linear-gradient(90deg,#a855f7,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '#rmgr .rsub{font-family:"IBM Plex Mono",monospace;font-size:11px;color:#9a86c8;letter-spacing:.04em;margin-bottom:20px}' +
      '#rmgr .radd{font-family:"Space Grotesk";font-weight:700;font-size:13px;padding:9px 15px;border-radius:10px;cursor:pointer;' +
      'background:linear-gradient(100deg,#a855f7,#7c3aed);color:#fff;border:none}' +
      '#rmgr .rx{background:none;border:1px solid rgba(168,85,247,.4);color:#9a86c8;border-radius:9px;padding:8px 13px;cursor:pointer;font-family:inherit}' +
      '#rmgr .rsec{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#6f5aa8;margin:22px 0 10px}' +
      '#rmgr .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}' +
      '#rmgr .card{border:1px solid rgba(168,85,247,.22);background:linear-gradient(160deg,rgba(24,16,46,.7),rgba(14,10,26,.5));' +
      'border-radius:14px;padding:15px 15px 13px;position:relative;transition:.16s}' +
      '#rmgr .card:hover{border-color:rgba(168,85,247,.6);transform:translateY(-2px)}' +
      '#rmgr .card .ic{font-size:22px;margin-bottom:8px;display:block}' +
      '#rmgr .card .nm{font-family:"Space Grotesk";font-weight:700;font-size:15px;margin-bottom:2px}' +
      '#rmgr .card .ds{font-size:11.5px;color:#9a86c8;line-height:1.4;min-height:30px}' +
      '#rmgr .card .meta{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0 11px}' +
      '#rmgr .chip{font-family:"IBM Plex Mono";font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;' +
      'border:1px solid rgba(168,85,247,.3);color:#c7b6ef}' +
      '#rmgr .chip.priv{color:#9a86c8} #rmgr .chip.show{color:#22d3ee;border-color:rgba(34,211,238,.4)} #rmgr .chip.hire{color:#00e5a0;border-color:rgba(0,229,160,.4)}' +
      '#rmgr .row{display:flex;gap:8px}' +
      '#rmgr .rb{flex:1;font-family:"Chakra Petch";font-weight:600;font-size:12px;padding:8px;border-radius:8px;cursor:pointer;border:1px solid rgba(168,85,247,.35);background:rgba(168,85,247,.08);color:#e7ddff}' +
      '#rmgr .rb:hover{background:rgba(168,85,247,.2)} #rmgr .rb.pri{background:#a855f7;color:#0b0416;border-color:#a855f7}' +
      '#rmgr .edit{margin-top:10px;padding-top:11px;border-top:1px solid rgba(168,85,247,.18);display:none}' +
      '#rmgr .edit.on{display:block}' +
      '#rmgr .edit label{display:block;font-family:"IBM Plex Mono";font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6f5aa8;margin:8px 0 3px}' +
      '#rmgr .edit input,#rmgr .edit select{width:100%;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:7px;color:#efe9ff;padding:7px 9px;font-family:inherit;font-size:12px}' +
      '#rmgr .fixed .card{border-color:rgba(232,196,92,.24)} #rmgr .fixed .card:hover{border-color:rgba(232,196,92,.6)}' +
      '#rmgr .empty{color:#9a86c8;font-size:13px;border:1px dashed rgba(168,85,247,.3);border-radius:12px;padding:22px;text-align:center}';
    document.head.appendChild(s);
  }

  var panel;
  function build() {
    injectCss();
    panel = el('div'); panel.id = 'rmgr';
    panel.innerHTML =
      '<div class="rw">' +
      '<div class="rh"><div><div class="rt">◈ My Rooms</div></div>' +
      '<div class="row"><button class="radd" id="rmgrAdd">＋ Add Room</button><button class="rx" id="rmgrClose">✕ Close</button></div></div>' +
      '<div class="rsub">Your office is owned property — these are its rooms. Customize a room, or add one. Agent rooms sync from your forged operatives.</div>' +
      '<div class="rsec">Property modules</div><div class="grid fixed" id="rmgrFixed"></div>' +
      '<div class="rsec">Your agent rooms</div><div class="grid" id="rmgrAgents"></div>' +
      '</div>';
    document.body.appendChild(panel);
    panel.querySelector('#rmgrClose').addEventListener('click', closePanel);
    panel.querySelector('#rmgrAdd').addEventListener('click', addRoom);
    panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
  }

  function renderFixed() {
    var host = panel.querySelector('#rmgrFixed'); host.innerHTML = '';
    FIXED.forEach(function (f) {
      var c = el('div', 'card');
      c.innerHTML = '<span class="ic">' + f.icon + '</span><div class="nm">' + esc(f.title) + '</div>' +
        '<div class="ds">' + esc(f.desc) + '</div><div class="meta"><span class="chip">' + esc(f.type) + '</span><span class="chip">permanent</span></div>' +
        '<div class="row"><button class="rb pri">Enter →</button></div>';
      c.querySelector('.rb').addEventListener('click', f.act);
      host.appendChild(c);
    });
  }

  function visChip(v) { var m = { 'private': 'priv', 'public-showroom': 'show', 'hireable-studio': 'hire' }; return '<span class="chip ' + (m[v] || 'priv') + '">' + esc((v || 'private').replace('-', ' ')) + '</span>'; }

  function renderAgents(rooms) {
    var host = panel.querySelector('#rmgrAgents'); host.innerHTML = '';
    if (!rooms.length) { host.innerHTML = '<div class="empty">No agent rooms yet. Forge an agent in the <b style="color:#22d3ee">Pixel Forge</b> and it claims a room in your office.</div>'; return; }
    rooms.forEach(function (r) {
      var a = r.agent || {}, room = r.room || {}, vis = (r.permissions && r.permissions.visibility) || 'private';
      var c = el('div', 'card');
      c.innerHTML =
        '<span class="ic" style="color:' + esc(a.badgeColor || '#22d3ee') + '">' + (TYPE_ICON[room.roomType] || '▤') + '</span>' +
        '<div class="nm">' + esc(room.title || a.name || 'Room') + '</div>' +
        '<div class="ds">' + esc(a.archetype || 'operative') + (a.stats && a.stats.reputation != null ? ' · rep ' + a.stats.reputation : '') + '</div>' +
        '<div class="meta"><span class="chip">' + esc(room.roomType || 'office') + '</span>' + visChip(vis) + '</div>' +
        '<div class="row"><button class="rb pri" data-act="enter">Enter →</button><button class="rb" data-act="cust">Customize</button></div>' +
        '<div class="edit">' +
        '<label>Room name</label><input data-f="title" value="' + esc(room.title || '') + '">' +
        '<label>Room type</label><select data-f="roomType">' + ROOM_TYPES.map(function (t) { return '<option ' + (room.roomType === t ? 'selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
        '<label>Who can visit</label><select data-f="visibility">' + VIS.map(function (v) { return '<option value="' + v.id + '" ' + (vis === v.id ? 'selected' : '') + '>' + v.label + ' — ' + v.hint + '</option>'; }).join('') + '</select>' +
        '<div class="row" style="margin-top:10px"><button class="rb pri" data-act="save">Save</button><button class="rb" data-act="cancel">Cancel</button></div>' +
        '</div>';
      var edit = c.querySelector('.edit');
      c.querySelector('[data-act="enter"]').addEventListener('click', function () { try { if (a.id && typeof window.openAgentRoom === 'function') { closePanel(); window.openAgentRoom(a.id); } } catch (e) {} });
      c.querySelector('[data-act="cust"]').addEventListener('click', function () { edit.classList.toggle('on'); });
      c.querySelector('[data-act="cancel"]').addEventListener('click', function () { edit.classList.remove('on'); });
      c.querySelector('[data-act="save"]').addEventListener('click', function () {
        var patch = { title: c.querySelector('[data-f="title"]').value, roomType: c.querySelector('[data-f="roomType"]').value, visibility: c.querySelector('[data-f="visibility"]').value };
        saveRoom(a.id, patch, c);
      });
      host.appendChild(c);
    });
  }

  function saveRoom(id, patch, card) {
    if (!id) return;
    var btn = card.querySelector('[data-act="save"]'); if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
    fetch('/api/agent-rooms/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      .then(function (r) { return r.json(); }).then(function () { load(); })
      .catch(function () { if (btn) { btn.textContent = 'Save'; btn.disabled = false; } if (window.notify) notify('Sign in to customize your room'); });
  }

  function addRoom() {
    // Cohesion: agent rooms come from forging; functional rooms are the fixed modules.
    var msg = 'Add a room:\n\n1 — Forge a new agent (Pixel Forge → it claims a room)\n2 — Jump to a property module (Bazaar / Treasury / Achievements)\n\nEnter 1 or 2:';
    var v; try { v = window.prompt(msg, '1'); } catch (e) { v = '1'; }
    if (v === '1') { window.location.href = '/pixel-forge.html'; }
    else if (v === '2') { go('marketplace'); }
  }

  function load() {
    fetch('/api/agent-rooms?owner=' + encodeURIComponent(owner()))
      .then(function (r) { return r.json(); })
      .then(function (d) { renderAgents((d && d.rooms) || []); })
      .catch(function () { renderAgents([]); });
  }

  window.openRoomsManager = function () { if (!panel) build(); renderFixed(); load(); panel.classList.add('on'); document.body.style.overflow = 'hidden'; };
  function closePanel() { if (panel) panel.classList.remove('on'); document.body.style.overflow = ''; }

  // Repoint any "Rooms" nav buttons (were → Marketplace) to open this manager.
  function wireNav() {
    try {
      document.querySelectorAll('button,a').forEach(function (b) {
        var t = (b.textContent || '').trim();
        var oc = b.getAttribute('onclick') || '';
        if (/^(\W*\s*)?Rooms\b/i.test(t) && /marketplace/i.test(oc)) {
          b.setAttribute('onclick', 'window.openRoomsManager&&openRoomsManager()');
        }
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireNav); else wireNav();
  setTimeout(wireNav, 1500); // catch late-rendered nav
})();
