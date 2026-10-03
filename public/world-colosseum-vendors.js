/* world-colosseum-vendors.js — the Colosseum concourse comes alive (2026-09-29): walk the promenade ring (inside the stadium, outside the arena),
 * step up to any of the 24 kiosks, press E to talk / shop / vend. Items cost Sparks (closed-loop), stored locally (dev) until economy-service inventory.
 *   window.COLOSSEUM_KIOSKS (set by world-colosseum.js) = [{x,z,yaw,nx,nz}] in island metres; world = island + local * U.
 * Vendors: Snack Bar, Drinks, Gear (hover decals), Mounts (opens the Mount Store), Cosmetics, Wager Desk (spectate wagers - Sparks only).
 */
(function (root) {
  'use strict';
  var KEY = 'shd_vend_v1', VEND = [
    { id: 'snack', name: 'Spark Noodle Bar', hi: 'Fresh bowls - eat in the stands!', items: [['Spark Noodles', 15, 'You feel rested (+stamina buff)'], ['Ember Skewer', 20, 'Warm and crunchy'], ['Nebula Nachos', 30, 'Share with the crowd!']] },
    { id: 'drink', name: 'Void Fizz Vending', hi: 'Ice cold. Zero cash - Sparks only.', items: [['Void Fizz', 10, 'Fizzing'], ['Aurora Tea', 15, 'Calm focus'], ['Mecha-Mule', 25, 'Kick included']] },
    { id: 'gear', name: 'Hoverskate Gear', hi: 'Decals and trim for your board.', items: [['Neon Deck Decal', 60, 'Applied to your board'], ['Flame Trail Kit', 120, 'Trail unlocked'], ['Grip Tape: Gold', 45, 'Shiny']] },
    { id: 'mount', name: 'Mount Dealer', hi: 'Bulls, mammoths, gorillas... and hawks that fly.', mountStore: true, items: [] },
    { id: 'cosm', name: 'Cosmetics Boutique', hi: 'Dye, capes, halos. Show your colors.', items: [['Shaddai Gold Dye', 80, 'Dye added to wardrobe'], ['Arena Cape', 150, 'Cape added'], ['Halo Ring', 200, 'Halo added']] },
    { id: 'wager', name: 'Wager Desk', hi: 'Back your champion. Sparks only, no cash-out.', items: [['Bet 25 on Red corner', 25, 'Bet placed (settles after the bout)'], ['Bet 25 on Blue corner', 25, 'Bet placed (settles after the bout)'], ['Bet 100 on the Upset', 100, 'Bold. Bet placed']] }
  ];
  var S = (function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { inv: [] }; } catch (e) { return { inv: [] }; } })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); else if (root.__toast) root.__toast(m); }
  var pnl = null, tip = null, cur = -1;
  function spend(n, id) { return root.ShdSparks ? root.ShdSparks.spend(n, 'colo-vendor', id) : false; }
  function close() { if (pnl) { pnl.remove(); pnl = null; } }
  function open(i) {
    close(); var v = VEND[i % VEND.length];
    if (v.mountStore) { if (root.__mountRide) root.__mountRide.panel(true); else toast('Mount store loading...'); return; }
    pnl = document.createElement('div'); pnl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9999;width:340px;background:rgba(6,8,11,.95);border:1px solid #e8c45c;border-radius:12px;padding:14px;color:#dfe9e4;font:13px system-ui;box-shadow:0 0 30px rgba(232,196,92,.25)';
    var h = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-weight:700"><span>' + v.name + '</span><span data-x="1" style="cursor:pointer">x</span></div><div style="opacity:.75;margin:4px 0 8px">&ldquo;' + ((root.WorldCopy && root.WorldCopy.pick('vendors.' + v.id)) || v.hi) + '&rdquo;</div>';
    v.items.forEach(function (it, k) { h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #1d2a26"><span>' + it[0] + '<br><small style="opacity:.6">' + it[1] + ' Sparks</small></span><button data-k="' + k + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 10px;cursor:pointer">Buy</button></div>'; });
    pnl.innerHTML = h; document.body.appendChild(pnl);
    pnl.addEventListener('click', function (e) {
      var t = e.target; if (t.getAttribute('data-x')) return close(); var k = t.getAttribute('data-k'); if (k == null) return; var it = v.items[+k];
      if (!spend(it[1], v.id + ':' + it[0])) return toast('Not enough Sparks (' + it[1] + ')');
      S.inv.push({ v: v.id, item: it[0], at: Date.now() }); save(); var bid = root.WorldBuffs && root.WorldBuffs.fromItem(it[0]); if (bid) root.WorldBuffs.add(bid); toast(it[0] + ' - ' + it[2] + (bid ? '  [' + root.WorldBuffs.DEFS[bid].name + ': ' + root.WorldBuffs.DEFS[bid].note + ']' : ''));
    });
  }
  function poll() {
    var K = root.COLOSSEUM_KIOSKS, I = root.COLOSSEUM_ISLAND, P = root.__w3dDebug && root.__w3dDebug.playerPos; if (!K || !I || !P) return;
    var lx = (P.x - I.x) / I.U, lz = (P.z - I.z) / I.U, best = -1, bd = 3.6 * 3.6;
    if (Math.abs(lx) < 400 && Math.abs(lz) < 400) for (var i = 0; i < K.length; i++) { var dx = lx - K[i].x, dz = lz - K[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    if (best !== cur) { cur = best; if (!tip) { tip = document.createElement('div'); tip.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:9998;background:rgba(6,8,11,.85);border:1px solid #00ff9c;color:#00ff9c;padding:6px 14px;border-radius:20px;font:13px system-ui;display:none'; document.body.appendChild(tip); }
      if (best < 0) { tip.style.display = 'none'; close(); } else { tip.textContent = 'E - ' + VEND[best % VEND.length].name; tip.style.display = 'block'; } }
  }
  if (typeof document !== 'undefined') {
    setInterval(poll, 200);
    addEventListener('keydown', function (e) { if (e.code === 'KeyE' && cur >= 0 && !e.repeat && !(root.__mountRide && root.__mountRide.isRiding())) { e.stopImmediatePropagation(); e.preventDefault(); open(cur); } }, true);
  }
  root.ColoVendors = { VEND: VEND, inventory: function () { return S.inv.slice(); }, open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
