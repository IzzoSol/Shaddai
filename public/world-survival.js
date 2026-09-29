/* world-survival.js — diving + breath meter, drowning, death and RESPAWN SPOTS (all settable from the Navi > Plots).
 *
 *   window.WorldSurvival
 *     .state           { hp, breath (0..1), diving (bool), underwater (bool), dive (0..1), dead }
 *     .diveOffset(dt, ctx)   host calls once per frame while swimming: ctx = { swimming, waterY, floorY, U, wantDive, wantUp }
 *                            -> metres-in-world-units to subtract from the player's camera/feet height (0 when not diving)
 *     .damage(n, kind)       lowers HP; at 0 -> die(kind)
 *     .die(kind)             death: fade, HP reset, respawn at the chosen spot
 *     .respawn()             teleport to the active spot (fallback: The Bazaar, the middle of Shaddai City)
 *     .spots()               [{id, kind:'bazaar'|'home'|'plot'|'office'|'realm-bed'|'custom', name, x, z}] (bazaar always first)
 *     .addSpot(s) .removeSpot(id) .setActive(id|'auto') .active()
 *     .registerRestPoint({id, kind, name, x, z, r})   worlds/interiors register beds, homes, plots, offices here
 *     .nearRest()            the rest point the player stands in (a spot can only be SAVED at one)
 *     .saveHere()            adds/updates a spot from nearRest(); returns the spot or null
 *   Priority for 'auto': home > plot > office > realm-bed > bazaar (the most recently saved wins inside a kind).
 * Tunables: WorldSurvival.tune { breathSec, refillMul, drownDps, maxDiveM, lavaKills }.
 */
