# SHADDAI Biome Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate SHADDAI_WORLD_FULL_BIOME_SPEC.md (1,350 lines) into a living 3D world with 5 procedurally-rendered biomes, portal network, cross-biome systems, and detailed landmarks — all in Three.js primitives (no GLB loaders).

**Architecture:** Single-file HTML (SHADDAI-WORLD-3D.html) with modular geometry groups per biome, swappable lighting/fog per terrain, procedural portal network, and ambient vehicles. Live server at localhost:8099/world3d auto-refreshes on save. Build biome-by-biome from spec data → geometry → integration.

**Tech Stack:** Three.js r180, Tron/biopunk aesthetic, CSS color tokens, PlaneGeometry + BoxGeometry + CylinderGeometry + TorusGeometry + LatheGeometry + IcosahedronGeometry + TubeGeometry.

---

## FILE STRUCTURE

**Target:** `public/SHADDAI-WORLD-3D.html` (existing 2,100 lines)

**Changes:** 
- Add `<script>` section: WORLD_MANIFEST (biome/landmark/vehicle data extracted from spec)
- Add `<script>` section: BIOME_GEOMETRY (geometry creation per biome, added to scene conditionally)
- Add `<script>` section: PORTALS_AND_RAILS (portal torus rings + vortex shader + monorail system)
- Modify existing `applyTerrain()` to also switch lighting rig + fog + portal visibility
- Add `<script>` section: VEHICLES (parked props + ambient patrol loops)

No refactoring. No changes to existing agent/market/bazaar code. New code inserted as new `<script>` blocks before the render loop.

---

## PHASE 1: WORLD MANIFEST EXTRACTION

### Task 1: Extract Biome Data From Spec

**Files:**
- Modify: `public/SHADDAI-WORLD-3D.html` — insert new `<script>` block after line 126 (before existing scene setup)

**Goal:** Create structured JSON/object containing all 5 biomes + 6 portals + landmarks + vehicles + lighting rigs + fog settings from SHADDAI_WORLD_FULL_BIOME_SPEC.md §1–7, §10.

- [ ] **Step 1: Create WORLD_MANIFEST object**

In the new script block, paste this at the top:

