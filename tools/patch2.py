import io
p='public/world3d.html'
s=io.open(p,encoding='utf8').read()
def rep(a,b):
    global s
    assert a in s, 'MISSING: '+a[:80]
    s=s.replace(a,b,1)

BUILD = r'''
/* ───────────────────────── ocean / volcano builders ───────────────────────── */
let oceanMesh;
function buildOcean() {
  oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700, 300, 300).rotateX(-Math.PI / 2), oceanMat);
  oceanMesh.position.set(0, -0.5, 1750); oceanMesh.frustumCulled = false; scene.add(oceanMesh);
  const sandT = tex('circuit-sand', 90);
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(1500, 210), new THREE.MeshStandardMaterial({ map: sandT, roughness: 1 }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(0, 0.012, 795); shore.receiveShadow = true; world.add(shore);
  const dockM = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.45, metalness: 0.5 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.9, emissive: 0xe8c45c, emissiveIntensity: 0.25 });
  const dock = new THREE.Mesh(new THREE.CylinderGeometry(24, 24.6, 1.6, 64), dockM); dock.position.set(0, -0.5, 932); dock.receiveShadow = true; dock.castShadow = true; world.add(dock);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 0.35, 8, 96), gold); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.32, 932); world.add(rim);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 34), dockM); walk.position.set(0, -0.05, 905); walk.receiveShadow = true; world.add(walk);
  [-3.5, 3.5].forEach((x) => { for (let z = 890; z <= 916; z += 4) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10), gold); b.position.set(x, 0.55, z); world.add(b); } });
  const lamp = new THREE.PointLight(0xffe0a8, 380, 90, 1.6); lamp.position.set(0, 10, 932); world.add(lamp);
}
const lavaStrips = [];
function buildVolcano() {
  const g = new THREE.Mesh(new THREE.CircleGeometry(330, 96), new THREE.MeshStandardMaterial({ map: tex('lava-crust', 26), emissive: 0xff3a10, emissiveMap: tex('lava-crust', 26), emissiveIntensity: 0.32, roughness: 0.85, metalness: 0.1 }));
  g.rotation.x = -Math.PI / 2; g.position.set(V0.x, 0.02, V0.z); g.receiveShadow = true; world.add(g);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(78, 72), new THREE.MeshStandardMaterial({ map: tex('obsidian-plaza', 18), roughness: 0.3, metalness: 0.5, emissive: 0x2a0a00, emissiveIntensity: 0.6 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(V0.x, 0.05, V0.z); plaza.receiveShadow = true; world.add(plaza);
  const rim = new THREE.Mesh(new THREE.RingGeometry(77, 78.4, 96), new THREE.MeshBasicMaterial({ color: 0xff7a2a })); rim.rotation.x = -Math.PI / 2; rim.position.set(V0.x, 0.07, V0.z); world.add(rim);
  [[0.3, 210, 40], [2.5, 240, 36], [4.4, 230, 44], [5.6, 210, 30]].forEach(([a, len, w]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), lavaMat); m.rotation.x = -Math.PI / 2; m.rotation.z = a;
    const r = 78 + len / 2; m.position.set(V0.x + Math.sin(a) * r, 0.1, V0.z + Math.cos(a) * r); world.add(m); lavaStrips.push(m);
    const l = new THREE.PointLight(0xff5a1a, 420, 90, 1.7); l.position.set(m.position.x, 6, m.position.z); world.add(l);
  });
}
const embers = (() => { const n = 500, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * 120; a[i * 3 + 1] = Math.random() * 40; a[i * 3 + 2] = (Math.random() - 0.5) * 120; } g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff8a3a, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); p.visible = false; scene.add(p); return p; })();

/* ───────────────────────── save / plots / sparks ───────────────────────── */
const SAVE_KEY = 'shaddai3d.v1';
const save = { sparks: 600, inv: [], plots: [], sky: 'dusk', hero: 'zerox', x: 0, z: 16 };
let citySky = 'dusk';
function loadSave() { try { const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (j) Object.assign(save, j); } catch (e) {} }
function writeSave() { try { if (player) { save.hero = state.hero; if (state.where !== 'inside' && !mountedOn) { save.x = +player.root.position.x.toFixed(1); save.z = +player.root.position.z.toFixed(1); } } save.sky = citySky; localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function hud() { const e = $('#sparks'); if (e) e.textContent = `⚡ ${save.sparks} Sparks · ${save.inv.length} items · ${save.plots.length} plots`; }
setInterval(() => writeSave(), 4000); addEventListener('beforeunload', writeSave);
const BUILDS = [['bld-bio-pod-tower-v2', { h: 26, r: 7 }, 'Bio-Pod Tower'], ['bld-sky-dome-v2', { w: 24, r: 10 }, 'Sky Dome'], ['bld-holo-market-v2', { w: 24, r: 10 }, 'Holo Market'], ['bld-inverted-cube-hab', { h: 30, r: 5 }, 'Cube Habitat'], ['bld-neon-observatory', { h: 28, r: 5 }, 'Observatory']];
let buildIdx = 0; const plotObjs = [];
async function placePlot(rec) { const def = BUILDS.find((b) => b[0] === rec.f); if (!def) return; const g = await place(rec.f, Object.assign({ x: rec.x, z: rec.z, ry: rec.ry }, def[1])); if (g) plotObjs.push({ rec, g }); }

/* ───────────────────────── map ───────────────────────── */
const MB = { x0: -1150, x1: 520, z0: -380, z1: 1120 };
function drawMap(cv, big) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, X = (x) => ((x - MB.x0) / (MB.x1 - MB.x0)) * w, Z = (z) => ((z - MB.z0) / (MB.z1 - MB.z0)) * h, sx = w / (MB.x1 - MB.x0);
  g.fillStyle = '#070b12'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0d3a5a'; g.fillRect(0, Z(900), w, h - Z(900));
  g.fillStyle = '#1b4a30'; g.fillRect(X(-700), Z(-380), X(700) - X(-700), Z(900) - Z(-380));
  g.fillStyle = '#8a4a2a'; g.beginPath(); g.arc(X(420), Z(0), 90 * sx, 0, 7); g.fill();
  g.fillStyle = '#6a1a10'; g.beginPath(); g.arc(X(V0.x), Z(V0.z), 330 * sx, 0, 7); g.fill();
  g.fillStyle = '#e8c45c33'; g.beginPath(); g.arc(X(0), Z(0), 120 * sx, 0, 7); g.fill();
  for (const r of Object.values(REALMS)) { g.fillStyle = r.col; g.beginPath(); g.arc(X(r.x), Z(r.z), big ? 9 : 4, 0, 7); g.fill(); if (big) { g.font = '600 20px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(r.name, X(r.x), Z(r.z) - 16); } }
  if (player) { const p = player.root.position; g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(-player.yaw + Math.PI); g.fillStyle = '#00ff9c'; g.beginPath(); g.moveTo(0, -(big ? 12 : 6)); g.lineTo(big ? 8 : 4, big ? 9 : 5); g.lineTo(-(big ? 8 : 4), big ? 9 : 5); g.fill(); g.restore(); }
}
function toggleMap(on) { const m = $('#map'); const show = on === undefined ? m.style.display === 'none' : on; m.style.display = show ? 'flex' : 'none'; if (show) drawMap($('#mapc'), true); }
$('#mapc').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fz = (e.clientY - r.top) / r.height, wx = MB.x0 + fx * (MB.x1 - MB.x0), wz = MB.z0 + fz * (MB.z1 - MB.z0); let best = null, bd = 1e9; for (const [id, rr] of Object.entries(REALMS)) { const d = Math.hypot(rr.x - wx, rr.z - wz); if (d < bd) { bd = d; best = id; } } if (best && bd < 260) { toggleMap(false); travelTo(best); } });
'''
rep("/* ───────────────────────── static models ───────────────────────── */", BUILD + "\n/* ───────────────────────── static models ───────────────────────── */")