(function () {
  'use strict';
  if (window.WorldSurvival) return;
  var KEY = 'shd_spots_v1', PRI = { home: 5, plot: 4, office: 3, 'realm-bed': 2, custom: 1, bazaar: 0 };
  var tune = { breathSec: 25, refillMul: 5, drownDps: 12, maxDiveM: 9, diveRate: 3.2, lavaKills: true };
  var state = { hp: 100, breath: 1, diving: false, underwater: false, dive: 0, dead: false, fade: 0 };
  var rests = [], saved = { list: [], active: 'auto' };
  try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.list) saved = j; } catch (e) { }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { } }
  function pp() { return window.__w3dDebug && window.__w3dDebug.playerPos; }
  function toast(m) { if (window.Navi && window.Navi.toast) window.Navi.toast(m); else if (window.__toast) window.__toast(m); }

  function bazaar() {
    var L = window.WORLD_LAYOUT, st = L && L.stations && L.stations.filter(function (s) { return s.id === 'bazaar'; })[0];
    var p = st ? st.pos : [-100, 100];
    return { id: 'bazaar', kind: 'bazaar', name: 'Shaddai City Bazaar', x: p[0], z: p[1] };
  }
  function spots() { return [bazaar()].concat(saved.list); }
  function active() {
    if (saved.active && saved.active !== 'auto') { var s = spots().filter(function (x) { return x.id === saved.active; })[0]; if (s) return s; }
    var best = bazaar(), bp = -1;
    saved.list.forEach(function (s) { var p = (PRI[s.kind] || 0) * 1e13 + (s.at || 0); if (p > bp) { bp = p; best = s; } });
    return best;
  }
  function addSpot(s) {
    if (!s || s.x == null) return null; s.id = s.id || (s.kind + '-' + Math.round(s.x) + '_' + Math.round(s.z)); s.at = Date.now();
    saved.list = saved.list.filter(function (x) { return x.id !== s.id; }); saved.list.push(s); persist(); return s;
  }
  function removeSpot(id) { saved.list = saved.list.filter(function (x) { return x.id !== id; }); if (saved.active === id) saved.active = 'auto'; persist(); }
  function setActive(id) { saved.active = id || 'auto'; persist(); }
  function registerRestPoint(r) { rests = rests.filter(function (x) { return x.id !== r.id; }); rests.push(r); }
  function nearRest() {
    var p = pp(); if (!p) return null;
    for (var i = 0; i < rests.length; i++) { var r = rests[i]; if (Math.hypot(p.x - r.x, p.z - r.z) <= (r.r || 6)) return r; }
    return null;
  }
  function saveHere() {
    var r = nearRest(); if (!r) { toast('Rest at a bed-pod, home, plot or office to save a respawn spot'); return null; }
    var s = addSpot({ id: r.id, kind: r.kind || 'custom', name: r.name || 'Rest point', x: r.x, z: r.z }); toast('Respawn spot saved: ' + s.name); return s;
  }

  var fadeEl = null;
  function overlay() {
    if (fadeEl) return fadeEl;
    fadeEl = document.createElement('div'); fadeEl.id = 'shdDeath';
    fadeEl.style.cssText = 'position:fixed;inset:0;z-index:8500;pointer-events:none;background:#000;opacity:0;transition:opacity .5s;display:flex;align-items:center;justify-content:center;color:#ff5a6e;font:700 42px Rajdhani,sans-serif;letter-spacing:.3em';
    document.body.appendChild(fadeEl);
    var w = document.createElement('div'); w.id = 'shdWater'; w.style.cssText = 'position:fixed;inset:0;z-index:7000;pointer-events:none;opacity:0;transition:opacity .35s;background:radial-gradient(ellipse at 50%,rgba(20,90,130,.28),rgba(2,30,60,.62))';
    document.body.appendChild(w);
    var b = document.createElement('div'); b.id = 'shdBreath'; b.style.cssText = 'position:fixed;left:50%;bottom:120px;width:260px;height:10px;margin-left:-130px;z-index:7001;pointer-events:none;opacity:0;transition:opacity .3s;border:1px solid #00D4FF;background:rgba(0,0,0,.5)';
    b.innerHTML = '<i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#1B6CFF,#00D4FF)"></i>'; document.body.appendChild(b);
    return fadeEl;
  }
  function respawn() {
    var s = active(), p = pp(); if (!p) return; p.x = s.x; p.z = s.z; if (s.y != null) p.y = s.y;
    state.hp = 100; window.__playerHP = 100; state.breath = 1; state.dive = 0; state.diving = false; state.underwater = false;
    var D = window.__dragons; if (D && D.clearStatus) try { D.clearStatus(); } catch (e) { }
    toast('Respawned at ' + s.name);
  }
  function die(kind) {
    if (state.dead) return; state.dead = true; var el = overlay(); el.textContent = kind === 'drown' ? 'YOU DROWNED' : (kind === 'lava' ? 'YOU BURNED' : 'YOU DIED'); el.style.opacity = '1';
    setTimeout(function () { respawn(); el.style.opacity = '0'; state.dead = false; }, 1800);
  }
  function damage(n, kind) {
    if (state.dead) return; state.hp = Math.max(0, (window.__playerHP != null ? window.__playerHP : state.hp) - n); window.__playerHP = state.hp;
    if (state.hp <= 0) die(kind || 'damage');
  }

  var ui = 0;
  function diveOffset(dt, c) {
    overlay(); var off = 0;
    if (c && c.swimming && !state.dead) {
      var maxD = Math.max(0, Math.min(tune.maxDiveM * c.U, (c.waterY - c.floorY) - 1.3 * c.U));   // never through the seabed
      var full = tune.maxDiveM * c.U, cur = state.dive * full, goal = c.wantDive ? maxD : (c.wantUp ? 0 : cur);
       cur += Math.max(-tune.diveRate * c.U * dt * 1.4, Math.min(tune.diveRate * c.U * dt, goal - cur));
      state.dive = maxD > 0 ? Math.max(0, Math.min(1, cur / full)) : 0; off = cur > 0 ? cur : 0;
      state.diving = off > 0.3 * c.U;
      state.underwater = off > 0.9 * c.U;   // eye below the surface
    } else { state.dive = Math.max(0, state.dive - dt * 3); state.diving = false; state.underwater = false; }
    if (state.underwater) { state.breath = Math.max(0, state.breath - dt / tune.breathSec); if (state.breath <= 0) damage(tune.drownDps * dt, 'drown'); }
    else state.breath = Math.min(1, state.breath + dt * tune.refillMul / tune.breathSec);
    if ((ui += dt) > 0.1) {
      ui = 0; var w = document.getElementById('shdWater'), b = document.getElementById('shdBreath');
      if (w) w.style.opacity = state.underwater ? '1' : '0';
      if (b) { b.style.opacity = (state.underwater || state.breath < 0.999) ? '1' : '0'; b.firstChild.style.width = (state.breath * 100) + '%'; b.firstChild.style.background = state.breath < 0.25 ? '#ff5a6e' : 'linear-gradient(90deg,#1B6CFF,#00D4FF)'; }
    }
    return off;
  }

  window.WorldSurvival = { state: state, tune: tune, diveOffset: diveOffset, damage: damage, die: die, respawn: respawn, spots: spots, active: active,
    addSpot: addSpot, removeSpot: removeSpot, setActive: setActive, registerRestPoint: registerRestPoint, nearRest: nearRest, saveHere: saveHere, isAuto: function () { return !saved.active || saved.active === 'auto'; } };
})();
