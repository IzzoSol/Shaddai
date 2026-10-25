/* demo-buttons.js — DEMO BAR for the front door + landing (owner 2026-10-24): 3D World, the Agent Forge demo page, and THE EMERALD VINE
 * (calls hub: lounge, PNL, gated bot + private channel - see emerald-vine.html). Mount: <div id="demoBar"></div><script src="/demo-buttons.js" defer></script> */
(function () {
  var el = document.getElementById('demoBar'); if (!el) return;
  var css = document.createElement('style');
  css.textContent = '#demoBar{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:18px auto 0;max-width:720px;padding:0 16px;position:relative;z-index:5}' +
    '#demoBar .db{font:600 14px/1.2 system-ui,sans-serif;letter-spacing:.04em;color:#e8f4ff;background:rgba(10,16,32,.72);border:1px solid rgba(95,224,255,.45);' +
    'border-radius:10px;padding:11px 16px;cursor:pointer;text-decoration:none;backdrop-filter:blur(6px);transition:border-color .2s,box-shadow .2s}' +
    '#demoBar .db:hover,#demoBar .db:focus-visible{border-color:#5fe0ff;box-shadow:0 0 18px rgba(95,224,255,.35);outline:none}' +
    '#demoBar .db.vine{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-color:rgba(0,255,156,.6)}#demoBar .db.vine img{border-radius:8px;object-fit:cover}#demoBar .db.vine small{flex-basis:100%;margin-top:-6px;padding-left:54px}' +
    '#demoBar .db small{display:block;font-weight:400;opacity:.65;font-size:11px;margin-top:3px}' +
    '#demoGate{display:none;gap:8px;justify-content:center;width:100%;margin-top:4px}#demoGate.on{display:flex}' +
    '#demoGate input{width:120px;font:16px system-ui;padding:9px 10px;border-radius:8px;border:1px solid rgba(232,196,92,.6);background:#0a1020;color:#fff;text-align:center;letter-spacing:.3em}' +
    '#demoGate .msg{font:13px system-ui;color:#ffb3b3;align-self:center}';
  document.head.appendChild(css);
  el.innerHTML =
    '<a class="db" href="/SHADDAI-WORLD-3D.html">✦ 3D World<small>walk the realm · demo</small></a>' +
    '<a class="db" href="/forge-demo.html">⚒ Agent Forge<small>build an agent · demo</small></a>' +
    '<a class="db vine" href="/emerald-vine.html"><img src="/assets/vine/button.jpg" alt="" width="44" height="44" loading="lazy">THE EMERALD VINE<small>calls · PNL · lounge</small></a>';
})();
