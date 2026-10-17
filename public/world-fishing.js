/* world-fishing.js — FISHING rules (pure, no DOM). Species table and length-weight / value model adapted from "Tidewater" (MIT, (c) 2026 DRG Software Solutions LLC; see docs/CREDITS-THIRD-PARTY.md),
 * extended with realm species (arctic, river, void) and wired to our loops: caught fish become lures (raw-fish -> dragon taming), gifts for friend bots, and Sparks (closed-loop) at the fish stand.
 *   WorldFishing.SPECIES · RODS · fishLengthCm(id, kg) · fishValue(id, kg)
 *   rollBite(water, hour, realm, rng, rod) -> species id | null     water: 'shallows'|'reef'|'pier'|'bay'|'deep'; hour 0..24; realm: 'coast'|'arctic'|'river'|'void'
 *   rollWeight(id, rng) -> kg   (skewed small)
 *   createFight(id, kg, rodTier, rng) -> { step(dt, reeling) -> {state, tension, dist, stamina} }   states: fighting | caught | broke | escaped
 *   rewards(id, kg, rng) -> { sparks, items:{ 'raw-fish': n, pearl?, ... }, length_cm, kg }
 * Fight: hold to reel (tension up, line in), release to ease (tension down). Keep tension in the GREEN band to tire the fish; > 0.95 for 0.6 s snaps the line; < 0.08 for 1.4 s lets it go.
 */
