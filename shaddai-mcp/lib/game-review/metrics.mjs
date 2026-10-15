// Numbers that describe a frame, and the difference between two frames.
const lum = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

// Sample at most ~40k pixels so a 4K screenshot stays fast.
export function frameMetrics({ width, height, data }) {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  let n = 0, sum = 0, sumSq = 0, dark = 0, bright = 0, edges = 0, edgeChecks = 0;
  const colours = new Set();
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4, l = lum(data, o);
      n++; sum += l; sumSq += l * l;
      if (l < 12) dark++;
      if (l > 243) bright++;
      colours.add(((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4));
      if (x + step < width) { edgeChecks++; if (Math.abs(l - lum(data, o + step * 4)) > 24) edges++; }
    }
  }
  const mean = sum / n;
  return {
    mean: +mean.toFixed(1),
    std: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(1),
    darkFraction: +(dark / n).toFixed(3),
    brightFraction: +(bright / n).toFixed(3),
    colourRatio: +(colours.size / 4096).toFixed(3),     // distinct 4-bit colours, 0..1
    edgeDensity: +(edgeChecks ? edges / edgeChecks : 0).toFixed(3),
  };
}

// Compare two same-size images. A pixel counts as changed if any channel moved by more than `tolerance`.
export function diffImages(a, b, tolerance = 16) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('images differ in size');
  let changed = 0, x0 = a.width, y0 = a.height, x1 = -1, y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const o = (y * a.width + x) * 4;
      if (Math.abs(a.data[o] - b.data[o]) > tolerance || Math.abs(a.data[o + 1] - b.data[o + 1]) > tolerance || Math.abs(a.data[o + 2] - b.data[o + 2]) > tolerance) {
        changed++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { changedPercent: +((100 * changed) / (a.width * a.height)).toFixed(2), bbox: changed ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}