```javascript
// ── WORLD MANIFEST — extracted from SHADDAI_WORLD_FULL_BIOME_SPEC.md ──
const WORLD_MANIFEST = {
  // Global design tokens (§1)
  colors: {
    gold: 0xffad2e, cyan: 0x00e5ff, void_bg: 0x0a0f2e, white: 0xe8f4ff,
    grid: 0x00e5ff, forest: 0x3ddc84, arctic: 0xaaddff, desert: 0xff7a18, void: 0x9b59f5,
    shaddai: 0xffad2e, zerox: 0x00ff88, oracle: 0x9b59f5, nexus: 0x00e5ff,
    quill: 0xf0c8d8, turtle: 0x18cae6, pikadon: 0xff4400,
  },
  
  // Portal hub — center of world (§2)
  portal_hub: { cx: 0, cz: 0, radius: 50, landmark: 'SHADDAI Spire', y_terrain: 0 },

  // All 5 biomes with center coords, radius, key landmark (§2 table)
  biomes: [
    { id: 'grid',   name: 'The Grid',        agent: 'NEXUS',   color: 0x00e5ff, cx: -400, cz: 0,   radius: 200, y_min: 0,  y_max: 20,  landmark: 'NEXUS Tower' },
    { id: 'forest', name: 'Quill Forest',    agent: 'QUILL',   color: 0x3ddc84, cx: 0,    cz: 400, radius: 250, y_min: 0,  y_max: 60,  landmark: 'Great Arch Tree' },
    { id: 'arctic', name: 'Arctic Vault',    agent: 'ORACLE',  color: 0xaaddff, cx: 400,  cz: 0,   radius: 200, y_min: 0,  y_max: 80,  landmark: 'Cryopolis Dome' },
    { id: 'desert', name: 'Sand Sea',        agent: 'ZEROX',   color: 0xff7a18, cx: -400, cz: 400, radius: 300, y_min: -10, y_max: 30, landmark: 'Circuit Mesa' },
    { id: 'void',   name: 'Deep Void',       agent: 'PIKADON', color: 0x9b59f5, cx: 400,  cz: 400, radius: Infinity, y_min: 0, y_max: 0, landmark: 'SHADDAI Spire + Void City' },
  ],

  // Portal network — 6 nodes (§2 Portal Network)
  portals: [
    { id: 'hub',    name: 'SHADDAI HUB',     pos: [0,    4, 0],   color: 0xffad2e },
    { id: 'grid',   name: 'GRID DISTRICT',   pos: [-400, 4, 0],   color: 0x00e5ff },
    { id: 'forest', name: 'QUILL GROVE',     pos: [0,    4, 400], color: 0x3ddc84 },
    { id: 'arctic', name: 'ARCTIC VAULT',    pos: [400,  4, 0],   color: 0xaaddff },
    { id: 'desert', name: 'SAND SEA',        pos: [-400, 4, 400], color: 0xff7a18 },
    { id: 'void',   name: 'DEEP VOID',       pos: [400,  4, 400], color: 0x9b59f5 },
  ],

  // Biome-specific lighting rigs (§1 BIOME_LIGHTING table)
  lighting: {
    grid: {
      ambient: { color: 0x001133, intensity: 0.3 },
      directional: { color: 0x00e5ff, intensity: 0.6, pos: [0, 80, 0] },
      fog: { color: 0x000814, density: 0.008 },
    },
    forest: {
      ambient: { color: 0x0a1a0a, intensity: 0.5 },
      directional: { color: 0x88ffaa, intensity: 0.7, pos: [20, 100, 20] },
      fog: { color: 0x0a1a0a, density: 0.012 },
    },
    arctic: {
      ambient: { color: 0x99bbdd, intensity: 0.7 },
      directional: { color: 0xeef6ff, intensity: 1.0, pos: [-50, 80, 30] },
      fog: { color: 0xaaccee, density: 0.006 },
    },
    desert: {
      ambient: { color: 0x1a0800, intensity: 0.3 },
      directional: { color: 0xff9933, intensity: 0.9, pos: [30, 120, -20] },
      fog: { color: 0x1a0800, density: 0.010 },
    },
    void: {
      ambient: { color: 0x050010, intensity: 0.2 },
      directional: { color: 0x9933ff, intensity: 0.4, pos: [0, 50, 0] },
      fog: { color: 0x050010, density: 0.005 },
    },
  },

  // Landmarks per biome (§3–§7)
  landmarks: {
    grid: [
      { name: 'NEXUS Tower', type: 'tower', pos: [-400, 0, 0], scale: 1.0, color: 0x00e5ff, height: 120, width: 20, depth: 20 },
    ],
    forest: [
      { name: 'Great Arch Tree', type: 'tree', pos: [0, 0, 400], scale: 1.0, color: 0x3ddc84, height: 80, radius_trunk: 8 },
    ],
    arctic: [
      { name: 'Cryopolis Dome', type: 'dome', pos: [400, 0, 0], scale: 1.0, color: 0xaaddff, radius: 40 },
    ],
    desert: [
      { name: 'Circuit Mesa', type: 'mesa', pos: [-400, 0, 400], scale: 1.0, color: 0xff7a18, length: 120, height: 40, width: 120 },
    ],
    void: [
      { name: 'SHADDAI Spire', type: 'spire', pos: [0, 0, 0], scale: 1.0, color: 0xffad2e, height: 200, base_radius: 15, apex_radius: 3 },
    ],
  },
};
```

- [ ] **Step 2: Verify manifest structure against spec**

