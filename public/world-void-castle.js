/* world-void-castle.js — THE VOID CASTLE set piece on the far lip of the Deep Void (Map v4, ?map=v4), 2026-09-27.
 *
 * Owner reference "void castle aesthetic", read as FUTURISTIC TECH-FUSION (not plain medieval):
 *   • a spired dark-indigo castle on a raised plinth (the "rise") on the NORTH lip of the Deep Void pit;
 *     the spires are energy conduits / antennas (instanced, lit conduit rings + tip beacons),
 *   • a glowing BRAIN-SHAPED NEBULA DOME (neural core) crowning the ~55 m central tower,
 *   • a lit portcullis gate facing south, toward the Grid-side overlook,
 *   • a CAUSEWAY from the overlook straight over the pit (a void bridge on pylons): black cells with animated
 *     violet→magenta veins (2D Worley in the fragment shader), cobble parapets, orange FIRE BRAZIERS every 12 m
 *     (the only warm light), magenta glowing beds outside the parapets,
 *   • a local spiral-galaxy VORTEX (bright core) hanging over the castle — not a skybox.
 *   Palette: indigo/obsidian stone, violet #7A3DFF, magenta #FF2BD6, cyan #3DFFF0, ember #FF4A1A.
 *
 * Built procedurally in METRES inside a sub-group scaled by U (= 7/1.8 game units per metre). Hard-edged, flat-shaded
 * merged geometry (no BufferGeometryUtils dependency — a tiny manual merger), ≈ 11 draw calls, < 60k triangles.
 * Coordinates: terrain.json metres X east, Y north, Z up  →  game x = X·U, y = Z·U, z = -Y·U.
 *
 *   window.buildWorldVoidCastle({ THREE, scene, heightAt (game units → game units), terrainMeta (terrain.json),
 *                                 getPlayer?():{pos}, nightFactor?():0..1 | number, quality?: 'LOW'|'MEDIUM'|'HIGH',
 *                                 vortex?: bool, lights?: 0..4 })
 *     → { group, update(t, dt), colliders, walkableTops, anchors, stats(), dispose() }
 *
 *   colliders    : realmCollider records (game units) — {x,z,hx,hz,rot,top,label} rotated boxes and {x,z,r,top,label}
 *                  circles, exactly what world-collision.js / world-player-controller.js read from
 *                  WORLD_LAYOUT.realmColliders. Walls, towers, gatehouse (closed portcullis), keep, plinth, parapets, pylons.
 *   walkableTops : WORLD_WALKABLE_TOPS records — one per solid (so you can stand on the plinth / wall tops) plus
 *                  stand-alone causeway DECK segments (walk on the bridge, fall past it into the pit).
 */
