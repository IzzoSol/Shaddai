/* world-binary-vision.js — TURTLE studio BINARY VISION (2026-10-23, owner refs: OCEAN DOUBLE GLITCH, mono byte glitch, the
 * binary-visualization repo on the owner's desktop). Sound and files seen as their own bytes:
 *   GLITCH  — every byte becomes one cell of a scrolling grid (palettes: Ocean, Mono, Spectrum, Ember)
 *   DIGRAPH — consecutive byte pairs (b[i], b[i+1]) plotted on a 256x256 plane, log-scaled hits (structure shows as shapes)
 * Sources: the live Listening Room mix (WorldListeningRoom.analyser()) or a local file the player drops in. The file is read
 * in the browser only (nothing is uploaded or exported). Method after Mitja Felicijan's binary-visualization (BSD 2-Clause,
 * (c) 2022-2023 Mitja Felicijan; idea from Chris Domas' talk) — reimplemented in JS, no code copied.
 *   WorldBinaryVision.open() / close() / toggle() · .feed(Uint8Array) for any other source
 */
(function (root) {
  'use strict';
  var PAL = {
    ocean: function (v) { var t = v / 255; return [0, (t * 255 * 0.9) | 0, (90 + t * 165) | 0, t < 0.15 ? 0 : 1]; },
    mono: function (v) { return [v, v, v, 1]; },
    spectrum: function (v) { var h = v / 255 * 300, c = 1, x = c * (1 - Math.abs((h / 60) % 2 - 1)), r = 0, g = 0, b = 0, i = (h / 60) | 0;
      if (i === 0) { r = c; g = x; } else if (i === 1) { r = x; g = c; } else if (i === 2) { g = c; b = x; } else if (i === 3) { g = x; b = c; } else { r = x; b = c; }
      return [r * 255 | 0, g * 255 | 0, b * 255 | 0, 1]; },
    ember: function (v) { return [Math.min(255, v * 1.6) | 0, (v * v / 300) | 0, (v > 220 ? (v - 220) * 6 : 0) | 0, 1]; }
  };
  var ui = null, raf = 0, mode = 'glitch', pal = 'ocean', fileBytes = null, filePos = 0, grid = null, dig = null, CELL = 8, COLS = 64, ROWS = 64;
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function liveBytes() {
    var LR = root.WorldListeningRoom, A = LR && LR.analyser && LR.analyser(); if (!A) return null;
    var d = new Uint8Array(A.fftSize); A.getByteTimeDomainData(d);
    var f = new Uint8Array(A.frequencyBinCount); A.getByteFrequencyData(f);
    var out = new Uint8Array(COLS); for (var i = 0; i < COLS; i++) out[i] = (d[(i * 7) % d.length] ^ f[i % f.length]) & 255;   // waveform x spectrum = the glitch texture
    return out;
  }
  function nextRow() {
    if (fileBytes) { var o = new Uint8Array(COLS); for (var i = 0; i < COLS; i++) o[i] = fileBytes[(filePos + i) % fileBytes.length]; filePos = (filePos + COLS) % fileBytes.length; return o; }
    return liveBytes();
  }
  function feed(bytes) { fileBytes = bytes && bytes.length ? bytes : null; filePos = 0; dig = new Float32Array(256 * 256); if (fileBytes) digraphAll(fileBytes); }
  function digraphAll(b) { var n = Math.min(b.length - 1, 4e6); for (var i = 0; i < n; i++) dig[b[i] * 256 + b[i + 1]] += 1; }
  function draw() {
    raf = requestAnimationFrame(draw); if (!ui) return;
    var cv = ui.querySelector('#bv-c'), g = cv.getContext('2d'), row = nextRow();
    if (mode === 'glitch') {
      if (!row) { g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#7fd'; g.font = '16px system-ui'; g.fillText('Play the Listening Room or drop a file', 140, 260); return; }
      g.drawImage(cv, 0, CELL);                                                                 // scroll down one row
      var P = PAL[pal];
      for (var i = 0; i < COLS; i++) { var c = P(row[i]); g.fillStyle = c[3] ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : '#000'; g.fillRect(i * CELL, 0, CELL, CELL); }
    } else {
      if (row && !fileBytes) { for (var k = 0; k < row.length - 1; k++) dig[row[k] * 256 + row[k + 1]] += 1; for (var q = 0; q < dig.length; q++) dig[q] *= 0.995; }
      var img = g.createImageData(256, 256), mx = 0; for (var j = 0; j < dig.length; j++) if (dig[j] > mx) mx = dig[j];
      var L = Math.log(1 + mx) || 1, P2 = PAL[pal];
      for (var p = 0; p < dig.length; p++) { var v = dig[p] ? (Math.log(1 + dig[p]) / L * 255) | 0 : 0, cc = P2(v); img.data[p * 4] = v ? cc[0] : 0; img.data[p * 4 + 1] = v ? cc[1] : 0; img.data[p * 4 + 2] = v ? cc[2] : 0; img.data[p * 4 + 3] = 255; }
      if (!grid) grid = document.createElement('canvas'); grid.width = grid.height = 256; grid.getContext('2d').putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false; g.drawImage(grid, 0, 0, cv.width, cv.height);
    }
  }
  function open() {
    if (ui) return; dig = dig || new Float32Array(256 * 256);
    ui = el('div', 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;background:rgba(4,6,14,.82);font-family:system-ui;color:#e8f6ff');
    ui.innerHTML = '<div style="position:relative;width:min(92vw,560px);background:#0b0f20;border-radius:24px;padding:16px;box-shadow:0 30px 80px rgba(0,0,0,.6)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><b style="font-size:18px">Binary Vision</b><span style="opacity:.6;font-size:12px">sound and files, seen as bytes</span>' +
      '<button id="bv-x" style="margin-left:auto;width:36px;height:36px;border-radius:50%;border:0;background:#1a2040;color:#fff;font-size:18px;cursor:pointer">×</button></div>' +
      '<canvas id="bv-c" width="512" height="512" style="width:100%;aspect-ratio:1/1;border-radius:12px;background:#000;image-rendering:pixelated"></canvas>' +
      '<div id="bv-bar" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"></div>' +
      '<div style="margin-top:8px;font-size:11px;opacity:.55">Drop any file on the canvas to see its bytes (read in your browser only). Method: binary-visualization by Mitja Felicijan (BSD-2).</div></div>';
    document.body.appendChild(ui);
    ui.querySelector('#bv-x').onclick = close;
    var bar = ui.querySelector('#bv-bar'), btn = function (txt, on, fn) { var b = el('button', 'padding:7px 12px;border-radius:14px;border:1px solid ' + (on ? '#22e0ff' : '#2a3155') + ';background:#0b0f20;color:#fff;font:600 12px system-ui;cursor:pointer', txt); b.onclick = fn; bar.appendChild(b); };
    function paint() {
      bar.innerHTML = '';
      btn('Glitch', mode === 'glitch', function () { mode = 'glitch'; paint(); }); btn('Digraph', mode === 'digraph', function () { mode = 'digraph'; paint(); });
      Object.keys(PAL).forEach(function (k) { btn(k[0].toUpperCase() + k.slice(1), pal === k, function () { pal = k; paint(); }); });
      btn(fileBytes ? 'Live mix' : 'Live mix ✓', !fileBytes, function () { feed(null); paint(); });
    }
    paint();
    var cv = ui.querySelector('#bv-c');
    cv.addEventListener('dragover', function (e) { e.preventDefault(); });
    cv.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f || f.size > 64 * 1048576) return;
      var r = new FileReader(); r.onload = function () { feed(new Uint8Array(r.result)); paint(); }; r.readAsArrayBuffer(f); });
    ui.addEventListener('keydown', function (e) { if (e.code === 'Escape') close(); });
    draw();
  }
  function close() { cancelAnimationFrame(raf); if (ui) ui.remove(); ui = null; }
  function toggle() { ui ? close() : open(); }
  root.WorldBinaryVision = { open: open, close: close, toggle: toggle, feed: feed, PAL: PAL };
})(typeof window !== 'undefined' ? window : this);
