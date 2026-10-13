/* SHADDAI SPARKS LEDGER — the ONE balance shared by the 2D realm, the 3D realm, the
 * arcade and the dashboard (same-origin localStorage).
 *   canonical key : shaddai.sparks   (2D economy / game-fun.js / world3d-bridge.js)
 *   mirror key    : shd_sparks       (dashboard single-wallet)
 *   legacy key    : shd.sparks3d     (old 3D/arcade fork — folded in once, then removed)
 * API: window.ShdSparks.get() / .add(n, kind, note) / .spend(n, kind, note) -> bool
 */
(function () {
  if (window.ShdSparks) return;
  var KEY = 'shaddai.sparks', MIRROR = 'shd_sparks', LEGACY = 'shd.sparks3d', LOG = 'shaddai.sparklog';
  function num(k) { try { var n = parseInt(localStorage.getItem(k), 10); return isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; } }
  function set(n) {
    n = Math.max(0, Math.round(n) || 0);
    try {
      localStorage.setItem(KEY, String(n));
      localStorage.setItem(MIRROR, String(n));
      localStorage.setItem('shd_max_sparks', String(Math.max(num('shd_max_sparks'), n)));
    } catch (e) {}
    return n;
  }
  function log(kind, amt, note) {
    try {
      var a = JSON.parse(localStorage.getItem(LOG) || '[]');
      a.push({ t: Date.now(), k: kind || 'sparks', a: Math.round(amt) || 0, n: note || '' });
      if (a.length > 200) a = a.slice(-200);
      localStorage.setItem(LOG, JSON.stringify(a));
    } catch (e) {}
  }
  function migrate() {
    var old = num(LEGACY);
    try { if (localStorage.getItem(LEGACY) === null) return; localStorage.removeItem(LEGACY); } catch (e) { return; }
    if (old > 0) { set(num(KEY) + old); log('merge', old, 'folded legacy 3D/arcade sparks into the shared wallet'); }
  }
  migrate();
  window.ShdSparks = {
    get: function () { return num(KEY); },
    add: function (n, kind, note) { n = Math.round(n) || 0; if (!n) return num(KEY); var v = set(num(KEY) + n); log(kind, n, note); return v; },
    spend: function (n, kind, note) { n = Math.round(n) || 0; if (n <= 0) return true; if (num(KEY) < n) return false; set(num(KEY) - n); log(kind, -n, note); return true; },
  };
})();
