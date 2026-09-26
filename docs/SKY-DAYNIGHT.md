# Map v4 Sky + Day/Night (`public/world-sky-v4.js`)

Runs only under `?map=v4`. The default (non-v4) path keeps the old `skyDome` / `starGroup` / `updateDayNight()`.

## What it does

- **Sky:** one `ShaderMaterial` sphere (BackSide, `depthWrite:false`, follows whichever camera renders it). The shader contains:
  - a horizon→zenith gradient
  - Mie-style forward lobes and a broad Rayleigh-style sun-side lift
  - the sun disc (HDR, so bloom catches it)
  - a warm dusk/dawn band plus a thin **emerald `#00ff9c`** strip at deep twilight, with **gold `#e8c45c`** Mie glow
  - an obsidian night sky with hashed twinkling stars (2 layers, rotating) and a faint violet/emerald galactic band
  - a moon disc with phase (8-game-day cycle) and earthshine
  - a cloud band (plane-projected fbm, scrolling, silver lining toward the sun)
- **One DirectionalLight:**
  - It follows the sun by day and the moon by night. The moon light is blue at about 15% of noon, scaled by moon illumination.
  - At dusk the sun colour goes from 1900 K to 5900 K and is mixed toward gold.
  - Intensity reaches 0 exactly at the sun↔moon handover (sun elevation −0.02), so the direction flip is never visible.
- **Everything that follows the sky:**
  - hemisphere light sky and ground colours, plus intensity
  - optional ambient intensity
  - fog **colour = sky horizon colour**. The gradient returns exactly `uHorizon` at h = 0, so the 10 km terrain fades straight into the sky.
  - fog density × palette multiplier (a slightly thicker haze at dusk)
  - `scene.background`
  - `renderer.toneMappingExposure` (drops to 0.8× at night)
  - water sky colours (`water.setTimeOfDay(t)` at 5 Hz). The water's sun direction comes from the same light.
- **Shadows:**
  - one map, 2048² by default. The ortho frustum is ±60 m around `playerPos` and snapped to the texel grid in light space, so moving the player causes no shimmer.
  - the light sits 150 m from the target toward the sun and far = 270 m, which covers 40 m buildings.
- **Time:**
  - 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. This uses the same sun path as `world-water.js sunDirectionForTime`.
  - `dayLengthMin` real minutes per day (default 24), starting at 0.35.
  - URL `?time=0.8` sets the start time and `?daylen=6` sets the day length.

## API

```js
const sky = window.buildWorldSkyV4({ THREE, scene, renderer, camera,
  sunLight, hemiLight, ambientLight, fog: scene.fog, water, dayLengthMin: 24 });
sky.update(dt, playerPos)   // every frame, BEFORE water.update (water reads the light direction)
sky.setTime(0..1) · sky.getTime() · sky.setPaused(bool) · sky.setDayLength(min)
sky.isNight()               // nightFactor >= 0.5
sky.nightFactor / sky.dayFactor / sky.phase   // getters; nightFactor 1 at midnight, 0 at noon
sky.onPhase((phase, prev) => {})   // 'dawn' | 'day' | 'dusk' | 'night'; called once immediately (prev = null), returns unsubscribe
sky.sunDir / sky.moonDir / sky.lightDir   // live THREE.Vector3 (lightDir = what the DirectionalLight uses)
sky.setWater(waterApi) · sky.setQuality('POTATO'|'LOW'|'MEDIUM'|'HIGH'|'ULTRA') · sky.setShadowMapSize(n) · sky.shadowMapSize
sky.enableShadowsOn(obj, { cast, receive })  · sky.stats() · sky.dispose() · sky.mesh · sky.uniforms
sky.addNightRamp(obj, key, dayValue, nightValue) → remove()   // obj[key] = lerp(day, night, nightFactor)
sky.addEmissive(material, { base, dayMul: 0.25, nightMul: 1.6 }) → remove()   // emissiveIntensity ramp
```

If `sunLight` or `hemiLight` is null, the module creates its own. Phases use sun elevation sin e: day if e > 0.12, night if e < −0.12, otherwise dawn or dusk. For lamps and windows, use `nightFactor` for smooth fades and `onPhase` for discrete switches such as night enemy spawns.

## Tunables (builder options)

