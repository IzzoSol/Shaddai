/* world-loading-slides.js — the loading-screen SLIDESHOW (owner 2026-10-02): full-bleed art of the agents + the world fades behind the progress bar.
 *   Slide 1 loads immediately (one small webp); the rest are preloaded one at a time AFTER the page is idle, so the intro never waits on art.
 *   /assets/loading/slides.json (optional) extends or replaces the list: [{ src, who, line }]. Drop generated agent art there with no code change.
 *   WorldLoadingSlides.SLIDES · merge(base, extra) · next(i, n) · start(rootEl, {every_ms}) -> { stop() }
 */
(function (root) {
  'use strict';
  var SLIDES = [
    { src: '/assets/loading/s1-storm.webp', who: 'SHADDAI', line: 'One world. Every agent. Yours to shape.' },
    { src: '/assets/loading/s2-phoenix.webp', who: 'ORACLE', line: 'Know the night before it comes.' },
    { src: '/assets/loading/s3-orb.webp', who: 'NEXUS', line: 'Every skill, one tap away.' },
    { src: '/assets/loading/s4-squad.webp', who: 'THE COUNCIL', line: 'Seven agents. One army.' }
  ];
  function merge(base, extra) {
    var out = base.slice(), seen = {}; out.forEach(function (s) { seen[s.src] = 1; });
    (extra || []).forEach(function (s) { if (s && s.src && !seen[s.src]) { seen[s.src] = 1; out.push({ src: String(s.src), who: String(s.who || ''), line: String(s.line || '') }); } });
    return out;
  }
  function next(i, n) { return n > 0 ? (i + 1) % n : 0; }
  function start(el, o) {
    o = o || {}; if (!el || typeof document === 'undefined') return { stop: function () { } };
    var slides = SLIDES.slice(), idx = 0, timer = null, stopped = false, every = o.every_ms || 6500, layers = [], cap = null;
    el.style.cssText += ';position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;background:#04060a';
    for (var k = 0; k < 2; k++) { var im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.4s ease;transform:scale(1.04)'; el.appendChild(im); layers.push(im); }
    var shade = document.createElement('div'); shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.55) 0%,rgba(4,6,10,.15) 38%,rgba(4,6,10,.8) 100%)'; el.appendChild(shade);
    cap = document.createElement('div'); cap.style.cssText = 'position:absolute;left:28px;bottom:84px;max-width:min(70vw,520px);font:600 12px/1.5 system-ui,sans-serif;letter-spacing:.18em;color:#e8c45c;text-transform:uppercase;text-shadow:0 2px 12px #000'; el.appendChild(cap);
    var cur = 0;
    function show(i) { var s = slides[i]; if (!s) return; var nx = 1 - cur, im2 = layers[nx]; im2.onload = function () { if (stopped) return; im2.style.opacity = '1'; im2.style.transform = 'scale(1)'; layers[cur].style.opacity = '0'; layers[cur].style.transform = 'scale(1.04)'; cur = nx; cap.innerHTML = '<span style="display:block;animation:capIn .9s ease both;color:#00ff9c">' + s.who + '</span><span style="display:block;animation:capIn 1.1s .25s ease both;color:#cfe8dc;letter-spacing:.06em;text-transform:none;font-size:14px">' + s.line + '</span>'; }; im2.src = s.src; }
    function tick() { if (stopped) return; idx = next(idx, slides.length); show(idx); timer = setTimeout(tick, every); }
    show(0); timer = setTimeout(tick, every);
    function loadManifest() { try { fetch('/assets/loading/slides.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.length) slides = merge(slides, j); }).catch(function () { }); } catch (e) { } }
    function idle(f) { (root.requestIdleCallback || function (g) { setTimeout(g, 1500); })(f); }
    idle(function () { loadManifest(); slides.forEach(function (s, i) { if (i) setTimeout(function () { var p = new Image(); p.src = s.src; }, 800 * i); }); });
    return { stop: function () { stopped = true; clearTimeout(timer); if (el.parentNode) el.style.transition = 'opacity .8s', el.style.opacity = '0'; } };
  }
  root.WorldLoadingSlides = { SLIDES: SLIDES, merge: merge, next: next, start: start };
})(typeof window !== 'undefined' ? window : globalThis);