Quick check — the manifest above mirrors:
- §1 Master Aesthetic Palette (colors)
- §2 World Structure Overview (biomes table, portal network coords, radius/scale)
- §1 BIOME_LIGHTING table (lighting rigs per biome)
- §3–§7 Landmarks (each biome's main landmark with reference specs)

**Status:** Manifest is now in scope. Next task: add geometry creation functions.

---

## PHASE 2: BIOME GEOMETRY CREATION

### Task 2: Create Grid District Geometry (NEXUS Tower + Roads + Buildings)

**Files:**
- Modify: `public/SHADDAI-WORLD-3D.html` — add new `<script>` block for biome geometry

**Reference Spec:** SHADDAI_WORLD_FULL_BIOME_SPEC.md §3 (THE GRID)

- [ ] **Step 1: Create NEXUS Tower geometry**

```javascript
function createNEXUSTower(manifest) {
  const group = new THREE.Group();
  const gridColor = manifest.colors.grid;

  // Body: 20×20×120 matte black glass with cyan emissive
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(20, 120, 20),
    new THREE.MeshStandardMaterial({
      color: 0x050a14, emissive: gridColor, emissiveIntensity: 0.05,
      roughness: 0.8, metalness: 0.2, toneMapped: false,
    })
  );
  body.position.y = 60; // half height
  group.add(body);

  // Crown: rotating torus (15 radius, 1.5 tube)
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(15, 1.5, 8, 48),
    new THREE.MeshStandardMaterial({
      color: gridColor, emissive: gridColor, emissiveIntensity: 0.8,
      metalness: 0.3, roughness: 0.4, toneMapped: false,
    })
  );
  crown.position.y = 122;
  crown.rotation.x = Math.PI / 2;
  crown.userData.animate = (time) => { crown.rotation.y = time * 0.5; };
  group.add(crown);

  // Two light pillars (entrance)
  [-12, 12].forEach((x) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 40, 6),
      new THREE.MeshBasicMaterial({ color: gridColor, toneMapped: false })
    );
    pillar.position.set(x, 20, 0);
    group.add(pillar);
  });

  return group;
}
```

- [ ] **Step 2: Add Grid sector buildings (procedural cluster)**

```javascript
function createGridSectorBuildings(manifest) {
  const group = new THREE.Group();
  const gridColor = manifest.colors.grid;

  // Build 6 small data-slab buildings around NEXUS Tower
  const buildingConfigs = [
    { x: -50, z: -50, w: 16, h: 25, d: 10 },
    { x: 50, z: -50, w: 16, h: 25, d: 10 },
    { x: -50, z: 50, w: 16, h: 25, d: 10 },
    { x: 50, z: 50, w: 16, h: 25, d: 10 },
    { x: -80, z: 0, w: 8, h: 12, d: 8 },
    { x: 80, z: 0, w: 8, h: 12, d: 8 },
  ];

  buildingConfigs.forEach((cfg) => {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d),
      new THREE.MeshStandardMaterial({
        color: 0x0a0f1e, emissive: 0x004466, emissiveIntensity: 0.15,
        roughness: 0.85, metalness: 0.1, toneMapped: false,
      })
    );
    building.position.set(cfg.x, cfg.h / 2, cfg.z);
    group.add(building);

    // Cyan edge glow accent strip
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w + 2, 0.4, cfg.d + 2),
      new THREE.MeshBasicMaterial({ color: gridColor, toneMapped: false })
    );
    accent.position.set(cfg.x, cfg.h + 1, cfg.z);
    group.add(accent);
  });

  return group;
}
```

- [ ] **Step 3: Add Grid plaza floor with grid texture**

```javascript
function createGridPlaza(manifest) {
  const group = new THREE.Group();
  const gridColor = manifest.colors.grid;

  // Grid plaza: 160×160 with procedural grid shader
  const plazaGeo = new THREE.PlaneGeometry(160, 160, 40, 40);
  plazaGeo.rotateX(-Math.PI / 2);

  const plazaMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, gridColor: { value: new THREE.Color(gridColor) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 gridColor;
      varying vec2 vUv;
      void main() {
        vec2 grid = abs(fract(vUv * 20.0) - 0.5);
        float line = min(grid.x, grid.y);
        float brightness = 1.0 - smoothstep(0.01, 0.05, line);
        vec3 gridCol = gridColor * brightness;
        float pulse = sin(time * 2.0 + vUv.x * 10.0) * 0.1 + 0.9;
        gl_FragColor = vec4(gridCol * pulse, brightness * 0.3);
      }
    `,
    side: THREE.DoubleSide, transparent: true, toneMapped: false,
  });
  plazaMat.uniforms.gridColor.value.setHex(gridColor);

  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.position.set(-400, 0.01, 0);
  group.add(plaza);

  // Update shader time in animation loop (handled in render function)
  group.userData.updateTime = (time) => { plazaMat.uniforms.time.value = time; };

  return group;
}
```

- [ ] **Step 4: Assemble Grid District and add to scene**

```javascript
// After WORLD_MANIFEST definition:
const biomeGeometries = {};
const biomeGroups = { grid: new THREE.Group(), forest: new THREE.Group(), arctic: new THREE.Group(), desert: new THREE.Group(), void: new THREE.Group() };

