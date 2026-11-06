/* ═════════════════════════════════════════════════════════════════════════
   SHADDAI V119 — TIDY layer (behaviour). Pairs with shd-tidy.css.
   • swaps the ⚡ emoji for an SVG line icon everywhere (also UI that renders later)
   • merges the TuFish Sentiment + Swarm cards into one tabbed platform
   • restore the old layout any time:  localStorage.shd_legacy_nav = '1'  (then reload)
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  try { if (localStorage.getItem('shd_legacy_nav') === '1') document.documentElement.classList.add('shd-legacy-nav'); } catch (e) { /* ignore */ }

  /* ── ⚡ → SVG line icon ───────────────────────────────────────────────── */
  var BOLT_RE = /⚡️?/g;
  var BOLT_SVG = '<svg class="shd-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, TITLE: 1, SVG: 1, CANVAS: 1, IFRAME: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, svg: 1 };
  function swapText(n) {
    var p = n.parentNode; if (!p || SKIP[p.nodeName] || p.isContentEditable) return;
    var s = n.nodeValue; BOLT_RE.lastIndex = 0; if (!BOLT_RE.test(s)) return;
    var parts = s.split(BOLT_RE), frag = document.createDocumentFragment();
    parts.forEach(function (t, i) {
      if (i) { var tmp = document.createElement('span'); tmp.innerHTML = BOLT_SVG; frag.appendChild(tmp.firstChild); }
      if (t) frag.appendChild(document.createTextNode(t));
    });
    p.replaceChild(frag, n);
  }
  function swapIn(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [];
    while (w.nextNode()) { if (w.currentNode.nodeValue.indexOf('⚡') > -1) list.push(w.currentNode); }
    list.forEach(swapText);
  }
  var queue = [], scheduled = false;
  function flush() {
    scheduled = false;
    var items = queue.splice(0);
    items.forEach(function (n) { if (!n.isConnected) return; if (n.nodeType === 3) swapText(n); else if (n.nodeType === 1) swapIn(n); });
  }
  function startBolts() {
    swapIn(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') queue.push(m.target);
        else m.addedNodes.forEach(function (n) { if (n.nodeType === 1 || n.nodeType === 3) queue.push(n); });
      });
      if (!scheduled && queue.length) { scheduled = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ── TuFish: ONE platform, two tabs (Sentiment | Swarm) ───────────────── */
  function tidyMarkets() {
    var swarm = $('tufishCard'), sent = $('tuFishSentCard');
    if (!swarm || !sent || swarm.dataset.shdFish) return;
    if (document.documentElement.classList.contains('shd-legacy-nav')) return;
    swarm.dataset.shdFish = '1';
    var kids = [].slice.call(swarm.children), header = kids[0], rest = kids.slice(1);
    var swarmPane = document.createElement('div'); swarmPane.id = 'shdFishSwarm';
    rest.forEach(function (k) { swarmPane.appendChild(k); });                 // miroGate / miroFrame keep their ids
    var sentKids = [].slice.call(sent.children), sentPane = document.createElement('div'); sentPane.id = 'shdFishSent';
    sentKids.slice(1).forEach(function (k) { sentPane.appendChild(k); });     // drop the duplicate card header, keep the app
    var bar = document.createElement('div'); bar.id = 'shdFishBar';
    bar.innerHTML = '<div class="ttl"><b>TUFISH</b><span>sentiment + swarm intelligence</span></div>' +
      '<div class="seg" role="tablist"><button type="button" data-m="sentiment" class="on" role="tab">Sentiment</button><button type="button" data-m="swarm" role="tab">Swarm<i>PIN</i></button></div>' +
      '<a class="btn btn-ghost" id="shdFishOpen" target="_blank" rel="noopener" href="/tufish.html">Open full ↗</a>';
    if (header) header.style.display = 'none';                                // old header stays in the DOM (live-tag ids intact)
    swarm.insertBefore(bar, header || swarm.firstChild);
    swarm.appendChild(sentPane); swarm.appendChild(swarmPane);
    sent.style.display = 'none';
    function mode(m) {
      sentPane.style.display = m === 'sentiment' ? 'block' : 'none';
      swarmPane.style.display = m === 'swarm' ? 'block' : 'none';
      bar.querySelectorAll('[data-m]').forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
      $('shdFishOpen').href = m === 'swarm' ? '/mirofish-terminal.html' : '/tufish.html';
    }
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) mode(b.dataset.m); });
    mode('sentiment');
  }

  function wrapShowView() {
    var sv = window.showView; if (typeof sv !== 'function' || sv._tidy) return;
    window.showView = function (v) {
      var r = sv.apply(this, arguments);
      try { if (v === 'pipeline') { setTimeout(tidyMarkets, 150); setTimeout(tidyMarkets, 900); } } catch (e) { /* never break navigation */ }
      return r;
    };
    window.showView._tidy = true;
  }
  wrapShowView(); window.addEventListener('load', function () { wrapShowView(); setTimeout(tidyMarkets, 1200); });

  window.shdTidy = { markets: tidyMarkets, bolts: function () { swapIn(document.body); } };
  if (document.body) startBolts(); else document.addEventListener('DOMContentLoaded', startBolts);
})();
