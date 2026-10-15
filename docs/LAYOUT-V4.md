# WORLD_LAYOUT under Map v4 (`?map=v4`)

`public/world-layout.js` rewrites the map-scale fields of `window.WORLD_LAYOUT` for Map v4 (the ≈10 km
Blender-baked world) only when the URL contains `?map=v4`. Without the flag the layout is Map v3, and it is
**identical to the previous commit**. This was checked by deep-comparing the old and new objects, including
function bodies. v3 only gains `mapVersion: 'v3'` and `terrainMeta: null`.

## Source of truth

`public/assets/terrain/terrain.json` is written by `tools/blender/terrain-v4.py`.

- `world-layout.js` reads it with a **synchronous XHR**, because it is a classic script loaded before the modules.
- If the XHR fails, it uses an embedded `FALLBACK` copy of the map-scale fields. **Regenerate that block whenever
  terrain-v4.py is re-run.** The XHR and the fallback produce identical stations and model positions.
- Coordinates: metres use X = east and Y = north. Game units are `x = X·U`, `z = -Y·U`, with `U = 7/1.8`.
  Compass is measured in degrees clockwise from north.

## What changes under v4

| Field | v4 value |
|---|---|
| `mapVersion` / `terrainMeta` | `'v4'` / the parsed terrain.json (`._fallback` if embedded) |
| `half` | `half_units` (19444) |
| `city.radius` | `grid_r_m·U` (6222) |
| `transit.radius` | `ring_r_m·U` (11000) |
| `mountains` | all zero |
| `biomes` | Same ids, names, colours, ground and fog. `center` = wedge centroid, `radius` = inscribed radius (min of half arc width and half depth). Each biome also gets `sector {c0,c1,r0,r1}` (compass degrees, game units). The ocean biome's `dock` sits on the harbor bearing at the ocean's inner edge. The terrain.json realm `colo` is **not** a biome. |
| `biomeAt(x,z)` | Checks in this order: (1) inside the Grid → `grid`; (2) inside a sector (on an edge overlap, the nearest centre wins); (3) inside the colo wedge → `grid` (a grid-like plain); (4) same bearing as a sector but radially outside its band → that sector; (5) otherwise the nearest centre. |
| `stations` | Built from terrain.json `xy_m`, keeping the same ids, names, realms and dragons, plus `compass`. `central` = `[0, grid_r·U + 40]`. |
| `landmarks.colosseum` | `pos = [0, (ring_r_m + 300)·U]` = `[0, 12167]`, footprint 420 |
| `realmModels` | Every entry is re-placed from the owner-atlas table (`ATLAS`: compass, fraction of `rim_m`, yaw). Where yaw is given, `ry = yaw·π/180`; the rocks and crystals keep their v3 `ry`. `toCity` is dropped. `w`, `url` and colliders are derived exactly as before. |
| `compassOf(x,z)` | New helper: game coordinates → compass degrees |
| `window.ROOM_ISLAND_X` | v3: 6000, v4: 30000 |

**Atlas conflict (owner call needed):** `hero-forest-amphitheater` is at atlas (127°, 0.793), which is 3806 m out
in the **meadow** wedge (122–172°). terrain.json's forest wedge is 86–120° from 1720 to 3128 m. The model is still
mounted, because `world-realmprops.js` mounts by realm list and not by position. However, `biomeAt` reports
meadow there, and the ground under it is painted meadow. There are two fixes:

- Move it, for example to (103°, 0.52), which is inside the forest wedge.
- Or change its realm to `meadow`.

All other 27 models are inside their own realm's sector and outside the Grid.

## Interior island (world-interiors.js)

`world-interiors.js` now takes its room island from `window.ROOM_ISLAND_X`. `world-layout.js` sets it first; if
that global is missing, interiors falls back to 30000 under `?map=v4` and 6000 otherwise.

- Rooms sit at `ROOM_ISLAND_X + idx·500`.
- The colosseum arena sits at `ROOM_ISLAND_X + 6000`.
- The band-heal range is `[ROOM_ISLAND_X − 1000, ROOM_ISLAND_X + 8500]`:
  - v3: `[5000, 14500]`, unchanged.
  - v4: `[29000, 38500]`, entirely beyond the ±19444u terrain.

## REQUIRED host / other-file change: world-colosseum.js (not owned here)

`world-colosseum.js` hard-codes `X0 = 12000` at parse time. It is loaded **after** `world-layout.js`, which sets
`ROOM_ISLAND_X`, so reading the global at parse time works.

Under v4, if this change is **not** made:

- The arena instance stands inside the v4 terrain, at compass 90° and 3086 m (the forest/suburb area).
- It is also outside the v4 island band. The interiors off-island heal would clear the inside state the moment
  you enter, so the colosseum would be unenterable.

One-line change (`public/world-colosseum.js`, line 14):

```js
// before
  var U = 7 / 1.8, X0 = 12000, Z0 = 0;
// after
  var U = 7 / 1.8, X0 = (typeof window.ROOM_ISLAND_X === 'number' ? window.ROOM_ISLAND_X + 6000 : 12000), Z0 = 0;
```

In v3 this still evaluates to 12000. Also bump its cache key in `SHADDAI-WORLD-3D.html`:

```html
<script src="/world-colosseum.js?v=20260925b"></script>
```
→
```html
<script src="/world-colosseum.js?v=20260926v4"></script>
```

## Cache keys (SHADDAI-WORLD-3D.html, host — optional but recommended)

Bump these so returning browsers pick up the edits:

```html
<script src="/world-layout.js?v=20260925m6"></script>     → ?v=20260926v4
<script src="/world-editor.js?v=20260925b"></script>      → ?v=20260926v4
<script src="/world-interiors.js?v=20260925m3"></script>  → ?v=20260926v4
```

## Placement editor (world-editor.js)

Saved edits are namespaced by map version:

- v4 uses `localStorage['shd.placementEdits.v4']`.
- v3 keeps `shd.placementEdits`.

So v3 edits never pin v4 models. Under v4, "Copy for Claude" prefixes its output with `(map v4)`.

## Not handled here (for the host / world-fill-v4 owner)

- `world-volcano.js` still builds its procedural cone and lava at the volcano biome centre, now (11556, −6016) with
  radius 3918. That will sit on top of the baked v4 volcano. Decide whether to skip the cone under v4.
- `world-nature.js` scatters forest, meadow and darkforest nature inside each biome's inscribed circle
  (centre, radius). On v4 those circles are large (2700–5600u).
- `world-falprops.js` keeps its hard-coded city-scale `dockAt`/sign positions. Those are Grid-local, which is fine.