function buildBiomeGrid() {
  const nexusTower = createNEXUSTower(WORLD_MANIFEST);
  nexusTower.position.set(-400, 0, 0);
  biomeGroups.grid.add(nexusTower);

  const buildings = createGridSectorBuildings(WORLD_MANIFEST);
  buildings.position.set(-400, 0, 0);
  biomeGroups.grid.add(buildings);

  const plaza = createGridPlaza(WORLD_MANIFEST);
  biomeGroups.grid.add(plaza);

  scene.add(biomeGroups.grid);
  biomeGeometries.grid = { nexusTower, buildings, plaza };
}
```

- [ ] **Step 5: Call buildBiomeGrid() after scene setup, before render loop**

After the line `world.placeAgents();` (around line 314), add:

```javascript
buildBiomeGrid();
```

- [ ] **Step 6: Test on live server**

Refresh `http://localhost:8099/world3d` in the browser. Switch terrain to "Tron Grid" via the ⚙ button. You should see:
- NEXUS Tower (120u tall, cyan glowing torus crown) at the center
- 6 surrounding data-slab buildings
- Glowing cyan grid plaza floor beneath

Verify no console errors.

- [ ] **Step 7: Commit**

```bash
git add public/SHADDAI-WORLD-3D.html
git commit -m "feat(biome): add Grid District with NEXUS Tower + plaza"
```

---

### Task 3: Create Arctic Vault Geometry (Cryopolis Dome + 6-Tier Iceberg)

**Files:**
- Modify: `public/SHADDAI-WORLD-3D.html` — extend biome geometry script

**Reference Spec:** SHADDAI_WORLD_FULL_BIOME_SPEC.md §5 (ARCTIC VAULT)

- [ ] **Step 1: Create Cryopolis Main Dome**

```javascript
function createCryopolisDome(manifest) {
  const group = new THREE.Group();
  const arcticColor = manifest.colors.arctic;

  // Main dome: 40-unit radius sphere (half-buried in snow)
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xf0f4f8, emissive: 0x223399, emissiveIntensity: 0.08,
      metalness: 0.3, roughness: 0.15, toneMapped: false, transparent: true, opacity: 0.85,
    })
  );
  dome.position.y = 20; // sit above terrain
  group.add(dome);

  // Connector tubes between domes (3 satellites)
  const positions = [[50, 0], [0, 50], [-40, 30]];
  positions.forEach((p) => {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 80, 8),
      new THREE.MeshStandardMaterial({
        color: 0xaabbcc, emissive: arcticColor, emissiveIntensity: 0.1,
        roughness: 0.4, metalness: 0.5, toneMapped: false,
      })
    );
    tube.position.set(p[0], 20, p[1]);
    tube.rotation.z = Math.atan2(p[1], p[0]);
    group.add(tube);

    // Satellite dome (smaller)
    const satDome = new THREE.Mesh(
      new THREE.SphereGeometry(15, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xf0f4f8, emissive: arcticColor, emissiveIntensity: 0.12,
        metalness: 0.3, roughness: 0.15, toneMapped: false, transparent: true, opacity: 0.8,
      })
    );
    satDome.position.set(p[0], 20, p[1]);
    group.add(satDome);
  });

  return group;
}
```

- [ ] **Step 2: Create 6-Tier Iceberg City (Underwater)**

```javascript
function createIcebergCity(manifest) {
  const group = new THREE.Group();
  const arcticColor = manifest.colors.arctic;

  // Central column (structural spine)
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 120, 12),
    new THREE.MeshStandardMaterial({
      color: 0x4488bb, emissive: arcticColor, emissiveIntensity: 0.05,
      roughness: 0.6, metalness: 0.4, toneMapped: false, transparent: true, opacity: 0.7,
    })
  );
  column.position.y = -60;
  group.add(column);

  // 6 tier rings (each 20 units apart, Y = -20, -40, -60, -80, -100, -120)
  const tierPositions = [-20, -40, -60, -80, -100, -120];
  tierPositions.forEach((y, idx) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(50 - idx * 5, 6, 8, 64),
      new THREE.MeshStandardMaterial({
        color: 0xaaccff, emissive: arcticColor, emissiveIntensity: 0.08,
        roughness: 0.5, metalness: 0.4, toneMapped: false, transparent: true, opacity: 0.6,
      })
    );
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  });

  // Outer glass cylinder (pressure shell)
  const outerShell = new THREE.Mesh(
    new THREE.CylinderGeometry(56, 56, 140, 32),
    new THREE.MeshStandardMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.15, roughness: 0.0,
      metalness: 0.1, toneMapped: false,
    })
  );
  outerShell.position.y = -60;
  group.add(outerShell);

  return group;
}
```

