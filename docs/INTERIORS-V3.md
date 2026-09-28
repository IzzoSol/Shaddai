# Interior engine v3 (`public/world-interiors-v3.js`)

Walk-in building interiors for Map v4 (`?map=v4`). When you get near a building its door slides open, and you walk straight through with no loading screen. The room is built inside the building's own volume. Furniture has colliders, NPCs stand at their slots, and every use point is an E-prompt that goes through the existing city-v3 → city-actions pipeline.

v2 (`public/world-interiors.js`, the 7 agent buildings with portal enter/exit) is unchanged and keeps working. v3 is a separate module.

Test: `node --expose-gc tools/tests/world-interiors-v3.test.cjs` (15 tests: real three from `tools/ual`, the real city JSON, no browser). Without `--expose-gc` the heap check is skipped.

## Which buildings are enterable (3,349)

| Source | Buildings | Recipe |
|---|---|---|
| Grid fabric `sc-storefront-s` | 965 | storefront-s |
| Grid fabric `sc-storefront-l` | 291 | storefront-l |
| Grid fabric `sc-office` | 705 | office |
| Grid fabric `sc-office-mid` | 385 | office-mid |
| Grid fabric `sc-market` | 34 | market (open hall, no shell) |
| Grid fabric `sc-techlab` | 945 | techlab |
| Grid fabric `sc-civic-tower` | 10 | civic-tower |
| Canon `culture-bld_arcade` / `_broadcast` / `_gallery_shop` | 1 each | arcade / broadcast / gallery |
| Canon `culture-studio_01..04` | 4 | studio |
| Canon `deed-office` | 1 | deed-office |
| Canon `academy-hall` (campus) | 1 | campus |
| `HUB_HOME_A..F` markers | 6 | home |

`sc-garden`, `sc-teleport` and `sc-ad-pylon` stay open, with no interior. The 7 agent buildings stay on v2. The production-board family (`bld-bank`, `bld-forge`, `bld-shaddai-hall`, `bld-shop`, `bld-arcade`, `bld-office`) has recipes but no placements yet. Add them with `iv3.register({ key: 'bld-bank', x, z, rot, w, d, h, doorX?, canon? })`.

Everything is lazy. At load only a data index is kept (3,349 small descriptors in an 80 m grid). An interior is built only when you come within 40 m of it.

## Recipes

Layouts are generated to each building's real w×d×h (from `.bl-cache/sc/sc-types.json`, or the canon OBB) with a seeded RNG (FNV hash of the building id). The same building always gets the same room, and neighbours differ.

| Recipe | Contents | E-uses → panel |
|---|---|---|
| storefront-s | shop floor, counter + shopkeeper, wall shelves, holo-shelves, back office (partition + doorway, clerk desk, stash, terminal) | counter → `STALL_*` (bazaar) |
| storefront-l | the same, bigger: 4 holo-shelves, lounge sofas, rug, 2 office desks | counter → bazaar |
| office / office-mid | reception counter, 2 desk rows with workers, glass meeting room (back-left), lift, sofas | desks + reception → `OBJ_HIRING_BOARD` (hire) |
| market | 4 stall rows (back, back-to-back island, front) with vendors | stalls → bazaar |
| techlab | NEXUS lab: server-rack wall, 2 workbench rows with engineers, holo-shelves, terminals | workbench → `NODE_SKILL_INSTALL` (seat) |
| civic-tower | lobby, reception, lift, sofas | reception → info |
| home | bed pod, wardrobe, stash, mail terminal, sofa, rug | bed/stash/wardrobe → `HUB_HOME_x` (home), mail → `NODE_MAIL` |
| arcade | one cabinet per SHADDAI Arcade game (blackjack, skate, skillplay, gridiron, neon-hoops, dodgeball, starfall, reflex, rhythm, prediction), plus a blackjack table with a dealer-bot slot | cabinet → `ARCADE_CAB_<GAME>` (`props.game`), table → `CASINO_TABLE_BLACKJACK` |
| gallery | `SLOT_GALLERY_01..08` frames on the walls, shop counter, benches | frame → `SLOT_GALLERY_0n`, counter → `BLD_GALLERY_SHOP` |
| broadcast | studio desk + host, control room (partition) with racks + terminal | desk → `BLD_BROADCAST` (radio) |
| studio | workbench, terminal, sofa | workbench → `STUDIO_*` |
| deed-office | 3 clerk counters, claim kiosks, waiting sofas | → `DEED_OFFICE` (plots) |
| campus | 3 classrooms (lectern + teacher, desk rows), forge bays (anvil stations + smiths), workbenches, class board | lectern → `CLASS_0n`, anvil → `NODE_SKILL_INSTALL`, board → `OBJ_CLASS_BOARD` |
| bank / forge / shaddai-hall | teller counters + kiosks / anvils + benches / casino tables + bar + cabinets | → `OBJ_SPARKS_KIOSK` / seat / casino |

