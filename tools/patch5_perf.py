import io
p = 'public/world3d.html'
s = io.open(p, encoding='utf8').read()
def rep(a, b):
    global s
    assert a in s, 'MISSING ' + a[:70]
    s = s.replace(a, b, 1)
rep("renderer.setPixelRatio(Math.min(devicePixelRatio, 2));", "renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));")
rep("PlaneGeometry(1700, 1700, 300, 300)", "PlaneGeometry(1700, 1700, 220, 220)")
rep("grp.userData = { size: sz.clone().multiplyScalar(s) };", "grp.userData = { size: sz.clone().multiplyScalar(s), cull: true };")
GOV = r"""
/* ───────────────────────── performance governor ───────────────────────── */
const perf = { acc: 0, n: 0, tier: 2, cool: 4, cullT: 0 };
function applyTier(t) {
  perf.tier = t;
  const pr = t >= 2 ? Math.min(devicePixelRatio, 1.5) : t === 1 ? 1 : 0.75;
  renderer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight);
  bloom.enabled = t >= 1; renderer.shadowMap.autoUpdate = t >= 1;
  sun.shadow.mapSize.set(t >= 2 ? 2048 : 1024, t >= 2 ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  toast(['LOW', 'MEDIUM', 'HIGH'][t] + ' GRAPHICS');
}
function perfFrame(dt) {
  perf.acc += dt; perf.n++;
  if (perf.n >= 90) { const ms = (perf.acc / perf.n) * 1000; perf.acc = 0; perf.n = 0; perf.cool--; if (perf.cool <= 0 && !state.fading) { if (ms > 26 && perf.tier > 0) { applyTier(perf.tier - 1); perf.cool = 4; } else if (ms < 13 && perf.tier < 2 && perf.cool < -6) { applyTier(perf.tier + 1); perf.cool = 4; } } window.__fps = Math.round(1000 / ms); }
}
// distance-cull placed models and every non-local light: each active light costs every pixel on every material
function cullPass(dt) {
  perf.cullT -= dt; if (perf.cullT > 0 || !player) return; perf.cullT = 0.4;
  const c = camera.position;
  for (const o of world.children) { if (o.userData && o.userData.cull) { const d = Math.hypot(o.position.x - c.x, o.position.z - c.z), r = (o.userData.size ? Math.max(o.userData.size.x, o.userData.size.z) : 20); o.visible = d < 520 + r; } else if (o.isLight) { o.visible = Math.hypot(o.position.x - c.x, o.position.z - c.z) < 150; } }
  const inOcean = state.realm === 'ocean' || c.z > 620; if (oceanMesh) oceanMesh.visible = inOcean;
  interior.visible = state.where === 'inside';
}
"""
rep("/* ───────────────────────── main loop ───────────────────────── */", GOV + "\n/* ───────────────────────── main loop ───────────────────────── */")
rep("function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); try { step(dt); }", "function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); perfFrame(dt); try { step(dt); cullPass(dt); }")
rep("buildTerrain(); buildOcean(); buildVolcano(); buildInterior();", "buildTerrain(); buildOcean(); buildVolcano(); buildInterior(); interior.visible = false;")
rep("if (k === 'm') toggleMap();", "if (k === 'm') toggleMap();\n  if (k === 'g' && e.shiftKey) applyTier((perf.tier + 2) % 3);")
io.open(p, 'w', encoding='utf8').write(s)
print('perf ok')
