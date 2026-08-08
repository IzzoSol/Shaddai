/* ══════════════════════════════════════════════════════════════════
   SHADDAI — COMMAND HUB  (command-terminal.js)
   Merged INTO the dashboard Office tab (v2 — no overlay).
   The 🏢 Office tab now hosts: Command Center · Your Property ·
   Gallery · Showcase · Bazaar · Treasury.
   (World-facing Rooms & Forge live in the 2D/3D World — not here.)
   window.renderOfficeTab(tab) renders a hub panel into its office
   container. window.openCommandTerminal(tab) is a compat shim that
   jumps to the Office tab. Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__commandTerminalV2) return; window.__commandTerminalV2 = true;

  function owner() { try { return (typeof window.opOwner === 'function') ? window.opOwner() : 'guest'; } catch (e) { return 'guest'; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }

  function css() {
    if (document.getElementById('shdterm-css')) return;
    var s = document.createElement('style'); s.id = 'shdterm-css';
    s.textContent = [
      '.shdterm-scope{font-family:"Chakra Petch",sans-serif;color:#efe9ff}',
      '.shdterm-scope .rsec{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:13px;color:#efe9ff;margin:14px 0 10px;display:flex;gap:8px;align-items:center}',
      '.shdterm-scope .rsec .c{font-family:"IBM Plex Mono",monospace;font-size:9px;color:#9a86c8;border:1px solid rgba(168,85,247,.2);border-radius:999px;padding:2px 8px;font-weight:400}',
      '.shdterm-scope .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px;margin-bottom:6px}',
      '.shdterm-scope .card{border:1px solid rgba(168,85,247,.2);background:linear-gradient(160deg,rgba(24,16,46,.7),rgba(14,10,26,.5));border-radius:13px;padding:14px;position:relative;transition:.16s}',
      '.shdterm-scope .card:hover{transform:translateY(-2px);border-color:rgba(168,85,247,.55)}',
      '.shdterm-scope .card .hd{display:flex;gap:9px;align-items:center;margin-bottom:7px}',
      '.shdterm-scope .card .ic{font-size:19px;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:rgba(168,85,247,.1)}',
      '.shdterm-scope .card h4{font-family:"Space Grotesk",sans-serif;font-size:14px;margin:0}',
      '.shdterm-scope .card .role{font-size:11px;color:#9a86c8}',
      '.shdterm-scope .card .d{font-size:11.5px;color:#9a86c8;line-height:1.4;margin:2px 0 10px}',
      '.shdterm-scope .pub{position:absolute;top:11px;right:11px;font-family:"IBM Plex Mono",monospace;font-size:8px;text-transform:uppercase;padding:3px 7px;border-radius:999px}',
      '.shdterm-scope .pub.public,.shdterm-scope .pub.hireable{color:#0b0416}',
      '.shdterm-scope .pub.hireable{background:#00e5a0}',
      '.shdterm-scope .pub.public{background:#22d3ee}',
      '.shdterm-scope .pub.showroom{color:#22d3ee;border:1px solid #22d3ee}',
      '.shdterm-scope .pub.private{color:#9a86c8;border:1px solid rgba(168,85,247,.3)}',
      '.shdterm-scope .pub.draft{color:#e8c45c;border:1px solid #e8c45c}',
      '.shdterm-scope .tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}',
      '.shdterm-scope .tag{font-family:"IBM Plex Mono",monospace;font-size:9px;text-transform:uppercase;padding:3px 7px;border-radius:6px;border:1px solid rgba(168,85,247,.2);color:#c7b6ef}',
      '.shdterm-scope .acts{display:flex;gap:6px;flex-wrap:wrap}',
      '.shdterm-scope .acts button{flex:1;min-width:56px;font-family:"Chakra Petch",sans-serif;font-weight:600;font-size:11px;padding:7px;border-radius:7px;cursor:pointer;border:1px solid rgba(168,85,247,.2);background:rgba(168,85,247,.07);color:#e7ddff}',
      '.shdterm-scope .acts button.pri{background:#a855f7;color:#0b0416;border-color:#a855f7}',
      '.shdterm-scope .acts button:hover{filter:brightness(1.12)}',
      '.shdterm-scope .oneagent{font-family:"IBM Plex Mono",monospace;font-size:11px;color:#9a86c8;margin-bottom:12px}',
      '.shdterm-scope .oneagent b{color:#22d3ee}',
      '.shdterm-scope .gate{color:#e8c45c}',
      '.shdterm-scope .empty{color:#9a86c8;font-size:13px;border:1px dashed rgba(168,85,247,.3);border-radius:12px;padding:20px;text-align:center}',
      '.shdterm-scope .stat{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(168,85,247,.1);font-size:12px}',
      '.shdterm-scope .stat b{font-family:"Space Grotesk",sans-serif}',
      '.shdterm-scope .stat span{color:#9a86c8}',
      '.shdterm-scope .cl{background:none;border:1px solid rgba(168,85,247,.4);color:#9a86c8;border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit}',
      '.shdterm-scope .cl:hover{color:#efe9ff;border-color:rgba(168,85,247,.7)}',
      '.shdterm-scope .claim{margin-bottom:14px;background:rgba(10,5,24,.82);border:1px solid rgba(168,85,247,.35);border-radius:12px;text-align:center;padding:24px}',
      '.shdterm-scope .claim h2{font-family:"Space Grotesk",sans-serif;font-size:20px;margin:0 0 6px}',
      '.shdterm-scope .claim p{color:#9a86c8;font-size:13px;max-width:380px;margin:0 auto 16px;line-height:1.5}',
      '.shdterm-scope .claim button{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416}',
      '.shdterm-scope .card input,.shdterm-scope .card select{background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:8px;color:#efe9ff;padding:9px 11px;font-family:inherit;font-size:13px}'
    ].join('');
    document.head.appendChild(s);
  }
  css();

  // ── OFFICE PROPERTY: the real 2D world focused on your owned office building ──
  function renderOffice() {
    var host = document.getElementById('officeCommandProp');
    if (!host) return;
    host.innerHTML = '<div id="shdtClaim" class="claim" style="display:none"></div><div id="shdtOfMgr"></div>';
    var claim = document.getElementById('shdtClaim'), mgr = document.getElementById('shdtOfMgr');
    fetch('/api/office').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.needSignIn) {
        claim.style.display = '';
        claim.innerHTML = '<div><h2>Claim your office</h2><p>Sign in to create your one office — a building you own in SHADDAI City, with your agents\' rooms inside.</p><button id="shdtSignIn">Sign in →</button></div>';
        claim.querySelector('#shdtSignIn').onclick = function () { try { if (window.shdSignIn) window.shdSignIn(); } catch (e) {} };
        return;
      }
      claim.style.display = 'none';
      var o = (d && d.office) || {}, sm = (d && d.summary) || {};
      paintOffice(o, sm, !!(d && d.canClaim), mgr);
    }).catch(function () { if (mgr) mgr.innerHTML = '<div class="empty">Office unavailable — try again.</div>'; });
  }

  // The office is ONLY your office — a customizable space, persistent to your lot in
  // the real game. For an UNCLAIMED preview, actually create the office on first real
  // action (Save or lot-pick), then run cb. For a claimed office it just runs cb.
  function ensureOffice(unclaimed, cb) {
    if (!unclaimed) return cb();
    fetch('/api/office/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(function (r) { return r.json(); }).then(function () { cb(); }).catch(function () { cb(); });
  }
  function patchOffice(body, done) {
    fetch('/api/office', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function () { if (done) done(); }).catch(function () { if (done) done(); });
  }
  function paintOffice(o, sm, unclaimed, host) {
    var uidq = ''; try { var _u = o.ownerUserId || localStorage.getItem('shd_userid') || ''; if (_u) uidq = '&uid=' + encodeURIComponent(_u); } catch (e) {}
    var visual = unclaimed
      ? '<div style="height:300px;display:grid;place-items:center;border-radius:12px;border:1px dashed rgba(34,211,238,.35);background:radial-gradient(120% 90% at 50% 10%,rgba(34,211,238,.10),rgba(8,4,18,.6));color:#8fd9e8;font-size:13px;text-align:center;margin-bottom:14px">Your walkable office appears here once you set it up.<br><span style="opacity:.7;font-size:11px">Name it &amp; pick a lot below.</span></div>'
      : '<div style="position:relative;height:340px;border-radius:12px;overflow:hidden;border:1px solid rgba(168,85,247,.28);margin-bottom:14px;background:#0a0518"><iframe src="/game.html?embed=office&walk=1' + uidq + '" title="Your office" style="width:100%;height:100%;border:0;display:block" loading="lazy"></iframe></div>';
    host.innerHTML = visual +
      (unclaimed
        ? '<div class="oneagent"><b>Set up your office.</b> Name it, choose who can visit, and pick an open lot in SHADDAI City — it\'s claimed the moment you <b>Save</b> or pick a lot. Nothing exists until you do. <span class="gate">3D-world office comes later.</span></div>'
        : '<div class="oneagent"><b>Your office.</b> Pick a look, name it, choose who can visit, and set up on an open lot in SHADDAI City. This is the <b>same office</b> people find in the game. <span class="gate">3D-world office comes later.</span></div>') +
      '<div class="card" style="padding:15px"><div class="rsec" style="margin-top:0">Identity <span class="c">name · who can visit</span></div><div style="display:grid;gap:10px">' +
      '<label style="font-size:11px;color:#9a86c8">Office name<input id="shdtOfName" maxlength="48" value="' + esc(o.name || 'My Command Office') + '" style="width:100%;margin-top:5px"></label>' +
      '<label style="font-size:11px;color:#9a86c8">Who can visit<select id="shdtOfVis" style="width:100%;margin-top:5px">' +
      ['private', 'public-showroom', 'hireable-studio'].map(function (v) { return '<option value="' + v + '"' + (o.visibility === v ? ' selected' : '') + '>' + v.replace('-', ' ') + '</option>'; }).join('') + '</select></label>' +
      '<button class="pri" id="shdtOfSave" style="justify-self:start;font-family:\'Chakra Petch\';font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#a855f7;color:#0b0416;cursor:pointer">Save office</button>' +
      '</div></div>' +
      '<div class="card" style="padding:15px;margin-top:12px"><div class="rsec" style="margin-top:0">Summary <span class="c">at a glance</span></div>' +
      '<div class="stat"><span>Rooms</span><b>' + (sm.rooms || 0) + '</b></div>' +
      '<div class="stat"><span>Agents</span><b>' + (sm.agents || 0) + '</b></div>' +
      '<div class="stat"><span>Public rooms</span><b>' + (sm.public || 0) + '</b></div>' +
      '<div class="stat"><span>Hireable</span><b>' + (sm.hireable || 0) + '</b></div>' +
      '<div class="acts" style="margin-top:12px">' +
      '<button class="cl" onclick="window.open(\'/game.html?embed=office&walk=1' + (o.ownerUserId ? '&uid=' + encodeURIComponent(o.ownerUserId) : '') + '\',\'_blank\')">◈ Enter &amp; walk your office →</button>' +
      '<button class="cl" onclick="window.open(\'/game.html?embed=office' + (o.ownerUserId ? '&uid=' + encodeURIComponent(o.ownerUserId) : '') + '\',\'_blank\')">◇ View from the city</button>' +
      '<button class="cl" onclick="window.open(\'/game.html\',\'_blank\')">🚪 Rooms · 2D World</button>' +
      '<button class="cl" onclick="window.open(\'/pixel-forge.html\',\'_blank\')">⬡ Forge · Pixel Forge</button>' +
      '</div>' +
      '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:#9a86c8;margin-top:12px;line-height:1.5">Your office is persistent — the same lot shows up in the shared 2D game. Others visit by permission.</div></div>' +
      '<div class="rsec">Your lot <span class="c">Founders\' Row · pick an open lot to set up / switch</span></div>' +
      '<div class="grid" id="shdtOfLots" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"><div class="empty">Loading…</div></div>';
    Promise.all([
      fetch('/api/office/lots').then(function (r) { return r.json(); }).catch(function () { return { lots: [] }; })
    ]).then(function (res) {
      var lots = (res[0] && res[0].lots) || [];
      var le = document.getElementById('shdtOfLots');
      if (!le) return;
      le.innerHTML = lots.map(function (l) {
        var mine = l.state === 'you', open = l.state === 'open', taken = l.state === 'taken';
        var col = mine ? '#00e5a0' : taken ? '#5a4a7a' : '#a855f7';
        return '<div class="card" data-lot="' + l.slot + '" data-state="' + l.state + '" style="text-align:center;padding:11px;cursor:' + (taken ? 'not-allowed' : 'pointer') + ';opacity:' + (taken ? '.5' : '1') + ';border-color:' + (mine ? '#00e5a0' : 'rgba(168,85,247,.2)') + '">' +
          '<div style="font-family:\'Space Grotesk\';font-weight:700;font-size:15px;color:' + col + '">Lot ' + (l.slot + 1) + '</div>' +
          '<div class="role" style="font-size:10px">' + (mine ? 'your office' : open ? 'open' : 'taken') + '</div></div>';
      }).join('');
      le.querySelectorAll('.card[data-lot]').forEach(function (c) {
        if (c.getAttribute('data-state') === 'taken') return;
        c.addEventListener('click', function () {
          if (c.getAttribute('data-state') === 'you') return;
          ensureOffice(unclaimed, function () {
            fetch('/api/office/switch-lot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: parseInt(c.getAttribute('data-lot'), 10) }) })
              .then(function (r) { return r.json(); }).then(function (d) { if (d && d.error) { try { if (window.notify) notify('Lot ' + d.error); } catch (e) {} return; } renderOffice(); });
          });
        });
      });
    });
    var save = document.getElementById('shdtOfSave');
    if (save) save.addEventListener('click', function () {
      var name = (document.getElementById('shdtOfName') || {}).value || '';
      var vis = (document.getElementById('shdtOfVis') || {}).value || 'private';
      save.textContent = 'Saving…';
      ensureOffice(unclaimed, function () {
        patchOffice({ name: name, visibility: vis }, function () { renderOffice(); });
      });
    });
  }

  function visClass(v) { return { 'private': 'private', 'public-showroom': 'showroom', 'hireable-studio': 'hireable' }[v] || 'private'; }
  function card(ic, name, role, d, act, pub) {
    return '<div class="card">' + (pub ? '<span class="pub ' + pub[0] + '">' + esc(pub[1]) + '</span>' : '') +
      '<div class="hd"><span class="ic">' + ic + '</span><div><h4>' + esc(name) + '</h4><div class="role">' + esc(role) + '</div></div></div>' +
      '<div class="d">' + esc(d) + '</div><div class="acts"><button class="pri">' + esc(act) + '</button></div></div>';
  }
  function section(title, sub, cards) { return '<div class="rsec">' + esc(title) + ' <span class="c">' + esc(sub) + '</span></div><div class="grid">' + cards.join('') + '</div>'; }

  // ── GALLERY: your pixel agents (+ 3D models placeholder) ──
  function renderGallery() {
    var host = document.getElementById('officeGallery');
    if (!host) return;
    host.innerHTML = '<div class="oneagent">Your creations — pixel agents & 3D models. <b style="color:#00e5a0">Yours to use anywhere</b>; placing in office/world needs the upgrade.</div>' +
      '<div class="rsec">Pixel Agents <span class="c">2D embodiments</span></div><div class="grid" id="shdtGalPix"><div class="empty">Loading…</div></div>' +
      '<div class="rsec">3D Models <span class="c">hero & personal</span></div><div class="grid">' +
      card('▣', 'Generate a 3D model', 'Meshy · three.js', 'Build a 3D model for an agent — free for yourself, Pro to place in world.', '⬡ Open 3D Forge') + '</div>';
    var gp = document.getElementById('shdtGalPix');
    fetch('/api/agent-rooms?owner=' + encodeURIComponent(owner())).then(function (r) { return r.json(); }).then(function (d) {
      var rooms = (d && d.rooms) || [];
      if (!rooms.length) { gp.innerHTML = '<div class="empty">No pixel agents yet — forge one in the Pixel Forge.</div>'; return; }
      gp.innerHTML = rooms.map(function (r) { var a = r.agent || {}; return card('✦', a.name || 'Agent', 'pixel2D', 'Published to your office.', 'Edit', ['public', 'in office']); }).join('');
    }).catch(function () { gp.innerHTML = '<div class="empty">—</div>'; });
  }

  // ── SHOWCASE: community 3D marketplace ──
  function renderShowcase() {
    var host = document.getElementById('officeShowcase');
    if (!host) return;
    host.innerHTML =
      '<div class="oneagent">Community <b class="gate">3D model marketplace</b> — Meshy, three.js & more. Buy for <b style="color:#00e5a0">personal / game use</b>; office/world placement needs an upgrade.</div>' +
      '<div class="rsec">Featured 3D models <span class="c">community</span></div><div class="grid">' +
      card('▣', 'Neon Valkyrie', 'by @emeraldog · Meshy', 'Rigged hero · 7 anims · personal/game use.', 'Buy · 45 CR', ['public', '45 CR']) +
      card('◈', 'Obsidian Sentinel', 'by @nexus · three.js', 'Procedural mech · low-poly.', 'Buy · 30 CR', ['public', '30 CR']) +
      card('✦', 'Grid Drone', 'by @turtle · three.js', 'Community freebie · personal use.', 'Get · free', ['public', 'free']) +
      card('＋', 'List your model', 'sell to community', 'Publish a Meshy/three.js model · earn Sparks.', 'Publish model', null) + '</div>';
  }

  // ── BAZAAR: your public storefront ──
  function renderBazaar() {
    var host = document.getElementById('officeBazaar');
    if (!host) return;
    host.innerHTML = section('Bazaar', 'your public storefront', [card('◈', 'Your services', 'agent hires', 'Buyers pay via credits / x402 — you take the spread.', 'Manage'), card('🎫', 'Skill & MD packs', 'bundles', 'Bundle tools & workflows for sale.', 'Create pack')]);
  }

  // ── TREASURY: Sparks · reputation · referrals (Reputation + Referrals folded in) ──
  function renderTreasury() {
    var host = document.getElementById('officeTreasury');
    if (!host) return;
    host.innerHTML = section('Treasury', 'Sparks · reputation · referrals · payouts', [card('◆', 'Sparks', 'earned from work', 'Balance 500 · owed pools accruing (cash-out later).', 'Open'), card('✦', 'Reputation', 'verifiable', 'Your score across all surfaces.', 'View'), card('🔗', 'Referrals', 'attribution', 'Your code · reward trail.', 'Open')]) +
      '<div class="oneagent" style="margin-top:16px">Build reputation across surfaces. <b>Sign in</b>, connect your socials, and <b style="color:#22d3ee">share what you make</b> → rep points → later exchange for credits.</div>' +
      section('Reputation · Connect', 'earn rep + verify', [card('𝕏', 'Connect X', 'verify + automate', 'Link your X — later: run a built agent that posts for you (with disclosure).', 'Connect X'), card('🎮', 'Connect Discord', 'community', 'Link Discord for community rep + roles.', 'Connect Discord')]) +
      section('Reputation · Share to earn', 'creations → rep points', [card('🖼', 'Share an image', '+ rep', 'Post an image you made in the dashboard.', 'Share'), card('▣', 'Share a 3D model', '+ rep', 'Show a model you forged.', 'Share'), card('✦', 'Share an agent', '+ rep', 'Showcase a forged agent.', 'Share')]) +
      '<div class="oneagent" style="margin-top:16px">Invite creators. Rewards fire as <b>Sparks + reputation + status perks</b> always; <b class="gate">real-money settlement only on real money</b> (pending pools, no cash-out yet).</div>' +
      section('Referrals · Your link', 'attribution trail', [card('🔗', 'Referral link', 'share it', 'shaddai.app/r/you — every signup + purchase is attributed to you.', 'Copy link'), card('📊', 'Attribution', 'who you brought', 'See your referred users + their activity.', 'View')]) +
      section('Referrals · Rewards', 'the flywheel', [card('◆', 'Sparks earned', 'always fires', 'From any good referral event.', 'Open'), card('💰', 'Revenue pool', 'pending', 'Fills on real-money events; transparent, cash-out later.', 'Details')]);
  }

  // ── PUBLIC API ──
  window.renderOfficeTab = function (tab) {
    try {
      if (tab === 'command') return renderOffice();
      if (tab === 'gallery') return renderGallery();
      if (tab === 'showcase') return renderShowcase();
      if (tab === 'bazaar') return renderBazaar();
      if (tab === 'treasury') return renderTreasury();
    } catch (e) {}
  };
  // Compat shim — old callers jump into the Office tab instead of an overlay.
  window.openCommandTerminal = function (tab) {
    try { if (window.showView) showView('office'); } catch (e) {}
    try { if (window.switchOfficeTab) switchOfficeTab(tab || 'command'); } catch (e) {}
  };

  // If the Office tab is already open at load, hydrate the property manager.
  function boot() {
    try {
      var ov = document.getElementById('officeView');
      if (ov && ov.classList && ov.classList.contains('active')) window.renderOfficeTab('command');
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
