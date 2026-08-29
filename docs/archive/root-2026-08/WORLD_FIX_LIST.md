# SHADDAI World — Master Fix List
_Priority order per owner: **Debugging → Buildings → Building Interiors → Entry** first, then everything else._
_Status: ✅ done · 🔧 in progress · ⬜ todo. Updated 2026-07-03._

---

## 0. ROUND 2026-07-03 PM (owner: "unacceptable / sloppy") — CRITICAL FIXES
- ✅ **JS crash fixed**: intro-canvas `arc()` got a negative radius → guarded `RING`/`glowR` at source (`Math.max(1,…)`). (A crash in the loop can itself cause the "janky" feel — hard-refresh to clear the stale cached copy that threw it.)
- ✅ **Clutter removed** (owner: "car + space vehicle under shaddai + old ground glb files, sloppy"): stubbed out `initRideables` (the boardable Slipstream/Rover = the "car + spaceship") and deleted the `squarescape`/`ground-chromatic`/`emblem` ground GLBs. Terrain module is the single ground source now.
- ✅ **Walk-through-walls fixed**: collider radii were `~fp*0.34` but the facade is at `fp*0.46` → bumped colliders to `fp*0.46` (SHADDAI 76, QUILL 78, etc.) so walls are solid where you see them; door gap still faces center.
- ✅ **SHADDAI temple colonnade** (agent): 24 fluted columns with a clear ~48° ENTRY GAP facing world-center (aligned to the collision door gap) + dentils/cornice/keystone detail on all entrances. Flat base + footprints unchanged.
- ✅ **Elevators are real now** (agent + wiring): each has an OBSERVATION DECK at the top of its run; **press E near one to board** ("[E] RIDE TO … OBSERVATION DECK" prompt), smoothstep ride, camera carried in sync.
- ✅ **Load-screen smoothness**: heavy buildings+NPCs build DEFERRED off the initial synchronous load (was one giant freeze) so the boot screen paints/animates smoothly; JACK IN waits for `__worldBuilt`; intro swirl throttled to 30fps. Backup at `public/_backup-world-<ts>/`.

## 1. DEBUGGING / PERFORMANCE  ⭐ TOP
- ✅ Declutter: removed dead `world-vehicles.js` (ambient blimps/cars) — was loaded & parsed but never used
- ✅ Dedup audit: buildings / portals / player / camera each created exactly once (no hidden duplicates)
- ✅ AntiAlias OFF under bloom composer (wasted GPU) + `high-performance` GPU hint
- ✅ Added POTATO quality tier (pr 0.55) + start at LOW; governor now downshifts in 1s (was 2s) so weak machines settle smooth fast
- ✅ M releases mouse / shows cursor (Esc also works)
- 🔧 "World really really slow" — 3 perf waves shipped. RE-TEST.
  - Wave 1: AA off, POTATO tier, governor downshifts in 1s.
  - Wave 2: skill-count text set ONCE; ALL labels use `transform`/translate3d (no layout reflow) vs left/top; removed visitor-loop `new Vector3` alloc.
  - Wave 3: raycast targeting throttled to 20Hz (was every frame, recursive vs full 3D bodies — the biggest CPU op); raycast target list pooled (no per-frame `.map` alloc); monument core cached (was `getObjectByName` every frame); coords element cached + written only on change; intro-gate cached + flagged (no `getElementById` every frame post-entry); minimap redraw throttled to 20Hz; **bazaar stall `innerHTML` no longer re-parsed every frame** (only when [F] BUY toggles).
  - Wave 5 (4 parallel agents, per-module deep opt — all `node --check` clean, served @ ?v=...g):
    - **world-buildings.js**: ~60+ draw calls collapsed into InstancedMesh (temple spires, aegis towers, bazaar domes, colonnade ×8 buildings); fixed latent bug — InstancedMeshes had null bounding spheres so frustum culling never worked (off-center/distant buildings never culled) → now compute bounding spheres.
    - **world-npcs.js**: unified 3× redundant player-distance math to 1; distance-culled aura pulses; hoisted squared-distance constants out of the hot loop.
    - **world-terrain.js**: sqrt eliminated from the `heightAt` hot path (squared-distance compares, fast flat-plaza early-out); return values bit-identical.
    - **world-biomes.js**: water damp factor precomputed once (was ~2400 verts/frame); water plane 64→48 segs (~44% less per-frame vertex + normal work), silhouette unchanged.
    - **world-interiors.js**: `update()` now no-ops when you're outside all rooms (was pulsing every built room's materials off-map every frame); `nearestDoor()` sqrt-free + removed per-frame string allocations.
  - Aura/crown hiding narrowed to POTATO tier ONLY (auras always on for any half-decent machine).
  - Wave 4 (GPU): bloom pass fully DISABLED at POTATO/LOW tiers (was rendering the multi-pass bloom at strength 0 = wasted GPU; RenderPass safely outputs to screen in three 0.180); agent aura/crown additive particles (heaviest transparent overdraw) hidden at low tiers; NPC AI throttled to 30Hz; bloom pass also skipped entirely during the sky-dive; door-prompt DOM writes now only-on-change.
