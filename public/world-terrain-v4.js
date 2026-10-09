/* world-terrain-v4.js — streamed, LOD heightmap terrain for the ~10 km SHADDAI world (2026-09-25).
 *
 * WHY: world-terrain.js is one 300-segment mesh driven by an analytic elevation(). At ~19450 units half-extent
 * that is ~130 units between vertices — mush up close, and pushing the segment count up costs millions of tris.
 * v4 reads a Blender-baked HEIGHTMAP + COLOUR map and draws it as a QUADTREE of equal-resolution patches: every
 * node is a (G+1)² vertex grid (G = 32) over a square that halves per level, so near the camera patches are
 * small (fine spacing) and far away one patch covers kilometres. Tri count stays ~flat no matter where you fly.
 *
 * Data contract (public/assets/terrain/, written by the Blender export or tools/terrain/make-test-terrain.cjs):
 *   terrain.json   { half_units, min_m, max_m, sea_level_m, size_px }
 *   height16.bin   raw Uint16 LE, row-major, row 0 = north (z = -HALF), col 0 = west (x = -HALF)   ← preferred
 *   height16.png   same samples as a 16-bit gray PNG                                                 ← fallback
 *   color.jpg      ground colour, same footprint/orientation (color.png tried if the jpg 404s)
 *   Samples are GRID POINTS: sample k sits at -HALF + k·2·HALF/(N-1) (both edges inclusive).
 *   Height (m) = min_m + v/65535·(max_m − min_m);  units = m · 7/1.8 (scale law: character = 7 u = 1.8 m).
 *
 * Build:  window.buildWorldTerrainV4({ THREE, scene, camera, base: '/assets/terrain/', opts... }) → Promise<api>
 *   api = { heightAt(x,z), normalAt(x,z[,out]), update(t,dt), ready, stats(), dispose(), mesh (THREE.Group),
 *           meta, material, seaLevel (units) }
 *   Sets window.WORLD_HEIGHT_AT = api.heightAt once ready (other world modules read it).
 * Tunables (all optional in the opts object): G (32 segs/patch), splitK (1.2: split while camera-to-patch
 *   distance < size·K), maxBuildsPerFrame (4), buildMsPerFrame (2.5), cacheMax (320 built patches kept),
 *   leafSpacing (finest vertex spacing in units; default ≈ half a heightmap pixel), detailTile (units per
 *   detail-normal repeat), castShadow (false).
 *
 * Seams: every patch carries a SKIRT (a curtain hanging below its 4 edges) so the T-junction cracks between
 * neighbours at different LODs are hidden without stitching/index permutations. Popping: a split only shows the
 * 4 children once ALL are built (the parent stays up meanwhile), a merge keeps the children up until the parent
 * is built — no holes, and builds are budgeted per frame so flying fast never hitches.
 */
