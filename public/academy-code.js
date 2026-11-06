/* academy-code.js — the Athenaeum sign-in code (2026-11-05, owner: "no sms just in game code from their navi").
 * Navi > ACADEMY shows a 6-digit code that rotates every 10 minutes; athenaeum-class.html asks for it before you take a seat.
 * FOUNDATION ONLY: the code is derived on this device (player id + time window), so it proves "this player has the game open here",
 * not identity. Before classes carry fees or the Colosseum sign-up takes PayBox payments, the server must issue and check codes.
 *   ShdAcademyCode.current() · .check(code) · .secondsLeft() · .uid()
 */
(function (root) {
  'use strict';
  var WIN = 10 * 60 * 1000;
  function uid() { try { var u = localStorage.getItem('shd_uid'); if (!u) { u = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem('shd_uid', u); } return u; } catch (e) { return 'guest'; } }
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function codeAt(t) { return String(fnv(uid() + '|athenaeum|' + Math.floor(t / WIN)) % 1000000).padStart(6, '0'); }
  root.ShdAcademyCode = {
    current: function () { return codeAt(Date.now()); },
    check: function (c) { c = String(c || '').replace(/\D/g, ''); return c.length === 6 && (c === codeAt(Date.now()) || c === codeAt(Date.now() - WIN)); },   // the previous window still counts
    secondsLeft: function () { return Math.ceil((WIN - Date.now() % WIN) / 1000); },
    uid: uid
  };
})(typeof window !== 'undefined' ? window : globalThis);
