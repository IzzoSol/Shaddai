import io
p='public/world3d.html'
s=io.open(p,encoding='utf8').read()
def rep(a,b):
    global s
    assert a in s, 'MISSING: '+a[:80]
    s=s.replace(a,b,1)

# ---- travel / realm sync replace old travel() ----
a=s.index("function travel(toDesert) {")
b=s.index("/* ───────────────────────── main loop")
TRAVEL = r'''function syncRealm(force) {
  const r = detectRealm(player.root.position);
  if (!force && r === state.realm) return;
  state.realm = r; const pre = r === 'city' ? citySky : REALMS[r].preset; applyPreset(pre, force);
  if (!force) toast(REALMS[r].name);
}
function travelTo(id) {
  const r = REALMS[id]; if (!r || state.fading) return;
  fadeThen(() => {
    state.snap = 1; if (mountedOn) dismount(true);
    if (state.where === 'inside') { state.where = 'city'; sun.castShadow = true; sky.visible = true; motes.visible = true; world.visible = true; }
    player.root.position.set(r.x, 0, r.z); player.yaw = r.yaw || 0; state.cam.yaw = (r.yaw || 0) + Math.PI; syncRealm(true); toast(r.name); writeSave();
  });
}

'''
s=s[:a]+TRAVEL+s[b:]
# leaveInterior: use realm preset
rep("function leaveInterior() { state.snap = 1; state.where = 'city'; applyPreset('dusk', true);", "function leaveInterior() { state.snap = 1; state.where = 'city'; state.realm = 'city'; applyPreset(citySky, true);")
# portal loop
a=s.index("    // portals")
b=s.index("  npcs.forEach((n) => updateNpc(n, dt));")
PORT = r'''    // portals (gates list)
    if (portalCool <= 0 && !state.fading && state.where !== 'inside') {
      const pp = mountedOn ? mountedOn.grp.position : P.root.position;
      for (const gt of GATES) if (Math.hypot(pp.x - gt.x, pp.z - gt.z) < 2.7) { portalCool = 3; travelTo(gt.to); break; }
    }
  }
'''
s=s[:a]+PORT+s[b:]
rep("let player = null, npcs = [], gateA, gateB, portalMats = [], capsule, skypod, mountedOn = null;", "let player = null, npcs = [], portalMats = [], capsule, skypod, mountedOn = null; const GATES = [];")
rep("state.hero = id; $('#who')", "state.hero = id; $('#who')")
# nearest(): outside checks
rep("if (state.where === 'city') {\n    mounts.forEach", "if (state.where !== 'inside') {\n    mounts.forEach")
# item purchase
rep("else if (n.kind === 'item') toast(`${n.ref.name.toUpperCase()}\\n${n.ref.price} SPARKS`);",
    "else if (n.kind === 'item') { const it = n.ref; if (save.sparks >= it.price) { save.sparks -= it.price; save.inv.push(it.name); hud(); writeSave(); toast(`ACQUIRED\\n${it.name.toUpperCase()}`); } else toast('NOT ENOUGH SPARKS'); }")
rep("state: { hero","state: { hero") if False else None
rep("const state = { hero: 'zerox', where: 'city',", "const state = { hero: 'zerox', where: 'city', realm: 'city', snap: 0,")
rep("`${s.name} — ${s.price}⚡  (E to inspect)`", "`${s.name} — ${s.price}⚡  (E to buy)`")