The game list comes from `Shaddai-Royale` `hall/packs` (blackjack, skate, skillplay-bet), the IzzoSol/shaddai-games titles, and the four Culture Lane cabinets (`ARCADE_CAB_01..04`).

Every use marker has the same shape as city-v3's `normMarker()`, with `interactive: true`, a `dashboard_id` and `endpoints`. city-actions therefore chooses the panel family from the name or `dashboard_id`, exactly as it does for Blender markers. The test checks this with `world-city-actions.js`'s own `family()`. Each marker also carries `marker.interior = { building, recipe, kind, type, tag }`.

## Frames and doors

- **Fabric buildings** are built in the same frame `world-clusters-v4.js` uses: position `(x_m·U, −y_m·U)`, `rotation.y = −yaw`. The front (Blender −Y) is local +z, and the door is centred on that wall. The canon OBB for each instance is found by kind (`<cluster>-<type>`) and position. Its `rot` equals `−yaw`.
- **Canon one-offs** use the canon OBB. The door face is the side where the anchor marker stands (`BLD_ARCADE`, `BLD_BROADCAST`, `BLD_GALLERY_SHOP`, `DEED_OFFICE`, `CLASS_01`, and the nearest `STUDIO_*`, each about 1.2 m outside a wall). The door is placed along the wall at the marker.
- **HUB homes**: a 10×8 m home unit is carved into the block that the `HUB_HOME_*` marker stands against (A–D), with the door at the marker. The rest of that block stays solid, as three OBBs. E and F stand about 20 m from any building, so they get a stand-alone unit with its door facing the city centre. That unit's shell is the whole building.

## Colliders (canon data is never edited)

While you are within 40 m of an enterable building (released at 48 m):

1. Its solid canon OBB is spliced out of `WORLD_LAYOUT.realmColliders`. The object is kept and pushed back on release, so nothing is edited globally or permanently.
2. The interior's colliders are pushed in their place. These are OBBs `{x, z, hx, hz, rot, top, label:'int3:<id>:…'}` for the shell walls (the front wall is split around the door gap), the partitions (with doorways), the furniture, and the rest of a home's block.
3. `window.buildWorldCollision(WORLD_LAYOUT)` is called. The player controller's `worldColliders(window)` adapter rebuilds by itself, because the list length changes.

Only one building is swapped at a time. The building's walkable top in `WORLD_WALKABLE_TOPS` stays, so its roof becomes a deck you can stand on and walk under.

## Runtime

```js
const iv3 = window.buildWorldInteriorsV3({ THREE, scene, getPlayer: () => ({ pos }), heightAt, furniture: window.SHADDAI_FURNITURE,
  city: window.__cityV3, onUse({ building, kind, type, marker }) {}, onEnter(b) {}, onExit(b) {} });
iv3.update(dt); iv3.nearestDoor(pos); iv3.enter(id) /* → spawn {x,y,z,rotY} inside the door */; iv3.exit() /* → spot outside */;
iv3.isInside(); iv3.current(); iv3.stats(); iv3.handleInteract(marker) /* true if it was an interior use */; iv3.setNpcFactory((slot, b) => Object3D);
```

- **Inside** means the player is within the footprint and between the floor and the ceiling. On entering, the building's own fabric instance is hidden: its instance matrix is zeroed in the `grid-fabric-v4` InstancedMeshes, then restored on exit. The interior's use markers are pushed into `city.markers` so city-v3 shows the E-prompt. `onEnter` fires. On leaving, all of this is reversed.
- For canon buildings and homes (one merged canon GLB), nothing is hidden by default. Pass `setExteriorVisible(building, visible)` if the canon root gets split later.
- **Door:** two glass leaves 4 cm proud of the façade slide open within 2 m. The door gap in the colliders is always open.
- **NPCs:** placeholder capsules with an emerald visor. They bob while idle and turn to face you within 4 m. There are at most 12, and only in the current building. `setNpcFactory` swaps in rigged agents for interiors built after the call.
- **Furniture** comes from `window.SHADDAI_FURNITURE` (`build`/`kinds`/`meta`, in metres) when it has the kind, matched with aliases after normalising names. Anything it lacks uses the built-in box FALLBACK, which has the same meta shape. Each kind is one InstancedMesh per template part.

