/* SHADDAI V119 — PER-USER BROWSER DATA. Some things the dashboard remembers in the browser belong to ONE person: office decor and
   posters, the wallet address typed into the office, chat history with the council, the Sparks display, the agent draft in the Forge,
   and whether the setup wizard has been completed (so a brand-new account on a used device still gets its own wizard).
   On a shared device the next person to sign in must not inherit them. This stores those keys under "<key>::<user id>" so signing in
   as someone else switches the data and signing out leaves nothing of theirs behind for the next visitor.
   It loads first (before anything reads storage). Account data itself lives on the server and is always scoped to the signed-in session. */
(function () {
  'use strict';
  if (window.__shdUserShim) return; window.__shdUserShim = true;
  var PER_USER = /^(shd_o3_room|shd_o3_sol|shd_o3_hl|shd_o3_screens|shd_chat2_|shd_lead_agent|shd_world_snapshot_v1|shd_inv_v1|shd_forge_demo_agent_v1|shd_sparks|shaddai\.sparks|shaddai\.econ|shaddai_onboarded|shd_onboarded|shd_holo_seen|shd_name|shd_displayName|shd_focus)/;
  var proto = Storage.prototype, get = proto.getItem, set = proto.setItem, del = proto.removeItem, ls;
  try { ls = window.localStorage; } catch (e) { return; }
  function who() { try { return get.call(ls, 'shd_userid') || 'anon'; } catch (e) { return 'anon'; } }
  function scoped(store, key) { return (store === ls && typeof key === 'string' && PER_USER.test(key) && key.indexOf('::') < 0) ? key + '::' + who() : key; }
  proto.getItem = function (key) { return get.call(this, scoped(this, key)); };
  proto.setItem = function (key, value) { return set.call(this, scoped(this, key), value); };
  proto.removeItem = function (key) { return del.call(this, scoped(this, key)); };
  window.shdUserKeyPattern = PER_USER;
})();
