/* world-economy.js — PURE settlement math for Sparks wagers (closed loop: no minting, no cash-out).
 *
 * Never calls ShdSparks; callers move the Sparks. Everything is integer Sparks and CONSERVES value:
 *   sum(payouts) + burn === total staked, always. Rounding remainders go to the burn (a sink), never to anyone's pocket.
 * Mirrors world-race-challenge.js: FEE = 5% of the pot is burned, winner(s) split the rest
 * (ledger labels there: spend 'race-wager', add 'race-win', refund 'race-refund').
 *
 *   var w = WorldEconomy.wager({ stake: 100, n: 3, feePct: 0.05 });   // n = number of racers who staked
 *   w.pot (300), w.burn (15 fee)
 *   w.payout(1)            -> { payouts:[285], burn:15 }        one winner (number of winners or array)
 *   w.payout(2)            -> { payouts:[142,142], burn:16 }    remainder 1 added to burn
 *   WorldEconomy.settle({ stakes:[100,100,100], shares:[0.6,0.25,0.15], feePct:0.05 }) -> { pot, burn, payouts:[...] }
 *   WorldEconomy.refundAll([100,100]) -> { refunds:[100,100], burn:0 }   (push / cancelled)
 */
(function (root) {
  'use strict';
  var FEE = 0.05;
  function int(n) { n = Math.floor(+n); return isFinite(n) && n > 0 ? n : 0; }
  function feeBurn(pot, feePct) {
    var bp = Math.min(10000, Math.max(0, Math.round((feePct == null ? FEE : feePct) * 10000)));
    return Math.floor(pot * bp / 10000);
  }
  // split `dist` by integer weights; floor each, remainder returned for the burn
  function split(dist, weights) {
    var total = 0, i; for (i = 0; i < weights.length; i++) total += weights[i];
    var out = [], used = 0;
    for (i = 0; i < weights.length; i++) {
      var p = total > 0 ? Math.floor(dist * weights[i] / total) : 0;
      out.push(p); used += p;
    }
    return { payouts: out, rem: dist - used };
  }
  function toWeights(shares) { // shares may be fractions: scale to integers so floor math stays exact
    return shares.map(function (s) { s = +s; return isFinite(s) && s > 0 ? Math.round(s * 1e6) : 0; });
  }
  function wager(o) {
    o = o || {};
    var stake = int(o.stake), n = int(o.n), pot = stake * n, fee = feeBurn(pot, o.feePct);
    return {
      pot: pot, burn: fee, stake: stake, n: n,
      payout: function (winners) {
        var w = Array.isArray(winners) ? winners.length : int(winners);
        if (w <= 0) return { payouts: [], burn: pot }; // nobody wins: the pot burns (callers should prefer refundAll)
        var s = split(pot - fee, new Array(w).fill(1));
        return { payouts: s.payouts, burn: fee + s.rem };
      }
    };
  }
  function settle(o) {
    o = o || {};
    var stakes = (o.stakes || []).map(int), pot = 0; stakes.forEach(function (s) { pot += s; });
    var fee = feeBurn(pot, o.feePct), s = split(pot - fee, toWeights(o.shares || []));
    return { pot: pot, burn: fee + s.rem, payouts: s.payouts };
  }
  function refundAll(stakes) { return { refunds: (stakes || []).map(int), burn: 0 }; }
  var api = { FEE: FEE, wager: wager, settle: settle, refundAll: refundAll };
  root.WorldEconomy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
