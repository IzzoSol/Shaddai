/* world-perf-hud.js — in-game performance profiler (?perf=1), 2026-09-26.
 * Pattern from our gamedev repo: shaddai-threejs-gamedev-master/SKILLS-HUB/.claude/skills/game-qa-performance
 * (metrics: FPS, frame time, memory, GPU load = draw calls/triangles, jank = frame-time variance; target < 500 calls).
 * Shows a small corner panel and keeps window.__perf = latest stats so a probe (or the owner) can read the numbers
 * from THEIR real GPU. Zero cost when ?perf is absent.
 *   window.startPerfHud(renderer)   → call once; then window.__perfFrame(dtSeconds) once per frame (after render)
 */
(function () {
  if (!/[?&]perf=1\b/.test(location.search)) { window.startPerfHud = function () {}; window.__perfFrame = function () {}; return; }
  var r = null, el = null, hist = [], last = 0, acc = 0, frames = 0;
  addEventListener('keydown', function (e) {   // 1-5 force a quality tier (POTATO..ULTRA) so you can FEEL each tax; 0 = back to the auto governor
    if (/input|textarea/i.test((document.activeElement || {}).tagName || '') || !window.__setQualityTier) return;
    if (e.code >= 'Digit1' && e.code <= 'Digit5') window.__setQualityTier(+e.code.slice(5) - 1, 1e9); else if (e.code === 'Digit0') window.__setQualityTier(window.__getQualityTier(), 1);
  });
  var lightAt = 0;
  window.startPerfHud = function (renderer) {
    r = renderer; if (r && r.info) r.info.autoReset = false;          // we reset per frame ourselves → totals include every pass
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(6,8,11,.82);color:#00ff9c;font:11px/1.35 ui-monospace,Consolas,monospace;padding:6px 8px;border:1px solid #e8c45c55;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
  };
  window.__perfFrame = function (dt) {
    if (!r || !el) return;
    var now = performance.now(); if (!last) { last = now; return; } dt = (now - last) / 1000; last = now;   // real wall-clock (the game clamps its dt at 0.05 s)
    var ms = dt * 1000; hist.push(ms); if (hist.length > 120) hist.shift();
    acc += dt; frames++;
    var info = r.info, calls = info.render.calls, tris = info.render.triangles;
    if (acc >= 0.5) {
      var mean = hist.reduce(function (a, b) { return a + b; }, 0) / hist.length;
      var sd = Math.sqrt(hist.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / hist.length);
      var p95 = hist.slice().sort(function (a, b) { return a - b; })[Math.floor(hist.length * 0.95)] || ms;
      var mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      var s = window.__perf = { fps: +(frames / acc).toFixed(1), frameMs: +mean.toFixed(1), p95Ms: +p95.toFixed(1), jankMs: +sd.toFixed(1),
        calls: calls, tris: tris, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null,
        heapMB: mem, quality: window.__quality || '' };
      if (now - lightAt > 3000) { lightAt = now; var sc = window.__w3dDebug && window.__w3dDebug.scene, n = 0; if (sc) sc.traverse(function (o) { if (o.isLight) n++; }); window.__lightCount = n; }
      s.lights = window.__lightCount; s.dtMs = s.frameMs;
      el.textContent = 'tier ' + s.quality + '  lights ' + s.lights + '  (keys 1-5 force, 0 auto)\n' + 'FPS ' + s.fps + '  frame ' + s.frameMs + ' ms (p95 ' + s.p95Ms + ', jank ±' + s.jankMs + ')\n' +
        'draw calls ' + calls + (calls > 500 ? '  ⚠ >500' : '') + '  tris ' + (tris / 1000).toFixed(0) + 'k\n' +
        'geo ' + s.geometries + '  tex ' + s.textures + '  shaders ' + s.programs + (mem != null ? '  heap ' + mem + ' MB' : '') + '\n' +
        'cpu: sim ' + (window.__perfSplit ? window.__perfSplit.simMs : '?') + ' ms  render-submit ' + (window.__perfSplit ? window.__perfSplit.renderCpuMs : '?') + ' ms  (frame > both = GPU bound)' + '
' +
        'quality ' + s.quality;
      acc = 0; frames = 0;
    }
    info.reset();
  };
})();
