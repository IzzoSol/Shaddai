// Reel Forge motion kit — SHADDAI original.
// Everything here is a pure function of time `t` (seconds). No state, no timers.
//
// Springs are described the way a designer thinks: how fast (freq, Hz) and how
// bouncy (bounce, 0 = dead stop, 1 = ringing forever). A step input at time 0
// moves 0 → 1.

export const TAU = Math.PI * 2;
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const remap = (x, a, b) => clamp01((x - a) / (b - a));

// Feel presets: [freq Hz, bounce]
export const FEEL = {
  crisp: [3.2, 0.12],   // buttons, toggles, cursors
  calm:  [2.1, 0.05],   // cards, camera
  heavy: [1.5, 0.02],   // big type, logos
  jelly: [2.4, 0.45],   // mascots, stickers
};

export function spring(t, freq = 2.1, bounce = 0.05) {
  if (t <= 0) return 0;
  const w = TAU * freq;
  const zeta = 1 - clamp01(bounce) * 0.98;           // bounce → damping ratio
  if (zeta >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * w * t);
  return 1 - decay * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

// A value that chases a list of waypoints: each waypoint launches its own
// spring, and the results add up — so retargeting mid-flight stays smooth and
// frame N never needs frames 0..N-1.
//   waypoints: [{ at: seconds, to: value }, ...]  first one is the start value
export function chase(t, waypoints, feel = 'calm') {
  const [f, b] = Array.isArray(feel) ? feel : FEEL[feel];
  let v = waypoints[0].to;
  for (let i = 1; i < waypoints.length; i++) {
    v += (waypoints[i].to - waypoints[i - 1].to) * spring(t - waypoints[i].at, f, b);
  }
  return v;
}

// Two springs of different speed make a pill that stretches toward its target.
export function stretch(t, waypoints, size) {
  const head = chase(t, waypoints, [3.8, 0.1]);
  const tail = chase(t, waypoints, [1.9, 0.05]);
  return { from: Math.min(head, tail), to: Math.max(head, tail) + size };
}

// Content inside a changing container: appear a beat after the change begins,
// vanish a beat before the next one.
export function handoff(t, enterAt, leaveAt, lag = 0.09) {
  return Math.min(remap(t, enterAt + lag, enterAt + lag * 2.4), remap(leaveAt - lag, t, leaveAt - lag * 2));
}

// Wrap time so the last frame lands exactly on the first.
export const cycle = (t, length) => ((t % length) + length) % length;

// Deterministic randomness (SFC32). Same seed → same numbers, every render.
export function seeded(a, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const r = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

// Quantize a time to the nearest beat on a grid { bpm, offset }.
export const onBeat = (t, grid, subdivision = 1) => {
  const step = 60 / grid.bpm / subdivision;
  return grid.offset + Math.round((t - grid.offset) / step) * step;
};
