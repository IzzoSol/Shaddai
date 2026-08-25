// ─────────────────────────────────────────────────────────────────────────────
// RAG COCKPIT — instrument panels for the neural cockpit.
//
// Every gauge here reads REAL telemetry when /api/overview answers. When it
// doesn't, panels render simulated values and the header stamps SIM — the one
// thing a cockpit must never do is show you a confident number it invented.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const C = {
  void:   '#04060a',
  crt:    '#0a2f8f',
  cyan:   '#00e5ff',
  acid:   '#39ff5a',
  magenta:'#ff2fb8',
  alarm:  '#ff2b3d',
  bone:   '#cfe3e8',
  amber:  '#ffb63d',
};

function dpr(canvas) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * d));
  canvas.height = Math.max(1, Math.round(r.height * d));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

function glow(ctx, color, blur = 8) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

// ── Retrieval Velocity Trace ────────────────────────────────────────────────
export function velocityTrace(canvas, state) {
  const { ctx, w, h } = dpr(canvas);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0,229,255,.14)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = (h / 5) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const pts = state.velocity;
  const draw = (arr, color, fill) => {
    ctx.beginPath();
    arr.forEach((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - v * h * 0.9 - h * 0.05;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (fill) {
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
      ctx.fillStyle = g; ctx.fill();
      return;
    }
    glow(ctx, color, 7);
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.shadowBlur = 0;
  };
  draw(pts, C.cyan, true);
  draw(pts, C.cyan, false);
  draw(state.decay, C.magenta, false);

  const last = pts[pts.length - 1];
  const lx = w, ly = h - last * h * 0.9 - h * 0.05;
  glow(ctx, C.cyan, 10);
  ctx.fillStyle = C.cyan;
  ctx.beginPath(); ctx.arc(lx - 3, ly, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Corpus Composition Rings ────────────────────────────────────────────────
export function compositionRing(canvas, slices, label) {
  const { ctx, w, h } = dpr(canvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;

  let a = -Math.PI / 2;
  slices.forEach((s) => {
    const span = s.v * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a, a + span);
    glow(ctx, s.c, 6);
    ctx.strokeStyle = s.c; ctx.lineWidth = 7; ctx.stroke();
    ctx.shadowBlur = 0;
    a += span;
  });

  ctx.beginPath(); ctx.arc(cx, cy, R - 12, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,229,255,.2)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = C.bone;
  ctx.font = '11px "Silkscreen", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

// ── Circular gauge (Context Load / Hallucination Risk) ──────────────────────
export function gauge(canvas, value, color, caption) {
  const { ctx, w, h } = dpr(canvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 10;
  const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;

  ctx.beginPath(); ctx.arc(cx, cy, R, START, START + SWEEP);
  ctx.strokeStyle = 'rgba(207,227,232,.14)'; ctx.lineWidth = 6; ctx.stroke();

  ctx.beginPath(); ctx.arc(cx, cy, R, START, START + SWEEP * value);
  glow(ctx, color, 9);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.stroke();
  ctx.shadowBlur = 0;

  const na = START + SWEEP * value;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * (R - 8), cy + Math.sin(na) * (R - 8));
  ctx.strokeStyle = C.bone; ctx.lineWidth = 1.6; ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '18px "VT323", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(Math.round(value * 100) + '%', cx, cy + R * 0.62);
  ctx.fillStyle = 'rgba(207,227,232,.55)';
  ctx.font = '8px "Silkscreen", monospace';
  ctx.fillText(caption, cx, h - 2);
}

// ── Attention Heat Ladder ───────────────────────────────────────────────────
export function heatLadder(canvas, rungs) {
  const { ctx, w, h } = dpr(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = 4, cellH = (h - pad * 2) / rungs.length;
  rungs.forEach((v, i) => {
    const y = pad + i * cellH;
    const hue = 190 - v * 150;           // cyan (cold) → magenta/red (hot)
    const col = `hsl(${hue} 100% ${38 + v * 22}%)`;
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(pad, y + 1, w - pad * 2, cellH - 2);
    glow(ctx, col, 6);
    ctx.fillStyle = col;
    ctx.fillRect(pad, y + 1, (w - pad * 2) * v, cellH - 2);
    ctx.shadowBlur = 0;
  });
}

// ── Query Mutation Log ──────────────────────────────────────────────────────
export function mutationLog(el, lines) {
  el.innerHTML = lines.map((l) => {
    const cls = l.kind === 'out' ? 'ml-out' : l.kind === 'expand' ? 'ml-exp' : 'ml-in';
    return `<div class="ml-row ${cls}"><span class="ml-tag">${l.tag}</span>${l.text}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Shard ID stack ──────────────────────────────────────────────────────────
export function shardStack(el, ids, activeIndex) {
  el.innerHTML = ids.map((id, i) =>
    `<div class="shard${i === activeIndex ? ' on' : ''}"><span class="dot"></span>${id}</div>`
  ).join('');
}

// ── simulated-but-labelled telemetry ────────────────────────────────────────
export function makeState() {
  const n = 48;
  return {
    live: false,
    velocity: Array.from({ length: n }, (_, i) => 0.45 + Math.sin(i / 5) * 0.18 + Math.random() * 0.08),
    decay:    Array.from({ length: n }, (_, i) => 0.30 + Math.cos(i / 7) * 0.12 + Math.random() * 0.05),
    contextLoad: 0.42,
    risk: 0.18,
    attention: Array.from({ length: 14 }, () => Math.random() * 0.7 + 0.15),
    temperature: 0.35,
    strictness: 0.72,
  };
}

export function advance(state) {
  state.velocity.push(Math.max(0.05, Math.min(0.95,
    state.velocity[state.velocity.length - 1] + (Math.random() - 0.5) * 0.16)));
  state.velocity.shift();
  state.decay.push(Math.max(0.05, Math.min(0.8,
    state.decay[state.decay.length - 1] + (Math.random() - 0.5) * 0.1)));
  state.decay.shift();
  state.attention = state.attention.map((v) =>
    Math.max(0.08, Math.min(1, v + (Math.random() - 0.5) * 0.22)));
  state.contextLoad = Math.max(0.05, Math.min(0.98, state.contextLoad + (Math.random() - 0.5) * 0.05));
  state.risk = Math.max(0.02, Math.min(0.95, state.risk + (Math.random() - 0.5) * 0.04));
}

export const PALETTE = C;