| option | default | notes |
|---|---|---|
| `dayLengthMin` | 24 | real minutes per game day (`?daylen=` overrides) |
| `startTime` | 0.35 | (`?time=` overrides) |
| `sunIntensity` | 2.4 | noon DirectionalLight intensity |
| `moonFrac` | 0.15 | moon light as a fraction of `sunIntensity` |
| `hemiDay` / `hemiNight` | 1.05 / 0.35 | hemisphere intensity |
| `ambientDay` / `ambientNight` | 0.25 / 0.12 | only if `ambientLight` is passed |
| `nightExposure` | 0.8 | exposure multiplier at full night |
| `cloudCover` | 0.42 | 0 = clear sky, about 0.7 = heavy cover |
| `windX` / `windZ` | 0.004 / 0.0015 | cloud scroll |
| `sunSize` / `moonSize` | 0.022 / 0.03 rad | discs, about 2–3× real size for readability |
| `moonCycleDays` / `moonPhaseStart` | 8 / 0.5 | 0.5 = starts at full moon |
| `shadowMapSize` | 2048 | maximum; quality tiers can lower it |
| `shadowRangeM` / `shadowDistM` / `shadowDepthM` | 60 / 150 / 120 | metres (× `unitsPerM`, default 7/1.8) |
| `shadowBias` / `shadowNormalBias` | −0.0004 / 0.12 m | |
| `shadows` | true | `false` leaves `renderer.shadowMap` alone |
| `respectThemeLock` | true | if `window._themeLocked` is set, fog, background and hemi colours are left to the theme engine |

You edit the palette in `PALETTE_SRC`: sRGB hex keyed by sun elevation, blended with smoothstep. Every channel is tested for continuity.

## Performance (Intel HD 620 target)

- **Draw calls:** sky 1, stars 0 extra, clouds 0 extra, moon/sun 0 extra. It uses no textures and no render targets.
- The sky writes `gl_Position = p.xyww` (depth = far plane) with `renderOrder = 1e6`, so it draws **last among the opaque objects**. Early-Z then rejects every pixel covered by terrain or buildings, and the shader only runs on visible sky. Transparent water still draws after it and blends correctly.
- **Per-pixel cost:**
  - the fbm loop is capped by `uCloudOct`: 2 on POTATO, 3 on LOW, 4 on MEDIUM/HIGH, 5 on ULTRA
  - the second star layer is off on POTATO and LOW
  - the moon branch only runs inside the moon's cone
- **Shadow map by quality tier** (`setQuality`, wired to `_applyQualityTier`):

  | tier | map size | shadow pass |
  |---|---|---|
  | POTATO | 1024² | re-rendered every 3rd frame |
  | LOW | 1024² | every 2nd frame |
  | MEDIUM and up | 2048² | every frame |

  Skipped frames use `renderer.shadowMap.autoUpdate = false`. The map is still re-rendered at once when the snapped centre moves more than 15 m. Static shadows stay correct between updates because the shadow matrix is only replaced together with the map.
- Changing the map size disposes the shadow render target. Three recreates it on the next frame, and nothing is recompiled.
- **Shadow casters:**
  - Three only culls a caster from the shadow pass when its bounds lie outside the ±60 m box. An `InstancedMesh` whose bounding sphere spans the world is never culled, so every instance goes into the shadow pass.
  - `world-clusters-v4.js` instanced meshes already `castShadow = true`, but their bounds are per district, which is fine.
  - Keep world-spanning fill instancing receive-only (`world-fill-v4.js` already toggles this).
- All work on the CPU side happens per frame without allocating new objects: about 40 flops of palette work plus a few `setRGB` calls.
- **Known cosmetic effect:** while the sun moves, the light-space texel grid rotates slowly, so shadow edges crawl very slightly. That is inherent to a moving sun. Moving the player causes no shimmer.
- **Exposure caveat:** the host renders through an `EffectComposer` without an `OutputPass`. Three only applies tone mapping, and therefore `toneMappingExposure`, when rendering straight to the screen, so the exposure change only shows on the `renderer.render` fallback path. The night darkening that actually shows comes from the light, hemisphere and palette curves. Adding an `OutputPass` would make the exposure curve take effect, but it changes the whole look, so that is the owner's call.

## Host integration (`public/SHADDAI-WORLD-3D.html`, v4 only)

Each snippet below is anchored on an exact existing line.

**1. Declare the handle.** Put it after this line (about line 345):
```js
let _v4T = null, _v4Water = null, _v4Meta = null, _v4Fill = null;   // terrain api / water api / terrain.json once loaded
```
add:
```js
let _v4Sky = null;                        // MAP v4 sky/day-night (world-sky-v4.js)
```