(function () {
  var PM = 7 / 1.8;

  // ── 16-bit PNG decoder ──────────────────────────────────────────────────────────────────────────────────────
  // WHY hand-rolled: canvas drawImage/getImageData is 8-bit, so a 700 m range would quantise to ~2.7 m steps
  // (visible terraces). We inflate IDAT with the browser's DecompressionStream('deflate') (= zlib-wrapped, which
  // is exactly what PNG stores) and undo the per-row filters ourselves. Gray (0) and gray+alpha (4), 8/16-bit,
  // non-interlaced — what Blender / PIL / our generator write.
  function inflateZlib(u8) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('no DecompressionStream'));
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function decodePng16(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (u8[0] !== 137 || u8[1] !== 80 || u8[2] !== 78 || u8[3] !== 71) return Promise.reject(new Error('not a PNG'));
    var p = 8, W = 0, H = 0, depth = 0, ctype = 0, interlace = 0, idat = [], idatLen = 0;
    while (p < u8.length) {
      var len = dv.getUint32(p), type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (type === 'IHDR') { W = dv.getUint32(p + 8); H = dv.getUint32(p + 12); depth = u8[p + 16]; ctype = u8[p + 17]; interlace = u8[p + 20]; }
      else if (type === 'IDAT') { idat.push(u8.subarray(p + 8, p + 8 + len)); idatLen += len; }
      else if (type === 'IEND') break;
      p += 12 + len;
    }
    if (interlace) return Promise.reject(new Error('interlaced PNG not supported'));
    var chans = ctype === 0 ? 1 : ctype === 4 ? 2 : ctype === 2 ? 3 : ctype === 6 ? 4 : 0;
    if (!chans || (depth !== 16 && depth !== 8)) return Promise.reject(new Error('unsupported PNG type ' + ctype + '/' + depth));
    var all = new Uint8Array(idatLen), o = 0;
    idat.forEach(function (c) { all.set(c, o); o += c.length; });
    return inflateZlib(all).then(function (raw) {
      var bpp = chans * depth / 8, stride = W * bpp, out = new Uint16Array(W * H);
      var prev = new Uint8Array(stride), cur = new Uint8Array(stride), rp = 0;
      for (var y = 0; y < H; y++) {
        var f = raw[rp++];
        for (var i = 0; i < stride; i++) {
          var x = raw[rp++], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
          if (f === 1) x += a; else if (f === 2) x += b; else if (f === 3) x += (a + b) >> 1;
          else if (f === 4) { var pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); x += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
          cur[i] = x & 255;
        }
        // first channel only (gray); 16-bit samples are BIG-endian in PNG; 8-bit gets stretched to 16
        var row = y * W;
        if (depth === 16) for (var k = 0; k < W; k++) out[row + k] = (cur[k * bpp] << 8) | cur[k * bpp + 1];
        else for (var k2 = 0; k2 < W; k2++) out[row + k2] = cur[k2 * bpp] * 257;
        var t = prev; prev = cur; cur = t;
      }
      return { w: W, h: H, data: out };
    });
  }

  function fetchOk(url, kind) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + url); return kind === 'json' ? r.json() : r.arrayBuffer(); });
  }

  // ── procedural detail normal map ────────────────────────────────────────────────────────────────────────────
  // WHY: a 4096² colour map over 38900 units is ~9.5 units/texel — a character's footprint is one texel. A tiling
  // tangent-space normal map (value noise, a few octaves, wraps seamlessly) adds micro relief so close ground
  // reads as surface, not blur. Mipmaps average it to flat in the distance, so it never shimmers far away.
  function makeDetailNormal(THREE, S) {
    S = S || 256;
    var h = new Float32Array(S * S);
    function lattice(n) { var g = new Float32Array(n * n), s = 1234567 + n; for (var i = 0; i < n * n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; g[i] = s / 0x7fffffff; } return g; }
    [[8, 0.5], [16, 0.28], [32, 0.14], [64, 0.08]].forEach(function (oc) {
      var n = oc[0], amp = oc[1], g = lattice(n);
      for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
        var fx = x / S * n, fy = y / S * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var x0 = ix % n, x1 = (ix + 1) % n, y0 = iy % n, y1 = (iy + 1) % n;   // modulo → seamless tiling
        var a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
        h[y * S + x] += amp * ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty);
      }
    });
    var px = new Uint8Array(S * S * 4), STR = 3.0;
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * STR, dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * STR;
      var il = 1 / Math.sqrt(dx * dx + dy * dy + 1), k = (y * S + x) * 4;
      px[k] = (-dx * il * 0.5 + 0.5) * 255; px[k + 1] = (-dy * il * 0.5 + 0.5) * 255; px[k + 2] = (il * 0.5 + 0.5) * 255; px[k + 3] = 255;
    }
    var tex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  window.buildWorldTerrainV4 = function (opts) {
    opts = opts || {};
    var THREE = opts.THREE, scene = opts.scene, camera = opts.camera;
    var base = opts.base || '/assets/terrain/';
    if (base.charAt(base.length - 1) !== '/') base += '/';
    var _t0 = (performance || Date).now();

    return fetchOk(base + 'terrain.json', 'json').then(function (meta) {
      // height: raw .bin first (zero decode cost, exact), PNG decode as fallback
      return fetchOk(base + 'height16.bin').then(function (ab) {
        var n = Math.round(Math.sqrt(ab.byteLength / 2));
        if (n * n * 2 !== ab.byteLength) throw new Error('height16.bin is not square');
        // WHY no byte swap: every browser platform is little-endian; a fresh ArrayBuffer is 2-byte aligned
        return { meta: meta, n: n, data: new Uint16Array(ab), src: 'bin' };
      }).catch(function (e) {
        console.warn('[terrain-v4] height16.bin unavailable (' + e.message + ') — decoding height16.png');
        return fetchOk(base + 'height16.png').then(decodePng16).then(function (img) {
          if (img.w !== img.h) throw new Error('height16.png must be square');
          return { meta: meta, n: img.w, data: img.data, src: 'png' };
        });
      });
    }).then(function (hm) {
      return loadColor(THREE, base).then(function (colorTex) { hm.colorTex = colorTex; return hm; });
    }).then(function (hm) { return build(THREE, scene, camera, opts, hm, _t0); });
  };

  function loadColor(THREE, base) {
    var loader = new THREE.TextureLoader();
    function load(url) { return new Promise(function (res, rej) { loader.load(url, res, undefined, function () { rej(new Error('404 ' + url)); }); }); }
    return load(base + 'color.jpg').catch(function () { return load(base + 'color.png'); }).catch(function (e) {
      console.warn('[terrain-v4] no colour map (' + e.message + ') — flat grey ground'); return null;
    });
  }

  function build(THREE, scene, camera, opts, hm, _t0) {
    var meta = hm.meta, N = hm.n, HD = hm.data;
    if (meta.size_px && meta.size_px !== N) console.warn('[terrain-v4] terrain.json size_px', meta.size_px, '≠ data', N);
    var HALF = +meta.half_units, MIN_M = +meta.min_m, MAX_M = +meta.max_m;
    var NM1 = N - 1, INV_CELL = NM1 / (2 * HALF), CELL = (2 * HALF) / NM1;
    var HA = MIN_M * PM, HB = (MAX_M - MIN_M) / 65535 * PM;   // units = HA + HB · sample
    var SEA_U = (+meta.sea_level_m || 0) * PM;

    // ── heightAt: bilinear over the raw Uint16 samples ──────────────────────────────────────────────────────
    // WHY Uint16 not a Float32 copy: 4096² would be 64 MB of floats; the affine HA+HB·v after interpolation is
    // two flops. Clamped at the footprint edge (the world is an island; beyond is the edge sea).
    var EXTRA = { fn: null };   // setHeightExtra(fn): (x,z) -> height or null; the world takes max(terrain, extra). Used by the Hoverskate park (deck, banks, ramps).
    // RIDE EXTRAS (2026-10-08, race track): surfaces the player/boards stand on but the terrain MESH must not rise to
    // (an elevated track deck would otherwise pull the ground up into a wall under it). heightAt = mesh height + these;
    // the patch builder uses meshHeightAt. addRideExtra(fn): fn(x,z) -> height or null.
    var RIDE = [];
    function heightAt(x, z) {
      var h = meshHeightAt(x, z);
      for (var ri = 0; ri < RIDE.length; ri++) { var e = RIDE[ri](x, z); if (e !== null && e > h) h = e; }
      return h;
    }
    function meshHeightAt(x, z) {
      var u = (x + HALF) * INV_CELL, v = (z + HALF) * INV_CELL;
      if (u < 0) u = 0; else if (u > NM1) u = NM1;
      if (v < 0) v = 0; else if (v > NM1) v = NM1;
      var i = u | 0, j = v | 0;
      if (i >= NM1) i = NM1 - 1;
      if (j >= NM1) j = NM1 - 1;
      var fx = u - i, fy = v - j, k = j * N + i;
      var h00 = HD[k], h10 = HD[k + 1], h01 = HD[k + N], h11 = HD[k + N + 1];
      var top = h00 + (h10 - h00) * fx, bot = h01 + (h11 - h01) * fx;
      var hb = HA + HB * (top + (bot - top) * fy);
      if (EXTRA.fn !== null) { var ex = EXTRA.fn(x, z); if (ex !== null && ex > hb) return ex; }
      return hb;
    }
    // normalAt: central differences; eps defaults to one heightmap cell (the data's own resolution)
    function normalAt(x, z, out, eps) {
      eps = eps || CELL;
      var dx = heightAt(x + eps, z) - heightAt(x - eps, z), dz = heightAt(x, z + eps) - heightAt(x, z - eps);
      var nx = -dx, ny = 2 * eps, nz = -dz, il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      out = out || { x: 0, y: 0, z: 0 };
      out.x = nx * il; out.y = ny * il; out.z = nz * il; return out;
    }

    // ── tunables ─────────────────────────────────────────────────────────────────────────────────────────────
    var G = opts.G || 32, GV = G + 1;
    var SPLIT_K = opts.splitK || 1.2;
    var MAX_BUILDS = opts.maxBuildsPerFrame || 4, BUILD_MS = opts.buildMsPerFrame || 2.5;
    var CACHE_MAX = opts.cacheMax || 320;
    var LEAF_SPACING = opts.leafSpacing || Math.max(2, CELL * 0.5);   // ½ px: vertices land on + between samples
    var ROOT = 2 * HALF, MAX_LEVEL = 0;
    while (MAX_LEVEL < 12 && ROOT / Math.pow(2, MAX_LEVEL) / G > LEAF_SPACING * 1.001) MAX_LEVEL++;
    var DETAIL_TILE = opts.detailTile || 8 * PM;   // 8 m per detail repeat

    // ── shared material ──────────────────────────────────────────────────────────────────────────────────────
    var colorTex = hm.colorTex;
    if (colorTex) {
      colorTex.colorSpace = THREE.SRGBColorSpace;
      colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping;
      colorTex.anisotropy = 8; colorTex.needsUpdate = true;
    }
    var detail = makeDetailNormal(THREE, 256);
    detail.channel = 1;   // WHY channel 1: normal map tiles on the 'uv1' attribute (world/DETAIL_TILE); colour on 'uv' (0..1 footprint)
    var material = new THREE.MeshStandardMaterial({
      map: colorTex || null, color: colorTex ? 0xffffff : 0x7a8a6a,
      normalMap: detail, normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.94, metalness: 0.0,
    });
    material.name = 'terrain-v4';

    // ── SURFACE SHADING (2026-10-08, owner refs: jet-combat / Tesana mountains) ──────────────────────────────────
    // The colour map is ~10 m per pixel, so up close the ground read as one flat smear. On top of it, per pixel:
    // macro brightness variation (breaks the smear), rock on steep slopes (keeps the realm's hue: desert rock stays
    // red, forest rock grey-green), snow on high ground (not on cliffs), wet darker sand at the shoreline.
    // Two value-noise lookups + a few mixes: no textures, no extra draws. ?tsplat=0 = old flat look.
    var SPLAT = !(typeof location !== 'undefined' && /[?&]tsplat=0\b/.test(location.search));
    if (SPLAT) {
      var SU = {
        uSnowLo: { value: (opts.snowLoM != null ? opts.snowLoM : 430) * PM }, uSnowHi: { value: (opts.snowHiM != null ? opts.snowHiM : 520) * PM },
        uSea: { value: SEA_U }, uRock: { value: opts.rockMix != null ? opts.rockMix : 1.0 }
      };
      material.customProgramCacheKey = function () { return 'tv4-splat'; };
      material.onBeforeCompile = function (sh) {
        for (var k in SU) sh.uniforms[k] = SU[k];
        sh.vertexShader = 'varying vec3 vTWP; varying vec3 vTWN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n  vTWP = (modelMatrix * vec4(position, 1.0)).xyz; vTWN = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = [
          'varying vec3 vTWP; varying vec3 vTWN; uniform float uSnowLo, uSnowHi, uSea, uRock;',
          'float tvH(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.5); return fract(p.x * p.y); }',
          'float tvN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
          '  return mix(mix(tvH(i), tvH(i + vec2(1.0, 0.0)), f.x), mix(tvH(i + vec2(0.0, 1.0)), tvH(i + vec2(1.0, 1.0)), f.x), f.y); }'
        ].join('\n') + '\n' + sh.fragmentShader.replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '  {',
          '    float n1 = tvN(vTWP.xz * 0.004), n2 = tvN(vTWP.xz * 0.045) * 0.6 + tvN(vTWP.xz * 0.21) * 0.4;',
          '    vec3 base = diffuseColor.rgb;',
          '    base *= 0.88 + 0.24 * n1;',                                                            // macro variation
          '    float lum = dot(base, vec3(0.299, 0.587, 0.114));',
          '    base = max(mix(vec3(lum), base, 1.18), 0.0);',                                         // a touch more colour (refs are saturated)
          '    float green = smoothstep(0.0, 0.05, base.g - max(base.r, base.b));',                   // grassland: patchy light/dark grass
          '    base = mix(base, base * mix(vec3(0.78, 0.86, 0.72), vec3(1.16, 1.12, 0.86), n2), green * 0.85);',
          '    float slope = 1.0 - clamp(vTWN.y, 0.0, 1.0);',
          '    float rock = smoothstep(0.24, 0.46, slope + (n2 - 0.5) * 0.14) * uRock;',
          '    vec3 grey = mix(vec3(0.16, 0.15, 0.15), vec3(0.52, 0.50, 0.47), smoothstep(0.04, 0.30, lum));',   // bright realm = light rock, volcano/void = dark rock
          '    vec3 rockCol = mix(grey, base, 0.25) * (0.80 + 0.40 * n2);',                          // a little realm hue kept, grainy
          '    base = mix(base, rockCol, rock);',
          '    float snow = smoothstep(uSnowLo, uSnowHi, vTWP.y + (n1 - 0.5) * (uSnowHi - uSnowLo)) * (1.0 - smoothstep(0.38, 0.62, slope));',
          '    base = mix(base, vec3(0.90, 0.93, 0.97) * (0.94 + 0.06 * n2), snow);',
          '    float wet = 1.0 - smoothstep(uSea + 2.0, uSea + 14.0, vTWP.y);',                         // shoreline band
          '    base = mix(base, base * 0.68, wet * 0.8);',
          '    float near = 1.0 - smoothstep(60.0, 420.0, distance(vTWP, cameraPosition));',          // fine grain only where you can see it
          '    if (near > 0.0) { float n3 = tvN(vTWP.xz * 0.9) * 0.6 + tvN(vTWP.xz * 2.3) * 0.4; base *= mix(1.0, 0.80 + 0.40 * n3, near * 0.9); }',
          '    diffuseColor.rgb = base;',
          '  }'
        ].join('\n'));
      };
      material.userData.splat = SU;
    }

    var group = new THREE.Group(); group.name = 'world-terrain-v4';
    if (scene) scene.add(group);

    // ── shared index buffer (identical topology for every patch) ────────────────────────────────────────────
    // verts: GV² grid (row-major, j = z) then 4 skirts × GV (north, east, south, west edges)
    var GRID_V = GV * GV, VCOUNT = GRID_V + 4 * GV;
    var idx = [];
    for (var j = 0; j < G; j++) for (var i = 0; i < G; i++) {
      var a = j * GV + i, b = a + 1, c = a + GV, d = c + 1;
      idx.push(a, c, b, b, c, d);   // CCW seen from +Y (derived: (c-a)×(b-a) = +Y)
    }
    // skirt quads: top edge list ordered so (t_k, t_k+1, s_k) winds outward
    function edgeTop(e, k) {   // e: 0 N(z-), 1 E(x+), 2 S(z+), 3 W(x-)
      if (e === 0) return k;                                  // i increasing along north edge
      if (e === 1) return k * GV + G;                         // j increasing along east edge
      if (e === 2) return G * GV + (G - k);                   // i decreasing along south edge
      return (G - k) * GV;                                    // j decreasing along west edge
    }
    for (var e = 0; e < 4; e++) for (var k = 0; k < G; k++) {
      var t0 = edgeTop(e, k), t1 = edgeTop(e, k + 1), s0 = GRID_V + e * GV + k, s1 = s0 + 1;
      idx.push(t0, t1, s0, t1, s1, s0);
    }
    var INDEX = new THREE.BufferAttribute(VCOUNT > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    var TRIS = idx.length / 3;

    // ── geometry pool ────────────────────────────────────────────────────────────────────────────────────────
    // WHY a pool: all patches share one vertex layout, so an evicted patch's BufferGeometry (and its GPU buffers)
    // is just rewritten for the next patch — no allocation churn, no GC spikes while flying.
    var pool = [], allGeos = [];
    function takeGeo() {
      var g = pool.pop();
      if (g) return g;
      g = new THREE.BufferGeometry();
      g.setIndex(INDEX);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VCOUNT * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(VCOUNT * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(VCOUNT * 2), 2));
      g.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(VCOUNT * 2), 2));
      g.boundingBox = new THREE.Box3(); g.boundingSphere = new THREE.Sphere();
      allGeos.push(g);
      return g;
    }

    // ── quadtree nodes ───────────────────────────────────────────────────────────────────────────────────────
    // node: { lvl, x0, z0, size, cx, cz, hmin, hmax, kids|null, mesh|null, shownFrame, usedFrame }
    // hmin/hmax come from a coarse 9×9 sampling at creation (for the split distance) and are replaced by the
    // exact vertex range once built.
    function makeNode(lvl, x0, z0, size) {
      var hmin = Infinity, hmax = -Infinity, S = 8;
      for (var b = 0; b <= S; b++) for (var a = 0; a <= S; a++) {
        var h = meshHeightAt(x0 + size * a / S, z0 + size * b / S); if (h < hmin) hmin = h; if (h > hmax) hmax = h;
      }
      return { lvl: lvl, x0: x0, z0: z0, size: size, cx: x0 + size / 2, cz: z0 + size / 2, hmin: hmin, hmax: hmax, kids: null, mesh: null, usedFrame: 0 };
    }
    var root = makeNode(0, -HALF, -HALF, ROOT);
    var builtCount = 0, builtList = [];

    // bordered height scratch: (GV+2)² samples = the patch grid + a 1-vertex ring, so normals come from central
    // differences of samples we already have (1 heightAt per vertex instead of 5). WHY patch spacing as the
    // difference step: a coarse patch lit with pixel-scale normals sparkles; lit at its own spacing it reads as
    // the smoothed shape it actually is — and both sides of a shared edge see the same neighbour samples.
    var BW = GV + 2, HB_ = new Float32Array(BW * BW);
    function buildNode(nd) {
      var geo = takeGeo(), P = geo.attributes.position.array, NR = geo.attributes.normal.array, UV = geo.attributes.uv.array, UV1 = geo.attributes.uv1.array;
      var sp = nd.size / G, hmin = Infinity, hmax = -Infinity, inv2 = 1 / (2 * HALF);
      for (var bj = 0; bj < BW; bj++) for (var bi = 0; bi < BW; bi++) HB_[bj * BW + bi] = meshHeightAt(nd.x0 + (bi - 1) * sp, nd.z0 + (bj - 1) * sp);
      var sp2 = 2 * sp;
      for (var jj = 0; jj < GV; jj++) for (var ii = 0; ii < GV; ii++) {
        var x = nd.x0 + ii * sp, z = nd.z0 + jj * sp, c0 = (jj + 1) * BW + ii + 1, h = HB_[c0], v = jj * GV + ii;
        P[v * 3] = x; P[v * 3 + 1] = h; P[v * 3 + 2] = z;
        var nx = HB_[c0 - 1] - HB_[c0 + 1], nz = HB_[c0 - BW] - HB_[c0 + BW], il = 1 / Math.sqrt(nx * nx + sp2 * sp2 + nz * nz);
        NR[v * 3] = nx * il; NR[v * 3 + 1] = sp2 * il; NR[v * 3 + 2] = nz * il;
        UV[v * 2] = (x + HALF) * inv2; UV[v * 2 + 1] = 1 - (z + HALF) * inv2;   // flipY: image row 0 (north) at v=1
        UV1[v * 2] = x / DETAIL_TILE; UV1[v * 2 + 1] = z / DETAIL_TILE;
        if (h < hmin) hmin = h; if (h > hmax) hmax = h;
      }
      // skirt depth: must exceed the worst mismatch vs a neighbour one LOD coarser — scales with spacing & relief
      var skirt = Math.max(2, sp * 1.2 + (hmax - hmin) * 0.12);
      for (var e2 = 0; e2 < 4; e2++) for (var k2 = 0; k2 < GV; k2++) {
        var t = edgeTop(e2, k2), s = GRID_V + e2 * GV + k2;
        P[s * 3] = P[t * 3]; P[s * 3 + 1] = P[t * 3 + 1] - skirt; P[s * 3 + 2] = P[t * 3 + 2];
        NR[s * 3] = NR[t * 3]; NR[s * 3 + 1] = NR[t * 3 + 1]; NR[s * 3 + 2] = NR[t * 3 + 2];   // lit like the edge it hangs from
        UV[s * 2] = UV[t * 2]; UV[s * 2 + 1] = UV[t * 2 + 1]; UV1[s * 2] = UV1[t * 2]; UV1[s * 2 + 1] = UV1[t * 2 + 1];
      }
      geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.uv1.needsUpdate = true;
      geo.boundingBox.min.set(nd.x0, hmin - skirt, nd.z0); geo.boundingBox.max.set(nd.x0 + nd.size, hmax, nd.z0 + nd.size);
      geo.boundingBox.getBoundingSphere(geo.boundingSphere);
      nd.hmin = hmin; nd.hmax = hmax;
      var m = new THREE.Mesh(geo, material);
      m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = !!opts.castShadow;
      m.visible = false; m.name = 'tv4-L' + nd.lvl; m.userData.tv4Level = nd.lvl;
      group.add(m);
      nd.mesh = m; builtCount++; builtList.push(nd);
    }
    function freeNode(nd) {
      group.remove(nd.mesh); pool.push(nd.mesh.geometry); nd.mesh = null; builtCount--;
    }

    // ── selection ────────────────────────────────────────────────────────────────────────────────────────────
    var cam = new THREE.Vector3(), frame = 0, queue = [];
    function distTo(nd) {   // camera → patch AABB (3D; hmin/hmax from sampling or the built vertices)
      var dx = Math.max(nd.x0 - cam.x, 0, cam.x - (nd.x0 + nd.size));
      var dz = Math.max(nd.z0 - cam.z, 0, cam.z - (nd.z0 + nd.size));
      var dy = Math.max(nd.hmin - cam.y, 0, cam.y - nd.hmax);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    function wantSplit(nd) { return nd.lvl < MAX_LEVEL && distTo(nd) < nd.size * SPLIT_K; }
    function kidsOf(nd) {
      if (!nd.kids) { var h = nd.size / 2, L = nd.lvl + 1; nd.kids = [makeNode(L, nd.x0, nd.z0, h), makeNode(L, nd.x0 + h, nd.z0, h), makeNode(L, nd.x0, nd.z0 + h, h), makeNode(L, nd.x0 + h, nd.z0 + h, h)]; }
      return nd.kids;
    }
    function request(nd) { if (!nd.mesh && nd.queuedFrame !== frame) { nd.queuedFrame = frame; nd.prio = distTo(nd) / nd.size; queue.push(nd); } }
    // readyCover: already-built meshes that tile nd's area (used while a merge target is still building)
    function readyCover(nd, out) {
      if (nd.mesh) { out.push(nd); return true; }
      if (!nd.kids) return false;
      var mark = out.length;
      for (var q = 0; q < 4; q++) if (!readyCover(nd.kids[q], out)) { out.length = mark; return false; }
      return true;
    }
    // select: pushes the patches to draw for nd's area into out; returns true when the area is fully covered
    function select(nd, out) {
      if (nd.mesh) nd.usedFrame = frame;   // visited = wanted soon; a built sibling waiting on others must not be evicted
      if (wantSplit(nd)) {
        var kids = kidsOf(nd), mark = out.length, ok = true;
        for (var q = 0; q < 4; q++) if (!select(kids[q], out)) ok = false;
        if (ok) return true;
        // children not all ready → keep this coarser patch up instead (no holes, no overlap)
        out.length = mark;
        if (nd.mesh) { out.push(nd); return true; }
        request(nd);
        return false;
      }
      if (nd.mesh) { out.push(nd); return true; }
      request(nd);
      return !!(nd.kids && readyCover(nd, out));   // merging: finer patches stay until this one is built
    }

    var shown = [], stats_ = { chunks: 0, tris: 0, lodCounts: {}, built: 0, pooled: 0, queued: 0, updateMs: 0, maxLevel: MAX_LEVEL, maxBuildMs: 0, builds: 0 };
    function runBuilds(maxN, maxMs) {
      if (!queue.length) return;
      queue.sort(function (a, b) { return a.lvl - b.lvl || a.prio - b.prio; });   // coarse first = fills holes fastest
      var t0 = performance.now(), n = 0;
      while (queue.length && n < maxN) {
        var nd = queue.shift();
        if (!nd.mesh) { var tb = performance.now(); buildNode(nd); n++; var db = performance.now() - tb; if (db > stats_.maxBuildMs) stats_.maxBuildMs = db; stats_.builds++; }
        if (performance.now() - t0 > maxMs) break;
      }
    }
    function evict() {
      if (builtCount <= CACHE_MAX) return;
      builtList.sort(function (a, b) { return a.usedFrame - b.usedFrame; });   // oldest-used first
      var keep = [];
      for (var q = 0; q < builtList.length; q++) {
        var nd = builtList[q];
        if (builtCount > CACHE_MAX && nd.mesh && nd.usedFrame < frame && nd !== root) freeNode(nd);
        else if (nd.mesh) keep.push(nd);
      }
      builtList = keep;
    }
    function refresh() {
      for (var q = 0; q < shown.length; q++) if (shown[q].mesh) shown[q].mesh.visible = false;
      var out = [];
      select(root, out);
      var lc = {}, tris = 0;
      for (var r = 0; r < out.length; r++) { var nd = out[r]; nd.mesh.visible = true; nd.usedFrame = frame; lc[nd.lvl] = (lc[nd.lvl] || 0) + 1; tris += TRIS; }
      shown = out;
      stats_.chunks = out.length; stats_.tris = tris; stats_.lodCounts = lc;
    }

    function update(/* t, dt */) {
      if (!api.ready) return;
      var t0 = performance.now();
      frame++;
      if (camera) camera.getWorldPosition(cam);
      queue.length = 0;
      refresh();
      var t1 = performance.now();
      if (queue.length) { runBuilds(MAX_BUILDS, BUILD_MS); refresh(); }   // WHY re-select: newly built patches show this frame
      var t2 = performance.now();
      evict();
      var t3 = performance.now();
      stats_.built = builtCount; stats_.pooled = pool.length; stats_.queued = queue.length;
      stats_.updateMs = t3 - t0; stats_.phaseMs = [t1 - t0, t2 - t1, t3 - t2];   // [select, build+reselect, evict]
    }

    var api = {
      ready: false, mesh: group, material: material, meta: meta, seaLevel: SEA_U, half: HALF, source: hm.src,
      heightAt: heightAt, setHeightExtra: function (f) { EXTRA.fn = typeof f === 'function' ? f : null; },
      meshHeightAt: meshHeightAt,   // ground the terrain mesh shows (no ride extras) — for builders that sit things ON the ground under a deck
      groundAt: function (x, z) { var u = (x + HALF) * INV_CELL, v = (z + HALF) * INV_CELL; u = u < 0 ? 0 : (u > NM1 ? NM1 : u); v = v < 0 ? 0 : (v > NM1 ? NM1 : v); var i = Math.min(u | 0, NM1 - 1), j = Math.min(v | 0, NM1 - 1), fx = u - i, fy = v - j, k = j * N + i, t = HD[k] + (HD[k + 1] - HD[k]) * fx, b = HD[k + N] + (HD[k + N + 1] - HD[k + N]) * fx; return HA + HB * (t + (b - t) * fy); },   // raw heightmap only
      addRideExtra: function (f) { if (typeof f === 'function') RIDE.push(f); return function () { var i = RIDE.indexOf(f); if (i >= 0) RIDE.splice(i, 1); }; },
      normalAt: function (x, z, out) { return normalAt(x, z, out); },
      update: update,
      stats: function () { var s = {}; for (var k in stats_) s[k] = stats_[k]; s.lodCounts = JSON.parse(JSON.stringify(stats_.lodCounts)); return s; },
      dispose: function () {
        api.ready = false;
        if (group.parent) group.parent.remove(group);
        allGeos.forEach(function (g) { g.dispose(); });
        material.dispose(); detail.dispose(); if (colorTex) colorTex.dispose();
        if (window.WORLD_HEIGHT_AT === heightAt) window.WORLD_HEIGHT_AT = null;
        root = null; shown = []; builtList = []; pool = [];
      },
    };

    // first frame complete: build everything the initial view wants synchronously (load time, not play time)
    api.ready = true;
    if (camera) camera.getWorldPosition(cam); else cam.set(0, HALF, 0);
    for (var pass = 0; pass < MAX_LEVEL + 2; pass++) {
      frame++; queue.length = 0; refresh();
      if (!queue.length) break;
      runBuilds(1e9, 1e9);
    }
    refresh();
    window.WORLD_HEIGHT_AT = heightAt;
    console.log('[BENCH] world-terrain-v4 ready in', Math.round(performance.now() - _t0), 'ms —', N + '² from', hm.src, '· levels 0..' + MAX_LEVEL, '· leaf spacing', (ROOT / Math.pow(2, MAX_LEVEL) / G).toFixed(1) + 'u ·', stats_.chunks, 'patches /', stats_.tris, 'tris');
    return api;
  }
})();
