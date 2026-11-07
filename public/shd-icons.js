/* SHADDAI V119 — ICONS. One hand-drawn SVG glyph set + brand monograms, so screens stop leaning on stock emoji.
   shdIcons.icon(name, size)        inline SVG string (stroke uses currentColor)
   shdIcons.mark(label, color, px)  glowing hex monogram (used for providers, wallets, bots)
   shdIcons.scrub(root)             replaces emoji inside root with matching glyphs (skips chat/user text areas)
   <span data-shd-icon="plug"></span> is filled in automatically. The screen you are on is cleaned as it renders (chat, social, news and user content are left alone). */
(function () {
  'use strict';
  var P = {
    plug: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5',
    key: 'M15 8a4 4 0 1 1-4 4M11 12l-7 7m3-3 2 2',
    orbit: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 12c0-2.8 4-5 9-5s9 2.2 9 5-4 5-9 5-9-2.2-9-5zM7.5 4.5c2.4-1.4 6.8 1.7 9.5 6.5s2.9 9.5.5 10.5',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
    chip: 'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M7 6h10v12H7zM10 10h4v4h-4z',
    chart: 'M4 20V11M10 20V4M16 20v-7M22 20H2',
    news: 'M4 5h14v14H6a2 2 0 0 1-2-2V5zM18 9h2v8a2 2 0 0 1-2 2M8 9h6M8 13h6',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
    video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01',
    search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5',
    chat: 'M4 5h16v11H9l-5 4V5z',
    send: 'M21 3 3 11l7 2 2 7 9-17z',
    card: 'M3 6h18v12H3zM3 10h18M7 15h4',
    cube: 'M12 3 4 7v10l8 4 8-4V7l-8-4zM4 7l8 4 8-4M12 11v10',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    list: 'M5 6h14M5 12h14M5 18h14',
    squares: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4z',
    modules: 'M3 5h18v6H3zM3 13h18v6H3z',
    plus: 'M12 5v14M5 12h14',
    wallet: 'M3 7h15a3 3 0 0 1 3 3v8H6a3 3 0 0 1-3-3V7zM3 7l12-3v3M17 14h2',
    spark: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z',
    shield: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3z',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    check: 'M5 12.5 10 17 19 7',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
    rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5 6-6zM12 12l-2 5M9 9 4 11l2 2',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.7 2.5 1.7-1 1.4-2.5 1.8-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.5 2.5-1.5',
    gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 3.500-7 8-7s8 3 8 7',
    folder: 'M3 6h6l2 2h10v11H3z',
    alert: 'M12 3 2 21h20L12 3zM12 10v5M12 18h.01',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
    dot: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
  };
  function icon(name, size) { var d = P[name] || P.spark, s = size || 18; return '<svg class="shd-ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  var gid = 0;
  function shade(hex, f) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#222'; var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; function c(v) { return Math.max(0, Math.min(255, Math.round(v * f))); } return '#' + [c(r), c(g), c(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  function mark(label, color, px) {
    var id = 'shdm' + (++gid), s = px || 56, col = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#00e5a0', t = String(label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    return '<svg class="shd-mark" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + col + '"/><stop offset="1" stop-color="' + shade(col, 0.45) + '"/></linearGradient><filter id="' + id + 'g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="url(#' + id + ')" stroke="' + col + '" stroke-width="2.5" filter="url(#' + id + 'g)"/><polygon points="50,5 90,27 50,50 10,27" fill="rgba(255,255,255,.22)"/>' +
      '<text x="50" y="62" text-anchor="middle" font-family="Orbitron,Rajdhani,sans-serif" font-weight="900" font-size="' + (t.length > 1 ? 30 : 38) + '" fill="#04100c">' + t + '</text></svg>';
  }
  /* emoji → glyph. Anything not listed becomes a small spark so no stock emoji is left on a cleaned screen. */
  var MAP = { '🔌': 'plug', '🔑': 'key', '🔄': 'orbit', '⚡': 'bolt', '🆓': 'spark', '🤖': 'chip', '🦙': 'chip', '📊': 'chart', '📈': 'chart', '📉': 'chart', '📰': 'news', '🎵': 'music', '🎶': 'music', '🎬': 'video', '🎥': 'video', '🎨': 'image', '🖼': 'image', '🔍': 'search', '💬': 'chat', '✈': 'send', '💳': 'card', '💰': 'coin', '🪙': 'coin', '👛': 'wallet', '🔒': 'lock', '🛡': 'shield', '🌍': 'globe', '🌐': 'globe', '🪐': 'orbit', '🚀': 'rocket', '🖥': 'server', '📦': 'cube', '🧊': 'cube', '✅': 'check', '✨': 'spark', '⭐': 'spark', '🌟': 'spark', '⚙': 'gear', '👤': 'user', '👥': 'user', '🗂': 'folder', '📁': 'folder', '📂': 'folder', '🔧': 'gear', '🛠': 'gear', '💾': 'server', '🧩': 'cube', '🎯': 'orbit', '🏆': 'spark', '🔔': 'spark', '📡': 'globe', '🛒': 'card',
    /* decorative symbols with a clear match. Branded character emoji (the turtle, the fish, the creatures) and status dots are deliberately NOT mapped. */
    '🧠': 'chip', '🚪': 'cube', '🔥': 'bolt', '🌙': 'spark', '📋': 'list', '📚': 'modules', '⚠': 'alert', '🛑': 'alert', '🔮': 'orbit', '💻': 'server', '🔐': 'lock', '🏢': 'cube', '🏙': 'cube', '🏗': 'cube', '🏛': 'cube', '🏬': 'cube', '🏪': 'cube', '🏘': 'cube',
    '💡': 'spark', '✍': 'news', '✉': 'news', '📝': 'news', '📄': 'news', '📑': 'news', '📜': 'news', '📤': 'send', '📣': 'send', '⏰': 'clock', '🚉': 'globe', '🧾': 'card', '🔎': 'search', '🔭': 'search', '🔊': 'music', '🎧': 'music', '📻': 'music', '🎤': 'music', '🎙': 'music',
    '🤝': 'user', '🔬': 'orbit', '🧪': 'orbit', '🎓': 'spark', '🏅': 'spark', '🆕': 'spark', '🏦': 'coin', '💵': 'coin', '💸': 'coin', '💹': 'chart', '📸': 'image', '🔨': 'gear', 'ℹ': 'info', '🔗': 'plug', '⚡': 'bolt', '📈': 'chart', '📊': 'chart', '📡': 'globe', '🔍': 'search', '🌌': 'orbit', '🛡': 'shield' };
  var EMO = new RegExp("(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)(?:\\u200D(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F?))*", "gu");
  var SKIP = 'script,style,textarea,input,select,svg,code,pre,[contenteditable],.cx-msgs,.shd-keep-emoji';
  function scrub(root) {
    if (!root) return; var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { if (!n.nodeValue || !EMO.test(n.nodeValue)) { EMO.lastIndex = 0; return NodeFilter.FILTER_REJECT; } EMO.lastIndex = 0; var p = n.parentElement; return p && p.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }), nodes = [], n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      // Only emoji that have a matching drawn icon are swapped. Anything else (status dots, flags, unusual symbols) is left exactly as written,
      // so no meaning is lost and nothing is replaced by an unexplained icon.
      var txt = tn.nodeValue, parts = [], last = 0, m, swapped = false; EMO.lastIndex = 0;
      while ((m = EMO.exec(txt))) {
        var k = m[0].replace(/\uFE0F/g, ''), name = MAP[k] || MAP[k[0]]; if (!name) continue;
        if (m.index > last) parts.push(document.createTextNode(txt.slice(last, m.index)));
        var sp = document.createElement('span'); sp.className = 'shd-ic-wrap'; sp.innerHTML = icon(name, 16); parts.push(sp); last = m.index + m[0].length; swapped = true;
      }
      if (!swapped) return;
      if (last < txt.length) parts.push(document.createTextNode(txt.slice(last)));
      var frag = document.createDocumentFragment(); parts.forEach(function (x) { frag.appendChild(x); }); tn.parentNode.replaceChild(frag, tn);
    });
  }
  function hydrate(root) { (root || document).querySelectorAll('[data-shd-icon]:empty').forEach(function (e) { e.innerHTML = icon(e.getAttribute('data-shd-icon'), +e.getAttribute('data-size') || 20); }); }
  /* Every screen is cleaned except the ones that show people's own words (chat, social, news, notes, projects, documents, studio) and the world frame.
     Only the screen you are looking at is swept, as it is shown and as it changes, so the big page stays fast. */
  var KEEP = ['chatView', 'socialView', 'newsView', 'library-notesView', 'projectsView', 'documentsView', 'content-studioView', 'gridView', 'forgeView'], pending = null;
  function activeView() { var a = document.querySelector('.view.active'); return a && KEEP.indexOf(a.id) < 0 ? a : null; }
  function sweep() { pending = null; hydrate(document); var a = activeView(); if (a) scrub(a); var m = document.getElementById('worldsMenu'); if (m) scrub(m); var pm = document.getElementById('shdPayboxMount'); if (pm) scrub(pm); }
  function queue() { if (!pending) pending = setTimeout(sweep, 150); }
  function init() {
    sweep();
    try { new MutationObserver(function (ms) { var a = activeView(); for (var i = 0; i < ms.length; i++) { var t = ms[i].target; if (t && t.nodeType === 1 && ((a && a.contains(t)) || (t.querySelector && t.querySelector('[data-shd-icon]')))) { queue(); return; } } }).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
    setInterval(function () { if (!document.hidden) queue(); }, 2000);     // catches a screen that was switched to without a DOM change we can see
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.shdIcons = { icon: icon, mark: mark, scrub: scrub, hydrate: hydrate, names: Object.keys(P) };
})();
