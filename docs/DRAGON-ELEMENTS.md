# Dragon elements (2026-09-28)

Each realm's crossing dragon breathes and fights with its own element. There are seven, taken from the owner's
reference sheets:

- `Downloads/image (29).jpg`: **void** (black-purple smoke), **crystal** (silver shards), **lightning** (violet arcs).
- `Downloads/image (27).jpg`: **ice** (spikes), **lava** (magma crust), **thorn** (vines), **sand** (blast).

Code: `public/world-dragons.js` holds `ELEMENTS` (palette), `ELEMENT_TUNE` (gameplay), `FX_STYLE` / `FX_CAPS` (VFX),
the status system and the pooled FX sim. `public/world-dragon-ride.js` handles the rider's element breath.
Tests: `tools/tests/world-dragon-elements.test.cjs` (11), `dragons.test.cjs` (23) and `world-dragon-ride.test.cjs` (11).
Run each one with `node <file> < /dev/null`.

## Realm → element

Priority when resolving a station's element: `station.element`, then the realm (`REALM_TO_ELEMENT`), then the dragon colour
(`COLOR_TO_ELEMENT`), then the colour key itself. Old names are aliased: fire→lava, poison→thorn, shadow→void,
steel/tide→crystal.

| Station | Realm | Colour | Element | Why |
|---|---|---|---|---|
| Rift Gate | `void` | void | **void** | the Void realm |
| Desert Terminal | `desert` | tan | **sand** | desert |
| Emberfall Forge | `volcano` | red | **lava** | volcano |
| Suburb Transit Hub | `suburb` | black | **lightning** | no storm/sky realm exists; the suburb is the city's power-grid edge, and violet arcs suit it |
| Meadowfields Halt | `meadow` | green | **thorn** | overgrown fields (was "poison thorns") |
| Harbor Line | `ocean` (Crystal Sea) | teal | **crystal** | the realm is named Crystal Sea |
| Darkvault | `darkforest` | dark | **thorn** | gothic bio-tech forest, per the brief |
| Arctic Outpost | `arctic` | blue | **ice** | arctic |

There are 8 dragons and 7 elements, so one element repeats: **thorn** is used by both Meadow and Darkforest.
To give Darkforest a different element, set `element: 'void'` on its station in `world-layout.js`; no other change is needed.
Region files with no station (`forest`, `beach`) still map to an element (thorn, sand) for future spawns.

## Element table

The breath wind-up is `max(minTelegraph = 0.8 s, inhale)` and is never shortened, even at night.
Damage only goes through `hurtPlayer`, which checks the telegraph. Lingering effects (pools, shards, burn DoT) carry the
id and telegraph time of the attack that spawned them, and each is checked again when it hits. When a dragon is defeated,
its pools, shards and burn are cleared at once.

| Element | Realm(s) | Telegraph | Breath shape | DPS | Effect | Counterplay |
|---|---|---|---|---|---|---|
| ice | arctic | 1.0 s inhale | cone 35 m / 8 m | 20 | **slow** 35 % for 1.6 s; leaves frost patches (r 4.5 m, 5 s) that slow 25 % and deal no damage | Roll out of the cone. Stay off frosted ground. |
| lava | volcano | 1.1 s | cone 33 m / 8 m | 22 | **burn** DoT at 5/s for 3 s; leaves lava pools (r 4 m, 4 s) that deal 10/s and burn | Roll sideways, then keep off the glowing pools. |
| thorn | meadow, darkforest | 1.0 s | **line** 42 m / 3 m | 20 | **root** for 0.8 s (the only hard CC) | Side-step 4 m. A root is followed by 4 s of root immunity. |
| sand | desert | 0.9 s | **burst** 32 m / 11 m, one hit per 0.6 s pulse | 22 | **blind** haze 55 % for 2.5 s | Roll between puffs or break line of sight. |
| void | void | 1.0 s | cone 35 m / 9 m | 20 | **drain**: stamina regen −30 % for 2 s, and 50 % of the damage heals the dragon | Break out of the cone early. Staying in it heals the dragon. |
| crystal | ocean | 1.0 s | **line** 40 m / 3.5 m | 12 | **shard projectiles** (3 every 0.3 s, 6 dmg each, bounce twice, 2.4 s life) | Keep moving. Do not stand where the shards land. |
| lightning | suburb | 1.2 s (longest) | **line** 45 m / 2.5 m | 22 | **chain arc**: 45 % damage to a player within 10 m of the beam; **shock** slow 20 % for 0.5 s | Dodging the beam is not enough. Get more than 10 m away from it. |

Melee hits (swoop, stomp, tail) apply the element's status at half duration. A lava or ice stomp leaves a pool
1.6 times the normal size around the dragon's feet.

### Status caps (`TUNE.status`) and the no-stun-lock rules

A status refreshes when it is applied again; it never stacks. Its duration is capped at `dur` counted from now, and its
strength at `mag`.

