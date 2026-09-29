# Realm homes (2026-09-29) — `public/world-realm-homes.js`
Five home kits built from the owner's refs (`fal-assets/refs/world/*`), all CODE ($0), instanced, lazy, enterable.

| type | ref | look | sink | realm (default plan) |
|---|---|---|---|---|
| `earth-burrow` | meadow-hillside-earth-homes | turf-roof half-buried loaf, wood front, glass arches with mullions, round skylights, stepping stones; door faces DOWNHILL | 0.35 m | Meadowfields |
| `cave-home` | meadow-cliff-cave-homes | rock overhang over a carved cliff, 3 arched wooden doors, grass terrace, pool, steps | 0.4 m | Meadow, Emberfall |
| `leaf-tree-home` | forest-treehouse-sketches | white tower, 3 swept leaf canopies, blue ribbed glow band, spire + orb, root buttresses | 0 | Darkforest |
| `pod-home` | forest-pod-village | egg pod, silver roof shell, glass front, wood deck + stairs on legs | 0 | Suburbs, Harbor |
| `arctic-dome` | arctic-white-dome-village | frosted dome, cyan glow rings, entrance tunnel, ice spikes | 0.3 m | Arctic Vault |
(Sand Sea keeps the sand houses in interiors v3.)

API: `rh = buildWorldRealmHomes({THREE, scene, heightAt, interiors, layout})` · `rh.place(type, x, z, {yaw?, ownerId?, id?})` · `rh.village(type, cx, cz, n, {radius, seed})` · `rh.update(px, pz)` (host calls it at 2 Hz) · `rh.homes`.
Host wiring: `SHADDAI-WORLD-3D.html` (after interiors v3 is ready) builds a village per station from `PLAN`; the handle is `window.__realmHomes`.

**Performance:** one `InstancedMesh` per (type, material) = 33 draw calls MAX no matter how many homes; only homes within `cullM` (650 m) are written to the buffers. Shared geometry/materials (Lambert). Nothing runs until placed.
**Interiors:** each home registers with `world-interiors-v3` and gets a themed recipe (styles `earth`, `cave`, `leaf`, `pod`, `ice`): bed (respawn), stash, wardrobe, mail, 2 arcade cabinets (play vs agents/people), trade counter, workbench, hydration, comms, sofa, rug, planter. The bed registers a **respawn rest point** with `WorldSurvival` (kind `realm-bed` until someone owns it, then `home`); save it from Navi > Plots.
Preview: `public/realm-homes-preview.html` (slope + all five types).
TODO: crystal/ember/void homes, castles per realm, customization slots (owner furniture/skin), per-realm village layouts from the atlas, owned-home purchase flow via plots API, LODs if counts grow past 48 per type.
