/* ============================================================================
 * SHADDAI — Founding Member / "Back the Build" payment module
 * Self-contained. Pays via the existing Solana Pay backend (/api/pay/create).
 * No Stripe. No external deps. Never throws.
 *
 * Public API:  window.SHADDAI_FOUNDING = { open, close }
 * ==========================================================================*/
(function () {
  'use strict';

  try {
    var LS_KEY   = 'shaddai_founding';
    var EP_CREATE = '/api/pay/create';
    var EP_STATUS = '/api/pay/status/';
    var FOUNDING_PRICE = 99;      // USD one-time
    var MODAL_ID = 'shdFounding';

    /* -------------------------------------------------------------------- *
     * Tiny dependency-free QR generator (byte mode, ECC level L, v1-40).
     * Compact port of the public-domain Nayuki QR algorithm.
     * -------------------------------------------------------------------- */
    var QR = (function () {
      // GF(256) tables, primitive polynomial 0x11d
      var EXP = new Array(512), LOG = new Array(256);
      (function () {
        var x = 1;
        for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
        for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
      })();
      function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

      // ECC level L tables (index by version 1..40)
      var ECC_CPB = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
                     28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
      var NUM_BLK = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
                     8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];

      function rawDataModules(ver) {
        var res = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
          var na = Math.floor(ver / 7) + 2;
          res -= (25 * na - 10) * na - 55;
          if (ver >= 7) res -= 36;
        }
        return res;
      }
      function dataCodewords(ver) {
        return Math.floor(rawDataModules(ver) / 8) - ECC_CPB[ver] * NUM_BLK[ver];
      }

      function rsGenerator(degree) {
        var result = new Array(degree).fill(0);
        result[degree - 1] = 1;
        var root = 1;
        for (var i = 0; i < degree; i++) {
          for (var j = 0; j < degree; j++) {
            result[j] = gmul(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
          }
          root = gmul(root, 2);
        }
        return result;
      }
      function rsRemainder(data, degree) {
        var gen = rsGenerator(degree);
        var result = new Array(degree).fill(0);
        for (var i = 0; i < data.length; i++) {
          var factor = data[i] ^ result[0];
          result.shift(); result.push(0);
          for (var j = 0; j < result.length; j++) result[j] ^= gmul(gen[j], factor);
        }
        return result;
      }

      // Alignment pattern centers
      function alignPositions(ver) {
        if (ver === 1) return [];
        var num = Math.floor(ver / 7) + 2;
        var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
        var pos = [6];
        for (var p = ver * 4 + 10; pos.length < num; p -= step) pos.splice(1, 0, p);
        return pos;
      }

      function build(text) {
        // UTF-8 bytes
        var bytes = [];
        for (var c = 0; c < text.length; c++) {
          var code = text.charCodeAt(c);
          if (code < 0x80) bytes.push(code);
          else if (code < 0x800) { bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F)); }
          else { bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)); }
        }

        // choose smallest version (ECC L)
        var ver = 0, dataCap = 0;
        for (var v = 1; v <= 40; v++) {
          var ccBits = (v < 10) ? 8 : 16;
          var need = 4 + ccBits + 8 * bytes.length;
          if (dataCodewords(v) * 8 >= need) { ver = v; break; }
        }
        if (!ver) return null; // too big to encode — caller falls back to link
        dataCap = dataCodewords(ver);

        // bit buffer
        var bits = [];
        function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
        push(0x4, 4); // byte mode
        push(bytes.length, (ver < 10) ? 8 : 16);
        for (var b = 0; b < bytes.length; b++) push(bytes[b], 8);
        var capBits = dataCap * 8;
        for (var t = 0; t < 4 && bits.length < capBits; t++) bits.push(0);
        while (bits.length % 8 !== 0) bits.push(0);

        var codewords = [];
        for (var k = 0; k < bits.length; k += 8) {
          var byte = 0;
          for (var m = 0; m < 8; m++) byte = (byte << 1) | bits[k + m];
          codewords.push(byte);
        }
        var padCycle = [0xEC, 0x11], pi = 0;
        while (codewords.length < dataCap) codewords.push(padCycle[pi++ % 2]);

        // split into blocks + ecc, interleave
        var numBlocks = NUM_BLK[ver], blockEccLen = ECC_CPB[ver];
        var rawCw = Math.floor(rawDataModules(ver) / 8);
        var numShort = numBlocks - (rawCw % numBlocks);
        var shortLen = Math.floor(rawCw / numBlocks);
        var blocks = [], idx = 0;
        for (var i2 = 0; i2 < numBlocks; i2++) {
          var datLen = shortLen - blockEccLen + (i2 < numShort ? 0 : 1);
          var dat = codewords.slice(idx, idx + datLen); idx += datLen;
          var ecc = rsRemainder(dat, blockEccLen);
          blocks.push(dat.concat(ecc));
        }
        var result = [];
        var maxLen = blocks[0].length + 1;
        for (var col = 0; col < maxLen; col++) {
          for (var blk = 0; blk < blocks.length; blk++) {
            // skip the padding cell of short data blocks
            if (col !== shortLen - blockEccLen || blk >= numShort) {
              if (col < blocks[blk].length) result.push(blocks[blk][col]);
            }
          }
        }

        // draw matrix
        var size = ver * 4 + 17;
        var mod = [], fn = [];
        for (var r = 0; r < size; r++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
        function set(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

        // timing patterns
        for (var q = 0; q < size; q++) { set(6, q, q % 2 === 0); set(q, 6, q % 2 === 0); }
        // finder patterns + separators
        function finder(cx, cy) {
          for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
            var xx = cx + dx, yy = cy + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            var dist = Math.max(Math.abs(dx), Math.abs(dy));
            set(xx, yy, dist !== 2 && dist !== 4);
          }
        }
        finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
        // alignment patterns
        var ap = alignPositions(ver);
        for (var a1 = 0; a1 < ap.length; a1++) for (var a2 = 0; a2 < ap.length; a2++) {
          var acx = ap[a1], acy = ap[a2];
          if ((acx === 6 && acy === 6) || (acx === 6 && acy === size - 7) || (acx === size - 7 && acy === 6)) continue;
          for (var by = -2; by <= 2; by++) for (var bx = -2; bx <= 2; bx++) {
            set(acx + bx, acy + by, Math.max(Math.abs(bx), Math.abs(by)) !== 1);
          }
        }
        // reserve format areas
        for (var f = 0; f < 9; f++) { fn[f][8] = true; fn[8][f] = true; }
        for (var f2 = 0; f2 < 8; f2++) { fn[size - 1 - f2][8] = true; fn[8][size - 1 - f2] = true; }
        set(8, size - 8, true); // dark module
        // version info reservation (ver >= 7)
        if (ver >= 7) {
          for (var vi = 0; vi < 18; vi++) {
            var vx = vi % 3, vy = Math.floor(vi / 3);
            fn[size - 11 + vx][vy] = true; fn[vy][size - 11 + vx] = true;
          }
        }

        // place data codewords (zigzag)
        var dataBits = [];
        for (var dc = 0; dc < result.length; dc++) for (var db = 7; db >= 0; db--) dataBits.push((result[dc] >>> db) & 1);
        var bit = 0, upward = true;
        for (var xcol = size - 1; xcol > 0; xcol -= 2) {
          if (xcol === 6) xcol--;
          for (var yrow = 0; yrow < size; yrow++) {
            var yy2 = upward ? (size - 1 - yrow) : yrow;
            for (var dxx = 0; dxx < 2; dxx++) {
              var xx2 = xcol - dxx;
              if (!fn[yy2][xx2]) { mod[yy2][xx2] = (bit < dataBits.length) ? (dataBits[bit] === 1) : false; bit++; }
            }
          }
          upward = !upward;
        }

        // mask + format bits: pick best mask by penalty
        function applyFormat(mask) {
          var data = (1 << 3) | mask; // ECC L = 1
          var rem = data;
          for (var g = 0; g < 10; g++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
          var out = ((data << 10) | rem) ^ 0x5412;
          for (var p2 = 0; p2 <= 5; p2++) mod[p2][8] = ((out >> p2) & 1) !== 0;
          mod[7][8] = ((out >> 6) & 1) !== 0;
          mod[8][8] = ((out >> 7) & 1) !== 0;
          mod[8][7] = ((out >> 8) & 1) !== 0;
          for (var p3 = 9; p3 < 15; p3++) mod[8][14 - p3] = ((out >> p3) & 1) !== 0;
          for (var p4 = 0; p4 < 8; p4++) mod[size - 1 - p4][8] = ((out >> p4) & 1) !== 0;
          for (var p5 = 8; p5 < 15; p5++) mod[8][size - 15 + p5] = ((out >> p5) & 1) !== 0;
          mod[size - 8][8] = true;
        }
        function maskFn(m, x, y) {
          switch (m) {
            case 0: return (x + y) % 2 === 0;
            case 1: return y % 2 === 0;
            case 2: return x % 3 === 0;
            case 3: return (x + y) % 3 === 0;
            case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            case 5: return (x * y) % 2 + (x * y) % 3 === 0;
            case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
            case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
          }
          return false;
        }
        function applyMask(m) {
          for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
            if (!fn[y][x] && maskFn(m, x, y)) mod[y][x] = !mod[y][x];
          }
        }
        function penalty() {
          var p = 0, y, x, run, i;
          for (y = 0; y < size; y++) {
            run = 1;
            for (x = 1; x < size; x++) {
              if (mod[y][x] === mod[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
              else run = 1;
            }
          }
          for (x = 0; x < size; x++) {
            run = 1;
            for (y = 1; y < size; y++) {
              if (mod[y][x] === mod[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
              else run = 1;
            }
          }
          for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
            var c = mod[y][x];
            if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
          }
          var dark = 0;
          for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
          var pct = dark * 100 / (size * size);
          p += Math.floor(Math.abs(pct - 50) / 5) * 10;
          return p;
        }

        // version info for ver >= 7
        function drawVersion() {
          if (ver < 7) return;
          var rem = ver;
          for (var g = 0; g < 12; g++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
          var val = (ver << 12) | rem;
          for (var vi = 0; vi < 18; vi++) {
            var bitv = ((val >> vi) & 1) !== 0;
            var vx = vi % 3, vy = Math.floor(vi / 3);
            mod[vy][size - 11 + vx] = bitv;
            mod[size - 11 + vx][vy] = bitv;
          }
        }

        // try all masks, keep best (need a clean copy each time)
        var base = mod.map(function (row) { return row.slice(); });
        var best = -1, bestPenalty = Infinity, bestMod = null;
        for (var m = 0; m < 8; m++) {
          mod = base.map(function (row) { return row.slice(); });
          drawVersion();
          applyMask(m);
          applyFormat(m);
          var pen = penalty();
          if (pen < bestPenalty) { bestPenalty = pen; best = m; bestMod = mod.map(function (row) { return row.slice(); }); }
        }
        return { size: size, modules: bestMod };
      }

      return {
        render: function (text, scale, dark, light) {
          var qr;
          try { qr = build(text); } catch (e) { return null; }
          if (!qr) return null;
          scale = scale || 4;
          var quiet = 4;
          var dim = (qr.size + quiet * 2) * scale;
          var canvas = document.createElement('canvas');
          canvas.width = dim; canvas.height = dim;
          var ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = light || '#020817';
          ctx.fillRect(0, 0, dim, dim);
          ctx.fillStyle = dark || '#14f195';
          for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
            if (qr.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
          }
          return canvas;
        }
      };
    })();

    /* -------------------------------------------------------------------- *
     * Helpers
     * -------------------------------------------------------------------- */
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    }
    function getState() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
    }
    function saveState(obj) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {}
    }
    function toast(msg) {
      try { if (typeof window.notify === 'function') { window.notify(msg); return; } } catch (e) {}
      try { console.log('[founding]', msg); } catch (e) {}
    }

    // Live-ish SOL/USD estimate for the $99 pass (fallback constant, never blocks)
    var SOL_USD = 150;
    function refreshSolPrice() {
      try {
        fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot', { signal: AbortSignal.timeout(5000) })
          .then(function (r) { return r.json(); })
          .then(function (d) { var p = parseFloat(d && d.data && d.data.amount); if (p > 0) { SOL_USD = p; updateFoundingSolLabel(); } })
          .catch(function () {});
      } catch (e) {}
    }
    function usdToSol(usd) { return Math.max(0.001, Math.round((usd / SOL_USD) * 1000) / 1000); }
    function updateFoundingSolLabel() {
      var el = document.getElementById('shdF_founderSol');
      if (el) el.textContent = '≈ ' + usdToSol(FOUNDING_PRICE) + ' SOL';
    }

    /* -------------------------------------------------------------------- *
     * Payment flow — reuses the existing /api/pay/create endpoint
     * -------------------------------------------------------------------- */
    var _poller = null;
    function stopPoll() { if (_poller) { clearInterval(_poller); _poller = null; } }

    function payWithSolana(kind, amountSol, usdEquiv) {
      var out = document.getElementById('shdF_result');
      if (!out) return;
      var isFounder = kind === 'founder';
      var item = isFounder ? 'SHADDAI Founding Pass' : 'SHADDAI Donation';
      var label = isFounder ? 'SHADDAI Founding Pass' : 'SHADDAI Donation';
      out.style.display = 'block';
      out.innerHTML = '<div class="shdF-loading">GENERATING SOLANA PAY REQUEST…</div>';

      var body = { item: item, amount: amountSol, currency: 'SOL', label: label,
                   message: isFounder ? 'Founding Member — lifetime Pro perks + Genesis collectable' : 'Backing the SHADDAI build' };

      var req;
      try {
        req = fetch(EP_CREATE, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(9000)
        });
      } catch (e) { out.innerHTML = '<div class="shdF-err">Could not start request: ' + esc(e.message) + '</div>'; return; }

      req.then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.error || !d.payment) {
          out.innerHTML = '<div class="shdF-err">' + esc((d && d.error) || 'Payment endpoint unavailable. Add SHADDAI_MERCHANT_WALLET in backend .env to enable.') + '</div>';
          return;
        }
        renderPayment(out, d.payment, kind, amountSol, usdEquiv);
      }).catch(function (e) {
        out.innerHTML = '<div class="shdF-err">Network error: ' + esc(e.message) + '</div>';
      });
    }

    function renderPayment(out, p, kind, amountSol, usdEquiv) {
      var url = p.url || '';
      out.innerHTML =
        '<div class="shdF-pay">' +
          '<div class="shdF-qrwrap"><div id="shdF_qr" class="shdF-qr"></div>' +
            '<div class="shdF-qrhint">SCAN · PHANTOM / SOLFLARE</div>' +
            '<div class="shdF-qrnet">◎ SOLANA</div></div>' +
          '<div class="shdF-payinfo">' +
            '<div class="shdF-payrow"><span class="shdF-k">FOR</span><span class="shdF-v">' + esc(p.item) + '</span></div>' +
            '<div class="shdF-payrow"><span class="shdF-k">AMOUNT</span><span class="shdF-v shdF-amt">' + esc(p.amount) + ' ' + esc(p.currency || 'SOL') + '</span></div>' +
            '<div class="shdF-payrow"><span class="shdF-k">STATUS</span><span class="shdF-v" id="shdF_status">⏳ AWAITING PAYMENT</span></div>' +
            '<div class="shdF-urllabel">SOLANA PAY URL</div>' +
            '<a class="shdF-url" id="shdF_urlLink" href="' + esc(url) + '">' + esc(url) + '</a>' +
            '<div class="shdF-btns">' +
              '<button type="button" class="shdF-btn shdF-btn-sol" id="shdF_openWallet">🚀 Open in Wallet</button>' +
              '<button type="button" class="shdF-btn shdF-btn-ghost" id="shdF_copy">📋 Copy URL</button>' +
              '<button type="button" class="shdF-btn shdF-btn-ghost" id="shdF_check">↻ Check Status</button>' +
            '</div>' +
            '<div class="shdF-note">Payment confirmation is being finalized — your support is recorded. ' +
              'Perks (lifetime Pro, Genesis collectable, name on the wall) unlock once the transfer is confirmed on-chain.</div>' +
          '</div>' +
        '</div>';

      // QR render (dependency-free); graceful fallback if it can't encode
      try {
        var host = document.getElementById('shdF_qr');
        var canvas = QR.render(url, 4, '#14f195', '#020817');
        if (host && canvas) host.appendChild(canvas);
        else if (host) host.innerHTML = '<div class="shdF-qrfallback">Use the link / button below to pay</div>';
      } catch (e) {
        var h2 = document.getElementById('shdF_qr');
        if (h2) h2.innerHTML = '<div class="shdF-qrfallback">Use the link / button below to pay</div>';
      }

      var openBtn = document.getElementById('shdF_openWallet');
      if (openBtn) openBtn.addEventListener('click', function () { try { window.location.href = url; } catch (e) { window.open(url, '_blank'); } });
      var copyBtn = document.getElementById('shdF_copy');
      if (copyBtn) copyBtn.addEventListener('click', function () {
        try { navigator.clipboard.writeText(url); toast('✓ Solana Pay URL copied'); } catch (e) { toast('Copy failed — long-press the link'); }
      });
      var checkBtn = document.getElementById('shdF_check');
      if (checkBtn) checkBtn.addEventListener('click', function () { checkStatus(p, kind, amountSol, usdEquiv, false); });

      // record intent (honest: intent, not a granted perk)
      var st = getState() || {};
      st.intent = { kind: kind, item: p.item, amount: p.amount, reference: p.reference, id: p.id, at: new Date().toISOString(), confirmed: false };
      if (!st.firstIntentAt) st.firstIntentAt = st.intent.at;
      saveState(st);
      toast('✓ Payment request ready — scan or open in wallet');

      // auto-poll on-chain confirmation (backend findReference is real)
      stopPoll();
      var polls = 0;
      _poller = setInterval(function () {
        polls++;
        if (polls > 40) { stopPoll(); return; } // ~4 min
        checkStatus(p, kind, amountSol, usdEquiv, true);
      }, 6000);
    }

    function checkStatus(p, kind, amountSol, usdEquiv, silent) {
      var ref = p && p.reference;
      if (!ref) return;
      var badge = document.getElementById('shdF_status');
      fetch(EP_STATUS + encodeURIComponent(ref), { signal: AbortSignal.timeout(8000) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.status === 'paid') {
            stopPoll();
            if (badge) { badge.textContent = '✓ CONFIRMED ON-CHAIN'; badge.classList.add('shdF-ok'); }
            var st = getState() || {};
            st.confirmed = true;
            st.member = (kind === 'founder');
            st.confirmedAt = new Date().toISOString();
            st.lastSignature = d.signature || null;
            if (st.intent) st.intent.confirmed = true;
            saveState(st);
            toast('🎉 Payment confirmed — welcome, Founding Member!');
            renderMemberBanner();
          } else if (!silent && badge) {
            badge.textContent = '⏳ AWAITING PAYMENT';
          }
        })
        .catch(function () { if (!silent && badge) badge.textContent = '⏳ AWAITING PAYMENT'; });
    }

    /* -------------------------------------------------------------------- *
     * Modal UI
     * -------------------------------------------------------------------- */
    function ensureModal() {
      var existing = document.getElementById(MODAL_ID);
      if (existing) return existing;

      var wrap = document.createElement('div');
      wrap.id = MODAL_ID;
      wrap.className = 'shdF-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-label', 'Become a Founding Member');
      wrap.style.display = 'none';
      wrap.innerHTML =
        '<div class="shdF-modal">' +
          '<button type="button" class="shdF-close" id="shdF_close" aria-label="Close">✕</button>' +
          '<div class="shdF-head">' +
            '<div class="shdF-crown">👑</div>' +
            '<h2 class="shdF-title">Become a Founding Member</h2>' +
            '<p class="shdF-sub">Back the build before launch. Pay with Solana — no card, no middleman.</p>' +
          '</div>' +

          '<div id="shdF_memberBanner"></div>' +

          '<div class="shdF-founder">' +
            '<div class="shdF-founder-badge">GENESIS · LIMITED</div>' +
            '<div class="shdF-founder-top">' +
              '<div><div class="shdF-founder-name">Founding Pass</div>' +
                '<div class="shdF-founder-price">$99 <span class="shdF-once">one-time</span></div>' +
                '<div class="shdF-founder-sol" id="shdF_founderSol">≈ — SOL</div></div>' +
            '</div>' +
            '<ul class="shdF-perks">' +
              '<li>♾ Lifetime <strong>Pro</strong> perks</li>' +
              '<li>🎴 Genesis <strong>collectable</strong></li>' +
              '<li>🧱 Your name on the <strong>Founders wall</strong></li>' +
            '</ul>' +
            '<button type="button" class="shdF-btn shdF-btn-founder" id="shdF_payFounder">Pay with Solana</button>' +
          '</div>' +

          '<div class="shdF-or"><span>or donate any amount</span></div>' +

          '<div class="shdF-donate">' +
            '<div class="shdF-presets">' +
              '<button type="button" class="shdF-preset" data-sol="0.25">0.25 <small>SOL</small></button>' +
              '<button type="button" class="shdF-preset" data-sol="0.5">0.5 <small>SOL</small></button>' +
              '<button type="button" class="shdF-preset" data-sol="1">1 <small>SOL</small></button>' +
            '</div>' +
            '<div class="shdF-custom">' +
              '<input type="number" id="shdF_customAmt" class="shdF-input" min="0.001" step="0.01" placeholder="Custom amount (SOL)" />' +
              '<button type="button" class="shdF-btn shdF-btn-sol" id="shdF_payCustom">Donate</button>' +
            '</div>' +
          '</div>' +

          '<div id="shdF_result" class="shdF-result" style="display:none"></div>' +

          '<div class="shdF-foot">Solana Pay · SPL · non-custodial. Confirmation verified on-chain.</div>' +
        '</div>';

      document.body.appendChild(wrap);

      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
      var closeBtn = wrap.querySelector('#shdF_close');
      if (closeBtn) closeBtn.addEventListener('click', close);

      var fBtn = wrap.querySelector('#shdF_payFounder');
      if (fBtn) fBtn.addEventListener('click', function () { payWithSolana('founder', usdToSol(FOUNDING_PRICE), FOUNDING_PRICE); });

      var presets = wrap.querySelectorAll('.shdF-preset');
      for (var i = 0; i < presets.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            var sol = parseFloat(btn.getAttribute('data-sol'));
            if (sol > 0) payWithSolana('donation', sol, null);
          });
        })(presets[i]);
      }

      var customBtn = wrap.querySelector('#shdF_payCustom');
      if (customBtn) customBtn.addEventListener('click', function () {
        var inp = document.getElementById('shdF_customAmt');
        var sol = parseFloat(inp && inp.value);
        if (!(sol > 0)) { toast('Enter a SOL amount'); return; }
        payWithSolana('donation', Math.round(sol * 1000) / 1000, null);
      });

      renderMemberBanner();
      updateFoundingSolLabel();
      return wrap;
    }

    function renderMemberBanner() {
      var host = document.getElementById('shdF_memberBanner');
      if (!host) return;
      var st = getState();
      if (st && st.confirmed && st.member) {
        host.innerHTML = '<div class="shdF-thanks shdF-thanks-ok">🎉 Thanks, Founding Member — your support is confirmed on-chain.</div>';
      } else if (st && st.member) {
        host.innerHTML = '<div class="shdF-thanks">👑 Thanks, Founding Member — confirmation is being finalized.</div>';
      } else if (st && st.intent) {
        host.innerHTML = '<div class="shdF-thanks">🙏 Thanks for backing the build — your support is recorded.</div>';
      } else {
        host.innerHTML = '';
      }
    }

    function open() {
      try {
        var m = ensureModal();
        m.style.display = 'flex';
        try { document.body.style.overflow = 'hidden'; } catch (e) {}
        refreshSolPrice();
        renderMemberBanner();
      } catch (e) { try { console.warn('[founding] open', e); } catch (_) {} }
    }
    function close() {
      try {
        stopPoll();
        var m = document.getElementById(MODAL_ID);
        if (m) m.style.display = 'none';
        try { document.body.style.overflow = ''; } catch (e) {}
      } catch (e) {}
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = document.getElementById(MODAL_ID);
        if (m && m.style.display !== 'none') close();
      }
    });

    /* -------------------------------------------------------------------- *
     * Inject a "👑 Founding" button into #shaddaiHome .hh-bar (poll up to 6s)
     * -------------------------------------------------------------------- */
    (function injectButton() {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        try {
          var bar = document.querySelector('#shaddaiHome .hh-bar');
          if (bar) {
            if (!document.getElementById('shdF_navBtn')) {
              var btn = document.createElement('button');
              btn.id = 'shdF_navBtn';
              btn.type = 'button';
              btn.className = 'shdF-navbtn';
              btn.textContent = '👑 Founding';
              btn.addEventListener('click', open);
              bar.appendChild(btn);
            }
            clearInterval(timer);
          } else if (tries >= 12) {
            clearInterval(timer);
          }
        } catch (e) { clearInterval(timer); }
      }, 500);
    })();

    window.SHADDAI_FOUNDING = { open: open, close: close };
  } catch (err) {
    try { console.warn('[founding] init failed', err); } catch (e) {}
    try { window.SHADDAI_FOUNDING = window.SHADDAI_FOUNDING || { open: function () {}, close: function () {} }; } catch (e) {}
  }
})();