# ---- boot layout ----
a=s.index("  // rail + shuttling capsule + sky-rail pod")
b=s.index("  $('#loadmsg').textContent = 'ready';")
LAYOUT = r'''  // gates: city <-> desert/volcano/ocean, each with a return gate
  const gate = async (x, z, ry, to, col) => { const g = await place('transit-hyperloop-gate', { x, z, h: 7, ry }); if (g) makePortal(new THREE.Vector3(x, 3.6, z), ry, col); const l = makeLabel(REALMS[to].name, '#' + col.toString(16).padStart(6, '0'), 1.1); l.position.set(x, 9.5, z); world.add(l); GATES.push({ x, z, to }); };
  await gate(0, 44, 0, 'desert', 0xff9a4a); await gate(-30, 44, 0, 'volcano', 0xff4a1a); await gate(30, 44, 0, 'ocean', 0x4fc3ff);
  await gate(420, 14, Math.PI, 'city', 0x5fe0ff); await gate(V0.x, V0.z + 150, 0, 'city', 0x5fe0ff); await gate(0, 846, 0, 'city', 0x5fe0ff);
  // rail + shuttling capsule + sky-rail pod
  const rail = new THREE.Mesh(new THREE.BoxGeometry(170, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: 0x16151e, metalness: 0.8, roughness: 0.3, emissive: 0xe8c45c, emissiveIntensity: 0.35 })); rail.position.set(0, 0.25, 100); world.add(rail);
  const rl = new THREE.Mesh(new THREE.BoxGeometry(170, 0.05, 0.25), new THREE.MeshBasicMaterial({ color: 0x00ff9c })); rl.position.set(0, 0.52, 100); world.add(rl);
  const cg = await place('transit-hyperloop-capsule', { x: 0, z: 100, w: 15 }); if (cg) { capsule = cg; cg.position.y = 1.1; }
  const sg = await place('transit-skyrail-pod', { x: 0, z: 0, w: 6 }); if (sg) { skypod = sg; }
  // mounts corral
  await addMount('mount-forge-bull', 'FORGE BULL', { x: -20, z: 34, h: 2.9, ry: 0.5, speed: 11, seatK: 0.92 });
  await addMount('mount-glacier-mammoth', 'GLACIER MAMMOTH', { x: -32, z: 46, h: 5.0, ry: 0.2, speed: 8, seatK: 0.9 });
  await addMount('mount-canopy-gorilla', 'CANOPY GORILLA', { x: 20, z: 34, h: 4.4, ry: -0.5, speed: 9, seatK: 0.85 });
  await addMount('mount-sky-hawk', 'SKY HAWK', { x: 34, z: 46, h: 3.6, ry: -0.2, speed: 16, hover: true, hoverY: 3.4, seatK: 0.85 });
  await addMount('veh-hover-pod-green', 'HOVER POD', { x: -8, z: 56, w: 5.2, ry: 0.3, speed: 22, hover: true, hoverY: 1.1, seatK: 0.55 });
  await addMount('veh-hover-pod-blue', 'HOVER POD II', { x: 8, z: 56, w: 5.2, ry: -0.3, speed: 24, hover: true, hoverY: 1.1, seatK: 0.55 });
  await addMount('veh-monowheel-mech', 'DUNE WHEEL', { x: 412, z: -24, h: 5.4, ry: 0.5, speed: 15, seatK: 0.95 });
  // doors
  doors.push(new Door({ x: 45, z: -16, ry: 0, w: 6, h: 5.6, type: 'slide' }), new Door({ x: 64, z: 60, ry: 0, w: 4.2, h: 4.6, type: 'hinge', color: 0x00ff9c }), new Door({ x: -42, z: -25, ry: 0.4, w: 4, h: 5, type: 'slide', color: 0xa06bff }));
  // ── OCEAN realm ──
  await place('ocean-harbor-hub', { x: 0, z: 932, w: 30, y: 0.3, r: 0 });
  await addMount('ocean-catamaran', 'CATAMARAN', { x: -34, z: 962, w: 15, ry: 0.6, speed: 15, seatK: 0.55, boat: true });
  await addMount('ocean-superyacht', 'SUPER-YACHT', { x: 44, z: 1000, w: 46, ry: 0.4, speed: 10, seatK: 0.5, boat: true });
  await addMount('ocean-submarine', 'RESEARCH SUB  (C to dive)', { x: 0, z: 985, w: 15, ry: 0, speed: 9, seatK: 0.5, boat: true, sub: true });
  await addMount('ocean-skiff', 'HOVER SKIFF', { x: 30, z: 962, w: 7, ry: -0.5, speed: 26, seatK: 0.55, boat: true });
  const farm = [[-90, 1060, 0.2], [-140, 1120, 0.9], [-60, 1160, 2.0], [110, 1090, 0.4], [150, 1150, 1.2], [70, 1200, 2.6], [-20, 1250, 0.7], [220, 1220, 1.8]];
  for (const [x, z, ry] of farm) { const f = await place('ocean-farm-platform', { x, z, w: 34, ry, y: -0.9 }); if (f) { f.userData.bob = Math.random() * 6; farmPlats.push(f); } }
  // ── VOLCANO realm ──
  await place('volcano-fortress', { x: V0.x, z: V0.z, h: 78, r: 24 });
  await place('volcano-ritual-circle', { x: V0.x + 70, z: V0.z + 64, w: 40, y: 0.05 });
  await place('volcano-forge-tower', { x: V0.x - 84, z: V0.z + 34, h: 38, r: 9, ry: 0.6 });
  await place('volcano-bridge', { x: V0.x + 46, z: V0.z + 120, w: 44, y: 0.1, ry: 0.4 }); await place('volcano-bridge', { x: V0.x - 46, z: V0.z + 120, w: 44, y: 0.1, ry: -0.4 });
  await place('volcano-gate', { x: V0.x, z: V0.z + 108, h: 16, y: 0.05 });
  dragon = await place('volcano-dragon', { x: V0.x, z: V0.z - 62, h: 26 }); if (dragon) { const lab = makeLabel('DRAGON', '#ff7a3a', 1.4); lab.position.set(0, 24, 0); dragon.add(lab); }
  // ── SIEGE CASTLE label ──
  loadSave(); hud();
'''
s=s[:a]+LAYOUT+s[b:]
rep("let waterMesh;\n", "let waterMesh; const farmPlats = [];\n") if "let waterMesh;\n" in s else None
rep("  buildTerrain(); buildInterior(); tick('terrain');", "  buildTerrain(); buildOcean(); buildVolcano(); buildInterior(); tick('terrain'); loadSave();")
# after spawnPlayer at boot restore hero + position + plots
rep("  spawnPlayer(charSrc.zerox ? 'zerox' : Object.keys(charSrc)[0], new THREE.Vector3(0, 0, 14));",
    "  const startHero = charSrc[save.hero] ? save.hero : (charSrc.zerox ? 'zerox' : Object.keys(charSrc)[0]); citySky = save.sky || 'dusk';\n  spawnPlayer(startHero, new THREE.Vector3(save.x || 0, 0, save.z || 14)); syncRealm(true);")
rep("  $('#loadmsg').textContent = 'ready';", "  for (const rec of save.plots) placePlot(rec);\n  $('#loadmsg').textContent = 'ready';")
rep("window.__w = { THREE,", "window.__w = { travelTo, syncRealm, waveH, REALMS, THREE,")
# farm platform bobbing + label
rep("  shopItems.forEach((s) => {", "  farmPlats.forEach((f) => { f.position.y = Math.sin(T * 0.8 + f.userData.bob) * 0.18; f.rotation.z = Math.sin(T * 0.6 + f.userData.bob) * 0.012; });\n  shopItems.forEach((s) => {")
# minimap drawing in the loop
rep("  // prompt\n", "  mmT -= dt; if (mmT <= 0) { mmT = 0.25; drawMap($('#mmc'), false); }\n  // prompt\n") if "  // prompt\n" in s else None
rep("let T = 0, portalCool = 0, realmTimer = 0, dragon = null;", "let T = 0, portalCool = 0, realmTimer = 0, dragon = null, mmT = 0;")
io.open(p,'w',encoding='utf8').write(s)
print('patch3 ok')
