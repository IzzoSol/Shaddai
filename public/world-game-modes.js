/* world-game-modes.js — GAME MODES hub (2026-10-11, owner: "all game mode screens and buttons: colosseum, race, etc").
 * One MODES button (top right, under NAVI) opens one panel with a button for every mode, wired to systems that already exist:
 *   RACE         Meridian Trefoil / Figure-8 / short lap / Dragon Gate -> window.__raceStart; "Pick ride & rivals" -> WorldRaceSelect.open()
 *   BOAT         Harbor Ring boat run (tunnel line to the canal lift), Naval battle (window.__naval.open)
 *   FIGHT        Colosseum arena (enter), host kiosk hint, field modes once inside (window.__colosseumArena.setField)
 *   SKATE        Hoverskate park (window.__travel.park), Skate Jam (window.__skateJam)
 *   ACADEMY      The Athenaeum (classes), Portal Nexus
 *   TRAVEL       maglev / Grid centre
 * Pure DOM; no per-frame work. `?modes=0` hides the button.
 */
(function (root) {
  'use strict';
  var panel = null, btn = null;
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function close() { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
  function exitInterior() { try { if (root.__interiorsExit) root.__interiorsExit(); } catch (e) { } }
  function race(cid) { return function () { exitInterior(); setTimeout(function () { if (root.__raceStart) { root.__raceStart(cid, { ais: 5, level: 'pro' }); } else toast('Race system not ready'); }, 500); }; }
  function sections() {
    var WR = (root.WorldRace && root.WorldRace.CIRCUITS) || {}, T = root.__travel || {}, has = function (c) { return !!WR[c]; };
    var S = [];
    var rc = [];
    [['meridian-tri', 'Meridian Trefoil', '10.7 km, flyovers, 2 laps'], ['meridian-8', 'Figure-8', '7.2 km, 2 laps'], ['meridian-8-lobe-n', 'Short lap', 'one lobe, 3 laps'], ['dragon-gate', 'Dragon Gate', 'figure-8 under the torii']].forEach(function (c) { if (has(c[0])) rc.push({ t: c[1], s: c[2], run: race(c[0]) }); });
    rc.push({ t: 'Pick ride and rivals', s: 'ships, light-cycles, hoverboards, cups', run: function () { if (root.WorldRaceSelect) root.WorldRaceSelect.open(); else toast('Race select not ready'); } });
    S.push({ h: 'RACE', c: '#2bff88', items: rc });
    S.push({ h: 'BOAT', c: '#4ac8ff', items: [
      { t: 'Harbor Ring boat run', s: 'tunnel line to the canal lift, then a pod or sub round the city', run: function () { var W = root.WorldCutsceneTravel; if (W && W.travelTo && W.travelTo('lift')) return; toast('Stand at a station and press J (tunnel line)'); } },
      { t: 'Naval battle', s: 'cannons, pickups, sea monsters', run: function () { if (root.__naval && root.__naval.open) root.__naval.open(); else toast('Naval arena not ready'); } }] });
    S.push({ h: 'FIGHT', c: '#e8c45c', items: [
      { t: 'Colosseum arena', s: 'duels, tactics, team attack, soccer, party (host kiosk inside)', run: function () { if (T.colosseum) T.colosseum(); else if (root.__interiorsEnter) root.__interiorsEnter('COLOSSEUM'); } },
      { t: 'Arena field: tactics grid', s: 'only inside the arena', run: function () { var A = root.__colosseumArena; if (A && A.setField) { A.setField('tactics'); toast('Arena field: tactics'); } else toast('Enter the arena first'); } },
      { t: 'Arena field: team attack', s: 'only inside the arena', run: function () { var A = root.__colosseumArena; if (A && A.setField) { A.setField('team-attack'); toast('Arena field: team attack'); } else toast('Enter the arena first'); } }] });
    S.push({ h: 'SKATE', c: '#ff5fb0', items: [
      { t: 'Hoverskate park', s: 'bowl, half-pipes, rails, kickers, drop tower', run: function () { if (T.park && T.park()) return; toast('Park not ready yet'); } },
      { t: 'Skate jam', s: '90 s trick attack', run: function () { var J = root.__skateJam; if (J && J.start) J.start(); else toast('Go to the park first'); } }] });
    S.push({ h: 'ACADEMY', c: '#2dd4a0', items: [
      { t: 'The Athenaeum', s: 'classes, exams, skill tree, Portal Nexus to the city halls', run: function () { if (root.__interiorsEnter) root.__interiorsEnter('ATHENAEUM'); else toast('Academy not ready'); } }] });
    S.push({ h: 'TRAVEL', c: '#b0b8c4', items: [
      { t: 'Maglev station', s: 'nearest ring station', run: function () { if (T.maglev) T.maglev(); } },
      { t: 'Grid centre', s: 'back to the middle of the city', run: function () { if (T.grid) T.grid(); } }] });
    return S;
  }
  function open() {
    close(); var S = sections();
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:18px;top:196px;z-index:9300;width:360px;max-height:72vh;overflow:auto;background:rgba(6,10,12,.96);border:2px solid #e8c45c;border-radius:12px;padding:12px 14px;color:#e6f2ec;font:600 13px Rajdhani,Segoe UI,sans-serif;box-shadow:0 0 30px rgba(232,196,92,.25)';
    var h = '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font:900 14px Orbitron,sans-serif;letter-spacing:.25em;color:#e8c45c">GAME MODES</span><span data-x="1" style="cursor:pointer;font-size:18px">x</span></div>';
    S.forEach(function (sec, si) {
      h += '<div style="margin-top:10px;font:900 11px Orbitron,sans-serif;letter-spacing:.3em;color:' + sec.c + '">' + sec.h + '</div>';
      sec.items.forEach(function (it, ii) { h += '<div data-s="' + si + '" data-i="' + ii + '" style="cursor:pointer;padding:7px 9px;margin:4px 0;border:1px solid ' + sec.c + '55;border-left:4px solid ' + sec.c + ';border-radius:7px;background:rgba(255,255,255,.04)">' + it.t + '<br><small style="opacity:.62;font-weight:500">' + it.s + '</small></div>'; });
    });
    panel.innerHTML = h; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var t = e.target; if (t.getAttribute && t.getAttribute('data-x')) return close();
      var d = t.closest && t.closest('[data-s]'); if (!d) return; var it = S[+d.getAttribute('data-s')].items[+d.getAttribute('data-i')]; close(); if (it && it.run) { try { it.run(); } catch (err) { toast('Could not start: ' + (err && err.message)); } }
    });
  }
  function init() {
    if (typeof document === 'undefined' || /[?&]modes=0\b/.test(location.search) || btn) return;
    btn = document.createElement('button'); btn.textContent = 'MODES';
    btn.style.cssText = 'position:fixed;right:18px;top:150px;z-index:9290;padding:8px 18px;border-radius:10px;border:1px solid #e8c45c;background:rgba(10,14,12,.85);color:#e8c45c;font:900 13px Orbitron,sans-serif;letter-spacing:.2em;cursor:pointer';
    btn.addEventListener('click', function () { if (panel) close(); else open(); });
    document.body.appendChild(btn);
  }
  root.WorldGameModes = { init: init, open: open, close: close };
  if (typeof document !== 'undefined') { var n = 0, iv = setInterval(function () { if (++n > 400) return clearInterval(iv); if (root.__loadPlayable) { clearInterval(iv); init(); } }, 1000); }
})(typeof window !== 'undefined' ? window : globalThis);
