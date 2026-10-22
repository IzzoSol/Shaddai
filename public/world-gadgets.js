/* world-gadgets.js — GADGETS (owner 2026-10-01: "radars, jet packs, binoculars, scent away for wolves"): bought with Sparks, used from an on-screen quickbar (also works on touch) + keys.
 *
 *   RADAR       (400)  round HUD radar: red blips = enemies, green = your bots, rim blips = beyond range. Toggle  [  (BracketLeft) or the quickbar.
 *   BINOCULARS  (250)  hold ' (Quote) or the quickbar: smooth 3.2x zoom.
 *   JETPACK     (1800) hold Space while airborne (after a 0.3 s grace so normal jumps are untouched): climbs at up to 8 m/s, burns 28 fuel/s of 100, recharges 20/s on the ground.
 *   SCENT-AWAY  (60 each, stack 5) press ; (Semicolon) or the quickbar: 90 s during which wolves mostly ignore you (WorldMobs.setScentless).
 *
 *   VOID RESPIRATOR (900, worn) owner 2026-10-15: breathe in the Void Castle gas. Sets the perks world-realm-zones.js already reads:
 *               mask-gas 1 · resist-poison 0.5 · resist-void 0.2 (ShdInv.setPerk). Passive once bought.
 *   EMP CHARGE  (150 each, stack 3) press . (Period) or the quickbar: 30 m pulse - every dragon in range is STAGGERED 2.5 s and takes 40 storm
 *               (lightning) damage; their resistances still apply.
 *   Pure helpers (tested): radarPlot(blips, me, yaw, rangeM, sizePx, U) · jetStep(state, dt, {airborne, hold, vy}) · zoomK(cur, want, dt) · empHits(dragons, me, rangeU)
 *   Runtime: WorldGadgets.buy(id) · owned() · useScent() · setRadar(on) · setZoom(on) · jetStep(dt, input) · applyFov(camera, dt) · buildUI({getPlayer, getYaw, getBlips, onScent}) · tick(dt)
 * Persistence: localStorage 'shd_gadgets_v1'. Sparks are closed-loop points; this is a SINK.
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, KEY = 'shd_gadgets_v1';
  var CATALOG = [
    { id: 'radar', name: 'Radar', price: 400, key: 'BracketLeft', icon: 'RADAR', note: 'Shows enemies and your bots around you.' },
    { id: 'binoculars', name: 'Binoculars', price: 250, key: 'Quote', icon: 'SCOPE', note: 'Hold to zoom 3.2x.' },
    { id: 'jetpack', name: 'Jetpack', price: 1800, key: 'Space', icon: 'JET', note: 'Hold Space in the air to climb. 100 fuel, recharges on the ground.' },
    { id: 'scent', name: 'Scent-Away', price: 60, key: 'Semicolon', icon: 'SCENT', stack: 5, note: 'Wolves ignore you for 90 s.' },
    { id: 'respirator', name: 'Void Respirator', price: 900, icon: 'MASK', wear: true, note: 'Breathe in the Void Castle gas. Gas damage way down, void damage -20%.' },
    { id: 'desert-wrap', name: 'Desert Wrap', price: 700, icon: 'WRAP', wear: true, note: 'Sand-cloth wrap for head and feet. Shrugs off the Searing Sun of the Sand Sea.' },
    { id: 'frost-kit', name: 'Frost Kit', price: 700, icon: 'FROST', wear: true, note: 'Ice cleats + face shield. Walk the Arctic Vault without the Deep Cold sapping you.' },
    { id: 'emp', name: 'EMP Charge', price: 150, key: 'Period', icon: 'EMP', stack: 3, note: '30 m pulse: staggers dragons 2.5 s and hits them for 40 storm damage.' }
  ];
  var EMP = { rangeM: 30, stagger: 2.5, dmg: 40 };
  /* pure: which dragons an EMP at me hits. dragons = [{id, f:{x,z}, defeated, ridden}], rangeU in world units */
  function empHits(dragons, me, rangeU) {
    var out = []; (dragons || []).forEach(function (d) { if (!d || d.defeated || d.ridden || !d.f) return; var dx = d.f.x - me.x, dz = d.f.z - me.z; if (dx * dx + dz * dz <= rangeU * rangeU) out.push(d.id); }); return out;
  }
  var JET = { accel: 26, vmax: 8, drain: 28, regen: 20, fuelMax: 100, grace: 0.3, empty: 1.0 }, ZOOM = { mul: 3.2, rate: 7 }, SCENT_S = 90, RADAR_M = 120;
  var byId = {}; CATALOG.forEach(function (c) { byId[c.id] = c; });
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.owned) return j; } catch (e) { } return { owned: {}, scent: 0, emp: 0, radarOn: true }; }
  var S = load(); S.fuel = JET.fuelMax; S.airT = 0; S.lockT = 0; S.zoomK = 0; S.zoomWant = false; S.scentUntil = 0;
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify({ owned: S.owned, scent: S.scent, emp: S.emp || 0, radarOn: S.radarOn })); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }

  // ---------- pure helpers ----------
  /* world blips -> radar pixels. Forward (the player's facing) is UP. yaw: 0 = +z, clockwise (the world's heading convention). Beyond range = clamped to the rim, edge:true. */
  function radarPlot(blips, me, yaw, rangeM, sizePx, U) {
    U = U || U0; var half = sizePx / 2, out = [], sy = Math.sin(yaw), cy = Math.cos(yaw);
    for (var i = 0; i < blips.length; i++) {
      var b = blips[i], dx = (b.x - me.x) / U, dz = (b.z - me.z) / U;
      var fwd = dx * sy + dz * cy, right = -dx * cy + dz * sy;              // metres ahead / to the right of where you face (heading 0 = +z = south, so your right hand is west = -x)
      var d = Math.hypot(fwd, right), k = d > rangeM ? rangeM / d : 1, edge = d > rangeM;
      out.push({ x: half + right * k / rangeM * half * 0.92, y: half - fwd * k / rangeM * half * 0.92, kind: b.kind || 'enemy', type: b.type || '', edge: edge, d: d });
    }
    return out;
  }
  function jetStep(st, dt, inp) {   // st = {fuel, airT, lockT}; inp = {airborne, hold, vy (m/s)} -> {vy, burning, fuel}
    var vy = inp.vy || 0, burning = false;
    st.lockT = Math.max(0, st.lockT - dt);
    if (inp.airborne && inp.hold) st.airT += dt; else st.airT = 0;
    if (inp.airborne && inp.hold && st.airT >= JET.grace && st.fuel > 0 && st.lockT <= 0) {
      burning = true; vy = Math.min(JET.vmax, vy + JET.accel * dt); st.fuel = Math.max(0, st.fuel - JET.drain * dt); if (st.fuel <= 0) st.lockT = JET.empty;
    } else if (!inp.airborne) st.fuel = Math.min(JET.fuelMax, st.fuel + JET.regen * dt);
    return { vy: vy, burning: burning, fuel: st.fuel };
  }
  function zoomK(cur, want, dt) { var tgt = want ? 1 : 0; return cur + (tgt - cur) * Math.min(1, ZOOM.rate * dt); }

  // ---------- runtime ----------
  function has(id) { return !!S.owned[id]; }
  function owned() { return CATALOG.filter(function (c) { return c.id === 'scent' ? S.scent > 0 || S.owned.scent : has(c.id); }).map(function (c) { return c.id; }); }
  function buy(id) {
    var c = byId[id]; if (!c) return { ok: false, msg: 'Unknown gadget' };
    if (c.id === 'scent') { if (S.scent >= c.stack) return { ok: false, msg: 'You carry the maximum (' + c.stack + ')' }; }
    else if (c.id === 'emp') { if ((S.emp || 0) >= c.stack) return { ok: false, msg: 'You carry the maximum (' + c.stack + ')' }; }
    else if (has(id)) return { ok: false, msg: 'Already owned' };
    var sp = root.ShdSparks; if (!sp || !sp.spend || !sp.spend(c.price, 'gadget', id)) return { ok: false, msg: 'Needs ' + c.price + ' Sparks' };
    if (c.id === 'scent') { S.scent++; S.owned.scent = 1; } else if (c.id === 'emp') { S.emp = (S.emp || 0) + 1; S.owned.emp = 1; } else S.owned[id] = 1;
    if (c.wear) wearGear(c.id);
    save(); renderBar(); return { ok: true, msg: c.name + ' ready' };
  }
  var hooks = { onScent: null };
  function useScent() {
    if (S.scent <= 0) return { ok: false, msg: 'No Scent-Away left' }; S.scent--; S.scentUntil = Date.now() + SCENT_S * 1000; save();
    if (hooks.onScent) hooks.onScent(SCENT_S); if (root.__mobs && root.__mobs.setScentless) root.__mobs.setScentless(SCENT_S); renderBar(); toast('Scent-Away: wolves will ignore you for ' + SCENT_S + ' s'); return { ok: true, msg: 'Scent masked' };
  }
  // passive realm gear: the perks world-realm-zones.js reads (never lowers a better perk you already have)
  var WEAR = { respirator: { 'mask-gas': 1, 'resist-poison': 0.5, 'resist-void': 0.2 },
    'desert-wrap': { 'mask-wrap': 1, 'resist-sun': 0.5 },
    'frost-kit': { 'mask-arctic': 3, 'resist-cold': 0.4 } };
  function wearGear(id) {
    var I = root.ShdInv, w = WEAR[id]; if (!I || !I.setPerk || !w) return false;
    Object.keys(w).forEach(function (k) { if (!((+I.perk(k) || 0) >= w[k])) I.setPerk(k, w[k]); }); return true;
  }
  function wearRespirator() { return wearGear('respirator'); }
  function useEmp(me) {
    if ((S.emp || 0) <= 0) return { ok: false, msg: 'No EMP charges left' };
    var D = root.__worldDragons, U = (ui && ui.U) || U0, P = me || (ui && ui.getPlayer && ui.getPlayer() && ui.getPlayer().pos);
    S.emp--; if (!S.emp) S.owned.emp = 0; save(); renderBar();
    var hits = (D && P) ? empHits(D.dragons, P, EMP.rangeM * U) : [];
    hits.forEach(function (id) { var d = D.dragons.filter(function (x) { return x.id === id; })[0]; if (d) d.staggerT = Math.max(d.staggerT || 0, EMP.stagger); try { D.damage(id, EMP.dmg, null, 'lightning'); } catch (e) { } });
    if (root.__hitfx && root.__hitfx.flash) try { root.__hitfx.flash('#5fe0ff'); } catch (e) { }
    toast(hits.length ? 'EMP: ' + hits.length + ' dragon' + (hits.length > 1 ? 's' : '') + ' staggered' : 'EMP fired - nothing in range');
    return { ok: true, hits: hits };
  }
  function setRadar(on) { if (!has('radar')) return false; S.radarOn = !!on; save(); renderBar(); return S.radarOn; }
  function setZoom(on) { S.zoomWant = !!on && has('binoculars'); }
  function jet(dt, input) { if (!has('jetpack')) return { vy: input.vy || 0, burning: false, fuel: S.fuel }; return jetStep(S, dt, input); }
  var baseFov = null;
  function applyFov(camera, dt) {
    S.zoomK = zoomK(S.zoomK, S.zoomWant, dt);
    if (S.zoomK > 0.002) { if (baseFov == null) baseFov = camera.fov; camera.fov = baseFov / (1 + (ZOOM.mul - 1) * S.zoomK); camera.updateProjectionMatrix(); }
    else if (baseFov != null) { camera.fov = baseFov; camera.updateProjectionMatrix(); baseFov = null; }
  }

  // ---------- UI: quickbar + radar ----------
  var bar = null, radar = null, rctx = null, ui = null, acc = 0;
  function renderBar() {
    if (!bar) return; var ids = owned(), h = '';
    CATALOG.forEach(function (c) {
      if (ids.indexOf(c.id) < 0) return; var on = c.id === 'radar' ? S.radarOn : c.id === 'binoculars' ? S.zoomWant : false;
      var extra = c.id === 'scent' ? ' x' + S.scent : c.id === 'emp' ? ' x' + (S.emp || 0) : c.wear ? ' ON' : c.id === 'jetpack' ? ' ' + Math.round(S.fuel) + '%' : '';
      h += '<button data-g="' + c.id + '" title="' + c.name + ' - ' + c.note + '" style="pointer-events:auto;cursor:pointer;margin:2px;padding:5px 9px;border-radius:8px;border:1px solid ' + (on ? '#00ff9c' : '#3a5a6a') + ';background:' + (on ? 'rgba(0,255,156,.22)' : 'rgba(8,14,26,.82)') + ';color:#e9f4ee;font:700 11px Rajdhani,sans-serif;letter-spacing:.06em">' + c.icon + extra + '</button>';
    });
    bar.innerHTML = h;
  }
  function buildUI(o) {
    if (typeof document === 'undefined') return null; ui = o || {}; hooks.onScent = ui.onScent || null;
    bar = document.createElement('div'); bar.id = 'gadgetBar'; bar.style.cssText = 'position:fixed;left:14px;top:340px;z-index:7400;display:flex;flex-direction:column;align-items:flex-start;pointer-events:none';
    radar = document.createElement('canvas'); radar.width = radar.height = 132; radar.style.cssText = 'position:fixed;left:14px;top:200px;z-index:7400;pointer-events:none;border-radius:50%;display:none'; rctx = radar.getContext('2d');
    document.body.appendChild(radar); document.body.appendChild(bar);
    bar.addEventListener('click', function (e) { var t = e.target.closest('[data-g]'); if (!t) return; var id = t.getAttribute('data-g'); if (id === 'radar') setRadar(!S.radarOn); else if (id === 'scent') { var r = useScent(); if (!r.ok) toast(r.msg); } else if (id === 'emp') { var re = useEmp(); if (!re.ok) toast(re.msg); } else if (id === 'binoculars') { setZoom(!S.zoomWant); renderBar(); } });
    addEventListener('keydown', function (e) { if (e.repeat || /input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return; if (e.code === 'BracketLeft') setRadar(!S.radarOn); else if (e.code === 'Semicolon') { var r = useScent(); if (!r.ok) toast(r.msg); } else if (e.code === 'Period') { var re = useEmp(); if (!re.ok) toast(re.msg); } else if (e.code === 'Quote') { setZoom(true); renderBar(); } });
    addEventListener('keyup', function (e) { if (e.code === 'Quote') { setZoom(false); renderBar(); } });
    renderBar(); return { bar: bar, radar: radar };
  }
  function drawRadar() {
    if (!radar || !has('radar') || !S.radarOn || !ui || !ui.getPlayer) { if (radar) radar.style.display = 'none'; return; }
    radar.style.display = 'block'; var P = ui.getPlayer(), yaw = ui.getYaw ? ui.getYaw() : 0, size = radar.width, h = size / 2, c = rctx; if (!P) return;
    c.clearRect(0, 0, size, size); c.fillStyle = 'rgba(4,10,20,.72)'; c.beginPath(); c.arc(h, h, h - 1, 0, 6.283); c.fill(); c.strokeStyle = 'rgba(0,255,156,.55)'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(0,255,156,.2)'; c.lineWidth = 1; [0.33, 0.66].forEach(function (k) { c.beginPath(); c.arc(h, h, (h - 3) * k, 0, 6.283); c.stroke(); }); c.beginPath(); c.moveTo(h, 4); c.lineTo(h, size - 4); c.moveTo(4, h); c.lineTo(size - 4, h); c.stroke();
    var pl = radarPlot(ui.getBlips ? ui.getBlips(P, RADAR_M * (ui.U || U0)) : [], P, yaw, RADAR_M, size, ui.U || U0);
    pl.forEach(function (b) { c.globalAlpha = b.edge ? 0.45 : 1; c.fillStyle = b.kind === 'bot' ? '#00ff9c' : b.kind === 'boss' ? '#ffcf4a' : '#ff4a5e'; c.beginPath(); c.arc(b.x, b.y, b.kind === 'boss' ? 4.5 : 3, 0, 6.283); c.fill(); }); c.globalAlpha = 1;
    c.fillStyle = '#e8f6ff'; c.beginPath(); c.moveTo(h, h - 6); c.lineTo(h - 4, h + 4); c.lineTo(h + 4, h + 4); c.closePath(); c.fill();
  }
  function tick(dt) { acc += dt; if (acc >= 0.1) { acc = 0; drawRadar(); if (bar && has('jetpack')) { var b = bar.querySelector('[data-g=jetpack]'); if (b) b.textContent = 'JET ' + Math.round(S.fuel) + '%'; } } }
  root.WorldGadgets = { CATALOG: CATALOG, JET: JET, ZOOM: ZOOM, SCENT_S: SCENT_S, RADAR_M: RADAR_M, radarPlot: radarPlot, jetStep: jetStep, zoomK: zoomK, buy: buy, owned: owned, has: has, useScent: useScent, useEmp: useEmp, wearRespirator: wearRespirator, empHits: empHits, EMP: EMP, setRadar: setRadar, setZoom: setZoom, jet: jet, jetpackOn: function () { return has('jetpack'); }, applyFov: applyFov, buildUI: buildUI, tick: tick, state: function () { return { fuel: S.fuel, scent: S.scent, radarOn: S.radarOn, zoom: S.zoomK, owned: Object.keys(S.owned) }; }, _reset: function () { S = { owned: {}, scent: 0, radarOn: true, fuel: JET.fuelMax, airT: 0, lockT: 0, zoomK: 0, zoomWant: false, scentUntil: 0 }; baseFov = null; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
