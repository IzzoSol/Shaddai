# City v3 runtime (`public/world-city-v3.js`)

Loads the Blender-exported City v3 data into the Map v4 game (`?map=v4`). It handles three things:

- **Interaction.** Pressing E next to a marker calls `onInteract(marker)`.
- **Plot beacons.** The lights show the ledger state (DOC_PLOTS).
- **Art slots.** A slot gets a mesh only when it is filled.

The module does no SPARKS math and makes no backend calls. It only fires callbacks, and the dashboard/backend layer owns money (DOC_SPARKS: SPARKS stays in the game and can never be cashed out).

Test: `node tools/tests/world-city-v3.test.cjs`. It uses the real `three` from `tools/ual` and loads the real JSON files from disk.

## Data

| File | Contents |
|---|---|
| `public/assets/world/markers-v4.json` | 108 named markers; `props` carry `dashboard_id`, `endpoint`, `paybox_merchant_id`, `sparks_price`, `skill_required` / `skill_gate` |
| `public/assets/world/plots-v4.json` | 1,275 SW plots (deed rows) |
| `public/assets/world/art-slots-v4.json` | 7,906 art slots (4,969 `SLOT_FACADE`, 2,937 `SLOT_HOME`) |

Coordinates are metres with X east, Y north and Z up. Game units are `x = X·U`, `y = Z·U`, `z = -Y·U`, where `U = 7/1.8`.
Plot and slot `yaw` is in degrees (the clusters-loader format), so `rotation.y = -yaw·π/180`.
Slot `pos_m[2]` is the bottom edge of the panel, so the mesh centre sits at `z + h/2`.

## API

```js
const city = window.buildWorldCityV3({
  THREE, scene,
  getPlayer: () => ({ pos }),          // pos in game units (x, y, z); y is optional (it enables the vertical tolerance)
  heightAt,                            // optional (x, z) → game-unit ground; beacons sit 3.3 m above it (default ground 6 m)
  fetchJSON,                           // optional url → Promise<json> (default: fetch)
  onInteract(marker) {},               // player pressed E within 3 m of an interactive marker
  onPing(evt) {},                      // {type:'plot', plot_id, state} | {type:'art', slot_id, filled}
  base: '/assets/world/',              // optional
  radius_m: 3, vTol_m: 6               // optional interaction radius / vertical tolerance (metres)
});
```

| Member | Description |
|---|---|
| `ready` | A Promise that resolves once the 3 JSON files are loaded. Calls to `setPlotState` or `placeArt` made before then are queued and applied on load. |
| `update(dt)` | Call every frame. Scans for the nearest interactive marker and updates the prompt about 5 times per second. |
| `markers` | Normalised markers: `{name, title, pos_m, pos:{x,y,z}, props, interactive, dashboard_id, endpoint, merchant, sparks_price, skill, skills[]}`. `props` values that are JSON strings are parsed. |
| `nearest(pos, r_m = 3)` | The nearest interactive marker within `r_m` (horizontal distance, plus a vertical tolerance of 6 m when `pos.y` is set), or `null`. |
| `current()` / `interact()` | The marker currently in range. `interact()` fires `onInteract` programmatically, for touch or UI buttons. |
| `marker(name)`, `plot(id)`, `slot(id)` | Registry lookups. |
| `setPlotState(plot_id, state)` | `state` is one of `empty`, `claimed`, `built`, `listed` or `lapsed`. Recolours one beacon instance and pings. Does not ping when the state is unchanged. Returns `false` for an unknown plot or state. |
| `placeArt(slot_id, texture \| null)` | A texture creates or replaces that slot's plane (w×h, `map` + `emissiveMap`, 5 cm in front of the blank panel). `null` removes the plane. Pings `{type:'art'}`. The caller owns the texture. |
| `stats()` | `{loaded, markers, interactive, plots, plotsByState:{…}, slots, filledSlots, current}` |
| `dispose()` | Removes the key listener, the DOM prompt, the meshes and the group. |

**Interactive markers** are markers that have an `endpoint`, `dashboard_id`, `paybox_merchant_id`, `skill_required` or `skill_gate`. The data has 76 of them.

**Beacon colours** come from a single `InstancedMesh` with one instance per plot. The mesh uses `MeshBasicMaterial` with `toneMapped: false`, so the colours read as emissive.