| Kind | Max duration | Max strength | Notes |
|---|---|---|---|
| slow | 2.5 s | 45 % | |
| burn | 3 s | 6 dmg/s | ticks every 0.5 s through `hurtPlayer` |
| root | 0.9 s | — | Refused during player i-frames (`playerIFrames` after knockback, dodge roll) and while already rooted. After it ends, 4 s of immunity. Uptime is at most 18.4 %. |
| blind | 3 s | 60 % | |
| drain | 3 s | 40 % | |
| shock | 0.6 s | 25 % | |

## VFX (view layer, sized for Intel HD 620 / 8 GB)

There is one pooled system per element. It is built lazily, the first time a dragon of that element breathes, and every
dragon of that element shares it. The ridden dragon gets its own.

| System | Cap | Notes |
|---|---|---|
| `THREE.Points` per element | 320 particles | Additive emissive sprites. Void is the exception: black-purple smoke with normal blending. Sand puffs on the 0.6 s pulse. |
| Shard `InstancedMesh` (ice, lava, thorn, crystal) | 48 + 24 core projectiles | Ice spikes, thorns and silver shards are long octahedra; lava crust chunks are squat and dark. Crystal projectiles from `core.shards` are drawn in the same mesh. |
| Lightning arcs | 4 strips × 17 points | Jittered line strips (additive violet), alternating a main arc with a ground branch. Each chain hit also draws an arc to the player. |
| Ground decals (all dragons) | 96 instances | Scorch, frost patches, and lava pools (glowing cracked crust). Each pool decal lives exactly as long as its core pool. |
| Core pools / shards | 10 / 24 | `TUNE.hazardMax` / `TUNE.shardMax`. The oldest is recycled. |

Nothing grows after construction. The sim writes into typed arrays that the THREE attributes wrap without copying.
Per-frame inputs go through `sim.io` (a Float64Array) so no doubles get boxed, and randomness comes from an xorshift32
PRNG, because `Math.random()` allocates a heap number on every call in current V8. The node probe measures about 6 B
per sim step and about 17 B per rider update. Any per-frame object would add at least 28 B.

Colours come from the reference sheets: ice #FFFFFF→#40B8FF, lava #FFD040→#FF3A08 with #2A1206 crust, thorn
#D8F59A→#3E6A1A with #557A28 thorns, sand #FFE7A0→#A87A38, void #8A3AFF→#08040E, crystal #FFFFFF→#A8B0C4 shards,
lightning #F4E0FF→#9A40FF.

## Rider breath (`world-dragon-ride.js`)

- `input.breath` held → the dragon breathes its **own** element. A wild dragon you ride uses its own element; a tamed
  dragon uses `opts.element` (default `'void'`, aliases accepted).
- Shape, reach and DPS come from `ELEMENT_TUNE`. Breathing drains stamina at 0.18/s and stops at 0; it resumes once
  stamina is back above `boostResume`.
- Wild dragons inside the breath volume take damage through `dragons.core.damage(id, dmg, pos, dmgType)`, so element
  resistances apply.
- `ride.breath()` returns `{on, element, shape, mouth, axis, len, endR}`. The ride also emits `'breath'` `{on, element}`
  and calls `opts.onBreathTick(b)`.

## Events and host snippets

New core events:

| Event | Payload |
|---|---|
| `status` | `{id, element, kind, dur, mag}` |
| `hazard` | `{id, element, kind: 'lava' \| 'ice', x, z, r, life}` |
| `arc` | `{id, element, from, to}` |
| `breath` | now also includes `shape`, `len`, `endR` |

New API calls: `api.statusMods()` returns `{speedMul, rooted, haze, drain, burning, slowed}` and is allocation-free.
`api.clearStatus()` resets it; call it on respawn. `api.fxFor(el)` returns the element's FX system.

Already wired in `SHADDAI-WORLD-3D.html` next to the dragon block:

- the cache bumps `?v=20260928elem`;
- `status` is forwarded to `window.__onDragonStatus`;
- the ride gets `camera`;
- holding the left mouse button while riding sets `__dragonRideIn.breath`.

Optional hooks the host can add:

```js
// status icons / toasts (no HUD-file change needed)
window.__onDragonStatus = e => window.__toast && window.__toast('🐉 ' + e.kind.toUpperCase() + ' ' + e.dur.toFixed(1) + ' s');
// player controller: scale walk/run speed, blur/haze overlay
const m = window.__dragons.statusMods(); moveSpeed *= m.speedMul; hazeEl.style.opacity = m.haze;
```

## Needs a browser look

- Colour and brightness of each element's particles against day and night skies. Void smoke uses normal blending, so it
  may read too dark at night.
- Shard and thorn sizes, and the lava crust chunks.
- Lightning arc jitter (1.6 m) and the ground branches.
- The lava-pool glow shader, and whether the frost decal is visible on snow in the arctic.
- Frame time with two elements live at once on the HD 620.
