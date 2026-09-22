/* game-fun.js — gameplay upgrade layer for game.html (loaded via defer before </body></html>).
   Adds: real stat points (HP/Attack/Speed/Charm), a pet companion, kill-combo XP,
   a working restHere (full heal + XP), and a togglable world minimap.
   Persistence: localStorage "shaddai.progression".
   Everything is additive + defensive — if any part fails it degrades silently.
   The user's forged pixel character finally matters: stats change how the game plays. */
(function () {
  if (window.__gfLoaded) return; window.__gfLoaded = true;
  var PET_EMOJI = ['🦊', '🌙', '💎', '✨'];
  var PET_COLOR = ['#ffcf5a', '#7fe0ff', '#7fffd0', '#ff9ad5'];
  var PET_NAME = ['Fennec', 'Moth', 'Gemkin', 'Starlit'];
  var STAT_LABEL = {
    hp: ['❤', 'Vitality', '+15 max HP'],
    atk: ['⚔️', 'Might', '+12% attack power'],
    spd: ['💨', 'Swiftness', '+8% move speed'],
    chr: ['✨', 'Charm', '+10% XP earned']
  };
  var PROG_KEY = 'shaddai.progression';
  var PROG = readProg();
  var G_PET = { col: 0, row: 0 };
  var BRIDGE_KEY = 'shaddai.bridge';
  var MONO = null;
  var gfGateNear = false;
  var HUNT = { n: 5, cells: null, used: 0 };

  // ---- persistence ----
  function readProg() {
    var base = { stats: { hp: 0, atk: 0, spd: 0, chr: 0 }, pts: 0, pet: -1, bestCombo: 0, map: false, adopted: false, hunt: null };
    try {
      var r = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
      Object.keys(base).forEach(function (k) { if (r[k] !== undefined) base[k] = r[k]; });
      if (!base.stats || typeof base.stats !== 'object') base.stats = { hp: 0, atk: 0, spd: 0, chr: 0 };
      ['hp', 'atk', 'spd', 'chr'].forEach(function (k) { if (typeof base.stats[k] !== 'number' || base.stats[k] < 0) base.stats[k] = 0; });
    } catch (_) {}
    return base;
  }
  function persistProg() {
    try {
      localStorage.setItem(PROG_KEY, JSON.stringify({ stats: PROG.stats, pts: PROG.pts || 0, pet: PROG.pet, map: PROG.map, bestCombo: PROG.bestCombo || 0, adopted: PROG.adopted, hunt: PROG.hunt || null }));
    } catch (_) {}
  }
  function applyStats() {
    try {
      if (typeof playerMaxHP === 'undefined') return;
      playerMaxHP = 100 + 15 * (PROG.stats.hp || 0);
      if (playerHP > playerMaxHP) playerHP = playerMaxHP;
      if (typeof updateHP === 'function') updateHP();
    } catch (_) {}
  }

  // ---- speed hook used by game.html movement lines ----
  window.__spdMult = function () { return 1 + 0.08 * (PROG.stats.spd || 0); };

  // ---- pet ----
  function adoptPet() {
    if (PROG.pet >= 0) return;
    PROG.pet = (Math.random() * PET_EMOJI.length) | 0;
    PROG.adopted = true;
    G_PET.col = (player ? player.col : 25) - 1;
    G_PET.row = (player ? player.row : 25) + 1;
    persistProg();
    try { toast('🐾 A tiny ' + PET_NAME[PROG.pet] + ' joins you — +10% XP on everything!'); } catch (_) {}
  }

  // ---- mini-map (screen space, drawn after world renders) ----
  function gfRR(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawMiniMap(time) {
    if (state !== 'world' || spectate) return;
    if (typeof tiles === 'undefined' || typeof GW === 'undefined') return;
    var MS = 104, MPX = 16, MPY = 132, t = MS / GW;
    var low = (typeof LOW !== 'undefined' && LOW);
    var st = low ? 2 : 1, ts = t * st;
    ctx.save();
    gfRR(MPX - 4, MPY - 4, MS + 8, MS + 8, 10);
    ctx.fillStyle = 'rgba(6,9,14,0.84)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,229,160,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,233,168,0.92)';
    ctx.font = '700 9px "Chakra Petch",system-ui,sans-serif';
    ctx.fillText('◉ MINI', MPX + 2, MPY - 8);
    ctx.fillText('[M]', MPX + MS - 20, MPY - 8);
    // terrain
    for (var r = 0; r < GH; r += st) {
      for (var c = 0; c < GW; c += st) {
        var v = (tiles[r] || [])[c];
        var col = 'rgba(255,255,255,0.03)';
        if (v === 1) col = '#1f4f8a';            // WATER
        else if (v === 2) col = '#8a7847';       // SAND
        else if (v === 3) col = '#5c5a48';       // PATH
        else if (v === 4) col = '#5c4632';       // DOCK
        else if (v === 5) col = '#7a3010';       // LAVA
        ctx.fillStyle = col; ctx.fillRect(MPX + c * t, MPY + r * t, ts, ts);
      }
    }
    // buildings / offices / transit
    if (props) for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.type === 'building' || p.__source || p.kind === 'transit') {
        ctx.fillStyle = (p.__source && p.__office) ? '#e8c45c' : '#4a5a7a';
        ctx.fillRect(MPX + p.col * t - t / 2, MPY + p.row * t - t / 2, t, t);
      }
    }
    // wandering npcs
    if (npcs) { ctx.fillStyle = '#8fa6bf'; for (var n = 0; n < npcs.length; n++) ctx.fillRect(MPX + npcs[n].col * t - 1, MPY + npcs[n].row * t - 1, 2, 2); }
    // enemies
    if (enemies && enemies.length) { ctx.fillStyle = '#ff4f5a'; for (var e = 0; e < enemies.length; e++) ctx.fillRect(MPX + enemies[e].col * t - 1.5, MPY + enemies[e].row * t - 1.5, 3, 3); }
    // player pulse
    var pp = (Math.sin(time / 180) + 1) / 2;
    ctx.fillStyle = 'rgba(0,229,160,' + (0.35 + pp * 0.6).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(MPX + player.col * t, MPY + player.row * t, 2 + pp, 0, 7); ctx.fill();
    ctx.fillStyle = '#00e5a0';
    ctx.fillRect(MPX + player.col * t - 1, MPY + player.row * t - 1, 2, 2);
    ctx.restore();
  }

  // ---- pet companion (world space, below the player draw order) ----
  function drawPet(time) {
    if (state !== 'world' || spectate || PROG.pet < 0) return;
    if (typeof player === 'undefined' || typeof w2s === 'undefined') return;
    // ease toward a spot just behind/left of the player
    G_PET.col += ((player.col - 1) - G_PET.col) * 0.08;
    G_PET.row += ((player.row + 1) - G_PET.row) * 0.08;
    var col = G_PET.col, row = G_PET.row;
    ctx.save();
    ctx.translate(Math.round(W / 2), Math.round(H * 0.42)); ctx.scale(zoom, zoom);
    var pt = w2s(col, row);
    var bob = Math.sin(time / 260 + 2) * 3;
    var x = pt[0], y = pt[1] + bob;
    var petCol = PET_COLOR[PROG.pet];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = petCol;
    ctx.beginPath(); ctx.arc(x, y - 12, 16, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '600 22px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(PET_EMOJI[PROG.pet], x, y + 6);
    ctx.textAlign = 'start';
    ctx.font = '700 9px "Chakra Petch",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,233,168,0.85)';
    ctx.fillText(PET_NAME[PROG.pet], x, y - 16);
    // occasional sparkle
    if (Math.random() < 0.03) { try { addChips(col, row, petCol); } catch (_) {} }
    ctx.restore();
  }

  // ---- stat panel ----
  function gfStyle() {
    if (document.getElementById('gfStyle')) return;
    var st = document.createElement('style'); st.id = 'gfStyle';
    st.textContent = '.gfbar{height:6px;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden;margin-bottom:4px}.gffill{height:100%;background:linear-gradient(90deg,#5fe0ff,#00e5a0);border-radius:4px}';
    document.head.appendChild(st);
  }
  function gfRowHTML(k) {
    var l = STAT_LABEL[k], v = PROG.stats[k] || 0;
    return '<div style="background:#0d1420;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px 9px;margin-bottom:6px;display:flex;align-items:center;gap:8px">' +
      '<div style="font-size:18px">' + l[0] + '</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:700">' + l[1] + '</div><div style="font-size:10px;color:#5a6a7a">' + l[2] + '</div></div>' +
      '<div style="text-align:center"><div style="font-size:15px;color:#5fe0ff;font-weight:800">' + v + '</div>' +
      '<button onclick="gfAlloc(\'' + k + '\')" style="margin-top:2px;width:26px;height:22px;background:' + (PROG.pts > 0 ? '#00e5a0;color:#06080b' : 'rgba(255,255,255,.12);color:#5a6a7a') + ';border:none;border-radius:5px;font-weight:800;cursor:' + (PROG.pts > 0 ? 'pointer' : 'default') + '">+</button></div></div>';
  }
  function gfBuild() {
    var el = document.getElementById('gfPanel'); if (!el) return;
    var L = levelFor(credits), cur = 45 * (L - 1) * (L - 1), next = 45 * L * L, into = credits - cur, pct = Math.max(0, Math.min(100, into / (next - cur) * 100));
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:15px;letter-spacing:.06em">✨ STATS</b><button onclick="gfClose()" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
    h += '<div class="gfbar"><div class="gffill" style="width:' + pct.toFixed(0) + '%"></div></div>';
    h += '<div style="font-size:11px;color:#9fb2c4;margin:2px 0 8px">Lv ' + L + ' · <span style="color:#5fe0ff">' + into + '</span>/' + next + ' XP · <b style="color:#ffe9a8">🎯 ' + (PROG.pts || 0) + ' pt</b></div>';
    ['hp', 'atk', 'spd', 'chr'].forEach(function (k) { h += gfRowHTML(k); });
    if (PROG.pet >= 0) {
      h += '<div style="display:flex;align-items:center;gap:8px;background:#10241c;border:1px solid rgba(0,229,160,.2);border-radius:8px;padding:7px 9px;margin-top:8px">' +
        '<div style="font-size:20px">' + PET_EMOJI[PROG.pet] + '</div>' +
        '<div style="flex:1"><div style="font-size:12px;font-weight:700">' + PET_NAME[PROG.pet] + '</div><div style="font-size:10px;color:#5a8a72">+10% XP on everything</div></div>' +
        '<button onclick="gfPet()" style="background:none;border:1px solid rgba(0,229,160,.4);color:#00e5a0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">Switch</button></div>';
    } else {
      h += '<div style="background:#141a26;border:1px dashed rgba(255,255,255,.14);border-radius:8px;padding:7px 9px;margin-top:8px;font-size:11px;color:#5a6a7a">🐾 Reach <b style="color:#9fb2c4">Level 2</b> and a wild companion will adopt you (+10% XP).</div>';
    }
    h += '<div style="font-size:10px;color:#5a6a7a;margin-top:8px;line-height:1.5">⚡ Best combo: <span style="color:#ffe14a;font-weight:700">' + (PROG.bestCombo || 0) + '×</span><br>Press <b style="color:#9fb2c4">P</b> to toggle · <b style="color:#9fb2c4">M</b> for the map</div>';
    el.innerHTML = h;
  }
  function gfPanelEl() {
    var el = document.getElementById('gfPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfPanel'; el.className = 'panel hide';
      el.style.cssText = 'position:fixed;right:16px;top:64px;width:min(300px,calc(100vw - 32px));max-height:72vh;overflow:auto;padding:14px 16px;z-index:60';
      document.body.appendChild(el);
    }
    return el;
  }
  function gfToggle() { gfStyle(); var el = gfPanelEl(); el.classList.toggle('hide'); gfBuild(); }
  function gfClose() { var el = document.getElementById('gfPanel'); if (el) el.classList.add('hide'); }
  function gfAlloc(k) {
    if (!PROG.pts || PROG.pts < 1) { try { toast('🎯 No stat points yet — earn XP to level up!'); } catch (_) {} return; }
    if (!PROG.stats[k] && PROG.stats[k] !== 0) return;
    PROG.pts -= 1; PROG.stats[k] = (PROG.stats[k] || 0) + 1;
    persistProg(); applyStats();
    try { toast(STAT_LABEL[k][0] + ' ' + STAT_LABEL[k][1] + ' +1'); } catch (_) {}
    gfBuild();
  }
  function gfPet() {
    if (PROG.pet < 0) return;
    PROG.pet = (PROG.pet + 1) % PET_EMOJI.length;
    persistProg();
    try { toast('🐾 Your companion is now a ' + PET_NAME[PROG.pet] + '!'); } catch (_) {}
    gfBuild();
  }

  // ---- global entry points for inline onclick ----
  window.gfAlloc = gfAlloc; window.gfPet = gfPet; window.gfToggle = gfToggle; window.gfClose = gfClose;

  // ---- key bindings (P / M), guarded against typing ----
  function gfKeys(e) {
    if (!window.state) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'p') { e.preventDefault(); gfToggle(); }
    else if (k === 'm') {
      PROG.map = !PROG.map; persistProg();
      try { toast(PROG.map ? '🗺 World map on (M to hide)' : '🗺 World map off'); } catch (_) {}
    }
    else if (k === 'g') { gfWarp(); }
    else if (k === 'h') { gfHuntToggle(); }
  }

  // ---- wrap core functions (game.html top-level function declarations = window props) ----
  var _axRaw = null, _rawSave = null, _rawWeapon = null, _rawAttack = null, _rawRest = null, _rawUpdate = null, _rawRW = null, _rawWallet = null;
  function wire() {
    if (window.__gfWired) return; window.__gfWired = true;

    _axRaw = window.addXP;
    window.addXP = function (n) {
      if (typeof n !== 'number' || !(n > 0)) { if (_axRaw) _axRaw(n); return; }
      var b = levelFor(credits);
      var mult = (1 + 0.10 * (PROG.stats.chr || 0)) * (PROG.pet >= 0 ? 1.10 : 1);
      if (_axRaw) _axRaw(Math.round(n * mult));
      var nl = levelFor(credits);
      var gained = nl - b;
      if (gained > 0) {
        PROG.pts = (PROG.pts || 0) + gained;
        persistProg(); applyStats();
        try { toast('⭐ Level ' + nl + '! +' + gained + ' stat point' + (gained > 1 ? 's' : '') + ' — press P to spend.'); } catch (_) {}
      }
      if (PROG.pet < 0 && nl >= 2) adoptPet();
      gfBuild();
    };

    _rawSave = window.saveEcon;
    window.saveEcon = function () { if (_rawSave) _rawSave(); persistProg(); };

    _rawWeapon = window.weaponPower;
    window.weaponPower = function () { var w = _rawWeapon ? _rawWeapon() : 1; return w * (1 + 0.12 * (PROG.stats.atk || 0)); };

    _rawAttack = window.doAttack;
    window.doAttack = function () {
      var before = (enemies && enemies.length) || 0;
      try { if (_rawAttack) _rawAttack(); } catch (_) {}
      var after = (enemies && enemies.length) || 0;
      var killed = before - after;
      if (killed > 0) {
        PROG.combo = (PROG.combo || 0) + killed;
        PROG.cbt = 6;
        PROG.bestCombo = Math.max(PROG.bestCombo || 0, PROG.combo);
        var bonus = Math.min(PROG.combo, 10) * 2;
        if (bonus > 0 && _axRaw) {
          _axRaw(bonus);
          try { if (state === 'world') addFloat(player.col, player.row, '⚡ ' + PROG.combo + '× COMBO +' + bonus + ' XP', '#ffe14a'); } catch (_) {}
        }
        persistProg();
      } else {
        PROG.combo = 0;
      }
    };

    _rawRest = window.restHere;
    window.restHere = function () {
      if (_rawRest) _rawRest();
      try {
        playerHP = playerMaxHP;
        updateHP();
        if (_axRaw) _axRaw(5);
        if (state === 'world') {
          addFloat(player.col, player.row, '+5 XP', '#4fe07a');
          addChips(player.col, player.row, '#4fe07a');
        }
        toast('😴 You rest a while… fully healed. (+5 XP)');
      } catch (_) {}
    };

    _rawUpdate = window.update;
    window.update = function (dt) {
      try { if (_rawUpdate) _rawUpdate(dt); } catch (_) {}
      if (PROG.cbt > 0) { PROG.cbt -= dt; if (PROG.cbt <= 0) PROG.combo = 0; }
    };

    _rawRW = window.renderWorld;
    window.renderWorld = function (time) {
      try { if (_rawRW) _rawRW(time); } catch (_) {}
      try { drawPet(time); } catch (_) {}
      try { gfDrawMonolith(time); } catch (_) {}
      try { if (PROG.map) drawMiniMap(time); } catch (_) {}
    };

    _rawWallet = window.updateWallet;
    window.updateWallet = function () {
      try { if (_rawWallet) _rawWallet(); } catch (_) {}
      var el = document.getElementById('wallet'); if (!el) return;
      var bits = [];
      if (PROG.pet >= 0) bits.push('🐾 +10% XP');
      if (PROG.pts && PROG.pts > 0) bits.push('🎯 ' + PROG.pts + ' pt');
      if (PROG.combo && PROG.combo >= 2) bits.push('⚡' + PROG.combo + '×');
      if (bits.length) el.innerHTML += '<span style="font-size:10px;color:#ffe9a8">' + bits.join(' · ') + '</span>';
    };

    addEventListener('keydown', gfKeys);
  }

  // ============ 2D⇄3D REALM GATE ============
  function gfReadTicket() { try { return JSON.parse(localStorage.getItem(BRIDGE_KEY) || 'null'); } catch (_) { return null; } }
  function gfWriteTicket(t) { try { localStorage.setItem(BRIDGE_KEY, JSON.stringify(t)); } catch (_) {} }
  function gfClearTicket() { try { localStorage.removeItem(BRIDGE_KEY); } catch (_) {} }
  function gfRegionId() { try { return (typeof region !== 'undefined' && region && region.id) ? region.id : (localStorage.getItem('shaddai.region') || 'agentcity'); } catch (_) { return 'agentcity'; } }
  function gfCharName() { try { if (typeof player !== 'undefined' && player && player.name) return player.name; var p = JSON.parse(localStorage.getItem('shaddai.player') || 'null'); return (p && p.name) || 'Wanderer'; } catch (_) { return 'Wanderer'; } }

  function gfTo3D() {
    var c = -1, r = -1;
    try { if (typeof player !== 'undefined' && player) { c = Math.round(player.col); r = Math.round(player.row); } } catch (_) {}
    gfWriteTicket({ from: '2d', region: gfRegionId(), col: c, row: r, name: gfCharName(), ts: Date.now() });
    try { toast('⛩ Opening the realm gate…'); } catch (_) {}
    setTimeout(function () { location.href = '/world3d'; }, 350);
  }

  function gfGateBtn() {
    try {
      var tb = document.getElementById('topbtns'); if (!tb || tb.querySelector('#gfGate3d')) return;
      var b = document.createElement('button');
      b.id = 'gfGate3d';
      b.className = 'panel';
      b.style.cssText = 'padding:9px 13px;border-color:rgba(95,224,255,.45);color:#5fe0ff;font-weight:700';
      b.textContent = '⛩ 3D Realm';
      b.onclick = gfTo3D;
      tb.appendChild(b);
    } catch (_) {}
  }

  function gfFindMonolith() {
    try {
      if (typeof props === 'undefined' || typeof tiles === 'undefined' || typeof GW === 'undefined' || typeof GH === 'undefined') return null;
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p && p.landmark) return { col: Math.round(p.col + ((p.w || 1) / 2) + 2), row: Math.round(p.row + ((p.d || 1) / 2) - 2) };
      }
      if (typeof walkable !== 'function') return null;
      var cx = (GW / 2) | 0, cy = (GH / 2) | 0;
      for (var d = 3; d < 16; d++) for (var a = 0; a < 24; a++) {
        var c = Math.round(cx + Math.sin(a * Math.PI / 12) * d), rr = Math.round(cy + Math.cos(a * Math.PI / 12) * d);
        if (walkable(c, rr)) return { col: c, row: rr };
      }
      return null;
    } catch (_) { return null; }
  }

  function gfDrawMonolith(time) {
    try {
      if (state !== 'world' || spectate) { gfGateNear = false; return; }
      if (typeof walkable === 'function') {
        if (MONO && !walkable(MONO.col, MONO.row)) MONO = null;
        if (!MONO) MONO = gfFindMonolith();
      }
      if (!MONO) return;
      var pt; try { pt = w2s(MONO.col, MONO.row); } catch (_) { return; }
      var x = pt[0], y = pt[1];
      var pulse = (Math.sin(time / 420) + 1) / 2;
      ctx.save();
      ctx.translate(Math.round(W / 2), Math.round(H * 0.42)); ctx.scale(zoom, zoom);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + pulse * 0.28;
      ctx.fillStyle = '#5fe0ff';
      ctx.beginPath(); ctx.arc(x, y - 6, 26 + pulse * 10, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0e1a2a';
      ctx.fillRect(x - 7, y - 27, 14, 35);
      ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 2;
      ctx.strokeRect(x - 7, y - 27, 14, 35);
      ctx.fillStyle = '#5fe0ff';
      ctx.font = '600 11px "Chakra Petch",system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('3D', x, y - 13);
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.font = '700 8px "Chakra Petch",system-ui,sans-serif';
      ctx.fillText('GATE', x, y - 3);
      ctx.globalAlpha = 1; ctx.fillStyle = '#00e5a0';
      ctx.font = '600 9px "Chakra Petch",system-ui,sans-serif';
      ctx.fillText('⛩ G', x, y + 11);
      ctx.textAlign = 'start';
      ctx.restore();
      gfGateNear = (typeof player !== 'undefined' && player) ? Math.hypot(player.col - MONO.col, player.row - MONO.row) < 2.4 : false;
      if (gfGateNear && Math.random() < 0.05) { try { addChips(MONO.col, MONO.row, '#5fe0ff'); } catch (_) {} }
    } catch (_) {}
  }

  function gfWarp() {
    try {
      if (typeof player === 'undefined' || !player) { gfTo3D(); return; }
      if (!gfGateNear) { toast('The ⛩ 3D Gate glows somewhere out there — find the blue pillar!'); return; }
      gfTo3D();
    } catch (_) {}
  }

  function gfRestoreFrom3D() {
    var t = gfReadTicket();
    if (!t || t.from !== '3d') return;
    gfClearTicket();
    var apply = function () {
      try {
        if (!player) return false;
        var c = Math.round(t.col), r = Math.round(t.row);
        if (c > 0 && r > 0 && typeof walkable === 'function' && walkable(c, r)) {
          player.col = c; player.row = r;
          try { if (typeof cam !== 'undefined' && cam) { cam.col = c; cam.row = r; } } catch (_) {}
        }
        toast('⛩ Back from the 3D realm!' + (t.name ? ' (' + t.name + ')' : ''));
        try { addFloat(player.col, player.row, '⛩ 3D → 2D', '#5fe0ff'); } catch (_) {}
        return true;
      } catch (_) { return false; }
    };
    if (apply()) return;
    var tt = 0; var iv = setInterval(function () { tt++; if (apply() || tt > 40) clearInterval(iv); }, 300);
  }

  // ============ HUNT GRID (TURTLE #2) ============
  var HUNT_ICON = { empty: '·', gold: '💵', xp: '✦', hide: '🟫', chest: '🏆' };
  var HUNT_COLOR = { empty: '#5a6a7a', gold: '#ffe9a8', xp: '#7ffcd0', hide: '#e8c45c', chest: '#ffe14a' };
  function gfHuntSeed(silent) {
    var arr = [];
    for (var i = 0; i < 25; i++) {
      var roll = Math.random(), kind = 'empty';
      if (roll >= 0.55 && roll < 0.73) kind = 'gold';
      else if (roll >= 0.73 && roll < 0.85) kind = 'xp';
      else if (roll >= 0.85 && roll < 0.93) kind = 'hide';
      else if (roll >= 0.93) kind = 'chest';
      arr.push({ k: kind, done: false });
    }
    HUNT.cells = arr; HUNT.used = 0;
    PROG.hunt = arr.map(function (c) { return { k: c.k, done: c.done }; });
    persistProg();
    if (!silent) { try { toast('🗺 A fresh hunting ground takes root!'); } catch (_) {} }
  }
  function gfHuntEnsure() {
    if (HUNT.cells && HUNT.cells.length === 25) return;
    if (PROG.hunt && Array.isArray(PROG.hunt) && PROG.hunt.length === 25) {
      HUNT.cells = PROG.hunt.map(function (c) { return { k: c.k, done: !!c.done }; });
      HUNT.used = HUNT.cells.filter(function (c) { return c.done; }).length;
      return;
    }
    gfHuntSeed(true);
  }
  function gfHuntReveal(i) {
    try {
      if (state !== 'world') { toast('Enter the world to hunt'); return; }
      gfHuntEnsure();
      var c = HUNT.cells[i]; if (!c || c.done) return;
      c.done = true; HUNT.used++;
      var got = '', col = '#7ffcd0';
      if (c.k === 'gold') { var g = 5 + ((Math.random() * 12) | 0); money = (money || 0) + g; got = '+💵' + g; col = '#ffe9a8'; }
      else if (c.k === 'xp') { var x = 8 + ((Math.random() * 16) | 0); addXP(x); got = '+' + x + ' XP'; }
      else if (c.k === 'hide') { inv.hide = (inv.hide || 0) + 1; got = '+1 🟫 hide'; col = '#e8c45c'; }
      else if (c.k === 'chest') { var g2 = 12 + ((Math.random() * 16) | 0), x2 = 15 + ((Math.random() * 20) | 0); money = (money || 0) + g2; addXP(x2); got = '🏆 +💵' + g2 + ' · +' + x2 + ' XP'; col = '#ffe14a'; }
      else got = 'just shrubbery…';
      try { saveEcon(); persistProg(); } catch (_) {}
      try { if (player) addFloat(player.col, player.row, got, col); } catch (_) {}
      if (c.k !== 'empty') toast('🌿 ' + got);
      gfHuntBuild();
      if (HUNT.used >= 25) setTimeout(function () { toast('🗺 Ground cleared — reseed the hunt!'); }, 600);
    } catch (_) {}
  }
  function gfHuntCell(i) {
    var c = HUNT.cells[i];
    var ico = HUNT_ICON[c.k], col = HUNT_COLOR[c.k];
    var box = 'width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:17px';
    if (c.done) return '<div style="' + box + ';background:#0f1826;border:1px solid rgba(255,255,255,.06);color:' + col + '">' + ico + '</div>';
    return '<button onclick="gfHunt(\'' + i + '\')" style="' + box + ';background:linear-gradient(160deg,#12202f,#0c1420);border:1px solid rgba(0,229,160,.25);color:#7ffcd0;font-weight:800;cursor:pointer">?</button>';
  }
  function gfHuntBuild() {
    var el = document.getElementById('gfHunt'); if (!el) return;
    gfHuntEnsure();
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:14px;letter-spacing:.06em">🗺 HUNT GROUND</b><button onclick="gfHunt(\'close\')" style="background:none;border:1px solid rgba(255,255,255,.2);color:#9fb2c4;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px">✕</button></div>';
    h += '<div style="font-size:11px;color:#9fb2c4;margin-bottom:8px">Tap a tile to see what the wilds hid · <b style="color:#00e5a0">' + HUNT.used + '</b>/25 cleared</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;justify-content:center">';
    for (var i = 0; i < 25; i++) h += gfHuntCell(i);
    h += '</div>';
    h += '<button onclick="gfHunt(\'seed\')" style="margin-top:9px;width:100%;padding:7px;background:rgba(18,32,47,.8);border:1px solid rgba(0,229,160,.35);color:#00e5a0;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer">🌱 Reseed hunting ground</button>';
    el.innerHTML = h;
  }
  function gfHuntToggle() {
    var el = document.getElementById('gfHunt');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfHunt'; el.className = 'panel';
      el.style.cssText = 'position:fixed;left:16px;top:200px;width:264px;max-height:82vh;overflow:auto;padding:14px 16px;z-index:60';
      document.body.appendChild(el);
    }
    el.classList.toggle('hide');
    gfHuntBuild();
  }
  window.gfHunt = function (arg) {
    if (arg === 'close') { var el = document.getElementById('gfHunt'); if (el) el.classList.add('hide'); }
    else if (arg === 'seed') { gfHuntSeed(false); gfHuntBuild(); }
    else gfHuntReveal(parseInt(arg, 10));
  };

  // ---- init ----
  function init() {
    try { wire(); } catch (_) {}
    try { gfGateBtn(); } catch (_) {}
    try { gfRestoreFrom3D(); } catch (_) {}
    if (typeof levelFor === 'function' && typeof credits !== 'undefined') {
      var L = levelFor(credits);
      try { applyStats(); } catch (_) {}
      if (PROG.pet >= 0) {
        G_PET.col = (player ? player.col : 25) - 1;
        G_PET.row = (player ? player.row : 25) + 1;
      } else if (L >= 2) {
        adoptPet();
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();