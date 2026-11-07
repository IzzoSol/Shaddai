/* SHADDAI V119 — PROVIDER ORBIT + WALLET TILES.
   Replaces the basic emoji carousel on the APIs tab with a deep, glowing orbit of provider cards (monogram marks, status chips,
   reflection, drag / wheel / arrow keys), and replaces the dim wallet-connect row with vibrant "coming soon" tiles.
   It re-uses the existing state (_apiCarouselIdx, API_PROVIDERS_SWIVEL) and buttons (rotateApiCarousel, connectApiProvider,
   openApiProvider), so everything already wired keeps working. */
(function () {
  'use strict';
  var CAT = { AI: 'chip', Trading: 'chart', Blockchain: 'cube', Billing: 'card', Content: 'video', Research: 'search', Social: 'chat', Platform: 'globe' };
  var STATUS = { free: ['Free', '#00ff88', 'check'], local: ['Local', '#00f0ff', 'server'], 'key-required': ['Key needed', '#ffb020', 'key'] };
  function ic(n, s) { return window.shdIcons ? window.shdIcons.icon(n, s) : ''; }
  function mk(label, color, px) { return window.shdIcons ? window.shdIcons.mark(label, color, px) : ''; }
  var built = null, drag = null, wheelAt = 0;

  function list() { try { return API_PROVIDERS_SWIVEL; } catch (e) { return []; } }
  function cur() { try { return _apiCarouselIdx; } catch (e) { return 0; } }
  function setCur(i) { try { _apiCarouselIdx = i; } catch (e) { /* ignore */ } render(); }

  function build(stage) {
    stage.textContent = ''; stage.className = 'ao-stage'; stage.setAttribute('tabindex', '0'); stage.setAttribute('role', 'listbox'); stage.setAttribute('aria-label', 'API providers. Use the arrow keys to browse.');
    var cards = list().map(function (p, i) {
      var st = STATUS[p.status] || STATUS['key-required'];
      var el = document.createElement('div'); el.className = 'ao-card'; el.setAttribute('role', 'option'); el.style.setProperty('--c', p.color || '#00e5a0'); el.style.setProperty('--s', st[1]);
      el.innerHTML = '<div class="ao-sheen"></div><div class="ao-mark">' + mk(p.name, p.color, 76) + '</div><div class="ao-name"></div>' +
        '<div class="ao-cat">' + ic(CAT[p.cat] || 'spark', 13) + '<span></span></div><div class="ao-desc"></div>' +
        '<div class="ao-stat">' + ic(st[2], 12) + '<span>' + st[0] + '</span></div>' +
        '<div class="ao-act"><button type="button" class="ao-btn go">Connect</button><button type="button" class="ao-btn">Docs</button></div>';
      el.querySelector('.ao-name').textContent = p.name; el.querySelector('.ao-cat span').textContent = p.cat; el.querySelector('.ao-desc').textContent = p.desc;
      var b = el.querySelectorAll('.ao-btn'); b[0].addEventListener('click', function (e) { e.stopPropagation(); if (cur() !== i) setCur(i); try { connectApiProvider(); } catch (x) { /* ignore */ } }); b[1].addEventListener('click', function (e) { e.stopPropagation(); if (cur() !== i) setCur(i); try { openApiProvider(); } catch (x) { /* ignore */ } });
      el.addEventListener('click', function () { if (!drag || !drag.moved) setCur(i); });
      stage.appendChild(el); return el;
    });
    stage.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'Home') { setCur(0); } else if (e.key === 'End') { setCur(list().length - 1); } });
    stage.addEventListener('wheel', function (e) { var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 12) return; var t = Date.now(); if (t - wheelAt < 260) { e.preventDefault(); return; } wheelAt = t; e.preventDefault(); step(d > 0 ? 1 : -1); }, { passive: false });
    stage.addEventListener('pointerdown', function (e) { if (e.target.closest('.ao-btn')) return; drag = { x: e.clientX, moved: false, base: cur() }; try { stage.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    stage.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x; if (Math.abs(dx) > 8) drag.moved = true; var n = list().length, to = (((drag.base - Math.round(dx / 90)) % n) + n) % n; if (to !== cur()) { try { _apiCarouselIdx = to; } catch (x) { /* ignore */ } render(); } });
    function end() { setTimeout(function () { drag = null; }, 0); } stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    built = cards; return cards;
  }
  function step(d) { var n = list().length; setCur(((cur() + d) % n + n) % n); }

  function render() {
    var stage = document.getElementById('apiCarouselStage'); if (!stage || !list().length) return;
    if (!built || built.length !== list().length || !stage.contains(built[0])) build(stage);
    var n = list().length, c = cur();
    built.forEach(function (el, i) {
      var off = ((i - c + n + Math.floor(n / 2)) % n) - Math.floor(n / 2), a = Math.abs(off), vis = a <= 3;
      el.style.transform = 'translateX(' + off * 208 + 'px) translateZ(' + (-a * 150) + 'px) rotateY(' + (-off * 32) + 'deg) scale(' + (1 - a * 0.07) + ')';
      el.style.opacity = vis ? String(Math.max(0.18, 1 - a * 0.27)) : '0'; el.style.zIndex = String(10 - a); el.style.pointerEvents = vis ? 'auto' : 'none'; el.classList.toggle('on', off === 0); el.setAttribute('aria-selected', off === 0 ? 'true' : 'false');
      el.querySelectorAll('button').forEach(function (b) { b.tabIndex = off === 0 ? 0 : -1; });
    });
    var p = list()[c], glow = document.getElementById('apiCarouselGlow'); if (glow) { glow.style.background = p.color; glow.style.opacity = '0.32'; }
    var idx = document.getElementById('apiCarouselIndex'); if (idx) idx.textContent = (c + 1) + ' / ' + n;
    try { updateApiNameplate(); } catch (e) { /* ignore */ }
  }

  /* wallets: vibrant coming-soon tiles */
  var WALLETS = [['Phantom', '#AB9FF2'], ['Solflare', '#FC8D0F'], ['Backpack', '#E33E3F'], ['Coinbase', '#2F6BFF'], ['Slope', '#7C6CF0'], ['Ledger', '#E6EDF7'], ['Glow', '#FFD84D']];
  function wallets() {
    var host = document.getElementById('walletNotConnected'); if (!host || host.dataset.tiles) return; host.dataset.tiles = '1';
    host.textContent = ''; host.style.padding = '28px 18px';
    var h = document.createElement('div'); h.className = 'wt-head'; h.innerHTML = '<span class="wt-kick">SOLANA WALLETS</span><b>Coming soon</b><small>For now every agent runs on its own PAYBOX wallet. Connecting your own wallet is on the way.</small>'; host.appendChild(h);
    var g = document.createElement('div'); g.className = 'wt-grid';
    WALLETS.forEach(function (w, i) { var t = document.createElement('div'); t.className = 'wt-tile'; t.style.setProperty('--c', w[1]); t.style.animationDelay = (i * 0.35) + 's'; t.setAttribute('aria-disabled', 'true'); t.innerHTML = '<div class="wt-mark">' + mk(w[0], w[1], 62) + '</div><div class="wt-name"></div><div class="wt-soon">Coming soon</div>'; t.querySelector('.wt-name').textContent = w[0]; g.appendChild(t); });
    host.appendChild(g);
  }

  function boot() {
    window.renderApiCarousel = render; render(); wallets();
    var obs = new MutationObserver(function () { wallets(); var s = document.getElementById('apiCarouselStage'); if (s && (!built || !s.contains(built[0]))) render(); }); obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.shdApis = { render: render, step: step };
})();