### Performance (Intel HD 620)

- Only the current building's interior is in the scene. The last 3 are cached (detached), and older ones are disposed. Templates, geometries and materials are shared.
- About 15–35 draw calls per interior.
- A fixed pool of 4 PointLights (no shadows) stays in the scene at all times, with intensity 0 when idle. The light count never changes, so entering never triggers a shader recompile.
- The building scan runs at 4 Hz on an 80 m grid with numeric keys. `update()` is allocation-free: under 64 KB heap drift over 20,000 frames (tested).

## Host snippet (`public/SHADDAI-WORLD-3D.html`, NOT applied: the host was not edited)

**1.** Append this step to the `window.__mapV4Ready` chain after the **CITY ACTIONS** step (`world-city-actions.js`), before the void-castle step:

```js
    .then(function(api){   // MAP v4 INTERIORS v3 (world-interiors-v3.js): walk-in shops/offices/labs/market/homes/culture lane/deed office/campus
      if(!api) return api;
      const furn = window.SHADDAI_FURNITURE ? Promise.resolve() : _loadScript('/world-furniture.js?v=20260928a').catch(function(){});   // optional: box fallback without it
      return furn.then(function(){ return _loadScript('/world-interiors-v3.js?v=20260928a'); }).then(function(){
        window.__interiorsV3 = window.buildWorldInteriorsV3({ THREE, scene, heightAt: api.heightAt, city: window.__cityV3,
          getPlayer: ()=> ({ pos: (_interiors && _interiors.isInside()) ? null : playerPos }),
          onUse: function(e){ if(window.__onInteriorUse) window.__onInteriorUse(e); else console.info('[interiors-v3] use', e.type, e.kind, e.building.id); },
          onEnter: function(b){ if(window.__hudV4 && window.__hudV4.ping) window.__hudV4.ping({ type: 'info', text: 'Entered ' + b.recipe }); } });
        // E at an interior use point: tell v3 (onUse → launch game / rest / lift), then let city-actions open its panel as usual
        const prev = window.__onCityInteract;
        window.__onCityInteract = function(m){ const mine = window.__interiorsV3.handleInteract(m); if(prev && !(mine && m.interior && m.interior.type === 'lift')) prev(m); };
        window.__w3dDebug.interiorsV3 = window.__interiorsV3;
        return window.__interiorsV3.ready;
      }).catch(function(e){ console.warn('[map-v4] interiors v3 failed:', e && e.message); }).then(function(){ return api; });
    })
```

**2.** In the animation loop, next to `window.__cityV3.update(dt)` (around line 4844), add:

```js
  if(MAP_V4 && window.__interiorsV3 && !_spawnBusy) window.__interiorsV3.update(dt);
```

**3.** Optional: `window.__onInteriorUse = e => { if(e.type === 'arcade') openGame(e.marker.props.game); … }` to launch a game straight from a cabinet. A bed use arrives as `type: 'rest'` with the home's `dashboard_id`.

## Needs a real browser look

- **Door side of the fabric GLBs.** The code trusts sc-types: front = Blender −Y = three +z. The test proves the door matches that convention exactly, but not that the art's door is on that face.
- **Z-fighting and see-through.** Interior walls are drawn inset 8 cm and door leaves sit 4 cm proud. Check the glass storefronts from outside, and the camera clipping through the canon façade at HUB homes and Culture Lane, where the canon GLB is not hidden.
- **Light level.** Point intensity is `40·U²` with distance 11 m·U and decay 2. Emissive ceiling panels and the emerald trim also need a visual pass for day and night.
- **Canon heights.** The ceiling is `min(h − 0.3, 4.2 m)` (3.4 m in homes). Check it against the canon buildings' real eaves.
- **Multi-storey offices and the civic tower.** Only the ground floor is furnished. The lift is an E-use (`type: 'lift'`) with no upper floors yet.
- **Culture Lane gallery.** Its anchor sits at a building corner, so the door is clamped about 2.9 m along the wall from `BLD_GALLERY_SHOP`.