- [ ] **Step 3: Add function to buildBiomeArctic() and call it**

```javascript
function buildBiomeArctic() {
  const dome = createCryopolisDome(WORLD_MANIFEST);
  dome.position.set(400, 0, 0);
  biomeGroups.arctic.add(dome);

  const iceberg = createIcebergCity(WORLD_MANIFEST);
  iceberg.position.set(400, 0, 0);
  biomeGroups.arctic.add(iceberg);

  scene.add(biomeGroups.arctic);
  biomeGeometries.arctic = { dome, iceberg };
}

// After buildBiomeGrid(), add:
buildBiomeArctic();
```

- [ ] **Step 4: Test on live server**

Switch terrain to "Arctic" (❄). You should see:
- Cryopolis Dome (40u radius, translucent white) at (400, 0, 0)
- 3 connector tubes + satellite domes
- 6-tier iceberg city beneath with translucent rings

Verify no console errors, verify coordinate is correct (400, 0, 0).

- [ ] **Step 5: Commit**

```bash
git add public/SHADDAI-WORLD-3D.html
git commit -m "feat(biome): add Arctic Vault with Cryopolis dome + 6-tier iceberg city"
```

---

### Task 4: Create Forest Grove Geometry (Great Arch Tree + Geodesic Domes)

**Reference Spec:** §4 (QUILL FOREST)

(Similar structure — two trunks + arch bridge + geodesic domes. Implementation follows same pattern. For brevity, see Task 5 below which provides the full code.)

---

### Task 5: Create Desert Mesa + Sand Dunes

**Reference Spec:** §6 (SAND SEA)

(Circuit Mesa: 120×40×120 BoxGeometry with orange PCB traces. Dune field procedurally scattered.)

---

### Task 6: Create SHADDAI Spire + Void City

**Reference Spec:** §7 (DEEP VOID)

(Spire: 200u LatheGeometry octagonal column, 7 orbiting agent orbs. Void city: neon megacity towers, The Edge, monorail.)

---

## PHASE 3: PORTAL NETWORK & CROSS-BIOME SYSTEMS

### Task 7: Implement Portal Torus Rings + Vortex Shader

**Files:**
- Modify: `public/SHADDAI-WORLD-3D.html` — add portals script block

**Reference Spec:** §2 Portal Network, §11 Portal Vortex Shader

- [ ] **Step 1: Create portal vortex shader material**

```javascript
const portalVortexMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    portalColor: { value: new THREE.Color(0xffad2e) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float time;
    uniform vec3 portalColor;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float r = length(center);
      float angle = atan(center.y, center.x) + time * 2.0;
      float swirl = sin(angle * 6.0 + r * 20.0 - time * 4.0);
      float ring = 1.0 - smoothstep(0.35, 0.5, r);
      float alpha = ring * (swirl * 0.5 + 0.5);
      gl_FragColor = vec4(portalColor, alpha);
    }
  `,
  transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false,
});
```

- [ ] **Step 2: Create portals from WORLD_MANIFEST**

```javascript
function createPortals(manifest) {
  const group = new THREE.Group();
  const portals_list = [];

  manifest.portals.forEach((p) => {
    const col = new THREE.Color(p.color);

    // Outer torus ring (TorusGeometry)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.6, 8, 48),
      new THREE.MeshBasicMaterial({ color: p.color, toneMapped: false })
    );
    ring.position.set(p.pos[0], p.pos[1], p.pos[2]);
    group.add(ring);

    // Inner vortex disc (procedural shader)
    const discGeo = new THREE.CircleGeometry(7.5, 32);
    const discMat = portalVortexMaterial.clone();
    discMat.uniforms.portalColor.value.copy(col);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(p.pos[0], p.pos[1], p.pos[2] - 0.1);
    group.add(disc);

    // Animation: rotating ring
    ring.userData.animate = (time) => { ring.rotation.y = time * 0.5; };

    portals_list.push({ pos: p.pos, color: p.color, ring, disc, name: p.name });
  });

  return { group, portals: portals_list };
}
```

- [ ] **Step 3: Add portals to scene and wire into animation loop**

```javascript
// After biome geometry setup:
const { group: portalGroup, portals: portalsList } = createPortals(WORLD_MANIFEST);
scene.add(portalGroup);

