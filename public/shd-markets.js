/* SHADDAI V119 — MARKETS INTELLIGENCE DESK. Under the five stations (Markets, Chart, Council, Pro Signals, TUFISH) the page used to stack
   eight modules in one long scroll. They are now separate full-width pages with a tab bar: Overview, Signals, Council, Whales, News, Chart.
   Nothing is moved or rebuilt: each module is tagged by its own title and the others are hidden, so every module keeps working. A module
   whose title is not recognised stays visible on every tab (so nothing can go missing). */
(function () {
  'use strict';
  var TABS = [['overview', 'Overview', 'chart'], ['signals', 'Signals', 'bolt'], ['council', 'Council', 'chip'], ['whales', 'Whales', 'globe'], ['news', 'News', 'news'], ['chart', 'Chart analysis', 'search']];
  var RULES = [[/ON-CHAIN/i, 'overview'], [/FEAR\s*&\s*GREED/i, 'overview'], [/MARKET SIGNALS/i, 'signals'], [/7-AGENT|NEURAL VOTE/i, 'council'], [/WHALE/i, 'whales'], [/NEWS FEED/i, 'news'], [/ORACLE CHART|CHART ANALYSIS/i, 'chart']];
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function ic(n) { return window.shdIcons ? window.shdIcons.icon(n, 15) : ''; }
  function cur() { try { var t = localStorage.getItem('shd_mk_tab'); if (TABS.some(function (x) { return x[0] === t; })) return t; } catch (e) { /* ignore */ } return 'overview'; }
  function tag(root) {
    [].forEach.call(root.children, function (c) {
      if (!/^DIV$/.test(c.tagName) || c.classList.contains('mk-subtabs')) return;
      var kids = [].filter.call(c.children, function (k) { return k.tagName === 'DIV'; }), isGrid = kids.length > 1 && getComputedStyle(c).display === 'grid';
      if (isGrid) { c.setAttribute('data-mk-grid', '1'); kids.forEach(function (k) { if (k.hasAttribute('data-mk-mod')) return; var txt = (k.innerText || k.textContent || '').slice(0, 120), r = RULES.filter(function (x) { return x[0].test(txt); })[0]; if (r) k.setAttribute('data-mk-mod', r[1]); }); }
      else if (!c.hasAttribute('data-mk-mod')) { var txt2 = (c.innerText || c.textContent || '').slice(0, 120), r2 = RULES.filter(function (x) { return x[0].test(txt2); })[0]; if (r2) c.setAttribute('data-mk-mod', r2[1]); }
    });
  }
  function select(root, bar, t) {
    root.setAttribute('data-mk-tab', t); try { localStorage.setItem('shd_mk_tab', t); } catch (e) { /* ignore */ }
    [].forEach.call(bar.querySelectorAll('button'), function (b) { var on = b.getAttribute('data-t') === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
  }
  function build() {
    var root = document.getElementById('pipelineSentiment'); if (!root || root.dataset.mk) return; root.dataset.mk = '1';
    var bar = h('nav', { class: 'mk-subtabs', role: 'tablist', 'aria-label': 'Market intelligence' });
    TABS.forEach(function (t) { var b = h('button', { type: 'button', role: 'tab', class: 'mk-tab', 'data-t': t[0], onclick: function () { select(root, bar, t[0]); } }); b.innerHTML = ic(t[2]) + '<span></span>'; b.querySelector('span').textContent = t[1]; bar.appendChild(b); });
    bar.addEventListener('keydown', function (e) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var bs = [].slice.call(bar.querySelectorAll('button')), i = bs.indexOf(document.activeElement); if (i < 0) return; var n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click(); });
    root.parentNode.insertBefore(bar, root); tag(root); select(root, bar, cur());
    try { new MutationObserver(function () { tag(root); }).observe(root, { childList: true, subtree: false }); } catch (e) { /* ignore */ }
  }
  function boot() { build(); var t = 0, iv = setInterval(function () { build(); if (document.getElementById('pipelineSentiment') && document.getElementById('pipelineSentiment').dataset.mk || ++t > 60) clearInterval(iv); }, 500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.shdMarkets = { select: function (t) { var r = document.getElementById('pipelineSentiment'), b = document.querySelector('.mk-subtabs'); if (r && b) select(r, b, t); } };
})();
