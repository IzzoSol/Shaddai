/* demo-buttons.js — DEMO BAR for the front door + landing (owner 2026-10-24): 3D World, Forge demo page, PNL gallery, SHADDAI bot + Emerald
 * Lounge (public), and the code-gated private channel + tracked-wallet list: both are handed out only by the server (POST /api/demo/unlock,
 * /api/demo/wallets) after the right code, so neither is in the page source. Mount: <div id="demoBar"></div><script src="/demo-buttons.js" defer></script> */
(function () {
  var el = document.getElementById('demoBar'); if (!el) return;
  var BOT = 'https://t.me/+RvXnjjRax6hjMTlh', LOUNGE = 'https://t.me/EMERALDLOUNGE', lastCode = '';
  var css = document.createElement('style');
  css.textContent = '#demoBar{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:18px auto 0;max-width:720px;padding:0 16px;position:relative;z-index:5}' +
    '#demoBar .db{font:600 14px/1.2 system-ui,sans-serif;letter-spacing:.04em;color:#e8f4ff;background:rgba(10,16,32,.72);border:1px solid rgba(95,224,255,.45);' +
    'border-radius:10px;padding:11px 16px;cursor:pointer;text-decoration:none;backdrop-filter:blur(6px);transition:border-color .2s,box-shadow .2s}' +
    '#demoBar .db:hover,#demoBar .db:focus-visible{border-color:#5fe0ff;box-shadow:0 0 18px rgba(95,224,255,.35);outline:none}' +
    '#demoBar .db small{display:block;font-weight:400;opacity:.65;font-size:11px;margin-top:3px}' +
    '#demoGate{display:none;gap:8px;justify-content:center;width:100%;margin-top:4px}#demoGate.on{display:flex}' +
    '#demoGate input{width:120px;font:16px system-ui;padding:9px 10px;border-radius:8px;border:1px solid rgba(232,196,92,.6);background:#0a1020;color:#fff;text-align:center;letter-spacing:.3em}' +
    '#demoGate .msg{font:13px system-ui;color:#ffb3b3;align-self:center}';
  document.head.appendChild(css);
  el.innerHTML =
    '<a class="db" href="/SHADDAI-WORLD-3D.html">✦ 3D World<small>walk the realm · demo</small></a>' +
    '<a class="db" href="/forge-demo.html">⚒ Agent Forge<small>build an agent · demo</small></a>' +
    '<a class="db" href="/pnl.html">📈 PNL<small>call results</small></a>' +
    '<a class="db" href="' + BOT + '" target="_blank" rel="noopener">✈ SHADDAI Bot<small>telegram</small></a>' +
    '<a class="db" href="' + LOUNGE + '" target="_blank" rel="noopener">◈ Emerald Lounge<small>open telegram</small></a>' +
    '<button class="db" type="button" id="demoSig">🔒 Private Channel<small>members code required</small></button>' +
    '<form id="demoGate" autocomplete="off"><input id="demoCode" inputmode="numeric" maxlength="8" placeholder="code" aria-label="Access code">' +
    '<button class="db" type="submit">Unlock</button><span class="msg" id="demoMsg" role="status"></span></form>' +
    '<div id="demoOpen" style="display:none;gap:10px;justify-content:center;width:100%"></div>';
  var gate = document.getElementById('demoGate'), code = document.getElementById('demoCode'), msg = document.getElementById('demoMsg');
  document.getElementById('demoSig').onclick = function () { gate.classList.toggle('on'); if (gate.classList.contains('on')) code.focus(); };
  gate.onsubmit = function (e) {
    e.preventDefault(); msg.textContent = '';
    fetch('/api/demo/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.value.trim() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (!d || !d.url) { msg.textContent = 'Wrong code'; return; }
        lastCode = code.value.trim(); gate.classList.remove('on'); code.value = '';
        var box = document.getElementById('demoOpen'); box.style.display = 'flex';
        box.innerHTML = '<a class="db" target="_blank" rel="noopener" href="' + d.url.replace(/"/g, '') + '">✈ Open Private Channel</a><button class="db" type="button" id="demoWal">⬇ Tracked Wallets</button>';
        document.getElementById('demoWal').onclick = function () {
          fetch('/api/demo/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: lastCode }) })
            .then(function (r) { if (!r.ok) throw 0; return r.blob(); })
            .then(function (bl) { var u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = 'shaddai-tracked-wallets.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); })
            .catch(function () { msg.textContent = 'Download failed'; });
        };
      })
      .catch(function () { msg.textContent = 'Unavailable - try again'; });
  };
})();