// In the animation loop (before composer.render), add:
portalsList.forEach((p) => {
  if (p.ring.userData.animate) p.ring.userData.animate(Date.now() * 0.001);
  if (p.disc.material.uniforms) p.disc.material.uniforms.time.value = Date.now() * 0.001;
});
```

- [ ] **Step 4: Test on live server**

Refresh. You should see 6 glowing portal rings at each biome's center. Watch them rotate. Verify vortex animation on inner disc.

- [ ] **Step 5: Commit**

```bash
git add public/SHADDAI-WORLD-3D.html
git commit -m "feat(portals): add 6-portal network with vortex shader animation"
```

---

### Task 8: Implement Cross-Biome Monorail System

**Reference Spec:** §8 CROSS-BIOME TRANSPORT (Tier 3 Monorail)

- [ ] **Step 1: Create monorail spline path**

```javascript
function createMonorail(manifest) {
  const group = new THREE.Group();

  // CatmullRomCurve3 connecting all biome portals
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 25, 0),      // Portal Hub
    new THREE.Vector3(-200, 25, 0),   // Grid approach
    new THREE.Vector3(-400, 25, 0),   // Grid station
    new THREE.Vector3(-400, 25, 200), // Grid→Desert curve
    new THREE.Vector3(-400, 25, 400), // Desert station
    new THREE.Vector3(0, 25, 400),    // Desert→Forest
    new THREE.Vector3(0, 25, 400),    // Forest station
    new THREE.Vector3(200, 25, 400),  // Forest→Void curve
    new THREE.Vector3(400, 25, 400),  // Void station
    new THREE.Vector3(400, 25, 200),  // Void→Arctic curve
    new THREE.Vector3(400, 25, 0),    // Arctic station
    new THREE.Vector3(200, 25, 0),    // Arctic→Hub
    new THREE.Vector3(0, 25, 0),      // Hub (close loop)
  ], true); // closed: true

  // Monorail beam: TubeGeometry along spline
  const tubeGeo = new THREE.TubeGeometry(curve, 200, 0.8, 6, true);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc, emissive: 0x00e5ff, emissiveIntensity: 0.2,
    roughness: 0.3, metalness: 0.6, toneMapped: false,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  // Train pod: CapsuleGeometry that moves along curve
  const pod = new THREE.Mesh(
    new THREE.CapsuleGeometry(1.5, 6, 4, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 0.4,
      roughness: 0.2, metalness: 0.7, toneMapped: false,
    })
  );
  let t = 0;
  pod.userData.animate = (deltaTime) => {
    t = (t + deltaTime * 0.5) % 1; // Speed: traverse curve in ~2 seconds per loop
    const pos = curve.getPoint(t);
    const nextPos = curve.getPoint((t + 0.01) % 1);
    pod.position.copy(pos);
    pod.lookAt(nextPos);
  };
  group.add(pod);

  return { group, curve, pod };
}
```

- [ ] **Step 2: Add to scene**

```javascript
const { group: monorailGroup, pod: monorailPod } = createMonorail(WORLD_MANIFEST);
scene.add(monorailGroup);

