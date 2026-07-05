/* ══════════════════════════════════════════════════════════════════
   SHADDAI — AGENTS PIPELINE
   Relocates the Agent Deployment Interface (#agentDeployCard, the
   character-sheet/revolver gallery) from the Forge view INTO the Agents
   tab, replacing the Wallet/revenue section downward. Runtime DOM move
   keeps all its existing JS (revolver IDs) working. Null-safe, idempotent.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function run() {
    var dep = document.getElementById('agentDeployCard');
    var agents = document.getElementById('agentsView');
    if (!dep || !agents) return false;
    if (dep.getAttribute('data-agpipe') === '1') return true;

    // Find the direct child of #agentsView that begins the "revenue section"
    // (the Agent Wallets card contains #agentWalletsPanel).
    var wallet = document.getElementById('agentWalletsPanel');
    var anchor = wallet;
    while (anchor && anchor.parentElement !== agents) anchor = anchor.parentElement;

    try {
      if (anchor && anchor.parentElement === agents) {
        agents.insertBefore(dep, anchor);           // deployment card sits where revenue began
        var n = anchor;
        while (n) { var next = n.nextElementSibling; n.style.display = 'none'; n = next; } // hide from there down
      } else {
        agents.appendChild(dep);                    // fallback: append at end
      }
      dep.style.display = '';                        // ensure visible in its new home
      dep.setAttribute('data-agpipe', '1');
    } catch (e) { /* never throw */ }
    return true;
  }

  function boot() {
    var tries = 0;
    var t = setInterval(function () { tries++; if (run() || tries > 60) clearInterval(t); }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
