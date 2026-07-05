/* SHADDAI — safe theme switcher (additive; no dashboard logic/DOM touched).
   Sets data-theme on <html>, persists to localStorage, injects a first-visit
   picker "intro" + a persistent ◒ THEME control. Original = stable default. */
(function () {
  'use strict';
  var KEY = 'shaddai_ui_theme';
  var THEMES = {
    'original':         { label:'ORIGINAL',         tag:'The main build',        desc:'The current SHADDAI dashboard, unchanged. The stable default everything runs on.', accent:'#00e5a0', bg:'#0c1425' },
    'salvaged-console': { label:'SALVAGED CONSOLE',  tag:'Industrial · repaired', desc:'Field-repaired machine panels — seams, brackets, hazard strips, signal amber on oil-black.', accent:'#d98a1f', bg:'#141109' },
    'signal-cathedral': { label:'SIGNAL CATHEDRAL',  tag:'Monumental · cinematic',desc:'A control chamber for a living system — monolithic panels, luminous rails, sacred-tech dark.', accent:'#5fd0ff', bg:'#0a0c10' },
    'glitch-ops':       { label:'GLITCH//OPS',        tag:'CRT · pixel-glitch',    desc:'Pure-black terminal, neon pixel-glitch canvas textures, scanlines, Orbitron display. Your GLITCH//OPS design.', accent:'#00f0ff', bg:'#000000' }
  };

  // ── animated pixel-glitch background (only rendered for glitch-ops) ──
  var _glitchRAF = null;
  function _glitchCanvas(cv, palette, o) {
    var ctx = cv.getContext('2d'), W, H, t = Math.random() * 1000, bs = o.blockSize || 6, sp = o.speed || 0.01, ns = o.noiseScale || 0.022;
    function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; }
    function n2(x, y, tt) { return (Math.sin(x*1.3+tt*1.1)*Math.sin(y*0.9+tt*0.7) + Math.sin(x*0.7-tt*0.5)*Math.cos(y*1.4+tt*0.3) + Math.sin((x+y)*0.5+tt)) / 3; }
    function draw() {
      t += sp; ctx.clearRect(0, 0, W, H);
      var cols = Math.ceil(W/bs), rows = Math.ceil(H/bs);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var v = (n2(c*ns, r*ns, t) + n2(c*ns*2, r*ns*2, t*1.3)) / 2;
        ctx.globalAlpha = Math.abs(v)*0.9 + 0.1;
        ctx.fillStyle = v > 0.5 ? palette[0] : v > 0.2 ? palette[1] : v > -0.1 ? palette[2] : v > -0.4 ? palette[3] : palette[4];
        ctx.fillRect(c*bs, r*bs, bs, bs);
      }
      ctx.globalAlpha = 1; _glitchRAF = requestAnimationFrame(draw);
    }
    resize(); window.addEventListener('resize', resize); draw();
  }
  function setGlitchBg(on) {
    var el = document.getElementById('suit-glitch-bg');
    if (on) {
      if (el || !document.body) return;
      var cv = document.createElement('canvas'); cv.id = 'suit-glitch-bg'; cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;opacity:0.09;pointer-events:none';
      document.body.appendChild(cv);
      _glitchCanvas(cv, ['#ffffff', '#00f0ff', '#0066aa', '#111111', '#000000'], { blockSize: 6, speed: 0.01, noiseScale: 0.022 });
    } else {
      if (_glitchRAF) { cancelAnimationFrame(_glitchRAF); _glitchRAF = null; }
      if (el) el.remove();
    }
  }

  function apply(name) {
    if (!THEMES[name]) name = 'original';
    var root = document.documentElement;
    if (name === 'original') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', name);
    try { setGlitchBg(name === 'glitch-ops'); } catch (e) {}
    try { localStorage.setItem(KEY, name); } catch (e) {}
    var cards = document.querySelectorAll('.suit-card');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', cards[i].getAttribute('data-theme') === name);
    var dot = document.querySelector('#suit-btn .suit-dot'); if (dot) dot.style.background = THEMES[name].accent;
  }

  // apply saved theme ASAP to minimise flash of the default
  var saved = 'original';
  try { saved = localStorage.getItem(KEY) || 'original'; } catch (e) {}
  if (saved !== 'original') document.documentElement.setAttribute('data-theme', saved);

  function buildPicker() {
    if (document.getElementById('suit-overlay')) return;
    var ov = document.createElement('div'); ov.id = 'suit-overlay';
    var cards = Object.keys(THEMES).map(function (k) {
      var t = THEMES[k];
      return '<button class="suit-card" data-theme="' + k + '" style="--ca:' + t.accent + ';--cb:' + t.bg + '">' +
        '<div class="suit-swatch"><i></i><b></b><s></s></div>' +
        '<div class="suit-name">' + t.label + '</div>' +
        '<div class="suit-tag">' + t.tag + '</div>' +
        '<div class="suit-desc">' + t.desc + '</div>' +
        '<div class="suit-pick">SELECT ▸</div>' +
      '</button>';
    }).join('');
    ov.innerHTML =
      '<div class="suit-panel">' +
        '<div class="suit-head">' +
          '<div class="suit-kicker">SHADDAI · INTERFACE</div>' +
          '<div class="suit-title">CHOOSE YOUR CONSOLE</div>' +
          '<div class="suit-sub">Same engine underneath — every agent, tool and API is identical. Only the surface changes. <b>Original</b> is the stable main; the others are test skins.</div>' +
        '</div>' +
        '<div class="suit-grid">' + cards + '</div>' +
        '<div class="suit-foot"><button id="suit-enter" class="suit-enter">ENTER DASHBOARD →</button>' +
        '<span class="suit-note">Switch anytime from the ◒ THEME control (bottom-left).</span></div>' +
      '</div>';
    document.body.appendChild(ov);
    var cs = ov.querySelectorAll('.suit-card');
    for (var i = 0; i < cs.length; i++) (function (c) { c.onclick = function () { apply(c.getAttribute('data-theme')); }; })(cs[i]);
    document.getElementById('suit-enter').onclick = function () {
      ov.classList.add('gone'); setTimeout(function () { if (ov.parentNode) ov.remove(); }, 380);
      try { localStorage.setItem(KEY + '_seen', '1'); } catch (e) {}
    };
    apply(saved);
  }

  function buildButton() {
    if (document.getElementById('suit-btn')) return;
    var b = document.createElement('button'); b.id = 'suit-btn'; b.title = 'Switch interface theme';
    b.innerHTML = '<span class="suit-dot"></span>THEME';
    b.onclick = buildPicker;
    document.body.appendChild(b);
    var dot = b.querySelector('.suit-dot'); if (dot) dot.style.background = THEMES[saved].accent;
  }

  function init() {
    buildButton();
    var seen = '0'; try { seen = localStorage.getItem(KEY + '_seen') || '0'; } catch (e) {}
    if (seen !== '1') buildPicker();   // first-visit interactive intro selector
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // public hooks (no logic branching in the app — presentation only)
  window.SHADDAI_setTheme = apply;
  window.SHADDAI_openThemePicker = buildPicker;
  window.SHADDAI_themes = THEMES;
})();
