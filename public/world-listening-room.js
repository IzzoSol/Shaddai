/* world-listening-room.js — TURTLE studio LISTENING ROOM (owner ref 2026-10-23: "Listening Room — each user hears the room differently").
 *
 * A circular jam: every participant (you, agents, the AI generator) owns a coloured wedge playing one part; the centre shows the live
 * waveform with play/pause; "+ Add" brings another part in. EVERY LISTENER HAS THEIR OWN MIX (mute / solo / volume per lane, saved
 * per viewer in localStorage) — the same session, heard differently. Audio is synthesised in WebAudio (no files, no paid services):
 * all lanes lock to one tempo/chord loop (Am - F - C - G, 96 BPM) so anything added stays in key.
 *
 *   WorldListeningRoom.open() / close() / toggle() · .attach({ getPlayer, isInside }) -> prompt + L key at window.__listeningRing
 * The ring prop is built in TURTLE's museum (world-interiors.js museum()); stand on it and press L.
 */
(function (root) {
  'use strict';
  var BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4, LOOP_BARS = 4;
  var CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];            // Am F C G (MIDI)
  var PARTS = {
    bass:    { label: 'Bass',      color: '#e0457b', icon: '◆' },
    guitar:  { label: 'Guitar',    color: '#2fb7c9', icon: '✦' },
    vocals:  { label: 'Vocals',    color: '#f06a8a', icon: '●' },
    synths:  { label: 'Synths',    color: '#f0a03a', icon: '▲' },
    ambient: { label: 'Ambient',   color: '#6fd39a', icon: '≈' },
    sax:     { label: 'Saxophone', color: '#5a7cf0', icon: '♪' },
    drums:   { label: 'Drums',     color: '#b45af0', icon: '■' }
  };
  var DEFAULT = [{ who: 'You', part: 'bass' }, { who: 'TURTLE', part: 'synths' }, { who: 'QUILL', part: 'vocals' }, { who: 'AI Generator', part: 'ambient' }, { who: 'Guest Bot', part: 'drums' }];
  var KEY = 'shd_listening_mix_v1';
  var ctx = null, master = null, analyser = null, lanes = [], playing = false, nextBar = 0, barIx = 0, timer = 0, ui = null, raf = 0;
  var mix = (function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
  function saveMix() { try { localStorage.setItem(KEY, JSON.stringify(mix)); } catch (e) { } }
  // owner ref 2026-10-23 "musical spiral of frequency, colour and light": one colour per pitch class (C magenta .. B red), optional 432 Hz A
  var NOTE_COL = ['#ff2fd0', '#c42cff', '#8a2cff', '#2c4bff', '#22e0ff', '#2cff6a', '#9cff2c', '#e6ff2c', '#ffd02c', '#ff9a2c', '#ff6a2c', '#ff2c2c'];
  var FX = { a4: 440, notes: true, cymatics: true, geometry: true };
  try { Object.assign(FX, JSON.parse(localStorage.getItem('shd_listening_fx_v1') || '{}')); } catch (e) { }
  function saveFx() { try { localStorage.setItem('shd_listening_fx_v1', JSON.stringify(FX)); } catch (e) { } }
  var hz = function (m) { return FX.a4 * Math.pow(2, (m - 69) / 12); };
  var vis = [], rootMidi = 57;   // floating note glyphs [{t, midi, x}] + the current chord root (drives cymatics + geometry tint)

  function ensureAudio() {
    if (ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.7; analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    master.connect(analyser); analyser.connect(ctx.destination);
  }
  function laneGain(l) {   // this listener's mix: solo beats mute; volume 0..1
    var m = mix[l.id] || {}, anySolo = lanes.some(function (q) { return (mix[q.id] || {}).solo; });
    if (anySolo && !m.solo) return 0; if (m.mute) return 0; return m.vol == null ? 0.8 : m.vol;
  }
  function applyMix() { lanes.forEach(function (l) { if (l.gain) l.gain.gain.setTargetAtTime(laneGain(l), ctx.currentTime, 0.05); }); }
  function addLane(who, part) {
    var l = { id: who + ':' + part, who: who, part: part };
    if (ctx) { l.gain = ctx.createGain(); l.gain.gain.value = laneGain(l); l.gain.connect(master); }
    lanes.push(l); return l;
  }
  function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function osc(type, f, t, dur, peak, dest, filt) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    var out = g; if (filt) { var bq = ctx.createBiquadFilter(); bq.type = filt.type; bq.frequency.value = filt.f; bq.Q.value = filt.q || 1; g.connect(bq); out = bq; }
    o.connect(g); out.connect(dest); env(g, t, 0.01, dur, peak); o.start(t); o.stop(t + dur + 0.05);
    if (vis.length < 90 && f > 60) vis.push({ t: t, midi: Math.round(69 + 12 * Math.log2(f / FX.a4)), x: Math.random(), born: 0 });
    return o;
  }
  var noiseBuf = null;
  function noise(t, dur, peak, dest, f, type) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var s = ctx.createBufferSource(), g = ctx.createGain(), bq = ctx.createBiquadFilter(); s.buffer = noiseBuf; bq.type = type || 'highpass'; bq.frequency.value = f || 6000;
    s.connect(bq); bq.connect(g); g.connect(dest); env(g, t, 0.003, dur, peak); s.start(t); s.stop(t + dur + 0.05);
  }
  function scheduleBar(t, bar) {   // one bar of every lane, all on the same chord
    var ch = CHORDS[bar % CHORDS.length]; setTimeout(function () { rootMidi = ch[0]; }, Math.max(0, (t - ctx.currentTime) * 1000));
    lanes.forEach(function (l) {
      var d = l.gain; if (!d) return;
      if (l.part === 'bass') for (var b = 0; b < 4; b++) osc('sawtooth', hz(ch[0] - 24), t + b * BEAT, BEAT * 0.8, 0.35, d, { type: 'lowpass', f: 420 });
      else if (l.part === 'guitar') for (var s = 0; s < 8; s++) osc('triangle', hz(ch[s % 3] + 12), t + s * BEAT / 2, 0.28, 0.18, d);
      else if (l.part === 'vocals') { var v = osc('sine', hz(ch[2] + 12), t, BAR * 0.9, 0.16, d); var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = 6; lfo.connect(lg); lg.connect(v.frequency); lfo.start(t); lfo.stop(t + BAR); }
      else if (l.part === 'synths') ch.forEach(function (n) { osc('sawtooth', hz(n), t, BAR * 0.95, 0.06, d, { type: 'lowpass', f: 1800 }); });
      else if (l.part === 'ambient') { noise(t, BAR, 0.05, d, 900, 'bandpass'); osc('sine', hz(ch[0]), t, BAR, 0.08, d); }
      else if (l.part === 'sax') { var mel = [ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12]; mel.forEach(function (n, i) { osc('square', hz(n), t + i * BEAT, BEAT * 0.7, 0.05, d, { type: 'bandpass', f: 1200, q: 2 }); }); }
      else if (l.part === 'drums') for (var k = 0; k < 8; k++) {
        var tt = t + k * BEAT / 2;
        if (k % 4 === 0) { var kk = osc('sine', 120, tt, 0.25, 0.6, d); kk.frequency.exponentialRampToValueAtTime(40, tt + 0.2); }
        if (k % 4 === 2) noise(tt, 0.15, 0.25, d, 1800, 'highpass');
        noise(tt, 0.04, 0.08, d, 7000);
      }
    });
  }
  function tick() { if (!playing) return; while (nextBar < ctx.currentTime + 0.3) { scheduleBar(nextBar, barIx); nextBar += BAR; barIx = (barIx + 1) % LOOP_BARS; } }
  function play() { ensureAudio(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume(); lanes.forEach(function (l) { if (!l.gain) { l.gain = ctx.createGain(); l.gain.connect(master); } }); applyMix(); playing = true; nextBar = ctx.currentTime + 0.1; clearInterval(timer); timer = setInterval(tick, 80); render(); }
  function pause() { playing = false; clearInterval(timer); render(); }

  // ---------------- UI (owner ref: coloured wedges round a dark centre, avatars + part labels, centre waveform + play/pause, Add) ----
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function build() {
    ui = el('div', 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,14,.72);font:600 14px system-ui,Segoe UI,sans-serif;color:#eef2ff');
    ui.innerHTML = '<div id="lr-card" style="position:relative;width:min(92vw,720px);aspect-ratio:1/1;border-radius:36px;background:#141a33;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)">' +
      '<div id="lr-wedges" style="position:absolute;inset:0"></div><canvas id="lr-fx" width="720" height="720" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>' +
      '<div id="lr-tog" style="position:absolute;left:18px;bottom:18px;display:flex;gap:6px;flex-wrap:wrap;max-width:60%"></div>' +
      '<div style="position:absolute;top:22px;left:0;right:0;text-align:center;font-size:20px;font-weight:700">Listening Room <span style="font-weight:400;opacity:.75">(each listener hears the room differently)</span></div>' +
      '<button id="lr-x" style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;border:0;background:#0b0f20;color:#fff;font-size:22px;cursor:pointer">×</button>' +
      '<div style="position:absolute;left:50%;top:50%;width:52%;height:34%;transform:translate(-50%,-50%);border-radius:50%;background:#0d1226;box-shadow:inset 0 0 40px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center">' +
      '<canvas id="lr-wave" width="420" height="120" style="width:86%;height:56%"></canvas>' +
      '<button id="lr-play" style="position:absolute;width:64px;height:64px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:26px;cursor:pointer;backdrop-filter:blur(4px)"></button></div>' +
      '<button id="lr-add" style="position:absolute;right:18px;bottom:18px;padding:12px 22px;border-radius:28px;border:0;background:#0b0f20;color:#fff;font-size:18px;font-weight:700;cursor:pointer">＋ Add</button>' +
      '<div id="lr-menu" style="display:none;position:absolute;right:18px;bottom:76px;background:#0b0f20;border-radius:16px;padding:8px;min-width:170px"></div></div>';
    document.body.appendChild(ui);
    ui.querySelector('#lr-x').onclick = close; ui.querySelector('#lr-play').onclick = function () { playing ? pause() : play(); };
    ui.querySelector('#lr-add').onclick = function () { var m = ui.querySelector('#lr-menu'); m.style.display = m.style.display === 'none' ? 'block' : 'none'; };
    var menu = ui.querySelector('#lr-menu');
    Object.keys(PARTS).forEach(function (k) { var b = el('button', 'display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:#fff;cursor:pointer;font:inherit', PARTS[k].icon + ' ' + PARTS[k].label);
      b.onclick = function () { addLane(k === 'ambient' ? 'AI Generator' : 'Guest ' + (lanes.length + 1), k); if (playing) applyMix(); menu.style.display = 'none'; render(); }; menu.appendChild(b); });
    var tog = ui.querySelector('#lr-tog');
    [['a4', function () { return FX.a4 === 432 ? '432 Hz' : '440 Hz'; }, function () { FX.a4 = FX.a4 === 432 ? 440 : 432; }],
     ['notes', function () { return 'Notes'; }, function () { FX.notes = !FX.notes; }], ['cymatics', function () { return 'Cymatics'; }, function () { FX.cymatics = !FX.cymatics; }],
     ['geometry', function () { return 'Sacred geometry'; }, function () { FX.geometry = !FX.geometry; }]].forEach(function (d) {
      var b = el('button', 'padding:7px 12px;border-radius:16px;border:1px solid #2a3155;background:#0b0f20;color:#fff;font:600 12px system-ui;cursor:pointer');
      var paint = function () { b.textContent = d[1](); b.style.opacity = (d[0] === 'a4' || FX[d[0]]) ? 1 : 0.45; b.style.borderColor = (d[0] === 'a4' ? (FX.a4 === 432 ? '#ffd02c' : '#2a3155') : (FX[d[0]] ? '#22e0ff' : '#2a3155')); };
      b.onclick = function () { d[2](); saveFx(); paint(); }; paint(); tog.appendChild(b);
    });
    ui.addEventListener('keydown', function (e) { if (e.code === 'Escape') close(); });
  }
  function render() {
    if (!ui) return; var W = ui.querySelector('#lr-wedges'); W.innerHTML = ''; var n = lanes.length || 1;
    var stops = lanes.map(function (l, i) { var c = PARTS[l.part].color; return c + '55 ' + (i * 360 / n) + 'deg ' + ((i + 1) * 360 / n - 1) + 'deg, #141a33 ' + ((i + 1) * 360 / n - 1) + 'deg ' + ((i + 1) * 360 / n) + 'deg'; }).join(',');
    W.style.background = 'conic-gradient(from 0deg,' + stops + ')';
    lanes.forEach(function (l, i) {
      var a = ((i + 0.5) * 360 / n - 90) * Math.PI / 180, x = 50 + Math.cos(a) * 36, y = 50 + Math.sin(a) * 36, m = mix[l.id] || {}, g = laneGain(l), P = PARTS[l.part];
      var card = el('div', 'position:absolute;left:' + x + '%;top:' + y + '%;transform:translate(-50%,-50%);text-align:center;cursor:pointer;opacity:' + (g > 0 ? 1 : 0.45));
      card.innerHTML = '<div style="width:74px;height:74px;margin:0 auto 6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,' + P.color + ',#1a1f3a);display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 0 3px ' + P.color + '88">' + (l.who === 'You' ? '🎧' : l.who.slice(0, 2).toUpperCase()) + '</div>' +
        '<div style="font-size:15px">' + l.who + '</div><div style="font-weight:400;opacity:.8">' + P.icon + ' ' + P.label + '</div>' +
        '<div style="font-size:11px;opacity:.7;margin-top:2px">' + (m.solo ? 'SOLO' : m.mute ? 'MUTED' : 'vol ' + Math.round((m.vol == null ? 0.8 : m.vol) * 100)) + '</div>';
      card.title = 'click: mute · shift+click: solo · wheel: volume (your mix only)';
      card.onclick = function (e) { var q = mix[l.id] = mix[l.id] || {}; if (e.shiftKey) q.solo = !q.solo; else q.mute = !q.mute; saveMix(); if (ctx) applyMix(); render(); };
      card.onwheel = function (e) { e.preventDefault(); var q = mix[l.id] = mix[l.id] || {}; q.vol = Math.max(0, Math.min(1, (q.vol == null ? 0.8 : q.vol) - Math.sign(e.deltaY) * 0.05)); saveMix(); if (ctx) applyMix(); render(); };
      W.appendChild(card);
    });
    ui.querySelector('#lr-play').textContent = playing ? '❚❚' : '▶';
  }
  // Chladni plate: nodal lines of cos(n pi x)cos(m pi y) - cos(m pi x)cos(n pi y); (n, m) from the chord root, so the figure changes with the music
  function cymatics(g, w, h, midi, col, tt) {
    var pc = ((midi % 12) + 12) % 12, n = 2 + (pc % 5), m = 3 + Math.floor(pc / 3) + (n === 3 + Math.floor(pc / 3) ? 1 : 0), A = 0.92 + 0.08 * Math.sin(tt * 2);
    g.fillStyle = col; var cols = 120, rows = 44;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = i / (cols - 1) * 2 - 1, y = j / (rows - 1) * 2 - 1; if (x * x + y * y > 1) continue;
      var v = Math.cos(n * Math.PI * x * A) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x * A) * Math.cos(n * Math.PI * y);
      if (Math.abs(v) < 0.09) g.fillRect((x + 1) / 2 * w, (y + 1) / 2 * h, 2.2, 2.2);
    }
  }
  function flowerOfLife(g, cx, cy, r, col, rot) {   // 19-circle flower of life, slowly turning
    g.save(); g.translate(cx, cy); g.rotate(rot); g.strokeStyle = col; g.lineWidth = 1.2; g.globalAlpha = 0.35;
    var pts = [[0, 0]]; for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; pts.push([Math.cos(a) * r, Math.sin(a) * r]); pts.push([Math.cos(a) * r * 2, Math.sin(a) * r * 2]); pts.push([Math.cos(a + Math.PI / 6) * r * Math.sqrt(3), Math.sin(a + Math.PI / 6) * r * Math.sqrt(3)]); }
    pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.stroke(); });
    g.globalAlpha = 0.55; g.beginPath(); g.arc(0, 0, r * 3, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  function drawWave() {
    raf = requestAnimationFrame(drawWave); if (!ui) return; var c = ui.querySelector('#lr-wave'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    var now = ctx ? ctx.currentTime : performance.now() / 1000, rc = NOTE_COL[((rootMidi % 12) + 12) % 12];
    if (FX.cymatics && playing) cymatics(g, c.width, c.height, rootMidi, rc, now);
    var F = ui.querySelector('#lr-fx'), f = F.getContext('2d'); f.clearRect(0, 0, F.width, F.height);
    if (FX.geometry) flowerOfLife(f, F.width / 2, F.height / 2, 62, rc, now * 0.08);
    if (FX.notes && playing) { f.font = '700 22px system-ui'; vis = vis.filter(function (v) { var age = now - v.t; if (age < 0) return true; if (age > 3) return false;
      var pc = ((v.midi % 12) + 12) % 12; f.globalAlpha = Math.max(0, 1 - age / 3); f.fillStyle = NOTE_COL[pc]; f.shadowColor = NOTE_COL[pc]; f.shadowBlur = 12;
      f.fillText('♪', 120 + v.x * (F.width - 240), F.height * 0.78 - age * 90); f.shadowBlur = 0; f.globalAlpha = 1; return true; }); }
    var W = ui.querySelector('#lr-wedges'); if (W && playing) W.style.boxShadow = 'inset 0 0 90px ' + rc + '55';
    var data = new Uint8Array(512); if (analyser && playing) analyser.getByteTimeDomainData(data); else data.fill(128);
    for (var i = 0; i < 64; i++) { var v = Math.abs(data[i * 8] - 128) / 128, h = 6 + v * c.height * 1.6, x = i * c.width / 64;
      g.fillStyle = i < 32 ? 'hsl(' + (20 + i) + ',95%,60%)' : 'hsl(' + (175 + i) + ',85%,60%)'; g.fillRect(x, (c.height - h) / 2, c.width / 64 - 2, h); }
  }
  function open() { if (ui) return; if (!lanes.length) DEFAULT.forEach(function (d) { addLane(d.who, d.part); }); build(); render(); drawWave(); }
  function close() { pause(); cancelAnimationFrame(raf); if (ui) { ui.remove(); ui = null; } }
  function toggle() { ui ? close() : open(); }

  // ---------------- in-world hook: prompt + L at the ring inside TURTLE's museum ----------------
  function attach(o) {
    var tip = null, near = false, v = { x: 0, y: 0, z: 0 };
    function nearRing() {
      var ring = root.__listeningRing, p = o.getPlayer && o.getPlayer(); if (!ring || !ring.parent || !p) return false;
      if (o.isInside && !o.isInside()) return false;
      var w = ring.getWorldPosition ? ring.getWorldPosition(new ring.position.constructor()) : ring.position;
      return Math.hypot(w.x - p.x, w.z - p.z) < (ring.userData.radius || 22);
    }
    setInterval(function () {
      near = nearRing();
      if (near && !tip) { tip = el('div', 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9000;padding:8px 14px;border-radius:12px;background:rgba(10,14,30,.85);color:#eef2ff;font:600 14px system-ui', 'Press <b>L</b> — Listening Room'); document.body.appendChild(tip); }
      if (!near && tip) { tip.remove(); tip = null; }
    }, 300);
    addEventListener('keydown', function (e) {
      if (e.code !== 'KeyL' || e.repeat) return; var t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
      if (near || ui) { e.preventDefault(); toggle(); }
    });
  }
  root.WorldListeningRoom = { open: open, close: close, toggle: toggle, attach: attach, PARTS: PARTS, _lanes: function () { return lanes; } };
})(typeof window !== 'undefined' ? window : this);