- 🔧 "Mouse laggy/weird" — layout-reflow-per-frame from labels was a real cause (now fixed); re-test
- ✅ Grid→dimension ENTER transition: neon grid erupts from the JACK IN button, forms, then rushes forward through a gate into the (already-loaded, shader-warmed) world — no pop-in
- ✅ **Motion smoothness pass**: (1) player movement now eases velocity in/out (accel/decel, frame-rate-independent) instead of instant on/off robotic snapping; coasts to a stop when you release; (2) camera ground-height is eased so walking over terrain bumps glides instead of jittering (snaps on spawn/interior-teleport/elevator/flight so those don't slide); (3) 3rd-person follow-cam now GLIDES — the landing hand-off (descent-end → behind-player pull-back) is a smooth swoop instead of a hard snap, and walking feels less rigid (snaps only on >40u teleports); (4) character + bike facing now EASES toward the look/travel direction (shortest-path angle lerp) instead of snap-turning; (5) biome-sky lookup throttled to 30Hz (imperceptible, saves a per-frame spatial query).
- ⬜ Verify NPCs no longer clip through buildings (collision resolver in place — confirm in-world)

## 2. BUILDINGS  ⭐ TOP
- ✅ Restored ORIGINAL intricate procedural design (mullions, rooftop greebles, deep windows) — pre-CC0, zero credits
- ✅ Made buildings BIGGER (footprints +~50%: SHADDAI 112→168, Library 115→172, etc.)
- ✅ Confirmed intricate detail is InstancedMesh (bigger ≠ more draw calls)
- ✅ **THE BOTTOM ISSUE FIXED**: removed the 3.1u raised circular plinth that lifted the whole building (incl. the door) off the ground with no stairs → replaced with a flat foundation slab flush to terrain. Door + walls now sit at ground level = walk right up to them.
- ✅ **Barrier fixed**: consolidated the two fighting colliders into ONE. Right-sized radii for the bigger buildings (was 44/55 vs walls ~58-60 = you walked through walls) + a real DOOR GAP on the center-facing side that lines up with the visual door (`frontDir`). Dropped the conflicting `WORLD_RESOLVE` double-resolve that cancelled the gap.
- ⬜ Confirm no building looks lifted/floating (ZEROX was fixed — recheck all 8 after resize)
- ⬜ Agents stand IN FRONT of their building, not inside/clipping

## 3. BUILDING INTERIORS  ⭐ TOP
- ⬜ Walk to a real door → press E → interior (verify E-range is reachable on every building)
- ⬜ Verify each interior loads & looks right: Library (QUILL), Aegis vault (PIKADON), Museum (TURTLE), Oracle, ZEROX Markets (+ TuFish terminal), Source (SHADDAI)
- 🔧 NEXUS Portal-Dome: organized portals + levels + chat kiosk (Phase 1 built — finish wiring portals→destinations + lounge chat)

## 4. ENTRY / SPAWN  ⭐ TOP
- ✅ **TURTLE cinematic entry (world-spawn.js @ ?v=...h)**: holographic portal picker (glass, scan-lines, per-portal color accents, hover blooms, animated title), and the descent is now a gentle cinematic SWOOP (arc + apex lift + subtle banking) that unwinds to land exactly on target. API + landing flow unchanged.
- ✅ **Theme engine (world-themes.js @ ...h)**: 7 richer, distinct palettes; theme changes now EASE smoothly (~0.6-1.2s frame-rate-independent lerp) instead of hard-snapping. Allocation-free.
- ✅ **Elevators (world-elevators.js @ ...h)**: wider forgiving boarding radius + hysteresis (fixes "can't get on elevators"), smoothstep vertical ride, camera carried in exact sync (no jitter).
- ✅ **Minimap (world-minimap.js @ ...h)**: premium circular neon radar; all static geometry baked once so 20Hz update stays cheap.
- ✅ **Real loading screen**: shared LoadingManager drives a progress bar; JACK IN unlocks only when all assets are loaded AND shaders are pre-compiled (`renderer.compile` warm-up) — you drop into a fully-built, stutter-free world. 9s fallback so it never traps you.
- ✅ Entry lag: during sky-dive/descent, pause heavy NPC/building/biome/minimap work + render cheap, snap back on landing
- ✅ Mouse cursor appears on the portal picker (auto-release pointer lock)
- ✅ **Name prompt before joining** — root cause was the CHAT prompt firing on load (now deferred to first chat click). The spawn picker itself never had a name field — it already just lets you pick your forged agent + a portal.
- ⬜ Forged agent pickable at spawn, but "save" requires paid account or linked Solana wallet
- ⬜ Re-test descent smoothness after perf wave ("fix 1000%")

## 5. CHAT
- ✅ Click-only open (💬 CHAT button) — no keyboard auto-open
- ✅ Name prompt deferred to first open — never before you join
- ⬜ Wire lounge/NEXUS chat kiosk to the room chat

## 6. NPCs & NAV
- ✅ NPC scatter tightened (stay near their district)
- ⬜ Elevators: confirm you can step onto the pad and ride
- ⬜ Portals easy to access (dome layout should fix the "hard to toggle" problem)

## 7. REMOVED / ALREADY DONE
- ✅ 🎮 Arcade button removed
- ✅ Ambient blimps/cars removed
- ✅ One-button theme engine (snow/desert/tron/ocean)
- ✅ TuFish market inside ZEROX (free APIs only, PIKADON-secured, paper-trading)
- ✅ Big ZEROX chart replaced with a bronze Market Sentinel statue

## 8. NEXT — ANIMATIONS & LIFE (free tools, after perf is solid)
- ⬜ **Mixamo** walk/run/crawl skeletal animations on player + NPCs (biggest life upgrade)
- ⬜ Modular body parts (head/chest/hair) via Quaternius / Kenney CC0
- ⬜ Grass via Kenney Nature Kit or instanced procedural grass
- ⬜ Real PBR textures/color via Poly Haven / ambientCG

## 9. PARKED / VISION
- ⬜ Colosseum tournament economy: prize pot, revenue share, spectate
- ⬜ Wire the 3 sports games (basketball/soccer/shooting) to lounge portals + leaderboards
- ⬜ Portal application via Solana wallet
- ⬜ Bigger map
