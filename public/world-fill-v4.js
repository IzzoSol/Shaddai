/* world-fill-v4.js — MAP v4 (?map=v4) realm FILL: vegetation, rocks, waystations, floating islands, river bridges.
 * 2026-09-26. Follows docs/REALM-FILL-PLAN.md using ONLY assets already in public/assets/models/** (zero spend).
 * See docs/FILL-V4.md for what goes where, counts, perf knobs and the host snippet.
 *
 *   var fill = window.buildWorldFillV4({ THREE, scene, loader, heightAt, isWater, terrainMeta, camera, fill:{...knobs} });
 *   fill.update(t, dt, camPos);  fill.stats();  fill.dispose();
 *
 * Coordinates: terrain.json is metres, X = east, Y = north; compass degrees clockwise from north
 * (X = r·sinθ, Y = r·cosθ). Game units: x = X·U, z = -Y·U, U = units_per_m (7/1.8). heightAt(x,z) is in game units.
 *
 * WHY cells: every species is split into ~CELL-sized spatial cells, each its own InstancedMesh, so three.js
 * frustum-culls whole cells and update() can hide far cells / swap them to a low-poly proxy tree (2-level LOD).
 * WHY instanceColor: realm tints (burnt volcano, frosty arctic, teal darkforest) cost zero extra draw calls.
 *
 * The planner (CORE) is pure (no THREE, no DOM) so it runs in node for tests: module.exports = CORE.
 */
