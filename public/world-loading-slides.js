/* world-loading-slides.js — the loading-screen SLIDESHOW (owner 2026-10-02): full-bleed art of the agents + the world behind the progress bar.
 * COMPOSITOR-DRIVEN (2026-10-03 fix): the cross-fade is a pure CSS animation, so it keeps playing while the page's main thread is busy building the world
 * (the first JS-timer version froze after two slides). All slides are small webp (about 60-120 KB), loaded with low priority so they never compete with the world's own assets.
 *   WorldLoadingSlides.SLIDES · merge(base, extra) · next(i, n) · start(rootEl, {every_ms}) -> { stop() }
 */
(function (root) {
  'use strict';
  var SLIDES = [
    { src: '/assets/loading/s1-storm.webp', who: 'SHADDAI', line: 'One world. Every agent. Yours to shape.' },
    { src: '/assets/loading/agent-oracle.webp', who: 'ORACLE', line: 'Know the night before it comes.' },
    { src: '/assets/loading/s2-phoenix.webp', who: 'THE PHOENIX', line: 'Rise through the rain.' },
    { src: '/assets/loading/agent-nexus.webp', who: 'NEXUS', line: 'Every skill, one tap away.' },
    { src: '/assets/loading/s3-orb.webp', who: 'THE COUNCIL', line: 'Seven agents. One army.' },
    { src: '/assets/loading/agent-zerox.webp', who: 'ZEROX', line: 'Markets move. We read them first.' },
    { src: '/assets/loading/s4-squad.webp', who: 'THE SQUAD', line: 'Never fight alone.' },
    { src: '/assets/loading/agent-turtle.webp', who: 'TURTLE', line: 'Make it beautiful. Make it move.' },
    { src: '/assets/loading/agent-quill.webp', who: 'QUILL', line: 'Say it clearly. Say it once.' },
    { src: '/assets/loading/agent-pikadon.webp', who: 'PIKADON', line: 'Nothing gets past the shield.' },
    { src: '/assets/loading/agent-shaddai.webp', who: 'SHADDAI', line: 'The world is yours to build.' }
  ];
  function merge(base, extra) {
    var out = base.slice(), seen = {}; out.forEach(function (s) { seen[s.src] = 1; });
    (extra || []).forEach(function (s) { if (s && s.src && !seen[s.src]) { seen[s.src] = 1; out.push({ src: String(s.src), who: String(s.who || ''), line: String(s.line || '') }); } });
    return out;
  }
  function next(i, n) { return n > 0 ? (i + 1) % n : 0; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* keyframes for N slides sharing one cycle: each slide fades in, holds, fades out, with a slow push-in (Ken Burns); fade = fadeS seconds */
  function keyframes(n, every, fadeS) {
    var total = n * every, slot = 100 / n, f = Math.min(slot / 2, fadeS / total * 100), r = function (x) { return +x.toFixed(3); };
    return '@keyframes wlsFade{0%{opacity:0;transform:scale(1.07)}' + r(f) + '%{opacity:1}' + r(slot) + '%{opacity:1;transform:scale(1)}' + r(slot + f) + '%{opacity:0;transform:scale(1)}100%{opacity:0;transform:scale(1.07)}}';
  }
  function start(el, o) {
    o = o || {}; if (!el || typeof document === 'undefined') return { stop: function () { } };
    var slides = SLIDES.slice(), n = slides.length, every = o.every_ms ? o.every_ms / 1000 : 6, total = n * every;
    el.style.cssText += ';position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;background:#04060d;transition:opacity .8s';
    var st = document.createElement('style'); st.textContent = keyframes(n, every, 1.4) + '.wlsSlide{position:absolute;inset:0;opacity:0;will-change:opacity,transform;animation:wlsFade ' + total + 's linear infinite both}.wlsSlide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}@media (prefers-reduced-motion:reduce){.wlsSlide{animation-duration:' + (total * 2) + 's}}'; el.appendChild(st);
    slides.forEach(function (s, i) {
      var d = document.createElement('div'); d.className = 'wlsSlide'; d.style.animationDelay = (i * every) + 's';
      var im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; try { im.fetchPriority = i === 0 ? 'auto' : 'low'; } catch (e) { } im.src = s.src; d.appendChild(im);
      var cap = document.createElement('div'); cap.style.cssText = 'position:absolute;left:28px;bottom:84px;max-width:min(70vw,520px);font:600 12px/1.5 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 2px 12px #000';
      cap.innerHTML = '<span style="display:block;color:#00ff9c">' + esc(s.who) + '</span><span style="display:block;color:#cfe8dc;letter-spacing:.06em;text-transform:none;font-size:14px">' + esc(s.line) + '</span>'; d.appendChild(cap); el.appendChild(d);
    });
    var shade = document.createElement('div'); shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.55) 0%,rgba(4,6,10,.15) 38%,rgba(4,6,10,.8) 100%)'; el.appendChild(shade);
    return { stop: function () { el.style.opacity = '0'; }, slides: n, cycle_s: total };
  }
  root.WorldLoadingSlides = { SLIDES: SLIDES, merge: merge, next: next, start: start, keyframes: keyframes };
})(typeof window !== 'undefined' ? window : globalThis);
