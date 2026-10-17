# Grid Fabric loader (Map v4)

`public/world-clusters-v4.js` (rev 3) now loads **two** placement files with the same code:

| Call | Placement file | Models | Tiers (metres from the cell) |
|------|----------------|--------|------------------------------|
| realm districts (unchanged) | `/assets/world/realm-clusters-v4.json` | `/assets/models/…`, `/assets/models/fal/…`, lods in `/assets/models/lod/` | full < 450 · lod1 < 2500 · hidden beyond (no lod2 fetched) |
| **grid fabric** | `/assets/world/grid-fabric-v4.json` (4,183 items, 10 `sc-*` keys, clusters `commons` / `ne-campus` / `nw-race`) | `/assets/models/shaddai-city/<key>.glb`, lods `/assets/models/shaddai-city/lod/<key>-lod{1,2}.glb` | full < 250 (casts shadow) · lod1 < 900 · lod2 < 2600 · hidden beyond |

## New options

```
window.buildWorldClustersV4({ THREE, scene, loader, heightAt,
  url,      // placement JSON (default '/assets/world/realm-clusters-v4.json')
  name,     // THREE.Group name (default 'world-clusters-v4', or 'grid-fabric-v4' when url contains 'grid-fabric')
  near_m,   // full model (castShadow) below this
  far_m,    // lod1 below this
  hide_m    // lod2 below this, hidden beyond. Only when hide_m > far_m is lod2 requested at all.
})  → Promise<{ group, update(t, dt, camPos), stats(), dispose() }>
```

Defaults come from the URL: anything containing `grid-fabric` gets 250 / 900 / 2600; everything else gets the old 450 / 2500 (no lod2).

**Fallbacks (per model key):** missing lod1 → full model covers the lod1 band (same as before). Missing lod2 (404) → lod1 covers the lod2 band too (or the full model if lod1 is missing as well). The key is listed in `stats().noLod2`. Missing **full** model → that key is skipped and listed in `stats().failed`, and the rest still load. That means it is safe to wire this in before the `shaddai-city` GLBs exist.

## Host snippet (for `public/SHADDAI-WORLD-3D.html`, coordinator to apply)

Add this after the MAP v4 DISTRICTS `.then(...)` block (around line 477), next to the existing clusters call:

```js
    .then(function(api){   // MAP v4 GRID FABRIC (world-clusters-v4.js ← grid-fabric-v4.json): city storefronts/offices/labs, 3-tier LOD
      if(!api) return api;
      return _loadScript('/world-clusters-v4.js?v=20260927fabric').then(function(){
        const gl = new GLTFLoader(); gl.setDRACOLoader(dracoLoader); gl.setMeshoptDecoder(MeshoptDecoder);
        return window.buildWorldClustersV4({ THREE, scene, loader: gl, heightAt: api.heightAt,
          url: '/assets/world/grid-fabric-v4.json', name: 'grid-fabric-v4' });   // defaults: near 250 · lod1 900 · lod2 2600 m
      }).then(function(c){ window.__w3dDebug.gridFabricV4 = c; }).catch(function(e){ console.warn('[map-v4] grid fabric failed:', e && e.message); }).then(function(){ return api; });
    })
```

Also bump the existing realm call's `?v=20260926lod` to the same `?v=20260927fabric` (the script is a single file, so both calls must load the rev-3 version; `_loadScript` with two different `?v=` values would evaluate it twice, which is harmless but wasteful).

In the frame loop (the `if(MAP_V4){ … }` line, currently ~line 4695), next to the clustersV4 update:

```js
if(window.__w3dDebug.gridFabricV4 && window.__w3dDebug.gridFabricV4.update) window.__w3dDebug.gridFabricV4.update(t, dt, camera.position);
```

## Draw calls to expect

Instancing is per **(1 km cell, model key)**, as in the realm loader, and each batch is multiplied by the mesh/material parts of that model's GLB. For `grid-fabric-v4.json` that means **12 cells** and **70 (cell, key) batches** in total, computed by the test. Only one tier per batch is visible at a time, so the worst case (everything in view) is about 70 × parts-per-model draw calls. At 1 part per model that is ≈ 70; frustum culling on the tight per-cell bounds cuts it further. Full-tier batches also render in the shadow pass.

Note on distances: the cell distance is `|cam − cell centroid| − 700 m` (unchanged from rev 2). With 1 km cells, "full < 250 m" therefore means that the cell you stand in and its direct neighbours render full detail and cast shadows. At the default settings you should expect roughly 1–4 fabric cells at full detail.

## Test

`node tools/tests/world-clusters-fabric.test.cjs` checks urlOf (realm vs `sc-`), the presets, pickTier at the band edges and fallbacks, exact rev-2 parity for realm tiers, that every fabric item maps to a known key, and the cell/batch count.
