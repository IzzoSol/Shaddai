/* world-interiors-v3.js — SHADDAI INTERIOR ENGINE v3 (Map v4, ?map=v4), 2026-09-28.
 *
 * Real walk-in interiors for the city: the door slides open as you approach, you walk straight through (no loading
 * screen), the room lives INSIDE the building volume, furniture has colliders, NPCs stand at their slots and every
 * furniture use point is an E-prompt through the existing city-v3 → city-actions pipeline.
 * v2 (world-interiors.js: the 7 agent buildings, portal enter/exit) is untouched and keeps working.
 *
 *   var iv3 = window.buildWorldInteriorsV3({ THREE, scene, getPlayer: () => ({pos}), heightAt?, furniture?, city?,
 *       onUse?({building, kind, marker}), onEnter?(building), onExit?(building),
 *       data?: { fabric, canon, markers },          // parsed JSON; default: fetched from base ('/assets/world/')
 *       fetchJSON?, base?, fabricGroup?, setExteriorVisible?(building, visible), layout? (WORLD_LAYOUT), win? })
 *     → { ready, update(dt), nearestDoor(pos), enter(id), exit(), isInside(), current(), stats(), dispose(),
 *         handleInteract(marker), register(building), building(id), setNpcFactory(fn), active() }
 *
 * Coordinates: game units, U = 7/1.8 per metre. Every interior is built in its building's LOCAL frame in METRES
 * (x = width, z = depth, the door on the +z wall, y up from the floor) inside a group that carries
 * position (building centre, floor), rotation.y (= the building's collider rot) and scale U.
 * Local (a, b) metres → world: x = cx + (a·cos r + b·sin r)·U, z = cz + (−a·sin r + b·cos r)·U   (world-collision OBB rule).
 *
 * Furniture: window.SHADDAI_FURNITURE { build(kind, opts) → Group, kinds, meta(kind) } in metres when present; the
 * built-in FALLBACK (boxes, same meta shape) is used for any kind it does not have, so interiors work without it.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  var WALL_T = 0.2;                 // m, interior shell wall thickness
  var ACTIVATE_M = 40, RELEASE_M = 48;   // collider swap + interior build radius (hysteresis), metres from the footprint
  var DOOR_OPEN_M = 2.0;            // leaves slide open inside this distance
  var MAX_NPCS = 12, CACHE_N = 3, MAX_LIGHTS = 4;
  var SCAN_S = 0.25;                // building scan rate (s)
  var PLAYER_R = 0.35;              // m (player-controller DEFAULT_TUNE.radius)

  // ── building types (.bl-cache/sc/sc-types.json; front = −Y Blender local = +z three local, door centred) ──
  var SC_TYPES = {
    'sc-storefront-s': { w: 16, d: 12, h: 6.4, recipe: 'storefront-s' },
    'sc-storefront-l': { w: 24, d: 16, h: 9.6, recipe: 'storefront-l' },
    'sc-office': { w: 20, d: 20, h: 12.8, recipe: 'office' },
    'sc-office-mid': { w: 20, d: 16, h: 16.0, recipe: 'office-mid' },
    'sc-market': { w: 28, d: 20, h: 7.2, recipe: 'market' },
    'sc-techlab': { w: 20, d: 16, h: 9.6, recipe: 'techlab' },
    'sc-civic-tower': { w: 16, d: 16, h: 48.4, recipe: 'civic-tower' },
    'sc-garden': { w: 24, d: 20, h: 3.0, recipe: null },      // open park, no interior
    'sc-teleport': { w: 20, d: 20, h: 6.5, recipe: null },    // open pad, no interior
    'sc-ad-pylon': { w: 4, d: 4, h: 18, recipe: null }
  };
  // canon (one-off) buildings: canon-colliders kind → recipe + the marker that stands at its door (1.2 m outside a wall)
  var CANON_BUILDINGS = {
    'culture-bld_arcade': { recipe: 'arcade', anchor: 'BLD_ARCADE' },
    'culture-bld_broadcast': { recipe: 'broadcast', anchor: 'BLD_BROADCAST' },
    'culture-bld_gallery_shop': { recipe: 'gallery', anchor: 'BLD_GALLERY_SHOP' },
    'culture-studio_01': { recipe: 'studio', anchor: null }, 'culture-studio_02': { recipe: 'studio', anchor: null },
    'culture-studio_03': { recipe: 'studio', anchor: null }, 'culture-studio_04': { recipe: 'studio', anchor: null },
    'deed-office': { recipe: 'deed-office', anchor: 'DEED_OFFICE' },
    'academy-hall': { recipe: 'campus', anchor: 'CLASS_01' }
  };
  // production-board building family (fal-assets/production/manifest.json) → recipe, for register() of future placements
  var BOARD_RECIPES = { 'bld-shop': 'storefront-s', 'bld-arcade': 'arcade', 'bld-forge': 'forge', 'bld-bank': 'bank', 'bld-office': 'office', 'bld-shaddai-hall': 'shaddai-hall' };
  var HOME_UNIT = { w: 10, d: 8, h: 4.2 };

  // ── SHADDAI Arcade games (IzzoSol/Shaddai-Arcade hall/packs: blackjack, skate, skillplay · IzzoSol/shaddai-games:
  //    gridiron, neon-hoops, dodgeball, starfall · Culture Lane cabinets ARCADE_CAB_01-04: reflex, rhythm, prediction, skill) ──
  var ARCADE_GAMES = [
    { id: 'blackjack', title: 'Royale Blackjack', src: 'Shaddai-Arcade' }, { id: 'skate', title: 'SKATE', src: 'Shaddai-Arcade' },
    { id: 'skillplay', title: 'Skill Play', src: 'Shaddai-Arcade' }, { id: 'gridiron', title: 'Gridiron', src: 'shaddai-games' },
    { id: 'neon-hoops', title: 'Neon Hoops', src: 'shaddai-games' }, { id: 'dodgeball', title: 'Dodgeball', src: 'shaddai-games' },
    { id: 'starfall', title: 'Starfall', src: 'shaddai-games' }, { id: 'reflex', title: 'Reflex', src: 'culture-lane' },
    { id: 'rhythm', title: 'Rhythm', src: 'culture-lane' }, { id: 'prediction', title: 'Prediction', src: 'culture-lane' }
  ];

  // ── built-in FALLBACK furniture meta (metres; item front = +z; usePoint / npcSlots in item-local metres) ──
  // fp = footprint [w, d] (includes chairs/stools that belong to the piece), col = collider half-extents + height,
  // overlay = flat / ceiling piece (no overlap test, no collider), color = fallback box colour.
  var FALLBACK = {
    'counter': { fp: [3.0, 0.8], h: 1.05, use: [0, 1.0], npc: [[0, -0.9]], color: 0x1c2a26 },
    'shelf': { fp: [2.0, 0.5], h: 2.1, color: 0x22262c },
    'holo-shelf': { fp: [1.6, 0.6], h: 2.0, color: 0x0f3a33 },
    'desk': { fp: [1.6, 1.6], h: 0.75, col: [0.8, 0.35], colZ: 0.4, use: [0, 1.2], npc: [[0, -0.45]], color: 0x2a2f36 },
    'meeting-table': { fp: [3.6, 2.4], h: 0.75, col: [1.5, 0.6], use: [0, 1.6], npc: [[-0.8, -1.0], [0.8, -1.0]], color: 0x2a2f36 },
    'sofa': { fp: [2.2, 0.9], h: 0.8, color: 0x303844 },
    'bed-pod': { fp: [2.2, 1.3], h: 1.1, use: [0, 1.1], color: 0x1d2b3a },
    'wardrobe': { fp: [1.2, 0.6], h: 2.2, use: [0, 0.8], color: 0x262a30 },
    'stash': { fp: [1.0, 0.6], h: 0.9, use: [0, 0.8], color: 0x3a3320 },
    'terminal': { fp: [0.8, 0.6], h: 1.4, use: [0, 0.8], color: 0x0c1e1a },
    'mail-terminal': { fp: [0.7, 0.5], h: 1.3, use: [0, 0.8], color: 0x0c1e1a },
    'server-rack': { fp: [0.8, 1.0], h: 2.2, color: 0x14181c },
    'workbench': { fp: [2.0, 0.9], h: 0.95, use: [0, 1.0], npc: [[0.6, -0.95]], color: 0x2e3238 },
    'anvil-station': { fp: [2.0, 1.6], h: 1.1, use: [0, 1.4], npc: [[0.9, -1.25]], color: 0x3a2a1c },
    'class-desk-row': { fp: [4.0, 1.4], h: 0.75, col: [2.0, 0.35], colZ: 0.35, color: 0x2a2f36 },
    'lectern': { fp: [0.8, 0.6], h: 1.2, use: [0, 0.9], npc: [[0, -0.8]], color: 0x2a2f36 },
    'gallery-frame': { fp: [1.6, 0.12], h: 1.4, use: [0, 1.1], color: 0x0a0c10, wall: true },
    'arcade-cabinet': { fp: [0.9, 0.9], h: 1.9, use: [0, 1.0], color: 0x10202a },
    'casino-table': { fp: [2.4, 1.4], h: 0.8, use: [0, 1.2], npc: [[0, -1.15]], color: 0x0e3a24 },
    'bar-counter': { fp: [3.0, 1.4], h: 1.1, col: [1.5, 0.35], colZ: -0.35, use: [0, 0.8], npc: [[0, -1.1]], color: 0x1c2a26 },
    'planter': { fp: [0.8, 0.8], h: 1.0, color: 0x1f3a22 },
    'stall': { fp: [2.4, 1.6], h: 2.4, col: [1.2, 0.2], colZ: 0.5, use: [0, 1.3], npc: [[0, -0.3]], color: 0x2c2418 },
    'broadcast-desk': { fp: [2.4, 1.2], h: 0.9, use: [0, 1.1], npc: [[0, -0.95]], color: 0x241c2e },
    'lift': { fp: [2.2, 2.2], h: 3.0, use: [0, 1.6], color: 0x1a1e24 },
    'stairs': { fp: [1.4, 4.2], h: 0.2, color: 0x2a2e34, noCol: true },
    'hydro-station': { fp: [1.6, 0.7], h: 1.1, use: [0, 0.9], color: 0x1c3a44 },          // cook / water still (sand houses)
    'comms-console': { fp: [1.2, 0.8], h: 1.3, use: [0, 0.95], npc: [[1.05, 0.3]], color: 0x241c2e },
    'grow-rack': { fp: [2.0, 0.7], h: 2.4, use: [0, 0.9], npc: [[1.4, 0.5]], color: 0x1f3a22 },   // food-wall harvest station
    'rug': { fp: [3.0, 2.0], h: 0.02, overlay: true, color: 0x123a30 },
    'ceiling-light': { fp: [1.2, 1.2], h: 0.08, overlay: true, ceiling: true, color: 0xd8fff0 }
  };
  // my kind → names the furniture library may use (compared normalised: lower-case, no - _ space)
  var ALIASES = {
    'shelf': ['display-shelf', 'display shelf'], 'desk': ['office-desk', 'office desk', 'desk-chair', 'office-desk-chair'],
    'bed-pod': ['bed', 'pod', 'bed-pod'], 'anvil-station': ['forge-anvil', 'forge anvil station', 'anvil'],
    'class-desk-row': ['class-desk', 'desk-row'], 'casino-table': ['casino', 'blackjack-table'], 'server-rack': ['rack'],
    'mail-terminal': ['terminal'], 'broadcast-desk': ['desk', 'office-desk'], 'stall': ['counter'], 'lift': ['elevator'],
    'gallery-frame': ['frame', 'gallery frame'], 'arcade-cabinet': ['cabinet', 'arcade'], 'bar-counter': ['bar'],
    'ceiling-light': ['light', 'ceiling light'], 'holo-shelf': ['holoshelf', 'shelf']
  };
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s_-]+/g, ''); }

  // meta(kind) normalised: { fp:[w,d], h, col:{hx,hz,h,oz}|null, use:[x,z]|null, npc:[[x,z]], overlay, libKind }
  function resolveKind(kind, furniture) {
    if (!furniture || !furniture.kinds) return null;
    var list = Array.isArray(furniture.kinds) ? furniture.kinds : Object.keys(furniture.kinds), want = [kind].concat(ALIASES[kind] || []);
    for (var i = 0; i < want.length; i++) for (var j = 0; j < list.length; j++) if (norm(list[j]) === norm(want[i])) return list[j];
    return null;
  }
  function pt(p) { return !p ? null : Array.isArray(p) ? [+p[0] || 0, +p[1] || 0] : [+(p.x || 0), +(p.z != null ? p.z : p.y || 0)]; }
  function metaFor(kind, furniture) {
    var fb = FALLBACK[kind] || { fp: [1, 1], h: 1, color: 0x2a2f36 }, lib = resolveKind(kind, furniture), m = null;
    if (lib && typeof furniture.meta === 'function') { try { m = furniture.meta(lib); } catch (e) { m = null; } }
    var out = { kind: kind, libKind: m ? lib : null, fp: fb.fp.slice(), h: fb.h, use: fb.use ? fb.use.slice() : null,
      npc: (fb.npc || []).map(function (p) { return p.slice(); }), overlay: !!fb.overlay, ceiling: !!fb.ceiling, color: fb.color, wall: !!fb.wall };
    var cx = fb.col ? fb.col[0] : fb.fp[0] / 2, cz = fb.col ? fb.col[1] : fb.fp[1] / 2;
    out.col = (fb.overlay || fb.noCol) ? null : { hx: cx, hz: cz, h: fb.h, oz: fb.colZ || 0 };
    if (m && Array.isArray(m.footprint_m) && m.footprint_m[0] > 0 && m.footprint_m[1] > 0 && !fb.overlay) {
      // the library is authoritative for size when it fits sensibly; our layout keeps working either way
      out.fp = [Math.max(+m.footprint_m[0], 0.2), Math.max(+m.footprint_m[1], 0.1)];
      if (m.height_m > 0) out.h = +m.height_m;
      if (m.collider && m.collider.hx > 0 && m.collider.hz > 0) out.col = { hx: Math.min(+m.collider.hx, out.fp[0] / 2), hz: Math.min(+m.collider.hz, out.fp[1] / 2), h: +m.collider.h || out.h, oz: 0 };
      else if (m.collider === null) out.col = null;
      if (m.usePoint) out.use = pt(m.usePoint);
      if (Array.isArray(m.npcSlots)) out.npc = m.npcSlots.map(pt).filter(Boolean);
    }
    return out;
  }

  // ── seeded RNG (same building → same room) ──
  function hash(s) { s = String(s); var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rngOf(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // item-local (a, b) → room-local for quarter-turn q (front +z → q0 +z, q1 +x, q2 −z, q3 −x)
  function rotPt(a, b, q) { q = q & 3; return q === 0 ? [a, b] : q === 1 ? [b, -a] : q === 2 ? [-a, -b] : [-b, a]; }
  function rectsOverlap(a, b, eps) {
    eps = eps == null ? 1e-4 : eps;
    return Math.abs(a.x - b.x) < a.hx + b.hx - eps && Math.abs(a.z - b.z) < a.hz + b.hz - eps;
  }
  function inRect(x, z, r, pad) { pad = pad || 0; return Math.abs(x - r.x) < r.hx + pad && Math.abs(z - r.z) < r.hz + pad; }

  // ════════════════════════════ LAYOUT (pure, deterministic) ════════════════════════════
  // A layout is plain data in room-local metres (x ∈ ±W/2, z ∈ ±D/2, door on the +z wall):
  //   { id, recipe, W, D, H, ceil, open, door:{x,w,h}, walls:[rect+h], items:[…], uses:[…], npcs:[…], lights:[…], colliders:[…], solids:[…] }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function grow(r, p) { return { x: r.x, z: r.z, hx: r.hx + p, hz: r.hz + p }; }
  function makeLayout(b, furniture) {
    var R = RECIPES[b.recipe];
    if (!R) throw new Error('no recipe ' + b.recipe);
    var W = b.w, D = b.d, H = b.h, dw = R.doorW || 2.4;
    var L = { id: b.id, recipe: b.recipe, W: W, D: D, H: H, ceil: clamp(Math.min(H - 0.3, R.ceil || 4.2), 3.0, 8), open: !!R.open,
      door: { x: clamp(b.doorX || 0, -W / 2 + dw / 2 + 0.6, W / 2 - dw / 2 - 0.6), w: dw, h: Math.min(3.0, H - 0.4) },
      walls: [], items: [], clear: [], uses: [], npcs: [], lights: [], colliders: [], solids: (b.solids || []).slice(), style: R.style || null };
    var T = WALL_T, inner = { x0: -W / 2 + T, x1: W / 2 - T, z0: -D / 2 + T, z1: D / 2 - T };
    var rng = rngOf(hash(b.id + '|' + b.recipe)), metas = {};
    function M(kind) { return metas[kind] || (metas[kind] = metaFor(kind, furniture)); }
    function wall(x, z, hx, hz, kind) { if (hx > 0.01 && hz > 0.01) L.walls.push({ x: x, z: z, hx: hx, hz: hz, h: L.ceil, kind: kind || 'shell' }); }
    function clearRect(x, z, hx, hz, tag) { L.clear.push({ x: x, z: z, hx: hx, hz: hz, tag: tag || '' }); }
    // ── shell: 4 walls, the front one split around the door gap ──
    if (!L.open) {
      var dr = L.door, fz = D / 2 - T / 2, gl = dr.x - dr.w / 2, gr = dr.x + dr.w / 2;
      wall(0, -D / 2 + T / 2, W / 2, T / 2); wall(-W / 2 + T / 2, 0, T / 2, D / 2 - T); wall(W / 2 - T / 2, 0, T / 2, D / 2 - T);
      wall((-W / 2 + gl) / 2, fz, (gl + W / 2) / 2, T / 2, 'front');
      wall((gr + W / 2) / 2, fz, (W / 2 - gr) / 2, T / 2, 'front');
    }
    clearRect(L.door.x, D / 2 - 1.7, L.door.w / 2 + 0.4, 1.7, 'door');   // keep the entry walkable
    function blocked(r) {
      var i;
      for (i = 0; i < L.walls.length; i++) if (rectsOverlap(r, L.walls[i])) return true;
      for (i = 0; i < L.solids.length; i++) if (rectsOverlap(r, L.solids[i])) return true;
      return false;
    }
    function pointFree(x, z, selfItem) {   // a standing spot: inside, off walls and off every other footprint
      var p = { x: x, z: z, hx: PLAYER_R, hz: PLAYER_R }, i;
      if (x - PLAYER_R < inner.x0 || x + PLAYER_R > inner.x1 || z - PLAYER_R < inner.z0 || z + PLAYER_R > inner.z1) return false;
      if (blocked(p)) return false;
      for (i = 0; i < L.items.length; i++) { var it = L.items[i]; if (it === selfItem || it.overlay) continue; if (rectsOverlap(p, it.rect)) return false; }
      if (selfItem && selfItem.col && rectsOverlap(p, selfItem.col)) return false;
      return true;
    }
    // place(kind, x, z, q, opt{use, npc, tag, data}) → item | null  (all checks; nothing is added on failure)
    function place(kind, x, z, q, opt) {
      opt = opt || {}; q = (q || 0) & 3;
      var m = M(kind), odd = q & 1, hx = (odd ? m.fp[1] : m.fp[0]) / 2, hz = (odd ? m.fp[0] : m.fp[1]) / 2, i, s;
      var rect = { x: x, z: z, hx: hx, hz: hz };
      if (x - hx < inner.x0 - 1e-6 || x + hx > inner.x1 + 1e-6 || z - hz < inner.z0 - 1e-6 || z + hz > inner.z1 + 1e-6) return null;
      var item = { kind: kind, x: x, z: z, q: q, rect: rect, h: m.h, overlay: m.overlay, ceiling: m.ceiling, color: m.color, libKind: m.libKind,
        col: null, use: null, npcs: [], tag: opt.tag || null, data: opt.data || null };
      if (!m.overlay) {
        if (blocked(rect)) return null;
        for (i = 0; i < L.items.length; i++) if (!L.items[i].overlay && rectsOverlap(rect, L.items[i].rect)) return null;
        for (i = 0; i < L.clear.length; i++) if (rectsOverlap(rect, L.clear[i])) return null;
        if (m.col) {
          var co = rotPt(0, m.col.oz || 0, q);
          item.col = { x: x + co[0], z: z + co[1], hx: odd ? m.col.hz : m.col.hx, hz: odd ? m.col.hx : m.col.hz, h: m.col.h };
        }
      }
      var spots = [];
      if (opt.use && m.use) { var up = rotPt(m.use[0], m.use[1], q); spots.push({ t: 'use', x: x + up[0], z: z + up[1] }); }
      var roles = opt.npc ? (Array.isArray(opt.npc) ? opt.npc : [opt.npc]) : [];
      for (i = 0; i < roles.length && i < m.npc.length; i++) { var np = rotPt(m.npc[i][0], m.npc[i][1], q); spots.push({ t: 'npc', role: roles[i], x: x + np[0], z: z + np[1] }); }
      for (i = 0; i < spots.length; i++) {
        s = spots[i];
        if (!pointFree(s.x, s.z, item)) return null;
        if (s.t === 'use' && rectsOverlap({ x: s.x, z: s.z, hx: PLAYER_R, hz: PLAYER_R }, rect)) return null;   // stand in front, not in it
      }
      L.items.push(item);
      for (i = 0; i < spots.length; i++) {
        s = spots[i];
        clearRect(s.x, s.z, PLAYER_R + 0.1, PLAYER_R + 0.1, s.t);
        if (s.t === 'use') { item.use = { x: s.x, z: s.z, type: opt.use, kind: kind, face: q, tag: opt.tag || null, data: opt.data || null }; L.uses.push(item.use); }
        else { var n = { x: s.x, z: s.z, role: s.role, face: q, kind: kind }; item.npcs.push(n); L.npcs.push(n); }
      }
      return item;
    }
    // straight run of one kind (along x when axis 'x', along z when 'z'); returns placed items
    function run(kind, axis, fixed, a0, a1, q, opt) {
      opt = opt || {}; q = (q || 0) & 3;
      var m = M(kind), odd = q & 1, along = axis === 'x' ? (odd ? m.fp[1] : m.fp[0]) : (odd ? m.fp[0] : m.fp[1]);
      var gap = opt.gap == null ? 0.4 : opt.gap, max = opt.max || 99, out = [], p = a0 + along / 2;
      while (p + along / 2 <= a1 + 1e-6 && out.length < max) {
        var o = opt.each ? opt.each(out.length) : opt;
        var it = axis === 'x' ? place(kind, p, fixed, q, o) : place(kind, fixed, p, q, o);
        if (it) { out.push(it); p += along + gap; } else p += 0.25;
      }
      return out;
    }
    function depth(kind) { return M(kind).fp[1] / 2; }   // extent away from the wall it backs onto (any quarter turn)
    // against a wall, facing into the room: back (q0), left (q1), right (q3)
    function atBack(kind, x, opt, off) { return place(kind, x, inner.z0 + depth(kind, 0) + (off || 0.02), 0, opt); }
    function atLeft(kind, z, opt, off) { return place(kind, inner.x0 + depth(kind, 1) + (off || 0.02), z, 1, opt); }
    function atRight(kind, z, opt, off) { return place(kind, inner.x1 - depth(kind, 3) - (off || 0.02), z, 3, opt); }
    // interior partitions (walls with doorway gaps; each doorway is kept clear 1 m each side)
    function partX(z, x0, x1, gaps) {
      var cur = x0;
      (gaps || []).slice().sort(function (a, c) { return a.x - c.x; }).forEach(function (g) {
        wall((cur + g.x - g.w / 2) / 2, z, (g.x - g.w / 2 - cur) / 2, T / 2, 'part'); cur = g.x + g.w / 2;
        clearRect(g.x, z, g.w / 2 + 0.2, 1.1, 'doorway');
      });
      wall((cur + x1) / 2, z, (x1 - cur) / 2, T / 2, 'part');
    }
    function partZ(x, z0, z1, gaps) {
      var cur = z0;
      (gaps || []).slice().sort(function (a, c) { return a.z - c.z; }).forEach(function (g) {
        wall(x, (cur + g.z - g.w / 2) / 2, T / 2, (g.z - g.w / 2 - cur) / 2, 'part'); cur = g.z + g.w / 2;
        clearRect(x, g.z, 1.1, g.w / 2 + 0.2, 'doorway');
      });
      wall(x, (cur + z1) / 2, T / 2, (z1 - cur) / 2, 'part');
    }
    function light(x, z) { if (L.lights.length < MAX_LIGHTS - 1) L.lights.push({ x: x, z: z, y: L.ceil - 0.3 }); place('ceiling-light', x, z, 0); }
    var ctx = { W: W, D: D, H: H, L: L, b: b, inner: inner, T: T, rng: rng, place: place, run: run, atBack: atBack, atLeft: atLeft, atRight: atRight,
      partX: partX, partZ: partZ, clearRect: clearRect, light: light, depth: depth, M: M,
      range: function (a, c) { return a + (c - a) * rng(); }, pick: function (arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; } };
    R.build(ctx);
    if (!L.lights.length) light(0, 0);
    // colliders (room-local rects + height): shell/partition walls, furniture, and the solid leftovers of a host block
    L.walls.forEach(function (w) { L.colliders.push({ x: w.x, z: w.z, hx: w.hx, hz: w.hz, h: L.ceil, kind: 'wall:' + w.kind }); });
    L.items.forEach(function (it) { if (it.col) L.colliders.push({ x: it.col.x, z: it.col.z, hx: it.col.hx, hz: it.col.hz, h: it.col.h, kind: 'furn:' + it.kind }); });
    L.solids.forEach(function (s) { L.colliders.push({ x: s.x, z: s.z, hx: s.hx, hz: s.hz, h: s.h || H, kind: 'solid' }); });
    delete L.clear;
    return L;
  }

  // ════════════════════════════ RECIPES ════════════════════════════
  // build(ctx) places everything with ctx.place / run / atBack / atLeft / atRight / partX / partZ / light.
  // `use` = the E-prompt type (see USE_MARKERS), `npc` = role(s) for the piece's npcSlots.
  function lights3(c, zs) { var W = c.W; c.light(-W / 4, zs[0]); c.light(W / 4, zs[1] != null ? zs[1] : zs[0]); if (zs[2] != null) c.light(0, zs[2]); }
  function firstOf(c, kind, xs, z, q, opt) { for (var i = 0; i < xs.length; i++) { var it = c.place(kind, xs[i], z, q, opt); if (it) return it; } return null; }
  function storefront(c, big) {
    var i = c.inner, W = c.W, officeD = big ? 4.2 : 3.4 + c.rng() * 0.4, pz = i.z0 + officeD;
    var gx = c.range(-W / 4, W / 4);
    c.partX(pz, i.x0, i.x1, [{ x: gx, w: 1.8 }]);                                             // back office wall + doorway
    c.run('desk', 'x', i.z0 + c.depth('desk', 0) + 0.02, i.x0 + 0.2, i.x1 - 3.2, 0, { gap: 1.0, max: big ? 2 : 1, npc: 'clerk' });
    c.atBack('stash', i.x1 - 0.7, { use: 'stash' });
    c.atBack('terminal', i.x1 - 2.1, { use: 'terminal' });
    var cz = pz + WALL_T / 2 + 1.3 + 0.4;                                                     // shopkeeper stands between counter and wall
    firstOf(c, 'counter', [c.range(-2, 2), 0, -W / 4, W / 4, -W / 3, W / 3], cz, 0, { use: 'shop', npc: 'shopkeeper' });
    c.run('shelf', 'z', i.x0 + c.depth('shelf', 1) + 0.02, pz + 0.5, i.z1 - 2.0, 1, { gap: 0.3 });
    c.run('shelf', 'z', i.x1 - c.depth('shelf', 3) - 0.02, pz + 0.5, i.z1 - 2.0, 3, { gap: 0.3 });
    c.run('holo-shelf', 'x', cz + 3.1, -W / 2 + 3.0, W / 2 - 3.0, 0, { gap: 1.8, max: big ? 4 : 2 });
    if (big) { c.place('rug', 0, cz + 1.9, 0); c.run('sofa', 'x', i.z1 - c.depth('sofa', 2) - 0.02, i.x0 + 1.4, i.x1 - 1.4, 2, { gap: 4, max: 2 }); }
    c.place('planter', i.x0 + 0.45, i.z1 - 0.45, 0); c.place('planter', i.x1 - 0.45, i.z1 - 0.45, 0);
    lights3(c, [cz + 1.5, cz + 1.5, (i.z0 + pz) / 2]);
  }
  function office(c) {
    var i = c.inner, W = c.W, D = c.D, mx = i.x0 + 7.5, mz = i.z0 + 6.5, dx = c.L.door.x;
    c.partZ(mx, i.z0, mz, []); c.partX(mz, i.x0, mx, [{ x: mx - 2.2, w: 1.8 }]);                // glass meeting room (back-left)
    c.place('meeting-table', (i.x0 + mx) / 2, i.z0 + 3.0, 0, { use: 'meet', npc: ['staff', 'staff'] });
    var rz = D / 2 - 5.6;                                                                    // reception faces the door
    firstOf(c, 'counter', [dx, dx - 3.5, dx + 3.5], rz, 0, { use: 'hire', npc: 'receptionist' });
    c.run('desk', 'x', i.z0 + c.depth('desk', 0) + 0.02, mx + 0.6, i.x1 - 0.2, 0, { gap: 0.8, use: 'hire', npc: 'worker' });
    c.run('desk', 'x', i.z0 + 4.4, mx + 0.6, i.x1 - 3.0, 0, { gap: 0.8, use: 'hire', npc: 'worker' });
    c.atRight('lift', i.z1 - 3.6, { use: 'lift' });
    c.run('sofa', 'z', i.x0 + c.depth('sofa', 1) + 0.02, mz + 1.5, i.z1 - 1.0, 1, { gap: 1.0, max: 2 });
    c.run('planter', 'x', i.z1 - 0.45, i.x0 + 0.1, i.x1 - 0.1, 0, { gap: 5, max: 4 });
    lights3(c, [0, 0, i.z0 + 3]);
  }
  function market(c) {
    var i = c.inner, opt = { gap: 0.9, use: 'shop', npc: 'vendor' };
    c.run('stall', 'x', i.z0 + 0.82, i.x0 + 0.4, i.x1 - 0.4, 0, opt);                         // back row faces the hall
    c.run('stall', 'x', -1.8, i.x0 + 1.6, i.x1 - 1.6, 2, opt);                                 // island, back-to-back
    c.run('stall', 'x', -0.2, i.x0 + 1.6, i.x1 - 1.6, 0, opt);
    c.run('stall', 'x', i.z1 - 4.4, i.x0 + 0.4, i.x1 - 0.4, 2, opt);                          // front row faces the island
    lights3(c, [-5, -5, 3]);
  }
  function techlab(c) {
    var i = c.inner, W = c.W;
    c.run('server-rack', 'x', i.z0 + c.depth('server-rack', 0) + 0.02, i.x0 + 0.2, 0, 0, { gap: 0.15, max: 7 });
    c.atBack('terminal', i.x1 - 1.0, { use: 'terminal' });
    c.run('workbench', 'x', -1.6, -W / 2 + 1.5, W / 2 - 1.5, 0, { gap: 1.4, use: 'seat', npc: 'engineer', max: 4 });
    c.run('workbench', 'x', 1.9, -W / 2 + 2.5, W / 2 - 2.5, 0, { gap: 1.6, use: 'seat', npc: 'engineer', max: 3 });
    c.run('holo-shelf', 'z', i.x0 + c.depth('holo-shelf', 1) + 0.02, -1, i.z1 - 2, 1, { gap: 0.6, max: 3 });
    c.atRight('terminal', 0.5, { use: 'terminal' });
    lights3(c, [0, 0, i.z0 + 2]);
  }
  function civic(c) {
    var i = c.inner;
    c.atBack('lift', 0, { use: 'lift' });
    c.place('rug', 0, 0.5, 0);
    firstOf(c, 'counter', [-3.5, 3.5, 0], -1.2, 0, { use: 'info', npc: 'receptionist' });
    c.atLeft('sofa', 0.8); c.atRight('sofa', 0.8);
    c.place('planter', i.x0 + 0.45, i.z0 + 0.45, 0); c.place('planter', i.x1 - 0.45, i.z0 + 0.45, 0);
    lights3(c, [0, 0, i.z0 + 2]);
  }
  function home(c) {
    var i = c.inner;
    firstOf(c, 'bed-pod', [i.x0 + 1.2, i.x0 + 1.6], i.z0 + c.depth('bed-pod', 0) + 0.02, 0, { use: 'rest' });
    c.atBack('stash', i.x1 - 0.6, { use: 'stash' });
    c.atLeft('wardrobe', i.z0 + 2.6, { use: 'wardrobe' }) || c.atLeft('wardrobe', 0.4, { use: 'wardrobe' });
    c.atRight('mail-terminal', 0, { use: 'mail' }) || c.atRight('mail-terminal', -1, { use: 'mail' });
    c.place('rug', 0, -0.3, 0);
    firstOf(c, 'sofa', [-2.6, 2.6, 0], 0.6, 0, {});
    c.place('planter', i.x1 - 0.45, i.z1 - 0.45, 0);
    c.light(0, -0.5);
  }
  function placeGames(c, games) {
    var i = c.inner, n = 0, cab = 'arcade-cabinet', d = c.depth(cab, 0);
    function go(axis, fixed, a0, a1, q) {
      if (n >= games.length) return;
      // run() asks each() before every try and only counts placed ones, so games stay in order
      c.run(cab, axis, fixed, a0, a1, q, { gap: 0.35, max: games.length - n, each: function (k) { var g = games[n + k]; return g ? { use: 'arcade', tag: g.id, data: g } : {}; } }).forEach(function () { n++; });
    }
    go('x', i.z0 + d + 0.02, i.x0 + 0.2, i.x1 - 0.2, 0);
    go('z', i.x0 + d + 0.02, i.z0 + 1.6, i.z1 - 0.3, 1);
    go('z', i.x1 - d - 0.02, i.z0 + 1.6, i.z1 - 0.3, 3);
    return n;
  }
  function arcade(c) {
    c.place('casino-table', 0, -0.2, 0, { use: 'casino', npc: 'dealer', tag: 'blackjack' }) || firstOf(c, 'casino-table', [-2, 2], 0.4, 0, { use: 'casino', npc: 'dealer', tag: 'blackjack' });
    c.L.gamesPlaced = placeGames(c, ARCADE_GAMES);
    lights3(c, [-1, -1, -3.5]);
  }
  function gallery(c) {
    var i = c.inner, n = 0, fr = 'gallery-frame';
    function each(k) { return { use: 'gallery', tag: 'SLOT_GALLERY_0' + (n + k + 1) }; }
    function go(axis, fixed, a0, a1, q) { if (n < 8) c.run(fr, axis, fixed, a0, a1, q, { gap: 1.3, max: 8 - n, each: each }).forEach(function () { n++; }); }
    go('x', i.z0 + c.depth(fr, 0) + 0.02, i.x0 + 1.0, i.x1 - 1.0, 0);
    go('z', i.x0 + c.depth(fr, 1) + 0.02, i.z0 + 1.2, i.z1 - 1.2, 1);
    go('z', i.x1 - c.depth(fr, 3) - 0.02, i.z0 + 1.2, i.z1 - 1.2, 3);
    c.L.framesPlaced = n;
    firstOf(c, 'counter', [c.W / 2 - 4.5, -c.W / 2 + 4.5], 1.2, 0, { use: 'shop', npc: 'curator', tag: 'BLD_GALLERY_SHOP' });
    c.run('sofa', 'x', -1.5, -5, 5, 0, { gap: 3, max: 2 });
    lights3(c, [-1, -1, -3]);
  }
  function broadcast(c) {
    var i = c.inner, px = 1.6, pz = i.z0 + 5.0;
    c.partZ(px, i.z0, pz, []); c.partX(pz, px, i.x1, [{ x: (px + i.x1) / 2, w: 1.8 }]);        // control room (back-right)
    c.run('server-rack', 'x', i.z0 + c.depth('server-rack', 0) + 0.02, px + 0.3, i.x1 - 0.2, 0, { gap: 0.2, max: 3 });
    c.atRight('terminal', i.z0 + 3.2, { use: 'terminal' });
    firstOf(c, 'broadcast-desk', [-3.2, -4, -2.5], i.z0 + 2.2, 0, { use: 'radio', npc: 'host' });
    firstOf(c, 'sofa', [-3.2, -4, -2], 1.8, 2, {});
    c.place('rug', -3.2, 0.4, 0);
    lights3(c, [-1, -1, i.z0 + 2.5]);
  }
  function studio(c) {
    var i = c.inner;
    c.atBack('workbench', 0, { use: 'studio' });
    c.atLeft('terminal', -0.5, { use: 'terminal' });
    c.atRight('sofa', -0.2);
    c.place('rug', 0, 0.3, 0);
    c.light(0, 0);
  }
  function deed(c) {
    var i = c.inner, cz = i.z0 + 1.3 + 0.4 + 0.02;
    c.run('counter', 'x', cz, -10.5, 10.5, 0, { gap: 2.0, max: 3, use: 'deed', npc: 'clerk' });
    c.place('rug', 0, 1.5, 0);
    c.run('sofa', 'x', 2.0, i.x0 + 2, -4, 0, { gap: 0.8, max: 2 }); c.run('sofa', 'x', 2.0, 4, i.x1 - 2, 0, { gap: 0.8, max: 2 });
    c.run('terminal', 'z', i.x0 + c.depth('terminal', 1) + 0.02, -2, i.z1 - 2, 1, { gap: 2.0, max: 3, use: 'deed' });
    c.run('planter', 'z', i.x1 - 0.45, -3, i.z1 - 0.5, 0, { gap: 3, max: 3 });
    lights3(c, [-1, -1, -5]);
  }
  function campus(c) {
    var i = c.inner, W = c.W, pz = i.z0 + 11, cw = (i.x1 - i.x0) / 3, xs = [i.x0 + cw / 2, 0, i.x1 - cw / 2];
    c.partZ(i.x0 + cw, i.z0, pz, []); c.partZ(i.x1 - cw, i.z0, pz, []);
    c.partX(pz, i.x0, i.x1, xs.map(function (x) { return { x: x + 3, w: 2.0 }; }));
    xs.forEach(function (cx, k) {
      c.atBack('lectern', cx, { use: 'class', npc: 'teacher', tag: 'CLASS_0' + (k + 1) }, 1.0);
      [i.z0 + 4.2, i.z0 + 6.4, i.z0 + 8.6].forEach(function (z) { c.run('class-desk-row', 'x', z, cx - cw / 2 + 0.6, cx + cw / 2 - 0.6, 2, { gap: 1.0, max: 3 }); });
    });
    c.run('anvil-station', 'x', pz + 3.6, 4, i.x1 - 1, 0, { gap: 1.6, max: 3, use: 'seat', npc: 'smith' });   // forge bays (front-right)
    c.run('workbench', 'x', i.z1 - 3.6, 8, i.x1 - 1, 0, { gap: 1.6, max: 3, use: 'seat' });
    c.atLeft('terminal', pz + 3, { use: 'class-board' });
    c.run('sofa', 'x', pz + 4, i.x0 + 4, -6, 0, { gap: 2, max: 3 });
    lights3(c, [pz + 3, pz + 3, i.z0 + 4]);
  }
  function bank(c) {
    var i = c.inner;
    c.run('counter', 'x', i.z0 + 1.72, i.x0 + 1, i.x1 - 1, 0, { gap: 1.2, max: 4, use: 'bank', npc: 'teller' });
    c.run('terminal', 'z', i.x0 + c.depth('terminal', 1) + 0.02, -1, i.z1 - 2, 1, { gap: 1.5, max: 3, use: 'bank' });
    c.place('rug', 0, 1, 0); c.run('planter', 'z', i.x1 - 0.45, -1, i.z1 - 1, 0, { gap: 3, max: 2 });
    lights3(c, [0, 0, i.z0 + 2]);
  }
  function forge(c) {
    var i = c.inner;
    c.run('anvil-station', 'x', -1.0, i.x0 + 1, i.x1 - 1, 0, { gap: 1.6, max: 4, use: 'seat', npc: 'smith' });
    c.run('workbench', 'x', i.z0 + c.depth('workbench', 0) + 0.02, i.x0 + 0.5, i.x1 - 0.5, 0, { gap: 0.8, max: 4, use: 'seat' });
    c.run('server-rack', 'z', i.x1 - 0.52, 0.5, i.z1 - 2, 3, { gap: 0.2, max: 3 });
    lights3(c, [-1, -1, i.z0 + 2]);
  }
  function hall(c) {
    var i = c.inner;
    c.run('casino-table', 'x', -0.5, i.x0 + 2, i.x1 - 2, 0, { gap: 3.0, max: 2, use: 'casino', npc: 'dealer', tag: 'blackjack' });
    c.atBack('bar-counter', i.x0 + 3.0, { use: 'info', npc: 'bartender' }, 1.3);
    placeGames(c, ARCADE_GAMES.slice(0, 6));
    lights3(c, [0, 0, i.z0 + 3]);
  }
  // ── SAND HOUSES (owner ref LF2/MODELS FOR FAL/7b8b…jpg): printed sand-glass, warm emissive seams. Every one has
  //    sleep (rest/respawn), cook/hydration, workbench (craft), comms, 1–2 NPC slots (humans + agents use the same slots) ──
  function sandCore(c, zone, opt) {   // zone: {x0,x1,z0,z1} room-local; opt.npc roles
    var cx = (zone.x0 + zone.x1) / 2;
    var out = {};
    out.bed = firstOf(c, 'bed-pod', [zone.x0 + 1.2, zone.x0 + 1.6, cx], zone.z0 + c.depth('bed-pod', 0) + 0.02, 0, { use: 'respawn' });
    out.hydro = firstOf(c, 'hydro-station', [zone.x1 - 0.9, zone.x1 - 1.4, cx], zone.z0 + c.depth('hydro-station', 0) + 0.02, 0, { use: 'cook' });
    return out;
  }
  function sandDome(c) {          // 01 twin-dome home + awning: two domes joined by an arch (partition with a doorway)
    var i = c.inner, mx = 0.4;
    c.partZ(mx, i.z0, i.z1 - 2.6, [{ z: i.z0 + 2.2, w: 1.8 }]);
    sandCore(c, { x0: i.x0, x1: mx - 0.1, z0: i.z0, z1: i.z1 });
    c.atRight('workbench', -0.4, { use: 'craft', npc: 'crafter' }, 1.25) || c.atBack('workbench', (mx + i.x1) / 2, { use: 'craft' });
    firstOf(c, 'comms-console', [i.x1 - 1.0, mx + 1.2], i.z1 - 3.4, 2, { use: 'comms' }) || c.atLeft('comms-console', 0.8, { use: 'comms' });
    c.place('rug', (i.x0 + mx) / 2, 0.6, 0);
    c.light((i.x0 + mx) / 2, -0.5); c.light((mx + i.x1) / 2, -0.5);
  }
  function sandTower(c) {         // 02 round tower + solar wing (square room inscribed in the round shell; ring caps stay solid)
    var i = c.inner;
    sandCore(c, { x0: i.x0, x1: i.x1, z0: i.z0, z1: i.z1 });
    c.atLeft('comms-console', 0.6, { use: 'comms', npc: 'operator' }) || c.atLeft('comms-console', 2.0, { use: 'comms', npc: 'operator' }) || c.atRight('comms-console', 2.0, { use: 'comms', npc: 'operator' }) || c.atLeft('comms-console', 1.2, { use: 'comms' });
    c.atRight('workbench', 0.4, { use: 'craft' }, 0.02);
    c.place('rug', 0, 0.6, 0);
    lights3(c, [0, 0]);
  }
  function sandStepped(c) {       // 03 stepped block, stairs to the roof terrace
    var i = c.inner;
    c.place('stairs', i.x1 - 0.8, i.z0 + 2.3, 0, {}) && c.clearRect(i.x1 - 0.8, i.z0 + 5.0, 0.9, 0.6, 'stairs-foot');
    c.atRight('terminal', i.z0 + 5.6 + 0.6, { use: 'roof' });   // stair head → roof terrace (host moves the player up)
    sandCore(c, { x0: i.x0, x1: i.x1 - 2.0, z0: i.z0, z1: i.z1 });
    c.atLeft('workbench', 0.6, { use: 'craft', npc: 'crafter' }, 1.25) || c.atLeft('workbench', 0.6, { use: 'craft' });
    firstOf(c, 'comms-console', [-1.0, 1.0, -2.5], 1.6, 0, { use: 'comms' });
    lights3(c, [-1, -1]);
  }
  function sandCourtyard(c) {     // 04 arched courtyard compound: rooms on three sides of an open court
    var i = c.inner, rz = i.z0 + 5.0, lx = i.x0 + 5.5, rx = i.x1 - 5.5;
    c.partX(rz, lx, rx, [{ x: 0, w: 2.0 }]);                                               // back rooms (sleep / cook)
    c.partZ(lx, i.z0, i.z1 - 3.0, [{ z: rz + 3.0, w: 2.0 }]); c.partZ(rx, i.z0, i.z1 - 3.0, [{ z: rz + 3.0, w: 2.0 }]);
    sandCore(c, { x0: lx + 0.1, x1: rx - 0.1, z0: i.z0, z1: rz - 0.1 });
    c.atLeft('workbench', rz + 1.5, { use: 'craft' }) || c.atLeft('workbench', 0, { use: 'craft' });
    c.atRight('comms-console', rz + 1.5, { use: 'comms' });
    firstOf(c, 'counter', [0, -1.5, 1.5], rz + 3.2, 0, { use: 'trade', npc: 'trader' });            // courtyard trade counter
    firstOf(c, 'lectern', [i.x0 + 2.5, i.x1 - 2.5], i.z1 - 3.2, 2, { use: 'quest', npc: 'quest-giver' });
    c.place('planter', lx + 0.6, i.z1 - 3.6, 0); c.place('planter', rx - 0.6, i.z1 - 3.6, 0);
    lights3(c, [i.z0 + 2.5, rz + 2, i.z0 + 2.5]);
  }
  // ── GROWTH-FARM TOWER (docs/FAL-MODEL-MAP.md "Growth-farm towers"): ownable; data hooks only, no economy code.
  //    Ground floor: community market counter (SPARKS only) + food-wall harvest stations + farmer-agent slot + lift;
  //    upper rings (L.farm.levels): rentable living pods + harvest stations as data for the multi-floor pass. ──
  function farmTower(c) {
    var i = c.inner, L = c.L;
    firstOf(c, 'counter', [0, -2, 2], i.z0 + 1.3 + 0.4 + 0.02 + 3.2, 0, { use: 'farm-market', npc: 'vendor' });
    var harvest = [];
    harvest = harvest.concat(c.run('grow-rack', 'x', i.z0 + c.depth('grow-rack', 0) + 0.02, i.x0 + 0.3, i.x1 - 0.3, 0, { gap: 0.6, max: 5, use: 'harvest', each: function (k) { return { use: 'harvest', npc: k === 0 ? 'farmer' : null, tag: 'ring0-' + k }; } }));
    harvest = harvest.concat(c.run('grow-rack', 'z', i.x0 + c.depth('grow-rack', 1) + 0.02, i.z0 + 2.2, i.z1 - 2.5, 1, { gap: 0.8, max: 3, each: function (k) { return { use: 'harvest', tag: 'ring0-w' + k }; } }));
    c.atRight('lift', -2.5, { use: 'lift' }) || c.atRight('lift', 0, { use: 'lift' });
    c.run('bed-pod', 'z', i.x1 - c.depth('bed-pod') - 0.02, 0.5, i.z1 - 0.3, 3, { gap: 0.6, max: 2, each: function (k) { return { use: 'pod', tag: 'pod-0-' + k }; } });   // ground-floor rentable pods
    c.run('sofa', 'x', 1.2, i.x0 + 2.5, -2.5, 0, { gap: 1.0, max: 2 });
    c.place('rug', -1, 2.0, 0);
    lights3(c, [0, 0, i.z0 + 2]);
    var ringH = 3.6, rings = Math.max(1, Math.min(8, Math.floor((c.H - 8) / ringH))), levels = [];     // top ~8 m = solar canopy + rain pool
    for (var r = 1; r <= rings; r++) {
      var pods = [], racks = [], k;
      for (k = 0; k < 4; k++) pods.push({ id: 'pod-' + r + '-' + k, x: i.x0 + 1.4 + k * ((i.x1 - i.x0 - 2.8) / 3), z: i.z0 + 1.0, face: 0, seat: true, bed: true, tenant: null });
      for (k = 0; k < 3; k++) racks.push({ id: 'ring' + r + '-' + k, x: i.x0 + 2 + k * ((i.x1 - i.x0 - 4) / 2), z: i.z1 - 1.5, face: 2 });
      levels.push({ level: r, y: 0.2 + r * ringH, pods: pods, harvest: racks });
    }
    L.farm = { ownerId: c.b.ownerId || null, farmerSlot: null, cycle: 0, currency: 'SPARKS', levels: levels,
      harvest: harvest.map(function (it) { return it.use; }), market: null };
    L.npcs.forEach(function (n) { if (n.role === 'farmer') L.farm.farmerSlot = n; });
    L.uses.forEach(function (u) { if (u.type === 'farm-market') L.farm.market = u; });
  }
  var RECIPES = {
    'storefront-s': { label: 'Shop floor + counter + shelves + back office', build: function (c) { storefront(c, false); } },
    'storefront-l': { label: 'Flagship store: counter, shelves, holo-shelves, lounge, back office', doorW: 3.0, build: function (c) { storefront(c, true); } },
    'office': { label: 'Reception, desk rows, meeting room, lift', build: office },
    'office-mid': { label: 'Reception, desk rows, meeting room, lift', build: office },
    'market': { label: 'Open market hall, 4 stall rows', open: true, doorW: 6.0, build: market },
    'techlab': { label: 'NEXUS lab: server racks, workbenches, terminals', build: techlab },
    'civic-tower': { label: 'Lobby, reception, lift', build: civic },
    'home': { label: 'HUB home: bed pod, wardrobe, stash, mail terminal', ceil: 3.4, build: home },
    'arcade': { label: 'Culture Lane arcade: a cabinet per SHADDAI Arcade game + blackjack table with dealer bot', build: arcade },
    'gallery': { label: 'Gallery: SLOT_GALLERY walls, shop counter, benches', build: gallery },
    'broadcast': { label: 'Broadcast studio + control room', build: broadcast },
    'studio': { label: 'Rentable creator studio', build: studio },
    'deed-office': { label: 'Deed office: clerk counters, claim kiosks, waiting area', doorW: 3.0, build: deed },
    'campus': { label: 'Academy hall: 3 classrooms + forge bays', doorW: 3.0, build: campus },
    'bank': { label: 'Bank: teller counters + SPARKS kiosks', doorW: 3.0, build: bank },
    'forge': { label: 'Forge: anvil stations + workbenches', doorW: 3.0, build: forge },
    'shaddai-hall': { label: 'SHADDAI Hall: casino tables, bar, cabinets', doorW: 3.0, build: hall },
    'sand-dome': { label: 'Sand house 01: twin domes + awning — sleep/respawn, hydration, workbench, comms', style: 'sand', ceil: 4.0, size: [14, 9, 5.5], build: sandDome },
    'sand-tower': { label: 'Sand house 02: round tower + solar wing — respawn, hydration, craft, comms + operator', style: 'sand', ceil: 4.2, size: [12, 12, 12], build: sandTower },
    'sand-stepped': { label: 'Sand house 03: stepped block, stairs to the roof terrace', style: 'sand', ceil: 3.8, size: [13, 10, 7], build: sandStepped },
    'sand-courtyard': { label: 'Sand house 04: arched courtyard compound — rooms round a court, trader + quest-giver', style: 'sand', ceil: 4.0, doorW: 3.0, size: [20, 18, 6], build: sandCourtyard },
    'farm-tower': { label: 'Growth-farm tower: market counter, food-wall harvest ring, farmer slot, lift; pod rings as data', style: 'farm', doorW: 3.0, ceil: 4.6, size: [18, 18, 40], build: farmTower }
  };
  BOARD_RECIPES['sand-house-01'] = 'sand-dome'; BOARD_RECIPES['sand-house-02'] = 'sand-tower'; BOARD_RECIPES['sand-house-03'] = 'sand-stepped';
  BOARD_RECIPES['sand-house-04'] = 'sand-courtyard'; BOARD_RECIPES['bld-farm-tower'] = 'farm-tower'; BOARD_RECIPES['farm-tower'] = 'farm-tower';

  // ════════════════════════════ USE → city marker (city-v3 / city-actions pipeline) ════════════════════════════
  // Each use point becomes a marker shaped like world-city-v3's normMarker(), so city-v3 shows the E-prompt and
  // city-actions picks the panel family from the NAME / dashboard_id exactly as for Blender markers.
  function up(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }
  var USE_MARKERS = {
    shop: function (b, u) { var t = u.tag && /^[A-Z]/.test(u.tag) ? u.tag : 'STALL_' + up(b.short); return { name: t, dashboard_id: t === 'BLD_GALLERY_SHOP' ? 'culture.gallery' : 'stall.' + b.short, endpoints: [{ service: 'bazaar', method: 'GET', path: '/api/bazaar/list' }] }; },
    hire: function () { return { name: 'OBJ_HIRING_BOARD', dashboard_id: 'hiring', props: { skill_required: 'work.hire', paybox_merchant_id: 'city.hiring' }, endpoints: [{ service: 'hire', method: 'GET', path: '/api/hire/rates' }] }; },
    seat: function () { return { name: 'NODE_SKILL_INSTALL', dashboard_id: 'forge.install', props: { paybox_merchant_id: 'forge.install', seat_anim_s: 3 }, endpoints: [{ service: 'skills-market', method: 'POST', path: '/api/skills/market/:id/run' }] }; },
    casino: function (b, u) { return { name: 'CASINO_TABLE_' + up(u.tag || 'blackjack'), dashboard_id: 'culture.arcade.casino', props: { game: u.tag || 'blackjack', dealer: 'bot', prize: 'SPARKS or cosmetics (no gambling)' } }; },
    arcade: function (b, u) { var g = u.data || { id: u.tag }; return { name: 'ARCADE_CAB_' + up(g.id), dashboard_id: 'culture.arcade.cab.' + g.id, props: { game: g.id, title: g.title || g.id, source: g.src || null, prize: 'SPARKS or cosmetics (no gambling)' } }; },
    rest: function (b) { return homeMk(b, 'rest'); }, stash: function (b) { return homeMk(b, 'stash'); }, wardrobe: function (b) { return homeMk(b, 'wardrobe'); },
    mail: function () { return { name: 'NODE_MAIL', dashboard_id: 'mail', endpoints: [{ service: 'agentmail', method: 'GET', path: '/api/agentmail/messages' }] }; },
    'class': function (b, u) { var n = /\d+$/.exec(u.tag || '') ; n = n ? n[0] : '01'; return { name: 'CLASS_' + n, dashboard_id: 'academy.class.' + n, endpoints: [{ service: 'academy', method: 'GET', path: '/api/academy/catalog' }] }; },
    'class-board': function () { return { name: 'OBJ_CLASS_BOARD', dashboard_id: 'academy.board', endpoints: [{ service: 'academy', method: 'GET', path: '/api/academy/catalog' }] }; },
    gallery: function (b, u) { var n = /\d+$/.exec(u.tag || '01')[0]; return { name: 'SLOT_GALLERY_' + n, dashboard_id: 'culture.gallery.slot.' + n, props: { slot_kind: 'SLOT_GALLERY' }, endpoints: [{ service: 'bazaar', method: 'GET', path: '/api/bazaar/list' }] }; },
    deed: function () { return { name: 'DEED_OFFICE', dashboard_id: 'plots.deeds', props: { paybox_merchant_id: 'city.deeds' } }; },
    radio: function () { return { name: 'BLD_BROADCAST', dashboard_id: 'culture.radio', endpoints: [{ service: 'radio', method: 'GET', path: '/api/radio/queue' }] }; },
    bank: function () { return { name: 'OBJ_SPARKS_KIOSK', dashboard_id: 'sparks', props: { paybox_merchant_id: 'city.kiosk' } }; },
    studio: function (b) { return { name: 'STUDIO_' + up(b.short), dashboard_id: 'culture.studio.' + b.short }; },
    // sand houses (realm habitats) — humans and agents
    respawn: function (b) { return { name: 'SAND_RESPAWN_' + up(b.short), dashboard_id: 'realm.respawn.' + b.short, props: { action: 'rest', respawn: true } }; },
    cook: function (b) { return { name: 'NODE_HYDRATION', dashboard_id: 'realm.hydration', props: { action: 'cook' } }; },
    craft: function () { return { name: 'NODE_CRAFT', dashboard_id: 'realm.craft', props: { action: 'craft' } }; },
    comms: function () { return { name: 'NODE_MAIL', dashboard_id: 'mail', props: { action: 'comms' }, endpoints: [{ service: 'agentmail', method: 'GET', path: '/api/agentmail/messages' }] }; },
    trade: function (b) { return { name: 'STALL_' + up(b.short), dashboard_id: 'stall.' + b.short, props: { currency: 'SPARKS' }, endpoints: [{ service: 'bazaar', method: 'GET', path: '/api/bazaar/list' }] }; },
    quest: function (b) { return { name: 'NODE_QUEST', dashboard_id: 'realm.quest.' + b.short, props: { action: 'quest' } }; },
    roof: function () { return { name: 'NODE_ROOF', dashboard_id: 'interior.roof', props: { action: 'roof' } }; },
    // growth-farm tower — data hooks only (SPARKS closed-loop; no cash-out, no yield-on-deposit)
    'farm-market': function (b) { return { name: 'STALL_FARM_' + up(b.short), dashboard_id: 'farm.' + b.short + '.market', props: { currency: 'SPARKS', owner_id: b.ownerId || null }, endpoints: [{ service: 'bazaar', method: 'GET', path: '/api/bazaar/list' }] }; },
    harvest: function (b, u) { return { name: 'NODE_HARVEST', dashboard_id: 'farm.' + b.short + '.harvest', props: { station: u.tag || null, owner_id: b.ownerId || null, action: 'harvest' } }; },
    pod: function (b, u) { return { name: 'NODE_POD', dashboard_id: 'farm.' + b.short + '.pod', props: { pod: u.tag || null, owner_id: b.ownerId || null, rent_currency: 'SPARKS' } }; }
  };
  function homeMk(b, action) { var hid = b.homeId || 'home.' + b.short; return { name: b.homeName || 'HUB_HOME_' + up(b.short), dashboard_id: hid, props: { home_id: hid, action: action } }; }
  function niceTitle(name) { return String(name).replace(/^(OBJ|NODE|BLD|HUB)_/, '').toLowerCase().split('_').map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' '); }
  function useMarker(b, u) {
    var f = USE_MARKERS[u.type], t = f ? f(b, u) : { name: 'NODE_' + up(u.type), dashboard_id: 'interior.' + u.type };
    var props = {}, k; t.props = t.props || {};
    for (k in t.props) props[k] = t.props[k];
    props.dashboard_id = t.dashboard_id; props.endpoints = t.endpoints || [];
    props.interior = { building: b.id, recipe: b.recipe, kind: u.kind, type: u.type, tag: u.tag || null };
    return { name: t.name, title: niceTitle(t.name), pos_m: [0, 0, 0], pos: { x: 0, y: 0, z: 0 }, props: props, interactive: true,
      dashboard_id: t.dashboard_id, endpoints: props.endpoints, endpoint: null, merchant: props.paybox_merchant_id || null,
      sparks_price: null, price_rule: null, price_unit: null, skill: props.skill_required || null, skills: props.skill_required ? [props.skill_required] : [],
      interior: props.interior, use: u };
  }

  // ════════════════════════════ BUILDINGS (which ones are enterable, and their frames) ════════════════════════════
  // descriptor: { id, short, recipe, source, cx, cz (units, room centre), rot (rad, collider convention), w, d, h (m),
  //   doorX (m, along the front wall), canon: {x,z,hx,hz,rot,kind}|null (the solid OBB swapped out while near),
  //   solids: [room-local rects] (rest of a host block), ext: {key, x, z}|null (fabric instance to hide), homeId, homeName }
  function toWorld(b, a, c, out) { var co = Math.cos(b.rot), si = Math.sin(b.rot); out = out || [0, 0]; out[0] = b.cx + (a * co + c * si) * U; out[1] = b.cz + (-a * si + c * co) * U; return out; }
  function toLocal(b, x, z, out) { var co = Math.cos(b.rot), si = Math.sin(b.rot), dx = x - b.cx, dz = z - b.cz; out = out || [0, 0]; out[0] = (dx * co - dz * si) / U; out[1] = (dx * si + dz * co) / U; return out; }
  function obbLocal(o, x, z) { var co = Math.cos(o.rot), si = Math.sin(o.rot), dx = x - o.x, dz = z - o.z; return [(dx * co - dz * si) / U, (dx * si + dz * co) / U]; }
  // re-frame an OBB so its door face (the side the anchor stands at) becomes local +z → { rot, W, D, lateral }
  function faceFrame(o, ax, az) {
    var p = obbLocal(o, ax, az), hx = o.hx / U, hz = o.hz / U, lx = p[0], lz = p[1];
    if (Math.abs(lx) / hx > Math.abs(lz) / hz) return lx > 0 ? { rot: o.rot + Math.PI / 2, W: 2 * hz, D: 2 * hx, lateral: -lz } : { rot: o.rot - Math.PI / 2, W: 2 * hz, D: 2 * hx, lateral: lz };
    return lz > 0 ? { rot: o.rot, W: 2 * hx, D: 2 * hz, lateral: lx } : { rot: o.rot + Math.PI, W: 2 * hx, D: 2 * hz, lateral: -lx };
  }
  function outsideDist(o, x, z) { var p = obbLocal(o, x, z); return Math.max(Math.abs(p[0]) - o.hx / U, Math.abs(p[1]) - o.hz / U); }
  function markerList(markers) { var a = markers && (Array.isArray(markers) ? markers : markers.markers); return Array.isArray(a) ? a : []; }
  function mkPos(m) { var p = m.pos_m || [0, 0, 0]; return { x: (+p[0] || 0) * U, z: -(+p[1] || 0) * U }; }
  function shortId(s) { return String(s).replace(/^[a-z]+:/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }

  function indexBuildings(data) {
    var out = [], canon = (data.canon && data.canon.obb) || [], mks = markerList(data.markers), i, k;
    // 1) the grid fabric: every storefront / office / market / techlab / civic tower (lazy — only data here)
    var items = (data.fabric && (Array.isArray(data.fabric) ? data.fabric : data.fabric.items)) || [];
    var canonByKind = {};
    canon.forEach(function (o) { (canonByKind[o.kind] = canonByKind[o.kind] || []).push(o); });
    items.forEach(function (it) {
      var T = SC_TYPES[it.key]; if (!T || !T.recipe) return;
      var id = 'fab:' + it.key + '@' + Math.round(it.x_m * 10) + ',' + Math.round(it.y_m * 10);
      var cx = it.x_m * U, cz = -it.y_m * U, rot = -(it.yaw || 0) * Math.PI / 180, ck = (it.cluster || '') + '-' + it.key.replace(/^sc-/, ''), obb = null;
      (canonByKind[ck] || []).some(function (o) { if (Math.abs(o.x - cx) < 1.5 && Math.abs(o.z - cz) < 1.5) { obb = o; return true; } return false; });
      out.push({ id: id, short: shortId(id), key: it.key, recipe: T.recipe, source: 'fabric', cx: cx, cz: cz, rot: rot, w: T.w, d: T.d, h: T.h, doorX: 0,
        canon: obb, solids: [], ext: { key: it.key, x: cx, z: cz }, lift: (it.lift_m || 0), len_m: it.len_m });
    });
    // 2) canon one-offs (Culture Lane, deed office, academy hall): door on the side the anchor marker stands at
    canon.forEach(function (o) {
      var C = CANON_BUILDINGS[o.kind]; if (!C) return;
      var anchor = null, best = 3.0;
      mks.forEach(function (m) {
        if (C.anchor ? m.name !== C.anchor : !/^STUDIO_/.test(m.name)) return;
        var p = mkPos(m), dd = outsideDist(o, p.x, p.z); if (dd < best && dd > -1) { best = dd; anchor = p; }
      });
      var fr = anchor ? faceFrame(o, anchor.x, anchor.z) : { rot: o.rot, W: 2 * o.hx / U, D: 2 * o.hz / U, lateral: 0 };
      var id = 'canon:' + o.kind;
      out.push({ id: id, short: shortId(o.kind), key: o.kind, recipe: C.recipe, source: 'canon', cx: o.x, cz: o.z, rot: fr.rot, w: fr.W, d: fr.D,
        h: Math.max(4, (o.top || 0) / U - 6), topAbs: o.top, doorX: fr.lateral, canon: o, solids: [], ext: null, anchored: !!anchor });
    });
    // 3) HUB homes: a home unit carved into the block the HUB_HOME marker stands against (or a stand-alone unit)
    mks.forEach(function (m) {
      if (!/^HUB_HOME_/.test(m.name)) return;
      var p = mkPos(m), host = null, best = 2.5, props = m.props || {};
      if (typeof props === 'string') { try { props = JSON.parse(props); } catch (e) { props = {}; } }
      canon.forEach(function (o) { if (o.walkableTop) return; var dd = outsideDist(o, p.x, p.z); if (dd > -0.5 && dd < best && o.hx / U >= 6 && o.hz / U >= 5) { best = dd; host = o; } });
      var id = 'home:' + m.name, hw = HOME_UNIT.w, hd = HOME_UNIT.d, b;
      if (host) {
        var fr = faceFrame(host, p.x, p.z), Wb = fr.W, Db = fr.D, w = Math.min(hw, Wb - 1), d = Math.min(hd, Db - 1);
        var ux = clamp(fr.lateral, -Wb / 2 + w / 2, Wb / 2 - w / 2), uz = Db / 2 - d / 2;
        var tmpB = { cx: host.x, cz: host.z, rot: fr.rot }, c = toWorld(tmpB, ux, uz), bh = Math.max(4, (host.top || 0) / U - 6);
        var solids = [], bx0 = -ux - Wb / 2, bx1 = -ux + Wb / 2, bz0 = -uz - Db / 2;
        function solid(x0, x1, z0, z1) { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) solids.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h: bh }); }
        solid(bx0, bx1, bz0, -d / 2); solid(bx0, -w / 2, -d / 2, d / 2); solid(w / 2, bx1, -d / 2, d / 2);
        b = { cx: c[0], cz: c[1], rot: fr.rot, w: w, d: d, doorX: fr.lateral - ux, canon: host, solids: solids };
      } else {
        var len = Math.hypot(p.x, p.z) || 1, dx = -p.x / len, dz = -p.z / len;    // stand-alone: the door faces the city centre
        b = { cx: p.x - dx * (hd / 2 + 1.2) * U, cz: p.z - dz * (hd / 2 + 1.2) * U, rot: Math.atan2(dx, dz), w: hw, d: hd, doorX: 0, canon: null, solids: [], standalone: true };
      }
      b.id = id; b.short = shortId(m.name); b.key = 'home'; b.recipe = 'home'; b.source = 'home'; b.h = HOME_UNIT.h; b.ext = null;
      b.homeId = props.home_id || props.dashboard_id || null; b.homeName = m.name;
      out.push(b);
    });
    // 4) Sand realm habitats (realms_v1.py build_sand → circle colliders kind 'sand-habitat-base', game units) — when exported
    var circles = ((data.canon && data.canon.circle) || []).concat(data.sandHabitats || []);
    circles.forEach(function (o) { if (o && o.kind === 'sand-habitat-base' && o.r > 0) out.push(circleHabitat(o, 'sand-tower')); });
    return out;
  }
  // round habitat: a square room inscribed in the round shell; the 4 ring caps between square and circle stay solid
  // (front cap split by the door gap); the door faces the city centre.
  function circleHabitat(o, recipe) {
    var r = o.r / U, s = Math.floor(r * Math.SQRT2 * 10) / 10, dw = RECIPES[recipe].doorW || 2.4, len = Math.hypot(o.x, o.z) || 1;
    var dx = -o.x / len, dz = -o.z / len, h = RECIPES[recipe].size[2], hs = s / 2, solids = [];
    function cap(x0, x1, z0, z1) { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) solids.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h: h }); }
    cap(-hs, hs, -r, -hs); cap(-r, -hs, -hs, hs); cap(hs, r, -hs, hs); cap(-hs, -dw / 2, hs, r); cap(dw / 2, hs, hs, r);
    var id = 'sand:' + Math.round(o.x) + ',' + Math.round(o.z);
    return { id: id, short: shortId(id), key: o.kind, recipe: recipe, source: 'realm', cx: o.x, cz: o.z, rot: Math.atan2(dx, dz), w: s, d: s, h: h,
      doorX: 0, canon: o, solids: solids, ext: null, ownerId: null };
  }
  function registerBoard(spec) {   // placements of the production-board family (bld-bank, bld-forge, bld-shaddai-hall, sand-house-0n, farm-tower …)
    var recipe = spec.recipe || BOARD_RECIPES[spec.key] || null;
    if (!recipe || !RECIPES[recipe]) throw new Error('unknown recipe for ' + (spec.key || spec.recipe));
    if (spec.r > 0) { var ch = circleHabitat({ x: spec.x, z: spec.z, r: spec.r, kind: spec.key || recipe }, recipe); if (spec.id) { ch.id = spec.id; ch.short = shortId(spec.id); } ch.ownerId = spec.ownerId || null; return ch; }
    var sz = RECIPES[recipe].size || [20, 16, 8];
    return { id: spec.id || 'board:' + (spec.key || recipe) + '@' + Math.round(spec.x) + ',' + Math.round(spec.z), short: shortId(spec.id || spec.key || recipe),
      key: spec.key || recipe, recipe: recipe, source: 'board', cx: spec.x, cz: spec.z, rot: spec.rot || 0, w: spec.w || sz[0], d: spec.d || sz[1], h: spec.h || sz[2],
      doorX: spec.doorX || 0, canon: spec.canon || null, solids: [], ext: spec.ext || null, ownerId: spec.ownerId || null };
  }

  // room-local collider rects → world OBBs (realmColliders format: {x,z,hx,hz,rot,top,label}); bottom = floor
  function worldColliders(b, L, floorY) {
    return L.colliders.map(function (c) {
      var p = toWorld(b, c.x, c.z);
      return { x: p[0], z: p[1], hx: c.hx * U, hz: c.hz * U, rot: b.rot, top: floorY + c.h * U, label: 'int3:' + b.id + ':' + c.kind };
    });
  }

  // flood fill on a 0.15 m grid (player radius inflated): which spots are walkable from outside the door?
  function reachability(L, opt) {
    opt = opt || {};
    var S = 0.15, x0 = -L.W / 2 - 1.5, z0 = -L.D / 2 - 1.5, nx = Math.ceil((L.W + 3) / S), nz = Math.ceil((L.D + 4.5) / S);
    var cols = L.colliders.slice(), i;
    if (opt.doorClosed) cols.push({ x: L.door.x, z: L.D / 2 - WALL_T / 2, hx: L.door.w / 2 + 0.01, hz: WALL_T / 2 });
    var grid = new Uint8Array(nx * nz), q = new Int32Array(nx * nz), qh = 0, qt = 0;
    function cellBlocked(cx, cz) {
      var x = x0 + (cx + 0.5) * S, z = z0 + (cz + 0.5) * S;
      for (var j = 0; j < cols.length; j++) { var c = cols[j]; if (Math.abs(x - c.x) < c.hx + PLAYER_R && Math.abs(z - c.z) < c.hz + PLAYER_R) return true; }
      return false;
    }
    function push(cx, cz) { if (cx < 0 || cz < 0 || cx >= nx || cz >= nz) return; var k = cz * nx + cx; if (grid[k]) return; grid[k] = cellBlocked(cx, cz) ? 2 : 1; if (grid[k] === 1) q[qt++] = k; }
    push(Math.floor((L.door.x - x0) / S), Math.floor((L.D / 2 + 2.2 - z0) / S));
    while (qh < qt) { var k = q[qh++], cx = k % nx, cz = (k / nx) | 0; push(cx + 1, cz); push(cx - 1, cz); push(cx, cz + 1); push(cx, cz - 1); }
    function ok(x, z) { var cx = Math.floor((x - x0) / S), cz = Math.floor((z - z0) / S); if (cx < 0 || cz < 0 || cx >= nx || cz >= nz) return false; return grid[cz * nx + cx] === 1; }
    var inside = 0;
    for (i = 0; i < grid.length; i++) if (grid[i] === 1) { var x = x0 + ((i % nx) + 0.5) * S, z = z0 + (((i / nx) | 0) + 0.5) * S; if (Math.abs(x) < L.W / 2 - WALL_T && Math.abs(z) < L.D / 2 - WALL_T) inside++; }
    return { ok: ok, inside: inside };
  }

  // ════════════════════════════ RUNTIME ════════════════════════════
  var STYLE_DEF = {
    sand: { wall: 0xc8a676, floor: 0x9c7b52, ceil: 0xb08d60, seam: 0xffa24a, glassWalls: false },   // printed sand-glass, warm print-seam glow
    farm: { wall: 0x1d3326, floor: 0x243a2a, ceil: 0x18261c, seam: 0x7dff6a, glassWalls: false }
  };
  var NPC_COLORS = { crafter: 0xffa24a, operator: 0x3dfff0, trader: 0xe8c45c, 'quest-giver': 0xd6a6ff, farmer: 0x7dff6a, shopkeeper: 0x00ff9c, clerk: 0x3dfff0, receptionist: 0x3dfff0, worker: 0x8fa3b8, staff: 0x8fa3b8, vendor: 0xe8c45c,
    engineer: 0x6fd3ff, curator: 0xd6a6ff, host: 0xff6fa8, teacher: 0xe8c45c, smith: 0xff9a3d, teller: 0x00ff9c, dealer: 0xe8c45c, bartender: 0xff6fa8 };

  function build(opts) {
    var THREE = opts.THREE, scene = opts.scene, win = opts.win || (typeof window !== 'undefined' ? window : {});
    var furniture = opts.furniture || win.SHADDAI_FURNITURE || null;
    var heightAt = opts.heightAt || function () { return 6 * U; };
    var warn = function (m) { if (typeof console !== 'undefined') console.warn('[interiors-v3] ' + m); };
    var buildings = [], byId = {}, grid = new Map(), CELL = 80 * U, loaded = false, disposed = false;
    var active = null, cache = [], inside = false, scanAcc = SCAN_S, time = 0, npcFactory = null;
    var sLoc = [0, 0], sW = [0, 0], tmpM = new THREE.Matrix4(), zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    var st = { built: 0, disposed: 0, swaps: 0, enters: 0, exits: 0 };

    // ── shared resources (made once; per-interior objects only reference them) ──
    var unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0);           // base at y = 0
    var mats = {
      wall: new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 0.85, metalness: 0.1, name: 'int3-wall' }),
      floor: new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.6, metalness: 0.2, name: 'int3-floor' }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.9, name: 'int3-ceil' }),
      trim: new THREE.MeshStandardMaterial({ color: 0x00ff9c, emissive: 0x00ff9c, emissiveIntensity: 1.2, name: 'int3-trim' }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0f2a24, emissive: 0x00ff9c, emissiveIntensity: 0.25, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.4, name: 'int3-door' })
    };
    // style sets: default = obsidian + emerald; 'sand' = printed sand-glass + warm emissive seam; 'farm' = bio-glass + leaf-green seam
    var styles = { 'default': mats };
    function styleMats(style) {
      if (!style || !STYLE_DEF[style]) return mats;
      if (styles[style]) return styles[style];
      var S = STYLE_DEF[style];
      return (styles[style] = {
        wall: new THREE.MeshStandardMaterial({ color: S.wall, roughness: 0.55, metalness: 0.05, transparent: S.glassWalls, opacity: S.glassWalls ? 0.92 : 1, name: 'int3-wall-' + style }),
        floor: new THREE.MeshStandardMaterial({ color: S.floor, roughness: 0.7, metalness: 0.05, name: 'int3-floor-' + style }),
        ceil: new THREE.MeshStandardMaterial({ color: S.ceil, roughness: 0.8, name: 'int3-ceil-' + style }),
        trim: new THREE.MeshStandardMaterial({ color: S.seam, emissive: S.seam, emissiveIntensity: 1.3, name: 'int3-seam-' + style }),
        glass: new THREE.MeshStandardMaterial({ color: S.floor, emissive: S.seam, emissiveIntensity: 0.25, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3, name: 'int3-door-' + style })
      });
    }
    var fbMats = {}, templates = {}, npcGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.26, 1.1, 4, 8) : new THREE.CylinderGeometry(0.26, 0.26, 1.6, 10);
    npcGeo.translate(0, 0.8, 0);
    var visorGeo = new THREE.BoxGeometry(0.36, 0.1, 0.12); visorGeo.translate(0, 1.5, 0.22);
    var npcMats = {};
    function npcMat(role) { var c = NPC_COLORS[role] || 0x8fa3b8; return npcMats[c] || (npcMats[c] = new THREE.MeshStandardMaterial({ color: 0x1a2028, emissive: c, emissiveIntensity: 0.35, roughness: 0.5 })); }
    // light pool: a FIXED number of point lights that always stay in the scene (intensity 0 when idle) so entering /
    // leaving never changes the scene's light count → no shader recompiles on the HD 620.
    var lightPool = [];
    for (var li = 0; li < MAX_LIGHTS; li++) { var pl = new THREE.PointLight(0xdffff4, 0, 11 * U, 2); pl.name = 'interior-v3-light-' + li; pl.castShadow = false; scene.add(pl); lightPool.push(pl); }

    // furniture template → parts [{geo, mat}] baked relative to the piece's origin (cached per kind for the session)
    function fallbackTemplate(meta) {
      var g = new THREE.Group(), c = meta.color || 0x2a2f36;
      var m = fbMats[c] || (fbMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2, emissive: meta.ceiling ? c : 0x000000, emissiveIntensity: meta.ceiling ? 1.5 : 0 }));
      var body = new THREE.Mesh(unitBox, m); body.scale.set(meta.fp[0], meta.h, meta.fp[1]); g.add(body);
      if (!meta.overlay) { var strip = new THREE.Mesh(unitBox, mats.trim); strip.scale.set(meta.fp[0] * 0.96, 0.03, 0.03); strip.position.set(0, meta.h, meta.fp[1] / 2); g.add(strip); }
      return g;
    }
    function templateFor(kind, meta) {
      if (templates[kind]) return templates[kind];
      var g = null;
      if (meta.libKind && furniture && typeof furniture.build === 'function') { try { g = furniture.build(meta.libKind, {}); } catch (e) { warn('furniture.build(' + meta.libKind + ') threw: ' + (e && e.message)); g = null; } }
      if (!g) g = fallbackTemplate(meta);
      g.updateMatrixWorld(true);
      var parts = [];
      g.traverse(function (o) { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) { var geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); parts.push({ geo: geo, mat: o.material }); } });
      return (templates[kind] = { parts: parts });
    }

    function minGround(x, z, r) { var m = heightAt(x, z), k, a; for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; m = Math.min(m, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; }
    function floorOf(b) {
      if (b.floorY != null) return b.floorY;
      var r = b.source === 'fabric' ? (b.len_m || Math.max(b.w, b.d)) * U * 0.35 : Math.max(b.w, b.d) * U * 0.3;
      return minGround(b.cx, b.cz, r) + (b.lift || 0) * U;
    }

    // ── one interior (layout + meshes + colliders + markers + npcs) ──
    function buildRecord(b) {
      var floorY = floorOf(b);
      if (b.topAbs != null) b.h = Math.max(4, (b.topAbs - floorY) / U);
      var L = makeLayout(b, furniture), g = new THREE.Group(), own = [], T = WALL_T, I = 0.08;   // I = visual inset from the façade
      g.name = 'interior-v3:' + b.id; g.position.set(b.cx, floorY, b.cz); g.rotation.y = b.rot; g.scale.setScalar(U);
      function inst(geo, mat, list, name) {   // list: [[x, y, z, sx, sy, sz, rotY]]
        if (!list.length) return null;
        var im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
        for (var i = 0; i < list.length; i++) { var e = list[i]; o.position.set(e[0], e[1], e[2]); o.rotation.set(0, e[6] || 0, 0); o.scale.set(e[3], e[4], e[5]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = name; im.castShadow = false; im.receiveShadow = false; g.add(im); own.push(im); return im;
      }
      // shell (walls drawn inset by I so they never z-fight the exterior façade; colliders use the true positions)
      var W = L.W, D = L.D, walls = [];
      L.walls.forEach(function (w) {
        var x = w.x, z = w.z, hx = w.hx, hz = w.hz;
        if (w.kind !== 'part') { if (Math.abs(Math.abs(z) - (D / 2 - T / 2)) < 1e-3 && hx > hz) z -= Math.sign(z) * I; else if (Math.abs(Math.abs(x) - (W / 2 - T / 2)) < 1e-3) x -= Math.sign(x) * I; }
        walls.push([x, 0, z, hx * 2, w.h, hz * 2, 0]);
      });
      var sm = styleMats(L.style);
      inst(unitBox, sm.wall, walls, 'int3-walls');
      inst(unitBox, sm.floor, [[0, 0, 0, W - 2 * I, 0.04, D - 2 * I, 0]], 'int3-floor');
      if (!L.open) inst(unitBox, sm.ceil, [[0, L.ceil, 0, W - 2 * I, 0.06, D - 2 * I, 0]], 'int3-ceil');
      var dr = L.door, fz = D / 2 - I;
      inst(unitBox, sm.trim, [
        [dr.x - dr.w / 2 - 0.06, 0, fz, 0.12, dr.h, T + 0.1, 0], [dr.x + dr.w / 2 + 0.06, 0, fz, 0.12, dr.h, T + 0.1, 0],
        [dr.x, dr.h, fz, dr.w + 0.24, 0.12, T + 0.1, 0], [0, L.ceil - 0.05, -D / 2 + T + I, W - 2 * T - 2 * I, 0.04, 0.04, 0]
      ], 'int3-trim');
      var leaves = [];
      for (var s = 0; s < 2; s++) { var lf = new THREE.Mesh(unitBox, sm.glass); lf.scale.set(dr.w / 2, dr.h, 0.06); lf.position.set(dr.x + (s ? 1 : -1) * dr.w / 4, 0, D / 2 + 0.04); lf.name = 'int3-door-leaf'; g.add(lf); leaves.push(lf); }
      // furniture: one InstancedMesh per template part per kind
      var byKind = {};
      L.items.forEach(function (it) { (byKind[it.kind] = byKind[it.kind] || []).push(it); });
      Object.keys(byKind).forEach(function (kind) {
        var list = byKind[kind], meta = metaFor(kind, furniture), tp = templateFor(kind, meta);
        var ents = list.map(function (it) { return [it.x, it.ceiling ? L.ceil - it.h - 0.02 : 0, it.z, 1, 1, 1, it.q * Math.PI / 2]; });
        tp.parts.forEach(function (p, k) { inst(p.geo, p.mat, ents, 'int3-furn:' + kind + ':' + k); });
      });
      // NPCs (placeholder capsules; setNpcFactory swaps in rigged agents later)
      var npcs = [];
      L.npcs.slice(0, MAX_NPCS).forEach(function (n, k) {
        var obj = null;
        if (npcFactory) { try { obj = npcFactory(n, b); } catch (e) { obj = null; } }
        if (!obj) { obj = new THREE.Mesh(npcGeo, npcMat(n.role)); var v = new THREE.Mesh(visorGeo, mats.trim); obj.add(v); }
        obj.position.set(n.x, 0, n.z); obj.rotation.y = n.face * Math.PI / 2; obj.name = 'int3-npc:' + n.role; g.add(obj);
        npcs.push({ obj: obj, slot: n, phase: (k * 1.7) % 6.28, base: n.face * Math.PI / 2, wx: 0, wz: 0 });
      });
      var cols = worldColliders(b, L, floorY);
      var markers = L.uses.map(function (u) {
        var mk = useMarker(b, u), p = toWorld(b, u.x, u.z);
        mk.pos.x = p[0]; mk.pos.y = floorY; mk.pos.z = p[1]; mk.pos_m = [p[0] / U, -p[1] / U, floorY / U]; return mk;
      });
      npcs.forEach(function (n) { var p = toWorld(b, n.slot.x, n.slot.z); n.wx = p[0]; n.wz = p[1]; });
      st.built++;
      return { b: b, L: L, group: g, own: own, leaves: leaves, npcs: npcs, cols: cols, markers: markers, floorY: floorY, door: 0, removed: null, hidden: null };
    }
    function disposeRecord(r) {
      r.own.forEach(function (m) { if (m.dispose) m.dispose(); });   // InstancedMesh.dispose frees instance buffers; geometries/materials are shared
      r.group.clear && r.group.clear();
      r.own.length = 0; st.disposed++;
    }

    // ── colliders: swap the building's solid OBB for its shell while near (never edits canon data) ──
    function layoutRef() { return opts.layout || win.WORLD_LAYOUT || null; }
    function sameObb(c, o) {
      if (!c || !o || Math.abs(c.x - o.x) >= 0.5 || Math.abs(c.z - o.z) >= 0.5) return false;
      return o.hx > 0 ? (c.hx > 0 && Math.abs(c.hx - o.hx) < 0.5 && Math.abs(c.hz - o.hz) < 0.5) : (c.r > 0 && Math.abs(c.r - o.r) < 0.5);
    }
    function swap(r, on) {
      var Lay = layoutRef(), rc = Lay && Lay.realmColliders;
      if (!rc) return;
      var i, o = r.b.canon;
      if (on) {
        if (o) for (i = rc.length - 1; i >= 0; i--) if (sameObb(rc[i], o)) { r.removed = rc.splice(i, 1)[0]; break; }
        for (i = 0; i < r.cols.length; i++) rc.push(r.cols[i]);
      } else {
        for (i = rc.length - 1; i >= 0; i--) if (r.cols.indexOf(rc[i]) >= 0) rc.splice(i, 1);
        if (r.removed) { rc.push(r.removed); r.removed = null; }
      }
      st.swaps++;
      if (typeof win.buildWorldCollision === 'function') { try { win.buildWorldCollision(Lay); } catch (e) { warn('buildWorldCollision threw'); } }
      if (opts.onCollidersChanged) { try { opts.onCollidersChanged(on, r.b); } catch (e) {} }
    }

    // ── exterior: hide the building's own fabric instance while inside (restored exactly on exit) ──
    function fabricGroup() { return opts.fabricGroup || (scene.getObjectByName && scene.getObjectByName('grid-fabric-v4')) || null; }
    function setExterior(r, visible) {
      if (opts.setExteriorVisible) { try { opts.setExteriorVisible(r.b, visible); } catch (e) {} return; }
      var ext = r.b.ext, fg = ext && fabricGroup();
      if (!fg) return;
      if (!visible) {
        if (r.hidden) return;
        r.hidden = [];
        fg.traverse(function (m) {
          if (!m.isInstancedMesh || m.name !== 'cluster:' + ext.key) return;
          for (var i = 0; i < m.count; i++) {
            m.getMatrixAt(i, tmpM); var e = tmpM.elements;
            if (Math.abs(e[12] - ext.x) < 0.6 && Math.abs(e[14] - ext.z) < 0.6) { r.hidden.push({ m: m, i: i, mat: tmpM.clone() }); m.setMatrixAt(i, zeroM); m.instanceMatrix.needsUpdate = true; }
          }
        });
      } else if (r.hidden) {
        r.hidden.forEach(function (h) { h.m.setMatrixAt(h.i, h.mat); h.m.instanceMatrix.needsUpdate = true; });
        r.hidden = null;
      }
    }
    function cityMarkers() { var c = opts.city || win.__cityV3; return c && Array.isArray(c.markers) ? c.markers : null; }
    function injectMarkers(r, on) {
      var list = cityMarkers(); if (!list) return;
      for (var i = list.length - 1; i >= 0; i--) if (list[i] && list[i].interior && list[i].interior.building === r.b.id) list.splice(i, 1);
      if (on) for (i = 0; i < r.markers.length; i++) list.push(r.markers[i]);
    }
    function setInside(v) {
      if (!active || v === inside) return;
      inside = v;
      setExterior(active, !v);
      injectMarkers(active, v);
      if (v) { st.enters++; if (opts.onEnter) try { opts.onEnter(active.b); } catch (e) {} }
      else { st.exits++; if (opts.onExit) try { opts.onExit(active.b); } catch (e) {} }
    }
    function lightsFor(r) {
      for (var i = 0; i < lightPool.length; i++) {
        var l = lightPool[i], p = r && r.L.lights[i];
        if (!p) { l.intensity = 0; continue; }
        var w = toWorld(r.b, p.x, p.z, sW); l.position.set(w[0], r.floorY + p.y * U, w[1]); l.intensity = 40 * U * U;
      }
    }
    function activate(b) {
      if (active && active.b === b) return active;
      if (active) deactivate();
      var r = null;
      for (var i = 0; i < cache.length; i++) if (cache[i].b === b) { r = cache.splice(i, 1)[0]; break; }
      if (!r) r = buildRecord(b);
      scene.add(r.group); swap(r, true); lightsFor(r); active = r;
      return r;
    }
    function deactivate() {
      if (!active) return;
      var r = active;
      setInside(false);
      swap(r, false); scene.remove(r.group); lightsFor(null); active = null;
      cache.unshift(r);
      while (cache.length > CACHE_N) disposeRecord(cache.pop());
    }

    // ── spatial index (80 m cells, numeric keys → no per-frame allocation) ──
    function gk(ix, iz) { return ix * 131071 + iz; }
    function addBuilding(b) {
      if (byId[b.id]) return byId[b.id];
      byId[b.id] = b; buildings.push(b);
      var k = gk(Math.floor(b.cx / CELL), Math.floor(b.cz / CELL)), a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b);
      return b;
    }
    function distTo(b, x, z) {   // metres from (x,z) to the footprint rectangle (0 inside)
      toLocal(b, x, z, sLoc);
      var ex = Math.abs(sLoc[0]) - b.w / 2, ez = Math.abs(sLoc[1]) - b.d / 2;
      ex = ex > 0 ? ex : 0; ez = ez > 0 ? ez : 0; return Math.sqrt(ex * ex + ez * ez);
    }
    var qBest = null, qBestD = 0;
    function nearestBuilding(x, z, maxM) {
      qBest = null; qBestD = maxM;
      var ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), dx, dz, a, i, d;
      for (dx = -1; dx <= 1; dx++) for (dz = -1; dz <= 1; dz++) {
        a = grid.get(gk(ix + dx, iz + dz)); if (!a) continue;
        for (i = 0; i < a.length; i++) { d = distTo(a[i], x, z); if (d <= qBestD) { qBestD = d; qBest = a[i]; } }
      }
      return qBest;
    }

    // ── load ──
    function ingest(data) { indexBuildings(data).forEach(addBuilding); loaded = true; return api; }
    var ready;
    if (opts.data) ready = Promise.resolve(ingest(opts.data));
    else {
      var base = opts.base || '/assets/world/';
      var fj = opts.fetchJSON || function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); };
      ready = Promise.all([fj(base + 'grid-fabric-v4.json'), fj(base + 'canon-colliders-v4.json?v=7'), fj(base + 'markers-v4.json')])
        .then(function (res) { return disposed ? api : ingest({ fabric: res[0], canon: res[1], markers: res[2] }); });
    }
    if (opts.data) loaded = true;

    // ── per frame (allocation-free) ──
    function update(dt) {
      if (!loaded || disposed) return;
      dt = dt || 0; time += dt; scanAcc += dt;
      var P = opts.getPlayer ? opts.getPlayer() : null, pos = P && P.pos;
      if (!pos) return;
      if (scanAcc >= SCAN_S) {
        scanAcc = 0;
        var keep = active && distTo(active.b, pos.x, pos.z) <= RELEASE_M;
        var nb = nearestBuilding(pos.x, pos.z, ACTIVATE_M);
        if (active && (inside || (keep && (!nb || nb === active.b || distTo(active.b, pos.x, pos.z) <= qBestD + 0.5)))) { /* stay */ }
        else if (nb) activate(nb);
        else if (active && !keep) deactivate();
      }
      if (!active) return;
      var r = active, b = r.b, L = r.L;
      toLocal(b, pos.x, pos.z, sLoc);
      var lx = sLoc[0], lz = sLoc[1], py = pos.y;
      var inY = !isFinite(py) || (py >= r.floorY - 1.5 * U && py <= r.floorY + (L.ceil + 0.5) * U);
      setInside(inY && Math.abs(lx) < L.W / 2 - 0.05 && Math.abs(lz) < L.D / 2 - 0.05);
      // door leaves
      var ddx = lx - L.door.x, ddz = lz - L.D / 2, near = inY && (ddx * ddx + ddz * ddz) < DOOR_OPEN_M * DOOR_OPEN_M;
      var tgt = near ? 1 : 0;
      if (r.door !== tgt) {
        r.door += (tgt > r.door ? 1 : -1) * dt * 3; r.door = r.door < 0 ? 0 : r.door > 1 ? 1 : r.door;
        var off = L.door.w / 4 + r.door * L.door.w * 0.48;
        r.leaves[0].position.x = L.door.x - off; r.leaves[1].position.x = L.door.x + off;
      }
      // NPCs: idle bob, face the player when close
      for (var i = 0; i < r.npcs.length; i++) {
        var n = r.npcs[i], o = n.obj, ex = lx - n.slot.x, ez = lz - n.slot.z;
        o.position.y = Math.sin(time * 2 + n.phase) * 0.025;
        var want = (inside && ex * ex + ez * ez < 16) ? Math.atan2(ex, ez) : n.base, cur = o.rotation.y, dlt = want - cur;
        while (dlt > Math.PI) dlt -= 2 * Math.PI; while (dlt < -Math.PI) dlt += 2 * Math.PI;
        o.rotation.y = cur + dlt * (dt * 4 < 1 ? dt * 4 : 1);
      }
    }

    // ── API ──
    function handleInteract(m) {
      if (!m || !m.interior || !active || m.interior.building !== active.b.id) return false;
      if (opts.onUse) { try { opts.onUse({ building: active.b, kind: m.interior.kind, type: m.interior.type, marker: m }); } catch (e) { warn('onUse threw: ' + (e && e.message)); } }
      return true;
    }
    function nearestUse(pos, r_m) {
      if (!active || !pos) return null;
      var best = null, bd = (r_m || 1.6) * U, i, m;
      for (i = 0; i < active.markers.length; i++) { m = active.markers[i]; var dx = m.pos.x - pos.x, dz = m.pos.z - pos.z, d = Math.sqrt(dx * dx + dz * dz); if (d < bd) { bd = d; best = m; } }
      return best;
    }
    function doorWorld(b, dz) { var p = toWorld(b, b._doorX != null ? b._doorX : clamp(b.doorX || 0, -b.w / 2 + 1.8, b.w / 2 - 1.8), b.d / 2 + dz); return { x: p[0], y: floorOf(b), z: p[1] }; }
    var api = {
      ready: ready, update: update,
      nearestDoor: function (pos) {
        if (!pos) return null;
        var b = nearestBuilding(pos.x, pos.z, ACTIVATE_M); if (!b) return null;
        var d = doorWorld(b, 0), dx = d.x - pos.x, dz = d.z - pos.z;
        return { building: b, id: b.id, recipe: b.recipe, door: d, dist_m: Math.sqrt(dx * dx + dz * dz) / U };
      },
      enter: function (id) { var b = byId[id]; if (!b) return null; var r = activate(b); var p = toWorld(b, r.L.door.x, r.L.D / 2 - 1.4); return { x: p[0], y: r.floorY, z: p[1], rotY: b.rot + Math.PI }; },
      exit: function () { if (!active) return null; var b = active.b, p = toWorld(b, active.L.door.x, active.L.D / 2 + 1.8); return { x: p[0], y: active.floorY, z: p[1], rotY: b.rot }; },
      isInside: function () { return inside; },
      current: function () { return active ? active.b : null; },
      active: function () { return active; },
      building: function (id) { return byId[id] || null; },
      buildings: function () { return buildings; },
      register: function (spec) { return addBuilding(spec && spec.recipe && spec.cx != null ? spec : registerBoard(spec)); },
      handleInteract: handleInteract, nearestUse: nearestUse,
      use: function (pos) { var m = nearestUse(pos); return m ? handleInteract(m) : false; },
      setNpcFactory: function (fn) { npcFactory = typeof fn === 'function' ? fn : null; },
      layoutOf: function (id) { var b = byId[id]; return b ? makeLayout(b, furniture) : null; },
      // agents use the same slots as humans: world positions of every NPC slot and use point of a building
      slots: function (id) {
        var b = byId[id]; if (!b) return null;
        var L = (active && active.b === b) ? active.L : makeLayout(b, furniture), y = floorOf(b);
        function w(p, extra) { var q = toWorld(b, p.x, p.z), o = { x: q[0], y: y, z: q[1] }; for (var k in extra) o[k] = extra[k]; return o; }
        return { npcs: L.npcs.map(function (n) { return w(n, { role: n.role, kind: n.kind }); }),
          uses: L.uses.map(function (u) { return w(u, { type: u.type, kind: u.kind, tag: u.tag }); }), door: w({ x: L.door.x, z: L.D / 2 + 1.0 }, {}), farm: L.farm || null };
      },
      // ownable buildings (growth-farm towers, homes): data hook only — the plot/ledger backend owns claims and SPARKS
      setOwner: function (id, ownerId) {
        var b = byId[id]; if (!b) return false;
        b.ownerId = ownerId == null ? null : String(ownerId);
        var recs = cache.concat(active ? [active] : []);
        recs.forEach(function (r) {
          if (r.b !== b) return;
          if (r.L.farm) r.L.farm.ownerId = b.ownerId;
          r.markers.forEach(function (m) { if ('owner_id' in m.props) m.props.owner_id = b.ownerId; });
        });
        return true;
      },
      stats: function () {
        var by = {}; buildings.forEach(function (b) { by[b.recipe] = (by[b.recipe] || 0) + 1; });
        return { loaded: loaded, buildings: buildings.length, byRecipe: by, active: active ? active.b.id : null, inside: inside,
          cached: cache.map(function (r) { return r.b.id; }), alive: cache.length + (active ? 1 : 0), inScene: active ? 1 : 0,
          npcs: active ? active.npcs.length : 0, uses: active ? active.markers.length : 0, colliders: active ? active.cols.length : 0,
          lights: active ? Math.min(active.L.lights.length, MAX_LIGHTS) : 0, drawCalls: active ? active.own.length + 2 + active.npcs.length * 2 : 0,
          built: st.built, disposed: st.disposed, swaps: st.swaps, enters: st.enters, exits: st.exits };
      },
      dispose: function () {
        deactivate(); while (cache.length) disposeRecord(cache.pop());
        lightPool.forEach(function (l) { scene.remove(l); }); disposed = true;
        Object.keys(templates).forEach(function (k) { templates[k].parts.forEach(function (p) { p.geo.dispose(); }); });
        unitBox.dispose(); npcGeo.dispose(); visorGeo.dispose();
        Object.keys(styles).forEach(function (s) { var set = styles[s]; Object.keys(set).forEach(function (k) { set[k].dispose(); }); });
        Object.keys(fbMats).forEach(function (k) { fbMats[k].dispose(); }); Object.keys(npcMats).forEach(function (k) { npcMats[k].dispose(); });
      }
    };
    return api;
  }

  var PURE = { U: U, WALL_T: WALL_T, PLAYER_R: PLAYER_R, ACTIVATE_M: ACTIVATE_M, RELEASE_M: RELEASE_M, MAX_NPCS: MAX_NPCS, MAX_LIGHTS: MAX_LIGHTS, CACHE_N: CACHE_N,
    SC_TYPES: SC_TYPES, CANON_BUILDINGS: CANON_BUILDINGS, STYLE_DEF: STYLE_DEF, circleHabitat: circleHabitat, BOARD_RECIPES: BOARD_RECIPES, RECIPES: RECIPES, FALLBACK: FALLBACK, ARCADE_GAMES: ARCADE_GAMES,
    hash: hash, rngOf: rngOf, rotPt: rotPt, rectsOverlap: rectsOverlap, inRect: inRect, metaFor: metaFor, resolveKind: resolveKind,
    makeLayout: makeLayout, indexBuildings: indexBuildings, registerBoard: registerBoard, faceFrame: faceFrame, toWorld: toWorld, toLocal: toLocal,
    worldColliders: worldColliders, reachability: reachability, useMarker: useMarker, USE_MARKERS: USE_MARKERS };
  build.pure = PURE;
  if (root) root.buildWorldInteriorsV3 = build;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; module.exports.build = build; }
})(typeof window !== 'undefined' ? window : null);
