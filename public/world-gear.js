/* world-gear.js — THE ARMORY (owner 2026-10-01: "items upgrades and cosmetics shields etc"): shields that really reduce/absorb damage, upgrade levels, and cosmetics. Bought with Sparks (a SINK).
 *
 *   SHIELDS (equip one):  buckler  -15% damage            (150)   upgrades +5%/level  (max L3)
 *                         tower    -30% damage            (600)   upgrades +4%/level
 *                         aegis    barrier: absorbs 60 dmg, recharges after 25 s untouched   (1500)  upgrades +20 absorb/level
 *   COSMETICS (equip one per slot): halo (head) · aura (body glow colour) · trail (feet)  — visual only, never affect stats
 *   WorldGear.absorb(dmg) -> dmg after shield (host calls it at the top of the damage handler)   WorldGear.tick(dt) (recharge)
 *   WorldGear.buy(id) · equip(id) · unequip(slot) · upgrade(id) · owned() · state() · open() · close()
 *   WorldGear.buildVisuals({THREE, scene, getAvatar}) -> { update(dt), flash() }   (follows the avatar; survives character swaps)
 * Persistence: localStorage 'shd_gear_v1'. Prices/reductions live in CATALOG so tuning is one table.
 */
(function (root) {
  'use strict';
  var CATALOG = [
    { id: 'buckler', slot: 'shield', name: 'Buckler', kind: 'reduce', base: 0.15, per: 0.05, price: 150, up: [200, 400], note: 'Light round shield. -15% damage.' },
    { id: 'tower', slot: 'shield', name: 'Tower Shield', kind: 'reduce', base: 0.30, per: 0.04, price: 600, up: [500, 900], note: 'Heavy plate. -30% damage.' },
    { id: 'aegis', slot: 'shield', name: 'Aegis Barrier', kind: 'barrier', base: 60, per: 20, price: 1500, up: [900, 1600], note: 'Energy barrier: soaks 60 damage, recharges when you are left alone.' },
    { id: 'halo', slot: 'halo', name: 'Gold Halo', kind: 'cosmetic', price: 300, color: 0xffd36a, note: 'A ring of light above your head.' },
    { id: 'halo-void', slot: 'halo', name: 'Void Halo', kind: 'cosmetic', price: 300, color: 0xb06bff, note: 'Violet ring.' },
    { id: 'aura-emerald', slot: 'aura', name: 'Emerald Aura', kind: 'cosmetic', price: 400, color: 0x00ff9c, note: 'A soft emerald glow around you.' },
    { id: 'aura-ember', slot: 'aura', name: 'Ember Aura', kind: 'cosmetic', price: 400, color: 0xff7a2a, note: 'Warm ember glow.' },
    { id: 'trail-neon', slot: 'trail', name: 'Neon Trail', kind: 'cosmetic', price: 350, color: 0x27e0ff, note: 'Cyan light follows your steps.' }
  ];
  var MAXL = 3, RECHARGE_S = 25, KEY = 'shd_gear_v1';
  var byId = {}; CATALOG.forEach(function (c) { byId[c.id] = c; });
  function fresh() { return { owned: {}, equipped: {}, barrier: null, sinceHit: 99 }; }
  var S = (function () { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.owned) { j.sinceHit = 99; return j; } } catch (e) { } return fresh(); })();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify({ owned: S.owned, equipped: S.equipped })); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function lvl(id) { return S.owned[id] || 0; }                       // 0 = not owned, 1..MAXL
  function owned() { return CATALOG.filter(function (c) { return lvl(c.id) > 0; }).map(function (c) { return { id: c.id, level: lvl(c.id), equipped: S.equipped[c.slot] === c.id }; }); }
  function shield() { var id = S.equipped.shield; return id && lvl(id) ? byId[id] : null; }
  function power(c) { return c.base + c.per * (lvl(c.id) - 1); }     // reduction fraction, or barrier hp
  function barrierMax() { var c = shield(); return c && c.kind === 'barrier' ? power(c) : 0; }
  function sync() { var m = barrierMax(); if (!m) S.barrier = null; else if (S.barrier == null || S.barrier > m) S.barrier = m; }
  function buy(id) {
    var c = byId[id]; if (!c) return { ok: false, msg: 'Unknown item' }; if (lvl(id)) return { ok: false, msg: 'Already owned' };
    var sp = root.ShdSparks; if (!sp || !sp.spend || !sp.spend(c.price, 'gear', id)) return { ok: false, msg: 'Needs ' + c.price + ' Sparks' };
    S.owned[id] = 1; if (!S.equipped[c.slot]) S.equipped[c.slot] = id; sync(); save(); return { ok: true, msg: c.name + ' acquired' };
  }
  function upgrade(id) {
    var c = byId[id]; if (!c || !lvl(id)) return { ok: false, msg: 'Not owned' }; if (c.kind === 'cosmetic') return { ok: false, msg: 'Cosmetics do not upgrade' };
    var L = lvl(id); if (L >= MAXL) return { ok: false, msg: 'Max level' };
    var cost = c.up[L - 1], sp = root.ShdSparks; if (!sp || !sp.spend || !sp.spend(cost, 'gear-up', id)) return { ok: false, msg: 'Needs ' + cost + ' Sparks' };
    S.owned[id] = L + 1; sync(); if (S.equipped[c.slot] === id && c.kind === 'barrier') S.barrier = barrierMax(); save(); return { ok: true, msg: c.name + ' is now level ' + (L + 1) };
  }
  function equip(id) { var c = byId[id]; if (!c || !lvl(id)) return { ok: false, msg: 'Not owned' }; S.equipped[c.slot] = id; sync(); save(); return { ok: true, msg: c.name + ' equipped' }; }
  function unequip(slot) { delete S.equipped[slot]; sync(); save(); return { ok: true }; }
  /* damage in -> damage out. Reduce shields shave a fraction (min 1 dmg of any hit that lands); the barrier soaks until empty, then the rest goes through. */
  var onFlash = null;
  function absorb(dmg) {
    S.sinceHit = 0; var c = shield(); if (!c || !(dmg > 0)) return dmg;
    if (c.kind === 'reduce') { if (onFlash) onFlash(); return Math.max(1, Math.round(dmg * (1 - power(c)))); }
    sync(); var soak = Math.min(S.barrier || 0, dmg); S.barrier = (S.barrier || 0) - soak; if (soak > 0 && onFlash) onFlash(); return dmg - soak;
  }
  function tick(dt) { S.sinceHit += dt; var m = barrierMax(); if (m && S.sinceHit >= RECHARGE_S && (S.barrier || 0) < m) S.barrier = Math.min(m, (S.barrier || 0) + (m / 6) * dt); }
  function state() { sync(); return { equipped: Object.assign({}, S.equipped), barrier: S.barrier, barrierMax: barrierMax(), reduction: (shield() && shield().kind === 'reduce') ? power(shield()) : 0 }; }

  // ---------- visuals (follow the avatar; never parented to it, so character swaps cannot delete them) ----------
  function buildVisuals(o) {
    var THREE = o.THREE, g = new THREE.Group(); g.name = 'gear-visuals'; o.scene.add(g);
    var U = o.U || 7 / 1.8, H = (o.height || 7) * 1.0, t = 0, flashT = 0;
    var halo = new THREE.Mesh(new THREE.TorusGeometry(0.55 * U * 0.5, 0.05 * U, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false })); halo.rotation.x = Math.PI / 2; halo.visible = false; g.add(halo);
    var aura = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.12, depthWrite: false, fog: false })); aura.visible = false; g.add(aura);
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * U * 0.5, 0.5 * U * 0.5, 0.08 * U, 6), new THREE.MeshStandardMaterial({ color: 0xc8d4e0, metalness: 0.7, roughness: 0.35, emissive: 0x0a2a4a, emissiveIntensity: 0.4 })); plate.rotation.z = Math.PI / 2; plate.visible = false; g.add(plate);
    var bar = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, fog: false })); bar.visible = false; g.add(bar);
    onFlash = function () { flashT = 0.35; };
    function update(dt) {
      var av = o.getAvatar && o.getAvatar(); if (!av) { g.visible = false; return; } g.visible = av.visible !== false; t += dt; tick(dt);
      g.position.copy(av.position); g.rotation.y = av.rotation.y;
      var eq = S.equipped, h = eq.halo && byId[eq.halo], a = eq.aura && byId[eq.aura], sh = shield();
      halo.visible = !!h; if (h) { halo.material.color.setHex(h.color); halo.position.y = H * 1.08 + Math.sin(t * 2) * 0.05 * U; halo.rotation.z = t * 0.8; }
      aura.visible = !!a; if (a) { aura.material.color.setHex(a.color); aura.position.y = H * 0.5; aura.scale.set(H * 0.38, H * 0.56, H * 0.38); aura.material.opacity = 0.09 + 0.04 * Math.sin(t * 2.4); }
      plate.visible = !!sh && sh.kind === 'reduce'; if (plate.visible) { plate.position.set(-0.34 * U, H * 0.5, 0.15 * U); plate.scale.setScalar(sh.id === 'tower' ? 1.5 : 1); }
      var bm = barrierMax(); bar.visible = bm > 0 && (S.barrier || 0) > 0.5; if (bar.visible) { var f = (S.barrier || 0) / bm; bar.position.y = H * 0.5; bar.scale.set(H * 0.5, H * 0.62, H * 0.5); bar.material.opacity = 0.05 + 0.1 * f + (flashT > 0 ? 0.35 * (flashT / 0.35) : 0); }
      if (flashT > 0) flashT -= dt;
    }
    return { group: g, update: update, flash: onFlash, dispose: function () { o.scene.remove(g); } };
  }

  // ---------- armory panel ----------
  var panel = null;
  function close() { if (panel) { panel.remove(); panel = null; } }
  function render() {
    if (!panel) return; var B = 'background:linear-gradient(180deg,rgba(0,255,156,.28),rgba(0,120,80,.4));border:1px solid #00ff9c;border-radius:7px;color:#eafff6;padding:4px 9px;cursor:pointer;font:700 12px Rajdhani,sans-serif;margin:2px 3px 0 0', G = B.replace(/0,255,156/g, '232,196,92').replace('#00ff9c', '#e8c45c').replace('0,120,80', '120,80,10').replace('#eafff6', '#ffe9b0'), sp = root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0, st = state();
    var h = '<div style="opacity:.7;margin-bottom:6px">Sparks ' + sp + (st.barrierMax ? ' · barrier ' + Math.round(st.barrier || 0) + '/' + st.barrierMax : '') + (st.reduction ? ' · shield -' + Math.round(st.reduction * 100) + '%' : '') + '</div>';
    ['shield', 'halo', 'aura', 'trail'].forEach(function (slot) {
      h += '<div style="color:#e8c45c;font-weight:700;margin:8px 0 3px;text-transform:uppercase">' + slot + 's</div>';
      CATALOG.filter(function (c) { return c.slot === slot; }).forEach(function (c) {
        var L = lvl(c.id), on = S.equipped[slot] === c.id;
        h += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between"><b>' + c.name + (L ? ' <small style="opacity:.7">L' + L + '</small>' : '') + '</b><span style="opacity:.6">' + (L ? (on ? 'equipped' : 'owned') : c.price + '&#9889;') + '</span></div><small style="opacity:.65">' + c.note + '</small><div>' +
          (!L ? '<button data-a="buy" data-i="' + c.id + '" style="' + G + '">BUY ' + c.price + '</button>' : (on ? '<button data-a="off" data-s="' + slot + '" style="' + B + '">UNEQUIP</button>' : '<button data-a="eq" data-i="' + c.id + '" style="' + B + '">EQUIP</button>') + (c.kind !== 'cosmetic' && L < MAXL ? '<button data-a="up" data-i="' + c.id + '" style="' + G + '">UPGRADE ' + c.up[L - 1] + '</button>' : '')) + '</div></div>';
      });
    });
    if (root.WorldCampfire) {
      var cf = root.WorldCampfire, cs = cf.state();
      h += '<div style="color:#e8c45c;font-weight:700;margin:10px 0 3px">CAMPFIRE</div><div style="opacity:.7;font-size:12px">Camp kit ' + cs.kits + ' &middot; logs ' + cs.logs + ' &middot; light it with the Backslash key or the button. Warmth heals, animals keep away.</div><div style="margin:4px 0">' +
        '<button data-a="ckit" style="' + G + '">KIT ' + cf.PRICES.kit + '</button><button data-a="clog" style="' + G + '">LOG ' + cf.PRICES.log + '</button><button data-a="clight" style="' + B + '">LIGHT FIRE</button><button data-a="caddlog" style="' + B + '">ADD LOG</button></div><div>' +
        Object.keys(cf.STYLES).map(function (k) { var st = cf.STYLES[k], own = cs.owned.indexOf(k) >= 0; return '<button data-a="cstyle" data-i="' + k + '" style="' + (cs.style === k ? G : B) + '">' + st.name + (own ? '' : ' ' + st.price) + '</button>'; }).join('') + '</div>';
    }
    if (root.WorldGadgets) {
      h += '<div style="color:#e8c45c;font-weight:700;margin:10px 0 3px">GADGETS</div>';
      root.WorldGadgets.CATALOG.forEach(function (c) {
        var have = c.id === 'scent' ? root.WorldGadgets.state().scent : (root.WorldGadgets.has(c.id) ? 1 : 0), cap = c.id === 'scent' ? have >= c.stack : have > 0;
        h += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between"><b>' + c.name + (c.id === 'scent' ? ' <small style="opacity:.7">x' + have + '</small>' : '') + '</b><span style="opacity:.6">' + c.price + '&#9889;</span></div><small style="opacity:.65">' + c.note + '</small><div>' +
          (cap ? '<small style="opacity:.6">' + (c.id === 'scent' ? 'max carried' : 'owned') + '</small>' : '<button data-a="gbuy" data-i="' + c.id + '" style="' + G + '">BUY ' + c.price + '</button>') + (c.id === 'scent' && have > 0 ? '<button data-a="guse" style="' + B + '">USE NOW</button>' : '') + '</div></div>';
      });
    }
    panel.querySelector('#gearBody').innerHTML = h + '<div id="gearMsg" style="color:#e8c45c;min-height:18px;margin-top:6px"></div>';
  }
  function open() {
    if (typeof document === 'undefined') return; close(); panel = document.createElement('div'); panel.id = 'gearPanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9600;width:min(94vw,440px);max-height:84vh;overflow:auto;padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(255,90,110,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#ff7a8a;font:900 16px Orbitron,sans-serif;letter-spacing:.14em"><span>ARMORY</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div id="gearBody"></div>'; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a'), id = t.getAttribute('data-i'), r; if (a === 'x') return close();
      if (a === 'ckit') r = root.WorldCampfire.buyKit(); else if (a === 'clog') r = root.WorldCampfire.buyLog(); else if (a === 'clight') r = root.__campfire ? root.__campfire.place() : { ok: false, msg: 'Not ready' }; else if (a === 'caddlog') r = root.__campfire ? root.__campfire.addLog() : { ok: false, msg: 'Not ready' }; else if (a === 'cstyle') { r = root.WorldCampfire.state().owned.indexOf(id) >= 0 ? root.WorldCampfire.equipStyle(id) : root.WorldCampfire.buyStyle(id); } else if (a === 'gbuy') r = root.WorldGadgets.buy(id); else if (a === 'guse') r = root.WorldGadgets.useScent(); else if (a === 'buy') r = buy(id); else if (a === 'eq') r = equip(id); else if (a === 'up') r = upgrade(id); else if (a === 'off') r = unequip(t.getAttribute('data-s'));
      render(); var m = panel && panel.querySelector('#gearMsg'); if (m && r && r.msg) m.textContent = r.msg; if (r && r.msg) toast(r.msg); }); render();
  }
  root.WorldGear = { CATALOG: CATALOG, MAXL: MAXL, RECHARGE_S: RECHARGE_S, buy: buy, upgrade: upgrade, equip: equip, unequip: unequip, absorb: absorb, tick: tick, owned: owned, state: state, buildVisuals: buildVisuals, open: open, close: close, _reset: function () { S = fresh(); save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
