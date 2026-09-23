/* world3d-bridge.js — 2D⇄3D REALM LINK (classic, defer, loaded from world3d.html).
   Pulls the forged 2D character's state (economics + progression) straight from
   localStorage and shows it in the 3D world, so the two realms finally correlate.
   Also handles the shared warp ticket: '2d' → arrive with a toast + welcome spot,
   '3d' → the return link back to /game.html restores your 2D position.
   SparX sync: the 2D wallet (shaddai.sparks) is the canonical balance. On arrival we
   pull it down into the 3D save (+ hud) the moment the world is up, then poll every
   2.5s and push 3D spend/earn deltas back to the shared key + '3d-bazaar' sparklog.
   One balance, two realms. Defensive. */
(function () {
  if (window.__w3bLoaded) return; window.__w3bLoaded = true;
  var BRIDGE_KEY = 'shaddai.bridge';
  var ECON_KEY = 'shaddai.econ';
  var PROG_KEY = 'shaddai.progression';
  var PLAYER_KEY = 'shaddai.player';
  var LEVEL_KEY = 'shaddai.level';
  var SPARKS_KEY = 'shaddai.sparks';
  var SPARKLOG_KEY = 'shaddai.sparklog';
  var SPARKMETA_KEY = 'shaddai.sparkmeta';
  var ARRIVE = { x: 0, z: 16 };

  var $ = function (id) { return document.getElementById(id); };
  function read(key, fallback) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; } }
  function readTxt(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }

  function level() {
    var lv = readTxt(LEVEL_KEY);
    if (lv && /^\d+$/.test(lv)) return parseInt(lv, 10);
    var e = read(ECON_KEY, {}); var c = typeof e.credits === 'number' ? e.credits : 0;
    var n = 1; while (c >= 45 * n * n) n++; return Math.max(1, n - 1);
  }

  function num2d(v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : 0; }

  var PET = { emoji: ['🦊', '🌙', '💎', '✨'], name: ['Fennec', 'Moth', 'Gemkin', 'Starlit'] };

  function cardHTML() {
    var e = read(ECON_KEY, {});
    var p = read(PROG_KEY, null);
    var pl = read(PLAYER_KEY, null);
    var name = (pl && pl.name) || 'Wanderer';
    var L = level();
    var pet = (p && p.pet >= 0) ? PET.emoji[p.pet] + ' ' + PET.name[p.pet] : '—';
    var stats = (p && p.stats) ? ['❤' + (p.stats.hp || 0), '⚔' + (p.stats.atk || 0), '💨' + (p.stats.spd || 0), '✨' + (p.stats.chr || 0)].join(' ') : '';
    var best = (p && p.bestCombo) || 0;
    var plots = 0, achs = 0;
    try {
      var w3 = window.__w3;
      if (w3 && w3.save && w3.save.plots) plots = w3.save.plots.length;
      var al = JSON.parse(localStorage.getItem('shaddai.ach') || 'null');
      if (al && al.u) achs = Object.keys(al.u).length;
    } catch (_) {}
    return '<b style="letter-spacing:.14em;font-size:12px;color:#e8c45c">⛩ REALM LINK</b>' +
      '<div style="font-size:12px;font-weight:700;color:#00ff9c;margin-top:5px">' + name + ' · Lv ' + L + '</div>' +
      '<div style="font-size:11px;color:#b8c0d0;margin-top:3px;line-height:1.55">' +
      '💵 ' + num2d(e.money || 0) + ' Gold · ✦ ' + num2d(e.credits || 0) + ' XP' + (stats ? '<br>' + stats : '') +
      (pet !== '—' && pet ? '<br>🐾 ' + pet : '') +
      (best ? '<br>⚡ best combo ' + best + '×' : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(120,140,170,.18);font-size:12px;font-weight:800;color:#ffd77a">⚡ ' + sparks2d().toLocaleString() + ' Sparks</div>' +
      '<div style="font-size:10px;color:#7a8aa0;margin-top:5px;line-height:1.5">📜 ' + plots + ' plots · 🏅 ' + achs + ' achievements</div>';
  }

  // ── 2D⇄3D spot-wallet sync ────────────────────────────────────────────────
  function sparks2d() {
    try { var n = parseInt(localStorage.getItem(SPARKS_KEY), 10); return (isFinite(n) && n > 0) ? n : 0; } catch (_) { return 0; }
  }
  function sparkLog(kind, amt, note) {
    try {
      var a = JSON.parse(localStorage.getItem(SPARKLOG_KEY) || '[]');
      a.push({ t: Date.now(), k: kind, a: Math.round(amt) || 0, n: note || '' });
      if (a.length > 200) a = a.slice(-200);
      localStorage.setItem(SPARKLOG_KEY, JSON.stringify(a));
      // mirror the SAME row into the dashboard single-wallet ledger (schema: type/amount)
      try {
        var h = JSON.parse(localStorage.getItem('shd_tx_history') || '[]');
        h.push({ t: Date.now(), type: kind, amount: Math.round(amt) || 0, note: note || '' });
        if (h.length > 200) h = h.slice(-200);
        localStorage.setItem('shd_tx_history', JSON.stringify(h));
      } catch (_) {}
    } catch (_) {}
  }
  function sparkMeta(bump) {
    try {
      var m = { issued: 0, burned: 0, fee: 0, footprint: 0 };
      var r = JSON.parse(localStorage.getItem(SPARKMETA_KEY) || '{}');
      if (typeof r.issued === 'number') m.issued = r.issued;
      if (typeof r.burned === 'number') m.burned = r.burned;
      if (typeof r.footprint === 'number') m.footprint = r.footprint;
      if (bump >= 0) m.issued += bump; else m.burned += -bump;
      m.footprint += Math.abs(bump);
      localStorage.setItem(SPARKMETA_KEY, JSON.stringify(m));
    } catch (_) {}
  }
  // 2D wallet is canonical → pull it down into the 3D save once the world is up.
  function syncDown(w3) {
    try {
      if (localStorage.getItem(SPARKS_KEY) !== null && typeof w3.save.sparks === 'number') {
        w3.save.sparks = sparks2d();
        try { w3.hud(); } catch (_) {}
      }
    } catch (_) {}
  }
  // 3D spend/earn (shop, land yield…) → push deltas back to the shared wallet.
  function startWriteback(w3) {
    var last = typeof w3.save.sparks === 'number' ? w3.save.sparks : sparks2d();
    setInterval(function () {
      try {
        if (!w3 || !w3.save || typeof w3.save.sparks !== 'number') return;
        var cur = w3.save.sparks;
        if (cur === last) return;
        var d = Math.round(cur - last);
        last = cur;
        localStorage.setItem(SPARKS_KEY, String(Math.max(0, cur)));
        try { localStorage.setItem('shd_sparks', String(Math.max(0, cur))); } catch (_) {}
        try { localStorage.setItem('shd_max_sparks', String(Math.max(Number(localStorage.getItem('shd_max_sparks') || 0), cur))); } catch (_) {}
        sparkLog('3d-bazaar', d, d >= 0 ? 'earned in World 3D' : 'spent in World 3D');
        sparkMeta(d);
        buildCard();
      } catch (_) {}
    }, 2500);
  }

  function buildCard() {
    var old = $('w3bridge');
    var keepNote = '';
    if (old) {
      var prev = document.getElementById('w3bNote');
      if (prev) keepNote = prev.textContent;
      old.remove();
    }
    var el = document.createElement('div');
    el.id = 'w3bridge';
    el.className = 'panel';
    el.style.cssText = 'left:12px;top:176px;max-width:250px;padding:12px 14px;pointer-events:auto';
    var inner = document.createElement('div');
    inner.innerHTML = cardHTML();
    var back = document.createElement('button');
    back.textContent = '◧ BACK TO 2D WORLD';
    back.style.cssText = 'margin-top:9px;width:100%;padding:8px 10px;background:rgba(8,11,18,.7);color:#5fe0ff;font-weight:700;font-size:12px;letter-spacing:.08em;border:1px solid rgba(95,224,255,.45);border-radius:9px;cursor:pointer';
    back.onclick = returnTo2D;
    var note = document.createElement('div');
    note.id = 'w3bNote';
    note.style.cssText = 'font-size:10px;color:#5a6a7a;margin-top:7px;line-height:1.5';
    if (keepNote) note.textContent = keepNote;
    el.appendChild(inner);
    el.appendChild(back);
    el.appendChild(note);
    document.body.appendChild(el);
  }

  // Build the buttons bar first so a user can always leave, then fill the summary.
  function returnTo2D() {
    var t = read(BRIDGE_KEY, null) || {};
    write(BRIDGE_KEY, { from: '3d', region: t.region || 'agentcity', col: t.col || -1, row: t.row || -1, name: (read(PLAYER_KEY, null) || {}).name || 'Wanderer', ts: Date.now() });
    location.href = '/game.html';
  }

  // 3D side: teleport player to the Siege Castle (-190, -160) and show colosseum UI
  function enterColosseum3D() {
    var w3 = window.__w3;
    if (w3 && w3.player && w3.teleport) {
      // Siege Castle at (-190, -160) in 3D coords
      w3.teleport(-190, -160);
      try { w3.hud(); } catch (_) {}
      // mark arrival from 2D colosseum
      write(BRIDGE_KEY, { from: '2d-colosseum', region: 'agentcity', col: -190, row: -160, name: (read(PLAYER_KEY, null) || {}).name || 'Wanderer', ts: Date.now() });
      // toast
      if (typeof w3.toast === 'function') w3.toast('🏟️ Entered the 3D Siege Castle — arena awaits');
    }
  }

  // expose to 2D world via window.__w3
  window.__w3 = window.__w3 || {};
  window.__w3.enterColosseum = enterColosseum3D;

  function handleArrival() {
    var t = read(BRIDGE_KEY, null);
    if (!t || t.from !== '2d') return;
    // keep the 2D landing coords for the return trip, but mark as handled so a refresh doesn't re-warp
    write(BRIDGE_KEY, { from: 'held', region: t.region, col: t.col, row: t.row, name: t.name, ts: Date.now() });
    var note = $('w3bNote'); if (note) note.textContent = '⛩ Arrived from the 2D world — your forged hero is linked.';
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var w3 = window.__w3;
      if (w3 && w3.player) {
        clearInterval(iv);
        try {
          w3.teleport(ARRIVE.x, ARRIVE.z);
          w3.hud();
          w3.toast('⛩ ARRIVED FROM THE 2D WORLD');
        } catch (_) {}
      } else if (tries > 60) {
        clearInterval(iv);
      }
    }, 300);
  }

  buildCard();
  handleArrival();
  // keep the summary fresh after the 3D boot (2D values don't change, but the card may appear before hud());
  // once the world is up: pull the canonical 2D spark balance down, then keep 3D deltas in sync.
  var tries = 0;
  var iv2 = setInterval(function () {
    tries++;
    var w3 = window.__w3;
    if (w3 && w3.save) {
      clearInterval(iv2);
      syncDown(w3);
      startWriteback(w3);
      buildCard();
    } else if (tries > 60) clearInterval(iv2);
  }, 300);
})();