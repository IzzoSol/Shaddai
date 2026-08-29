/* ══════════════════════════════════════════════════════════════════════════
   SHD CHECKOUT — the only correct way to send someone to Stripe.

   WHY THIS EXISTS: a raw buy.stripe.com link in an href takes the money and
   loses the buyer. The webhook (backend/stripe-webhook.js) grants a tier by
   parsing `client_reference_id` as "uid-item"; without it the handler logs
   "cannot attribute (guest checkout?)" and NOBODY IS UPGRADED. The person paid
   and got nothing, and the only way to fix it is by hand, from the Stripe
   dashboard, after they complain.

   It also means the price lives in exactly one place. pricing.html used to
   hardcode three URLs, one of which was the WRONG link — the founder button
   pointed at the `pro` link, so a founder purchase would have charged the
   wrong amount and granted the wrong thing. Item ids can be checked against
   backend/data/payment-config.json; pasted URLs cannot.

   USAGE:  <a data-checkout="founder" href="/pricing.html">Claim a seat</a>
   Any element with [data-checkout] is wired automatically on DOMContentLoaded.

   ITEM IDS (must match payment-config.json):
     founder · pro · builder · alpha
     credits_10 · credits_25 · credits_50 · credits_100
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* Identity, in the order the app establishes it. 'guest' is deliberately NOT
     a fallback here — see begin(): an unattributable payment is worse than a
     blocked one, because the money is gone and the grant never happens. */
  function currentUid() {
    try {
      return localStorage.getItem('shd_userid')
        || localStorage.getItem('uid')
        || '';
    } catch (e) { return ''; }
  }

  function signedIn() {
    try { return localStorage.getItem('shd_signed_in') === '1' && !!currentUid(); }
    catch (e) { return false; }
  }

  /**
   * Send the buyer to checkout for one item.
   * @param {string} item  an id from payment-config.json
   * @param {object} [opts]
   *   onError(message)  — shown to the buyer; defaults to alert-free console
   *   allowGuest        — true only where an unattributed sale is acceptable
   * @returns {Promise<boolean>} whether a redirect was started
   */
  function begin(item, opts) {
    opts = opts || {};
    var uid = currentUid();

    if (!uid && !opts.allowGuest) {
      // Send them to sign in and come back to the same intent, so the click is
      // not lost. `next` is read by the sign-in flow; `buy` re-triggers here.
      var back = encodeURIComponent(location.pathname + '?buy=' + encodeURIComponent(item));
      location.href = '/login.html?next=' + back;
      return Promise.resolve(false);
    }

    return fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: item, userId: uid || 'guest' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.url) { location.href = d.url; return true; }
        // The server says this item has no link configured yet. Its own message
        // is friendlier and more accurate than anything invented here.
        var msg = (d && d.message) || 'Checkout is not available for this yet.';
        if (opts.onError) opts.onError(msg);
        else console.warn('[checkout] ' + item + ': ' + msg);
        return false;
      })
      .catch(function () {
        var msg = 'Could not reach checkout. Try again in a moment.';
        if (opts.onError) opts.onError(msg);
        else console.warn('[checkout] ' + msg);
        return false;
      });
  }

  /* Wire every [data-checkout] element. Kept as an anchor with a real href so
     it still works as a link if this script fails to load — the href should
     point at /pricing.html, never at Stripe directly. */
  function wire(scope) {
    var els = (scope || document).querySelectorAll('[data-checkout]');
    [].forEach.call(els, function (el) {
      if (el.__shdWired) return;
      el.__shdWired = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var item = el.getAttribute('data-checkout');
        var label = el.textContent;
        el.style.pointerEvents = 'none';
        el.textContent = 'Opening checkout…';
        begin(item, {
          allowGuest: el.hasAttribute('data-allow-guest'),
          onError: function (msg) {
            el.textContent = msg;
            setTimeout(function () {
              el.textContent = label;
              el.style.pointerEvents = '';
            }, 3200);
          },
        }).then(function (going) {
          // On a successful redirect the page is leaving; only restore on failure.
          if (!going) setTimeout(function () {
            el.textContent = label; el.style.pointerEvents = '';
          }, 3200);
        });
      });
    });
  }

  /* Returning from sign-in with a pending purchase resumes it, so a signed-out
     click never silently costs the sale. */
  function resumePending() {
    try {
      var m = /[?&]buy=([^&]+)/.exec(location.search);
      if (m && signedIn()) {
        var item = decodeURIComponent(m[1]);
        history.replaceState(null, '', location.pathname);   // don't re-fire on reload
        begin(item);
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); resumePending(); });
  } else { wire(); resumePending(); }

  root.SHDCheckout = { begin: begin, wire: wire, currentUid: currentUid, signedIn: signedIn };
})(window);
