/* world-shops.js — SHOP STOCK + BUY/SELL (plan S6.1-S6.2). Real store menus for the city's shop interiors.
 *
 *   WorldShops.catalog(type, seed)      -> deterministic stock list (6-12 items) [{id,name,price,kind,perk?,desc}]  (colosseum-vendors-style rows, object form)
 *   WorldShops.create({key,type,seed,day?,storage?,spend?,add?,balance?,inv?})
 *        -> shop { type, day, stock(), qty(id), buy(id), sell(id), owned(), balance(), isBank() }
 *   WorldShops.typeForRecipe(recipe) · typeForMarker(marker) · priceOf(id) · sellPrice(id) · TYPES · SELL_PCT
 *
 * SPARKS IS CLOSED LOOP. buy = ShdSparks.spend (a sink) THEN ShdInv.add. sell = ShdInv.take THEN ShdSparks.add(floor(price*0.4)).
 * There is no other money path: no minting, no value leaves the game. Stock persists per shop key (localStorage) and
 * restocks daily from a date-seeded RNG (WorldRNG mulberry32 + Fisher-Yates only).
 * Item ids reuse world-gadgets.js (radar, binoculars, jetpack, scent), world-gear.js (buckler, tower, aegis, ember-boots, halo, ...)
 * and world-farm.js crops (seed-bean/berry/pepper). Perks use ShdInv perk names (boostBonus, rebuildDiscount, dye).
 */
