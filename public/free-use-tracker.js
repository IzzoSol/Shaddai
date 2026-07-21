/* ══════════════════════════════════════════════════════════════════
   SHADDAI — FREE-USE FUNNEL + SIGN-IN GATE  (free-use-tracker.js)
   Top-of-funnel: anonymous users get N free uses of a gated action
   (forge, media generation, 3D, …). On exhaustion → the "keep your
   customized agent — sign in" conversion hook. Signed-in = unlimited.
   Usage:  SHDFree.gate('forge', { onAllowed: doForge, label: 'forges' })
           var s = SHDFree.check('media');   // {allowed, remaining, cap, signedIn}
   Self-contained, null-safe, no deps.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SHDFree) return;

  // Free-use caps per action (per browser). Tune freely.
  var CAPS = { forge: 8, 'pixel-forge': 8, '3d': 3, media: 5, generate: 5, publish: 3 };
  var KEY = 'shd_free_uses';

  function signedIn() {
    try { if (window.SHD_AUTH && SHD_AUTH.user) return true; } catch (e) {}
    try { var u = (typeof window.opOwner === 'function') ? window.opOwner() : ''; return !!(u && String(u).indexOf('guest') !== 0 && u !== 'guest' && u !== 'local'); } catch (e) { return false; }
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function cap(f) { return CAPS[f] != null ? CAPS[f] : (CAPS.generate || 5); }
  function used(f) { return load()[f] || 0; }
  function remaining(f) { if (signedIn()) return Infinity; return Math.max(0, cap(f) - used(f)); }
  function toast(m) { try { if (window.notify) return notify(m); } catch (e) {} }

  window.SHDFree = {
    signedIn: signedIn,
    remaining: remaining,
    check: function (f) { return { allowed: signedIn() || remaining(f) > 0, remaining: remaining(f), cap: cap(f), signedIn: signedIn() }; },
    use: function (f) { if (signedIn()) return { allowed: true, remaining: Infinity }; var d = load(); d[f] = (d[f] || 0) + 1; save(d); return { allowed: remaining(f) >= 0, remaining: remaining(f) }; },
    reset: function (f) { var d = load(); if (f) delete d[f]; else d = {}; save(d); },
    // Run onAllowed if allowed (and consume a free use); else show the sign-in hook. Returns true if it ran.
    gate: function (f, opts) {
      opts = opts || {};
      if (signedIn()) { if (opts.onAllowed) opts.onAllowed(); return true; }
      if (remaining(f) > 0) {
        this.use(f);
        if (opts.onAllowed) opts.onAllowed();
        var r = remaining(f);
        if (r <= 2) toast('⚡ ' + r + ' free ' + (opts.label || f) + ' left — sign in to keep going');
        return true;
      }
      showHook(opts);
      return false;
    }
  };

  function showHook(opts) {
    opts = opts || {};
    var ex = document.getElementById('shdFreeHook');
    if (ex) { ex.querySelector('p').innerHTML = hookMsg(opts); ex.classList.add('on'); return; }
    var css = document.createElement('style');
    css.textContent = '#shdFreeHook{position:fixed;inset:0;z-index:100050;display:none;place-items:center;background:rgba(6,4,16,.86);backdrop-filter:blur(8px);font-family:"Chakra Petch",sans-serif}#shdFreeHook.on{display:grid}#shdFreeHook .c{max-width:430px;text-align:center;padding:28px 26px;border:1px solid rgba(168,85,247,.42);border-radius:16px;background:linear-gradient(160deg,#180f38,#0a0518);color:#efe9ff;box-shadow:0 0 60px rgba(168,85,247,.3)}#shdFreeHook h2{font-family:"Space Grotesk";font-size:22px;margin:0 0 8px;background:linear-gradient(90deg,#a855f7,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}#shdFreeHook p{color:#9a86c8;font-size:13px;line-height:1.55;margin:0 0 18px}#shdFreeHook button{font-family:"Space Grotesk";font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#a855f7,#22d3ee);color:#0b0416}#shdFreeHook .x{background:none;border:1px solid rgba(168,85,247,.4);color:#9a86c8;margin-left:8px}';
    document.head.appendChild(css);
    var d = document.createElement('div'); d.id = 'shdFreeHook';
    d.innerHTML = '<div class="c"><h2>Keep what you made</h2><p>' + hookMsg(opts) + '</p><button id="shdFreeSignin">Sign in →</button><button class="x" id="shdFreeClose">Maybe later</button></div>';
    document.body.appendChild(d);
    d.querySelector('#shdFreeSignin').onclick = function () { try { if (window.shdSignIn) shdSignIn(); else if (window.showView) showView('settings'); } catch (e) {} };
    d.querySelector('#shdFreeClose').onclick = function () { d.classList.remove('on'); };
    d.classList.add('on');
  }
  function hookMsg(opts) {
    return opts.hookMsg || ('You\'ve used your free ' + (opts.label || 'creations') + '. <b style="color:#efe9ff">Sign in</b> to keep your customized pixel agent + tools forever, place your office in SHADDAI City, and unlock unlimited access.');
  }
})();
