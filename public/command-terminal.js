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

  // ── THEME SWITCHER — the SAME 6 dashboard skins, so this one control restyles
  //    both the Command Terminal accent AND the whole dashboard (via setThemeSkin). ──
  var THEMES = {
    glitch: { a: '#00ff88', g: '0,255,136' },
    terminal: { a: '#00ff41', g: '0,255,65' },
    brutalist: { a: '#f5c000', g: '245,192,0' },
    serif: { a: '#3a6b4a', g: '58,107,74' },
    void: { a: '#e8e8e8', g: '232,232,232' },
    amber: { a: '#ffb000', g: '255,176,0' }
  };
  function applyTheme(k) {
    var t = THEMES[k] || THEMES.glitch;
    try { if (window.setThemeSkin) window.setThemeSkin(k); } catch (e) {}
    var st = document.getElementById('shdterm-theme');
    if (!st) { st = document.createElement('style'); st.id = 'shdterm-theme'; document.head.appendChild(st); }
    st.textContent =
      '#shdterm{background:radial-gradient(90% 60% at 50% -10%,rgba(' + t.g + ',.15),transparent 60%),#0a0518}' +
      '#shdterm .sig{color:' + t.a + ';text-shadow:0 0 16px rgba(' + t.g + ',.6)}' +
      '#shdterm .top,#shdterm .tabs{border-color:rgba(' + t.g + ',.2)}' +
      '#shdterm .tab.on{background:linear-gradient(180deg,rgba(' + t.g + ',.16),transparent);border-color:rgba(' + t.g + ',.2);box-shadow:inset 0 2px 0 ' + t.a + '}' +
      '#shdterm .card:hover{border-color:rgba(' + t.g + ',.55)}' +
      '#shdterm .acts button.pri,#shdterm .lanes button.on{background:' + t.a + ';border-color:' + t.a + '}' +
      '#shdterm #shdCmdHubBtn{color:' + t.a + ' !important;border-color:rgba(' + t.g + ',.55) !important}' +
      '#shdterm .claim button{background:linear-gradient(100deg,' + t.a + ',#22d3ee)}';
    try { localStorage.setItem('shd_theme_skin', k); } catch (e) {}
    var hub = document.getElementById('shdCmdHubBtn'); if (hub) { hub.style.color = t.a; hub.style.borderColor = 'rgba(' + t.g + ',.55)'; }
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
      '<select class="cl" id="shdtTheme" title="Theme — restyles the whole dashboard" style="cursor:pointer;font-family:inherit"><option value="glitch">◈ Neon Glitch</option><option value="terminal">◈ Terminal</option><option value="brutalist">◈ Brutalist</option><option value="serif">◈ Serif</option><option value="void">◈ Void</option><option value="amber">◈ Amber</option></select>' +
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
    var savedTheme = 'glitch'; try { savedTheme = localStorage.getItem('shd_theme_skin') || 'glitch'; } catch (e) {}
    var themeSel = root.querySelector('#shdtTheme'); if (themeSel) { themeSel.value = savedTheme; themeSel.addEventListener('change', function () { applyTheme(themeSel.value); }); }
    applyTheme(savedTheme);
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
      claim.style.display = 'none';
      var o = (d && d.office) || {}, sm = (d && d.summary) || {};
      // canClaim = you don't have an office yet. Don't create one automatically (keeps
      // Founders' Row empty until people actually set up). Show the full editor as an
      // UNCLAIMED preview — naming a lot / Save is what actually claims it.
      paintOffice(o, sm, !!(d && d.canClaim));
    }).catch(function () { var m = document.getElementById('shdtOfmap'); if (m) m.innerHTML = '<div class="empty" style="margin:24px">Office unavailable — try again.</div>'; });
  }

  // The office is ONLY your office — a customizable space, persistent to your lot in
  // the real game. No city/game engine is loaded inline (that opened the whole city).
  // ensureOffice: for an UNCLAIMED preview, actually create the office on first real action
  // (Save or lot-pick), then run cb. For an already-claimed office it just runs cb.
  function ensureOffice(unclaimed, cb) {
    if (!unclaimed) return cb();
    fetch('/api/office/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(function (r) { return r.json(); }).then(function () { cb(); }).catch(function () { cb(); });
  }
  function paintOffice(o, sm, unclaimed) {
    var map = document.getElementById('shdtOfmap'), cmdp = document.getElementById('shdtCmdp');
    var uidq = ''; try { var _u = o.ownerUserId || localStorage.getItem('shd_userid') || ''; if (_u) uidq = '&uid=' + encodeURIComponent(_u); } catch (e) {}
    // VISUAL office — the office-only walkable 2D view (forged agents + pixel citizens walk
    // it). Office-only embed, not the whole city. For an unclaimed preview we show a soft
    // prompt instead of a live office.
    var visual = unclaimed
      ? '<div style="height:300px;display:grid;place-items:center;border-radius:12px;border:1px dashed rgba(34,211,238,.35);background:radial-gradient(120% 90% at 50% 10%,rgba(34,211,238,.10),rgba(8,4,18,.6));color:#8fd9e8;font-size:13px;text-align:center;margin-bottom:14px">Your walkable office appears here once you set it up.<br><span style="opacity:.7;font-size:11px">Name it &amp; pick a lot below.</span></div>'
      : '<div style="position:relative;height:340px;border-radius:12px;overflow:hidden;border:1px solid rgba(168,85,247,.28);margin-bottom:14px;background:#0a0518"><iframe src="/game.html?embed=office&walk=1' + uidq + '" title="Your office" style="width:100%;height:100%;border:0;display:block" loading="lazy"></iframe></div>';
    map.innerHTML = '<div id="shdtOfMgr" style="flex:1;overflow:auto;padding:18px 22px">' + visual +
      (unclaimed
        ? '<div class="oneagent" style="border-color:rgba(34,211,238,.4)"><b>Set up your office.</b> Name it, choose who can visit, and pick an open lot in SHADDAI City — it\'s claimed the moment you <b>Save</b> or pick a lot. Nothing exists until you do. <span class="gate">3D-world office comes later.</span></div>'
        : '<div class="oneagent"><b>Your office.</b> Pick a look, name it, choose who can visit, and set up on an open lot in SHADDAI City. This is the <b>same office</b> people find in the game. <span class="gate">3D-world office comes later.</span></div>') +
      '<div class="rsec">Identity <span class="c">name · who can visit</span></div>' +
      '<div class="card" style="padding:15px"><div style="display:grid;gap:10px">' +
      '<label style="font-size:11px;color:#9a86c8">Office name<input id="shdtOfName" maxlength="48" value="' + esc(o.name || 'My Command Office') + '" style="width:100%;margin-top:5px;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:8px;color:#efe9ff;padding:9px 11px;font-family:inherit;font-size:13px"></label>' +
      '<label style="font-size:11px;color:#9a86c8">Who can visit<select id="shdtOfVis" style="width:100%;margin-top:5px;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.3);border-radius:8px;color:#efe9ff;padding:9px 11px;font-family:inherit;font-size:13px">' +
      ['private', 'public-showroom', 'hireable-studio'].map(function (v) { return '<option value="' + v + '"' + (o.visibility === v ? ' selected' : '') + '>' + v.replace('-', ' ') + '</option>'; }).join('') + '</select></label>' +
      '<button class="pri" id="shdtOfSave" style="justify-self:start;font-family:\'Chakra Petch\';font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#a855f7;color:#0b0416;cursor:pointer">Save office</button>' +
      '</div></div>' +
      '<div class="rsec">Your lot <span class="c">Founders\' Row · pick an open lot to set up / switch</span></div><div class="grid" id="shdtOfLots" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"><div class="empty">Loading…</div></div>' +
      '</div>';
    // side summary + visit-in-game (opens FULL — never embedded)
    cmdp.innerHTML = '<h3>' + esc(o.name || 'My Command Office') + '</h3><div class="st">◈ SHADDAI City · lot #' + ((o.slot != null ? o.slot : 0) + 1) + ' · ' + esc((o.visibility || 'private').replace('-', ' ')) + '</div>' +
      '<div class="stat"><span>Rooms</span><b>' + (sm.rooms || 0) + '</b></div>' +
      '<div class="stat"><span>Agents</span><b>' + (sm.agents || 0) + '</b></div>' +
      '<div class="stat"><span>Public rooms</span><b>' + (sm.public || 0) + '</b></div>' +
      '<div class="stat"><span>Hireable</span><b>' + (sm.hireable || 0) + '</b></div>' +
      '<button class="cl" style="margin-top:14px;width:100%" onclick="window.open(\'/game.html?embed=office&walk=1' + (o.ownerUserId ? '&uid=' + encodeURIComponent(o.ownerUserId) : '') + '\',\'_blank\')">◈ Enter & walk your office →</button>' +
      '<button class="cl" style="margin-top:7px;width:100%" onclick="window.open(\'/game.html?embed=office' + (o.ownerUserId ? '&uid=' + encodeURIComponent(o.ownerUserId) : '') + '\',\'_blank\')">◇ View from the city</button>' +
      '<div style="margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:7px">' +
      '<button class="cl" onclick="openCommandTerminal(\'rooms\')">Rooms</button><button class="cl" onclick="openCommandTerminal(\'forge\')">Forge</button></div>' +
      '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:#9a86c8;margin-top:14px;line-height:1.5">Your office is persistent — the same lot shows up in the shared 2D game. Others visit by permission.</div>';
    // load lots
    Promise.all([
      fetch('/api/office/lots').then(function (r) { return r.json(); }).catch(function () { return { lots: [] }; })
    ]).then(function (res) {
      var lots = (res[0] && res[0].lots) || [];
      var le = document.getElementById('shdtOfLots');
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
              .then(function (r) { return r.json(); }).then(function (d) { if (d && d.error) { try { if (window.notify) notify('Lot ' + d.error); } catch (e) {} return; } loaded.office = false; renderOffice(); });
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
        patchOffice({ name: name, visibility: vis }, function () { loaded.office = false; renderOffice(); });
      });
    });
  }
  function patchOffice(body, done) {
    fetch('/api/office', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function () { if (done) done(); }).catch(function () { if (done) done(); });
  }

  function visClass(v) { return { 'private': 'private', 'public-showroom': 'showroom', 'hireable-studio': 'hireable' }[v] || 'private'; }
  function card(ic, name, role, d, act, pub) {
    return '<div class="card">' + (pub ? '<span class="pub ' + pub[0] + '">' + esc(pub[1]) + '</span>' : '') +
      '<div class="hd"><span class="ic">' + ic + '</span><div><h4>' + esc(name) + '</h4><div class="role">' + esc(role) + '</div></div></div>' +
      '<div class="d">' + esc(d) + '</div><div class="acts"><button class="pri">' + esc(act) + '</button></div></div>';
  }
  function section(title, sub, cards) { return '<div class="rsec">' + esc(title) + ' <span class="c">' + esc(sub) + '</span></div><div class="grid">' + cards.join('') + '</div>'; }

  // Walkable pixel-room presets — pick one as your room, or step in and walk it.
  var ROOM_PRESETS = [
    { id: 'loft',    ic: '◈', name: 'Command Loft',  tag: 'sleek deck',    d: 'Open emerald command deck with a wide desk + wall screens.' },
    { id: 'studio',  ic: '⬡', name: 'Creator Studio', tag: 'maker space',   d: 'Bright studio — easels, capture rig, gallery wall.' },
    { id: 'lab',     ic: '⚗', name: 'The Lab',        tag: 'research bay',  d: 'Phosphor-green ops bay with terminals + server racks.' },
    { id: 'lounge',  ic: '☕', name: 'The Lounge',     tag: 'social room',   d: 'Warm hangout — sofas, plants, a low table.' },
    { id: 'archive', ic: '📚', name: 'The Archive',    tag: 'library',      d: 'Quiet stacks, reading desk, codex shelves.' }
  ];
  window.shdtRoomView = function (id) {
    // "walk it" — open the walkable office view in the game with the chosen room style.
    var uid = ''; try { uid = localStorage.getItem('shd_userid') || ''; } catch (e) {}
    window.open('/game.html?embed=office&walk=1&room=' + encodeURIComponent(id) + (uid ? '&uid=' + encodeURIComponent(uid) : ''), '_blank');
  };
  window.shdtRoomCreate = function (id) {
    try { localStorage.setItem('shaddai.room', id); } catch (e) {}
    try { if (window.notify) notify('Room set — “' + id + '”. Step in with View to walk it.'); } catch (e) {}
    renderRooms();
  };

  // ── ROOMS: create/view walkable presets + live agent rooms ──
  function renderRooms() {
    var host = document.getElementById('shdtRooms');
    var cur = ''; try { cur = localStorage.getItem('shaddai.room') || ''; } catch (e) {}
    var presetGrid = '<div class="rsec">Your room <span class="c">create · view (walkable presets)</span></div><div class="grid">' +
      ROOM_PRESETS.map(function (p) {
        var inUse = cur === p.id;
        return '<div class="card" style="border-color:' + (inUse ? '#00e5a0' : 'rgba(168,85,247,.2)') + '">' +
          (inUse ? '<span class="pub public" style="background:#00e5a0">in use</span>' : '') +
          '<div class="hd"><span class="ic" style="color:#22d3ee">' + p.ic + '</span><div><h4>' + esc(p.name) + '</h4><div class="role">' + esc(p.tag) + '</div></div></div>' +
          '<div class="d">' + esc(p.d) + '</div>' +
          '<div class="acts"><button class="pri" onclick="shdtRoomView(\'' + p.id + '\')">◈ View (walk)</button>' +
          '<button class="cl" onclick="shdtRoomCreate(\'' + p.id + '\')">' + (inUse ? 'Selected' : 'Use this room') + '</button></div></div>';
      }).join('') + '</div>';
    host.innerHTML = presetGrid +
      '<div class="rsec">Permanent Modules <span class="c">office infrastructure</span></div><div class="grid">' +
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

  // ── FORGE: Create · Embed · Earn. Only "make model" (credits) — COMING SOON until
  //    the pipeline is fixed — plus presets. No 3D-world access to these yet. ──
  function renderForge() {
    var host = document.getElementById('shdtForge');
    var presets = [
      { ic: '◈', name: 'TURTLE — Emerald Enforcer', tag: 'rigged · 7 anims', d: 'Green enforcer with ball-and-chain flail.', id: 'turtle' },
      { ic: '◈', name: 'ZEROX — Neon Valkyrie', tag: 'rigged · 7 anims', d: 'Cyan katana valkyrie.', id: 'zerox' },
      { ic: '◈', name: 'PIKADON — Crimson Sentinel', tag: 'rigged · combat', d: 'Heavy guardian sentinel.', id: 'pikadon' },
      { ic: '◈', name: 'ORACLE — Astral Seer', tag: 'rigged', d: 'Robed cosmic seer.', id: 'oracle' }
    ];
    var embed = '<script src="https://shaddai.app/agent-3d.js"><\/script>\n<agent-3d id="your-agent-id"><\/agent-3d>';
    host.innerHTML =
      '<div class="oneagent"><b>The Forge.</b> A 3D AI agent you can build, embed anywhere, and earn from. <span class="gate">Open beta — model-making runs on credits; keep 100% of earnings.</span></div>' +
      // The ACTUAL working forges — restored (open the real tools)
      '<div class="rsec">Open the forge <span class="c">build your agent now</span></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' +
      '<div class="card"><div class="hd"><span class="ic">◧</span><div><h4>2D Pixel Forge</h4><div class="role">pixel agent · office + 2D world</div></div></div><div class="d">Design a pixel agent — color, body, tools, name — and drop it into the 2D world.</div><div class="acts"><button class="pri" onclick="window.open(\'/pixel-forge.html\',\'_blank\')">Open Pixel Forge →</button></div></div>' +
      '<div class="card"><div class="hd"><span class="ic">▣</span><div><h4>3D Forge</h4><div class="role">3D hero form</div></div></div><div class="d">Build or preview a 3D agent model for the 3D world.</div><div class="acts"><button class="pri" onclick="window.open(\'/forge.html\',\'_blank\')">Open 3D Forge →</button></div></div>' +
      '</div>' +
      // 01 BUILD
      '<div class="card" style="padding:16px;margin-bottom:12px"><div class="hd"><span class="ic">01</span><div><h4>Build</h4><div class="role">Prompt to agent in 60 seconds</div></div></div>' +
        '<div class="d">Type a description, snap a selfie, or upload a GLB. Add a personality prompt, pick a voice, wire up your AI. Publish to the marketplace or keep it private.</div>' +
        '<div class="acts" style="margin-top:10px"><button class="pri" id="shdtForgeNotify">Start building</button> <span class="pub draft" style="position:static;align-self:center">coming soon</span></div></div>' +
      // 02 EMBED
      '<div class="card" style="padding:16px;margin-bottom:12px"><div class="hd"><span class="ic">02</span><div><h4>Embed</h4><div class="role">Two lines. Any page.</div></div></div>' +
        '<div class="d">Drop <b style="color:#22d3ee">&lt;agent-3d&gt;</b> into any page — React, Vue, Svelte, plain HTML. Voice, memory, animation and payments built-in. Lazy-loaded by default.</div>' +
        '<pre style="margin:10px 0 0;background:rgba(8,4,18,.7);border:1px solid rgba(168,85,247,.25);border-radius:9px;padding:11px 13px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#c7b6ef;white-space:pre-wrap;overflow:auto">' + esc(embed) + '</pre>' +
        '<div class="acts" style="margin-top:10px"><button class="pri" id="shdtForgeCopy">Copy snippet</button> <button class="cl" id="shdtForgeDocs">Read the docs</button></div></div>' +
      // 03 EARN
      '<div class="card" style="padding:16px;margin-bottom:6px"><div class="hd"><span class="ic">03</span><div><h4>Earn</h4><div class="role">Charge per chat. Keep everything.</div></div></div>' +
        '<div style="font-family:\'Space Grotesk\';font-weight:800;font-size:30px;color:#00e5a0;line-height:1;margin:4px 0 2px">$128.40</div><div style="font-family:\'IBM Plex Mono\';font-size:10px;color:#9a86c8;margin-bottom:9px">example earnings · USDC</div>' +
        '<div class="d">Gate skills behind pay-per-call micropayments (USDC via x402). Keep <b style="color:#00e5a0">100% during open beta</b>. Watch earnings flow in real time from your dashboard.</div></div>' +
      // PRESETS
      '<div class="rsec">Ready-made presets <span class="c">use one now · 3D-world access opening later</span></div>' +
      '<div class="grid">' + presets.map(function (p) {
        return '<div class="card" data-preset="' + esc(p.id) + '"><span class="pub public">preset</span><div class="hd"><span class="ic">' + p.ic + '</span><div><h4>' + esc(p.name) + '</h4><div class="role">' + esc(p.tag) + '</div></div></div><div class="d">' + esc(p.d) + '</div><div class="acts"><button class="pri">Use this agent</button></div></div>';
      }).join('') + '</div>';
    var cpy = document.getElementById('shdtForgeCopy');
    if (cpy) cpy.addEventListener('click', function () { try { navigator.clipboard.writeText(embed); if (window.notify) notify('Embed snippet copied'); } catch (e) {} });
    var dcs = document.getElementById('shdtForgeDocs');
    if (dcs) dcs.addEventListener('click', function () { try { if (window.notify) notify('Docs coming with the beta.'); } catch (e) {} });
    var nb = document.getElementById('shdtForgeNotify');
    if (nb) nb.addEventListener('click', function () {
      if (window.SHDFree) { SHDFree.gate('forge', { label: '3D agent forge', hookMsg: 'The 3D agent forge is almost ready — <b style="color:#fff">sign in and we\'ll open it to you first</b>.', onAllowed: function () { try { if (window.notify) notify('You\'re on the list — we\'ll notify you when the Forge opens.'); } catch (e) {} } }); }
      else { try { if (window.notify) notify('You\'re on the list — we\'ll notify you when the Forge opens.'); } catch (e) {} }
    });
    host.querySelectorAll('.card[data-preset]').forEach(function (c) {
      c.querySelector('button').addEventListener('click', function () {
        try { localStorage.setItem('shaddai.preset', c.getAttribute('data-preset')); } catch (e) {}
        try { if (window.notify) notify('Preset selected — 3D-world access opens soon.'); } catch (e) {}
      });
    });
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

  // Collapse ONLY the scattered Office / Rooms / Forge navs into one Command Hub
  // button. Every other dashboard button stays exactly where it is.
  function consolidateNav() {
    try {
      document.querySelectorAll('button,a').forEach(function (b) {
        if (b.id === 'shdCmdHubBtn' || b.id === 'shdCmdHubSb') return;
        var oc = b.getAttribute('onclick') || '', t = (b.textContent || '').trim();
        var isOffice = /showView\('office'\)/.test(oc);
        var isForge = /showView\('forge'\)/.test(oc);
        var isRooms = /openRoomsManager/.test(oc) || /showView\('marketplace'\)/.test(oc);
        if (isOffice || isForge || isRooms) { b.style.display = 'none'; b.setAttribute('data-shd-consolidated', '1'); }
      });
      var anchor = document.querySelector('.nav-btn');
      if (anchor && anchor.parentNode && !document.getElementById('shdCmdHubBtn')) {
        var btn = document.createElement('button');
        btn.id = 'shdCmdHubBtn'; btn.className = 'nav-btn';
        btn.style.cssText = 'color:#a855f7;font-weight:700;border-color:rgba(168,85,247,.55)';
        btn.textContent = '◈ Command Hub';
        btn.onclick = function () { openCommandTerminal('office'); };
        anchor.parentNode.insertBefore(btn, anchor);
      }
      var sb = document.querySelector('.sbt');
      if (sb && sb.parentNode && !document.getElementById('shdCmdHubSb')) {
        var sbtn = document.createElement('button');
        sbtn.id = 'shdCmdHubSb'; sbtn.className = 'sbt'; sbtn.style.color = '#a855f7';
        sbtn.innerHTML = '<span class="ic">◈</span>Command Hub';
        sbtn.onclick = function () { openCommandTerminal('office'); };
        sb.parentNode.insertBefore(sbtn, sb);
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', consolidateNav); else consolidateNav();
  setTimeout(consolidateNav, 1600);

  // Any lingering call to the OLD consolidated views (office/forge/rooms) now routes
  // into the Command Hub instead of rendering a stale view — the office one pinged
  // dead local agent ports (8000-8003) and forge rendered empty. One clean entry.
  function wrapShowView() {
    if (window.__shdSvWrapped || typeof window.showView !== 'function') return;
    window.__shdSvWrapped = true;
    var _sv = window.showView;
    window.showView = function (v) {
      if (v === 'office' || v === 'forge' || v === 'marketplace') {
        try { return window.openCommandTerminal(v === 'marketplace' ? 'rooms' : v); } catch (e) {}
      }
      return _sv.apply(this, arguments);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapShowView); else wrapShowView();
  setTimeout(wrapShowView, 1200);
})();
