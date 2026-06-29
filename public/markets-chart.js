/* ZEROX EXCHANGE — Markets candlestick chart module for SHADDAI World
 * Usage: window.renderMarketsChart(containerEl, { symbol: 'btc' })
 * Pure vanilla JS, same-origin fetches, no external libs.
 */
(function () {
  'use strict';

  var SYMBOLS = ['btc', 'eth', 'sol', 'bnb', 'xrp', 'doge', 'ada', 'avax', 'link'];

  var STYLE_ID = 'zerox-markets-chart-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.zx-mkt{position:relative;background:#04060d;color:#cfe6f5;',
      "font-family:'Share Tech Mono',monospace;border:1px solid rgba(255,122,24,.25);",
      'border-radius:10px;padding:14px 16px;box-sizing:border-box;overflow:hidden;}',
      '.zx-mkt *{box-sizing:border-box;}',
      '.zx-mkt-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px 16px;margin-bottom:10px;}',
      ".zx-mkt-title{font-family:'Orbitron',sans-serif;font-weight:800;letter-spacing:3px;",
      'font-size:18px;color:#ff7a18;text-shadow:0 0 8px rgba(255,122,24,.7),0 0 18px rgba(255,122,24,.35);}',
      '.zx-mkt-sym{font-size:13px;color:#27e0ff;letter-spacing:2px;}',
      '.zx-mkt-price{font-size:22px;font-weight:700;color:#eaf6ff;}',
      '.zx-mkt-chg{font-size:14px;font-weight:700;padding:2px 7px;border-radius:5px;}',
      '.zx-mkt-chg.up{color:#26d07c;background:rgba(38,208,124,.1);}',
      '.zx-mkt-chg.down{color:#ff5a6e;background:rgba(255,90,110,.1);}',
      '.zx-mkt-sel{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}',
      ".zx-mkt-btn{font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:1px;",
      'text-transform:uppercase;cursor:pointer;background:rgba(39,224,255,.06);',
      'color:#9fc6d8;border:1px solid rgba(39,224,255,.22);border-radius:5px;padding:4px 9px;',
      'transition:all .15s;}',
      '.zx-mkt-btn:hover{color:#27e0ff;border-color:#27e0ff;}',
      '.zx-mkt-btn.active{color:#04060d;background:#ff7a18;border-color:#ff7a18;',
      'box-shadow:0 0 10px rgba(255,122,24,.5);}',
      '.zx-mkt-canvas-wrap{position:relative;width:100%;}',
      '.zx-mkt canvas{display:block;width:100%;border-radius:6px;background:#04060d;}',
      '.zx-mkt-status{font-size:11px;color:#5a7384;letter-spacing:1px;margin-top:6px;min-height:14px;}',
      '.zx-mkt-status.err{color:#ff5a6e;}'
    ].join('');
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function fmtPrice(p) {
    if (p == null || isNaN(p)) return '--';
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toPrecision(4);
  }

  function drawChart(canvas, candles) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 600;
    var cssH = 280;
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, cssW, cssH);

    if (!candles || !candles.length) {
      ctx.fillStyle = '#5a7384';
      ctx.font = "13px 'Share Tech Mono', monospace";
      ctx.fillText('no data', 12, 24);
      return;
    }

    var padL = 8, padR = 62, padT = 12, padB = 22;
    var plotW = cssW - padL - padR;
    var plotH = cssH - padT - padB;

    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      if (candles[i].l < lo) lo = candles[i].l;
      if (candles[i].h > hi) hi = candles[i].h;
    }
    if (lo === hi) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.06;
    lo -= pad; hi += pad;
    var range = hi - lo;

    function yOf(v) { return padT + (1 - (v - lo) / range) * plotH; }

    // gridlines + price labels
    ctx.strokeStyle = 'rgba(39,224,255,.08)';
    ctx.fillStyle = '#5a7384';
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textBaseline = 'middle';
    var lines = 5;
    for (var g = 0; g <= lines; g++) {
      var v = lo + (range * g) / lines;
      var y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(fmtPrice(v), padL + plotW + 6, y);
    }

    var n = candles.length;
    var slot = plotW / n;
    var bw = Math.max(1, Math.min(slot * 0.62, 14));

    for (var k = 0; k < n; k++) {
      var c = candles[k];
      var cx = padL + slot * (k + 0.5);
      var up = c.c >= c.o;
      var col = up ? '#26d07c' : '#ff5a6e';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;

      // wick
      ctx.beginPath();
      ctx.moveTo(cx, yOf(c.h));
      ctx.lineTo(cx, yOf(c.l));
      ctx.stroke();

      // body
      var yO = yOf(c.o), yC = yOf(c.c);
      var top = Math.min(yO, yC);
      var bh = Math.max(1, Math.abs(yC - yO));
      ctx.fillRect(cx - bw / 2, top, bw, bh);
    }
  }

  function renderMarketsChart(container, opts) {
    if (!container) return;
    injectStyle();
    opts = opts || {};
    var symbol = (opts.symbol || 'btc').toLowerCase();
    if (SYMBOLS.indexOf(symbol) === -1) symbol = 'btc';

    // clear any prior instance interval
    if (container.__zxInterval) { clearInterval(container.__zxInterval); container.__zxInterval = null; }

    container.classList.add('zx-mkt');
    container.innerHTML =
      '<div class="zx-mkt-head">' +
        '<span class="zx-mkt-title">ZEROX EXCHANGE</span>' +
        '<span class="zx-mkt-sym" data-sym></span>' +
        '<span class="zx-mkt-price" data-price>--</span>' +
        '<span class="zx-mkt-chg" data-chg>--</span>' +
      '</div>' +
      '<div class="zx-mkt-sel" data-sel></div>' +
      '<div class="zx-mkt-canvas-wrap"><canvas data-canvas></canvas></div>' +
      '<div class="zx-mkt-status" data-status></div>';

    var elSym = container.querySelector('[data-sym]');
    var elPrice = container.querySelector('[data-price]');
    var elChg = container.querySelector('[data-chg]');
    var elSel = container.querySelector('[data-sel]');
    var elCanvas = container.querySelector('[data-canvas]');
    var elStatus = container.querySelector('[data-status]');

    var current = symbol;

    SYMBOLS.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'zx-mkt-btn' + (s === current ? ' active' : '');
      b.textContent = s;
      b.setAttribute('data-s', s);
      b.addEventListener('click', function () {
        if (s === current) return;
        current = s;
        Array.prototype.forEach.call(elSel.children, function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-s') === current);
        });
        load();
      });
      elSel.appendChild(b);
    });

    function load() {
      elStatus.classList.remove('err');
      elStatus.textContent = 'loading ' + current.toUpperCase() + '...';
      elSym.textContent = current.toUpperCase() + '/USD';
      fetch('/api/markets/ohlc?symbol=' + encodeURIComponent(current))
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (j) {
          if (current !== j.symbol && j.symbol) {
            // stale response for a previous symbol; ignore
            if (j.symbol !== current) return;
          }
          if (!j.ok) throw new Error(j.error || 'bad response');
          elPrice.textContent = '$' + fmtPrice(j.price);
          var chg = Number(j.change24h) || 0;
          elChg.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
          elChg.className = 'zx-mkt-chg ' + (chg >= 0 ? 'up' : 'down');
          container.__zxLastCandles = j.candles || [];
          drawChart(elCanvas, container.__zxLastCandles);
          elStatus.textContent = (j.count || (j.candles || []).length) + ' candles · updated ' +
            new Date().toLocaleTimeString();
        })
        .catch(function (e) {
          elStatus.classList.add('err');
          elStatus.textContent = 'error: ' + e.message + ' (retrying next cycle)';
        });
    }

    load();

    container.__zxInterval = setInterval(function () {
      if (!document.body.contains(container)) {
        clearInterval(container.__zxInterval);
        container.__zxInterval = null;
        return;
      }
      load();
    }, 60000);

    // redraw on resize for a crisp canvas
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (!document.body.contains(container)) { ro.disconnect(); return; }
        if (container.__zxLastCandles) drawChart(elCanvas, container.__zxLastCandles);
      });
      ro.observe(container);
    }

    return {
      reload: load,
      setSymbol: function (s) {
        s = (s || '').toLowerCase();
        if (SYMBOLS.indexOf(s) === -1) return;
        current = s;
        Array.prototype.forEach.call(elSel.children, function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-s') === current);
        });
        load();
      }
    };
  }

  window.renderMarketsChart = renderMarketsChart;
})();
