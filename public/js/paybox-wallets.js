/* ══ PAYBOX — WALLETS ════════════════════════════════════════════════════════
   One shared panel used by the landing door (enter.html) and Simple Mode
   (simple.html): shows every wallet we hold, the agents/operatives you can pay
   and exactly what they can be paid to do, and the legal guardrails.

   All money data is fetched live so a rotated address is a config change, not
   a redeploy. The panel is deliberately blunt about what this is and is not —
   no promises, no "returns", no financial advice. */
(function () {
  var styleSheet = null;

  if (window.openPaybox) return;

  function css() {
    return '' +
      '.shd-pay{position:fixed;inset:0;z-index:9600;display:grid;place-items:center;padding:20px;' +
        'font-family:var(--f-mono,monospace);color:#e9efe9}' +
      '.shd-pay .shd-pay-scrim{position:absolute;inset:0;background:rgba(0,0,0,.8);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}' +
      '.shd-pay .shd-pay-panel{position:relative;width:min(880px,100%);max-height:88vh;overflow-y:auto;' +
        'background:#0e141b;border:1px solid rgba(120,150,140,.28);border-radius:10px;' +
        'box-shadow:0 24px 80px rgba(0,0,0,.6)}' +
      '.shd-pay .shd-pay-pad{padding:24px 26px}' +
      '.shd-pay .shd-pay-eyebrow{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#00ff9c}' +
      '.shd-pay h2{margin:6px 0 2px;font-family:Cinzel,serif;font-weight:900;font-size:24px;color:#e9efe9}' +
      '.shd-pay .shd-pay-sub{font-size:12px;color:#93a49b;line-height:1.6}' +
      '.shd-pay .shd-pay-sec{margin:22px 0 8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#e8c45c}' +
      '.shd-pay .shd-pay-card{border:1px solid rgba(120,150,140,.2);border-radius:8px;padding:14px 16px;margin-top:10px}' +
      '.shd-pay .shd-pay-wlabel{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#00ff9c}' +
      '.shd-pay .shd-pay-addr{font-size:12px;color:#93a49b;word-break:break-all;margin-top:8px}' +
      '.shd-pay .shd-pay-chain{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7f9289;margin-top:6px}' +
      '.shd-pay .shd-pay-copy{margin-top:10px;min-height:36px;padding:0 14px;background:none;' +
        'border:1px solid rgba(120,150,140,.34);color:#93a49b;font-family:inherit;font-size:10px;' +
        'letter-spacing:.14em;text-transform:uppercase;cursor:pointer;border-radius:4px}' +
      '.shd-pay .shd-pay-copy:hover{color:#e9efe9;border-color:#00ff9c}' +
      '.shd-pay .shd-pay-op{display:grid;grid-template-columns:150px 1fr auto;gap:14px;align-items:center}' +
      '.shd-pay .shd-pay-opname{font-family:Cinzel,serif;font-weight:800;font-size:15px;color:#e9efe9}' +
      '.shd-pay .shd-pay-oprole{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7f9289;margin-top:2px}' +
      '.shd-pay .shd-pay-opdeets{font-size:12px;color:#93a49b;line-height:1.6}' +
      '.shd-pay .shd-pay-opprice{font-size:12px;color:#00ff9c;white-space:nowrap}' +
      '.shd-pay .shd-pay-optools{margin-top:6px;display:flex;flex-wrap:wrap;gap:5px}' +
      '.shd-pay .shd-pay-chip{font-size:9px;letter-spacing:.05em;padding:2px 7px;border:1px solid rgba(120,150,140,.24);' +
        'border-radius:20px;color:#7f9289}' +
      '.shd-pay .shd-pay-tools{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#7f9289}' +
      '.shd-pay .shd-pay-disc{margin-top:22px;padding:14px 16px;border:1px solid rgba(255,183,112,.28);' +
        'border-radius:8px;background:rgba(255,183,112,.05);font-size:11px;line-height:1.7;color:#e7d5bd}' +
      '.shd-pay .shd-pay-disc b{color:#ffb770}' +
      '.shd-pay .shd-pay-close{width:100%;margin-top:18px;min-height:48px;background:none;' +
        'border:1px solid rgba(120,150,140,.34);color:#93a49b;font-family:inherit;font-size:11px;' +
        'letter-spacing:.16em;text-transform:uppercase;cursor:pointer;border-radius:6px}' +
      '.shd-pay .shd-pay-close:hover{color:#e9efe9;border-color:#e8c45c}' +
      '.shd-pay .shd-pay-note{font-size:11px;color:#7f9289;margin-top:10px;text-align:center}' +
      '@media(max-width:720px){.shd-pay .shd-pay-op{grid-template-columns:1fr;gap:8px}.shd-pay .shd-pay-pad{padding:18px 16px}}';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  function copy(v, btn) {
    var was = btn.textContent;
    function ok() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = was; }, 1600); }
    function fb() { var t = document.createElement('textarea'); t.value = v; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) {} document.body.removeChild(t); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, fb); else fb();
  }

  function close(root) { if (root && root.parentNode) root.parentNode.removeChild(root); }

  function open() {
    if (!styleSheet) { styleSheet = document.createElement('style'); styleSheet.textContent = css(); document.head.appendChild(styleSheet); }

    var el = document.createElement('div');
    el.className = 'shd-pay';
    el.innerHTML =
      '<div class="shd-pay-scrim"></div>' +
      '<div class="shd-pay-panel" role="dialog" aria-modal="true" aria-label="Paybox wallets">' +
        '<div class="shd-pay-pad">' +
          '<div class="shd-pay-eyebrow">Paybox</div>' +
          '<h2>Wallets</h2>' +
          '<div class="shd-pay-sub">Where funds land, and what you can pay the council&rsquo;s agents to do with them.<br>' +
          'Nothing is investment advice. Send only what you&rsquo;re comfortable paying for a single finished task.</div>' +
          '<div class="shd-pay-sec">Destinations</div>' +
          '<div id="shdPayWallets">loading&hellip;</div>' +
          '<div class="shd-pay-sec">What the agents do for a payment</div>' +
          '<div id="shdPayOps">loading&hellip;</div>' +
          '<div class="shd-pay-disc"></div>' +
          '<button class="shd-pay-close" data-shd-pay-close>Close</button>' +
          '<div class="shd-pay-note">Paybox &middot; wallet addresses load live from the wallet service</div>' +
        '</div>' +
      '</div>';
    el.querySelector('.shd-pay-scrim').addEventListener('click', function () { close(el); });
    el.querySelector('[data-shd-pay-close]').addEventListener('click', function () { close(el); });
    el.addEventListener('click', function (e) { var c = e.target.closest('[data-shd-pay-copy]'); if (c) copy(c.getAttribute('data-shd-pay-copy'), c); });
    document.body.appendChild(el);

    loadWallets(el);
    loadOps(el);
    loadDisc(el);
  }

  function loadWallets(el) {
    var into = el.querySelector('#shdPayWallets');
    fetch('/api/paybox/wallets').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var list = (d && d.wallets) || [];
      if (!list.length) { into.innerHTML = '<div class="shd-pay-card" style="color:#93a49b">No payment destinations are configured yet.</div>'; return; }
      into.innerHTML = list.map(function (w) {
        return '<div class="shd-pay-card">' +
          '<div class="shd-pay-wlabel">' + esc(w.label || 'Wallet') + '</div>' +
          '<div class="shd-pay-chain">' + esc(w.chain || '') + '</div>' +
          '<div class="shd-pay-addr">' + esc(w.address || '') + '</div>' +
          '<button class="shd-pay-copy" data-shd-pay-copy="' + esc(w.address || '') + '">Copy address</button>' +
        '</div>';
      }).join('');
    }).catch(function () {
      into.innerHTML = '<div class="shd-pay-card" style="color:#93a49b">Could not reach the wallet service.</div>';
    });
  }

  function loadOps(el) {
    var into = el.querySelector('#shdPayOps');
    fetch('/api/operatives').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var ops = (d && (d.operatives || d.data)) || [];
      if (!ops.length) { into.innerHTML = '<div class="shd-pay-card" style="color:#93a49b">No agents are available to take paid work right now.</div>'; return; }
      into.innerHTML = ops.slice(0, 21).map(function (o) {
        var name = o.codename || o.name || 'AGENT';
        var role = o.archetype || (o.brain && o.brain.persona) || 'agent';
        var price = o.monetizePrice;
        var priceTxt = (typeof price === 'number' && price > 0) ? '$' + Number(price).toFixed(2) : 'per task';
        var tools = (o.tools || []).map(function (t) { return '<span class="shd-pay-chip">' + esc(String(t).replace(/-/g, ' ')) + '</span>'; }).join('');
        var deets = [];
        if (o.model) deets.push(esc(o.model));
        if (o.stats) { var s = o.stats; var parts = []; if (s.iq != null) parts.push('IQ ' + s.iq); if (s.speed != null) parts.push('speed ' + s.speed); if (s.power != null) parts.push('power ' + s.power); if (parts.length) deets.push(parts.join(' &middot; ')); }
        return '<div class="shd-pay-card shd-pay-op">' +
          '<div><div class="shd-pay-opname">' + esc(name) + '</div><div class="shd-pay-oprole">' + esc(role) + '</div></div>' +
          '<div class="shd-pay-opdeets">' + (deets.length ? (deets.join('<br>') + '<br>') : '') +
            '<span class="shd-pay-tools">' + (tools ? 'tools: ' : '') + '</span>' + tools + '</div>' +
          '<div class="shd-pay-opprice">' + priceTxt + '</div>' +
        '</div>';
      }).join('');
    }).catch(function () {
      into.innerHTML = '<div class="shd-pay-card" style="color:#93a49b">Could not reach the agent service.</div>';
    });
  }

  function loadDisc(el) {
    var into = el.querySelector('.shd-pay-disc');
    into.innerHTML =
      '<b>Read before you send anything.</b> Sending funds to the addresses above is a payment for task-focused ' +
      'agent work only &mdash; a research brief, a creative draft, a development task. It is <b>not</b> an investment, ' +
      'not a purchase of future value, and no returns, profits, yields, or appreciation are promised, implied, or ' +
      'guaranteed. No wallet is a staking, lending, or yield-bearing account. Agents complete the work they are ' +
      'asked for in good faith, but the quality of any single result cannot be guaranteed and nothing here is ' +
      'financial, legal, or tax advice. Transactions are irreversible and settlement is final; only send funds you ' +
      'can afford to spend entirely. By using these wallets you agree to these terms.';
  }

  window.openPaybox = open;
})();