rep("{ id: 'leadr', name: 'Leadr', role: 'Citizen', accent: '#ff7a3a' }, { id: 'gaeli', name: 'Gaeli', role: 'Citizen', accent: '#b6ff3a' },",
    "{ id: 'nexus', name: 'NEXUS', role: 'Architect', accent: '#38d0c0' }, { id: 'pikadon', name: 'PIKADON', role: 'Security', accent: '#ff5a4d' }, { id: 'shaddai', name: 'SHADDAI', role: 'Orchestrator', accent: '#e8c45c' },\n  { id: 'leadr', name: 'Leadr', role: 'Citizen', accent: '#ff7a3a' }, { id: 'gaeli', name: 'Gaeli', role: 'Citizen', accent: '#b6ff3a' },")
rep("if (k >= '1' && k <= '6') { const h = HEROES[+k - 1];", "if (k >= '1' && k <= '9') { const h = HEROES.filter((x) => charSrc[x.id])[+k - 1];")

KEYS = r'''if (k === 'l') { const order = ['dusk', 'day', 'night']; if (state.realm === 'city' && state.where !== 'inside') { citySky = order[(order.indexOf(citySky) + 1) % 3]; applyPreset(citySky); toast(PRESETS[citySky].label.toUpperCase()); writeSave(); } }
  if (k === 'm') toggleMap();
  if (k === 'n') { buildIdx = (buildIdx + 1) % BUILDS.length; toast('BUILD: ' + BUILDS[buildIdx][2].toUpperCase()); }
  if (k === 'b' && player && state.where !== 'inside' && !mountedOn) { if (save.plots.length >= 40) { toast('PLOT LIMIT'); } else { const p = player.root.position, rec = { f: BUILDS[buildIdx][0], x: +(p.x + Math.sin(player.yaw) * 14).toFixed(1), z: +(p.z + Math.cos(player.yaw) * 14).toFixed(1), ry: +player.yaw.toFixed(2) }; save.plots.push(rec); placePlot(rec); hud(); writeSave(); toast('PLACED ' + BUILDS[buildIdx][2].toUpperCase()); } }
  if (k === 'z' && plotObjs.length) { const o = plotObjs.pop(); world.remove(o.g); const i = save.plots.indexOf(o.rec); if (i >= 0) save.plots.splice(i, 1); hud(); writeSave(); toast('REMOVED'); }'''
