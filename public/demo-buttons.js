/* demo-buttons.js — DEMO BAR for the front door + landing (owner 2026-10-24): 3D World, the 3D Forge demo (published artifact), and the
 * code-gated SHADDAI signals call channel. The channel link is only handed out by the server (POST /api/demo/unlock) after the right code,
 * so it is not in the page source. Mount: <div id="demoBar"></div><script src="/demo-buttons.js" defer></script> */
(function () {
  var el = document.getElementById('demoBar'); if (!el) return;
  var FORGE = 'https://claude.ai/artifact/PJiKE2o4PmsYW2yfHrtCz5';
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
    '<a class="db" href="' + FORGE + '" target="_blank" rel="noopener">⚒ Agent Forge<small>build an agent · demo</small></a>' +
    '<button class="db" type="button" id="demoSig">✈ Signals Call Channel 🔒<small>members code required</small></button>' +
    '<form id="demoGate" autocomplete="off"><input id="demoCode" inputmode="numeric" maxlength="8" placeholder="code" aria-label="Access code">' +
    '<button class="db" type="submit">Unlock</button><span class="msg" id="demoMsg" role="status"></span></form>';
  var gate = document.getElementById('demoGate'), code = document.getElementById('demoCode'), msg = document.getElementById('demoMsg');
  document.getElementById('demoSig').onclick = function () { gate.classList.toggle('on'); if (gate.classList.contains('on')) code.focus(); };
  gate.onsubmit = function (e) {
    e.preventDefault(); msg.textContent = '';
    fetch('/api/demo/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.value.trim() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { if (d && d.url) { window.open(d.url, '_blank', 'noopener'); gate.classList.remove('on'); code.value = ''; } else msg.textContent = 'Wrong code'; })
      .catch(function () { msg.textContent = 'Unavailable - try again'; });
  };
})();
