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

  // ---- persistence ----
  function readProg() {
    var base = { stats: { hp: 0, atk: 0, spd: 0, chr: 0 }, pts: 0, pet: -1, bestCombo: 0, map: false, adopted: false };
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
      localStorage.setItem(PROG_KEY, JSON.stringify({ stats: PROG.stats, pts: PROG.pts || 0, pet: PROG.pet, map: PROG.map, bestCombo: PROG.bestCombo || 0, adopted: PROG.adopted }));
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

  // ---- init ----
  function init() {
    try { wire(); } catch (_) {}
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