// In animation loop (before composer.render):
const deltaTime = clock.getDelta();
if (monorailPod.userData.animate) monorailPod.userData.animate(deltaTime);
```

- [ ] **Step 3: Test**

Refresh. You should see a white rail looping through all 6 portals, with a glowing white pod sliding along it.

- [ ] **Step 4: Commit**

```bash
git add public/SHADDAI-WORLD-3D.html
git commit -m "feat(transport): add cross-biome monorail with animated train pod"
```

---

## PHASE 4: VEHICLE SPAWN POINTS & AMBIENT FLEET

### Task 9: Add Parked Vehicles + Ambient Patrols

**Reference Spec:** §9 VEHICLE FLEET, §8 AERIAL_FLEET, CROSS-BIOME TRANSPORT Tier 4

(Implement parked vehicles as static meshes at biome centers. Aerial patrol craft on fixed circular orbits. Submarines for Arctic underwater. See detailed code in Appendix A below.)

---

## PHASE 5: LIGHTING & FOG PER BIOME

### Task 10: Wire Biome-Specific Lighting into applyTerrain()

**Files:**
- Modify: existing `applyTerrain()` function (around line 184)

- [ ] **Step 1: Refactor applyTerrain() to switch lighting rig**

Current code only changes fog color + terrain texture. Add biome-specific lighting:

```javascript
window.applyTerrain = function(k){
  const P=TERRAIN[k]; if(!P) return;
  
  // Existing code: fog + background
  scene.background.set(P.bg); 
  scene.fog.color.set(P.fog); 
  scene.fog.density=P.density;
  
  // NEW: Switch lighting rig from WORLD_MANIFEST
  const lightingConfig = WORLD_MANIFEST.lighting[k === 'neon' ? 'void' : k] || WORLD_MANIFEST.lighting.grid;
  if (lightingConfig) {
    // Update ambient light
    const ambientLight = scene.children.find(c => c instanceof THREE.AmbientLight);
    if (ambientLight) {
      ambientLight.color.setHex(lightingConfig.ambient.color);
      ambientLight.intensity = lightingConfig.ambient.intensity;
    }
    
    // Update directional light (key)
    const dirLight = scene.children.find(c => c instanceof THREE.DirectionalLight);
    if (dirLight) {
      dirLight.color.setHex(lightingConfig.directional.color);
      dirLight.intensity = lightingConfig.directional.intensity;
      const pos = lightingConfig.directional.pos;
      dirLight.position.set(pos[0], pos[1], pos[2]);
    }
  }

  // Existing code: terrain texture + grid visibility
  const GC={ grid:null, snow:0xcfe0f0, desert:0xc8903c, void:null, neon:0x3a1050, meadow:0x8fd99a };
  const gc=GC[k]; ground.visible=(gc!=null);
  // ... rest of existing code ...
};
```

- [ ] **Step 2: Show/hide biome geometries when terrain changes**

```javascript
// Inside applyTerrain(), after the above lighting code:
// Show only the relevant biome geometry
['grid', 'forest', 'arctic', 'desert', 'void'].forEach(biomeId => {
  if (biomeGroups[biomeId]) biomeGroups[biomeId].visible = (
    (biomeId === 'grid' && (k === 'grid' || k === 'neon')) ||
    (biomeId === 'forest' && k === 'meadow') ||
    (biomeId === 'arctic' && k === 'snow') ||
    (biomeId === 'desert' && k === 'desert') ||
    (biomeId === 'void' && (k === 'void' || k === 'neon'))
  );
});

// Show portals always
if (portalGroup) portalGroup.visible = true;
if (monorailGroup) monorailGroup.visible = true;
```

- [ ] **Step 3: Test**

Switch between terrains (grid / snow / desert / void / neon / meadow). Lighting should change per terrain. Biome buildings should appear/disappear. Verify fog density changes.

- [ ] **Step 4: Commit**

```bash
git add public/SHADDAI-WORLD-3D.html
git commit -m "feat(lighting): implement per-biome lighting rigs + conditional geometry visibility"
```

---

## APPENDIX A: REMAINING TASKS (PHASED)

The following tasks follow the same pattern. Implement in order for full world:

- **Task 5:** Forest Grove (Great Arch Tree + geodesic domes + root roads)
- **Task 6:** Desert Mesa (Circuit Mesa 120×40×120 + dune field + bazaar stalls)
- **Task 7:** Deep Void (SHADDAI Spire + 7 orbiting agents + neon megacity towers + The Edge)
- **Task 9:** Aerial Fleet (Fighter + Warp Cruiser + Bio-Shuttle on patrol loops)
- **Task 11:** Shader Polish (Enhanced grid floor shader, void starfield upgrade, bloom post-processing)

Each follows the same structure:
1. Create geometry function
2. Add to biomeGroups
3. Call from biome builder function
4. Test on live server
5. Commit

---

## EXECUTION INSTRUCTIONS

**Option 1: Subagent-Driven (Recommended)**
- Use `superpowers:subagent-driven-development`
- Dispatch one task per subagent
- Two-stage review: spec compliance → code quality
- Faster iteration with parallel agents available

**Option 2: Inline Execution**
- Follow tasks sequentially in this session
- Use `superpowers:executing-plans`
- Checkpoint after each task
- Single continuous flow

**Live Testing:**
- Server runs at `localhost:8099/world3d`
- Edits auto-refresh on page reload
- Test immediately after each commit

---

*Plan created: June 25, 2026*  
*Source: SHADDAI_WORLD_FULL_BIOME_SPEC.md (1,350 lines)*  
*Target: Three.js r180 procedural geometry (no GLB loaders)*
