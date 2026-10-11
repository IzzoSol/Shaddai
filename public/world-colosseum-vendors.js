/* world-colosseum-vendors.js — the Colosseum concourse comes alive (2026-09-29): walk the promenade ring (inside the stadium, outside the arena),
 * step up to any of the 24 kiosks, press E to talk / shop / vend. Items cost Sparks (closed-loop), stored locally (dev) until economy-service inventory.
 *   window.COLOSSEUM_KIOSKS (set by world-colosseum.js) = [{x,z,yaw,nx,nz}] in island metres; world = island + local * U.
 * Vendors: Snack Bar, Drinks, Gear (hover decals), Mounts (opens the Mount Store), Cosmetics, Wager Desk (spectate wagers - Sparks only).
 */
(function (root) {
  'use strict';
  var KEY = 'shd_vend_v1', VEND = [
    { id: 'snack', name: 'Spark Noodle Bar', hi: 'Fresh bowls - eat in the stands!', items: [['Spark Noodles', 15, 'You feel rested (+stamina buff)'], ['Ember Skewer', 20, 'Warm and crunchy'], ['Nebula Nachos', 30, 'Share with the crowd!']] },
    { id: 'drink', name: 'Void Fizz Vending', hi: 'Ice cold. Zero cash - Sparks only.', items: [['Void Fizz', 10, 'Fizzing'], ['Aurora Tea', 15, 'Calm focus'], ['Mecha-Mule', 25, 'Kick included']] },
    { id: 'gear', name: 'Hoverskate Gear', hi: 'Decals and trim for your board.', items: [['Neon Deck Decal', 60, 'Applied to your board'], ['Flame Trail Kit', 120, 'Trail unlocked'], ['Grip Tape: Gold', 45, 'Shiny']] },
    { id: 'mount', name: 'Mount Dealer', hi: 'Bulls, mammoths, gorillas... and hawks that fly.', mountStore: true, items: [] },
    { id: 'cosm', name: 'Cosmetics Boutique', hi: 'Dye, capes, halos. Show your colors.', items: [['Shaddai Gold Dye', 80, 'Dye added to wardrobe'], ['Arena Cape', 150, 'Cape added'], ['Halo Ring', 200, 'Halo added']] },
    { id: 'wager', name: 'Wager Desk', hi: 'Back your champion. Sparks only, no cash-out.', items: [['Bet 25 on Red corner', 25, 'Bet placed (settles after the bout)'], ['Bet 25 on Blue corner', 25, 'Bet placed (settles after the bout)'], ['Bet 100 on the Upset', 100, 'Bold. Bet placed']] },
    { id: 'host', name: 'Colosseum Host', hi: 'Welcome to the Colosseum. Races, boat runs and bouts all start here.', host: true, items: [] }
  ];
  var S = (function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { inv: [] }; } catch (e) { return { inv: [] }; } })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); else if (root.__toast) root.__toast(m); }
  var pnl = null, tip = null, cur = -1;
  function spend(n, id) { return root.ShdSparks ? root.ShdSparks.spend(n, 'colo-vendor', id) : false; }
  function close() { if (pnl) { pnl.remove(); pnl = null; } }
  function open(i) {
    close(); var v = VEND[i % VEND.length];
    if (v.host) { hostMenu(v); return; }
    if (v.mountStore) { if (root.__mountRide) root.__mountRide.panel(true); else toast('Mount store loading...'); return; }
    pnl = document.createElement('div'); pnl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9999;width:340px;background:rgba(6,8,11,.95);border:1px solid #e8c45c;border-radius:12px;padding:14px;color:#dfe9e4;font:13px system-ui;box-shadow:0 0 30px rgba(232,196,92,.25)';
    var h = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-weight:700"><span>' + v.name + '</span><span data-x="1" style="cursor:pointer">x</span></div><div style="opacity:.75;margin:4px 0 8px">&ldquo;' + ((root.WorldCopy && root.WorldCopy.pick('vendors.' + v.id)) || v.hi) + '&rdquo;</div>';
    v.items.forEach(function (it, k) { h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #1d2a26"><span>' + it[0] + '<br><small style="opacity:.6">' + it[1] + ' Sparks</small></span><button data-k="' + k + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 10px;cursor:pointer">Buy</button></div>'; });
    pnl.innerHTML = h; document.body.appendChild(pnl);
    pnl.addEventListener('click', function (e) {
      var t = e.target; if (t.getAttribute('data-x')) return close(); var k = t.getAttribute('data-k'); if (k == null) return; var it = v.items[+k];
      if (!spend(it[1], v.id + ':' + it[0])) return toast('Not enough Sparks (' + it[1] + ')');
      S.inv.push({ v: v.id, item: it[0], at: Date.now() }); save(); var bid = root.WorldBuffs && root.WorldBuffs.fromItem(it[0]); if (bid) root.WorldBuffs.add(bid); toast(it[0] + ' - ' + it[2] + (bid ? '  [' + root.WorldBuffs.DEFS[bid].name + ': ' + root.WorldBuffs.DEFS[bid].note + ']' : ''));
    });
  }
  // COLOSSEUM HOST (2026-10-11, owner: "race mode for the track, boat mode and fighting modes, all startable from the colosseum, an NPC host in the lobby")
  function panel(title, hi, rows) {
    pnl = document.createElement('div'); pnl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9999;width:380px;max-height:70vh;overflow:auto;background:rgba(6,8,11,.96);border:1px solid #e8c45c;border-radius:12px;padding:14px;color:#dfe9e4;font:13px system-ui;box-shadow:0 0 30px rgba(232,196,92,.25)';
    pnl.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-weight:700"><span>' + title + '</span><span data-x="1" style="cursor:pointer">x</span></div><div style="opacity:.75;margin:4px 0 8px">&ldquo;' + hi + '&rdquo;</div>' +
      rows.map(function (r, i) { return r.head ? '<div style="margin-top:8px;letter-spacing:.2em;color:#2bff88;font-size:11px">' + r.head + '</div>' : '<div data-r="' + i + '" style="cursor:pointer;padding:7px 8px;margin:3px 0;border:1px solid #2a3a34;border-radius:7px;background:#0d1a16">' + r.label + (r.sub ? '<br><small style="opacity:.6">' + r.sub + '</small>' : '') + '</div>'; }).join('');
    document.body.appendChild(pnl);
    pnl.addEventListener('click', function (e) { var t = e.target; if (t.getAttribute('data-x')) return close(); var d = t.closest('[data-r]'); if (!d) return; var r = rows[+d.getAttribute('data-r')]; if (r && r.run) { close(); r.run(); } });
  }
  function leaveArena() { try { if (root.__interiorsExit) root.__interiorsExit(); } catch (e) { } }
  function startRace(cid) { return function () { toast('Heading to the start line...'); leaveArena(); setTimeout(function () { if (root.__raceStart) root.__raceStart(cid, { ais: 5, level: 'pro' }); else toast('Race system not ready'); }, 700); }; }
  function setField(mode) { return function () { var A = root.__colosseumArena; if (A && A.setField) { A.setField(mode); toast('Arena field: ' + mode); } else toast('Arena not ready'); }; }
  function hostMenu() {
    var WR = root.WorldRace && root.WorldRace.CIRCUITS || {}, has = function (c) { return !!WR[c]; };
    var rows = [{ head: 'RACE THE CITY' }];
    [['meridian-tri', 'Meridian Trefoil', 'full track, 10.7 km, 2 laps, flyovers'], ['meridian-8', 'Meridian Figure-8', '7.2 km, 2 laps'], ['meridian-8-lobe-n', 'Meridian short lap', 'one lobe, 3.6 km, 3 laps'], ['dragon-gate', 'Dragon Gate', 'figure-8 under the torii, 3 laps']].forEach(function (c) { if (has(c[0])) rows.push({ label: c[1], sub: c[2], run: startRace(c[0]) }); });
    rows.push({ head: 'BOAT MODE' });
    rows.push({ label: 'Harbor Ring boat run', sub: 'ride the tunnel line to the canal lift, then take a pod or sub round the city', run: function () { var T = root.WorldCutsceneTravel; if (T && T.travelTo) T.travelTo('lift'); else toast('Tunnel line not ready'); } });
    rows.push({ label: 'Naval battle', sub: 'cannons, pickups and sea monsters on the arena water', run: function () { if (root.__naval && root.__naval.open) root.__naval.open(); else toast('Naval arena not ready'); } });
    rows.push({ head: 'FIGHTING MODES (this arena)' });
    [['sand', 'Classic duels', 'sand floor, one on one'], ['tactics', 'Tactics grid', '16 x 12 glowing grid for agent battles'], ['team-attack', 'Team attack', 'capture zones and cover'], ['soccer', 'Hover soccer', 'pitch and goals'], ['party', 'Party floor', 'dance floor and stage']].forEach(function (m) { rows.push({ label: m[1], sub: m[2], run: setField(m[0]) }); });
    rows.push({ head: 'LATER' });
    rows.push({ label: 'Understage, agent floor, server arena routes', sub: 'Colosseum stages 7+ (not built yet)', run: function () { toast('Stages 7+ are still in the plan'); } });
    close(); panel('Colosseum Host', 'Pick a mode. Races and boat runs take you out of the arena.', rows);
  }
  function poll() {
    var K = root.COLOSSEUM_KIOSKS, I = root.COLOSSEUM_ISLAND, P = root.__w3dDebug && root.__w3dDebug.playerPos; if (!K || !I || !P) return;
    var lx = (P.x - I.x) / I.U, lz = (P.z - I.z) / I.U, best = -1, bd = 3.6 * 3.6;
    if (Math.abs(lx) < 400 && Math.abs(lz) < 400) for (var i = 0; i < K.length; i++) { var dx = lx - K[i].x, dz = lz - K[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    if (best !== cur) { cur = best; if (!tip) { tip = document.createElement('div'); tip.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:9998;background:rgba(6,8,11,.85);border:1px solid #00ff9c;color:#00ff9c;padding:6px 14px;border-radius:20px;font:13px system-ui;display:none'; document.body.appendChild(tip); }
      if (best < 0) { tip.style.display = 'none'; close(); } else { tip.textContent = 'E - ' + VEND[best % VEND.length].name; tip.style.display = 'block'; } }
  }
  if (typeof document !== 'undefined') {
    setInterval(poll, 200);
    addEventListener('keydown', function (e) { if (e.code === 'KeyE' && cur >= 0 && !e.repeat && !(root.__mountRide && root.__mountRide.isRiding())) { e.stopImmediatePropagation(); e.preventDefault(); open(cur); } }, true);
  }
  root.ColoVendors = { VEND: VEND, inventory: function () { return S.inv.slice(); }, open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