rep("if (k === 'l') { const order = ['dusk', 'day', 'night']; if (state.where === 'city') { applyPreset(order[(order.indexOf(presetName) + 1) % 3]); toast(PRESETS[presetName].label.toUpperCase()); } }", KEYS)

rep("mounts.push({ name, grp, seat: box.max.y * (o.seatK || 0.9), speed: o.speed || 8, hover: !!o.hover,", "if (o.boat) grp.rotation.order = 'YXZ';\n  mounts.push({ name, grp, boat: !!o.boat, sub: !!o.sub, seat: box.max.y * (o.seatK || 0.9), speed: o.speed || 8, hover: !!o.hover,")
rep("      else { m.grp.position.y = Math.abs(Math.sin(m.t)) * 0.07 * (m.vel / m.speed); m.grp.rotation.z = Math.sin(m.t) * 0.02 * (m.vel / m.speed); }",
    "      else if (m.boat) { boatPose(m, dt, true); }\n      else { m.grp.position.y = Math.abs(Math.sin(m.t)) * 0.07 * (m.vel / m.speed); m.grp.rotation.z = Math.sin(m.t) * 0.02 * (m.vel / m.speed); }")

BOAT = r'''function boatPose(m, dt, driven) {
  const g = m.grp; if (driven) { g.position.z = clamp(g.position.z, 908, 2500); g.position.x = clamp(g.position.x, -780, 780); }
  const x = g.position.x, z = g.position.z, H = (a, b) => waveH(a, b, T), h0 = H(x, z), hx = (H(x + 2, z) - H(x - 2, z)) / 4, hz = (H(x, z + 2) - H(x, z - 2)) / 4, ys = m.yaw;
  const fw = hx * Math.sin(ys) + hz * Math.cos(ys), sd = hx * Math.cos(ys) - hz * Math.sin(ys);
  const dive = m.sub && driven && state.keys['c'];
  g.position.y = damp(g.position.y, dive ? -4.5 : -0.5 + h0 + 0.22, dive ? 1.6 : 6, dt);
  g.rotation.x = damp(g.rotation.x, -Math.atan(fw) * 0.9, 4, dt); g.rotation.z = damp(g.rotation.z, -Math.atan(sd) * 0.8, 4, dt);
  if (m.rider) m.rider.root.visible = !m.sub;
}
function makeLabel('''
rep("function makeLabel(", BOAT)
rep("m.rider = null; mountedOn = null; if (!silent) toast('DISMOUNTED'); }", "m.rider = null; mountedOn = null; player.root.visible = true; if (!silent) toast('DISMOUNTED'); }")
rep("mounts.forEach((m) => { if (m.rider) return; m.t += dt;", "mounts.forEach((m) => { if (m.rider) return; m.t += dt; if (m.boat) { boatPose(m, dt, false); return; }")
rep("      camTarget.copy(P.root.position); camTarget.y += 1.5;\n    }", "      { const q = P.root.position; if (q.z > 899) { const onDock = Math.hypot(q.x, q.z - 932) < 23.4, onWalk = Math.abs(q.x) < 3.4 && q.z < 912; if (!onDock && !onWalk) { if (q.z < 912) q.z = 899; else { const dx = q.x, dz = q.z - 932, d = Math.hypot(dx, dz) || 1; q.x = (dx / d) * 23.4; q.z = 932 + (dz / d) * 23.4; } } } }\n      camTarget.copy(P.root.position); camTarget.y += 1.5;\n    }")
rep("if (state.where !== 'inside') cp.y = Math.max(cp.y, 0.6);", "if (state.where !== 'inside' && !(mountedOn && mountedOn.sub)) cp.y = Math.max(cp.y, 0.6);")

