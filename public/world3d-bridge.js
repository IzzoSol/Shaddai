/* world3d-bridge.js — 2D⇄3D REALM LINK (classic, defer, loaded from world3d.html).
   Pulls the forged 2D character's state (economics + progression) straight from
   localStorage and shows it in the 3D world, so the two realms finally correlate.
   Also handles the shared warp ticket: '2d' → arrive with a toast + welcome spot,
   '3d' → the return link back to /game.html restores your 2D position.
   Everything is read-only against the 3D economy (no double-spend). Defensive. */
(function () {
  if (window.__w3bLoaded) return; window.__w3bLoaded = true;
  var BRIDGE_KEY = 'shaddai.bridge';
  var ECON_KEY = 'shaddai.econ';
  var PROG_KEY = 'shaddai.progression';
  var PLAYER_KEY = 'shaddai.player';
  var LEVEL_KEY = 'shaddai.level';
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
    return '<b style="letter-spacing:.14em;font-size:12px;color:#e8c45c">⛩ REALM LINK</b>' +
      '<div style="font-size:12px;font-weight:700;color:#00ff9c;margin-top:5px">' + name + ' · Lv ' + L + '</div>' +
      '<div style="font-size:11px;color:#b8c0d0;margin-top:3px;line-height:1.55">' +
      '💵 ' + num2d(e.money || 0) + ' Gold · ✦ ' + num2d(e.credits || 0) + ' XP' + (stats ? '<br>' + stats : '') +
      (pet !== '—' && pet ? '<br>🐾 ' + pet : '') +
      (best ? '<br>⚡ best combo ' + best + '×' : '') +
      '</div>';
  }

  function buildCard() {
    var el = $('w3bridge');
    if (el) el.remove();
    el = document.createElement('div');
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
  var tries = 0;
  var iv2 = setInterval(function () {
    tries++;
    var w3 = window.__w3;
    if (w3 && w3.save) { clearInterval(iv2); try { w3.hud(); } catch (_) {} }
    else if (tries > 60) clearInterval(iv2);
  }, 300);
})();