/* world-terrain.js — SHADDAI World 3D procedural terrain (classic script, no imports).
 *
 * Usage (after world-layout.js has set window.WORLD_LAYOUT):
 *   const t = window.buildWorldTerrain(THREE, scene, window.WORLD_LAYOUT);
 *   // t.mesh        -> the ground mesh (already added to scene)
 *   // t.heightAt(x,z) -> exact surface elevation at world point (keep player on ground)
 *   // t.update(time) -> per-frame shimmer (cheap, optional)
 *
 * Design goals:
 *   - ONE merged ground mesh (~820x820, ~140x140 segs), rotateX(-PI/2) onto XZ plane.
 *   - The GRID biome center (~within 120u of origin) stays FLAT (height ~ 0) so the
 *     plaza/agents/buildings sit level. Elevation ramps up smoothly OUTSIDE the grid.
 *   - heightAt(x,z) shares the SAME elevation() the geometry uses, so the surface and
 *     the height query are identical (no drift).
 */
window.buildWorldTerrain = function (THREE, scene, layout) {
  var _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const SIZE = 1500;         // FULL MAP (2026-09-21): 820→1500 — outer realm ring at R~540 (terrain ±750)
  // PERF: SEGS 220→140 (now 190 for the bigger map). The vertex-build loop is the dominant
  // load cost (~per-vertex work × vertexCount). 190²=36,300 verts; cell = 1500/190 ≈ 7.9u
  // (~9 samples of the ~70u shortest terrain wave) — silhouette unchanged.
  // heightAt() is a SEPARATE analytic function — its VALUES are not affected.
  const SEGS = 190;          // grid resolution (visual mesh only)
  const MAX_H = 18;          // FULL MAP: 8→18 — the mountain ring between realms needs headroom

  const GRID_FLAT_R = 120;   // fully flat radius around grid center
  const GRID_RAMP   = 70;    // smooth ramp-out distance past the flat radius

  // PERF: precomputed squared thresholds so gridMask() can cull with cheap
  // squared-distance compares (avoids a Math.hypot/sqrt on the hot heightAt path
  // for the common flat-plaza case). Identical results — sqrt is still taken only
  // inside the narrow ramp band where the actual distance is needed.
  const GRID_FLAT_R2 = GRID_FLAT_R * GRID_FLAT_R;
  const GRID_OUTER   = GRID_FLAT_R + GRID_RAMP;
  const GRID_OUTER2  = GRID_OUTER * GRID_OUTER;

  // ── cheap deterministic value noise (no allocation, no external assets) ──
  function hash2(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s); // 0..1
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // FULL MAP: mountain-pass bearings (radians) toward each outer realm + the ocean
  // harbor — computed from the biome centers in world-layout.js (atan2(z,x) convention).
  const _PASSES = [0.785, 0.074, -0.736, -2.405, 2.366];  // meadow, suburb, volcano, darkforest, ocean
  function valueNoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = hash2(xi, zi),     b = hash2(xi + 1, zi);
    const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    const u = smooth(xf), v = smooth(zf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; // 0..1
  }

  // Smooth 0..1 weight that is 0 inside the flat grid zone and 1 once fully outside.
  function gridMask(x, z) {
    const d2 = x * x + z * z;             // grid center is [0,0]; squared → no sqrt yet
    if (d2 <= GRID_FLAT_R2) return 0;     // flat core (identical to d <= GRID_FLAT_R)
    if (d2 >= GRID_OUTER2)  return 1;     // fully outside (identical to d >= outer)
    const d = Math.sqrt(d2);              // sqrt only inside the ramp band
    return smooth((d - GRID_FLAT_R) / GRID_RAMP);
  }

  // ── Raw terrain elevation (no building pads) — biome noise + grid mask only ──
  function rawElevation(x, z) {
    const mask = gridMask(x, z);
    if (mask <= 0) return 0;

    const biome = layout.biomeAt(x, z);

    // Base rolling field: layered value noise (centered around 0).
    const n1 = valueNoise(x * 0.012, z * 0.012) - 0.5;
    const n2 = valueNoise(x * 0.028, z * 0.028) - 0.5;
    const n3 = valueNoise(x * 0.060, z * 0.060) - 0.5;
    let h = n1 * 1.0 + n2 * 0.5 + n3 * 0.25;

    // Smooth long-wavelength swell so biomes feel like distinct landforms.
    const swell = Math.sin(x * 0.010) * Math.cos(z * 0.011);

    switch (biome.id) {
      case 'forest': // rolling hills
        h = h * 5.2 + swell * 1.6;
        break;
      case 'arctic': // jagged rises (water biome — let it dip below 0 for the "vault")
        h = h * 7.5 + swell * 1.2;
        h += (valueNoise(x * 0.09, z * 0.09) - 0.5) * 3.0; // sharper detail
        break;
      case 'desert': // dunes — directional, smooth crests
        h = h * 3.0 + Math.sin(x * 0.05 + z * 0.02) * 4.4 + swell * 1.0;
        break;
      case 'void': // low swells
        h = h * 2.6 + swell * 1.4;
        break;
      case 'meadow': // FULL MAP: soft open pasture — gentler than the forest hills
        h = h * 3.6 + swell * 1.2;
        break;
      case 'suburb': // FULL MAP: gentle graded lots for the pod blocks
        h = h * 2.2 + swell * 0.8;
        break;
      case 'volcano': { // FULL MAP: rocky rises + a broad crater rise around the fortress
        h = h * 6.0 + swell * 1.2;
        h += (valueNoise(x * 0.09, z * 0.09) - 0.5) * 2.4; // sharper detail
        const vc = biome.center, vr = biome.radius;
        const dv = Math.hypot(x - vc[0], z - vc[1]);
        if (dv < vr * 0.95) {                 // volcanic plateau: fortress sits on a high shelf
          const t = dv <= vr * 0.45 ? 0 : smooth(Math.min(1, (dv - vr * 0.45) / (vr * 0.5)));
          h = Math.max(h, 6.5 - t * 5.5);     // crater floor ~6.5, blending to natural past 0.95r
        }
        break;
      }
      case 'darkforest': // FULL MAP: rolling dark-mist hills
        h = h * 4.4 + swell * 1.3;
        h += (valueNoise(x * 0.11, z * 0.11) - 0.5) * 1.6;
        break;
      case 'ocean': {
        // CRYSTAL SEA basin (handoff step 2): flat sea floor below the shader-water
        // plane (world-ocean.js, water at y≈0.05), then a sandy shelf that rises past
        // the waterline (~0.86·r) up to a beach crest at the rim, blending back to
        // natural terrain. Mirrors the 2D beach realm's sand→water transition.
        const oc  = biome.center, orr = biome.radius;
        const dd  = Math.hypot(x - oc[0], z - oc[1]);
        const inn = orr * 0.65;   // flat floor out to here
        const rim = orr * 1.05;   // beach crest (above water)
        if (dd <= inn)      h = -3.4;
        else if (dd <= rim) h = -3.4 + 5.0 * smooth((dd - inn) / (rim - inn));
        else                h = 1.6 + (h - 1.6) * smooth(Math.min(1, (dd - rim) / (orr * 0.3)));
        // Gold-harbor sand pad (biome.dock): a level, walkable jetty plateau so the
        // dock disc sits flush with the ground — and a dry sand spur reaching over
        // the waterline, the natural boardwalk out to the moored boats.
        if (biome.dock) {
          const dp = Math.hypot(x - biome.dock[0], z - biome.dock[1]);
          if (dp < 17) {
            const t = dp <= 10 ? 0 : smooth((dp - 10) / 7);
            h = Math.max(h, 1.78 - 0.4 * t);
          }
        }
        break;
      }
      default:      // 'grid' fringe / fallback — very gentle
        h = h * 1.6 + swell * 0.6;
        break;
    }

    // ── COLOSSEUM (world-landmarks.js): level walk-in arena plateau at [-14,460] —
    // the south light-trail ends here; the arena floor (y≈1.32) is terrain-walkable.
    {
      const dA = Math.hypot(x + 14, z - 460);
      if (dA < 54) {
        const tA = dA <= 46 ? 0 : smooth(Math.min(1, (dA - 46) / 8));
        h = Math.max(h, 1.3 - tA * 0.3);
      }
    }

    // ── MOUNTAIN RING (FULL MAP, 2026-09-21): the outer realms sit at R~540 across a
    // mountain barrier at R 380-520 — travel between realms is NOT trivial: cross a
    // pass, or sail. Angular noise shapes the ridge; five explicit passes are carved
    // toward the four outer realms + the ocean harbor. The Crystal Sea basin is exempt
    // (its own case just ran). The sacred city core (R≤380) is untouched by design.
    if (biome.id !== 'ocean') {
      const dc2 = Math.hypot(x, z);
      if (dc2 > 380 && dc2 < 520) {
        const band = Math.sin((dc2 - 380) / 140 * Math.PI);          // 0 at edges, 1 at ~450
        const ang = Math.atan2(z, x);
        let dip = 0;                                                 // carved passes
        for (let pi = 0; pi < _PASSES.length; pi++) {
          let dA = Math.abs(ang - _PASSES[pi]);
          if (dA > Math.PI) dA = Math.PI * 2 - dA;
          if (dA < 0.42) dip = Math.max(dip, 1 - dA / 0.42);
        }
        const rough = 0.55 + 0.45 * Math.sin(ang * 5.0 + Math.sin(ang * 2.3) * 2.0);
        h += band * rough * (1 - dip) * 15.0;                        // ridge up to ~+15
      }
    }

    h = Math.max(-MAX_H, Math.min(MAX_H, h));
    return h * mask; // ramp in smoothly from the flat grid edge
  }

  // ── Building foundation pads ─────────────────────────────────────────────────
  // Each building (7 agent sectors + bazaar) gets a level clearing carved into the
  // terrain. Within PAD_R the ground is forced to the natural height AT the pad
  // center (so the pad follows the landscape "grade" rather than hard-cutting to 0).
  // From PAD_R to PAD_R+PAD_RAMP a smooth (S-curve) ramp blends back to natural
  // terrain — no cliffs, no seams. Both geometry vertices and heightAt() call the
  // same elevation() so they stay perfectly in sync.
  const PAD_R    = 55;  // flat inner radius around each building (world units)
  const PAD_RAMP = 22;  // blend-out distance past PAD_R before returning to nature
  // PERF: squared outer cull radius so the per-vertex/per-query pad loop rejects
  // out-of-range pads with a squared-distance compare (no sqrt). Same result set.
  const PAD_LIM   = PAD_R + PAD_RAMP;
  const PAD_LIM2  = PAD_LIM * PAD_LIM;

  // Precompute pad list once — cheap per-vertex O(N) where N ≤ 9.
  const _pads = (function () {
    var list = [];

    function addPad(cx, cz) {
      list.push({ cx: cx, cz: cz, h: rawElevation(cx, cz) });
    }

    // 7 agent sectors (pos = [x, z])
    if (layout && Array.isArray(layout.sectors)) {
      for (var si = 0; si < layout.sectors.length; si++) {
        var s = layout.sectors[si];
        if (s.pos) addPad(s.pos[0], s.pos[1]);
      }
    }

    // Bazaar landmark (pos = [x, z])
    if (layout && typeof layout.landmark === 'function') {
      var baz = layout.landmark('bazaar');
      if (baz && baz.pos) addPad(baz.pos[0], baz.pos[1]);
    }

    return list;
  }());

  // ── THE shared elevation function (geometry + heightAt both call this) ──────
  // Returns a Y height in world units. Flat (~0) in the grid core; biome hills out;
  // foundation pads are level clearings around every building.
  function elevation(x, z) {
    const rawH = rawElevation(x, z);

    // Find the highest pad influence at (x, z) — take max so overlapping pads merge.
    var maxInf = 0;
    var padH   = 0;
    for (var pi = 0; pi < _pads.length; pi++) {
      var p = _pads[pi];
      var ddx = x - p.cx, ddz = z - p.cz;
      var d2 = ddx * ddx + ddz * ddz;
      if (d2 >= PAD_LIM2) continue;                 // cheap squared cull (no sqrt)
      var d = Math.sqrt(d2);                         // sqrt only for in-range pads
      var inf = d <= PAD_R ? 1 : 1 - smooth((d - PAD_R) / PAD_RAMP);
      if (inf > maxInf) { maxInf = inf; padH = p.h; }
    }

    if (maxInf <= 0) return rawH;
    // Blend: influence=1 → pad height; influence=0 → natural terrain
    return rawH + (padH - rawH) * maxInf;
  }

  // ── build geometry ──
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2); // plane now lies on XZ, normals up

  const pos = geo.attributes.position;
  const vCount = pos.count;
  const colors = new Float32Array(vCount * 3);

  const tmpColor = new THREE.Color();
  const biomeColor = new THREE.Color();
  const coreColor       = new THREE.Color(0.06, 0.13, 0.18);  // dark digital plaza floor
  const foundationColor = new THREE.Color(0.19, 0.16, 0.12);  // packed-earth / stone clearing

  for (let i = 0; i < vCount; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = elevation(x, z);
    pos.setY(i, y);

    // ── BIOME COLOR: Gaussian weights so the nearest biome dominates ──────────
    // (Old: 1/(d²k+c) averaged ALL biomes → muddy grey-brown. Fix: exp(-d²·k)
    //  keeps each vertex solidly in its biome's hue family while still blending
    //  smoothly at district boundaries.)
    let wr = 0, wg = 0, wb = 0, wsum = 0;
    for (const bb of layout.biomes) {
      const dx = x - bb.center[0], dz = z - bb.center[1];
      const w = Math.exp(-(dx * dx + dz * dz) * 0.0000185); // Gaussian σ≈230u
      biomeColor.setHex(bb.color);
      wr += biomeColor.r * w; wg += biomeColor.g * w; wb += biomeColor.b * w; wsum += w;
    }
    if (wsum > 0) { wr /= wsum; wg /= wsum; wb /= wsum; }

    // ── MULTI-SCALE NOISE (shared across several passes, compute once) ────────
    const cn1 = valueNoise(x * 0.007 + 3.1,  z * 0.007 - 8.3);   // large patches
    const cn2 = valueNoise(x * 0.023 + 17.4, z * 0.023 + 2.7);   // medium mottling
    const cn3 = valueNoise(x * 0.057 - 6.8,  z * 0.057 + 11.2);  // fine grain

    // ── BIOME-SPECIFIC HUE DRIFT ─────────────────────────────────────────────
    // Each biome gets a secondary color push within its hue family so the ground
    // reads as real material variation (not a solid color fill).
    const biome = layout.biomeAt(x, z);
    let dr = 0, dg = 0, db = 0;
    switch (biome.id) {
      case 'forest': {
        // warm leaf-litter patches vs cooler moss shadows
        const t = cn2 * 0.75 + cn3 * 0.25;
        dr = (t - 0.5) * 0.12; dg = (t - 0.5) * 0.07; db = -(t - 0.5) * 0.04;
        break;
      }
      case 'arctic': {
        // frost-blue veins vs bare grey rock
        const t = valueNoise(x * 0.014 + 99.1, z * 0.009 - 40.2);
        db = (t - 0.5) * 0.14; dr = -(t - 0.5) * 0.05;
        break;
      }
      case 'desert': {
        // directional dune bands: rust-orange crest vs pale-sand trough
        const band = Math.sin(x * 0.04 + z * 0.015) * 0.5 + 0.5;
        dr = (band - 0.5) * 0.14; dg = (band - 0.5) * 0.05; db = -(band - 0.5) * 0.08;
        break;
      }
      case 'void': {
        // deep-purple flicker vs muted-blue swells
        const t = cn1 * 0.6 + cn3 * 0.4;
        dr = (t - 0.5) * 0.08; db = (t - 0.5) * 0.14;
        break;
      }
      case 'ocean': {
        // wet-sand ripple banding around the cove (reads as tide lines on the beach)
        const band = Math.sin(x * 0.11 + z * 0.07) * 0.5 + 0.5;
        dr = (band - 0.5) * 0.10; dg = (band - 0.5) * 0.05; db = -(band - 0.5) * 0.06;
        break;
      }
      case 'meadow': {
        // warm sunlit pasture patches
        const t = cn2 * 0.6 + cn3 * 0.4;
        dg = (t - 0.5) * 0.10; dr = (t - 0.5) * 0.06;
        break;
      }
      case 'suburb': {
        // cool paved lots vs soft lawns
        const t = cn2;
        db = (t - 0.5) * 0.08; dg = (t - 0.5) * 0.05;
        break;
      }
      case 'volcano': {
        // dark rust banding / ash
        const band = Math.sin(x * 0.03 + z * 0.05) * 0.5 + 0.5;
        dr = (band - 0.5) * 0.16; dg = -(band - 0.5) * 0.08; db = -(band - 0.5) * 0.05;
        break;
      }
      case 'darkforest': {
        // deep blue-green mottle
        const t = cn1 * 0.5 + cn3 * 0.5;
        db = (t - 0.5) * 0.10; dg = -(t - 0.5) * 0.05;
        break;
      }
      default: break;
    }

    // ── ELEVATION SHADE: valleys darken, ridge crests lighten ────────────────
    const elevShade = THREE.MathUtils.clamp(0.68 + (y / MAX_H) * 0.38, 0.40, 1.12);

    // ── LARGE-SCALE BLOTCH: soil-patch color variation (stronger than before) ─
    // Range ±0.425 → multiplier 1 ± 0.119  (was ±0.85 → mult 1 ± 0.153 but
    // at original 0.18 scale = 1 ± 0.027 — extremely subtle). New: ±0.28 scale.
    const blotch = (cn1 - 0.5) * 0.60 + (cn2 - 0.5) * 0.25; // ≈ ±0.425

    // ── SLOPE DARKENING: cliff/steep faces read darker (build-time only) ──────
    // 4 extra elevation() samples per vertex — cheap at build time, zero cost in update().
    const SP = 3.8;
    const sL = elevation(x - SP, z), sR = elevation(x + SP, z);
    const sD = elevation(x, z - SP), sU = elevation(x, z + SP);
    const slope = Math.hypot(sR - sL, sU - sD) / (2 * SP);
    const slopeDarken = THREE.MathUtils.clamp(1 - slope * 0.16, 0.54, 1.0);

    tmpColor.setRGB(
      THREE.MathUtils.clamp(wr + dr, 0, 1),
      THREE.MathUtils.clamp(wg + dg, 0, 1),
      THREE.MathUtils.clamp(wb + db, 0, 1)
    );
    tmpColor.multiplyScalar(elevShade * (1 + blotch * 0.28) * slopeDarken);

    // ── GRID PLAZA CORE: clean dark digital floor (smooth eased blend) ────────
    const dCore = Math.hypot(x, z);
    if (dCore <= GRID_FLAT_R) {
      // smooth() on the weight gives an eased ramp instead of a linear smear
      const cw = smooth(1 - (dCore / GRID_FLAT_R) * 0.55);
      tmpColor.lerp(coreColor, cw);
    }

    // ── BUILDING FOUNDATION PADS: subtle packed-earth clearing tint ──────────
    // Gives each building pad an intentional "cleared ground" read without being
    // jarring — a gentle desaturated warm-stone shift that fades with the ramp.
    {
      var _maxPadInf = 0;
      for (var _pi = 0; _pi < _pads.length; _pi++) {
        var _p = _pads[_pi];
        var _ddx = x - _p.cx, _ddz = z - _p.cz;
        var _d2 = _ddx * _ddx + _ddz * _ddz;
        if (_d2 >= PAD_LIM2) continue;               // squared cull (no sqrt)
        var _d = Math.sqrt(_d2);
        var _inf = _d <= PAD_R ? 1 : 1 - smooth((_d - PAD_R) / PAD_RAMP);
        if (_inf > _maxPadInf) _maxPadInf = _inf;
      }
      if (_maxPadInf > 0) {
        // Subtle blend: at full influence only push 35% toward the foundation tone
        // so biome colour still reads through (not a solid grey stamp).
        tmpColor.lerp(foundationColor, _maxPadInf * 0.35);
      }
    }

    // ── WORLD-EDGE FADE: soften the hard rectangular boundary. Past ~78% of the
    // half-extent, gently darken + desaturate toward the void tone so the terrain
    // dissolves into the dark horizon instead of ending on a visible hard edge.
    {
      var _edge = Math.max(Math.abs(x), Math.abs(z)) / (SIZE * 0.5); // 0..1
      if (_edge > 0.78) {
        var _ef = smooth((_edge - 0.78) / 0.22);   // 0→1 over the outer band
        var _voidR = 0.03, _voidG = 0.045, _voidB = 0.07;
        tmpColor.r += (_voidR - tmpColor.r) * _ef * 0.85;
        tmpColor.g += (_voidG - tmpColor.g) * _ef * 0.85;
        tmpColor.b += (_voidB - tmpColor.b) * _ef * 0.85;
      }
    }

    // ── AMBIENT FLOOR LIFT: stop stacked darkeners (valley × slope × blotch) from
    // crushing any vertex to near-black under the world's dark night lighting.
    // Lerp very slightly toward a cool ground-ambient tone only where the color is
    // already dark → deep valleys/cliffs keep readable form instead of voids.
    {
      var _lum = tmpColor.r * 0.299 + tmpColor.g * 0.587 + tmpColor.b * 0.114;
      if (_lum < 0.14) {
        // 0 at lum=0.14, up to ~0.35 as it approaches black
        var _lift = (0.14 - _lum) / 0.14 * 0.35;
        tmpColor.r += (0.05 - tmpColor.r) * _lift;
        tmpColor.g += (0.09 - tmpColor.g) * _lift;
        tmpColor.b += (0.13 - tmpColor.b) * _lift;
      }
    }

    colors[i * 3 + 0] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // ── tiled surface-detail texture (procedural, so the ground reads as a real surface) ──
  // Higher-res, seamless multi-octave grain so the ground reads as a fine material
  // (subtle speckle + soft mottling) instead of muddy noise. Cheap: built once.
  // Shared seamless height field for BOTH the detail (albedo) and normal map, so
  // the lit relief lines up with the visible grain. Built once, tileable on S.
  const TAU = Math.PI * 2;
  function detailField(u, v) {
    // integer wave numbers => perfectly wrap at the tile edge (no visible seam)
    let n =
      Math.sin(u * TAU * 2) * 0.50 +
      Math.cos(v * TAU * 3) * 0.35 +
      Math.sin((u + v) * TAU * 5) * 0.20 +
      Math.cos((u * 2 - v) * TAU * 7) * 0.12 +
      Math.sin((u * 3 + v * 2) * TAU * 11) * 0.07 + // higher octave = finer grit
      Math.cos((u - v * 3) * TAU * 13) * 0.05;
    return (n / 1.29) * 0.5 + 0.5;        // -> 0..1
  }

  function makeDetailTex() {
    // PERF: S 512→256. This tex tiles 60× across the world (each tile <14px on
    // screen) and is usually replaced async by ground-stone.png, so a 256²
    // procedural fallback is visually indistinguishable while cutting the build
    // pixel loop 4× (262k→65k px). Speckle counts scaled to keep the same density.
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');

    const img = g.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = detailField(u, v);
        // Soft, low-frequency "stain" layer (seamless integer-wave) breaks up the
        // uniform grit into broad lighter/darker patches so the surface reads as a
        // real weathered material rather than tiled speckle. Build-time only.
        const stain =
          Math.sin(u * TAU * 1) * 0.6 +
          Math.cos(v * TAU * 1) * 0.5 +
          Math.sin((u + v) * TAU * 2) * 0.4;
        const stainN = stain / 1.5;                  // ≈ -1..1
        // Wider range than before (163–221) for more surface contrast.
        // Slight warm-R / cool-B split gives the detail map subtle color temperature
        // variation so the ground surface reads as real material (not a grey wash).
        const base = 192 + (n - 0.5) * 58 + stainN * 14;
        const i = (y * S + x) * 4;
        // Color temperature drifts with the stain: warmer in lit patches, cooler in
        // shadowed patches → gives the tiled ground gentle natural mottling.
        const warm = stainN * 5;
        d[i]     = Math.max(0, Math.min(255, base + 6 + warm)); // R: soil warmth
        d[i + 1] = Math.max(0, Math.min(255, base));            // G: neutral
        d[i + 2] = Math.max(0, Math.min(255, base - 7 - warm)); // B: shadowed pores
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // two-scale speckle for material micro-grain — bright grit + dark pits
    // (counts scaled to the 256² canvas to preserve the original grain density)
    for (let i = 0; i < 3500; i++) {
      const v = 180 + (Math.random() * 60 | 0);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
      g.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1);
    }
    for (let i = 0; i < 650; i++) {
      g.fillStyle = 'rgba(60,60,60,0.28)';
      g.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 2, 2);
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.anisotropy = 8;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Procedural tangent-space normal map derived from the SAME field, giving the
  // flat ground subtle surface relief under the scene lights (no extra geometry).
  function makeNormalTex() {
    // PERF: S 256→128. Each pixel evaluates the 6-term detailField 4× (central
    // differences), so this is the priciest build texture. 128² cuts it 4×
    // (65k→16k px × 24 trig terms). Tiled 60× and used only for subtle micro-
    // relief under light → the look is unchanged.
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    const e = 1 / S;          // sample step
    const STR = 2.3;          // bump strength (raised from 1.7 → more tactile micro-relief)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        // central differences on the seamless field (wrap via +1 modulo)
        const hL = detailField((u - e + 1) % 1, v);
        const hR = detailField((u + e) % 1, v);
        const hD = detailField(u, (v - e + 1) % 1);
        const hU = detailField(u, (v + e) % 1);
        let nx = (hL - hR) * STR;
        let ny = (hD - hU) * STR;
        let nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nx *= inv; ny *= inv; nz *= inv;
        const i = (y * S + x) * 4;
        d[i]     = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.anisotropy = 8;
    return t; // normal maps stay in linear space (no colorSpace set)
  }

  // ── procedural Tron/neon grid texture (client-side canvas, zero deps) ──
  // Used as a guaranteed fallback when /assets/textures/tron/albedo.jpg is
  // not yet generated by the HF FLUX script. Emits a seamless tileable dark
  // floor with glowing cyan grid lines that reads as a Tron sim surface.
  function makeTronTex() {
    const S = 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');

    // near-black background
    g.fillStyle = '#00040a';
    g.fillRect(0, 0, S, S);

    // primary cyan grid (every 32px → ~16 cells across → tiles seamlessly at S)
    const CELL = 32;
    g.strokeStyle = '#00d4e8';
    g.lineWidth = 1;
    g.shadowColor = '#00e5ff';
    g.shadowBlur = 5;
    for (let i = 0; i <= S; i += CELL) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }

    // brighter sub-grid (every 8px, very dim)
    g.strokeStyle = 'rgba(0,180,200,0.18)';
    g.shadowBlur = 0;
    g.lineWidth = 0.5;
    const SUB = 8;
    for (let i = SUB; i < S; i += SUB) {
      if (i % CELL === 0) continue;
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }

    // bright intersection nodes
    g.shadowColor = '#00ffff';
    g.shadowBlur = 10;
    g.fillStyle = '#00ffff';
    for (let ix = 0; ix <= S; ix += CELL) {
      for (let iy = 0; iy <= S; iy += CELL) {
        g.beginPath(); g.arc(ix, iy, 2, 0, Math.PI * 2); g.fill();
      }
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.anisotropy = 8;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: makeDetailTex(),                  // tiled detail multiplies the biome vertex color
    normalMap: makeNormalTex(),            // procedural micro-relief under light
    flatShading: false,
    roughness: 0.80,      // slight raise (0.78→0.80): softer, more natural non-metallic sheen
    metalness: 0.03,      // reduced (0.04→0.03): ground is organic, not conductive
    emissive: new THREE.Color(0x0c1a2e),  // faint cool glow so valleys never read pure black
    emissiveIntensity: 0.20, // CRITICAL: kept low so terrain shadow/contrast survives
  });
  if (mat.normalScale) mat.normalScale.set(0.90, 0.90); // raised (0.85→0.90): more tactile depth
  // IBL contribution: let the night-sky env map softly light the ground so it never
  // reads flat-black under the world's dark lighting, without blowing out the emissive.
  if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55;

  // ── cached originals for 'grid' revert ──
  var _origDetailTex  = mat.map;
  var _origNormalTex  = mat.normalMap;

  // ── FLUX-baked GROUND STONE albedo (weathered plaza paving) ─────────────────
  // Loaded ONCE, async, shared. Replaces the procedural detail map as the main
  // ground albedo. vertexColors stay ON so the per-biome ground colours still
  // multiply through the stone → the paving reads cohesive with each district
  // (subtle tint toward the existing ground colour) instead of a flat photo.
  // Fine tiling (repeat 64) keeps the stone grain crisp across the 820u world.
  // On error the procedural detail texture is kept, so the ground never blanks.
  (function loadGroundStone() {
    new THREE.TextureLoader().load(
      '/assets/textures/ground-stone.jpg',
      function (tex) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(64, 64);                 // fine tile across the world
        tex.anisotropy = 8;
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        _origDetailTex = tex;                   // keep stone through 'grid' revert
        // gentle warm-neutral tint so vertex-colour biome hues still lead and the
        // paving never reads as a flat pasted image (cohesion with existing ground)
        mat.color.setRGB(0.92, 0.90, 0.86);
        mat.needsUpdate = true;
      },
      undefined,
      function (/* err */) { /* keep procedural detail map on failure */ }
    );
  }());

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'world-terrain';
  // PERF: the ground never moves — stop three.js recomposing its local matrix
  // from position/quat/scale on every frame. Bake the identity matrix once.
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  // Expose the height query globally so sibling modules (e.g. world-biomes trees)
  // can seat props exactly on the surface without a new exported signature.
  window.WORLD_HEIGHT_AT = function (x, z) { return elevation(x, z); };

  // ── FOUNDATION PLAZAS + APPROACH PATHS (static, visuals-only) ───────────────
  // Each building gets a stone plaza disc DRAPED flush on the existing terrain
  // height (read via elevation(), never modified) plus a paved approach walkway
  // leading from the plaza edge toward world-center on the building's ENTRANCE
  // (frontDir) side. Neon edge trim + inlay rings in each agent's colour.
  //
  // PERF: everything is baked ONCE here into just TWO merged meshes —
  //   • one MeshStandardMaterial "stone" mesh  (all plaza discs + all paths)
  //   • one MeshBasicMaterial   "neon"  mesh   (all edge/inlay rings + path lines)
  // => 2 static draw calls total, shared geometry/material, zero per-frame work.
  (function buildFoundations() {
    var TAU2 = Math.PI * 2;

    // Building collision half-widths (facade at footprint*0.46). Plaza extends
    // ~15u beyond this so the building reads as founded on a real base plaza.
    var HALF = {
      SHADDAI: 76, NEXUS: 63, QUILL: 78, PIKADON: 65,
      TURTLE: 63, ZEROX: 63, ORACLE: 62,
    };
    var PLAZA_MARGIN = 15;   // plaza radius = half + margin
    var PATH_LEN     = 40;   // approach walkway length past the plaza rim
    var PATH_HALF    = 12;   // approach walkway half-width

    // draped surface offsets (tiny — flush, never block walking; heightAt untouched)
    var Y_PLAZA = 0.10;
    var Y_PATH  = 0.15;
    var Y_NEON  = 0.24;

    // ── merged buffers ──
    var sPos = [], sIdx = [];                 // stone (plaza + path)
    var nPos = [], nCol = [], nIdx = [];      // neon  (rings + path lines)

    // Drape a triangle-fan DISC onto the terrain surface.
    function addDisc(cx, cz, r, segs, yOff) {
      var base = sPos.length / 3;
      sPos.push(cx, elevation(cx, cz) + yOff, cz);      // center vertex
      for (var i = 0; i <= segs; i++) {
        var a = i / segs * TAU2;
        var x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        sPos.push(x, elevation(x, z) + yOff, z);
      }
      for (var k = 1; k <= segs; k++) sIdx.push(base, base + k, base + k + 1);
    }

    // Drape a thin ANNULUS (ring) onto the terrain — neon trim/inlay.
    function addRing(cx, cz, rIn, rOut, segs, yOff, col) {
      var base = nPos.length / 3;
      for (var i = 0; i <= segs; i++) {
        var a = i / segs * TAU2, ca = Math.cos(a), sa = Math.sin(a);
        var xi = cx + ca * rIn,  zi = cz + sa * rIn;
        var xo = cx + ca * rOut, zo = cz + sa * rOut;
        nPos.push(xi, elevation(xi, zi) + yOff, zi);
        nPos.push(xo, elevation(xo, zo) + yOff, zo);
        nCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      for (var s = 0; s < segs; s++) {
        var b = base + s * 2;
        nIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }

    // Drape a subdivided QUAD STRIP from A→B (follows terrain) into a buffer set.
    // target = 'stone' (paved path) or 'neon' (center light strip).
    function addStrip(x0, z0, x1, z1, halfW, yOff, target, col) {
      var dx = x1 - x0, dz = z1 - z0;
      var len = Math.hypot(dx, dz) || 1;
      var ux = dx / len, uz = dz / len;      // along
      var px = -uz, pz = ux;                 // perpendicular
      var along = Math.max(2, Math.round(len / 6));
      var across = 4, cols = across + 1;
      var toNeon = (target === 'neon');
      var pArr = toNeon ? nPos : sPos;
      var iArr = toNeon ? nIdx : sIdx;
      var base = pArr.length / 3;
      for (var i = 0; i <= along; i++) {
        var t = i / along, mx = x0 + dx * t, mz = z0 + dz * t;
        for (var j = 0; j <= across; j++) {
          var off = (j / across - 0.5) * (halfW * 2);
          var x = mx + px * off, z = mz + pz * off;
          pArr.push(x, elevation(x, z) + yOff, z);
          if (toNeon) nCol.push(col.r, col.g, col.b);
        }
      }
      for (var a = 0; a < along; a++) {
        for (var b2 = 0; b2 < across; b2++) {
          var c0 = base + a * cols + b2;
          iArr.push(c0, c0 + cols, c0 + 1, c0 + 1, c0 + cols, c0 + cols + 1);
        }
      }
    }

    var col = new THREE.Color();
    var sectors = (layout && Array.isArray(layout.sectors)) ? layout.sectors : [];
    for (var si = 0; si < sectors.length; si++) {
      var sec = sectors[si];
      if (!sec.pos || !(sec.code in HALF)) continue;
      var cx = sec.pos[0], cz = sec.pos[1];
      var plazaR = HALF[sec.code] + PLAZA_MARGIN;

      // agent neon colour (bright, saturated for the unlit neon mesh)
      col.setHex(sec.color || 0x27e0ff);

      // frontDir = from building toward world-center [0,0]; SHADDAI(center) faces -Z.
      var fx = -cx, fz = -cz, fl = Math.hypot(fx, fz);
      if (fl < 1e-3) { fx = 0; fz = -1; } else { fx /= fl; fz /= fl; }

      // 1) foundation plaza disc (stone)
      addDisc(cx, cz, plazaR, 48, Y_PLAZA);

      // outer edge trim + inner inlay ring (neon)
      addRing(cx, cz, plazaR - 3.0, plazaR - 0.4, 48, Y_NEON, col);
      addRing(cx, cz, plazaR * 0.52, plazaR * 0.52 + 1.4, 48, Y_NEON, col);

      // 2) approach walkway from plaza rim outward toward center (entrance side)
      var ax = cx + fx * (plazaR - 2), az = cz + fz * (plazaR - 2);
      var bx = cx + fx * (plazaR + PATH_LEN), bz = cz + fz * (plazaR + PATH_LEN);
      addStrip(ax, az, bx, bz, PATH_HALF, Y_PATH, 'stone', col);
      // 3) center light strip down the walkway (neon accent)
      addStrip(ax, az, bx, bz, 1.1, Y_NEON, 'neon', col);
    }

    if (sIdx.length) {
      var sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
      sGeo.setIndex(sIdx);
      sGeo.computeVertexNormals();
      var sMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e26, roughness: 0.86, metalness: 0.06,
        emissive: 0x05070c, emissiveIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      var sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.receiveShadow = true;
      sMesh.name = 'world-foundations';
      sMesh.matrixAutoUpdate = false; sMesh.updateMatrix(); // static plaza/paths
      scene.add(sMesh);
    }

    if (nIdx.length) {
      var nGeo = new THREE.BufferGeometry();
      nGeo.setAttribute('position', new THREE.Float32BufferAttribute(nPos, 3));
      nGeo.setAttribute('color', new THREE.Float32BufferAttribute(nCol, 3));
      nGeo.setIndex(nIdx);
      var nMat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      if ('toneMapped' in nMat) nMat.toneMapped = false; // keep neon vivid
      var nMesh = new THREE.Mesh(nGeo, nMat);
      nMesh.name = 'world-foundation-neon';
      nMesh.matrixAutoUpdate = false; nMesh.updateMatrix(); // static neon trim/paths
      scene.add(nMesh);
    }
  }());

  // ── applyGround(ground) — shared contract for world-themes.js ──────────────
  // ground = { type:'pbr'|'tron'|'grid', dir?:string, color?:number, tint?:number }
  //
  // 'pbr'  → load <dir>/albedo.jpg + normal.jpg + rough.jpg from Poly Haven
  //           sets into mat.map / normalMap / roughnessMap; repeat=60; SRGB on albedo.
  // 'tron' → load /assets/textures/tron/albedo.jpg (FLUX baked) or fall back to
  //           procedural canvas; cyan-on-black emissive floor look.
  // 'grid' → restore original procedural makeDetailTex/makeNormalTex + vertex colors.
  //
  // All loading is LAZY/ASYNC (TextureLoader). On error the previous texture is
  // kept so the ground never goes blank. Does NOT block first paint.
  function applyGround(ground) {
    var REPEAT = 60;
    var loader = new THREE.TextureLoader();

    // helper: load a texture async; resolve(null) on error → caller keeps previous
    function loadTex(url, isSRGB) {
      return new Promise(function (resolve) {
        loader.load(
          url,
          function (tex) {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(REPEAT, REPEAT);
            tex.anisotropy = 8;
            if (isSRGB && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          },
          undefined,
          function (/* err */) { resolve(null); } // guard: keep previous on error
        );
      });
    }

    // ── 'grid' → true revert to original procedural look ───────────────────
    if (ground.type === 'grid') {
      mat.vertexColors = true;
      mat.map           = _origDetailTex;
      mat.normalMap     = _origNormalTex;
      mat.roughnessMap  = null;
      mat.color.setHex(0xffffff);
      mat.roughness        = 0.80;   // matches tuned init value
      mat.metalness        = 0.03;   // matches tuned init value
      mat.emissive.setHex(0x0c1a2e);
      mat.emissiveIntensity = 0.20;  // matches tuned init value
      if (mat.normalScale) mat.normalScale.set(0.90, 0.90); // matches tuned init value
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55; // matches tuned init value
      mat.needsUpdate = true;
      return;
    }

    // ── 'pbr' → Poly Haven photoreal set ────────────────────────────────────
    if (ground.type === 'pbr') {
      var dir  = ground.dir  || '/assets/textures/grass';
      var tint = (ground.tint !== undefined) ? ground.tint : 0xffffff;

      mat.roughness        = 0.80;
      mat.metalness        = 0.04;
      mat.emissive.setHex(0x0a1726);
      mat.emissiveIntensity = 0.18;
      if (mat.normalScale) mat.normalScale.set(0.8, 0.8);

      // albedo (SRGB color space)
      loadTex(dir + '/albedo.jpg', true).then(function (tex) {
        if (tex) {
          mat.map = tex;
          mat.color.setHex(tint);   // white = show albedo true; tint = multiply
        }
        mat.needsUpdate = true;
      });

      // normal map (stays linear)
      loadTex(dir + '/normal.jpg', false).then(function (tex) {
        if (tex) mat.normalMap = tex;
        mat.needsUpdate = true;
      });

      // roughness map (linear)
      loadTex(dir + '/rough.jpg', false).then(function (tex) {
        if (tex) mat.roughnessMap = tex;
        mat.needsUpdate = true;
      });

      return;
    }

    // ── 'tron' → neon cyan grid floor ───────────────────────────────────────
    if (ground.type === 'tron') {
      mat.vertexColors      = false;
      mat.roughness         = 0.25;
      mat.metalness         = 0.65;
      mat.roughnessMap      = null;
      mat.emissive.setHex(0x001a2e);
      mat.emissiveIntensity = 0.75;
      mat.color.setHex(0x00e5ff);          // cyan tint over the dark albedo
      if (mat.normalScale) mat.normalScale.set(0.35, 0.35);

      // try FLUX-baked albedo; guaranteed procedural fallback on error
      loadTex('/assets/textures/tron/albedo.jpg', true).then(function (tex) {
        mat.map = tex || makeTronTex();    // never null: always get a floor
        mat.needsUpdate = true;
      });

      // optional normal map (generated alongside albedo by the script)
      loadTex('/assets/textures/tron/normal.jpg', false).then(function (tex) {
        if (tex) { mat.normalMap = tex; mat.needsUpdate = true; }
        // no normal = fine; existing procedural normal still set from mat init
      });

      return;
    }

    // unknown type → no-op (safe default)
  }

  console.log('[BENCH] world-terrain built in', Math.round(((performance || Date).now() - _t0)), 'ms');

  return {
    mesh,
    heightAt: function (x, z) { return elevation(x, z); },
    update: function (/* t */) { /* no-op; surface is static. */ },
    applyGround: applyGround,
  };
};
