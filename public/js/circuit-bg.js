// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT BACKGROUND — drifting neon PCB traces behind the cockpit.
//
// Perf note: the trace field is expensive to draw and cheap to move, so it is
// rendered ONCE into an offscreen tile and then blitted with a wrapping offset
// each frame. Redrawing thousands of segments per frame would cost more than
// the 3D scene it sits behind.
//
// Pulses are the only per-frame drawing: a few bright dots running along
// stored trace paths, so the board reads as live rather than wallpaper.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const CHANNELS = ['#ff2f52', '#4dff6a', '#2f6bff'];   // R / G / B traces

function rnd(a, b) { return a + Math.random() * (b - a); }

/** One trace: orthogonal runs with occasional 45° elbows, like real routing. */
function makeTrace(W, H) {
  const pts = [];
  let x = Math.round(rnd(0, W) / 12) * 12;
  let y = Math.round(rnd(0, H) / 12) * 12;
  pts.push({ x, y });
  const segs = Math.floor(rnd(3, 9));
  let horiz = Math.random() < 0.5;
  for (let i = 0; i < segs; i++) {
    const len = Math.round(rnd(24, 190) / 12) * 12;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.22) {           // diagonal elbow
      x += len * dir; y += len * dir * (Math.random() < 0.5 ? -1 : 1);
    } else if (horiz) {
      x += len * dir;
    } else {
      y += len * dir;
    }
    horiz = !horiz;
    pts.push({ x, y });
  }
  return pts;
}

export function initCircuitBg(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const density = opts.density ?? 1;
  let tile = null, tileW = 0, tileH = 0, traces = [], pulses = [];
  let raf = null, t = 0;

  function buildTile(w, h) {
    tileW = w; tileH = h;
    tile = document.createElement('canvas');
    tile.width = w; tile.height = h;
    const c = tile.getContext('2d');
    c.clearRect(0, 0, w, h);
    c.lineCap = 'round';

    const count = Math.round((w * h) / 9000 * density);
    traces = [];
    for (let i = 0; i < count; i++) {
      const pts = makeTrace(w, h);
      const col = CHANNELS[i % CHANNELS.length];
      traces.push({ pts, col });

      c.strokeStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 7;
      c.globalAlpha = rnd(0.42, 0.9);
      c.lineWidth = Math.random() < 0.18 ? 2.1 : 1.15;
      c.beginPath();
      pts.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();

      // via pad at the end, ring on some
      const end = pts[pts.length - 1];
      c.beginPath(); c.arc(end.x, end.y, 2.4, 0, Math.PI * 2);
      c.fillStyle = col; c.fill();
      if (Math.random() < 0.3) {
        c.beginPath(); c.arc(end.x, end.y, rnd(7, 26), 0, Math.PI * 2);
        c.lineWidth = 1.1; c.stroke();
      }
    }
    c.globalAlpha = 1; c.shadowBlur = 0;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(r.width * d));
    canvas.height = Math.max(1, Math.round(r.height * d));
    ctx.setTransform(d, 0, 0, d, 0, 0);
    buildTile(Math.max(600, Math.ceil(r.width)), Math.max(400, Math.ceil(r.height)));
    pulses = traces
      .filter(() => Math.random() < 0.22)
      .slice(0, 26)
      .map((tr) => ({ tr, p: Math.random(), speed: rnd(0.05, 0.22) }));
  }

  function pointAt(pts, p) {
    // walk the polyline to a normalised distance
    let total = 0;
    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segs.push(d); total += d;
    }
    let want = p * total;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i]) {
        const f = segs[i] ? want / segs[i] : 0;
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
        };
      }
      want -= segs[i];
    }
    return pts[pts.length - 1];
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    t += 0.016;
    const w = canvas.width / (window.devicePixelRatio > 1.5 ? 1.5 : (window.devicePixelRatio || 1));
    const h = canvas.height / (window.devicePixelRatio > 1.5 ? 1.5 : (window.devicePixelRatio || 1));
    ctx.clearRect(0, 0, w, h);
    if (!tile) return;

    // slow diagonal drift, wrapped — the field never visibly restarts
    const ox = -((t * 7) % tileW);
    const oy = -((t * 4) % tileH);
    for (let ix = 0; ix <= Math.ceil(w / tileW); ix++) {
      for (let iy = 0; iy <= Math.ceil(h / tileH); iy++) {
        ctx.drawImage(tile, ox + ix * tileW, oy + iy * tileH);
      }
    }

    // live pulses running the traces
    ctx.save();
    ctx.translate(ox, oy);
    pulses.forEach((pu) => {
      pu.p += pu.speed * 0.016;
      if (pu.p > 1) pu.p = 0;
      const pt = pointAt(pu.tr.pts, pu.p);
      ctx.shadowColor = pu.tr.col; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pu.tr.col;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.6, 0, Math.PI * 2);
      ctx.globalAlpha = .5; ctx.fill(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resize();
  window.addEventListener('resize', resize);
  if (reduced) {
    // static board, no drift
    ctx.drawImage(tile, 0, 0);
  } else {
    frame();
  }

  return { stop(){ if(raf) cancelAnimationFrame(raf); } };
}
