# Void Castle: procedural set piece (Map v4)

`public/world-void-castle.js` builds the castle, the causeway, the braziers, the dome and the vortex. It's a classic script with no assets and no GLB, and every shape is procedural three.js.
Tests: `node tools/tests/world-void-castle.test.cjs`. They use the real three from `tools/ual`, the real terrain, and no browser.

## The look (owner reference "void castle aesthetic"), in tech-fusion style

| Element | How it is built |
|---|---|
| Dark indigo castle on a rise | An 80 × 80 m plinth (square frustum) raises the castle to the pit lip (31.7 m). On top: a 60 × 60 m curtain wall with angular merlon "fins", 4 octagonal corner towers, 2 gate towers and a 24 m keep. Everything is flat-shaded and hard-edged. Dark panel seams run every 7.5 m. Thin cyan and violet light inlays mark the wall tops, tower bands and slit windows. |
| Spires = energy conduits / antennas | 6 instanced hex spires, 13–17 m long, sit on the towers (tops 30–37 m above the plinth). Each has 3 fins. A second InstancedMesh with the same matrices adds glowing conduit rings, magenta fin edges and a cyan tip beacon. There are also 4 antenna masts on the keep's 38 m shoulder. |
| Brain-shaped nebula dome | A sphere cap (r 9.5 m, centre 54.5 m above the plinth) sits on a flared crown on top of the ~55 m octagonal central tower. The geometry is displaced to look like a brain: a longitudinal fissure, gyri folds, and a shape stretched toward the gate. **Shader:** fresnel rim plus domain-warped fbm "nebula" swirl and thin cyan "neural filaments", additive and double-sided. A pulsing inner core (icosahedron) sits inside, and 3 cyan cage ribs wrap it. |
| Lit portcullis gate | A gatehouse on the south face (toward the overlook) with a pointed-aperture opening 6.4 × 9.5 m. The portcullis is a grid of glowing bars with a backlit violet passage behind it, cyan jamb inlays and a magenta sigil ring above. A magenta conduit line runs up the keep face to the dome. |
| Causeway | 326 m from the overlook straight across the pit, with a gentle S-sway (±18 m, zero slope at both ends). The deck is level at the lip height, so it is a **void bridge** on pylons that drop into the pit. Cross-section: an 8 m walkway, cobble parapets (0.8 m, jittered blocks), a 1.6 m magenta bed on each side, then a curb with a cyan inlay. A violet light line runs along the slab's under-edge. |
| Deck veins | **Shader:** 2D Worley (F2 − F1) with feature points orbiting over time, which gives crawling caustic veins. Two octaves, violet→magenta, with a cyan hot core. Pulses travel toward the gate. Panel seams every 4 m, a cyan edge inlay, and scene fog. |
| Magenta beds | **Shader:** fbm glow with a slow breathing pulse and twinkle sparkles, plus scene fog. |
| Orange fire braziers (the only warm light) | 54 braziers (every 12 m on both parapets), placed on posts. The bowls are one InstancedMesh. The flames are **one** merged mesh of camera-facing billboards: flicker, sway and the teardrop shape are all computed in the shader, so there is no CPU work per frame. |
| Galaxy vortex | A local sky element, not a skybox: a 460 m disc 230 m above the castle, tilted 25° toward the approach. **Shader:** 2 log-spiral arms (seam-free), dust fbm, a bright core and twinkling stars. Additive, `depthWrite:false`, no fog. It brightens at night. **It is skipped at quality `LOW`**, or when `vortex:false` is passed. |

Palette: stone `#1b1638` / obsidian `#0f0c22` / trim `#2a2356`, violet `#7A3DFF`, magenta `#FF2BD6`, cyan `#3DFFF0`, ember `#FF4A1A`.

## Placement (from `terrain.json → features.void`)

- Pit centre (0, 3700) m, r 165, lip 31.71 m. The overlook is at (0, 3513) on the Grid (south) side.
- The castle centre is at (0, 3880) m, **182 m** from the pit centre, on the north lip. The north ground there is only about 20 m high, so the plinth is the "rise". It lifts the castle about 12 m to the lip height and lines it up level with the causeway.
- The causeway runs from Y = 3521 (the overlook edge) to Y = 3841 (the plinth apron in front of the gate). Its length is **326 m**. The pit is 330 m across, so it can't be much shorter unless the castle moves off the axis. The deck height is `max(lip + 0.4, ground + 0.35)`, smoothed, so it never cuts into the ground.
- If `terrainMeta.features.void` is missing, the module falls back to the same values. With `heightAt` ≡ 0 it still builds (tested).

## API

```js
const vc = window.buildWorldVoidCastle({ THREE, scene, heightAt, terrainMeta,
  getPlayer /* optional ()=>({pos}) */, nightFactor /* optional fn or number */,
  quality /* 'LOW'|'MEDIUM'|'HIGH', default window.__quality */, vortex /* default true */, lights /* 0..4, default 4 */ });
// → { group, update(t, dt), colliders, walkableTops, anchors, stats(), dispose(), meshes, lights, shaders }
```

