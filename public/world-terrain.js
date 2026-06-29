/* world-terrain.js — SHADDAI World 3D procedural terrain (classic script, no imports).
 *
 * Usage (after world-layout.js has set window.WORLD_LAYOUT):
 *   const t = window.buildWorldTerrain(THREE, scene, window.WORLD_LAYOUT);
 *   // t.mesh        -> the ground mesh (already added to scene)
 *   // t.heightAt(x,z) -> exact surface elevation at world point (keep player on ground)
 *   // t.update(time) -> per-frame shimmer (cheap, optional)
 *
 * Design goals:
 *   - ONE merged ground mesh (~820x820, ~220x220 segs), rotateX(-PI/2) onto XZ plane.
 *   - The GRID biome center (~within 120u of origin) stays FLAT (height ~ 0) so the
 *     plaza/agents/buildings sit level. Elevation ramps up smoothly OUTSIDE the grid.
 *   - heightAt(x,z) shares the SAME elevation() the geometry uses, so the surface and
 *     the height query are identical (no drift).
 */
window.buildWorldTerrain = function (THREE, scene, layout) {
  const SIZE = 820;          // world units across (X and Z)
  const SEGS = 220;          // grid resolution
  const MAX_H = 8;           // modest max amplitude (~ +/- 8)

  const GRID_FLAT_R = 120;   // fully flat radius around grid center
  const GRID_RAMP   = 70;    // smooth ramp-out distance past the flat radius

  // ── cheap deterministic value noise (no allocation, no external assets) ──
  function hash2(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s); // 0..1
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
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
    const d = Math.hypot(x, z); // grid center is [0,0]
    if (d <= GRID_FLAT_R) return 0;
    if (d >= GRID_FLAT_R + GRID_RAMP) return 1;
    return smooth((d - GRID_FLAT_R) / GRID_RAMP);
  }

  // ── THE shared elevation function (geometry + heightAt both call this) ──
  // Returns a Y height in world units. Flat (~0) in the grid core; biome-flavored hills out.
  function elevation(x, z) {
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
      default:      // 'grid' fringe / fallback — very gentle
        h = h * 1.6 + swell * 0.6;
        break;
    }

    h = Math.max(-MAX_H, Math.min(MAX_H, h));
    return h * mask; // ramp in smoothly from the flat grid edge
  }

  // ── build geometry ──
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2); // plane now lies on XZ, normals up

  const pos = geo.attributes.position;
  const vCount = pos.count;
  const colors = new Float32Array(vCount * 3);

  const tmpColor = new THREE.Color();
  const biomeColor = new THREE.Color();
  const coreColor = new THREE.Color(0.06, 0.13, 0.18);  // dark digital plaza floor

  for (let i = 0; i < vCount; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = elevation(x, z);
    pos.setY(i, y);

    // ── vertex color: SMOOTHLY blend ALL biome colors by inverse-distance (no hard seams = transitions) ──
    let wr = 0, wg = 0, wb = 0, wsum = 0;
    for (const bb of layout.biomes) {
      const dx = x - bb.center[0], dz = z - bb.center[1];
      const w = 1 / (((dx * dx + dz * dz) * 0.00045) + 0.6);  // soft falloff -> smooth blends
      biomeColor.setHex(bb.color);
      wr += biomeColor.r * w; wg += biomeColor.g * w; wb += biomeColor.b * w; wsum += w;
    }
    tmpColor.setRGB(wr / wsum, wg / wsum, wb / wsum);
    const shade = THREE.MathUtils.clamp(0.5 + (y / MAX_H) * 0.5, 0.25, 1.1);
    tmpColor.multiplyScalar(shade);
    const dCore = Math.hypot(x, z);
    if (dCore <= GRID_FLAT_R) {
      // grid plaza core stays a dark digital floor (blends out to the biome ring)
      tmpColor.lerp(coreColor, 1 - (dCore / GRID_FLAT_R) * 0.55);
    }

    colors[i * 3 + 0] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // ── tiled surface-detail texture (procedural, so the ground reads as a real surface) ──
  function makeDetailTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#cdcdcd'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 11000; i++) { const v = 175 + (Math.random() * 70 | 0); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
    g.strokeStyle = 'rgba(150,165,180,0.22)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const p = (Math.random() * 256) | 0; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(80, 80); return t;
  }
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: makeDetailTex(),                  // tiled detail multiplies the biome vertex color
    flatShading: false,
    roughness: 0.82,
    metalness: 0.08,
    emissive: new THREE.Color(0x0a1726),  // faint cool glow so valleys never read pure black
    emissiveIntensity: 0.5,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'world-terrain';
  scene.add(mesh);

  return {
    mesh,
    heightAt: function (x, z) { return elevation(x, z); },
    update: function (/* t */) { /* no-op; surface is static. */ },
  };
};