(function () {
  var U = 7 / 1.8;
  var PAL = { violet: 0x7a3dff, magenta: 0xff2bd6, cyan: 0x3dfff0, ember: 0xff4a1a,
    stone: 0x1b1638, stoneDark: 0x0f0c22, stoneTrim: 0x2a2356, plinth: 0x141029, cobble: 0x231d3c, seam: 0x07060f,
    portcullis: 0xd25cff, backlight: 0x2a0f55, indigo: 0x1a0b3d };

  // ── GLSL (WebGL1/2: no dynamic loops, no derivatives, no texture lookups) ─────────────────────────────────────
  var GLSL_NOISE = [
    'float vcH1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'vec2 vcH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }',
    'float vcNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(vcH1(i), vcH1(i + vec2(1.0, 0.0)), f.x), mix(vcH1(i + vec2(0.0, 1.0)), vcH1(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float vcFbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vcNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }',
    // 2D Worley: returns (F1, F2); feature points orbit with time → the veins crawl like caustics
    'vec2 vcWorley(vec2 p, float t){ vec2 n = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;',
    '  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = vcH2(n + g);',
    '    o = 0.5 + 0.42 * sin(t + 6.2831 * o); vec2 r = g + o - f; float d = dot(r, r);',
    '    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; } }',
    '  return vec2(sqrt(d1), sqrt(d2)); }'
  ].join('\n');

  var DECK_VS = [
    'attribute float aS; attribute float aD;',
    'varying float vS; varying float vD;',
    '#include <fog_pars_vertex>',
    'void main(){ vS = aS; vD = aD;',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  var DECK_FS = [
    'uniform float uTime; uniform float uGlow; uniform vec3 uViolet; uniform vec3 uMagenta; uniform vec3 uCyan; uniform vec3 uBase;',
    'varying float vS; varying float vD;',
    '#include <fog_pars_fragment>',
    GLSL_NOISE,
    'void main(){',
    '  vec2 p = vec2(vD, vS) * 0.42;',                                   // path-aligned → cells follow the curve
    '  vec2 w1 = vcWorley(p, uTime * 0.55);',
    '  vec2 w2 = vcWorley(p * 2.3 + 7.1, uTime * 0.8);',
    '  float e1 = w1.y - w1.x, e2 = w2.y - w2.x;',
    '  float vein = 1.0 - smoothstep(0.0, 0.075, e1);',
    '  float fine = (1.0 - smoothstep(0.0, 0.05, e2)) * 0.45;',
    '  float caustic = pow(max(vein, fine), 1.4);',
    '  float flow = 0.5 + 0.5 * sin(vS * 0.12 - uTime * 1.6);',             // pulses travel toward the gate
    '  float wv = 0.5 + 0.5 * sin(vS * 0.031 + vD * 0.4 + uTime * 0.35);',
    '  vec3 col = uBase * (0.55 + 0.9 * w1.x);',                          // black obsidian cells, faint sheen
    '  col += mix(uViolet, uMagenta, wv) * caustic * (0.5 + 0.8 * flow) * uGlow;',
    '  col += uCyan * (1.0 - smoothstep(0.0, 0.025, e1)) * 0.22 * flow * uGlow;',
    '  float f = fract(vS * 0.25); float seamM = min(f, 1.0 - f) * 4.0;',     // panel seams every 4 m
    '  float seam = 1.0 - smoothstep(0.02, 0.07, seamM);',
    '  col *= 1.0 - 0.55 * seam; col += uCyan * seam * 0.06 * uGlow;',
    '  float edge = smoothstep(3.72, 3.95, abs(vD));',                    // thin cyan inlay at the walkway edge
    '  col += uCyan * edge * 0.55 * uGlow;',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <fog_fragment>',
    '}'
  ].join('\n');

  var BED_FS = [
    'uniform float uTime; uniform float uGlow; uniform vec3 uMagenta; uniform vec3 uViolet;',
    'varying float vS; varying float vD;',
    '#include <fog_pars_fragment>',
    GLSL_NOISE,
    'void main(){',
    '  vec2 p = vec2(vD * 1.6, vS * 0.9);',
    '  float n = vcFbm(p + vec2(0.0, uTime * 0.15));',
    '  float breathe = 0.8 + 0.2 * sin(uTime * 1.3 + vS * 0.2);',
    '  vec3 col = mix(uViolet * 0.5, uMagenta, smoothstep(0.3, 0.75, n)) * (0.35 + 0.8 * n) * breathe;',
    '  vec2 c = floor(p * 3.0); float tw = step(0.965, vcH1(c)) * (0.5 + 0.5 * sin(uTime * 3.0 + vcH1(c + 3.1) * 40.0));',
    '  col += vec3(1.0, 0.75, 1.0) * tw * 0.8;',
    '  gl_FragColor = vec4(col * uGlow, 1.0);',
    '  #include <fog_fragment>',
    '}'
  ].join('\n');

  var DOME_VS = [
    'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'void main(){ vP = position;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv; }'
  ].join('\n');
  var DOME_FS = [
    'uniform float uTime; uniform float uGlow; uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uMagenta; uniform vec3 uCyan;',
    'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    GLSL_NOISE,
    'void main(){',
    '  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);',
    '  vec3 d = normalize(vP);',
    '  float a = uTime * 0.08; float ca = cos(a), sa = sin(a);',
    '  vec2 q = vec2(ca * d.x - sa * d.z, sa * d.x + ca * d.z) * 2.2 + vec2(d.y * 1.7, -d.y * 1.3);',
    '  vec2 wq = vec2(vcFbm(q + uTime * 0.05), vcFbm(q * 1.3 - 3.7 - uTime * 0.04));',   // domain warp = nebula swirl
    '  float n = vcFbm(q + 2.2 * wq + uTime * 0.06);',
    '  float fil = 1.0 - smoothstep(0.0, 0.045, abs(n - 0.5));',                          // neural filaments
    '  vec3 col = mix(uIndigo, uViolet, smoothstep(0.25, 0.65, n));',
    '  col = mix(col, uMagenta, smoothstep(0.6, 0.85, n));',
    '  col += uCyan * fil * 0.9;',
    '  float pulse = 0.85 + 0.15 * sin(uTime * 1.7);',
    '  gl_FragColor = vec4(col * (0.18 + 1.1 * fres + 0.35 * n) * pulse * uGlow, 1.0);',
    '}'
  ].join('\n');

  var VORTEX_VS = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');
  var VORTEX_FS = [
    'uniform float uTime; uniform float uGlow; uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uMagenta; uniform vec3 uCyan;',
    'varying vec2 vUv;',
    GLSL_NOISE,
    'void main(){',
    '  vec2 p = (vUv - 0.5) * 2.0; float r = length(p);',
    '  if (r > 1.0) discard;',
    '  float a = atan(p.y, p.x); float spin = uTime * 0.05;',
    '  float arm = pow(0.5 + 0.5 * cos(2.0 * (a + spin) - 5.2 * log(r + 0.02)), 3.0);',   // 2 log-spiral arms (seam-free: integer × a)
    '  float cs = cos(spin), sn = sin(spin); vec2 rp = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);',
    '  float dust = vcFbm(rp * 4.0 + 3.0);',
    '  float disc = 1.0 - smoothstep(0.25, 1.0, r);',
    '  float core = exp(-r * r * 55.0) * 2.5 + exp(-r * 9.0) * 0.6;',
    '  vec3 col = uIndigo * 0.3 * disc + mix(uMagenta, uViolet, smoothstep(0.1, 0.7, r)) * arm * disc * (0.35 + 0.9 * dust);',
    '  col += mix(vec3(1.0), uCyan, 0.35) * core;',
    '  vec2 sc = floor(rp * 160.0); float st = step(0.994, vcH1(sc)) * disc * (0.55 + 0.45 * sin(uTime * 2.5 + vcH1(sc + 3.0) * 30.0));',
    '  col += vec3(st) * 0.9;',
    '  gl_FragColor = vec4(col * uGlow, 1.0);',
    '}'
  ].join('\n');

  var FLAME_VS = [
    'attribute vec2 aCorner; attribute float aSeed;',
    'uniform float uTime; uniform float uSize;',
    'varying vec2 vUv; varying float vSeed; varying float vFl;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',                      // position = brazier flame root (metres)
    '  float fl = 0.82 + 0.12 * sin(uTime * 11.0 + aSeed * 17.0) + 0.08 * sin(uTime * 23.0 + aSeed * 5.0);',
    '  vFl = fl; vUv = aCorner; vSeed = aSeed;',
    '  mv.x += aCorner.x * uSize * 0.55;',                                     // camera-facing billboard (view space)
    '  mv.y += (aCorner.y * 0.5 + 0.5) * uSize * 1.6 * fl - uSize * 0.1;',
    '  gl_Position = projectionMatrix * mv; }'
  ].join('\n');
  var FLAME_FS = [
    'uniform float uTime; uniform vec3 uEmber;',
    'varying vec2 vUv; varying float vSeed; varying float vFl;',
    'void main(){',
    '  float y = vUv.y * 0.5 + 0.5;',
    '  float x = vUv.x + sin(y * 7.0 - uTime * 9.0 + vSeed * 6.0) * 0.18 * y;',
    '  float w = mix(0.85, 0.05, pow(y, 0.9));',
    '  float body = 1.0 - smoothstep(w * 0.35, w, abs(x));',
    '  body *= smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.7, 1.0, y));',
    '  float hot = pow(body, 2.5) * (1.0 - y);',
    '  vec3 col = uEmber * body * 1.4 + vec3(1.0, 0.78, 0.35) * hot * 1.6;',
    '  gl_FragColor = vec4(col * vFl, 1.0);',
    '}'
  ].join('\n');

  // ── tiny deterministic RNG (same castle every load) ──
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── the causeway centreline (metres, atlas XY): overlook → straight-ish S over the pit → the gate ──
  function pathXY(s, P) {                     // s ∈ [0,1]; lateral S-sway with zero slope at both ends
    return [P.x0 + P.sway * Math.sin(2 * Math.PI * s) * Math.sin(Math.PI * s), P.y0 + (P.y1 - P.y0) * s];
  }

  window.buildWorldVoidCastle = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, heightAt = opts.heightAt || function () { return 0; };
    var T = opts.terrainMeta || {}, V = (T.features && T.features.void) || {};
    var UU = +T.units_per_m || U;
    var PIT = V.pit_centre_m || [0, 3700], PIT_R = +V.pit_r_m || 165, LIP = V.lip_z_m != null ? +V.lip_z_m : 31.71;
    var OVL = V.overlook_m || [PIT[0], PIT[1] - 187];
    var quality = String(opts.quality || (typeof window !== 'undefined' && window.__quality) || 'MEDIUM').toUpperCase();
    var wantVortex = opts.vortex !== false && quality !== 'LOW';
    var maxLights = Math.max(0, Math.min(4, opts.lights == null ? 4 : +opts.lights | 0));
    var rand = rng(0x5ADDA1);
    function hM(X, Y) { var h = heightAt(X * UU, -Y * UU); return isFinite(h) ? h / UU : LIP; }   // metres

    // ── layout (metres) ──
    var dirY = (PIT[1] >= OVL[1]) ? 1 : -1;                   // castle sits on the pit's far side from the overlook
    var CX = PIT[0], CY = PIT[1] + dirY * (PIT_R + 15);        // castle centre, 180 m from the pit centre
    var TOP = LIP + 0.4;                                        // plinth top = causeway deck = the lip, level across
    var PL = 40, PLB = 46;                                      // plinth half-size top / bottom
    var GATE_V = -37;                                           // gatehouse front face (castle-local v, toward overlook)
    var P = { x0: OVL[0], y0: OVL[1] + dirY * 8, y1: CY - dirY * (PL - 1), sway: 18 };
    function cv(u, v) { return [CX + u * dirY, CY + v * dirY]; }   // castle-local (u right, v toward north-when-dirY=1) → XY

    // ── merge builders ──
    var root = new THREE.Group(); root.name = 'world-void-castle';
    var geo = new THREE.Group(); geo.name = 'void-castle-geo'; geo.scale.setScalar(UU); root.add(geo);
    var _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
    var tplCache = {};
    function flat(g) { var n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
    function tpl(key, make) { return tplCache[key] || (tplCache[key] = flat(make())); }
    function Builder() { this.p = []; this.n = []; this.c = []; }
    Builder.prototype.add = function (g, m, hex, jit) {
      var pa = g.attributes.position.array, na = g.attributes.normal.array, e = m.elements, i;
      _n.getNormalMatrix(m); var ne = _n.elements;
      _c.setHex(hex); var k = jit ? 1 + (rand() - 0.5) * jit : 1, r = _c.r * k, gg = _c.g * k, b = _c.b * k;
      for (i = 0; i < pa.length; i += 3) {
        var x = pa[i], y = pa[i + 1], z = pa[i + 2];
        this.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        var nx = na[i], ny = na[i + 1], nz = na[i + 2];
        var ox = ne[0] * nx + ne[3] * ny + ne[6] * nz, oy = ne[1] * nx + ne[4] * ny + ne[7] * nz, oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        var L = Math.hypot(ox, oy, oz) || 1; this.n.push(ox / L, oy / L, oz / L);
        this.c.push(r, gg, b);
      }
    };
    Builder.prototype.tri = function (a, b, c, hex, hint) {    // flat triangle; flipped if it faces away from `hint`
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz) || 1;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { var t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      _c.setHex(hex);
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (var i = 0; i < 3; i++) { this.n.push(nx / L, ny / L, nz / L); this.c.push(_c.r, _c.g, _c.b); }
    };
    Builder.prototype.geometry = function () {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.computeBoundingSphere(); g.computeBoundingBox(); return g;
    };
    function M(x, y, z, sx, sy, sz, rx, ry, rz) {             // local metres: (X, height, -Y)
      _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
      return _m.compose(_v, _q, _s);
    }
    var BOX = tpl('box', function () { return new THREE.BoxGeometry(1, 1, 1); });
    function oct(rt, rb, open) { return tpl('oct' + rt + '_' + rb + (open ? 'o' : ''), function () { return new THREE.CylinderGeometry(rt, rb, 1, 8, 1, !!open, Math.PI / 8); }); }
    function hex6(rt, rb) { return tpl('hex' + rt + '_' + rb, function () { return new THREE.CylinderGeometry(rt, rb, 1, 6); }); }
    // XY + height → local
    function boxXY(B, X, Y, h0, h1, sx, sz, rotY, hex, jit) { B.add(BOX, M(X, (h0 + h1) / 2, -Y, sx, h1 - h0, sz, 0, rotY || 0, 0), hex, jit); }
    function octXY(B, X, Y, h0, h1, r, hex, rTop) { B.add(oct(rTop == null ? 1 : rTop / r, 1), M(X, (h0 + h1) / 2, -Y, r, h1 - h0, r), hex); }

    var stone = new Builder(), glow = new Builder();
    var colliders = [], tops = [];
    function addObb(X, Y, hx, hz, rot, top, label, deckOnly) {
      var r = { x: X * UU, z: -Y * UU, hx: hx * UU, hz: hz * UU, rot: rot || 0, top: top * UU, label: 'void-castle:' + label };
      if (!deckOnly) colliders.push(r);
      tops.push({ type: 'obb', x: r.x, z: r.z, hx: r.hx, hz: r.hz, rot: r.rot, top: r.top, kind: 'void-castle:' + label, deck: !!deckOnly || undefined });
    }
    function addCircle(X, Y, rad, top, label) {
      var r = { x: X * UU, z: -Y * UU, r: rad * UU, top: top * UU, label: 'void-castle:' + label };
      colliders.push(r); tops.push({ type: 'circle', x: r.x, z: r.z, r: r.r, top: r.top, kind: 'void-castle:' + label });
    }
    var castleRot = dirY > 0 ? 0 : Math.PI;                   // castle-local frame → world yaw

    // ════════ PLINTH (the rise) ════════
    var baseMin = Infinity;
    for (var gi = -4; gi <= 4; gi++) for (var gj = -4; gj <= 4; gj++) baseMin = Math.min(baseMin, hM(CX + gi * PLB / 4, CY + gj * PLB / 4));
    var PB = Math.min(baseMin - 2, TOP - 4);
    stone.add(tpl('plinth', function () { return new THREE.CylinderGeometry(PL * Math.SQRT2, PLB * Math.SQRT2, 1, 4, 1, false, Math.PI / 4); }),
      M(CX, (PB + TOP) / 2, -CY, 1, TOP - PB, 1), PAL.plinth);
    for (var e4 = 0; e4 < 4; e4++) {                          // cyan top-edge inlays + a dark panel seam band
      var ang = e4 * Math.PI / 2, ex = Math.sin(ang) * (PL + 0.02), ez = Math.cos(ang) * (PL + 0.02);
      glow.add(BOX, M(CX + ex, TOP - 0.18, -CY + ez, 2 * PL + 0.1, 0.12, 0.12, 0, ang, 0), PAL.cyan);
      glow.add(BOX, M(CX + ex * 1.03, TOP - 3.2, -CY + ez * 1.03, 2 * PL * 1.02, 0.1, 0.1, 0, ang, 0), PAL.violet);
    }
    addObb(CX, CY, PL + 2, PL + 2, 0, TOP, 'plinth');

    // ════════ CURTAIN WALLS + MERLONS + INLAYS ════════
    var W = 30, WT = 3, WH = 12, H0 = TOP - 0.5;
    function wallRun(u0, v0, u1, v1, label) {              // a straight wall between two castle-local points
      var a = cv(u0, v0), b = cv(u1, v1), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      boxXY(stone, mx, my, H0, TOP + WH, len, WT, rot, PAL.stone);
      var tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = ty, ny = -tx;   // outward normal: caller orders points
      for (var d = 1.6; d < len - 1; d += 3.2) {             // tech merlons: angular fins on the outer half
        boxXY(stone, a[0] + tx * d + nx * 0.7, a[1] + ty * d + ny * 0.7, TOP + WH, TOP + WH + 1.5, 1.6, 1.2, rot, PAL.stoneTrim, 0.2);
      }
      for (var sd = 7.5; sd < len - 1; sd += 7.5) boxXY(stone, a[0] + tx * sd + nx * (WT / 2 + 0.02), a[1] + ty * sd + ny * (WT / 2 + 0.02), H0 + 0.5, TOP + WH - 0.3, 0.18, 0.1, rot, PAL.seam);
      boxXY(glow, mx + nx * (WT / 2 + 0.04), my + ny * (WT / 2 + 0.04), TOP + 10.4, TOP + 10.55, len - 1, 0.08, rot, PAL.cyan);
      boxXY(glow, mx + nx * (WT / 2 + 0.04), my + ny * (WT / 2 + 0.04), TOP + 2.0, TOP + 2.1, len - 1, 0.08, rot, PAL.violet);
      addObb(mx, my, len / 2, WT / 2, rot, TOP + WH, label);
    }
    // counter-clockwise seen from above (Y north) so the right-hand normal (ty, -tx) points outward
    wallRun(W, W, -W, W, 'wall-n');
    wallRun(W, -W, W, W, 'wall-e');
    wallRun(-W, W, -W, -W, 'wall-w');
    wallRun(8, -W, W, -W, 'wall-s-e');
    wallRun(-W, -W, -8, -W, 'wall-s-w');

    // ════════ TOWERS (corner ×4, gate ×2) — spires sit on top via InstancedMesh ════════
    var spireSpots = [];
    function tower(u, v, r, h, spireLen, label) {
      var p = cv(u, v);
      octXY(stone, p[0], p[1], H0, TOP + h, r, PAL.stone);
      octXY(stone, p[0], p[1], TOP + h - 0.8, TOP + h + 0.8, r * 1.15, PAL.stoneTrim, r * 1.15 * 1.08);   // crown flare
      octXY(stone, p[0], p[1], TOP + h + 0.8, TOP + h + 1.2, r * 0.82, PAL.stoneDark);
      [0.33, 0.66].forEach(function (f) { glow.add(oct(1, 1, true), M(p[0], TOP + h * f, -p[1], r * 1.012, 0.16, r * 1.012), PAL.violet); });
      for (var k = 0; k < 8; k += 2) {                       // slit windows on alternating faces
        var th = k * Math.PI / 4 + castleRot, ap = r * Math.cos(Math.PI / 8) + 0.03;
        glow.add(BOX, M(p[0] + Math.sin(th) * ap, TOP + h * 0.5, -p[1] + Math.cos(th) * ap, 0.35, 2.6, 0.06, 0, th, 0), PAL.magenta);
      }
      spireSpots.push({ X: p[0], Y: p[1], h: TOP + h + 1.2, len: spireLen });
      addCircle(p[0], p[1], r * 1.02, TOP + h, label);
    }
    tower(-W, W, 5.5, 20, 17, 'tower-nw'); tower(W, W, 5.5, 20, 16, 'tower-ne');
    tower(W, -W, 5.5, 20, 16, 'tower-se'); tower(-W, -W, 5.5, 20, 17, 'tower-sw');
    tower(-10, GATE_V + 2, 3.5, 16, 13, 'tower-gate-w'); tower(10, GATE_V + 2, 3.5, 16, 13, 'tower-gate-e');

    // ════════ GATEHOUSE + LIT PORTCULLIS ════════
    (function () {
      var v0 = GATE_V, v1 = -W + 1.5, vm = (v0 + v1) / 2, depth = v1 - v0, GH = 16, OW = 3.2, OH = 9.5;
      function gb(u0, u1, h0, h1, hex) { var c = cv((u0 + u1) / 2, vm); boxXY(stone, c[0], c[1], h0, h1, u1 - u0, depth, castleRot, hex); }
      gb(-8, -OW, H0, TOP + GH, PAL.stone); gb(OW, 8, H0, TOP + GH, PAL.stone); gb(-OW, OW, TOP + OH, TOP + GH, PAL.stone);
      // pointed-arch corbels (hard, angular — reads as a tech aperture)
      [-1, 1].forEach(function (sg) { var c = cv(sg * (OW - 0.9), vm);
        stone.add(BOX, M(c[0], TOP + OH - 0.9, -c[1], 2.6, 0.9, depth + 0.02, 0, castleRot, -sg * 0.75 * dirY), PAL.stoneTrim); });
      for (var u = -7; u <= 7; u += 2) { var mc = cv(u, v0 + 0.8); boxXY(stone, mc[0], mc[1], TOP + GH, TOP + GH + 1.3, 1.2, 1.2, castleRot, PAL.stoneTrim, 0.2); }
      // portcullis: glowing bars just inside the front face, backlit passage behind
      var pv = v0 + 0.6;
      for (var bu = -2.8; bu <= 2.81; bu += 0.8) { var bc = cv(bu, pv); boxXY(glow, bc[0], bc[1], TOP, TOP + OH - 0.2, 0.14, 0.14, castleRot, PAL.portcullis); }
      for (var bh = 1.2; bh < OH - 0.5; bh += 1.6) { var hc = cv(0, pv); boxXY(glow, hc[0], hc[1], TOP + bh, TOP + bh + 0.14, 2 * OW - 0.2, 0.12, castleRot, PAL.portcullis); }
      var bl = cv(0, v1 - 0.5); boxXY(glow, bl[0], bl[1], TOP, TOP + OH, 2 * OW, 0.1, castleRot, PAL.backlight);
      var ff = cv(0, v0 - 0.02);                                     // frame inlays + sigil ring above the gate
      [-1, 1].forEach(function (sg) { var fc = cv(sg * (OW + 0.1), v0 - 0.03); boxXY(glow, fc[0], fc[1], TOP, TOP + OH - 1.4, 0.12, 0.06, castleRot, PAL.cyan); });
      glow.add(tpl('sigil', function () { return new THREE.TorusGeometry(1.6, 0.12, 6, 24); }), M(ff[0], TOP + 12.6, -ff[1] + 0.04 * dirY, 1, 1, 1, 0, castleRot, 0), PAL.magenta);
      var gc = cv(0, vm);
      addObb(gc[0], gc[1], 8, depth / 2, castleRot, TOP + GH, 'gatehouse');   // closed portcullis → solid (remove to open)
    })();

    // ════════ KEEP + CENTRAL TOWER (~55 m) + CROWN ════════
    var DOME_H = TOP + 54.5, DOME_R = 9.5;
    (function () {
      var c = cv(0, 2), X = c[0], Y = c[1];
      boxXY(stone, X, Y, H0, TOP + 18, 24, 24, castleRot, PAL.stone);
      for (var k4 = 0; k4 < 4; k4++) { var a4 = k4 * Math.PI / 2; for (var u2 = -8; u2 <= 8; u2 += 4)
        stone.add(BOX, M(X + Math.sin(a4) * 12.4 + Math.cos(a4) * u2, TOP + 18.6, -Y + Math.cos(a4) * 12.4 - Math.sin(a4) * u2, 1.6, 1.2, 0.8, 0, a4, 0), PAL.stoneTrim); }
      octXY(stone, X, Y, TOP + 18, TOP + 38, 9, PAL.stone, 8.6);
      octXY(stone, X, Y, TOP + 37.4, TOP + 38.8, 9.8, PAL.stoneTrim, 9.2);
      octXY(stone, X, Y, TOP + 38.8, TOP + 50, 7.5, PAL.stone, 7.2);
      octXY(stone, X, Y, TOP + 50, TOP + 52, 7.4, PAL.stoneTrim, 10.4);
      octXY(stone, X, Y, TOP + 52, TOP + 55, 10.4, PAL.stoneDark, 11);
      glow.add(oct(1, 1, true), M(X, TOP + 54.9, -Y, 11.05, 0.18, 11.05), PAL.cyan);
      glow.add(oct(1, 1, true), M(X, TOP + 38.1, -Y, 9.85, 0.14, 9.85), PAL.violet);
      for (var k = 0; k < 8; k++) {
        var th = k * Math.PI / 4 + castleRot, co = th + Math.PI / 8;
        // octagon corner seams (thin cyan conduits up the shaft)
        glow.add(BOX, M(X + Math.sin(co) * 8.85, TOP + 28, -Y + Math.cos(co) * 8.85, 0.1, 19, 0.1, 0, co, 0), PAL.cyan);
        [24, 31, 43, 47].forEach(function (hh) {
          var ap = (hh < 38 ? 8.8 : 7.35) * Math.cos(Math.PI / 8) + 0.04;
          glow.add(BOX, M(X + Math.sin(th) * ap, TOP + hh, -Y + Math.cos(th) * ap, 0.45, 2.8, 0.06, 0, th, 0), k % 2 ? PAL.violet : PAL.magenta);
        });
        if (k % 2 === 1) {                                     // antenna masts on the 38 m shoulder
          var mx = X + Math.sin(co) * 8.9, my = -Y + Math.cos(co) * 8.9;
          stone.add(hex6(0.12, 0.28), M(mx, TOP + 43, my, 1, 8.4, 1), PAL.stoneTrim);
          glow.add(tpl('octa', function () { return new THREE.OctahedronGeometry(0.35, 0); }), M(mx, TOP + 47.5, my, 1, 1.6, 1), PAL.cyan);
        }
      }
      var fc = cv(0, 2 - 12.05);                               // main conduit: gate-facing magenta line feeding the dome
      boxXY(glow, fc[0], fc[1], TOP + 1, TOP + 17.5, 0.3, 0.06, castleRot, PAL.magenta);
      var fc2 = cv(0, 2 - 8.3 * Math.cos(Math.PI / 8));
      boxXY(glow, fc2[0], fc2[1], TOP + 18.5, TOP + 37, 0.3, 0.06, castleRot, PAL.magenta);
      // cage ribs over the brain dome (neural-core frame)
      for (var rb = 0; rb < 3; rb++) glow.add(tpl('rib', function () { return new THREE.TorusGeometry(DOME_R * 1.06, 0.1, 5, 32, Math.PI); }),
        M(X, DOME_H, -Y, 1, 0.9, 1.15, 0, rb * Math.PI / 3 + castleRot, 0), PAL.cyan);
      addObb(X, Y, 12, 12, castleRot, TOP + 18, 'keep');
    })();

    // ════════ CAUSEWAY (void bridge): arc-length resample, deck ribbon, slab, beds, parapets, pylons, braziers ════════
    var RAW = 800, cum = [0], raw = [pathXY(0, P)];
    for (var ri = 1; ri <= RAW; ri++) { raw.push(pathXY(ri / RAW, P)); cum.push(cum[ri - 1] + Math.hypot(raw[ri][0] - raw[ri - 1][0], raw[ri][1] - raw[ri - 1][1])); }
    var LEN = cum[RAW], STEP = 2, NS = Math.max(2, Math.round(LEN / STEP)) + 1, S = [];
    for (var si = 0, rj = 0; si < NS; si++) {
      var sd = LEN * si / (NS - 1); while (rj < RAW - 1 && cum[rj + 1] < sd) rj++;
      var f = (sd - cum[rj]) / ((cum[rj + 1] - cum[rj]) || 1), X0 = raw[rj][0] + (raw[rj + 1][0] - raw[rj][0]) * f, Y0 = raw[rj][1] + (raw[rj + 1][1] - raw[rj][1]) * f;
      S.push({ X: X0, Y: Y0, s: sd, g: hM(X0, Y0) });
    }
    for (si = 0; si < NS; si++) {                               // tangent (XY) + right-hand lateral + deck height
      var a0 = S[Math.max(0, si - 1)], a1 = S[Math.min(NS - 1, si + 1)], tl = Math.hypot(a1.X - a0.X, a1.Y - a0.Y) || 1;
      S[si].tx = (a1.X - a0.X) / tl; S[si].ty = (a1.Y - a0.Y) / tl; S[si].nx = S[si].ty; S[si].ny = -S[si].tx;
      S[si].y = Math.max(TOP, S[si].g + 0.35);
    }
    for (var pass = 0; pass < 3; pass++) for (si = 1; si < NS - 1; si++) S[si].y = Math.max(S[si].y, (S[si - 1].y + S[si + 1].y) / 2);
    function at(sd) { var i = Math.min(NS - 2, Math.max(0, Math.floor(sd / LEN * (NS - 1)))), fr = sd / LEN * (NS - 1) - i, A = S[i], B = S[i + 1];
      return { X: A.X + (B.X - A.X) * fr, Y: A.Y + (B.Y - A.Y) * fr, y: A.y + (B.y - A.y) * fr, tx: A.tx, ty: A.ty, nx: A.nx, ny: A.ny, g: A.g + (B.g - A.g) * fr }; }
    function lp(smp, d, dy) { return [smp.X + smp.nx * d, smp.y + dy, -(smp.Y + smp.ny * d)]; }
    function ribbon(B, dA, yA, dB, yB, hex, hint) {             // extrude a cross-section edge along the path
      for (var i = 0; i < NS - 1; i++) {
        var s0 = S[i], s1 = S[i + 1], a = lp(s0, dA, yA), b = lp(s0, dB, yB), c = lp(s1, dB, yB), d = lp(s1, dA, yA);
        var hn = hint === 'up' ? [0, 1, 0] : hint === 'down' ? [0, -1, 0] : [s0.nx * hint, 0, -s0.ny * hint];
        B.tri(a, b, c, hex, hn); B.tri(a, c, d, hex, hn);
      }
    }
    var WALK = 4, PAR0 = 4, PAR1 = 4.8, BED1 = 6.4, SLAB = 6.7, SLAB_T = 1.6;
    ribbon(stone, -SLAB, -SLAB_T, SLAB, -SLAB_T, PAL.stoneDark, 'down');
    [-1, 1].forEach(function (sg) {
      ribbon(stone, sg * SLAB, -SLAB_T, sg * SLAB, 0.5, PAL.stone, sg);             // slab + curb outer face
      ribbon(stone, sg * BED1, 0.5, sg * SLAB, 0.5, PAL.stoneTrim, 'up');           // curb top
      ribbon(stone, sg * BED1, 0.3, sg * BED1, 0.5, PAL.stoneTrim, -sg);            // curb inner lip
      ribbon(glow, sg * (SLAB + 0.02), -1.25, sg * (SLAB + 0.02), -1.1, PAL.violet, sg);   // under-edge void light
      ribbon(glow, sg * (BED1 + 0.06), 0.52, sg * (SLAB - 0.06), 0.52, PAL.cyan, 'up');    // curb inlay
    });
    // shader ribbons (deck + beds): position + aS (arc metres) + aD (lateral metres)
    function shaderRibbon(d0, d1, dy) {
      var pos = [], aS = [], aD = [], idx = [];
      for (var i = 0; i < NS; i++) { var a = lp(S[i], d0, dy), b = lp(S[i], d1, dy); pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); aS.push(S[i].s, S[i].s); aD.push(d0, d1);
        if (i < NS - 1) { var k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      return { pos: pos, aS: aS, aD: aD, idx: idx };
    }
    function joinRibbons(list) {
      var pos = [], aS = [], aD = [], idx = [], base = 0;
      list.forEach(function (r) { pos = pos.concat(r.pos); aS = aS.concat(r.aS); aD = aD.concat(r.aD); r.idx.forEach(function (x) { idx.push(x + base); }); base += r.pos.length / 3; });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1)); g.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 1));
      g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
      // triangle winding faces up? (flip if the first triangle's normal points down) — materials are DoubleSide anyway
      return g;
    }
    var deckGeo = joinRibbons([shaderRibbon(-WALK - 0.02, WALK + 0.02, 0)]);
    var bedGeo = joinRibbons([shaderRibbon(-BED1, -PAR1, 0.3), shaderRibbon(PAR1, BED1, 0.3)]);

    // cobble parapets: jittered blocks + brazier posts every 12 m
    var BRZ = [];
    [-1, 1].forEach(function (sg) {
      var dMid = sg * (PAR0 + PAR1) / 2, pw = PAR1 - PAR0;
      for (var sd = 0.2; sd < LEN - 0.8;) {
        var bl = 1.15 + rand() * 0.35; if (sd + bl > LEN - 0.2) bl = LEN - 0.2 - sd;
        var m = at(sd + bl / 2), hgt = 0.95 + rand() * 0.2, rot = Math.atan2(m.ty, m.tx);
        boxXY(stone, m.X + m.nx * dMid, m.Y + m.ny * dMid, m.y - 0.05, m.y + hgt, bl - 0.12, pw * (0.92 + rand() * 0.08), rot, PAL.cobble, 0.35);
        sd += bl;
      }
      for (var cs = 0; cs < LEN - 1; cs += 8) {                 // parapet colliders: 8 m chords
        var ce = Math.min(LEN, cs + 8), mm = at((cs + ce) / 2);
        addObb(mm.X + mm.nx * dMid, mm.Y + mm.ny * dMid, (ce - cs) / 2 + 0.1, pw / 2, Math.atan2(mm.ty, mm.tx), mm.y + 1.1, 'parapet');
      }
      for (var bs = 6; bs < LEN - 3; bs += 12) {
        var bm = at(bs), brot = Math.atan2(bm.ty, bm.tx), px = bm.X + bm.nx * dMid, py = bm.Y + bm.ny * dMid;
        boxXY(stone, px, py, bm.y - 0.05, bm.y + 1.55, 1.3, 1.3, brot, PAL.stoneTrim);
        boxXY(glow, px + bm.nx * sg * 0.66, py + bm.ny * sg * 0.66, bm.y + 1.2, bm.y + 1.3, 1.1, 0.04, brot, PAL.cyan);
        BRZ.push({ X: px, Y: py, y: bm.y + 1.55, s: bs, side: sg });
      }
    });
    // pylons into the void (wherever the ground drops > 3 m under the deck)
    for (var ps = 10; ps < LEN - 10; ps += 16) {
      var pm = at(ps); if (pm.g > pm.y - 3) continue;
      var prot = Math.atan2(pm.ty, pm.tx), pb = pm.g - 1.5, ptop = pm.y - SLAB_T;
      boxXY(stone, pm.X, pm.Y, pb, ptop, 2.6, 9.5, prot, PAL.stone);
      boxXY(stone, pm.X, pm.Y, ptop - 1.2, ptop, 3.4, 11.5, prot, PAL.stoneTrim);
      [-1, 1].forEach(function (sg) { boxXY(glow, pm.X + pm.tx * sg * 1.32, pm.Y + pm.ty * sg * 1.32, pb + 1, ptop - 1.4, 0.06, 0.18, prot, PAL.violet); });
      addObb(pm.X, pm.Y, 1.3, 4.75, prot, ptop, 'pylon');
    }
    // walkable deck segments (stand-alone tops: walk on the bridge, fall past its edge into the pit)
    for (var ds = 0; ds < LEN - 0.5; ds += 8) {
      var de = Math.min(LEN, ds + 8), dm = at((ds + de) / 2);
      addObb(dm.X, dm.Y, (de - ds) / 2 + 0.3, SLAB, Math.atan2(dm.ty, dm.tx), dm.y, 'causeway', true);
    }

    // ════════ MESHES ════════
    var meshes = [], materials = [], geometries = [];
    function keep(mesh) { meshes.push(mesh); geo.add(mesh); if (mesh.geometry && geometries.indexOf(mesh.geometry) < 0) geometries.push(mesh.geometry); if (materials.indexOf(mesh.material) < 0) materials.push(mesh.material); return mesh; }
    function col3(h) { return new THREE.Color(h); }
    var fogU = (THREE.UniformsLib && THREE.UniformsLib.fog) ? THREE.UniformsLib.fog : {};

    var stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.38, emissive: new THREE.Color(0x0c0620), emissiveIntensity: 0.6 });
    var stoneMesh = keep(new THREE.Mesh(stone.geometry(), stoneMat)); stoneMesh.name = 'void-castle-stone'; stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
    var glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    var glowMesh = keep(new THREE.Mesh(glow.geometry(), glowMat)); glowMesh.name = 'void-castle-inlays';

    var deckMat = new THREE.ShaderMaterial({ name: 'void-causeway-veins', vertexShader: DECK_VS, fragmentShader: DECK_FS, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([fogU, { uTime: { value: 0 }, uGlow: { value: 1 }, uViolet: { value: col3(PAL.violet) }, uMagenta: { value: col3(PAL.magenta) },
        uCyan: { value: col3(PAL.cyan) }, uBase: { value: col3(0x05030a) } }]) });
    var deckMesh = keep(new THREE.Mesh(deckGeo, deckMat)); deckMesh.name = 'void-causeway-deck'; deckMesh.receiveShadow = true;
    var bedMat = new THREE.ShaderMaterial({ name: 'void-causeway-beds', vertexShader: DECK_VS, fragmentShader: BED_FS, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([fogU, { uTime: { value: 0 }, uGlow: { value: 1 }, uMagenta: { value: col3(PAL.magenta) }, uViolet: { value: col3(PAL.violet) } }]) });
    keep(new THREE.Mesh(bedGeo, bedMat)).name = 'void-causeway-beds';

    // spires: instanced (uniform scale = length; proportions r = 0.14·len)
    var spireGeo = (function () { var b = new Builder();
      b.add(hex6(0.16, 0.18), M(0, 0.03, 0, 1, 0.06, 1), PAL.stoneTrim);
      b.add(hex6(0.02, 0.13), M(0, 0.53, 0, 1, 0.94, 1), PAL.stone);
      for (var k = 0; k < 3; k++) { var a = k * Math.PI * 2 / 3; b.add(BOX, M(Math.sin(a) * 0.13, 0.35, Math.cos(a) * 0.13, 0.012, 0.5, 0.09, 0, a, 0), PAL.stoneDark); }
      return b.geometry(); })();
    var conduitGeo = (function () { var b = new Builder();
      [[0.25, 0.108], [0.5, 0.079], [0.72, 0.053]].forEach(function (r) { b.add(tpl('ring6', function () { return new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); }), M(0, r[0], 0, r[1] * 1.1, 0.014, r[1] * 1.1), PAL.violet); });
      b.add(tpl('octa', function () { return new THREE.OctahedronGeometry(0.35, 0); }), M(0, 1.045, 0, 0.1, 0.16, 0.1), PAL.cyan);
      for (var k = 0; k < 3; k++) { var a = k * Math.PI * 2 / 3; b.add(BOX, M(Math.sin(a) * 0.176, 0.35, Math.cos(a) * 0.176, 0.016, 0.46, 0.006, 0, a + Math.PI / 2, 0), PAL.magenta); }
      return b.geometry(); })();
    var spireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5, emissive: new THREE.Color(0x0c0620), emissiveIntensity: 0.6 });
    var spires = keep(new THREE.InstancedMesh(spireGeo, spireMat, spireSpots.length)); spires.name = 'void-castle-spires'; spires.castShadow = true;
    var conduits = keep(new THREE.InstancedMesh(conduitGeo, glowMat, spireSpots.length)); conduits.name = 'void-castle-spire-conduits';
    spireSpots.forEach(function (sp, i) { M(sp.X, sp.h, -sp.Y, sp.len, sp.len, sp.len, 0, i * 0.37, 0); spires.setMatrixAt(i, _m); conduits.setMatrixAt(i, _m); });
    spires.instanceMatrix.needsUpdate = true; conduits.instanceMatrix.needsUpdate = true;
    if (spires.computeBoundingSphere) { spires.computeBoundingSphere(); conduits.computeBoundingSphere(); }

    // braziers: instanced bowls; flames: ONE merged camera-facing billboard mesh (no per-frame CPU work)
    var brazGeo = (function () { var b = new Builder();
      b.add(hex6(0.25, 0.35), M(0, 0.25, 0, 1, 0.5, 1), 0x1a1626);
      b.add(tpl('bowl', function () { return new THREE.CylinderGeometry(0.62, 0.3, 1, 8); }), M(0, 0.72, 0, 1, 0.45, 1), 0x2a2140);
      b.add(tpl('rim', function () { return new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); }), M(0, 0.95, 0, 0.66, 0.07, 0.66), 0x3dfff0);
      b.add(tpl('coal', function () { return new THREE.CylinderGeometry(0.52, 0.52, 1, 8); }), M(0, 0.93, 0, 1, 0.04, 1), 0xff4a1a);
      return b.geometry(); })();
    var brazMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.65, emissive: new THREE.Color(0x2a0a02), emissiveIntensity: 1 });
    var braziers = keep(new THREE.InstancedMesh(brazGeo, brazMat, Math.max(1, BRZ.length))); braziers.name = 'void-causeway-braziers';
    BRZ.forEach(function (b, i) { M(b.X, b.y, -b.Y, 1, 1, 1, 0, i * 0.7, 0); braziers.setMatrixAt(i, _m); });
    braziers.count = BRZ.length; braziers.instanceMatrix.needsUpdate = true; if (braziers.computeBoundingSphere) braziers.computeBoundingSphere();
    var fl = { pos: [], corner: [], seed: [], idx: [] };
    BRZ.forEach(function (b, i) {
      for (var c = 0; c < 4; c++) { fl.pos.push(b.X, b.y + 0.95, -b.Y); fl.seed.push(rand() * 10); }
      fl.corner.push(-1, -1, 1, -1, 1, 1, -1, 1); var k = i * 4; fl.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    });
    var flameGeo = new THREE.BufferGeometry();
    flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(fl.pos, 3));
    flameGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(fl.corner, 2));
    flameGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(fl.seed, 1));
    flameGeo.setIndex(fl.idx); flameGeo.computeBoundingSphere();
    var flameMat = new THREE.ShaderMaterial({ name: 'void-brazier-flames', vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uSize: { value: 1.25 * UU }, uEmber: { value: col3(PAL.ember) } } });
    var flames = keep(new THREE.Mesh(flameGeo, flameMat)); flames.name = 'void-brazier-flames'; flames.frustumCulled = false; flames.renderOrder = 5;

    // brain-shaped nebula dome (sphere cap displaced: longitudinal fissure + gyri folds; elongated toward the gate)
    var domeGeo = new THREE.SphereGeometry(DOME_R, 64, 28, 0, Math.PI * 2, 0, Math.PI * 0.55);
    (function () {
      var pa = domeGeo.attributes.position, i;
      for (i = 0; i < pa.count; i++) {
        var x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), r = Math.hypot(x, y, z) || 1, nx = x / r, ny = y / r, nz = z / r;
        var fis = Math.exp(-Math.pow(nx * 7, 2)) * Math.max(0, Math.min(1, (ny - 0.05) / 0.45));
        var gyr = Math.sin(10 * Math.atan2(nz, nx) + 6 * ny + 3 * Math.sin(7 * ny + 2 * nx)) * Math.sin(9 * ny + 4 * nz);
        var k = 1 - 0.14 * fis + 0.04 * gyr * (0.3 + 0.7 * ny);
        pa.setXYZ(i, x * k, y * k * 0.86, z * k * 1.15);
      }
      domeGeo.computeVertexNormals(); domeGeo.computeBoundingSphere();
    })();
    var domeMat = new THREE.ShaderMaterial({ name: 'void-nebula-dome', vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uGlow: { value: 1 }, uIndigo: { value: col3(PAL.indigo) }, uViolet: { value: col3(PAL.violet) }, uMagenta: { value: col3(PAL.magenta) }, uCyan: { value: col3(PAL.cyan) } } });
    var kc = cv(0, 2);
    var dome = keep(new THREE.Mesh(domeGeo, domeMat)); dome.name = 'void-nebula-dome'; dome.position.set(kc[0], DOME_H, -kc[1]); dome.rotation.y = castleRot; dome.renderOrder = 4;
    var coreMat = new THREE.MeshBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    var core = keep(new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), coreMat)); core.name = 'void-neural-core'; core.position.set(kc[0], DOME_H + 2.2, -kc[1]); core.renderOrder = 3;

    // galaxy vortex: a local sky element above the castle, tilted to face the approach
    var vortex = null, vortexMat = null;
    if (wantVortex) {
      vortexMat = new THREE.ShaderMaterial({ name: 'void-galaxy-vortex', vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { uTime: { value: 0 }, uGlow: { value: 1 }, uIndigo: { value: col3(PAL.indigo) }, uViolet: { value: col3(PAL.violet) }, uMagenta: { value: col3(PAL.magenta) }, uCyan: { value: col3(PAL.cyan) } } });
      var vc = cv(0, -40);
      vortex = keep(new THREE.Mesh(new THREE.PlaneGeometry(460, 460), vortexMat)); vortex.name = 'void-galaxy-vortex';
      vortex.position.set(vc[0], TOP + 230, -vc[1]); vortex.rotation.set(dirY * 65 * Math.PI / 180, 0, 0); vortex.renderOrder = -1;
    }

    // ════════ LIGHTS (≤ 4 real PointLights; braziers share two ember lights) ════════
    var lights = [], gateC = cv(0, GATE_V - 3);
    var LSPEC = [
      { hex: 0x9a5bff, i: 420, d: 170, X: kc[0], Y: kc[1], h: DOME_H + 2, kind: 'dome' },
      { hex: 0xc04dff, i: 220, d: 48, X: gateC[0], Y: gateC[1], h: TOP + 6, kind: 'gate' },
      { hex: PAL.ember, i: 170, d: 42, s: LEN * 0.35, kind: 'ember' },
      { hex: PAL.ember, i: 170, d: 42, s: LEN * 0.8, kind: 'ember' }
    ];
    for (var li = 0; li < Math.min(maxLights, LSPEC.length); li++) {
      var ls = LSPEC[li], lx = ls.X, ly = ls.Y, lh = ls.h;
      if (ls.s != null) { var lm = at(ls.s); lx = lm.X; ly = lm.Y; lh = lm.y + 3.5; }
      var pl = new THREE.PointLight(ls.hex, ls.i, ls.d * UU, 1.3); pl.position.set(lx * UU, lh * UU, -ly * UU); pl.name = 'void-castle-light-' + ls.kind;
      pl.userData.base = ls.i; pl.userData.kind = ls.kind; pl.userData.seed = li * 1.7; root.add(pl); lights.push(pl);
    }

    if (scene) scene.add(root);
    root.updateMatrixWorld(true);

    // ════════ runtime ════════
    var glowU = [deckMat.uniforms.uGlow, bedMat.uniforms.uGlow, domeMat.uniforms.uGlow]; if (vortexMat) glowU.push(vortexMat.uniforms.uGlow);
    var timeU = [deckMat.uniforms.uTime, bedMat.uniforms.uTime, domeMat.uniforms.uTime, flameMat.uniforms.uTime]; if (vortexMat) timeU.push(vortexMat.uniforms.uTime);
    var FAR2 = Math.pow(900 * UU, 2), CX_U = CX * UU, CZ_U = -(CY - dirY * 160) * UU, clock = 0;
    function night() { var n = opts.nightFactor; n = typeof n === 'function' ? n() : n; return isFinite(n) ? Math.max(0, Math.min(1, +n)) : 0.5; }
    function update(t, dt) {
      clock = (t != null && isFinite(t)) ? t : clock + (dt || 0);
      var nf = night(), g = 0.75 + 0.5 * nf, i;
      for (i = 0; i < timeU.length; i++) timeU[i].value = clock;
      for (i = 0; i < glowU.length; i++) glowU[i].value = g;
      if (vortexMat) vortexMat.uniforms.uGlow.value = 0.35 + 0.9 * nf;          // the galaxy mostly belongs to the night
      stoneMat.emissiveIntensity = spireMat.emissiveIntensity = 0.35 + 0.8 * nf;
      core.scale.setScalar(1 + 0.08 * Math.sin(clock * 1.7));
      var near = true, pp = opts.getPlayer ? opts.getPlayer() : null;
      if (pp && pp.pos) { var dx = pp.pos.x - CX_U, dz = pp.pos.z - CZ_U; near = dx * dx + dz * dz < FAR2; }
      flames.visible = near;
      for (i = 0; i < lights.length; i++) {
        var L = lights[i], b = L.userData.base, sd = L.userData.seed;
        if (!near && L.userData.kind !== 'dome') { L.intensity = 0; continue; }   // intensity, never .visible (no shader recompiles)
        L.intensity = L.userData.kind === 'ember' ? b * (0.78 + 0.14 * Math.sin(clock * 11 + sd) + 0.08 * Math.sin(clock * 23.7 + sd * 3)) * (0.6 + 0.6 * nf)
          : b * (0.7 + 0.5 * nf) * (L.userData.kind === 'dome' ? 0.9 + 0.1 * Math.sin(clock * 1.7) : 1);
      }
    }

    var triCount = 0;
    meshes.forEach(function (m) { var gq = m.geometry, n = gq.index ? gq.index.count / 3 : gq.attributes.position.count / 3; triCount += n * (m.isInstancedMesh ? m.count : 1); });
    var gate = cv(0, GATE_V);
    var anchors = {
      castle: { x: kc[0] * UU, y: TOP * UU, z: -kc[1] * UU }, gate: { x: gate[0] * UU, y: TOP * UU, z: -gate[1] * UU },
      dome: { x: kc[0] * UU, y: DOME_H * UU, z: -kc[1] * UU },
      causewayStart: { x: S[0].X * UU, y: S[0].y * UU, z: -S[0].Y * UU }, causewayEnd: { x: S[NS - 1].X * UU, y: S[NS - 1].y * UU, z: -S[NS - 1].Y * UU },
      pitCentre: { x: PIT[0] * UU, z: -PIT[1] * UU }
    };
    var st = { triangles: Math.round(triCount), drawCalls: meshes.length, lights: lights.length, braziers: BRZ.length, spires: spireSpots.length,
      colliders: colliders.length, walkableTops: tops.length, causewayLength_m: +LEN.toFixed(1), vortex: !!vortex, quality: quality };
    if (typeof console !== 'undefined' && console.info) console.info('[void-castle] ' + st.triangles + ' tris · ' + st.drawCalls + ' draws · ' + st.lights + ' lights · causeway ' + st.causewayLength_m + ' m · ' + st.colliders + ' colliders');

    return {
      group: root, update: update, colliders: colliders, walkableTops: tops, anchors: anchors,
      meshes: meshes, lights: lights,
      shaders: { deck: { vs: DECK_VS, fs: DECK_FS }, beds: { vs: DECK_VS, fs: BED_FS }, dome: { vs: DOME_VS, fs: DOME_FS }, vortex: { vs: VORTEX_VS, fs: VORTEX_FS }, flame: { vs: FLAME_VS, fs: FLAME_FS } },
      stats: function () { return st; },
      dispose: function () {
        if (root.parent) root.parent.remove(root);
        geometries.forEach(function (g) { g.dispose(); }); materials.forEach(function (m) { m.dispose(); });
        lights.forEach(function (l) { if (l.dispose) l.dispose(); });
      }
    };
  };
  window.buildWorldVoidCastle.pathXY = pathXY;
})();