- `update(t, dt)` sets the time and glow uniforms, flickers the lights and pulses the core. It makes no allocations: the tests measured 14 KB of heap drift over 20k calls, after gc. Beyond 900 m it hides the flames and sets the gate and ember light intensities to 0. It never toggles `.visible` on a light, which would force a shader recompile.
- `colliders`: 115 realm-collider records in game units. Rotated boxes are `{x,z,hx,hz,rot,top,label}` and circles are `{x,z,r,top,label}`. They cover the plinth, the 5 wall runs, 6 towers, the gatehouse (the closed portcullis, a solid box; remove `void-castle:gatehouse` to open it), the keep, the parapets (8 m chords) and the pylons. The `rot` convention matches `world-collision.js` and the player controller: local x = (cos rot, −sin rot).
- `walkableTops`: one matching top per solid, so you can stand on the plinth and wall tops. There are also 41 stand-alone `deck:true` causeway segments. The controller treats these as walk-on / walk-under decks, so walking off the bridge drops you into the void.
- `anchors`: `castle`, `gate`, `dome`, `causewayStart`, `causewayEnd`, `pitCentre` (game units). Use them for spawn points, E-prompts and camera shots.

## Host integration (SHADDAI-WORLD-3D.html; not edited here)

Add a link to the `window.__mapV4Ready` chain, for example after the wildlife block:

```js
    .then(function(api){   // MAP v4 VOID CASTLE (world-void-castle.js): spired castle + void causeway on the Deep Void's north lip
      if(!api || !_v4Meta) return api;
      return _loadScript('/world-void-castle.js?v=20260927a').then(function(){
        window.__voidCastle = window.buildWorldVoidCastle({ THREE, scene, heightAt: api.heightAt, terrainMeta: _v4Meta,
          getPlayer: ()=> ({ pos: playerPos }),
          nightFactor: ()=> (_v4Sky && _v4Sky.nightFactor != null ? (typeof _v4Sky.nightFactor === 'function' ? _v4Sky.nightFactor() : _v4Sky.nightFactor) : 0),
          quality: window.__quality });
        const L = window.WORLD_LAYOUT;
        if(L){ L.realmColliders = L.realmColliders || []; Array.prototype.push.apply(L.realmColliders, window.__voidCastle.colliders); }
        const tops = window.WORLD_WALKABLE_TOPS = window.WORLD_WALKABLE_TOPS || [];
        Array.prototype.push.apply(tops, window.__voidCastle.walkableTops);
        if(L && window.buildWorldCollision) window.buildWorldCollision(L);   // re-register with the new solids (same as canon-v4)
        window.__w3dDebug.voidCastle = window.__voidCastle;
      }).catch(function(e){ console.warn('[map-v4] void castle failed:', e && e.message); }).then(function(){ return api; });
    })
```

And in the main loop, next to the other v4 updates (around line 4726):

```js
  if(MAP_V4 && window.__voidCastle) window.__voidCastle.update(t, dt);
```

Notes:
- The `getPlayer` arrow above allocates one small object per frame. That is the same pattern wildlife uses and it is harmless. If you want to avoid it, pass a cached `{ pos: playerPos }`.
- The legacy 2D resolver `WORLD_RESOLVE_POS` ignores `top`, so the plinth box pushes you off the plinth. The player controller (`worldColliders`) handles tops correctly. This is the same caveat canon-v4 roofs already have.

## Perf numbers (measured by the test)

| | |
|---|---|
| Triangles | **28,074** (instances counted; budget 60k) |
| Draw calls | **11**: stone, inlays, deck, beds, spires, spire-conduits, braziers, flames, dome, neural core, vortex (10 at LOW) |
| Real lights | **4** PointLights (dome, gate, 2 shared ember). Pass `lights: 0..4` to cap them. Every light costs every lit fragment in the scene. |
| Colliders / tops | 115 / 156 |
| Per-frame CPU | about 15 uniform writes and 4 light intensities. No allocations and no matrix updates beyond the core pulse. |
| Fragment cost | The deck is 2 × 3×3 Worley per pixel, which is the heaviest part and only covers the causeway. The dome is 3 × 4-octave fbm, on a small screen area. The vortex is 1 fbm. |

## What a later fal / Blender hero pass would replace

- **Castle massing → a GLB hero mesh**: real carved panel relief, arrow-slit depth and a modelled portcullis. Keep the collider list and the anchors: they are the contract. Swap `void-castle-stone` and `void-castle-inlays` for the GLB and keep the shader meshes.
- **Stone material**: vertex colours → a trim-sheet texture (obsidian panels plus emissive inlay mask), from fal or Substance. The `emissive` night ramp in `update()` still applies.
- **Brain dome**: the displaced sphere → a sculpted brain/nebula mesh with a baked curvature map feeding the same shader. The fissure and gyri are currently analytic.
- **Braziers**: instanced primitives → a modelled futuristic brazier. The flame billboards could become a flipbook sprite sheet (fal-generated), with the same one-draw layout.
- **Galaxy vortex**: the procedural shader could become a fal-painted equirect/disc texture on the same plane, which would free up the fbm cost.
- **Cobbles**: jittered boxes → a displaced cobble strip mesh from Blender.
