# fal needs plan — what really needs fal, what Blender/code covers free (2026-09-26)

**Budget:** $100. Spent so far: $13.50, which leaves **$86.50** (see `fal-assets/production/spend-ledger.json`).

**Rules:**
- The owner approves every concept PNG before any 3D spend.
- Blender does the cleanup, scale, LODs and verify renders, so fal only generates the base mesh.
- If a free CC0 asset or procedural code does the job at the same quality, we don't spend.

**Prices:**
- Concept PNG ≈ $0.003.
- hunyuan-3d rapid $0.225, pro $0.375.
- Meshy rig + walk/run (bipeds only) $0.80.

## The pipeline every asset goes through (verify → polish → repeat)
1. **Reference:** the owner's image goes in `fal-assets/refs/<type>/`.
2. **Concept PNG:** HF, $0.003. **Owner approves.**
3. **Base mesh:** fal image-to-3D.
4. **Blender cleanup:**
   - real-metre scale and a base-centre pivot
   - strip pedestals and merge doubles
   - material fix, emissives in the realm palette
   - LOD1/LOD2 via simplify (≈12 % / 3 %)
   - colliders: box or hull, exported as JSON
5. **Blender verify render:** a turntable plus an in-scene shot at player eye height (1.6 m). **Owner approves**, or it goes back to step 4.
6. **Export:** meshopt GLB + LODs + colliders, into `public/assets/…`.

## Needs, by category

**Characters.** The owner is mapping these in the other tab; their list replaces these rows.

| Need | Count | Source | Cost |
|---|---|---|---|
| Council agents (SHADDAI, NEXUS, QUILL, ORACLE, PIKADON rigged; ZEROX, TURTLE rigged via Meshy) | 7 | Done. Polish in Blender | $0 |
| Citizen NPCs (walkers, vendors, workers) | ~6 | fal + Meshy rig, then UAL2 clips (43, free) | ~$4.80 |
| Night enemies (the atlas's "enemy presence" row: 5 silhouettes) | 5 | fal + Meshy rig (if bipedal); Bestiary Imp/Puglin free | ~$4.00 |

**Creatures.**

| Need | Count | Source | Cost |
|---|---|---|---|
| Dragons (7 elements from the refs) | 7 | **One** pro base mesh from the steel/void T-pose refs, then Blender makes the element variants (materials, horns and spines per element). Rigged in Blender (wing, tail and neck chains). Flight is procedural in code, attacks are Blender keyframes | ~$0.75 (2 bases) |
| Animals (birds, deer-type, fish, sky-whale) | 6–10 | **Free:** Quaternius CC0 animated animal packs (rigged + animated). Meshy can't rig quadrupeds anyway | $0 |

**Vehicles and mounts.**

| Need | Count | Source | Cost |
|---|---|---|---|
| Rimba Racer hover-car, Dune Wheel | 2 | fal pro from the refs, then Blender (wheel/thruster pivots) | $0.75 |
| Bike, hoverboard, ships (catamaran, yacht, sub, skiff) | — | Already have them; polish in Blender | $0 |
| Mounts (forge bull, glacier mammoth, canopy gorilla) | 3 | Already generated; rig in Blender (quadrupeds) | $0 |

**The world.**

| Need | Count | Source | Cost |
|---|---|---|---|
| Realm signature buildings (`docs/REALM-FILL-PLAN.md`: crescent megatower, Quill world-tree library, Void pyramid city, lava citadel, Arctic ring city + **cloud-stair walkways**, spire islands, cliff city, etc.) | ~18 | fal (8 pro + 10 rapid) | ~$5.25 |
| Grid blocks, stations, roads, ring, civic halls, amphitheatre, forest | — | **Code/Blender procedural** (already built, canon) | $0 |
| Winged stone gate (one family, 8 material variants) | 1 | fal pro, then Blender variants | $0.38 |
| Adobe kit (Sand Sea), hex pads + plank bridges (Darkforest), glass tube + pier (Crystal) | — | Blender procedural from the refs | $0 |

**Items and effects.**

| Need | Count | Source | Cost |
|---|---|---|---|
| Items / weapons / pickups | ~20 | fal rapid for hero items only; the rest procedural in Blender | ~$2.00 |
| VFX (breath, auras, portals) | — | Code shaders + particles (refs in `fal-assets/refs/vfx`, `dragons`) | $0 |

**Estimated total: about $18–20.** That leaves about **$65** of the $86.50 for re-rolls and polish.

## What NOT to spend on
- Anything repeated (blocks, stalls, lamps, trees). Instancing plus procedural covers it.
- Quadruped rigs through Meshy. It can't rig them, so use Blender or CC0 packs.
- Texture-only variants. Those are Blender material swaps.
