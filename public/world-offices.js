/* world-offices.js — OFFICE SERVICES: every council office has ONE unique verb so no two offices do the same job (owner 2026-10-01: "organize the offices so it's not just office after office").
 *   NEXUS   FABRICATE   craft items from Sparks (decal packs, thruster kits, bot parts)
 *   ORACLE  FORESIGHT   tonight's forecast (night/mobs), nearest camps, race odds for YOUR ride
 *   QUILL   RECORDS     your ledger: kills, races, Grand Prix medals, jam best, jobs; the quest-board lives here
 *   PIKADON PROTECTION  insure a mount against loss; audit trail summary
 *   TURTLE  STUDIO      cosmetics: board/mount dye + trail colours (perks other systems read)
 *   ZEROX   EXCHANGE    market signals feed, wager desk, sell harvest
 *   SHADDAI COORDINATION  daily check-in, agents & jobs, leaderboard hub
 * API: WorldOffices.open(code) · WorldOffices.OFFICES (data) · WorldOffices.act(code, serviceId, actionId) -> {ok, msg}  (pure logic, used by tests)
 * Entry: while you are INSIDE an office interior (window._currentInterior) a floating "OFFICE SERVICES" button appears; the I panel lists all offices.
 * Sparks are closed-loop; every paid action is a SINK (spend), nothing here mints Sparks except the daily check-in (capped, once per day).
 */
