/* Dashboard visual lint. Paste into the console of /dashboard (or run through the browser tool).
   Walks every view and reports objective visual problems as compact JSON. No screenshots needed.
   Usage: await window.__dashLint()  ->  { views: [...], global: {...} } */
(function () {
  function rgb(s) { var m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; var p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { function f(v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); } return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); }
  function bgOf(el) { while (el && el.nodeType === 1) { var c = rgb(getComputedStyle(el).backgroundColor); if (c && c.a > .5) return c; el = el.parentElement; } return { r: 6, g: 8, b: 11, a: 1 }; }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); }
  function visible(el) { var r = el.getBoundingClientRect(); var s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; }
  function sel(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function lintRoot(root) {
    var out = { defaultCtl: [], tiny: [], smallText: [], lowContrast: [], unnamed: [], brokenImg: [], overflowX: root.scrollWidth > root.clientWidth + 4 };
    root.querySelectorAll('button,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),textarea').forEach(function (el) {
      if (!visible(el)) return;
      var s = getComputedStyle(el), bg = rgb(s.backgroundColor);
      // browser-default look: light grey/white fill on a dark UI
      if (bg && bg.a > .5 && lum(bg) > .6 && Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) < 24) out.defaultCtl.push(sel(el));   // grey/white fill only (accent fills are intentional)
      var r = el.getBoundingClientRect();
      if ((r.height < 26 || r.width < 26) && el.tagName !== 'TEXTAREA') out.tiny.push(sel(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (el.tagName === 'BUTTON' && !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')) out.unnamed.push(sel(el));
    });
    var n = 0;
    root.querySelectorAll('*').forEach(function (el) {
      if (n > 600) return;
      var own = [].some.call(el.childNodes, function (c) { return c.nodeType === 3 && c.textContent.trim().length > 1; });
      if (!own || !visible(el)) return; n++;
      var s = getComputedStyle(el), fs = parseFloat(s.fontSize);
      if (fs < 9.5) out.smallText.push(sel(el) + ' ' + fs + 'px');
      var fg = rgb(s.color), bg = bgOf(el);
      if (fg && ratio(fg, bg) < 3) out.lowContrast.push(sel(el) + ' ' + ratio(fg, bg).toFixed(1));
    });
    root.querySelectorAll('img').forEach(function (im) { if (visible(im) && im.complete && im.naturalWidth === 0) out.brokenImg.push((im.getAttribute('src') || '').slice(0, 50)); });
    return out;
  }
  function top(a, n) { var c = {}; a.forEach(function (x) { var k = x.split(' ')[0]; c[k] = (c[k] || 0) + 1; }); return Object.keys(c).sort(function (x, y) { return c[y] - c[x]; }).slice(0, n).map(function (k) { return k + '×' + c[k]; }); }

  window.__dashLint = async function (only) {
    var ids = [].map.call(document.querySelectorAll('.view'), function (v) { return v.id; }).filter(function (i) { return /View$/.test(i); });
    var skipHidden = ['workflowsView', 'commandCenterView', 'my-agentsView', 'content-studioView', 'gridView'];
    var res = [];
    for (var k = 0; k < ids.length; k++) {
      var id = ids[k], name = id.replace(/View$/, '');
      if (skipHidden.indexOf(id) > -1 || (only && only.indexOf(name) < 0)) continue;
      try { window.showView(name); } catch (e) { continue; }
      await sleep(700);
      var el = document.getElementById(id);
      if (!el || !visible(el)) continue;
      var r = lintRoot(el);
      res.push({ view: name, defaultCtl: r.defaultCtl.length, tiny: r.tiny.length, smallText: r.smallText.length, lowContrast: r.lowContrast.length, unnamed: r.unnamed.length, brokenImg: r.brokenImg.length, overflowX: r.overflowX,
        worst: { smallText: top(r.smallText, 5), defaultCtl: top(r.defaultCtl, 3), tiny: top(r.tiny, 3), lowContrast: top(r.lowContrast, 3), unnamed: top(r.unnamed, 3) } });
    }
    // fixed-position overlap (global)
    var fx = [].filter.call(document.querySelectorAll('body *'), function (e) { var s = getComputedStyle(e); return s.position === 'fixed' && visible(e); })
      .map(function (e) { return { s: sel(e), r: e.getBoundingClientRect() }; }).filter(function (o) { return o.r.width > 20 && o.r.height > 20 && o.r.width < innerWidth * .6; });
    var overlaps = [];
    for (var i = 0; i < fx.length; i++) for (var j = i + 1; j < fx.length; j++) {
      var a = fx[i].r, b = fx[j].r; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(fx[i].s + ' x ' + fx[j].s);
    }
    return { views: res, global: { fixedOverlaps: overlaps.slice(0, 8), viewport: innerWidth + 'x' + innerHeight } };
  };
})();