(function (root) {
  'use strict';

  // ════════════════════════════════════════ PURE CORE ════════════════════════════════════════
  var D2R = Math.PI / 180;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function norm360(a) { a %= 360; return a < 0 ? a + 360 : a; }
  /** compass (deg, cw from north) of metre point X east / Y north */
  function compassOf(X, Y) { return norm360(Math.atan2(X, Y) / D2R); }
  /** is compass a inside the arc [c0, c1] (clockwise, handles wrap e.g. 344→16) */
  function inArc(a, c0, c1) { a = norm360(a); c0 = norm360(c0); c1 = norm360(c1); return c0 <= c1 ? (a >= c0 && a <= c1) : (a >= c0 || a <= c1); }
  function arcSpan(c0, c1) { return norm360(c1 - c0); }
  function polarToM(compass, r) { return [r * Math.sin(compass * D2R), r * Math.cos(compass * D2R)]; }
  function mToGame(X, Y, U) { return [X * U, -Y * U]; }

  /** realms that sit fully inside another realm's arc (forest inside suburb) are radial sub-realms — not a border */
  function isNested(R, realms) {
    for (var i = 0; i < realms.length; i++) {
      var o = realms[i]; if (o === R) continue;
      if (inArc(R.c0, o.c0, o.c1) && inArc(R.c1, o.c0, o.c1) && arcSpan(o.c0, o.c1) > arcSpan(R.c0, R.c1)) return true;
    }
    return false;
  }
  /** border compasses between consecutive (non-nested) realms, clockwise: [{a, b, compass}] */
  function borders(meta) {
    var rs = (meta.realms || []).filter(function (r) { return !isNested(r, meta.realms); })
      .slice().sort(function (p, q) { return norm360(p.c0) - norm360(q.c0); });   // clockwise; last → first closes the ring
    var out = [];
    for (var i = 0; i < rs.length; i++) {
      var A = rs[i], B = rs[(i + 1) % rs.length];
      var gap = norm360(B.c0 - A.c1); if (gap > 180) gap -= 360;              // overlap → negative
      out.push({ a: A.id, b: B.id, compass: norm360(A.c1 + gap / 2) });
    }
    return out;
  }

  /** which realm CORE (inset by `inset` deg, r0+rPad..r1) the point is in, or null (= wilderness) */
  function realmCoreAt(meta, compass, r, inset, rPad) {
    var rs = meta.realms || [];
    for (var i = 0; i < rs.length; i++) {
      var R = rs[i];
      if (r < R.r0_m + (rPad || 0) || r > R.r1_m) continue;
      if (inArc(compass, R.c0 + inset, R.c1 - inset)) return R.id;
    }
    return null;
  }

  // ── occupancy hash (metres) — discs; insert into every cell the bbox overlaps, query the same way ──
  function Occ(cell) { this.c = cell || 40; this.m = new Map(); }
  Occ.prototype._each = function (x, z, r, fn) {
    var c = this.c, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) if (fn(i + ',' + j) === false) return false;
    return true;
  };
  Occ.prototype.add = function (x, z, r) { var d = { x: x, z: z, r: r }, m = this.m; this._each(x, z, r, function (k) { var a = m.get(k); if (!a) m.set(k, a = []); a.push(d); }); };
  Occ.prototype.hit = function (x, z, r) {
    var m = this.m;
    return this._each(x, z, r, function (k) { var a = m.get(k); if (!a) return; for (var n = 0; n < a.length; n++) { var d = a[n], dx = d.x - x, dz = d.z - z, rr = d.r + r; if (dx * dx + dz * dz < rr * rr) return false; } }) === false;
  };

  function segDist(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay, L = vx * vx + vy * vy, t = L ? (wx * vx + wy * vy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t; var dx = ax + vx * t - px, dy = ay + vy * t - py; return Math.sqrt(dx * dx + dy * dy);
  }
  /** pure water fallback from terrain.json (metres): river corridor or lake disc (+pad) */
  function makeWaterMask(meta, pad) {
    var rivers = [], lakes = [];
    (meta.water || []).forEach(function (w) {
      if (w.type === 'river' && w.path_m && w.path_m.length > 1) {
        var p = w.path_m, bb = [1e9, 1e9, -1e9, -1e9]; p.forEach(function (q) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.min(bb[1], q[1]); bb[2] = Math.max(bb[2], q[0]); bb[3] = Math.max(bb[3], q[1]); });
        rivers.push({ p: p, half: (+w.width_m || 20) / 2 + pad, bb: bb });
      } else if (w.type === 'lake' && w.center_m) lakes.push({ c: w.center_m, r: (+w.radius_m || 100) + pad });
    });
    return function (X, Y) {
      for (var l = 0; l < lakes.length; l++) { var L = lakes[l]; if (Math.hypot(X - L.c[0], Y - L.c[1]) < L.r) return true; }
      for (var i = 0; i < rivers.length; i++) {
        var R = rivers[i], h = R.half;
        if (X < R.bb[0] - h || X > R.bb[2] + h || Y < R.bb[1] - h || Y > R.bb[3] + h) continue;
        for (var s = 0; s + 1 < R.p.length; s++) if (segDist(X, Y, R.p[s][0], R.p[s][1], R.p[s + 1][0], R.p[s + 1][1]) < h) return true;
      }
      return false;
    };
  }

  // ── content table. size = [min,max] metres; mode 'h' = height, 'w' = widest horizontal side.
  //    cls: tree (full model near + procedural proxy far), small (short distance), big (rocks/dunes/portals, far) ──
  var MAPLE = ['mapletree-1', 'mapletree-4', 'mapletree-5'], BIRCH = ['birchtree-1', 'birchtree-4', 'birchtree-5'];
  var DEAD = ['deadtree-5', 'deadtree-6', 'deadtree-7', 'deadtree-9', 'deadtree-10'];
  var FLOWERS = ['flower-1-clump', 'flower-2-clump', 'flower-4-clump', 'bush-flowers', 'bush-small-flowers'];
  var WILD_SMALL = ['bush', 'bush-large', 'grass-large', 'grass-small'];
  // far LOD = procedural proxy trees (CODE, ~40 tris each, built in the runtime) — the lowest-poly Quaternius tree is
  // still 700–1100 tris, and ~3000 far trees in view blew the 1.5M-tri budget (see FILL-V4.md "perf").
  var LOD_LEAFY = 'proxy-leafy', LOD_DEAD = 'proxy-dead', LOD_PALM = 'proxy-palm';
  function isProxy(m) { return /^proxy-/.test(m); }
  function url(model) { return /^(tree|palm|mountain|sand|floating|platform|information|elevator|japanese|sci-fi|portal)/.test(model) ? '/assets/models/kit/' + model + '.glb' : /^prop-/.test(model) ? '/assets/models/fal/' + model + '.glb' : '/assets/models/nature/' + model + '.glb'; }

  function SPECS() {
    return [
      { realm: 'darkforest', n: 1500, cls: 'tree', models: DEAD, far: LOD_DEAD, size: [9, 18], tint: 0x6d7386, space: 7 },
      { realm: 'darkforest', n: 1000, cls: 'tree', models: MAPLE, far: LOD_LEAFY, size: [9, 18], tint: 0x4f7872, space: 7 },
      { realm: 'forest', n: 900, cls: 'tree', models: ['mapletree-4', 'mapletree-4', 'mapletree-1', 'mapletree-5'], far: LOD_LEAFY, size: [10, 16], tint: 0xffffff, space: 7 },
      { realm: 'forest', n: 600, cls: 'tree', models: ['birchtree-4', 'birchtree-4', 'birchtree-1'], far: LOD_LEAFY, size: [10, 16], tint: 0xffffff, space: 7 },
      { realm: 'meadow', n: 1200, cls: 'tree', models: BIRCH, far: LOD_LEAFY, size: [10, 16], tint: 0xfff4f6, space: 9 },
      { realm: 'meadow', n: 2000, cls: 'small', models: FLOWERS, size: [0.5, 1.6], space: 1.6, cluster: [5, 12, 14] },
      { realm: 'suburb', n: 300, cls: 'tree', models: MAPLE, far: LOD_LEAFY, size: [8, 12], tint: 0xffffff, space: 18 },
      { realm: 'ocean', n: 400, cls: 'tree', models: ['palm-tree03'], far: LOD_PALM, size: [9, 13], tint: 0xffffff, space: 6, minAboveWater: 2 },
      { realm: 'arctic', n: 40, cls: 'big', models: ['mountain01', 'mountain05'], size: [40, 120], mode: 'w', tint: 0xe6eef7, space: 0, sink: 0.18 },
      { realm: 'arctic', n: 200, cls: 'tree', models: DEAD, far: LOD_DEAD, size: [7, 14], tint: 0xdfe9f2, space: 10 },
      { realm: 'volcano', n: 30, cls: 'big', models: ['mountain05'], size: [40, 110], mode: 'w', tint: 0x3a2e2a, space: 0, sink: 0.18 },
      { realm: 'volcano', n: 200, cls: 'tree', models: DEAD, far: LOD_DEAD, size: [7, 14], tint: 0x2e2522, space: 10 },
      // 2026-10-11 owner: the black dune blobs in the desert are removed (sand-mount rendered black)
      { realm: 'void', n: 6, cls: 'big', models: ['portal-effect02'], size: [10, 16], mode: 'w', tint: 0xffffff, space: 80, lift: [3, 9] },
      { realm: null, n: 1300, cls: 'small', models: WILD_SMALL, size: [0.6, 1.8], space: 1.8, cluster: [4, 10, 16] },
      { realm: null, n: 700, cls: 'tree', models: ['mapletree-1', 'mapletree-4', 'birchtree-4'], far: LOD_LEAFY, size: [9, 14], tint: 0xffffff, space: 12 },
    ];
  }

  /**
   * plan(meta, heightAtM, opts) — pure, deterministic.
   *   heightAtM(X,Y) → metres; opts: { isWaterM(X,Y), colliders:[{X,Y,r}] (metres), density (×counts, default 1) }
   * returns { items:[{realm,cls,model,far,size,mode,X,Y,ry,tint,sink,lift}], waystations, islands, bridges, counts }
   */
  function plan(meta, heightAtM, opts) {
    opts = opts || {};
    var WL = +meta.water_level_m || 0, UPM = +meta.units_per_m || 7 / 1.8, gridR = +meta.grid_r_m || 1600, ringR = +meta.ring_r_m || 2828, rim = +meta.rim_m || 4800;
    var dens = opts.density != null ? +opts.density : 1;
    var waterMask = makeWaterMask(meta, 6);
    var isWaterM = opts.isWaterM || function () { return false; };
    var stations = (meta.stations || []).map(function (s) { return s.xy_m; });
    var hard = new Occ(80);                       // big no-go discs: colliders, waystations, bridges, rocks
    (opts.colliders || []).forEach(function (c) { hard.add(c.X, c.Y, c.r + 4); });

    function wet(X, Y, h) { return h < WL + 0.5 / UPM || waterMask(X, Y) || isWaterM(X, Y); }
    function slopeOK(X, Y, maxTan) {
      var s = 4, a = heightAtM(X + s, Y) - heightAtM(X - s, Y), b = heightAtM(X, Y + s) - heightAtM(X, Y - s);
      return Math.max(Math.abs(a), Math.abs(b)) / (2 * s) <= maxTan;
    }
    function baseOK(X, Y, r) {
      if (r < gridR + 80 || r > rim - 60) return false;
      if (Math.abs(r - ringR) < 60) return false;
      for (var i = 0; i < stations.length; i++) if (Math.hypot(X - stations[i][0], Y - stations[i][1]) < 60) return false;
      return true;
    }

    // ── 1. waystations: one per border corridor, r ≈ 0.62·rim, flattest spot within ±200 m ──
    var waystations = [];
    borders(meta).forEach(function (B, n) {
      var r0 = 0.62 * rim, c = polarToM(B.compass, r0), best = null;
      for (var dx = -200; dx <= 200; dx += 20) for (var dy = -200; dy <= 200; dy += 20) {
        var X = c[0] + dx, Y = c[1] + dy, r = Math.hypot(X, Y);
        if (Math.abs(r - ringR) < 90 || r < gridR + 120 || r > rim - 150) continue;
        var nearSt = false; for (var s = 0; s < stations.length; s++) if (Math.hypot(X - stations[s][0], Y - stations[s][1]) < 120) nearSt = true;
        if (nearSt) continue;
        var hmin = 1e9, hmax = -1e9, bad = false;
        for (var k = 0; k < 9; k++) {
          var ax = k === 8 ? X : X + 16 * Math.cos(k * Math.PI / 4), ay = k === 8 ? Y : Y + 16 * Math.sin(k * Math.PI / 4), h = heightAtM(ax, ay);
          if (wet(ax, ay, h)) { bad = true; break; }
          if (h < hmin) hmin = h; if (h > hmax) hmax = h;
        }
        if (bad) continue;
        var score = (hmax - hmin) + 0.004 * Math.hypot(dx, dy);
        if (!best || score < best.score) best = { X: X, Y: Y, hmin: hmin, hmax: hmax, score: score };
      }
      if (!best) return;
      // face the Grid: object +Z (game) points toward the origin
      var g = mToGame(best.X, best.Y, 1);
      waystations.push({ n: n + 1, border: B.a + '|' + B.b, compass: +B.compass.toFixed(1), X: best.X, Y: best.Y, relief_m: +(best.hmax - best.hmin).toFixed(2), ry: Math.atan2(-g[0], -g[1]) });
      hard.add(best.X, best.Y, 30);
    });

    // ── 2. floating islands over each lake ──
    var rI = mulberry32(hashStr('islands')), islands = [];
    (meta.water || []).forEach(function (w) {
      if (w.type !== 'lake' || !w.center_m) return;
      islands.push({ X: w.center_m[0], Y: w.center_m[1], level_m: w.level_m != null ? +w.level_m : WL, alt_m: 60 + rI() * 60, size_m: 40 + rI() * 30, ry: rI() * Math.PI * 2, phase: rI() * Math.PI * 2 });
    });

    // ── 3. river bridges where each river crosses r = 0.55·rim ──
    var bridges = [], rB = 0.55 * rim;
    (meta.water || []).forEach(function (w, wi) {
      if (w.type !== 'river' || !w.path_m || w.path_m.length < 2) return;
      var p = w.path_m;
      for (var s = 0; s + 1 < p.length; s++) {
        var ra = Math.hypot(p[s][0], p[s][1]), rb = Math.hypot(p[s + 1][0], p[s + 1][1]);
        if ((ra - rB) * (rb - rB) > 0) continue;
        var t = (rB - ra) / ((rb - ra) || 1), X = p[s][0] + (p[s + 1][0] - p[s][0]) * t, Y = p[s][1] + (p[s + 1][1] - p[s][1]) * t;
        var dX = p[s + 1][0] - p[s][0], dY = p[s + 1][1] - p[s][1], dl = Math.hypot(dX, dY) || 1; dX /= dl; dY /= dl;
        var len = (+w.width_m || 44) + 20, pX = -dY, pY = dX;                     // across-river unit vector
        var eA = [X + pX * len / 2, Y + pY * len / 2], eB = [X - pX * len / 2, Y - pY * len / 2];
        var g = mToGame(pX, pY, 1);
        bridges.push({ river: wi, X: X, Y: Y, len_m: len, width_m: +w.width_m || 44, acrossX: pX, acrossY: pY, ryAcross: Math.atan2(g[0], g[1]),
          bankA_m: heightAtM(eA[0], eA[1]), bankB_m: heightAtM(eB[0], eB[1]), level_m: w.level_m != null ? +w.level_m : WL });
        hard.add(X, Y, len / 2 + 15);
        break;
      }
    });

    // ── 4. vegetation / rocks ──
    var items = [], counts = {}, soft = new Occ(24);
    SPECS().forEach(function (S, si) {
      var rnd = mulberry32(hashStr((S.realm || 'wild') + ':' + si)), want = Math.round(S.n * dens), got = 0;
      var R = S.realm ? (meta.realms || []).filter(function (x) { return x.id === S.realm; })[0] : null;
      if (S.realm && !R) return;
      var c0, span, rMin, rMax;
      if (R) { c0 = R.c0 + 6; span = arcSpan(R.c0, R.c1) - 12; rMin = Math.max(R.r0_m + 30, gridR + 80); rMax = Math.min(R.r1_m, rim) - 60; }
      else { c0 = 0; span = 360; rMin = gridR + 80; rMax = rim - 60; }
      if (span <= 0 || rMax <= rMin) return;
      var tries = want * (S.realm === 'ocean' ? 60 : 30), cl = S.cluster, pendingSeed = null, pendingLeft = 0;
      var maxTan = S.cls === 'big' ? 0.9 : 0.7;   // 35° (rocks may sit on steeper ground)
      while (got < want && tries-- > 0) {
        var X, Y;
        if (cl && pendingLeft > 0) {                 // cluster member around the seed point
          var a2 = rnd() * Math.PI * 2, d2 = Math.sqrt(rnd()) * cl[2]; X = pendingSeed[0] + Math.cos(a2) * d2; Y = pendingSeed[1] + Math.sin(a2) * d2; pendingLeft--;
        } else {
          var cmp = c0 + rnd() * span, r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin)), q = polarToM(cmp, r); X = q[0]; Y = q[1];
          if (cl) { pendingSeed = [X, Y]; pendingLeft = cl[0] + Math.floor(rnd() * (cl[1] - cl[0])); }
        }
        var rr = Math.hypot(X, Y), cc = compassOf(X, Y);
        if (!baseOK(X, Y, rr)) continue;
        var core = realmCoreAt(meta, cc, rr, 6, 30);
        if (S.realm ? core !== S.realm : core !== null) continue;
        var h = heightAtM(X, Y);
        if (!isFinite(h) || wet(X, Y, h)) continue;
        if (S.minAboveWater && h < WL + S.minAboveWater) continue;
        if (!slopeOK(X, Y, maxTan)) continue;
        var size = S.size[0] + rnd() * (S.size[1] - S.size[0]);
        var foot = S.cls === 'big' ? size * 0.45 : S.space;
        if (hard.hit(X, Y, S.cls === 'big' ? foot : 2)) continue;
        if (S.cls !== 'big' && soft.hit(X, Y, S.space / 2)) continue;
        if (S.cls === 'big') hard.add(X, Y, foot); else soft.add(X, Y, S.space / 2);
        items.push({ realm: S.realm || 'wild', cls: S.cls, model: S.models[Math.floor(rnd() * S.models.length)], far: S.far || null, size: size, mode: S.mode || 'h',
          X: X, Y: Y, ry: rnd() * Math.PI * 2, tint: S.tint != null ? S.tint : 0xffffff, sink: S.sink || 0, lift: S.lift ? S.lift[0] + rnd() * (S.lift[1] - S.lift[0]) : 0 });
        got++;
      }
      var key = S.realm || 'wild'; counts[key] = (counts[key] || 0) + got;
    });
    return { items: items, waystations: waystations, islands: islands, bridges: bridges, counts: counts };
  }

  var CORE = { mulberry32: mulberry32, hashStr: hashStr, compassOf: compassOf, inArc: inArc, polarToM: polarToM, mToGame: mToGame,
    borders: borders, realmCoreAt: realmCoreAt, makeWaterMask: makeWaterMask, plan: plan, url: url, isProxy: isProxy, Occ: Occ, isNested: isNested };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (!root) return;
  root.__fillV4Core = CORE;

  // ════════════════════════════════════════ RUNTIME (THREE) ════════════════════════════════════════
  root.buildWorldFillV4 = function (opts) {
    opts = opts || {};
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt, meta = opts.terrainMeta, camera = opts.camera;
    if (!THREE || !scene || !loader || !heightAt || !meta) { console.warn('[fill-v4] missing THREE/scene/loader/heightAt/terrainMeta'); return null; }
    // perf knobs (game units). near/small cells are FINE so full-poly trees only render right around the camera;
    // far/big cells are COARSE because a proxy cell is 1–3 draw calls however many trees it holds.
    var K = Object.assign({ cellNear: 900, cellFar: 3600, nearDist: 900, nearMin: 450, farDist: 9000, farMin: 4500, smallDist: 1800,
      bigDist: 16000, shadowDist: 2500, platformSink: 0.3, budgetTris: 1.5e6, budgetDraws: 150, density: 1, tick: 0.2 }, opts.fill || {});
    var nearDef = K.nearDist;
    var U = +meta.units_per_m || 7 / 1.8;
    var isWater = opts.isWater || null;
    var t0 = (root.performance || Date).now();
    var queue = root.__queueLoad || function (l, u, a, b) { l.load(u, a, undefined, b); };
    var rootG = new THREE.Group(); rootG.name = 'world-fill-v4'; scene.add(rootG);

    // colliders already in the layout (game units) → metres, so vegetation keeps clear of placed models
    var L = root.WORLD_LAYOUT, cols = [];
    if (L && Array.isArray(L.realmColliders)) L.realmColliders.forEach(function (c) { if (c && isFinite(c.x) && isFinite(c.z)) cols.push({ X: c.x / U, Y: -c.z / U, r: (+c.r || 0) / U }); });

    var P = plan(meta, function (X, Y) { return heightAt(X * U, -Y * U) / U; }, {
      density: K.density, colliders: cols,
      isWaterM: isWater ? function (X, Y) { try { return !!isWater(X * U, -Y * U); } catch (e) { return false; } } : null,
    });
    var planMs = Math.round((root.performance || Date).now() - t0);
    // 2026-10-11 (owner: "random buildings in random realms with no doors, just models - remove them"): waystation huts and floating islands have no entry. ?fillextras=1 restores.
    // MISSING-BUILDINGS fix (2026-11-11): waystation huts + floating islands build by default now
    // (?fillextras=0 opts out). The old ?fillextras=1 opt-in never worked — raw 0x08 instead of \b.
    if (typeof location !== 'undefined' && /[?&]fillextras=0\b/.test(location.search || '')) { P.waystations = []; P.islands = []; }

    // ── cells: role → grid. near/small on the fine grid, far/big on the coarse grid ──
    var ROLE_GRID = { near: K.cellNear, small: K.cellNear, far: K.cellFar, big: K.cellFar };
    var cells = {}, cellList = [];
    function cellOf(role, x, z) {
      var S = ROLE_GRID[role], i = Math.floor(x / S), j = Math.floor(z / S), k = role + ':' + i + ',' + j, c = cells[k];
      if (!c) {
        var g = new THREE.Group(); g.name = 'fill-' + k; g.visible = false; rootG.add(g);
        c = cells[k] = { key: k, role: role, cx: (i + 0.5) * S, cz: (j + 0.5) * S, R: S * 0.7072, group: g, lists: {}, shad: null };
        cellList.push(c);
      }
      return c;
    }
    // bucket items: cell → model → [item]
    var needModels = {};
    function push(role, model, it) { var c = cellOf(role, it.x, it.z); (c.lists[model] = c.lists[model] || []).push(it); needModels[model] = true; }
    P.items.forEach(function (it) {
      it.x = it.X * U; it.z = -it.Y * U; it.gy = heightAt(it.x, it.z);
      if (it.cls === 'tree') { push('near', it.model, it); push('far', it.far || it.model, it); }
      else push(it.cls, it.model, it);
    });

    // ── model cache: parts + bounds (measured via Box3 after load, like world-realmprops fit()) ──
    var models = {}, loaded = 0, failed = 0, imCount = 0, instTotal = 0, owned = [];
    function onModel(name, sceneObj) {
      sceneObj.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(sceneObj), sz = box.getSize(new THREE.Vector3());
      var parts = []; sceneObj.traverse(function (o) { if (o.isMesh) { parts.push(o); owned.push(o.geometry); } });
      models[name] = { parts: parts, box: box, sz: sz };
      loaded++;
      cellList.forEach(function (c) { if (c.lists[name]) buildBatch(c, name); });
    }
    var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();
    function buildBatch(c, name) {
      var M = models[name], list = c.lists[name]; if (!M || !list || !list.length) return;
      M.parts.forEach(function (part) {
        var im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.name = 'fill-' + c.role + '-' + name; im.castShadow = false; im.receiveShadow = c.role === 'near' || c.role === 'big';
        im.userData.tris = (part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count) / 3;
        list.forEach(function (it, i) {
          var ref = it.mode === 'w' ? Math.max(M.sz.x, M.sz.z) : M.sz.y, k = (it.size * U) / (ref || 1), h = M.sz.y * k;
          _q.setFromAxisAngle(_up, it.ry); _s.set(k, k, k);
          _p.set(it.x, it.gy - M.box.min.y * k - it.sink * h - (it.cls === 'tree' ? 0.3 * U : 0) + it.lift * U, it.z);   // trees sink 0.3 m (roots on slopes)
          _m.compose(_p, _q, _s).multiply(part.matrixWorld);
          im.setMatrixAt(i, _m);
          im.setColorAt(i, _col.setHex(it.tint != null ? it.tint : 0xffffff));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();   // bounds over ALL instances → three.js frustum-culls the whole cell
        c.group.add(im); imCount++;
      });
      instTotal += list.length;
    }

    // ── procedural far-LOD proxies (unit height, base at y=0, vertex-coloured; instanceColor tints per realm).
    //    The shader discards a proxy INSTANCE whose origin is within uFillNear of the camera, so the swap to the
    //    full model is per tree, not per cell: every tree inside nearDist lives in a visible near cell. ──
    var uNear = { value: K.nearDist };
    function proxyGeo(kind) {
      var pieces = [];
      function piece(geo, color, tx, ty, tz, rx, rz) {
        geo = geo.index ? geo.toNonIndexed() : geo;
        if (rx || rz) { geo.rotateX(rx || 0); geo.rotateZ(rz || 0); }
        geo.translate(tx, ty, tz); pieces.push([geo, new THREE.Color(color)]);
      }
      if (kind === 'proxy-leafy') {
        piece(new THREE.CylinderGeometry(0.035, 0.05, 0.45, 5, 1, true), 0x5a4330, 0, 0.225, 0);
        piece(new THREE.IcosahedronGeometry(0.3, 0), 0x3f8a3a, 0, 0.66, 0);
      } else if (kind === 'proxy-palm') {
        piece(new THREE.CylinderGeometry(0.025, 0.04, 0.82, 5, 1, true), 0x7a5a3a, 0, 0.41, 0);
        piece(new THREE.ConeGeometry(0.42, 0.22, 7, 1, true), 0x3d9a44, 0, 0.84, 0);
      } else {   // proxy-dead: trunk + 3 bare branches
        piece(new THREE.CylinderGeometry(0.025, 0.06, 1.0, 5, 1, true), 0x4a3e36, 0, 0.5, 0);
        piece(new THREE.ConeGeometry(0.02, 0.4, 4, 1, true), 0x4a3e36, 0.12, 0.75, 0, 0, -0.9);
        piece(new THREE.ConeGeometry(0.02, 0.35, 4, 1, true), 0x4a3e36, -0.1, 0.68, 0.05, 0.2, 0.9);
        piece(new THREE.ConeGeometry(0.018, 0.3, 4, 1, true), 0x4a3e36, 0.02, 0.62, -0.11, -0.9, 0);
      }
      var n = 0; pieces.forEach(function (p) { n += p[0].attributes.position.count; });
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
      pieces.forEach(function (p) {
        var a = p[0].attributes.position.array; pos.set(a, o * 3);
        for (var v = 0; v < a.length / 3; v++) { col[(o + v) * 3] = p[1].r; col[(o + v) * 3 + 1] = p[1].g; col[(o + v) * 3 + 2] = p[1].b; }
        o += a.length / 3; p[0].dispose();
      });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals(); g.computeBoundingBox();
      return g;
    }
    var proxyMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    proxyMat.onBeforeCompile = function (sh) {
      sh.uniforms.uFillNear = uNear;
      sh.vertexShader = 'varying float vFillD;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
        '#ifdef USE_INSTANCING\n vec4 fillIO = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\n#else\n vec4 fillIO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);\n#endif\n' +
        ' vFillD = length(fillIO.xz - cameraPosition.xz);');
      sh.fragmentShader = 'uniform float uFillNear;\nvarying float vFillD;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', 'if (vFillD < uFillNear) discard;\n#include <clipping_planes_fragment>');
    };
    proxyMat.customProgramCacheKey = function () { return 'fill-v4-proxy'; };
    owned.push(proxyMat);
    Object.keys(needModels).forEach(function (name) {
      if (isProxy(name)) {
        var holder = new THREE.Group(); holder.add(new THREE.Mesh(proxyGeo(name), proxyMat)); onModel(name, holder);
        return;
      }
      queue(loader, url(name), function (g) { onModel(name, g.scene); }, function (err) { failed++; if (failed < 5) console.warn('[fill-v4] failed ' + name + ': ' + (err && (err.message || err))); });
    });

    // ── singles: waystations, islands, bridges (each loads its own clone of the shared GLBs) ──
    var singleCache = {}, singleWait = {};
    function getModel(name, cb) {
      if (singleCache[name]) return cb(singleCache[name]);
      if (singleWait[name]) return singleWait[name].push(cb);
      singleWait[name] = [cb];
      queue(loader, url(name), function (g) { singleCache[name] = g.scene; var w = singleWait[name] || []; singleWait[name] = null; w.forEach(function (f) { try { f(g.scene); } catch (e) { console.warn('[fill-v4] place ' + name + ': ' + e.message); } }); },
        function (err) { failed++; singleWait[name] = null; console.warn('[fill-v4] failed ' + name + ': ' + (err && (err.message || err))); });
    }
    /** clone + scale to `m` metres (widest horizontal side, or height with byH), rotation ry; returns { obj, minY, maxY, sx, sz } at y=0 */
    function sized(src, m, ry, byH) {
      var o = src.clone(true); o.updateMatrixWorld(true);             // measure UNrotated (a turned AABB overstates width)
      var box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3());
      o.scale.multiplyScalar((m * U) / ((byH ? sz.y : Math.max(sz.x, sz.z)) || 1)); o.rotation.y = ry || 0; o.updateMatrixWorld(true);
      box.setFromObject(o);
      return { obj: o, minY: box.min.y, maxY: box.max.y, box: box };
    }
    function local(ws, lx, lz) { var c = Math.cos(ws.ry), s = Math.sin(ws.ry), x = ws.x + lx * c + lz * s, z = ws.z - lx * s + lz * c; return [x, z]; }

    var wsGroups = [], colliderRefs = [];
    P.waystations.forEach(function (ws) {
      ws.x = ws.X * U; ws.z = -ws.Y * U;
      var grp = new THREE.Group(); grp.name = 'fill-waystation-' + ws.n; rootG.add(grp); wsGroups.push(grp);
      var hs = []; for (var k = 0; k < 9; k++) { var a = k * Math.PI / 4, q = k === 8 ? [ws.x, ws.z] : [ws.x + 6.2 * U * Math.cos(a), ws.z + 6.2 * U * Math.sin(a)]; hs.push(heightAt(q[0], q[1])); }
      var hMin = Math.min.apply(null, hs), hMax = Math.max.apply(null, hs);
      var topY = hMax;               // set from the measured platform below
      function addAt(name, m, lx, lz, dry, y, byH) {
        getModel(name, function (src) {
          var S = sized(src, m, ws.ry + (dry || 0), byH), p = local(ws, lx, lz);
          var base = y != null ? y() : heightAt(p[0], p[1]) - 0.1 * U;
          S.obj.position.set(p[0], base - S.minY, p[1]);
          grp.add(S.obj);
        });
      }
      getModel('platform-03', function (src) {
        // seated: bottom on the LOW side of the 12 m footprint, sunk platformSink m so no edge floats on a slope
        var S = sized(src, 12, ws.ry), H = S.maxY - S.minY, bottom = hMin - K.platformSink * U; topY = bottom + H;
        S.obj.position.set(ws.x, bottom - S.minY, ws.z); grp.add(S.obj);
        // things standing ON the platform wait for its real top
        addAt('information-stand01', 2.5, -3.2, 1.6, 0, function () { return topY; });
        addAt('elevator-teleport01', 4, 3.0, -1.8, 0, function () { return topY; });
      });
      addAt('japanese-arch', 12, 0, 10.5, 0);                 // gate on the Grid-facing side (12 m wide ≈ 3.4 m tall; see FILL-V4.md)
      addAt('prop-street-lamp', 6, -7.5, 7.5, 0, null, true);  // lamps by height
      addAt('prop-street-lamp', 6, 7.5, 7.5, 0, null, true);
      if (L && Array.isArray(L.realmColliders)) { var col = { x: Math.round(ws.x), z: Math.round(ws.z), r: Math.round(6.5 * U), label: 'waystation' }; L.realmColliders.push(col); colliderRefs.push(col); }
      if (root.__registerPlaceable) root.__registerPlaceable('fill:waystation-' + ws.n, grp, { source: 'world-fill-v4.js', border: ws.border });
    });

    var islandObjs = [];
    P.islands.forEach(function (isl, i) {
      var grp = new THREE.Group(); grp.name = 'fill-island-' + (i + 1); rootG.add(grp);
      var baseY = (isl.level_m + isl.alt_m) * U, rec = { grp: grp, baseY: baseY, phase: isl.phase, ry: isl.ry };
      grp.position.set(isl.X * U, baseY, -isl.Y * U); grp.rotation.y = isl.ry; islandObjs.push(rec);
      getModel('floating-island-01', function (src) { var S = sized(src, isl.size_m, 0); S.obj.position.y = -(S.minY + S.maxY) / 2; grp.add(S.obj); });
      if (root.__registerPlaceable) root.__registerPlaceable('fill:island-' + (i + 1), grp, { source: 'world-fill-v4.js' });
      rec.baseY = grp.position.y; rec.ry = grp.rotation.y;          // keep saved editor edits: bob around the (possibly moved) pose
    });

    var bridgeObjs = [];
    P.bridges.forEach(function (b, i) {
      var grp = new THREE.Group(); grp.name = 'fill-bridge-' + (i + 1); rootG.add(grp); bridgeObjs.push(grp);
      getModel('sci-fi-bridge', function (src) {
        // measure the long horizontal axis, then turn it onto the across-river direction
        var o = src.clone(true); o.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), alongX = sz.x >= sz.z;
        o.rotation.y = b.ryAcross - (alongX ? Math.PI / 2 : 0);   // model's long axis (+X or +Z) → across vector
        o.scale.multiplyScalar((b.len_m * U) / ((alongX ? sz.x : sz.z) || 1)); o.updateMatrixWorld(true);
        box.setFromObject(o);
        var dry = [b.bankA_m, b.bankB_m].filter(function (h) { return h > b.level_m + 0.5; });   // a bank below water (gorge/marsh) is ignored
        var deck = Math.max((dry.length ? Math.min.apply(null, dry) : b.level_m + 1) - 0.5, b.level_m + 1);
        o.position.set(b.X * U - (box.min.x + box.max.x) / 2, deck * U - box.min.y, -b.Y * U - (box.min.z + box.max.z) / 2);
        grp.add(o);
      });
      if (root.__registerPlaceable) root.__registerPlaceable('fill:bridge-' + (i + 1), grp, { source: 'world-fill-v4.js' });
    });

    // ── update: cell distance culling, near/far LOD swap, shadow toggle, adaptive far distance, island bob ──
    var EDIT = false; try { EDIT = /[?&]edit=1\b/.test(root.location.search); } catch (e) {}
    var acc = 1e9, lastCam = new THREE.Vector3(1e9, 0, 0), frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
    var vis = { cells: 0, draws: 0, tris: 0 }, farDist = K.farDist, nearDist = K.nearDist;
    function refresh(cam) {
      // QUALITY-GOVERNOR BUDGET: the FPS governor's tier scales the adaptive budget — weak GPUs get a tighter
      // tri/draw budget (more aggressive LOD swap), fast machines keep the full budget. Restores on climb.
      var _qi = window.__w3dTierIdx;
      var bTris = _qi === 0 ? 0.6e6 : _qi === 1 ? 1.0e6 : _qi === 2 ? 1.2e6 : K.budgetTris;
      var bDraws = _qi === 0 ? 80 : _qi === 1 ? 110 : _qi === 2 ? 130 : K.budgetDraws;
      var nv = 0, lim = { near: nearDist, small: K.smallDist, far: farDist, big: K.bigDist };
      for (var i = 0; i < cellList.length; i++) {
        var c = cellList[i], d = Math.max(0, Math.hypot(cam.x - c.cx, cam.z - c.cz) - c.R);
        c.group.visible = d < lim[c.role];
        if (c.role === 'near') {                                         // only trees cast shadows, and only close by
          var shad = c.group.visible && d < K.shadowDist;
          if (c.shad !== shad) { c.shad = shad; c.group.children.forEach(function (m) { m.castShadow = shad; }); }
        }
        if (c.group.visible) nv++;
      }
      // visible estimate (frustum ∩ distance) → adapt near/far distances to the budget
      var draws = 0, tris = 0, nearTris = 0;
      if (camera) {
        camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_pm);
        for (var j = 0; j < cellList.length; j++) {
          var cj = cellList[j]; if (!cj.group.visible) continue;
          var ch = cj.group.children;
          for (var n = 0; n < ch.length; n++) {
            var im = ch[n]; if (!im.boundingSphere) continue;
            _sph.copy(im.boundingSphere).applyMatrix4(im.matrixWorld);
            if (frustum.intersectsSphere(_sph)) { draws++; var tt = im.userData.tris * im.count; tris += tt; if (cj.role === 'near') nearTris += tt; }
          }
        }
        if (tris > bTris) { if (nearTris > tris * 0.5) nearDist = Math.max(K.nearMin, nearDist * 0.9); else farDist = Math.max(K.farMin, farDist * 0.9); }
        else if (draws > bDraws) farDist = Math.max(K.farMin, farDist * 0.9);
        else if (tris < bTris * 0.7 && draws < bDraws * 0.7) { nearDist = Math.min(nearDef, nearDist * 1.05); farDist = Math.min(K.farDist, farDist * 1.05); }
        uNear.value = nearDist;
      }
      vis.cells = nv; vis.draws = draws; vis.tris = Math.round(tris);
    }
    function update(t, dt, camPos) {
      var cam = camPos || (camera && camera.position); if (!cam) return;
      acc += dt || 0;
      if (acc >= K.tick || Math.abs(cam.x - lastCam.x) + Math.abs(cam.z - lastCam.z) > 400) { acc = 0; lastCam.copy(cam); refresh(cam); }
      for (var i = 0; i < islandObjs.length; i++) {
        var I = islandObjs[i];
        if (EDIT) break;                                               // ?edit=1: freeze so the gizmo doesn't fight the bob
        I.grp.position.y = I.baseY + Math.sin((t || 0) * (2 * Math.PI / 14) + I.phase) * 2 * U;
        I.grp.rotation.y = I.ry + (t || 0) * 0.01;
      }
    }
    function stats() {
      var byRealm = {}; P.items.forEach(function (it) { byRealm[it.realm] = (byRealm[it.realm] || 0) + 1; });
      return { instances: byRealm, planned: P.items.length, built: instTotal, instancedMeshes: imCount, cells: cellList.length, visibleCells: vis.cells,
        drawCalls: vis.draws, visibleTris: vis.tris, nearDist: Math.round(nearDist), farDist: Math.round(farDist), waystations: P.waystations.length, islands: P.islands.length, bridges: P.bridges.length,
        modelsLoaded: loaded, failed: failed, planMs: planMs, waystationSites: P.waystations.map(function (w) { return { n: w.n, border: w.border, relief_m: w.relief_m }; }) };
    }
    function dispose() {
      scene.remove(rootG);
      rootG.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); });
      owned.forEach(function (g) { try { g.dispose(); } catch (e) {} });
      if (L && Array.isArray(L.realmColliders)) colliderRefs.forEach(function (c) { var i = L.realmColliders.indexOf(c); if (i >= 0) L.realmColliders.splice(i, 1); });
      var reg = root.__placeables; if (reg) Object.keys(reg).forEach(function (k) { if (/^fill:/.test(k)) delete reg[k]; });
      proxyMat.dispose();
    }
    console.info('[fill-v4] planned', P.items.length, 'instances in', cellList.length, 'cells ·', P.waystations.length, 'waystations ·', P.islands.length, 'islands ·', P.bridges.length, 'bridges ·', planMs, 'ms', P.counts);
    return { group: rootG, update: update, stats: stats, dispose: dispose, plan: P };
  };
})(typeof window !== 'undefined' ? window : null);