| State | Colour |
|---|---|
| empty | black / off |
| claimed | `#00ff9c` |
| built | `#FFF2D0` |
| listed | `#3DFFF0` |
| lapsed | `#3A3C40` |

**Prompt** is a fixed `div#city-v3-prompt` with text such as `E — Hiring Board · work.hire`. Colours: `#06080b` background, `#00ff9c` text and a `#e8c45c` SPARKS price (for example `10 SPARKS`, or `SPARKS · claim fee (DOC_PLOTS)`). The E key is ignored when the target is an input, textarea, select or contentEditable element, and when the key is repeating or a modifier is held.

## Host integration (`public/SHADDAI-WORLD-3D.html`, not applied yet)

Three steps are needed. None of them has been applied to the host file yet.

**1. Load the script.** `_loadScript` is used, so no static script tag is needed. If you prefer a static tag, add this next to the other world scripts:

```html
<script src="/world-city-v3.js?v=20260927a"></script>
```

**2. Build after the v4 chain.** Append one more `.then` to the `window.__mapV4Ready` chain, right after the wildlife step (`world-wildlife-v4.js`), before the terminating `;`:

```js
    .then(function(api){   // MAP v4 CITY v3 RUNTIME (world-city-v3.js ← markers/plots/art-slots-v4.json): E-interact, plot beacons, art slots
      if(!api) return api;
      return _loadScript('/world-city-v3.js?v=20260927a').then(function(){
        window.__cityV3 = window.buildWorldCityV3({ THREE, scene, heightAt: api.heightAt,
          getPlayer: ()=> ({ pos: (_interiors && _interiors.isInside()) ? null : playerPos }),
          onInteract: m => { if(window.__onCityInteract) window.__onCityInteract(m); else console.info('[city-v3] interact', m.name, m.dashboard_id, m.endpoint); },
          onPing: e => { if(window.__onCityPing) window.__onCityPing(e); } });
        window.__w3dDebug.cityV3 = window.__cityV3;
        return window.__cityV3.ready;
      }).catch(function(e){ console.warn('[map-v4] city v3 failed:', e && e.message); }).then(function(){ return api; });
    });
```

In the chain as it stands, remove the `;` that ends the wildlife `.then(...)` so the new step chains on.

**3. Update every frame.** In the animation loop, next to `window.__wildlife.update(dt)` (around line 4697), add:

```js
  if(MAP_V4 && window.__cityV3 && !_spawnBusy) window.__cityV3.update(dt);
```

**Wiring the dashboard.** Point `window.__onCityInteract(marker)` at the dashboard. Open the tile for `marker.dashboard_id`, and route `marker.merchant` / `marker.sparks_price` through the PayBox/x402 pay-in flow on the backend. Feed ledger changes back with `__cityV3.setPlotState(id, state)` and `__cityV3.placeArt(slotId, texture)`.

**The E key is shared.** The host already binds `KeyE` in at least three places (around lines 2635, 2933 and 3667: transit, interiors and the locked-controls action). This module adds a separate listener and fires only when a city marker is within 3 m. If two actions clash in the same spot, gate the host handlers on `window.__cityV3 && window.__cityV3.current()`.

## Data notes

- All 1,275 plots are `empty`, lie inside the SW petal (bearing 209.5° to 269.2°) and sit outside the core (r > 170 m). `beacon_m` is 12.2 m to 16.7 m from the plot centre. Every `art_slot` resolves, and no slot is shared.
- The terrain heightmap reads 6.00 m at every marker and plot sampled, which matches the markers' `z = 6`, so `Z·U` agrees with `heightAt`.
- `SLOT_GALLERY_01`–`08` are markers only. They have no `w_m`, `h_m` or `yaw`, and they are not in `art-slots-v4.json`, so `placeArt` cannot fill them yet.
- `sparks_price` is sometimes descriptive text rather than a number, for example `"per skill (DOC_SKILLS)"` and `"claim fee (DOC_PLOTS)"`. The prompt shows it as text, and the backend must price it.
- Some `endpoint` values are prose, not routes, for example `"radio queue (new, …)"`, `"race (new): …"` and `"plot system (plot_buy / plot_status)"`.
- `ARCADE_CAB_01`–`04` have empty props, so they are not interactive; `BLD_ARCADE` is. The 8 `AGENT_PROXY_*` markers, `SPAWN_*` markers and `CP_*` checkpoints are also non-interactive.