**2. Stop the old day/night updates from overwriting the v4 lights.** Replace
```js
function updateDayNight(dt){
```
with
```js
function updateDayNight(dt){
  if(_v4Sky) return;   // MAP v4: world-sky-v4.js owns time, sun/moon light, hemi, fog, exposure
```

**3. Stop the per-biome sky/fog blending.** In `updateSkyForBiome`, directly above
```js
  if(window._themeLocked) return;   // a global theme owns the sky/fog — don't fight it
```
insert
```js
  if(_v4Sky) return;                // MAP v4: fog colour must equal the v4 sky horizon
```

**4. Build the sky.** After this line (about line 1587):
```js
if(MAP_V4) scene.fog.density = 0.000055;
```
add:
```js
if(MAP_V4){
  skyDome.visible = false; starGroup.visible = false;   // replaced by world-sky-v4.js (stars/clouds/moon are in its shader)
  sun2.visible = false; rim.visible = false;            // one directional light only: the sky drives `sun`
  _loadScript('/world-sky-v4.js?v=20260926sky').then(function(){
    _v4Sky = window.buildWorldSkyV4({ THREE, scene, renderer, camera, sunLight: sun, hemiLight: hemi, ambientLight: ambient,
      fog: scene.fog, water: _v4Water, dayLengthMin: 24 });
    window.__w3dDebug.skyV4 = _v4Sky;
  }).catch(function(e){ console.warn('[map-v4] sky failed:', e && e.message); });
}
```
The script loads in parallel with the terrain. Hiding `sun2` and `rim` before the first frame avoids a light-count recompile later.

**5. Give the sky the water once it exists.** Directly after
```js
      try{ _v4Water = _buildV4Water(api); window.__w3dDebug.waterV4 = _v4Water; }catch(e){ console.warn('[map-v4] water build failed:', e && e.message); }
```
add
```js
      if(_v4Sky && _v4Water) _v4Sky.setWater(_v4Water);   // sky may have loaded first (step 4 covers the other order)
```

**6. Per-frame update.** The sky must update **before** the water, because the water reads the light direction. Replace
```js
  if(MAP_V4){ if(_v4T) _v4T.update(t, dt);
```
with
```js
  if(MAP_V4){ if(_v4Sky) _v4Sky.update(dt, playerPos); if(_v4T) _v4T.update(t, dt);
```

**7. Quality tiers.** In `_applyQualityTier`, after
```js
  window.__quality = t.name;
```
add
```js
  if(_v4Sky) _v4Sky.setQuality(t.name);   // shadow map 1024/2048 + update cadence, cloud octaves, star layers
```

**8. Optional: the N fast-forward key.** In the existing handler
```js
addEventListener('keydown', e=>{ if(e.code==='KeyN'){ DAYNIGHT.cycleSec = DAYNIGHT.cycleSec > 60 ? 12 : 240; } });
```
replace the body with
```js
addEventListener('keydown', e=>{ if(e.code==='KeyN'){ if(_v4Sky) _v4Sky.setDayLength(_v4Sky.dayLengthMin > 1 ? 0.2 : 24); else DAYNIGHT.cycleSec = DAYNIGHT.cycleSec > 60 ? 12 : 240; } });
```

**9. Optional: make the player cast a shadow.** Once `playerAvatar` exists:
```js
if(_v4Sky) _v4Sky.enableShadowsOn(playerAvatar, { cast:true, receive:false });
```
Terrain chunks already have `receiveShadow = true` (world-terrain-v4.js). Buildings and clusters already cast.

**Canon city (Grid blocks): roof-edge strips and lamps.** Register the shared strip or lamp materials once. The sky then ramps
`emissiveIntensity` by `nightFactor` on every update, which is only a property write (no recompile). The write is skipped
when `nightFactor` has changed by less than 0.002. With the default `base = 2`, strips are 0.5 at noon and 3.2 at midnight, bright enough to bloom:
```js
cityStripMats.forEach(m => _v4Sky.addEmissive(m));                    // dayMul 0.25 · nightMul 1.6 × current emissiveIntensity
lampHeadMats.forEach(m => _v4Sky.addEmissive(m, { dayMul: 0.05, nightMul: 2.0 }));
lampLights.forEach(l => _v4Sky.addNightRamp(l, 'intensity', 0, 3));   // few real lights only (best-practices "Lighting")
```

