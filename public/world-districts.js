/* world-districts.js — DISTRICT IDENTITY for The Grid (pure data + lookups; the plan file stays untouched).
 * City Brief v2: Campus NE · Commons SE · Plots SW · Race NW. Each district has its own accent colour, facade palette, building roles and street names,
 * so the city stops being 983 identical towers and every street says where you are.
 *   WorldDistricts.at(xM, yM)          -> district {id,name,...}   (metres, X east, Y north, same frame as grid-city-v4.json)
 *   WorldDistricts.accentFor(b)        -> 'teal'|'emerald'|'gold'  the building's accent (spires stay gold)
 *   WorldDistricts.tintFor(b, rnd)     -> 0xRRGGBB   a facade tint from the district palette (rnd() in [0,1))
 *   WorldDistricts.roleFor(b)          -> 'office'|'shop'|'home'|'hall'|'arcade'|'race'|'landmark'  what the building is FOR
 *   WorldDistricts.streetAt(xM, yM)    -> 'Campus Avenue' / 'Inner Ring'  nearest named street (avenues every 30 deg, rings at 576 and 992 m)
 */
(function (root) {
  'use strict';
  var DISTRICTS = [
    { id: 'campus',  name: 'Campus',  c0: 0,   c1: 90,  accent: 'teal',    tints: [0xe4eaef, 0xd3dbe2, 0xc2ccd6, 0xaebccb], blurb: 'Academy, library and the council offices',
      roles: { tower: 'office', terrace: 'home', podium: 'shop', hall: 'hall', spire: 'landmark' } },
    { id: 'commons', name: 'Commons', c0: 90,  c1: 180, accent: 'gold',    tints: [0xe9e3d8, 0xdad0bd, 0xc9bfa9, 0xe4eaef], blurb: 'Market, community hall, fishing and farms',
      roles: { tower: 'home', terrace: 'home', podium: 'shop', hall: 'hall', spire: 'landmark' } },
    { id: 'plots',   name: 'Plots',   c0: 180, c1: 270, accent: 'emerald', tints: [0xaebccb, 0xc2ccd6, 0xd3dbe2, 0xcfd9cf], blurb: 'Homes and owned land',
      roles: { tower: 'home', terrace: 'home', podium: 'shop', hall: 'hall', spire: 'landmark' } },
    { id: 'race',    name: 'Race',    c0: 270, c1: 360, accent: 'emerald', tints: [0x2c343d, 0x3b4550, 0xc2ccd6, 0xe4eaef], blurb: 'Hover quarter, park and the arcade strip',
      roles: { tower: 'office', terrace: 'arcade', podium: 'race', hall: 'arcade', spire: 'landmark' } }
  ];
  var STREETS = ['North', 'NNE', 'ENE', 'East', 'ESE', 'SSE', 'South', 'SSW', 'WSW', 'West', 'WNW', 'NNW'];   // 12 avenues, one every 30 degrees
  var RINGS = [{ r: 576, name: 'Inner Ring' }, { r: 992, name: 'Outer Ring' }, { r: 1600, name: 'Grid Edge' }];
  function bearing(x, y) { var d = Math.atan2(x, y) * 180 / Math.PI; return d < 0 ? d + 360 : d; }
  function at(x, y) { var d = bearing(x, y); for (var i = 0; i < DISTRICTS.length; i++) if (d >= DISTRICTS[i].c0 && d < DISTRICTS[i].c1) return DISTRICTS[i]; return DISTRICTS[0]; }
  function accentFor(b) { return b && b.kind === 'spire' ? 'gold' : at(b.x_m, b.y_m).accent; }
  function tintFor(b, rnd) { var t = at(b.x_m, b.y_m).tints; return t[Math.floor(rnd() * t.length) % t.length]; }
  function roleFor(b) { return at(b.x_m, b.y_m).roles[b.kind] || 'office'; }
  function streetAt(x, y) {
    var r = Math.hypot(x, y), best = null, bd = 1e9, i;
    for (i = 0; i < RINGS.length; i++) { var d = Math.abs(r - RINGS[i].r); if (d < bd) { bd = d; best = RINGS[i].name; } }
    var a = bearing(x, y), k = Math.round(a / 30) % 12, off = Math.abs(a - (k === 0 && a > 180 ? 360 : k * 30));
    var da = Math.sin(off * Math.PI / 180) * r;   // metres from the avenue centreline
    if (da < bd) { return at(x, y).name + ' ' + STREETS[k] + ' Avenue'; }
    return best;
  }
  root.WorldDistricts = { DISTRICTS: DISTRICTS, at: at, accentFor: accentFor, tintFor: tintFor, roleFor: roleFor, streetAt: streetAt, bearing: bearing };
})(typeof window !== 'undefined' ? window : globalThis);
