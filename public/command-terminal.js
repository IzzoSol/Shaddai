/* ══════════════════════════════════════════════════════════════════
   SHADDAI — COMMAND TERMINAL  (command-terminal.js)
   ONE dashboard tab. Sub-tabs: Office · Rooms · Forge · Gallery · Showcase
   · Bazaar · Treasury — all one shell, one visual language (cohesion model:
   World → Office → Rooms → Agents → Forge).
     Office  = the REAL 2D world (game.html?embed=office) focused on your
               owned office building (1/user, sign-in to claim).
     Rooms   = live /api/agent-rooms (your rooms inside the office).
     Forge   = your existing 2D Pixel Forge (default) + 3D Hero Forge (Pro).
   Self-contained, null-safe. window.openCommandTerminal(tab).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__commandTerminalV1) return; window.__commandTerminalV1 = true;

  function owner() { try { return (typeof window.opOwner === 'function') ? window.opOwner() : 'guest'; } catch (e) { return 'guest'; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
  function go(v) { try { if (typeof window.showView === 'function') { window.showView(v); close(); } } catch (e) {} }

  function css() {
    if (document.getElementById('shdterm-css')) return;
    var s = document.createElement('style'); s.id = 'shdterm-css';
    s.textContent =
      '#shdterm{position:fixed;inset:0;z-index:100030;display:none;flex-direction:column;background:radial-gradient(90% 60% at 50% -10%,rgba(168,85,247,.15),transparent 60%),#0a0518;color:#efe9ff;font-family:"Chakra Petch",sans-serif}' +
      '#shdterm.on{display:flex}' +
      '#shdterm .top{display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border-bottom:1px solid rgba(168,85,247,.2);gap:12px;flex-wrap:wrap}' +
      '#shdterm .brand{display:flex;align-items:center;gap:10px}#shdterm .sig{color:#a855f7;font-size:18px;text-shadow:0 0 16px rgba(168,85,247,.6)}' +
      '#shdterm .brand b{font-family:"Space Grotesk";font-weight:700;font-size:14px;letter-spacing:.14em}#shdterm .term{font-family:"IBM Plex Mono";font-size:9px;letter-spacing:.2em;color:#9a86c8;text-transform:uppercase}' +
      '#shdterm .chips{display:flex;gap:7px;align-items:center;flex-wrap:wrap}#shdterm .chip{font-family:"IBM Plex Mono";font-size:10px;padding:5px 10px;border:1px solid rgba(168,85,247,.2);border-radius:999px;color:#9a86c8}' +
      '#shdterm .chip.cr{color:#00e5a0;border-color:rgba(0,229,160,.4)}' +
      '#shdterm .ew{font-family:"Space Grotesk";font-weight:700;font-size:12px;padding:7px 13px;border-radius:8px;cursor:pointer;border:1px solid rgba(34,211,238,.5);background:rgba(34,211,238,.1);color:#22d3ee}' +
      '#shdterm .cl{background:none;border:1px solid rgba(168,85,247,.4);color:#9a86c8;border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit}' +
      '#shdterm .tabs{display:flex;gap:2px;padding:8px 12px 0;border-bottom:1px solid rgba(168,85,247,.2);flex-wrap:wrap;background:rgba(10,5,24,.4)}' +
      '#shdterm .tab{font-family:"Space Grotesk";font-weight:700;font-size:12.5px;padding:9px 15px;cursor:pointer;color:#9a86c8;background:none;border:1px solid transparent;border-bottom:none;border-radius:9px 9px 0 0;text-align:left}' +
      '#shdterm .tab:hover{color:#efe9ff}#shdterm .tab.on{color:#efe9ff;background:linear-gradient(180deg,rgba(168,85,247,.16),transparent);border-color:rgba(168,85,247,.2);box-shadow:inset 0 2px 0 #a855f7}' +
      '#shdterm .tab .s{display:block;font-family:"IBM Plex Mono";font-size:8px;color:#9a86c8;text-transform:uppercase;font-weight:400;margin-top:2px}' +
      '#shdterm .stage{flex:1;position:relative;overflow:hidden}#shdterm .pane{position:absolute;inset:0;display:none}#shdterm .pane.on{display:block;overflow:auto}' +
      '#shdterm .pane.office{padding:0}#shdterm .pane.office.on{display:flex}' +
      '#shdterm .ofmap{flex:1;position:relative;min-width:0}#shdterm .ofmap iframe{width:100%;height:100%;border:0;display:block;background:#0a0518}' +
      '#shdterm .cmdp{width:280px;flex:none;border-left:1px solid rgba(168,85,247,.2);background:rgba(16,10,36,.6);padding:15px;overflow:auto}' +
      '#shdterm .cmdp h3{font-family:"Space Grotesk";font-size:14px;margin:0 0 3px}#shdterm .cmdp .st{font-family:"IBM Plex Mono";font-size:10px;color:#00e5a0;margin-bottom:12px}' +
      '#shdterm .stat{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(168,85,247,.1);font-size:12px}#shdterm .stat b{font-family:"Space Grotesk"}#shdterm .stat span{color:#9a86c8}' +
      '#shdterm .claim{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,5,24,.82);backdrop-filter:blur(4px);text-align:center;padding:24px}' +
      '#shdterm .claim h2{font-family:"Space Grotesk";font-size:20px;margin:0 0 6px}#shdterm .claim p{color:#9a86c8;font-size:13px;max-width:380px;margin:0 auto 16px;line-height:1.5}' +
      '#shdterm .claim button{font-family:"Space Grotesk";font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416}' +
      '#shdterm .body{padding:18px 22px}' +
      '#shdterm .rsec{font-family:"Space Grotesk";font-weight:700;font-size:13px;color:#efe9ff;margin:14px 0 10px;display:flex;gap:8px;align-items:center}#shdterm .rsec .c{font-family:"IBM Plex Mono";font-size:9px;color:#9a86c8;border:1px solid rgba(168,85,247,.2);border-radius:999px;padding:2px 8px}' +
      '#shdterm .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px;margin-bottom:6px}' +
      '#shdterm .card{border:1px solid rgba(168,85,247,.2);background:linear-gradient(160deg,rgba(24,16,46,.7),rgba(14,10,26,.5));border-radius:13px;padding:14px;position:relative;transition:.16s}#shdterm .card:hover{transform:translateY(-2px);border-color:rgba(168,85,247,.55)}' +
      '#shdterm .card .hd{display:flex;gap:9px;align-items:center;margin-bottom:7px}#shdterm .card .ic{font-size:19px;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:rgba(168,85,247,.1)}' +
      '#shdterm .card h4{font-family:"Space Grotesk";font-size:14px;margin:0}#shdterm .card .role{font-size:11px;color:#9a86c8}#shdterm .card .d{font-size:11.5px;color:#9a86c8;line-height:1.4;margin:2px 0 10px}' +
      '#shdterm .pub{position:absolute;top:11px;right:11px;font-family:"IBM Plex Mono";font-size:8px;text-transform:uppercase;padding:3px 7px;border-radius:999px}' +
      '#shdterm .pub.public,#shdterm .pub.hireable{color:#0b0416}#shdterm .pub.hireable{background:#00e5a0}#shdterm .pub.public{background:#22d3ee}#shdterm .pub.showroom{color:#22d3ee;border:1px solid #22d3ee}#shdterm .pub.private{color:#9a86c8;border:1px solid rgba(168,85,247,.3)}#shdterm .pub.draft{color:#e8c45c;border:1px solid #e8c45c}' +
      '#shdterm .tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}#shdterm .tag{font-family:"IBM Plex Mono";font-size:9px;text-transform:uppercase;padding:3px 7px;border-radius:6px;border:1px solid rgba(168,85,247,.2);color:#c7b6ef}' +
      '#shdterm .acts{display:flex;gap:6px;flex-wrap:wrap}#shdterm .acts button{flex:1;min-width:56px;font-family:"Chakra Petch";font-weight:600;font-size:11px;padding:7px;border-radius:7px;cursor:pointer;border:1px solid rgba(168,85,247,.2);background:rgba(168,85,247,.07);color:#e7ddff}#shdterm .acts button.pri{background:#a855f7;color:#0b0416;border-color:#a855f7}#shdterm .acts button:hover{filter:brightness(1.12)}' +
      '#shdterm .lanes{display:inline-flex;border:1px solid rgba(168,85,247,.2);border-radius:10px;overflow:hidden;margin-bottom:14px}#shdterm .lanes button{font-family:"Space Grotesk";font-weight:700;font-size:12px;padding:10px 16px;border:none;background:none;color:#9a86c8;cursor:pointer}#shdterm .lanes button.on{background:#a855f7;color:#0b0416}#shdterm .lanes button.adv.on{background:#e8c45c;color:#1a1206}#shdterm .lanes button.adv{color:#e8c45c}' +
      '#shdterm .forgeframe{width:100%;height:calc(100vh - 220px);min-height:420px;border:1px solid rgba(168,85,247,.2);border-radius:12px;background:#0a0518}' +
      '#shdterm .oneagent{font-family:"IBM Plex Mono";font-size:11px;color:#9a86c8;margin-bottom:12px}#shdterm .oneagent b{color:#22d3ee}#shdterm .gate{color:#e8c45c}' +
      '#shdterm .empty{color:#9a86c8;font-size:13px;border:1px dashed rgba(168,85,247,.3);border-radius:12px;padding:20px;text-align:center}';
    document.head.appendChild(s);
  }

  var root, loaded = {};
  var TABS = [
    { id: 'office', label: '◈ Office', sub: 'your property' },
    { id: 'rooms', label: '🚪 Rooms', sub: 'interior modules' },
    { id: 'forge', label: '⬡ Forge', sub: 'embodiments' },
    { id: 'gallery', label: '🖼 Gallery', sub: 'your creations' },
    { id: 'showcase', label: '✦ Showcase', sub: '3D marketplace' },
    { id: 'bazaar', label: '◈ Bazaar', sub: 'storefront' },
    { id: 'reputation', label: '✦ Reputation', sub: 'X · Discord · share' },
    { id: 'referrals', label: '🔗 Referrals', sub: 'links · rewards' },
    { id: 'treasury', label: '◆ Treasury', sub: 'value flow' }
  ];

  function build() {
    css();
    root = document.createElement('div'); root.id = 'shdterm';
    root.innerHTML =
      '<div class="top"><div class="brand"><span class="sig">◈</span><div><b>SHADDAI</b> <span class="term">· Command Terminal</span></div></div>' +
      '<div class="chips"><span class="chip">◷ ONLINE</span><span class="chip cr">◆ 500 CR</span>' +
      '<button class="ew" id="shdtEnter">✦ Enter 2D World →</button><button class="cl" id="shdtClose">✕ Close</button></div></div>' +
      '<div class="tabs">' + TABS.map(function (t) { return '<button class="tab" data-t="' + t.id + '">' + t.label + '<span class="s">' + t.sub + '</span></button>'; }).join('') + '</div>' +
      '<div class="stage">' +
      '<div class="pane office" data-pane="office"><div class="ofmap" id="shdtOfmap"></div><aside class="cmdp" id="shdtCmdp"></aside><div class="claim" id="shdtClaim" style="display:none"></div></div>' +
      '<div class="pane" data-pane="rooms"><div class="body" id="shdtRooms"></div></div>' +
      '<div class="pane" data-pane="forge"><div class="body" id="shdtForge"></div></div>' +
      '<div class="pane" data-pane="gallery"><div class="body" id="shdtGallery"></div></div>' +
      '<div class="pane" data-pane="showcase"><div class="body" id="shdtShowcase"></div></div>' +
      '<div class="pane" data-pane="bazaar"><div class="body" id="shdtBazaar"></div></div>' +
      '<div class="pane" data-pane="reputation"><div class="body" id="shdtReputation"></div></div>' +
      '<div class="pane" data-pane="referrals"><div class="body" id="shdtReferrals"></div></div>' +
      '<div class="pane" data-pane="treasury"><div class="body" id="shdtTreasury"></div></div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('#shdtClose').addEventListener('click', close);
    root.querySelector('#shdtEnter').addEventListener('click', function () { window.location.href = '/_LAUNCH.html'; }); // the good intro + region picker
    root.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.t); }); });
  }

  function showTab(id) {
    root.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.t === id); });
    root.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.dataset.pane === id); });
    if (!loaded[id]) { loaded[id] = true; render(id); }
  }

  function render(id) {
    if (id === 'office') return renderOffice();
    if (id === 'rooms') return renderRooms();
    if (id === 'forge') return renderForge();
    if (id === 'gallery') return renderGallery();
    if (id === 'showcase') return renderShowcase();
    if (id === 'bazaar') return document.getElementById('shdtBazaar').innerHTML = section('Bazaar', 'your public storefront', [card('◈', 'Your services', 'agent hires', 'Buyers pay via credits / x402 — you take the spread.', 'Manage'), card('🎫', 'Skill & MD packs', 'bundles', 'Bundle tools & workflows for sale.', 'Create pack')]);
    if (id === 'reputation') return document.getElementById('shdtReputation').innerHTML =
      '<div class="oneagent">Build reputation across surfaces. <b>Sign in</b>, connect your socials, and <b style="color:#22d3ee">share what you make</b> → rep points → later exchange for credits.</div>' +
      section('Connect', 'earn rep + verify', [card('𝕏', 'Connect X', 'verify + automate', 'Link your X — later: run a built agent that posts for you (with disclosure).', 'Connect X'), card('🎮', 'Connect Discord', 'community', 'Link Discord for community rep + roles.', 'Connect Discord')]) +
      section('Share to earn', 'creations → rep points', [card('🖼', 'Share an image', '+ rep', 'Post an image you made in the dashboard.', 'Share'), card('▣', 'Share a 3D model', '+ rep', 'Show a model you forged.', 'Share'), card('✦', 'Share an agent', '+ rep', 'Showcase a forged agent.', 'Share')]) +
      section('Your reputation', 'utility only', [card('◆', 'Rep → Credits', 'exchange', 'Convert reputation points into platform credits.', 'Exchange')]);
    if (id === 'referrals') return document.getElementById('shdtReferrals').innerHTML =
      '<div class="oneagent">Invite creators. Rewards fire as <b>Sparks + reputation + status perks</b> always; <b class="gate">real-money settlement only on real money</b> (pending pools, no cash-out yet).</div>' +
      section('Your link', 'attribution trail', [card('🔗', 'Referral link', 'share it', 'shaddai.app/r/you — every signup + purchase is attributed to you.', 'Copy link'), card('📊', 'Attribution', 'who you brought', 'See your referred users + their activity.', 'View')]) +
      section('Rewards', 'the flywheel', [card('◆', 'Sparks earned', 'always fires', 'From any good referral event.', 'Open'), card('💰', 'Revenue pool', 'pending', 'Fills on real-money events; transparent, cash-out later.', 'Details')]);
    if (id === 'treasury') return document.getElementById('shdtTreasury').innerHTML = section('Treasury', 'Sparks · reputation · referrals · payouts', [card('◆', 'Sparks', 'earned from work', 'Balance 500 · owed pools accruing (cash-out later).', 'Open'), card('✦', 'Reputation', 'verifiable', 'Your score across all surfaces.', 'View'), card('🔗', 'Referrals', 'attribution', 'Your code · reward trail.', 'Open')]);
  }

  // ── OFFICE: the real 2D world focused on your owned office building ──
  function renderOffice() {
    var claim = document.getElementById('shdtClaim'), cmdp = document.getElementById('shdtCmdp');
    fetch('/api/office').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.needSignIn) {
        claim.style.display = ''; claim.innerHTML = '<div><h2>Claim your office</h2><p>Sign in to create your one office — a building you own in SHADDAI City, with your agents\' rooms inside.</p><button id="shdtSignIn">Sign in →</button></div>';
        claim.querySelector('#shdtSignIn').onclick = function () { try { if (window.shdSignIn) window.shdSignIn(); } catch (e) {} };
        return;
      }
      if (d && d.canClaim) {
        claim.style.display = ''; claim.innerHTML = '<div><h2>Claim your office</h2><p>Create your one office property in SHADDAI City. Your forged agents will get rooms inside it.</p><button id="shdtClaimBtn">◈ Claim my office</button></div>';
        claim.querySelector('#shdtClaimBtn').onclick = function () {
          this.textContent = 'Claiming…';
          fetch('/api/office/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(function (r) { return r.json(); }).then(function () { loaded.office = false; renderOffice(); });
        };
        return;
      }
      claim.style.display = 'none';
      var o = (d && d.office) || {}, sm = (d && d.summary) || {};
      // load the REAL world focused on the office (exact match — it IS the world).
      // Pass uid so the city warps you to YOUR office (emerald "Source") on Founders' Row.
      var ofsrc = '/game.html?embed=office' + (o.ownerUserId ? '&uid=' + encodeURIComponent(o.ownerUserId) : '');
      document.getElementById('shdtOfmap').innerHTML = '<iframe src="' + ofsrc + '" title="Your office in SHADDAI City" allow="autoplay"></iframe>';
      window.__shdtOfSrc = ofsrc;
      cmdp.innerHTML = '<h3>' + esc(o.name || 'My Command Office') + '</h3><div class="st">◈ SHADDAI City · ' + esc((o.visibility || 'private').replace('-', ' ')) + '</div>' +
        '<div class="stat"><span>Rooms</span><b>' + (sm.rooms || 0) + '</b></div>' +
        '<div class="stat"><span>Agents</span><b>' + (sm.agents || 0) + '</b></div>' +
        '<div class="stat"><span>Public rooms</span><b>' + (sm.public || 0) + '</b></div>' +
        '<div class="stat"><span>Hireable</span><b>' + (sm.hireable || 0) + '</b></div>' +
        '<div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:7px">' +
        '<button class="cl" onclick="openCommandTerminal(\'rooms\')">🚪 Rooms</button><button class="cl" onclick="openCommandTerminal(\'forge\')">⬡ Forge</button>' +
        '<button class="cl" onclick="openCommandTerminal(\'bazaar\')">◈ Bazaar</button><button class="cl" onclick="openCommandTerminal(\'treasury\')">◆ Treasury</button></div>' +
        '<button class="cl" style="margin-top:7px;width:100%" onclick="window.open((window.__shdtOfSrc||\'/game.html?embed=office\'),\'_blank\')">⛶ Enter SHADDAI City (full screen)</button>' +
        '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:#9a86c8;margin-top:14px;line-height:1.5">This is your office — the same place lives in the shared 2D world. Others can visit by permission.</div>';
    }).catch(function () { document.getElementById('shdtOfmap').innerHTML = '<iframe src="/game.html?embed=office"></iframe>'; });
  }

  function visClass(v) { return { 'private': 'private', 'public-showroom': 'showroom', 'hireable-studio': 'hireable' }[v] || 'private'; }
  function card(ic, name, role, d, act, pub) {
    return '<div class="card">' + (pub ? '<span class="pub ' + pub[0] + '">' + esc(pub[1]) + '</span>' : '') +
      '<div class="hd"><span class="ic">' + ic + '</span><div><h4>' + esc(name) + '</h4><div class="role">' + esc(role) + '</div></div></div>' +
      '<div class="d">' + esc(d) + '</div><div class="acts"><button class="pri">' + esc(act) + '</button></div></div>';
  }
  function section(title, sub, cards) { return '<div class="rsec">' + esc(title) + ' <span class="c">' + esc(sub) + '</span></div><div class="grid">' + cards.join('') + '</div>'; }

  // ── ROOMS: live from /api/agent-rooms ──
  function renderRooms() {
    var host = document.getElementById('shdtRooms');
    host.innerHTML = '<div class="rsec">Permanent Modules <span class="c">office infrastructure</span></div><div class="grid">' +
      card('☰', 'Command Sanctum', 'HQ · the 7 core agents', 'Your headquarters — the seven system agents.', 'Enter', ['public', 'public']) +
      card('⬡', 'Pixel Forge', 'world embodiments', 'Create & update your 2D world-facing agents.', 'Open', null) +
      card('◈', 'Bazaar', 'storefront', 'Showcase & sell — credits / x402.', 'Open', ['showroom', 'showroom']) +
      card('◆', 'Treasury', 'value flow', 'Sparks · reputation · referrals.', 'Open', ['private', 'private']) +
      card('🏆', 'Achievements', 'wins & impact', 'Your verified wall of wins.', 'Open', ['public', 'public']) +
      '</div><div class="rsec">Agent Rooms <span class="c">forged operatives</span></div><div class="grid" id="shdtAgentRooms"><div class="empty">Loading…</div></div>';
    var ah = document.getElementById('shdtAgentRooms');
    fetch('/api/agent-rooms?owner=' + encodeURIComponent(owner())).then(function (r) { return r.json(); }).then(function (d) {
      var rooms = (d && d.rooms) || [];
      if (!rooms.length) { ah.innerHTML = '<div class="empty">No agent rooms yet. Forge an agent in the <b style="color:#22d3ee">Pixel Forge</b> and it claims a room.</div>'; return; }
      ah.innerHTML = rooms.map(function (r) {
        var a = r.agent || {}, room = r.room || {}, vis = (r.permissions && r.permissions.visibility) || 'private', vc = visClass(vis);
        return '<div class="card"><span class="pub ' + vc + '">' + esc(vis.replace('-', ' ')) + '</span>' +
          '<div class="hd"><span class="ic" style="color:' + esc(a.badgeColor || '#22d3ee') + '">✦</span><div><h4>' + esc(room.title || a.name || 'Room') + '</h4><div class="role">' + esc(a.archetype || 'operative') + '</div></div></div>' +
          '<div class="d">' + esc((a.tools || []).slice(0, 3).join(' · ') || 'no tools') + (a.stats && a.stats.reputation != null ? ' · rep ' + a.stats.reputation : '') + '</div>' +
          '<div class="tags"><span class="tag">' + esc(room.roomType || 'office') + '</span></div>' +
          '<div class="acts"><button class="pri" onclick="try{openCommandTerminal;window.openAgentRoom&&openAgentRoom(\'' + esc(a.id) + '\')}catch(e){}">Enter</button></div></div>';
      }).join('');
    }).catch(function () { ah.innerHTML = '<div class="empty">Rooms unavailable.</div>'; });
  }

  // ── FORGE: your existing 2D Pixel Forge (default) + 3D Hero Forge (Pro) ──
  function renderForge() {
    var host = document.getElementById('shdtForge');
    host.innerHTML =
      '<div class="oneagent"><b>One agent, two embodiments.</b> Pixel Forge edits the agent\'s <b>pixel2D</b> body (office & 2D world). 3D Forge edits the same agent\'s <b>hero3D</b> form. <span class="gate">Make for yourself free — placing in office/world needs an upgrade.</span></div>' +
      '<div class="lanes"><button class="on" id="shdtLanePixel">◧ 2D Pixel Forge</button><button class="adv" id="shdtLane3d">▣ 3D Hero Forge · Pro</button></div>' +
      '<div id="shdtForgeFrameWrap"><iframe class="forgeframe" id="shdtForgeFrame" src="/pixel-forge.html" title="Pixel Forge"></iframe></div>';
    var lp = document.getElementById('shdtLanePixel'), l3 = document.getElementById('shdtLane3d'), fr = document.getElementById('shdtForgeFrame');
    lp.onclick = function () { lp.classList.add('on'); l3.classList.remove('on'); fr.src = '/pixel-forge.html'; };
    l3.onclick = function () { l3.classList.add('on'); lp.classList.remove('on'); fr.src = '/forge.html'; };
  }

  // ── GALLERY: your pixel agents (+ 3D models placeholder) ──
  function renderGallery() {
    var host = document.getElementById('shdtGallery');
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
    document.getElementById('shdtShowcase').innerHTML =
      '<div class="oneagent">Community <b class="gate">3D model marketplace</b> — Meshy, three.js & more. Buy for <b style="color:#00e5a0">personal / game use</b>; office/world placement needs an upgrade.</div>' +
      '<div class="rsec">Featured 3D models <span class="c">community</span></div><div class="grid">' +
      card('▣', 'Neon Valkyrie', 'by @emeraldog · Meshy', 'Rigged hero · 7 anims · personal/game use.', 'Buy · 45 CR', ['public', '45 CR']) +
      card('◈', 'Obsidian Sentinel', 'by @nexus · three.js', 'Procedural mech · low-poly.', 'Buy · 30 CR', ['public', '30 CR']) +
      card('✦', 'Grid Drone', 'by @turtle · three.js', 'Community freebie · personal use.', 'Get · free', ['public', 'free']) +
      card('＋', 'List your model', 'sell to community', 'Publish a Meshy/three.js model · earn Sparks.', 'Publish model', null) + '</div>';
  }

  window.openCommandTerminal = function (tab) {
    if (!root) build();
    root.classList.add('on'); document.body.style.overflow = 'hidden';
    showTab(tab && TABS.some(function (t) { return t.id === tab; }) ? tab : 'office');
  };
  function close() { if (root) root.classList.remove('on'); document.body.style.overflow = ''; }

  // Collapse the scattered Office / Rooms / Forge navs into this ONE terminal tab.
  function wireNav() {
    try {
      document.querySelectorAll('button,a').forEach(function (b) {
        var t = (b.textContent || '').trim(), oc = b.getAttribute('onclick') || '';
        if (/showView\('office'\)/.test(oc)) b.setAttribute('onclick', "openCommandTerminal('office')");
        else if (/openRoomsManager/.test(oc) || (/^(\W*\s*)?Rooms\b/i.test(t) && /marketplace|showView/.test(oc))) b.setAttribute('onclick', "openCommandTerminal('rooms')");
        else if (/showView\('forge'\)/.test(oc)) b.setAttribute('onclick', "openCommandTerminal('forge')");
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireNav); else wireNav();
  setTimeout(wireNav, 1600);
})();