(function (root) {
  'use strict';
  var T = function (a, b) { return [a, b]; };
  // lw: W(g) = a * L(cm)^b ; kg:[min,max] ; price: Sparks per kg ; fight 0..1 ; stamina s ; time: day|dawnDusk|night|any ; rarity 0..1 ; realms
  var SPECIES = {
    silverside: { name: 'Hardhead Silverside', lw: T(0.0074, 3.1), habitat: { shallows: 1, pier: 0.6, bay: 0.2 }, kg: T(0.02, 0.08), price: 3, fight: 0.1, stamina: 1.5, time: 'day', rarity: 1, realms: ['coast'] },
    mullet: { name: 'Striped Mullet', lw: T(0.0112, 2.98), habitat: { shallows: 1, pier: 0.4 }, kg: T(0.4, 2.2), price: 5, fight: 0.3, stamina: 5, time: 'day', rarity: 0.9, realms: ['coast'] },
    grunt: { name: 'Bluestriped Grunt', lw: T(0.0145, 3.06), habitat: { pier: 1, reef: 0.8, bay: 0.2 }, kg: T(0.3, 1.2), price: 7, fight: 0.25, stamina: 4, time: 'any', rarity: 0.9, realms: ['coast'] },
    yellowtail: { name: 'Yellowtail Snapper', lw: T(0.0137, 2.98), habitat: { reef: 1, pier: 0.4, bay: 0.4 }, kg: T(0.4, 1.6), price: 12, fight: 0.4, stamina: 6, time: 'any', rarity: 0.7, realms: ['coast'] },
    hogfish: { name: 'Hogfish', lw: T(0.0151, 3.07), habitat: { reef: 0.8, bay: 0.3 }, kg: T(0.5, 4), price: 16, fight: 0.35, stamina: 6, time: 'day', rarity: 0.5, realms: ['coast'] },
    jack: { name: 'Crevalle Jack', lw: T(0.02, 2.93), habitat: { shallows: 0.5, pier: 0.7, bay: 0.8 }, kg: T(1, 9), price: 6, fight: 0.75, stamina: 12, time: 'dawnDusk', rarity: 0.5, realms: ['coast'] },
    grouper: { name: 'Nassau Grouper', lw: T(0.0107, 3.07), habitat: { reef: 0.6, deep: 0.6 }, kg: T(3, 14), price: 15, fight: 0.6, stamina: 12, time: 'any', rarity: 0.35, realms: ['coast'] },
    tuna: { name: 'Blackfin Tuna', lw: T(0.0145, 3.0), habitat: { deep: 1 }, kg: T(3, 14), price: 16, fight: 0.85, stamina: 16, time: 'dawnDusk', rarity: 0.5, realms: ['coast'] },
    tarpon: { name: 'Tarpon', lw: T(0.0077, 3.02), habitat: { pier: 0.35, bay: 0.5, shallows: 0.15 }, kg: T(10, 45), price: 4, fight: 1, stamina: 24, time: 'night', rarity: 0.15, realms: ['coast'] },
    // ── ours: realm fish ──
    arcticChar: { name: 'Arctic Char', lw: T(0.0092, 3.05), habitat: { shallows: 1, bay: 0.7, pier: 0.5 }, kg: T(0.4, 5), price: 14, fight: 0.45, stamina: 7, time: 'any', rarity: 0.8, realms: ['arctic'] },
    iceCod: { name: 'Ice Cod', lw: T(0.0089, 3.1), habitat: { bay: 0.8, deep: 0.9 }, kg: T(1, 12), price: 13, fight: 0.55, stamina: 10, time: 'any', rarity: 0.6, realms: ['arctic'] },
    glacierPike: { name: 'Glacier Pike', lw: T(0.0035, 3.15), habitat: { deep: 0.7, bay: 0.4 }, kg: T(4, 22), price: 20, fight: 0.8, stamina: 18, time: 'night', rarity: 0.2, realms: ['arctic'] },
    riverTrout: { name: 'River Trout', lw: T(0.0121, 3.0), habitat: { shallows: 1, pier: 0.8 }, kg: T(0.3, 3), price: 10, fight: 0.4, stamina: 5, time: 'dawnDusk', rarity: 0.9, realms: ['river'] },
    goldenCarp: { name: 'Golden Carp', lw: T(0.0151, 3.02), habitat: { shallows: 0.8, bay: 0.8 }, kg: T(1, 14), price: 18, fight: 0.5, stamina: 11, time: 'day', rarity: 0.3, realms: ['river'] },
    voidEel: { name: 'Void Eel', lw: T(0.0009, 3.2), habitat: { deep: 1, bay: 0.5 }, kg: T(1, 8), price: 30, fight: 0.9, stamina: 16, time: 'night', rarity: 0.25, realms: ['void'], drops: { 'void-dust': 0.12 } },
    starFin: { name: 'Star-Fin', lw: T(0.012, 3.0), habitat: { shallows: 0.8, bay: 1, deep: 0.5 }, kg: T(0.2, 2), price: 22, fight: 0.35, stamina: 5, time: 'night', rarity: 0.5, realms: ['void'] }
  };
  var RODS = { 1: { name: 'Hand Line', strength: 1, reel: 1, bite: 1 }, 2: { name: 'Spinning Rod', strength: 1.25, reel: 1.2, bite: 1.15 }, 3: { name: 'Carbon Rod', strength: 1.6, reel: 1.45, bite: 1.35 }, 4: { name: 'Master Rod', strength: 2.1, reel: 1.8, bite: 1.6 } };
  var GREEN = [0.35, 0.7];
  function fishLengthCm(id, kg) { var s = SPECIES[id]; return Math.pow(Math.max(kg, 0.001) * 1000 / s.lw[0], 1 / s.lw[1]); }
  function fishValue(id, kg) { var f = SPECIES[id], t = (kg - f.kg[0]) / Math.max(f.kg[1] - f.kg[0], 1e-6); return Math.max(1, Math.round(f.price * kg * (1 + 0.25 * Math.max(0, t - 0.7) / 0.3))); }
  function timeK(time, hour) { var night = hour < 5.5 || hour >= 19.5, dd = (hour >= 4.5 && hour < 7.5) || (hour >= 17 && hour < 20); if (time === 'any') return 1; if (time === 'day') return (!night && !dd) ? 1 : (dd ? 0.5 : 0.1); if (time === 'night') return night ? 1 : (dd ? 0.4 : 0.08); return dd ? 1 : 0.35; }   // dawnDusk
  function rollBite(water, hour, realm, rng, rod) {
    var r = RODS[rod] || RODS[1], list = [], total = 0, id;
    for (id in SPECIES) { var s = SPECIES[id]; if (s.realms.indexOf(realm) < 0) continue; var w = (s.habitat[water] || 0) * s.rarity * timeK(s.time, hour); if (w > 0) { list.push([id, w]); total += w; } }
    if (!total) return null; if (rng() > Math.min(0.95, (0.2 + 0.8 * Math.min(1, total)) * (0.6 + 0.4 * r.bite))) return null;   // sometimes nothing bites; the right hour/water and better rods bite more
    var pick = rng() * total; for (var i = 0; i < list.length; i++) { pick -= list[i][1]; if (pick <= 0) return list[i][0]; } return list[list.length - 1][0];
  }
  function rollWeight(id, rng) { var s = SPECIES[id], u = Math.pow(rng(), 2.2); return +(s.kg[0] + (s.kg[1] - s.kg[0]) * u).toFixed(3); }   // skewed: most fish are small
  function createFight(id, kg, rodTier, rng) {
    var s = SPECIES[id], rod = RODS[rodTier] || RODS[1], sizeK = 0.7 + 0.6 * ((kg - s.kg[0]) / Math.max(s.kg[1] - s.kg[0], 1e-6)), S = { tension: 0.45, dist: 1, stamina: s.stamina * sizeK, surge: 0, nextSurge: 0.8 + rng() * 1.5, hi: 0, lo: 0, state: 'fighting', t: 0 };
    return { step: function (dt, reeling) {
      if (S.state !== 'fighting') return out(); S.t += dt;
      S.nextSurge -= dt; if (S.nextSurge <= 0) { S.surge = 0.35 + s.fight * 0.65; S.nextSurge = (1.6 - s.fight) + rng() * 1.8; }   // the fish runs
      var surgeNow = S.surge; S.surge = Math.max(0, S.surge - dt * 1.2);
      var pull = (0.1 + 0.9 * s.fight * sizeK * (0.4 + surgeNow)) / rod.strength;                       // line load from the fish (stronger rods carry more)
      S.tension += ((reeling ? 0.55 * rod.reel : -0.45) * dt) + (pull - 0.25) * dt * 1.4; S.tension = Math.max(0, Math.min(1.1, S.tension));
      var inGreen = S.tension >= GREEN[0] && S.tension <= GREEN[1];
      if (inGreen) S.stamina -= dt;                                                                       // good pressure tires it
      if (reeling && S.tension < 0.9) S.dist = Math.max(0, S.dist - dt * (0.07 * rod.reel) * (S.stamina < s.stamina * 0.5 ? 1.8 : (surgeNow > 0.2 ? 0.2 : 0.8)));
      else if (surgeNow > 0.2) S.dist = Math.min(1, S.dist + dt * 0.1 * s.fight);
      S.hi = S.tension > 0.95 ? S.hi + dt : Math.max(0, S.hi - dt); S.lo = S.tension < 0.08 ? S.lo + dt : Math.max(0, S.lo - dt);
      if (S.hi > 0.6) S.state = 'broke'; else if (S.lo > 1.4) S.state = 'escaped'; else if (S.stamina <= 0 && S.dist <= 0.02) S.state = 'caught';
      else if (S.stamina <= 0 && reeling) S.dist = Math.max(0, S.dist - dt * 0.2);                       // a tired fish just comes in
      return out(); }, state: function () { return out(); } };
    function out() { return { state: S.state, tension: S.tension, dist: S.dist, stamina: Math.max(0, S.stamina), green: GREEN, surging: S.surge > 0.2 }; }
  }
  function rewards(id, kg, rng) {
    var s = SPECIES[id], items = { 'raw-fish': Math.max(1, Math.round(kg / 2)) }; if (rng() < 0.02) items.pearl = 1; if (s.realms.indexOf('river') >= 0 && rng() < 0.06) items['river-glass'] = 1;
    for (var k in (s.drops || {})) if (rng() < s.drops[k]) items[k] = (items[k] || 0) + 1;
    return { sparks: fishValue(id, kg), items: items, length_cm: Math.round(fishLengthCm(id, kg) * 10) / 10, kg: kg, name: s.name };
  }
  root.WorldFishing = { SPECIES: SPECIES, RODS: RODS, GREEN: GREEN, fishLengthCm: fishLengthCm, fishValue: fishValue, rollBite: rollBite, rollWeight: rollWeight, createFight: createFight, rewards: rewards, timeK: timeK };
})(typeof window !== 'undefined' ? window : globalThis);
