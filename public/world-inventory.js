/* world-inventory.js — tiny shared INVENTORY + PERKS store used by the offices, farm, arcade and vendors (localStorage 'shd_inv_v1'; production = economy-service inventory).
 *   ShdInv.get(item) · add(item, n) · take(item, n) -> bool · all() · perk(name) / setPerk(name, value) · onChange(fn)
 * Perks are small flags other systems read: boostBonus (race turbo +%), insured:{mountId:true}, dye:'#hex', rebuildDiscount (bots).
 */
(function (root) {
  'use strict';
  var KEY = 'shd_inv_v1', S = (function () { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.items) return j; } catch (e) { } return { items: {}, perks: {} }; })(), cbs = [];
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } cbs.forEach(function (f) { try { f(); } catch (e) { } }); }
  root.ShdInv = {
    get: function (k) { return S.items[k] || 0; }, add: function (k, n) { n = Math.round(n) || 0; if (!n) return S.items[k] || 0; S.items[k] = Math.max(0, (S.items[k] || 0) + n); if (!S.items[k]) delete S.items[k]; save(); return S.items[k] || 0; },
    take: function (k, n) { n = Math.round(n) || 1; if ((S.items[k] || 0) < n) return false; S.items[k] -= n; if (!S.items[k]) delete S.items[k]; save(); return true; },
    all: function () { return JSON.parse(JSON.stringify(S.items)); }, perk: function (k) { return S.perks[k]; }, setPerk: function (k, v) { S.perks[k] = v; save(); }, onChange: function (f) { cbs.push(f); }, _reset: function () { S = { items: {}, perks: {} }; save(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
