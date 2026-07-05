/* ══════════════════════════════════════════════════════════════════
   SHADDAI — GAP AUTOFIX
   The content area (#mainArea) reserves a hard-coded 126px for the
   stacked fixed top bars. If any bar renders shorter/hidden, that
   reserve becomes a dead gap right under the tabs. This measures the
   ACTUAL bottom edge of the top-pinned bars and pins #mainArea flush.
   Runs on load, after paint, and on resize. Null-safe.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function fix() {
    try {
      var main = document.getElementById('mainArea');
      if (!main) return;
      var ids = ['topBar', 'mainNav', 'agentBar'];
      var maxBottom = 0;
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
        var r = el.getBoundingClientRect();
        // Only bars pinned near the top of the viewport, with real height.
        if (r.top <= 200 && r.height > 2) maxBottom = Math.max(maxBottom, r.bottom);
      });
      if (maxBottom > 0) {
        var target = Math.round(maxBottom);
        // Only override when it meaningfully differs, so we don't fight other layouts.
        var current = parseInt(window.getComputedStyle(main).marginTop, 10) || 0;
        if (Math.abs(current - target) > 1) {
          main.style.setProperty('margin-top', target + 'px', 'important');
          main.style.setProperty('min-height', 'calc(100vh - ' + target + 'px)', 'important');
        }
      }
    } catch (e) { /* ignore */ }
  }
  function boot() {
    fix();
    [120, 400, 1000, 2000].forEach(function (ms) { setTimeout(fix, ms); });
    window.addEventListener('resize', fix, { passive: true });
    // Re-measure when the user switches views/layouts.
    document.addEventListener('click', function () { setTimeout(fix, 80); }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
