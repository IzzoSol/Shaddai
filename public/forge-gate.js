/* ══════════════════════════════════════════════════════════════════
   SHADDAI — FORGE GATE
   Free users may forge ONE agent (fully working). Forging a 2nd+ agent
   — or a fully custom one — requires Pro or a Founding Pass. Intercepts
   the #ofForge button in the capture phase so the free forge still runs
   but subsequent ones show an upsell instead. Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FREE_LIMIT = 1;
  var USED_KEY = 'shaddai_free_forge_used';

  function entitled() {
    // Founding Pass, or any paid tier, unlocks unlimited forging.
    try { if (localStorage.getItem('shaddai_founding')) return true; } catch (e) {}
    try { if (localStorage.getItem('shaddai_forge_unlimited') === '1') return true; } catch (e) {}
    try {
      var t = window.S && S.billing && S.billing.subscription && S.billing.subscription.tier;
      if (t && ['builder', 'pro', 'alpha'].indexOf(String(t).toLowerCase()) !== -1) return true;
    } catch (e) {}
    return false;
  }
  function freeUsed() { try { return localStorage.getItem(USED_KEY) === '1'; } catch (e) { return false; } }
  function markFreeUsed() { try { localStorage.setItem(USED_KEY, '1'); } catch (e) {} }
  function blockedNow() { return freeUsed() && !entitled(); }

  function injectStyles() {
    if (document.getElementById('shd-forgegate-css')) return;
    var s = document.createElement('style');
    s.id = 'shd-forgegate-css';
    s.textContent =
      '#shdForgeGate{position:fixed;inset:0;z-index:2147483300;display:none;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,.82);backdrop-filter:blur(5px);font-family:"Share Tech Mono",monospace}' +
      '#shdForgeGate.on{display:flex}' +
      '#shdForgeGate .fg-card{width:min(460px,92vw);background:linear-gradient(160deg,#080c0a,#020402);' +
        'border:1px solid rgba(0,255,136,.4);border-radius:8px;box-shadow:0 0 60px rgba(0,255,136,.18),0 30px 80px rgba(0,0,0,.7);padding:24px}' +
      '#shdForgeGate .fg-ico{font-size:34px;margin-bottom:6px}' +
      '#shdForgeGate h3{font-family:"Orbitron",monospace;font-size:19px;font-weight:900;color:#eafff4;margin:0 0 8px;letter-spacing:.03em}' +
      '#shdForgeGate p{font-size:12px;line-height:1.6;color:#9fc7b6;margin:0 0 16px}' +
      '#shdForgeGate .fg-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '#shdForgeGate button{font-family:inherit;cursor:pointer;border-radius:6px;font-weight:700;letter-spacing:.04em;padding:11px 16px;font-size:12px}' +
      '#shdForgeGate .fg-pri{flex:1;min-width:150px;border:none;color:#001b10;background:linear-gradient(180deg,#00ff88,#00b45f);box-shadow:0 3px 0 #05502f}' +
      '#shdForgeGate .fg-pri:active{transform:translateY(3px);box-shadow:none}' +
      '#shdForgeGate .fg-sec{border:1px solid rgba(0,240,255,.4);background:transparent;color:#00f0ff}' +
      '#shdForgeGate .fg-x{margin-top:12px;background:none;border:none;color:#6f9f88;text-decoration:underline;font-size:11px;padding:4px}';
    document.head.appendChild(s);
  }

  function showUpsell() {
    injectStyles();
    var ov = document.getElementById('shdForgeGate');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'shdForgeGate';
      ov.innerHTML =
        '<div class="fg-card">' +
          '<div class="fg-ico">⬡</div>' +
          '<h3>You\'ve forged your free agent</h3>' +
          '<p>Your first agent is yours to keep and use. To forge <b>more agents</b> — or a fully <b>custom</b> one — unlock unlimited forging with a Founding Pass or Pro.</p>' +
          '<div class="fg-row">' +
            '<button class="fg-pri" id="fgFounding">👑 Founding Pass — $99</button>' +
            '<button class="fg-sec" id="fgPlans">See Plans</button>' +
          '</div>' +
          '<button class="fg-x" id="fgClose">Maybe later</button>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('on'); });
      ov.querySelector('#fgClose').addEventListener('click', function () { ov.classList.remove('on'); });
      ov.querySelector('#fgFounding').addEventListener('click', function () {
        ov.classList.remove('on');
        try { if (window.SHADDAI_FOUNDING && SHADDAI_FOUNDING.open) return SHADDAI_FOUNDING.open(); } catch (e) {}
        try { if (typeof showView === 'function') showView('billing'); } catch (e) {}
      });
      ov.querySelector('#fgPlans').addEventListener('click', function () {
        ov.classList.remove('on');
        try { if (window.SHADDAI_ONBOARD && SHADDAI_ONBOARD.open) return SHADDAI_ONBOARD.open(); } catch (e) {}
        try { if (typeof showView === 'function') showView('billing'); } catch (e) {}
      });
    }
    ov.classList.add('on');
  }

  // Capture-phase interceptor on document → runs BEFORE the #ofForge onclick.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#ofForge');
    if (!btn) return;
    if (blockedNow()) {
      e.stopPropagation();      // prevent event reaching #ofForge's onclick (target phase)
      e.preventDefault();
      showUpsell();
    } else if (!entitled()) {
      // This is the free forge — mark it used shortly after (assume it runs).
      setTimeout(markFreeUsed, 1500);
    }
  }, true);

  window.SHADDAI_FORGE_GATE = { blocked: blockedNow, reset: function () { try { localStorage.removeItem(USED_KEY); } catch (e) {} } };
})();
