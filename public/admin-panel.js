/* ══════════════════════════════════════════════════════════════════
   SHADDAI — ADMIN PANEL  (admin-panel.js)
   Reveals owner/admin controls ONLY when the SERVER confirms you're an admin
   (GET /api/admin/whoami, which verifies your Firebase email against the
   ADMIN_EMAILS allowlist server-side). The button showing is just UX — every
   action is authorized again on the server, so a spoofed client gets nothing.
   Activate by setting ADMIN_EMAILS=cloudzncrownz@gmail.com in the Render env.
   Self-contained, null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__shdAdminPanel) return; window.__shdAdminPanel = true;

  // Attach the verified Firebase token so the server can check the admin allowlist.
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try { var t = window.SHD_AUTH && window.SHD_AUTH.token; if (t) h.Authorization = 'Bearer ' + t; } catch (e) {}
    return h;
  }

  function whenAuthReady(cb, tries) {
    tries = tries || 0;
    var a = window.SHD_AUTH;
    if (a && a.ready) return cb();
    if (tries > 40) return cb();            // give up waiting (~10s) — whoami will just say no
    setTimeout(function () { whenAuthReady(cb, tries + 1); }, 250);
  }

  function check() {
    fetch('/api/admin/whoami', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.isAdmin) mount(); })
      .catch(function () {});
  }

  function mount() {
    if (document.getElementById('shdAdminBtn')) return;
    var s = document.createElement('style');
    s.textContent =
      '#shdAdminBtn{position:fixed;left:14px;bottom:64px;z-index:2147482000;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416;border:none;border-radius:11px;padding:10px 14px;font-family:"Space Grotesk",system-ui,sans-serif;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.5)}' +
      '#shdAdminPop{position:fixed;left:14px;bottom:112px;z-index:2147482000;width:min(320px,92vw);background:rgba(12,10,26,.96);border:1px solid rgba(168,85,247,.4);border-radius:14px;padding:16px;color:#efe9ff;font-family:"Chakra Petch",system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.6)}' +
      '#shdAdminPop h3{font-family:"Space Grotesk";font-size:15px;margin:0 0 3px}#shdAdminPop p{color:#9a86c8;font-size:12px;margin:0 0 12px;line-height:1.5}' +
      '#shdAdminPop button.act{width:100%;text-align:left;background:rgba(255,90,120,.12);border:1px solid rgba(255,90,120,.4);color:#ff8fa3;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:13px;cursor:pointer;margin-bottom:8px}' +
      '#shdAdminPop .msg{font-size:12px;color:#00e5a0;min-height:15px}' +
      '#shdAdminPop .close{background:none;border:0;color:#9a86c8;font-size:16px;cursor:pointer;float:right}';
    document.head.appendChild(s);

    var btn = document.createElement('button');
    btn.id = 'shdAdminBtn'; btn.textContent = '⚙ Admin';
    document.body.appendChild(btn);
    var open = false, pop = null;
    btn.onclick = function () { open ? closePop() : openPop(); };

    function openPop() {
      open = true;
      pop = document.createElement('div'); pop.id = 'shdAdminPop';
      pop.innerHTML =
        '<button class="close" title="Close">✕</button><h3>Admin controls</h3>' +
        '<p>Verified admin — actions are enforced server-side.</p>' +
        '<button class="act" data-a="clear-offices">🏢 Clear ALL offices <span style="opacity:.7">(frees every Founders\' Row lot)</span></button>' +
        '<div class="msg" id="shdAdminMsg"></div>';
      document.body.appendChild(pop);
      pop.querySelector('.close').onclick = closePop;
      pop.querySelector('[data-a="clear-offices"]').onclick = clearOffices;
    }
    function closePop() { open = false; if (pop) { pop.remove(); pop = null; } }

    function clearOffices() {
      if (!confirm('Remove ALL offices and free every lot? This cannot be undone.')) return;
      var msg = document.getElementById('shdAdminMsg'); if (msg) { msg.style.color = '#9a86c8'; msg.textContent = 'Clearing…'; }
      fetch('/api/admin/clear-offices', { method: 'POST', headers: authHeaders(), body: JSON.stringify({}) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { if (msg) { msg.style.color = '#00e5a0'; msg.textContent = 'Cleared ' + d.removed + ' office(s). Lots are open again.'; } }
          else { if (msg) { msg.style.color = '#ff8fa3'; msg.textContent = (d && d.error) || 'Failed.'; } }
        })
        .catch(function () { if (msg) { msg.style.color = '#ff8fa3'; msg.textContent = 'Network error.'; } });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { whenAuthReady(check); });
  else whenAuthReady(check);
})();
