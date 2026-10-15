/* world-skydock.js — THE SKY DOCK (owner 2026-10-01): the top floor of the city connects to a launch deck where you take off on a hover ship, with a vendor who sells radars & gadgets,
 * gear, flying mounts and SHIP UPGRADES. Sparks are closed-loop points (this is a SINK).
 *
 *   SHIP UPGRADES (hover rides: boards, cars, skiff, flying mounts):  engine +6% top speed/level · handling +8% turn/level · hull +10 race HP/level.   3 levels each, cost 300 / 700 / 1500.
 *   WorldSkyDock.mult() -> { speed, turn, hull }   (world-mount-ride feelOf multiplies by it)   · level(id) · upgrade(id) -> {ok,msg}
 *   WorldSkyDock.build({ THREE, scene, anchor:{x,z,y}, heightAt?, getPlayer, U?, yaw? }) -> { group, pads, vendor, update(dt), dispose() }
 *        4 launch pads on a ring around the anchor + the vendor kiosk (sign faces the lift side, text reads correctly from both sides) + proximity buttons: SKY DOCK SHOP / LAUNCH
 *   WorldSkyDock.openShop() · launch(i)   Shop tabs: GADGETS (WorldGadgets) · GEAR (WorldGear armory) · MOUNTS (flying first) · SHIP UPGRADES
 * Persistence: localStorage 'shd_dock_v1'.
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, KEY = 'shd_dock_v1';
  var UPGRADES = {
    engine: { name: 'Engine tuning', per: 0.06, cost: [300, 700, 1500], note: '+6% top speed per level' },
    handling: { name: 'Steering vanes', per: 0.08, cost: [300, 700, 1500], note: '+8% turning per level' },
    hull: { name: 'Hull plating', per: 10, cost: [300, 700, 1500], note: '+10 race HP per level' }
  };
  var MAXL = 3;
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.lv) return j; } catch (e) { } return { lv: {} }; }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function level(id) { return S.lv[id] || 0; }
  function mult() { return { speed: 1 + UPGRADES.engine.per * level('engine'), turn: 1 + UPGRADES.handling.per * level('handling'), hull: UPGRADES.hull.per * level('hull') }; }
  function upgrade(id) {
    var u = UPGRADES[id]; if (!u) return { ok: false, msg: 'Unknown upgrade' }; var L = level(id); if (L >= MAXL) return { ok: false, msg: u.name + ' is maxed' };
    var cost = u.cost[L], sp = root.ShdSparks; if (!sp || !sp.spend || !sp.spend(cost, 'ship-upgrade', id)) return { ok: false, msg: 'Needs ' + cost + ' Sparks' };
    S.lv[id] = L + 1; save(); return { ok: true, msg: u.name + ' level ' + (L + 1) };
  }

  // ---------- pure helpers (tested) ----------
  /* pad positions on a ring: 4 pads facing OUTWARD from the anchor, first at yaw0 */
  function padLayout(anchor, ringR, yaw0) { var out = []; for (var i = 0; i < 4; i++) { var a = (yaw0 || 0) + i * Math.PI / 2; out.push({ x: anchor.x + Math.sin(a) * ringR, z: anchor.z + Math.cos(a) * ringR, y: anchor.y, yaw: a }); } return out; }
  /* which owned ride to launch on: flying mounts first (priciest), else null */
  function pickRide(owned, def) { var best = null, bp = -1; (owned || []).forEach(function (m) { var d = def(m.id); if (d && d.flying && (d.price || 0) > bp) { bp = d.price || 0; best = d.id; } }); return best; }

  // ---------- visuals ----------
  function padMesh(THREE, U) {
    var g = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(5 * U, 5.4 * U, 0.4 * U, 32), new THREE.MeshStandardMaterial({ color: 0x0c1626, metalness: 0.7, roughness: 0.35, emissive: 0x06202e, emissiveIntensity: 0.6 })); disc.position.y = 0.2 * U; g.add(disc);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(4.6 * U, 0.14 * U, 8, 40), new THREE.MeshBasicMaterial({ color: 0x27e0ff, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45 * U; g.add(ring);
    var ring2 = ring.clone(); ring2.material = new THREE.MeshBasicMaterial({ color: 0xffcf4a, fog: false }); ring2.scale.setScalar(0.62); g.add(ring2);
    for (var i = 0; i < 3; i++) { var ch = new THREE.Mesh(new THREE.ConeGeometry(0.9 * U, 1.4 * U, 3), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.85, fog: false })); ch.rotation.x = Math.PI / 2; ch.position.set(0, 0.5 * U, (1.2 + i * 1.5) * U); ch.scale.set(1, 1, 0.5); g.add(ch); }   // chevrons point along +z (the pad's launch direction)
    var beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * U, 0.3 * U, 22 * U, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.22, depthWrite: false, fog: false })); beacon.position.y = 11 * U; g.add(beacon);
    return g;
  }
  function signTex(THREE, lines) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
    var g = cv.getContext('2d'); g.fillStyle = '#080d18'; g.fillRect(0, 0, 512, 160); g.strokeStyle = '#e8c45c'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 150); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e8c45c'; g.font = '900 52px Orbitron, Arial, sans-serif'; g.fillText(lines[0], 256, 62); g.fillStyle = '#27e0ff'; g.font = '700 30px Rajdhani, Arial, sans-serif'; g.fillText(lines[1], 256, 120);
    var t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function kioskMesh(THREE, U) {
    var g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x151b26, metalness: 0.5, roughness: 0.5 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0x7a5a10, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4 });
    var base = new THREE.Mesh(new THREE.BoxGeometry(6 * U, 1.1 * U, 2.2 * U), dark); base.position.y = 0.55 * U; g.add(base); var top = new THREE.Mesh(new THREE.BoxGeometry(6.4 * U, 0.2 * U, 2.6 * U), gold); top.position.y = 1.2 * U; g.add(top);
    [-3, 3].forEach(function (x) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * U, 0.12 * U, 4 * U, 6), gold); p.position.set(x * U, 2.1 * U, -1 * U); g.add(p); });
    var roof = new THREE.Mesh(new THREE.BoxGeometry(7 * U, 0.25 * U, 3.4 * U), dark); roof.position.set(0, 4.2 * U, -0.5 * U); g.add(roof); var edge = new THREE.Mesh(new THREE.BoxGeometry(7.1 * U, 0.1 * U, 0.1 * U), new THREE.MeshBasicMaterial({ color: 0x27e0ff, fog: false })); edge.position.set(0, 4.05 * U, 1.2 * U); g.add(edge);
    var tex = signTex(THREE, ['SKY DOCK', 'GADGETS · SHIPS · UPGRADES']), geo = new THREE.PlaneGeometry(5.6 * U, 1.75 * U);
    [0, Math.PI].forEach(function (flip) { var s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, fog: false })); s.position.set(0, 5.5 * U, (flip ? -0.52 : 0.52) * U - 0.5 * U); s.rotation.y = flip; g.add(s); });   // front reads from the +z side, back plane reads from behind
    var npc = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4 * U, 1.1 * U, 4, 8), new THREE.MeshStandardMaterial({ color: 0x27e0ff, emissive: 0x0a4a5a, emissiveIntensity: 0.5 })), head = new THREE.Mesh(new THREE.SphereGeometry(0.36 * U, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8d7c0 }));
    body.position.y = 1.25 * U; head.position.y = 2.35 * U; npc.add(body); npc.add(head); npc.position.set(0, 1.2 * U, -0.2 * U); g.add(npc); g.userData.npc = npc;
    return g;
  }

  // ---------- shop panel ----------
  var panel = null, tab = 'gadgets';
  function closeShop() { if (panel) { panel.remove(); panel = null; } }
  function renderShop() {
    if (!panel) return; var B = 'background:linear-gradient(180deg,rgba(0,255,156,.28),rgba(0,120,80,.4));border:1px solid #00ff9c;border-radius:7px;color:#eafff6;padding:4px 10px;cursor:pointer;font:700 12px Rajdhani,sans-serif', G = B.replace(/0,255,156/g, '232,196,92').replace('#00ff9c', '#e8c45c').replace('0,120,80', '120,80,10').replace('#eafff6', '#ffe9b0');
    var sp = root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0, h = '<div style="opacity:.7;margin-bottom:6px">Sparks ' + sp + '</div><div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' + [['gadgets', 'GADGETS'], ['gear', 'GEAR'], ['mounts', 'MOUNTS'], ['upgrades', 'SHIP UPGRADES']].map(function (t) { return '<button data-t="' + t[0] + '" style="' + (tab === t[0] ? G : B) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (tab === 'gadgets' && root.WorldGadgets) {
      root.WorldGadgets.CATALOG.forEach(function (c) { var st = root.WorldGadgets.state(), have = c.id === 'scent' ? st.scent : (root.WorldGadgets.has(c.id) ? 1 : 0), cap = c.id === 'scent' ? have >= c.stack : have > 0;
        h += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between"><b>' + c.name + (c.id === 'scent' ? ' <small>x' + have + '</small>' : '') + '</b><span style="opacity:.6">' + c.price + '&#9889;</span></div><small style="opacity:.65">' + c.note + '</small><div>' + (cap ? '<small style="opacity:.6">owned</small>' : '<button data-a="gbuy" data-i="' + c.id + '" style="' + G + '">BUY</button>') + '</div></div>'; });
    } else if (tab === 'gear') {
      h += '<div style="padding:8px 0">Shields, upgrades and cosmetics are sold at the Armory.</div><button data-a="armory" style="' + G + '">OPEN ARMORY</button>';
    } else if (tab === 'mounts' && root.WorldMounts) {
      var cat = root.WorldMounts.CATALOG.filter(function (m) { return m.kind === 'mount' || m.kind === 'board' || m.flying; }).sort(function (a, b) { return (b.flying ? 1 : 0) - (a.flying ? 1 : 0) || a.price - b.price; });
      cat.forEach(function (m) { var own = root.WorldMounts.has(m.id); h += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between"><b>' + m.name + (m.flying ? ' <small style="color:#27e0ff">FLYING</small>' : '') + '</b><span style="opacity:.6">' + (own ? 'owned' : m.price + '&#9889;') + '</span></div><small style="opacity:.65">' + (m.note || '') + '</small><div>' + (own ? '' : '<button data-a="mbuy" data-i="' + m.id + '" style="' + G + '">BUY</button>') + '</div></div>'; });
    } else if (tab === 'upgrades') {
      Object.keys(UPGRADES).forEach(function (id) { var u = UPGRADES[id], L = level(id); h += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between"><b>' + u.name + ' <small>L' + L + '/' + MAXL + '</small></b><span style="opacity:.6">' + (L >= MAXL ? 'max' : u.cost[L] + '&#9889;') + '</span></div><small style="opacity:.65">' + u.note + ' · applies to every hover ship</small><div>' + (L >= MAXL ? '' : '<button data-a="up" data-i="' + id + '" style="' + G + '">UPGRADE</button>') + '</div></div>'; });
    }
    panel.querySelector('#dockBody').innerHTML = h + '<div id="dockMsg" style="color:#e8c45c;min-height:18px;margin-top:6px"></div>';
  }
  function openShop() {
    if (typeof document === 'undefined') return; closeShop(); panel = document.createElement('div'); panel.id = 'dockPanel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9650;width:min(94vw,460px);max-height:84vh;overflow:auto;padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font:900 16px Orbitron,sans-serif;letter-spacing:.14em"><span>SKY DOCK EXCHANGE</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div id="dockBody"></div>'; document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a],[data-t]'); if (!t) return; if (t.dataset.t) { tab = t.dataset.t; return renderShop(); } var a = t.dataset.a, id = t.dataset.i, r; if (a === 'x') return closeShop();
      if (a === 'gbuy') r = root.WorldGadgets.buy(id); else if (a === 'up') r = upgrade(id); else if (a === 'armory') { closeShop(); if (root.WorldGear) root.WorldGear.open(); return; } else if (a === 'mbuy') { var b = root.WorldMounts.buy(id); r = { ok: !!b.ok, msg: b.ok ? 'Bought ' + id : (b.msg || b.why || 'Not enough Sparks') }; }
      renderShop(); var m = panel && panel.querySelector('#dockMsg'); if (m && r) m.textContent = r.msg; if (r) toast(r.msg); }); renderShop();
  }
  function launch(pad) {
    var R = root.__mountRide, Mo = root.WorldMounts; if (!R || !Mo) { toast('Ride system not ready'); return false; }
    var id = pickRide(Mo.owned(), function (i) { return Mo.def(i); }); if (!id) { toast('You need a flying ride: buy one from the dock vendor'); return false; }
    R.summon(id); if (R.mount) R.mount(); toast('Launching on ' + (Mo.def(id).name)); return true;
  }

  // ---------- build ----------
  function build(o) {
    var THREE = o.THREE, U = o.U || U0, A = o.anchor, g = new THREE.Group(); g.name = 'sky-dock'; var hy = A.y;
    var ringR = o.ringR || 100, vendR = o.vendorR || 62, pads = padLayout({ x: A.x, z: A.z, y: hy }, ringR, o.yaw || 0), padMeshes = [];   // ringR / vendorR are WORLD UNITS (the Sky Nexus deck is 144 units = 37 m wide)
    pads.forEach(function (p) { var m = padMesh(THREE, U); m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; g.add(m); padMeshes.push(m); });
    var vyaw = (o.yaw || 0) + Math.PI / 4, vr = vendR, vend = { x: A.x + Math.sin(vyaw) * vr, z: A.z + Math.cos(vyaw) * vr, y: hy }, k = kioskMesh(THREE, U);
    k.position.set(vend.x, vend.y, vend.z); k.rotation.y = Math.atan2(-Math.sin(vyaw), -Math.cos(vyaw)); g.add(k);   // sign faces the anchor (the lift side)
    o.scene.add(g); var shopBtn = null, launchBtn = null, t = 0, shown = { s: false, l: false };
    function btn(txt, bottom, fn) { var b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'position:fixed;left:50%;bottom:' + bottom + 'px;transform:translateX(-50%);z-index:9500;background:linear-gradient(180deg,rgba(232,196,92,.35),rgba(120,80,10,.5));border:1px solid #e8c45c;border-bottom-width:3px;border-radius:10px;color:#ffe9b0;padding:8px 16px;cursor:pointer;font:700 14px Rajdhani,sans-serif;letter-spacing:.08em'; b.onclick = fn; document.body.appendChild(b); return b; }
    function update(dt) {
      t += dt; k.userData.npc.position.y = 1.2 * U + Math.sin(t * 2) * 0.05 * U; padMeshes.forEach(function (m, i) { m.children[1].rotation.z = t * (i % 2 ? 0.5 : -0.5); });
      var pl = o.getPlayer && o.getPlayer(); if (!pl || !pl.pos || typeof document === 'undefined') return;
      var onDeck = Math.abs(pl.pos.y - hy) < 6 * U, ns = onDeck && Math.hypot(pl.pos.x - vend.x, pl.pos.z - vend.z) < 9 * U, nl = onDeck && pads.some(function (p) { return Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 5.5 * U; });
      if (ns !== shown.s) { shown.s = ns; if (ns) shopBtn = btn('SKY DOCK SHOP', 190, openShop); else if (shopBtn) { shopBtn.remove(); shopBtn = null; } }
      if (nl !== shown.l) { shown.l = nl; if (nl) launchBtn = btn('LAUNCH', 140, function () { launch(); }); else if (launchBtn) { launchBtn.remove(); launchBtn = null; } }
    }
    return { group: g, pads: pads, vendor: vend, update: update, dispose: function () { if (shopBtn) shopBtn.remove(); if (launchBtn) launchBtn.remove(); o.scene.remove(g); } };
  }
  root.WorldSkyDock = { UPGRADES: UPGRADES, MAXL: MAXL, level: level, mult: mult, upgrade: upgrade, padLayout: padLayout, pickRide: pickRide, build: build, openShop: openShop, closeShop: closeShop, launch: launch, _reset: function () { S = { lv: {} }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