(function (root) {
  'use strict';
  var RNG = root.WorldRNG || (typeof require !== 'undefined' ? require('./world-rng.js') : null);
  var SELL_PCT = 0.4, STORE_PREFIX = 'shd_shop_v1:';

  function it(id, name, price, kind, desc, perk) { var o = { id: id, name: name, price: price, kind: kind, desc: desc }; if (perk) o.perk = perk; return o; }

  var POOLS = {
    storefront: [
      it('sf-neon-jacket', 'Neon Pulse Jacket', 220, 'apparel', 'Light-piped shell that breathes with your stride.'),
      it('sf-holo-visor', 'Holo Visor', 180, 'apparel', 'A thin projected visor. Pure style.'),
      it('sf-grav-sneakers', 'Gravity Sneakers', 260, 'apparel', 'Soles with a soft magnetic glow.'),
      it('sf-lumen-gloves', 'Lumen Gloves', 120, 'apparel', 'Fingertips that trace light.'),
      it('sf-aero-cape', 'Aero-Weave Cape', 150, 'cosmetic', 'Ultralight cape that ripples in any wind.'),
      it('sf-chroma-dye', 'Chroma Dye: Shaddai Gold', 80, 'cosmetic', 'Tints hover-car bodies gold.', { name: 'dye', value: '#e8c45c' }),
      it('sf-prism-mask', 'Prism Mask', 140, 'cosmetic', 'Splits light into a slow rainbow edge.'),
      it('sf-flux-scarf', 'Flux Scarf', 90, 'apparel', 'Fibre-optic scarf, cool to the touch.'),
      it('sf-halo-pin', 'Halo Pin', 200, 'cosmetic', 'A tiny orbiting ring for your collar.'),
      it('sf-circuit-patch', 'Circuit Skin Patch', 110, 'cosmetic', 'Temporary glowing trace-lines.')
    ],
    techlab: [
      it('radar', 'Radar', 400, 'gadget', 'Shows enemies and your bots around you.'),
      it('binoculars', 'Binoculars', 250, 'gadget', 'Hold to zoom 3.2x.'),
      it('jetpack', 'Jetpack', 1800, 'gadget', 'Hold Space in the air to climb. Recharges on the ground.'),
      it('scent', 'Scent-Away', 60, 'gadget', 'Wolves ignore you for 90 s.'),
      it('tl-fuel-cell', 'Jet Fuel Cell', 120, 'consumable', 'A spare charge for the jetpack.'),
      it('tl-drone-lens', 'Drone Lens', 300, 'gadget', 'Clip-on optic for scouting drones.'),
      it('tl-signal-booster', 'Signal Booster', 220, 'gadget', 'Extends your comms range.'),
      it('tl-nano-patch', 'Nano Repair Patch', 90, 'consumable', 'Self-seals small damage.'),
      it('tl-bot-parts', 'Bot Part Pack', 500, 'perk', 'Cheaper bot rebuilds (-25%).', { name: 'rebuildDiscount', value: 0.25 }),
      it('tl-turbo-core', 'Turbo Core', 700, 'perk', 'Race boosts hit 10% harder.', { name: 'boostBonus', value: 0.1 })
    ],
    forge: [
      it('buckler', 'Pulse Buckler', 150, 'gear', 'Light energy shield. -15% damage.'),
      it('tower', 'Bulwark Plate', 600, 'gear', 'Heavy plate. -30% damage.'),
      it('aegis', 'Aegis Barrier', 1500, 'gear', 'Energy barrier that soaks damage and recharges.'),
      it('ember-boots', 'Ember Boots', 900, 'gear', 'Lava burns 65% slower.'),
      it('fg-plasma-edge', 'Plasma Edge', 450, 'gear', 'A blade of contained plasma.'),
      it('fg-flux-gauntlet', 'Flux Gauntlet', 380, 'gear', 'Servo-assisted grip and strike.'),
      it('fg-pulse-plate', 'Pulse Plate Insert', 260, 'gear', 'Armour insert that dampens impacts.'),
      it('fg-mag-grip', 'Mag-Grip Handle', 140, 'gear', 'Magnetic handle that never slips.'),
      it('fg-ion-core', 'Ion Core', 340, 'gear', 'Power cell for forge-built gear.')
    ],
    bank: [],
    gallery: [
      it('gl-nebula-print', 'Nebula Print', 160, 'art', 'Giclee of a drifting nebula.'),
      it('gl-void-bloom', 'Void Bloom Print', 190, 'art', 'Violet petals on black.'),
      it('gl-circuit-garden', 'Circuit Garden Print', 175, 'art', 'A garden grown from traces.'),
      it('gl-aurora-study', 'Aurora Study Print', 150, 'art', 'Emerald ribbons over ice.'),
      it('gl-holo-frame', 'Holo Frame', 120, 'frame', 'Floating frame with a soft glow.'),
      it('gl-chrome-frame', 'Chrome Frame', 100, 'frame', 'Mirror-bright slim frame.'),
      it('gl-prism-frame', 'Prism Frame', 130, 'frame', 'Edge-lit refractive frame.'),
      it('gl-plasma-frame', 'Plasma Frame', 140, 'frame', 'Slow-moving plasma border.'),
      it('halo', 'Gold Halo', 300, 'cosmetic', 'A ring of light above your head.'),
      it('halo-void', 'Void Halo', 300, 'cosmetic', 'Violet ring.')
    ],
    'farm-market': [
      it('seed-bean', 'Noodle Bean Seeds', 8, 'seed', 'Ready in 5 min.'),
      it('seed-berry', 'Glow-Berry Seeds', 20, 'seed', 'Ready in 10 min.'),
      it('seed-pepper', 'Void-Pepper Seeds', 50, 'seed', 'Ready in 20 min.'),
      it('fm-grow-lamp', 'Grow Lamp Kit', 120, 'kit', 'Full-spectrum lamp for any bed.'),
      it('fm-hydro-mist', 'Hydro-Mist Nozzle', 70, 'kit', 'Fine mist, half the water.'),
      it('fm-nutrient-gel', 'Nutrient Gel', 30, 'consumable', 'One dose of bed feed.'),
      it('fm-soil-probe', 'Soil Probe', 90, 'kit', 'Reads moisture and mineral balance.'),
      it('fm-bio-compost', 'Bio-Compost Brick', 40, 'consumable', 'Slow-release soil boost.'),
      it('fm-pollen-drone', 'Pollen Drone', 260, 'kit', 'Tiny drone that tends blossoms.')
    ]
  };
  // bazaar = a mixed table assembled from the other pools by id
  var BAZAAR_IDS = ['sf-holo-visor', 'sf-flux-scarf', 'scent', 'tl-nano-patch', 'fg-mag-grip', 'gl-chrome-frame', 'seed-bean', 'seed-berry', 'fm-nutrient-gel', 'tl-fuel-cell', 'sf-circuit-patch', 'fm-bio-compost'];
  var BY_ID = {};
  Object.keys(POOLS).forEach(function (t) { POOLS[t].forEach(function (x) { BY_ID[x.id] = x; }); });
  POOLS.bazaar = BAZAAR_IDS.map(function (id) { return BY_ID[id]; });
  var TYPES = Object.keys(POOLS);

  function copy(x) { var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = x[k]; if (x.perk) o.perk = { name: x.perk.name, value: x.perk.value }; return o; }
  function priceOf(id) { return BY_ID[id] ? BY_ID[id].price : 0; }
  function sellPrice(id) { return Math.floor(priceOf(id) * SELL_PCT); }

  // deterministic stock: Fisher-Yates shuffle of the type pool, keep 6-12 items (never more than the pool holds)
  function catalog(type, seed) {
    var pool = POOLS[type]; if (!pool || !pool.length) return [];
    var rng = RNG.create(RNG.hashSeed(type + '|' + seed));
    var shuffled = pool.map(copy);
    rng.shuffle(shuffled);
    var n = Math.min(pool.length, 6 + rng.int(7));
    return shuffled.slice(0, n);
  }

  var RECIPE_TYPE = {
    'storefront-s': 'storefront', 'storefront-l': 'storefront', storefront: 'storefront',
    techlab: 'techlab', forge: 'forge', bank: 'bank', gallery: 'gallery',
    'farm-tower': 'farm-market', 'farm-market': 'farm-market', market: 'bazaar', bazaar: 'bazaar'
  };
  function typeForRecipe(recipe) { return RECIPE_TYPE[String(recipe || '')] || null; }
  // marker → shop type (explicit props first, then marker-name conventions from world-interiors-v3 USE_MARKERS)
  function typeForMarker(m) {
    if (!m) return null;
    var p = m.props || {}, t = typeForRecipe(p.shop_type) || typeForRecipe(p.recipe) || typeForRecipe(m.recipe);
    if (t) return t;
    var n = String(m.name || ''), d = String(m.dashboard_id || p.dashboard_id || '');
    if (/^STALL_FARM_/.test(n) || /^farm\./.test(d)) return 'farm-market';
    if (n === 'BLD_GALLERY_SHOP' || /^SLOT_GALLERY_/.test(n) || /^culture\.gallery/.test(d)) return 'gallery';
    if (n === 'OBJ_SPARKS_KIOSK') return 'bank';
    if (/^STALL_/.test(n)) {
      var s = n.toLowerCase();
      if (/forge/.test(s)) return 'forge';
      if (/tech|lab/.test(s)) return 'techlab';
      if (/bank/.test(s)) return 'bank';
      if (/shop|store|front/.test(s)) return 'storefront';
      return 'bazaar';
    }
    return null;
  }

  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function defaultStorage() {
    try { if (root.localStorage) return root.localStorage; } catch (e) { }
    var mem = {}; return { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
  }

  function create(o) {
    o = o || {};
    var type = o.type, seed = o.seed == null ? o.key : o.seed, key = String(o.key || type), day = o.day || today();
    var store = o.storage || defaultStorage();
    var sp = o.spend || (root.ShdSparks && function (n, k, id) { return root.ShdSparks.spend(n, k, id); });
    var ad = o.add || (root.ShdSparks && function (n, k, id) { return root.ShdSparks.add(n, k, id); });
    var bal = o.balance || (root.ShdSparks && function () { return root.ShdSparks.get(); });
    var inv = o.inv || root.ShdInv;
    var items = catalog(type, seed + '|' + day), qtyMap = {};

    (function load() {
      var j = null; try { j = JSON.parse(store.getItem(STORE_PREFIX + key) || 'null'); } catch (e) { }
      if (j && j.day === day && j.qty) { qtyMap = j.qty; return; }
      var rng = RNG.create(RNG.hashSeed('qty|' + type + '|' + seed + '|' + day));
      items.forEach(function (x) { qtyMap[x.id] = 1 + rng.int(5); });
      save();
    })();
    function save() { try { store.setItem(STORE_PREFIX + key, JSON.stringify({ day: day, qty: qtyMap })); } catch (e) { } }
    function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
    function fail(msg) { return { ok: false, msg: msg }; }

    function buy(id) {
      var x = find(id); if (!x) return fail('Not sold here');
      if ((qtyMap[id] || 0) <= 0) return fail('Sold out until tomorrow');
      if (!sp || !inv) return fail('Shop offline');
      if (!(bal ? bal() >= x.price : true)) return fail('Needs ' + x.price + ' Sparks');
      if (!sp(x.price, 'shop', id)) return fail('Needs ' + x.price + ' Sparks');
      try { inv.add(id, 1); } catch (e) { if (ad) ad(x.price, 'shop-refund', id); return fail('Could not add item. Refunded.'); }   // refund is exactly the price, never more
      qtyMap[id]--; save();
      if (x.perk && inv.setPerk) {
        var cur = inv.perk ? inv.perk(x.perk.name) : undefined;
        if (typeof x.perk.value === 'number') { if (!(typeof cur === 'number' && cur >= x.perk.value)) inv.setPerk(x.perk.name, x.perk.value); }
        else inv.setPerk(x.perk.name, x.perk.value);
      }
      return { ok: true, msg: 'Bought ' + x.name, item: id, price: x.price };
    }
    function sell(id) {
      var base = BY_ID[id]; if (!base) return fail('The shop does not take that');
      if (type === 'bank') return fail('Nothing to sell here');
      if (!inv) return fail('Shop offline');
      var refund = Math.floor(base.price * SELL_PCT);
      if (!inv.take(id, 1)) return fail('You do not own that');
      if (refund > 0 && ad) ad(refund, 'shop-sell', id);
      return { ok: true, msg: 'Sold ' + base.name + ' for ' + refund, item: id, refund: refund };
    }
    function owned() {
      var all = inv && inv.all ? inv.all() : {}, out = [];
      Object.keys(all).forEach(function (id) { if (BY_ID[id] && all[id] > 0) out.push({ id: id, name: BY_ID[id].name, count: all[id], refund: Math.floor(BY_ID[id].price * SELL_PCT) }); });
      return out;
    }
    return {
      type: type, key: key, day: day,
      isBank: function () { return type === 'bank'; },
      stock: function () { return items.map(function (x) { var c = copy(x); c.qty = qtyMap[x.id] || 0; return c; }); },
      qty: function (id) { return qtyMap[id] || 0; },
      buy: buy, sell: sell, owned: owned,
      balance: function () { return bal ? bal() : 0; }
    };
  }

  var api = { catalog: catalog, create: create, typeForRecipe: typeForRecipe, typeForMarker: typeForMarker, priceOf: priceOf, sellPrice: sellPrice, TYPES: TYPES, SELL_PCT: SELL_PCT };
  root.WorldShops = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
