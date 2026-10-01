// Turns a capture report into findings: what is wrong, the evidence, and where in the code to look.
//
// report = {
//   frames:  [{ t, metrics, diffFromPrevious }],            // diffFromPrevious: changedPercent or null
//   console: [{ type, text }],                              // browser console + uncaught errors
//   failedRequests: [{ url, status }],
//   perf:    { fps, p95FrameMs, maxFrameMs, drawCalls, triangles },   // any field may be null
//   inputsSent: number
// }

const F = (severity, id, title, evidence, look, fix) => ({ severity, id, title, evidence, lookAt: look, hint: fix });

export function analyze(report) {
  const out = [];
  const frames = report.frames || [], perf = report.perf || {};
  const blank = (m) => m.std < 2 && (m.darkFraction > 0.97 || m.brightFraction > 0.97);

  if (frames.length) {
    const blanks = frames.filter((f) => blank(f.metrics));
    if (blanks.length === frames.length) {
      out.push(F('critical', 'nothing-drawn', 'Nothing is visible — every frame is blank',
        `${frames.length}/${frames.length} frames are a single flat colour`,
        ['guides/01-scene-and-renderer.md', 'guides/03-cameras-and-feel.md'],
        'Check: renderer.domElement added to the page; canvas has non-zero size; camera is not inside or facing away from the scene; lights exist for lit materials; the render loop actually runs; objects were added to the scene.'));
    } else if (blanks.length) {
      out.push(F('warning', 'blank-frames', 'Some frames are blank',
        `blank at t=${blanks.map((f) => f.t).join(', ')}s`, ['guides/02-game-loop.md', 'guides/04-assets-and-materials.md'],
        'Look for scene changes (level loads, restarts) that clear the canvas, or assets that appear late.'));
    } else {
      const flat = frames.every((f) => f.metrics.std < 20);
      if (flat) out.push(F('warning', 'flat-image', 'The image is very flat — almost no contrast',
        `luminance spread (std) is ${Math.max(...frames.map((f) => f.metrics.std))} or less in every frame`,
        ['guides/04-assets-and-materials.md', 'guides/15-postprocessing.md'], 'Add a key light plus fill, separate foreground from background by value, and check fog/ambient are not washing everything out.'));
      if (frames.every((f) => f.metrics.colourRatio < 0.01)) out.push(F('info', 'few-colours', 'Very few distinct colours — looks like placeholder art',
        `colour ratio below 1% in every frame`, ['guides/04-assets-and-materials.md'], 'Introduce a palette with an accent colour, texture or gradient the key objects, and vary the background.'));
      const m = frames.map((f) => f.metrics.mean);
      if (Math.min(...m) > 200 && frames.every((f) => f.metrics.brightFraction > 0.4)) out.push(F('warning', 'overexposed', 'The scene is overexposed', `mean brightness ${Math.min(...m)}+`, ['guides/04-assets-and-materials.md', 'guides/15-postprocessing.md'], 'Lower light intensity, enable tone mapping, reduce emissive/ambient.'));
      if (Math.max(...m) < 40) out.push(F('warning', 'underexposed', 'The scene is too dark to read', `mean brightness ${Math.max(...m)} or less`, ['guides/04-assets-and-materials.md'], 'Add a fill/hemisphere light or an environment map; check material colours are not near black.'));
      const moving = frames.filter((f) => f.diffFromPrevious != null);
      if (moving.length >= 3 && moving.every((f) => f.diffFromPrevious < 0.05)) {
        out.push(F(report.inputsSent ? 'critical' : 'warning', 'frozen', 'The picture never changes',
          `${moving.length} consecutive captures differ by under 0.05%` + (report.inputsSent ? ` even though ${report.inputsSent} inputs were sent` : ''),
          ['guides/02-game-loop.md', 'guides/14-interaction-and-controls.md'],
          report.inputsSent ? 'Inputs are not reaching the game: check key/pointer listeners, canvas focus, and that the simulation actually steps.' : 'Nothing is moving: confirm the loop runs and that something animates (idle motion helps a game feel alive).'));
      }
    }
  }

  const cv = report.canvas;
  if (cv) {
    if (cv.w < 2 || cv.h < 2) out.push(F('critical', 'canvas-zero-size', 'The canvas has no size', `canvas is ${Math.round(cv.w)}x${Math.round(cv.h)}`, ['guides/01-scene-and-renderer.md'], 'Set the canvas width/height (or CSS size) and call renderer.setSize before the first render.'));
    else {
      const cover = (cv.w * cv.h) / (cv.vw * cv.vh);
      if (cover < 0.8) out.push(F('warning', 'canvas-not-filling-window', 'The game does not fill the window',
        `canvas is ${Math.round(cv.w)}x${Math.round(cv.h)} in a ${cv.vw}x${cv.vh} window (${Math.round(cover * 100)}% of it)`, ['guides/01-scene-and-renderer.md', 'guides/14-interaction-and-controls.md'],
        'Size the canvas to the viewport (100vw x 100vh, body margin 0), call renderer.setSize and update camera.aspect on resize, and check devicePixelRatio handling. If a fixed size is intentional, centre it and style the surround.'));
    }
  }
  const errors = (report.console || []).filter((c) => c.type === 'error' || c.type === 'pageerror');
  if (errors.length) out.push(F('critical', 'console-errors', `${errors.length} console error${errors.length > 1 ? 's' : ''}`,
    errors.slice(0, 3).map((e) => e.text.slice(0, 140)).join(' | '), ['the file and line named in the first error'], 'Fix the first error first — later ones are often caused by it.'));
  const warns = (report.console || []).filter((c) => c.type === 'warning');
  if (warns.length) out.push(F('info', 'console-warnings', `${warns.length} console warning${warns.length > 1 ? 's' : ''}`, warns.slice(0, 2).map((e) => e.text.slice(0, 120)).join(' | '), [], 'Warnings often point at deprecated APIs or wrong colour-space/texture settings.'));
  if ((report.failedRequests || []).length) out.push(F('critical', 'missing-assets', `${report.failedRequests.length} request(s) failed`,
    report.failedRequests.slice(0, 3).map((r) => `${r.status} ${r.url}`).join(' | '), ['guides/04-assets-and-materials.md'], 'Fix paths and casing, confirm files are served, and show a visible fallback while loading.'));

  if (perf.fps != null) {
    if (perf.fps < 30) out.push(F('critical', 'low-fps', `Frame rate is ${perf.fps} fps`, `p95 frame ${perf.p95FrameMs} ms`, ['guides/09-performance.md'], 'Find the bottleneck first: shrink the window (fill-rate?) and check draw calls (CPU?) before changing anything.'));
    else if (perf.fps < 50) out.push(F('warning', 'low-fps', `Frame rate is ${perf.fps} fps — below the 60 fps target`, `p95 frame ${perf.p95FrameMs} ms`, ['guides/09-performance.md'], 'Cap pixel ratio, share materials, instance repeats, reduce shadow cost.'));
    if (perf.maxFrameMs > 100) out.push(F('warning', 'frame-spikes', `Frame spikes up to ${perf.maxFrameMs} ms`, 'single frames take over 100 ms', ['guides/09-performance.md', 'guides/04-assets-and-materials.md'], 'Spikes usually mean per-frame allocations (garbage collection), shader compiles on first use, or texture uploads. Pre-warm and pool.'));
  }
  if (perf.drawCalls > 300) out.push(F('warning', 'many-draw-calls', `${perf.drawCalls} draw calls per frame`, 'budget is about 300', ['guides/09-performance.md', 'guides/13-geometry-and-textures.md'], 'Merge static geometry, share materials, use InstancedMesh for repeats.'));
  if (perf.triangles > 1500000) out.push(F('warning', 'heavy-geometry', `${perf.triangles} triangles per frame`, 'over 1.5M', ['guides/09-performance.md'], 'Add LOD, cull distant objects, decimate hero assets.'));

  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function summarize(findings) {
  if (!findings.length) return 'No issues detected by the automatic checks. Look at the screenshots anyway — these checks cannot judge taste.';
  return findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   evidence: ${f.evidence}\n   look at: ${f.lookAt.join(', ') || '—'}\n   hint: ${f.hint}`).join('\n');
}
