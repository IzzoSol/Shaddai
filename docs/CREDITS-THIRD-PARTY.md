# Third-party credits (code and art we adapted or ship)

| What | From | License | Where used |
|---|---|---|---|
| three.js r180 core + addons (GLTFLoader, DRACOLoader, EffectComposer, UnrealBloomPass, SkeletonUtils, PointerLockControls, RoomEnvironment, OrbitControls, TransformControls, BufferGeometryUtils, meshopt decoder), Draco decoder | mrdoob/three.js | MIT (Draco: Apache-2.0) | `public/vendor/three/` (self-hosted by `tools/vendor-three.cjs`) |
| Grass tuft and flower textures (grass01/02, flowers01/02), tweaked-normals crossed-quad technique | jeromeetienne/threex.grass | MIT (license kept at `public/assets/grass/threex.grass-LICENSE.txt`) | `public/world-grass.js` textured clumps, `public/assets/grass/clumps-atlas.webp` |
| Fish species table shape, length-weight and value model, tension-band fishing fight idea | dgreenheck/tidewater, (c) 2026 DRG Software Solutions LLC | MIT | `public/world-fishing.js` (data and rules rewritten and extended; no engine code used) |

## Studied for ideas only (no code, art or names copied; no usable license or Nintendo IP)
Mario-Kart-style browser clones and Unity kart projects: see `docs/RACE-REFERENCES.md`.

Tidewater's ocean/sky rendering is a custom WebGPU/WGSL engine for capable GPUs; it is not used (our target includes Intel HD 620 laptops). Revisit its water ideas (foam, depth tint, whale breach) as three.js shader work later.