FX = r'''  updateVfx(dt); motes.rotation.y += dt * 0.01; motes.position.copy(camTarget).setY(0);
  sky.position.copy(camera.position); starPts.position.copy(camera.position);
  oceanMat.uniforms.t.value = T; oceanMat.uniforms.skyTop.value.copy(skyMat.uniforms.top.value); oceanMat.uniforms.skyBot.value.copy(skyMat.uniforms.bot.value); oceanMat.uniforms.sunDir.value.copy(cur.sunPos).normalize(); oceanMat.uniforms.sunCol.value.copy(cols.sun);
  lavaMat.uniforms.t.value = T;
  if (state.realm === 'volcano' && state.where !== 'inside') { embers.visible = true; embers.position.set(camTarget.x, 0, camTarget.z); const a = embers.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (2 + (i % 5)); if (y > 40) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(T + i) * dt * 0.6); } a.needsUpdate = true; } else embers.visible = false;
  realmTimer -= dt; if (realmTimer <= 0 && state.where !== 'inside' && player) { realmTimer = 0.4; syncRealm(false); }
  if (dragon) { const a = T * 0.16; dragon.position.set(V0.x + Math.cos(a) * 62, 52 + Math.sin(T * 0.9) * 3, V0.z + Math.sin(a) * 62); dragon.rotation.y = -a; dragon.rotation.z = Math.sin(T * 0.9) * 0.08; dragon.rotation.x = 0.06 + Math.sin(T * 1.8) * 0.05; dragon.scale.y = 1 + Math.sin(T * 3.2) * 0.035; }'''
rep("  updateVfx(dt); motes.rotation.y += dt * 0.01; motes.position.copy(camTarget).setY(0);", FX)

UW = r'''  if (state.realm === 'ocean' && state.where !== 'inside' && camera.position.y < -0.5 + waveH(camera.position.x, camera.position.z, T) - 0.15) { scene.fog.color.set(0x06304a); scene.fog.near = 1; scene.fog.far = 55; }
  // prompt'''
rep("  // prompt", UW)
rep("let T = 0, portalCool = 0;", "let T = 0, portalCool = 0, realmTimer = 0, dragon = null;")
io.open(p,'w',encoding='utf8').write(s)
print('patch2 ok')