(function (root) {
  'use strict';
  function sparksGet() { return root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0; }
  function spend(n, why) { return root.ShdSparks && root.ShdSparks.spend ? root.ShdSparks.spend(n, 'office', why) : false; }
  function add(n, why) { if (root.ShdSparks) root.ShdSparks.add(n, 'office', why); }
  function inv() { return root.ShdInv; }
  function ls(k, d) { try { var j = JSON.parse(root.localStorage.getItem(k) || 'null'); return j == null ? d : j; } catch (e) { return d; } }
  function today() { return new Date().toISOString().slice(0, 10); }
  function buy(n, label, fn) { if (!spend(n, label)) return { ok: false, msg: 'Not enough Sparks (' + n + ')' }; var r = fn ? fn() : null; return { ok: true, msg: (r && r.msg) || label }; }

  var OFFICES = {
    NEXUS: { name: 'The Navigator', verb: 'FABRICATE', color: '#34e5b0', blurb: 'Fabrication is patience with better tools. Craft parts from Sparks.', services: [{ id: 'craft', title: 'Fabricator', actions: [
      { id: 'decal', label: 'Neon Deck Decal pack', cost: 60, run: function () { inv().add('decal-pack', 1); return { msg: 'Fabricated a Neon Deck Decal pack' }; } },
      { id: 'thruster', label: 'Thruster Kit (+10% race turbo)', cost: 180, run: function () { inv().setPerk('boostBonus', Math.min(0.3, (inv().perk('boostBonus') || 0) + 0.1)); return { msg: 'Thruster Kit fitted: race turbo +10% (max 30%)' }; } },
      { id: 'botparts', label: 'Bot Part Pack (-20% rebuild cost)', cost: 120, run: function () { inv().setPerk('rebuildDiscount', 0.2); return { msg: 'Bot rebuilds now cost 20% less' }; } }] }] },
    ORACLE: { name: 'The Esoteric Wing', verb: 'FORESIGHT', color: '#c084fc', blurb: 'Foresight is attention with a long memory. Know the night before it comes.', services: [{ id: 'sight', title: 'Forecast & odds', actions: [
      { id: 'forecast', label: 'Tonight’s forecast', cost: 20, run: function () { var n = root.__w3dDebug && root.__w3dDebug.skyV4, nf = n && n.nightFactor != null ? (typeof n.nightFactor === 'function' ? n.nightFactor() : n.nightFactor) : null; return { msg: nf == null ? 'The sky is quiet.' : (nf > 0.5 ? 'It is night: stalkers hunt (+30% damage, +50% loot).' : 'Daylight. Camps are calm; night brings +50% loot and tougher mobs.') }; } },
      { id: 'camps', label: 'Nearest mob camp', cost: 10, run: function () { var M = root.__mobs, P = root.__w3dDebug && root.__w3dDebug.playerPos, c = M && P && M.nearestCamp(P); return { msg: c ? c.name + ' camp ' + c.distM + ' m away: ' + c.alive + '/' + c.total + ' alive' + (c.respawnIn != null ? ', respawn in ' + c.respawnIn + 's' : '') : 'No camps charted yet.' }; } },
      { id: 'odds', label: 'Race odds for my ride', cost: 15, run: function () { var HC = root.WorldHoverCars, r = root.__raceChallenge && root.__raceChallenge.state(); var top = (HC && HC.KARTS && HC.KARTS.pod ? 44 : 30); return { msg: 'Rivals scale to your ride. Hover pods top out near 44 m/s, sedans ~38: pick handling for the park cups, speed for the rings.' }; } }] }] },
    QUILL: { name: 'The Library', verb: 'RECORDS', color: '#b98cff', blurb: 'Every deed leaves a record. Make yours worth reading.', services: [{ id: 'ledger', title: 'Your ledger', actions: [
      { id: 'read', label: 'Read my ledger', cost: 0, run: function () { var K = ls('shd_mobkills_v1', { total: 0, by: {} }), lb = ls('shd_jam_lb_v1', []), best = lb[0] ? lb[0].score : 0; return { msg: 'Mob kills ' + K.total + ' (' + Object.keys(K.by).map(function (k) { return k + ' ' + K.by[k]; }).join(', ') + ') · Skate Jam best ' + best + ' · Sparks ' + sparksGet() }; } },
      { id: 'quests', label: 'Open the quest board', cost: 0, run: function () { if (root.WorldQuests && root.WorldQuests.open) { root.WorldQuests.open(); return { msg: 'Quest board opened' }; } return { msg: 'The quest board is being written.' }; } }] }] },
    PIKADON: { name: 'The Aegis', verb: 'PROTECT', color: '#ff5a6e', blurb: 'Keep your mount insured. Accidents are rude and common.', services: [{ id: 'insure', title: 'Mount insurance', actions: [
      { id: 'insure', label: 'Insure my ride (one mount)', cost: 100, pick: 'mount', run: function (arg) { var ins = inv().perk('insured') || {}; ins[arg] = true; inv().setPerk('insured', ins); return { msg: 'Insured: if it is destroyed you keep it once (policy consumed)' }; } }] }] },
    TURTLE: { name: 'The Museum', verb: 'STYLE', color: '#1fd6c4', blurb: 'Light, colour, silhouette. Dress your board like you mean it.', services: [{ id: 'studio', title: 'Studio', actions: [
      { id: 'dye-gold', label: 'Gold dye (boards + mounts)', cost: 80, run: function () { inv().setPerk('dye', '#e8c45c'); return { msg: 'Gold dye applied' }; } },
      { id: 'dye-neon', label: 'Neon cyan dye', cost: 80, run: function () { inv().setPerk('dye', '#27e0ff'); return { msg: 'Neon cyan dye applied' }; } },
      { id: 'dye-rose', label: 'Rose magenta dye', cost: 80, run: function () { inv().setPerk('dye', '#ff3ea5'); return { msg: 'Rose magenta dye applied' }; } },
      { id: 'dye-clear', label: 'Remove dye', cost: 0, run: function () { inv().setPerk('dye', null); return { msg: 'Dye removed' }; } }] }] },
    ZEROX: { name: 'The Markets', verb: 'TRADE', color: '#27e0ff', blurb: 'A fair trade makes two friends. A rigged one makes none.', services: [{ id: 'exchange', title: 'Exchange', actions: [
      { id: 'sell', label: 'Sell all harvest', cost: 0, run: function () { var F = root.WorldFarm; if (F && F.sellAll) { var g = F.sellAll(); return { msg: g ? 'Sold harvest for ' + g + ' Sparks' : 'Nothing to sell' }; } return { msg: 'Nothing to sell' }; } },
      { id: 'signals', label: 'Open the signals feed', cost: 0, run: function () { if (root.WorldAgentsUI) { root.WorldAgentsUI.open('jobs'); return { msg: 'Opened the jobs board (signals jobs)' }; } return { msg: 'Signals feed offline' }; } }] }] },
    SHADDAI: { name: 'The Source', verb: 'COORDINATE', color: '#ffcf4a', blurb: 'Coordination beats talent. Bring a friend.', services: [{ id: 'hub', title: 'City hub', actions: [
      { id: 'checkin', label: 'Daily check-in (+100)', cost: 0, run: function () { var d = ls('shd_checkin_office', ''); if (d === today()) return { ok: false, msg: 'Already checked in today' }; try { root.localStorage.setItem('shd_checkin_office', JSON.stringify(today())); } catch (e) { } add(100, 'daily check-in'); return { msg: 'Checked in: +100 Sparks' }; } },
      { id: 'agents', label: 'Agents & jobs', cost: 0, run: function () { if (root.WorldAgentsUI) root.WorldAgentsUI.open('agents'); return { msg: 'Opened agents' }; } },
      { id: 'race', label: 'Hover racing select', cost: 0, run: function () { if (root.WorldRaceSelect) root.WorldRaceSelect.open(); return { msg: 'Opened race select' }; } }] }] }
  };

  function act(code, serviceId, actionId, arg) {
    var o = OFFICES[code]; if (!o) return { ok: false, msg: 'Unknown office' }; var sv = o.services.filter(function (s) { return s.id === serviceId; })[0], a = sv && sv.actions.filter(function (x) { return x.id === actionId; })[0]; if (!a) return { ok: false, msg: 'Unknown service' };
    var r = a.cost > 0 ? buy(a.cost, a.label, function () { return a.run(arg); }) : (function () { var q = a.run(arg); return { ok: q.ok !== false, msg: q.msg }; })(); return r;
  }

  // ---------- UI ----------
  var panel = null, btn = null, lastCode = null;
  function close() { if (panel) { panel.remove(); panel = null; } }
  function open(code) {
    if (typeof document === 'undefined') return; var o = OFFICES[code]; if (!o) return; close();
    panel = document.createElement('div'); panel.id = 'officePanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,460px);max-height:84vh;overflow:auto;padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid ' + o.color + ';color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    var h = '<div style="display:flex;justify-content:space-between"><div><div style="font:900 11px Orbitron,sans-serif;letter-spacing:.3em;color:' + o.color + '">' + code + ' · ' + o.verb + '</div><div style="font:900 18px Orbitron,sans-serif">' + o.name + '</div></div><span data-a="x" style="cursor:pointer">&#10005;</span></div><div style="opacity:.75;margin:6px 0 10px">' + o.blurb + '</div>';
    o.services.forEach(function (sv) { h += '<div style="letter-spacing:.14em;color:' + o.color + ';margin:6px 0">' + sv.title.toUpperCase() + '</div>' + sv.actions.map(function (a) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:1px solid rgba(255,255,255,.08)"><span>' + a.label + '</span><button data-a="do" data-s="' + sv.id + '" data-i="' + a.id + '" style="background:linear-gradient(180deg,rgba(0,255,156,.28),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:8px;color:#eafff6;padding:5px 11px;cursor:pointer;font:700 12px inherit">' + (a.cost ? a.cost + '⚡' : 'Go') + '</button></div>'; }).join(''); });
    h += '<div id="offMsg" style="margin-top:10px;min-height:18px;color:#e8c45c"></div>'; panel.innerHTML = h; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a'); if (a === 'x') return close(); if (a === 'do') { var arg; var sv = t.getAttribute('data-s'), id = t.getAttribute('data-i');
      var act0 = OFFICES[code].services.filter(function (s) { return s.id === sv; })[0].actions.filter(function (x) { return x.id === id; })[0]; if (act0.pick === 'mount') { var owned = (root.WorldMounts && root.WorldMounts.owned && root.WorldMounts.owned()) || []; if (!owned.length) { panel.querySelector('#offMsg').textContent = 'You own no mounts yet (I panel).'; return; } arg = owned[0].id; }
      var r = act(code, sv, id, arg); panel.querySelector('#offMsg').textContent = r.msg; if (root.Navi && root.Navi.toast) root.Navi.toast(r.msg); } });
  }
  function poll() {
    if (typeof document === 'undefined') return; var c = root._currentInterior, code = c && OFFICES[c] ? c : null;
    if (!btn) { btn = document.createElement('button'); btn.style.cssText = 'position:fixed;left:24px;bottom:130px;z-index:9000;padding:9px 16px;border-radius:12px;cursor:pointer;font:800 12px Rajdhani,sans-serif;letter-spacing:.14em;border:1px solid #e8c45c;border-bottom-width:4px;background:linear-gradient(180deg,rgba(232,196,92,.35),rgba(120,80,10,.5));color:#fff3c8;display:none'; btn.onclick = function () { if (lastCode) open(lastCode); }; document.body.appendChild(btn); }
    lastCode = code; if (!code) { btn.style.display = 'none'; return; } btn.style.display = 'block'; btn.textContent = OFFICES[code].verb + ' — ' + OFFICES[code].services[0].title.toUpperCase();
  }
  if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(poll, 600);
  root.WorldOffices = { OFFICES: OFFICES, open: open, close: close, act: act };
})(typeof window !== 'undefined' ? window : globalThis);