**Other night hooks** (city windows, lamps, spawns):
```js
_v4Sky.onPhase(function(p){ if(p==='night') cityLights.on(); if(p==='day') cityLights.off(); });
// smooth: emissiveIntensity = base * (0.2 + 0.8 * _v4Sky.nightFactor)
```

**Themes:** when a global theme is active (`window._themeLocked`), the sky leaves fog, background and hemi colours to the theme. The v4 sky mesh stays visible, so a themed fog will not match it. If themes matter under v4, hide `_v4Sky.mesh` and show `skyDome` in the `onAfterTheme` callback.

## Verification

```
node --check public/world-sky-v4.js
node tools/tests/sky.test.cjs
```
The tests cover:
- the sun rises monotonically up to noon and falls after it; its direction is unit length and identical to the water's
- night factor is 1 at midnight and 0 at noon
- the phase order is night → dawn → day → dusk → night
- fog colour is continuous across the day, including the midnight wrap (checked by step-halving)
- every palette channel is continuous
- light colour, intensity and moon % behave as specified
- shadow snapping is deterministic, lands on the texel grid, keeps depth, and moves only in whole-texel steps
- the URL overrides work
- kelvin conversion is sane
- the night ramp gives the day value at noon and the night value at midnight

No browser, so the GLSL has not been compiled in WebGL. The first `?map=v4` load should check the console for `[sky-v4] ready`.

## Patterns applied from the reference repo

Reference repo: `shaddai-threejs-gamedev-master` (read-only). These are the patterns this module uses, with the file each comes from.

- **`FLAT-LIBRARY/ecs-architecture/threejs/fog.md`:**
  - "Consistency: match fog colour to background" and "Add fog to skybox/background": fog colour, `scene.background` and the sky gradient at h = 0 are the same palette value, `hor`.
  - "Match fog color with ambient light": the hemisphere sky and ground colours come from the same palette key.
  - "Sudden visibility changes: use smooth transitions": the smoothstep palette is tested for continuity.
  - FogExp2 is kept at a small base density; the palette only multiplies it (about 1.0–1.15).
- **`FLAT-LIBRARY/three-core/threejs-lighting/SKILL.md` and `best-practices.md` (Lighting / Shadows):**
  - hemisphere + one directional light instead of many lights: `sun2` and `rim` are hidden under v4
  - a single shadow-casting light
  - a tight shadow frustum (±60 m, follows the player)
  - 1024–2048 map sizes by tier
  - PCF (not soft PCF)
  - `bias` / `normalBias` against shadow acne
  - Debugging: pass `sky.sunLight.shadow.camera` to a `CameraHelper` to see the box.
- **`SKILLS-HUB/.claude/skills/threejs-shaders/SKILL.md`:**
  - uses `ShaderMaterial` (not Raw) so that the `#include <tonemapping_fragment>` / `<colorspace_fragment>` chunks work
  - "Precalculate in JS": sun colour (kelvin), visibility factors, star rotation `mat3`, moon phase and palette blends are all computed on the CPU once per frame
  - "Group values into vectors" is applied to the direction and colour uniforms
  - "Avoid conditionals": the remaining `if`s are uniform-coherent (stars/moon/cloud switches) or spatially coherent (the moon cone), so warps do not diverge. Smooth blends use `mix`/`smoothstep`/`step`.
  - "Limit overdraw": the sky is opaque and drawn last at far depth, so early-Z removes it from covered pixels.
  - Shader debugging on first load: `renderer.debug.checkShaderErrors = true`.
- **`best-practices.md` (Update loop / anti-patterns / resource management):**
  - no `new` in `update()`: all vectors, colours and matrices are pre-allocated
  - `dispose()` releases the geometry and material, and removes the lights and target this module created
  - script loading is wrapped in `.catch`, so a failure leaves the old sky path intact
- **`material-systems.md`:** "Unnecessary needsUpdate calls force recompilation". The night ramps only write `emissiveIntensity` or `intensity` and never touch `needsUpdate`. Quality changes only change uniforms and the shadow map size, never shader defines.
- **`SKILLS-HUB/.claude/skills/game-qa-performance/SKILL.md` (draw-call budget):**
  - the sky adds exactly 1 draw call (`sky.stats().drawCalls`)
  - verify in the browser with `renderer.info.render.calls` before and after `?map=v4`, and watch the governor's tier log (`[SHADDAI quality] tier →`), which now also sets the sky's quality
