# ZEROX "loads odd" + shard mass + ghost agents + desktop load speed — DIAGNOSIS

- **Date:** 2026-11-15 · **Status:** READ-ONLY diagnosis — no code changed, no branch touched, no deploy.
- **Source read:** branch `realm-fix-for-main-2026-11-15` checkout of `public/world-main.js` (6,688 lines), `public/SHADDAI-WORLD-3D.html`, `public/world-actions.js`, `public/world-operatives.js`, `public/world-perf-guard.js`, `public/world-interior-agents.js`, vendored `public/vendor/three/three.core.js`, GLB binaries parsed directly (JSON chunk + image headers + texture pixels sampled), and frame extractions from Israel's 10 laptop videos (batches 1 + 2).
- **Labels:** FACT = read from code/binary/frames in this pass. INFERENCE = reasoned from those facts, not directly observed.

## Verdict in one paragraph

ZEROX's model is **not** mis-scaled, unskinned, or transparent — structurally it is the same build as SHADDAI/TURTLE (same skeleton, same 23 baked clips, same 1.8-unit height). It "loads odd" for three stacked reasons: **(1)** it is the only council GLB whose texture never got the WebP packing its siblings got — an 8.72 MB PNG inside a 12.9 MB file, so it downloads/decodes last and heaviest on every path that loads it; **(2)** every agent GLB is force-lit at parse time (`emissiveIntensity ≥ 3.0`), and only the outdoor council path re-clamps that to 0.3 — the player-body and interior display paths don't, so ZEROX viewed as your own body / in interiors renders as a flat, pale, bloom-catching ghost; **(3)** the shard explosion is a separate, intermittent **skinned-clone bind failure** that is proven live in Israel's own recordings (a red banner flooding `TypeError: Cannot read properties of undefined (reading 'matrixWorld')` at `three.core.js:25024` = `SkinnedMesh.applyBoneTransform`) — the pale bot and the shard mass are the same body in two states of that fault: coherent at bind pose, exploded under animation.

---

## 1. The agent-body loading paths (FACT, line refs to world-main.js unless noted)

### 1a. Council bodies (outdoor sectors) — `placeAgents` → `_nextAgentBody`
- `placeAgents` (L2654–2711) places, per agent: a portrait **sprite** standee (7.4×7.4, L2693; texture starts as the portrait, swaps to `/api/forge/art/char-<code>.png` when it loads), an additive glow frame sprite (L2695), a ground **torus ring** in the agent colour (L2697), a light beam (L2699), an aura particle ring (L2701) and a rarity crown torus (L2703–2704). Then `queueAgentBody(entry)` (L2707) streams the real GLB in.
- `_nextAgentBody` (L2359–2499) loads bodies **sequentially**, gated on: spawn animation finished (L2362), v4 heightmap ready (L2363), and on mobile, `body.in-world` (L2364, pass-1 FIX-B). URL: `/assets/agents/<CODE>.glb?v=14` (L2375).
- On load it traverses meshes: `castShadow`, skinned `frustumCulled=false`, and a **material treatment** (L2383–2403): map forced sRGB; `color` set to white (textured) or lerped 60% toward the agent colour (untextured); **`emissiveIntensity` clamped to ≤ 0.3** (L2395); metalness ≤ 0.15; roughness ≥ 0.6; `envMapIntensity` 0.7.
- Scale: `_safeBox` measures the skeleton's bind-pose bone world positions (L707–713); body scaled so height = `AGENT_BODY_HEIGHT` 7.0 (L2348, L2405–2413), feet planted via `heightAt`, yawed to face world centre (L2417). `_AGENT_YAW_FIX` is an **empty object** (L2347) — ZEROX's old +90° sideways fix was removed when the v6 Meshy body landed; there is **no ZEROX-specific scale, bone, or emissive override** anywhere in this path.
- Animation: if the GLB ships the full baked set (`idle/walk/run/jumpStart/heavy/combo` all present → `_bakedSet`), it plays its own clips and gets **no** library fill and **no** UAL (L2445–2470, L2480). Otherwise `_fillAgentClipsFromLibrary` (L2540–2567) retargets the shared agent-clips library onto the rig — its comment (L2549–2551) records that the *baked* clips deform on several rigs ("ZEROX chest crumple on kicks") and the library clips own the core moves where applied.
- Load failure re-queues up to 3 times (2 s / 5 s / 10 s, L2493–2498); the sprite/ring/beam standee stays up until the body lands (L2485–2487).

### 1b. The parse-time material force — `agentBodyFix` (L51–59)
A global `GLTFLoader.prototype.load` wrapper: for every GLB under `/assets/agents/`, `/assets/forge-models/`, `/assets/characters/` it traverses at parse and forces `metalness = 0`, `roughness ≥ 0.8`, `emissive = white`, `emissiveMap = map` if missing, and **`emissiveIntensity = max(current, 3.0)`**. Every agent body on **every** path starts life blown out at 3.0; each display path must re-clamp it itself. Only 1a does.

### 1c. Player body — two paths, neither clamps like 1a
- **Picked operative** `setPlayerCharacter(code)` (L4090–4138): takes the `_pcPreload` promise (`_pcPreload` L2327–2332 loads `/assets/agents/<CODE>.glb?v=14`, or the Forge archetype GLB for `FORGE-*` codes), **clones it with `cloneSkinned`** (L4100), scales to `PLAYER_BODY_HEIGHT` = 7.0 (L2355), clones materials and applies its own treatment (L4109–4123) which ends with the 2026-10-11 "bodies render black" lift: **`emissiveIntensity = 3.0` and `color.setRGB(3,3,3)` for textured materials** (L4116). Then `renderer.compile(scene, camera)` (L4129) and `_setupPlayerRig` (mixer + `attachUAL`, L4025–4060).
- **Boot default** `_loadHero(file, gen)` (L4066–4083): chain `hero-walk.glb` → `robot.glb` → `WorldOperatives.glbFor(defaultCode())`. Its traverse sets **only** `castShadow` + `frustumCulled` (L4075) — **no material treatment at all**, so the parse-time 3.0 emissive stands. `public/assets/player/` contains only `hero.png` + `hero-portrait.png` (FACT, directory listing) — the first two chain steps are **guaranteed 404s** on the deployed site, exactly as the L3919 comment says ("player/*.glb are gitignored, so deploys only have the last").
- Default operative for a new player: `world-operatives.js` hides the 8 Forge bases (ALPHA) and council agents are free, so `defaultCode()` (world-operatives.js L46) returns **SHADDAI**; premium GLB URLs there use `?v=15` (L47) vs `?v=14` in world-main — same file, two cache entries.
- **Hero switch (world-actions.js L403–413):** pressing **H** cycles `['SHADDAI','ZEROX','ORACLE','NEXUS','TURTLE','QUILL','PIKADON']` through `setPlayerCharacter`, pops the toast **`NOW PLAYING: <CODE>`**, persists to `localStorage shd.hero3d`, and a 6 s timer **restores the saved hero every session**. So a hero once picked (e.g. ZEROX) becomes the player's body on every subsequent visit.

### 1d. Other skinned-clone consumers (all fed the same `cloneSkinned`)
Townsfolk (L814), Grid/canon builder (L965), **WorldTitans** (L973), wildlife (L983), **dragon ride** (L996), interior agents attach (L1108), **WorldBots bodies** (L1136), riders (L5144, via `_pcPreload`). `world-dragons.js` L1440–1442 shares one parsed dragon GLB across several dragons via the same clone helper.

### 1e. `cloneSkinned` (L17–31) — the documented shard machine
Header comment, verbatim substance: *"SkeletonUtils.clone re-links bones BY NAME; when a name does not resolve the slot is undefined and **the body renders as an explosion of shards (seen on the player in every hall)** + the red 'matrixWorld of undefined' banner."* The wrapper checks the name-clone for undefined bone slots and falls back to a hierarchy-position re-link with the source's `boneInverses`. Note the limits: the check runs **once, at clone time**; the fallback silently skips `bind()` for any mesh whose mapped bones don't all resolve; and nothing re-checks the clone afterwards.

### 1f. The skin-repair / perf-guard exemptions (the Nov 7 spike legacy)
- Council GLBs SHADDAI/TURTLE/ZEROX/PIKADON ship **interleaved** skin attributes (verified below: 52-byte stride). A 2026-11-07 incident: `_repairSkins` misread interleaved attributes and **exploded the council bodies (measured 271–447 units tall)**. Fix: those four files are tagged `__skinClean` at load and both the repair and the perf-guard leave them alone (`_CLEAN_SKIN`, L746; `_repairSkins` L727–744).
- `world-perf-guard.js`: `guardSkin` (L16–27) and the `applyBoneTransform` raycast wrapper (L64–69) both **skip `__skinClean` meshes**. So the four flagship rigs — including every clone made from them (userData survives cloning) — are exempt from the only runtime bad-skin protection.

---

## 2. GLB forensics (FACT — parsed from the binaries)

All seven council GLBs share the **same 26-node skeleton** (identical bone names, no duplicates, same joint order: Hips, LeftUpLeg, …, neck, Head — verified node-by-node). Every rig is skinned (1 skin, 24 joints). Nothing about ZEROX's skeleton is unique.

| File | Size | Generator | Texture (embedded, sole image) | Mesh | Clips | Material notes |
|---|---|---|---|---|---|---|
| **ZEROX.glb** | **12,907,068 B** | glTF-Transform v4.5.0 | **PNG 2048×2048, 8,716,411 B (67% of the file)**, mean luminance ≈ **51/255** | 1 mesh, **65,428 verts**, interleaved attrs (stride 52) | **23** (full baked set incl. idle/walk/run) | 1 material: baseColor + emissive = same texture, emissiveFactor [1,1,1], KHR specular 2.0, ior 1.45, doubleSided, **OPAQUE** (no alphaMode) |
| SHADDAI.glb | 4,068,084 B | glTF-Transform v4.5.0 | WebP, 238,916 B, mean ≈ 80/255 | 1 mesh, 58,512 verts, interleaved | 23 | same material shape |
| TURTLE.glb | 5,050,144 B | glTF-Transform v4.5.0 | WebP, 277,362 B, mean ≈ 105/255 | 1 mesh, 70,694 verts, interleaved | 23 | same material shape |
| NEXUS / ORACLE / QUILL | 1.17–1.24 MB | older meshopt build | WebP ≈ 0.19–0.24 MB | 1 mesh, ~38–39 k verts, **separate** (non-interleaved) bufferViews | 23 | same skeleton |
| PIKADON.glb | 708,308 B | Blender I/O v5.2.40 | **none** (0 images) | 1 mesh, **5 materials**, colour factors only | 23 | different build entirely |
| VILLAIN.glb | 4,576,564 B | glTF-Transform v4.4.1 | PNG, 2,629,805 B | 1 mesh | **7 only** | same emissive shape |
| ZEROX_packed_old.glb | 4,994,456 B | glTF-Transform v4.4.1 | PNG, 2,161,468 B | 1 mesh | 20 | **`alphaMode: BLEND`** — the old ZEROX was the transparent one; the current file is not |

Shared trio facts (ZEROX/SHADDAI/TURTLE): armature root scale **0.01** (a centimetre rig), mesh-local height **1.800** for all three → identical normalisation (×3.89 to the 7.0 standee height). ZEROX's mesh is the *thinnest* of the trio (depth 0.311 vs SHADDAI 0.581) and mid-pack on verts. **No wrong up-axis, no scale anomaly, no missing texture, no alpha material in the current ZEROX.glb.**

---

## 3. Why ZEROX "loads odd" — root-cause candidates, ranked

**#1 — The un-packed PNG texture (FACT, explains slow/late/heavy loading).**
ZEROX is the only council body that missed the WebP re-pack its siblings got: 8.72 MB of PNG vs 0.24–0.28 MB of WebP. Consequences on every path: the file is 12.9 MB (2.6× SHADDAI, 10× NEXUS); in the sequential council queue it is the longest download + a 2048×2048 PNG decode; decoded it is 16.8 MB of VRAM (+⅓ mips ≈ 22 MB) vs ~5.6 MB for a 1024-dieted sibling texture — and GLB-embedded textures **bypass the 1024 texture diet** (the diet's ImageBitmap half is opt-in `?bmdiet=1`, L61–71; see MOBILE_PASS2_PLAN rank 1/3 notes). As a played operative it is also preloaded via `_pcPreload`. Net effect: ZEROX's body visibly arrives later and costs more than any other agent — "loads odd" in the plain sense.

**#2 — Un-clamped emissive blowout on the paths Israel actually sees it (FACT mechanism, explains pale/ghost look).**
`agentBodyFix` forces `emissiveIntensity ≥ 3.0` at parse for every agent GLB (L51–59). The council path re-clamps to 0.3 (L2395) — plaza ZEROX looks near-normal. The player paths do not: `_loadHero` applies no material treatment at all (L4075), and `setPlayerCharacter` deliberately re-raises textured materials to emissive 3.0 + colour ×3 (L4116, tuned for the dark textures — ZEROX's mean is 51/255, exactly the "~50/255" the comment cites). Emissive at 3× means the texture is shown almost unlit (flat, shading-free) and its bright areas cross the bloom threshold (0.92, L2296) → a pale, glowing, "translucent-reading" figure. It is **not** transparency: the current GLB is OPAQUE and no path sets `transparent`/`opacity` on it. The translucency Israel remembers may also trace to the **old** ZEROX build, which genuinely shipped `alphaMode: BLEND` (ZEROX_packed_old.glb, §2).

**#3 — The skinned-clone bind failure (FACT that it occurs live; INFERENCE on which clone in which clip) — see §4.**
Not ZEROX-specific in mechanism, but ZEROX is exposed twice: as a council body and as a persistently-restored player hero (§1c), and its `__skinClean` tag (§1f) removes the perf-guard safety net from every clone of it.

**Ruled out (FACT):** mis-scale (identical 1.800 height/armature 0.01 as siblings), unskinned mesh (24-joint skin present), missing/failed texture (single texture present and used for both colour and emissive), per-agent code overrides (none exist; `_AGENT_YAW_FIX` is empty), sideways stance (the old Neon-Valkyrie yaw fix was removed with the v6 body, L2347).

---

## 4. SHARD MASS — the crystalline explosion (batch 2)

**What the frames show (FACT):** in one clip the sky over the landscape is filled with enormous white flat-shaded stretched triangles — an exploded skinned mesh at very large apparent scale. In another clip (transit-hub scene) the screen carries a **red error banner flooding the same line dozens of times: `TypeError: Cannot read properties of undefined (reading 'matrixWorld')` at `three.core.js:25024`**.

**What that line is (FACT):** vendored `three.core.js:25024` is inside `SkinnedMesh.applyBoneTransform`: `skeleton.bones[boneIndex].matrixWorld` — i.e. **some skinned mesh in the scene has a skeleton whose bone slot for a skinned vertex is `undefined`**. `applyBoneTransform` is exercised by raycasts (the perf-guard wraps it for exactly this crash, world-perf-guard.js L64–69) — a per-frame picker/raycast over the scene turns one bad mesh into a banner flood and a hard per-frame cost.

**Mechanism (INFERENCE, mechanically standard):** a skinned mesh whose bones/boneInverses are mis-paired renders *almost correctly at bind pose* (all offsets near zero) and **explodes as soon as animation rotates bones**, because each vertex follows a wrong bone's matrix — triangles stretch between the bones their vertices were bound to. On these rigs the effect is amplified ~100×: the armature is a centimetre rig (scale 0.01) with bone translations in cm space, so a mismatched bone throws vertices tens to hundreds of units — matching the sky-filling shards. This is the exact failure `cloneSkinned`'s header comment (L19–20) says was *"seen on the player in every hall"*.

**Which model is it? Ranked candidates:**
1. **The player body clone** (`setPlayerCharacter` → `cloneSkinned`, §1c). It is the only body guaranteed present in every scene, it is re-cloned on every hero switch and every session restore, and the code's own history names the player as the shard victim. If Israel's saved hero is ZEROX, this also ties the fault to "ZEROX loads odd" — the same ZEROX that is coherent-but-pale in batch 1 (§6).
2. **A WorldTitans clone** (L973) — titans are giant skinned bodies built with the same helper; a broken titan matches the *scale* of the v8 shards best. The mass "moving through the world" fits a wandering titan as well as the player.
3. **A dragon clone** (`world-dragons.js` L1440–1442 shares one GLB across dragons via `cloneSkinned`) — the banner-flood clip is set at a transit hub with ride prompts and dragons nearby.
All three share one root: **a cloned skinned body whose skeleton re-link failed or degraded after the one-time check in `cloneSkinned`** — with the aggravating factor that `__skinClean`-tagged rigs (SHADDAI/TURTLE/ZEROX/PIKADON and their clones) are exempt from the perf-guard's bad-skin pinning, so nothing catches it at runtime (§1f).

**Not the cause (FACT):** a clip from another rig sampled by the wrong mixer — the trio's baked clips are native to the identical shared skeleton, and the library/UAL retargets bind by bone name onto the body's own skeleton; neither rebinds a foreign skeleton. Skinning "without bind matrices" in the abstract is the right family; the concrete door is the clone/re-link path above.

---

## 5. GHOST AGENTS in oval bubbles + "NOW PLAYING: …" (batch 2)

**The text (FACT):** `NOW PLAYING: <CODE>` is the **hero-switch toast** in `world-actions.js` L412 — it appears when the *player's own body* is swapped (H key, or the saved-hero restore at 6 s). The cycling names (ZEROX / TURTLE / PIKADON / ORACLE / NEXUS / QUILL) are the HEROES list being cycled, **not** a radio or a preview system. (The separate Shaddai Radio panel in world-radio.js has its own "NOW PLAYING" section for music tracks; the agent-name cycling in the videos is the hero toast.)

**The figures (FACT + INFERENCE):** frames show a pale, pinkish-white humanoid with a purple top standing inside a translucent oval pod inside an agent interior (clearly labelled "NEXUS — Navigator Core", with that room's FABRICATOR panel open). Identification: this is the **interior resident-agent display** — a real 3D council body (not the outdoor portrait sprite: sprites are flat 7.4-unit billboards at outdoor sectors, §1a; not the interior staff, who are static K14 work bots per world-interior-agents.js). The oval is the pod/chamber glass of that display (INFERENCE: the exact owning module was not uniquely pinned in this pass — the display lives in the interiors system, and world-main's own comments reference a "rooms/chamber viewer" whose material treatment the council path copies, L2383).

**Why the body inside is an untextured ghost (FACT mechanism):** it is the §3-#2 blowout on a display path that never re-clamps: the body carries parse-time `emissiveIntensity` 3.0 (agentBodyFix), its single texture drives both colour and emissive, so it renders as a flat self-lit silhouette with its shading washed out — a "ghost" — inside glass that was presumably meant to hold a normally-lit body. It is **not** a designed hologram material (no transparent/hologram material exists on this path; the GLB is OPAQUE) and **not** a texture failure (the texture is present; at 3× emissive its detail is simply blown past the bloom threshold).

---

## 6. The white bot with black rings and swords (batch 1) — connect or separate?

**Connect — same body, different state (INFERENCE built on FACTs):**
- ZEROX.glb contains **exactly one mesh / one primitive** (§2) — there are no ring or sword submeshes in the model. The two large black rings seen flanking the figure in the dragon-ride frames belong to the **mount's harness** (those clips' HUD reads "STORM DRAGON OF SUBURB TRANSIT HUB" — the player is riding the transit dragon; world-dragon-ride.js / transit system), and any sword is attached gear/clip dressing from outside the GLB. The rings are not part of ZEROX and not a rendering error.
- The figure itself — pale, translucent-reading, sliding/flying over terrain — is the **player body in its coherent state**: emissive-blown (§3-#2) and, while mounted/gliding, not playing a locomotion cycle (the loco blend zeroes movement weight on vehicles, `_updatePlayerLoco`), hence the "sliding" read.
- Batch 1 (coherent pale bot) vs batch 2 (shard mass) = **bind-pose vs animated states of the same cloned-body fault** (§4): near bind pose the mis-paired skinning is nearly invisible and only the material blowout shows; under locomotion/flight animation the same body tears into shards. One fault chain, two presentations. (INFERENCE — the separating test would be a console capture of `[cloneSkinned] name re-link failed` or perf-guard `badSkins` output during a shard episode.)

---

## 7. Desktop load speed

### What loads pre-entry (FACT; detail in MOBILE_PASS2_PLAN.md)
~118 classic script tags + three dist bundles (~1.47 MB) + `world-main.js` (598 KB) → module-eval build (renderer, PMREM env, decor IIFEs, hidden ground + 3 textures, composer + bloom) → `placeAgents` sprites → the `__LD` critical chain: terrain (8 MB `height16.bin`, ~75 MB VRAM of terrain textures) → water (with its 1024² depth bake) → realm-modules (the dressing GLB wave — still parsing after its step reports done) → buildings → canon GLB → grid-fabric clusters → city-v3 (awaited; 1.8 MB art-slots JSON) → sky. Council GLBs queue after world render and parse sequentially (100–400 ms of main thread each).

### The post-100% stall (FACT — `_liteLoader`, L4888–4914)
100% on the bar means the critical steps finished; the remaining wait is the **'warm' step**, in order:
1. `renderer.compileAsync` over the **whole scene**, raced against a **30 s cap** — and per the in-code comment, whatever misses the cap **compiles synchronously on the first in-world frame** (historically a 21–31 s frame; the old "94% stall" was this step at 40+ s).
2. `_introWarming`: two full `composer.render()` frames behind the loader — **every texture built so far uploads to the GPU at once** (the Nov 11 baseline measured ~250 MB of texture upload in this window), while the dressing wave is still parsing.
3. Auto-enter (350 ms after warm), then on landing `setPlayerCharacter` clones the hero and runs **`renderer.compile(scene, camera)` again** for the avatar's fresh materials (L4129), while council bodies and dressing continue to stream/parse around the player.

### Top 3 desktop load-time cuts — no quality reduction
1. **Re-pack ZEROX's texture to WebP (and VILLAIN's PNG likewise).** 8.72 MB → ~0.3 MB at the same 2048×2048 art; removes the single largest agent download and its PNG decode from both the council queue and the operative preload. Pure win, no visual change (siblings already ship exactly this packing). Also the biggest single lever for the mobile peak (MOBILE_PASS2_PLAN rank 1 family).
2. **Stop making ENTER wait for the whole-scene warm.** Lower the warm cap toward the already-proven 6 s value (`?precompile=0` path) and let the existing `bgCompile` interval (re-runs `compileAsync` every 2.5 s post-entry) finish the remaining programs lazily; restrict the two warm-up renders to the spawn-visible set instead of force-uploading every texture in the world. Same shaders, same textures, same final quality — the cost moves from a blocked loader to the first seconds in-world, where the streaming systems already hide it.
3. **Kill the guaranteed-404 hero chain + defer the dressing wave on desktop too.** Start the boot body directly at `WorldOperatives.defaultCode()` when no pick has been made (the `hero-walk.glb`/`robot.glb` steps are dead round-trips on every deploy — the files don't exist). And apply the mobile Cut-1 pattern on desktop: start `__buildRealmModules`' dressing builders (RealmKits / Townsfolk / RealmDress / TransitKit) after spawn via the `_afterSpawn` hook that already exists in the same function — none of it is in the spawn view, and today its parse storm contends with terrain/city/warm-up for CPU and bandwidth during the exact window the loader is measuring.

Runner-ups (noted, not counted): the `?v=14` vs `?v=15` split makes returning players download every council GLB twice (once per consumer); the council queue's fixed 1.5 s initial delay (L2358) plus 200 ms inter-body gaps add ~2 s before the last agent appears; SHADDAI_gold_static.glb (3.8 MB) and the *_old GLBs (ZEROX_packed_old 5.0 MB, PIKADON_old_model 5.6 MB, TURTLE_packed_old 1.5 MB) sit in the deploy tree whether or not anything references them.

---

## 8. Facts vs inferences — index

**FACT (code/binary/frame-verified):** all GLB numbers in §2; identical skeletons; ZEROX OPAQUE with PNG texture; old ZEROX BLEND; agentBodyFix 3.0 force (L51–59); council clamp 0.3 (L2395); player ×3 lift (L4116) and _loadHero's missing treatment (L4075); hero-switch toast + restore (world-actions.js L403–413); cloneSkinned's shard history + one-time check (L17–31); __skinClean exemptions (§1f); the `matrixWorld` banner flood in Israel's recording and its location at three.core.js:25024 (`applyBoneTransform`); `assets/player/` has no GLBs; _liteLoader warm sequence + 30 s cap (L4888–4914); bloom threshold 0.92 (L2296).

**INFERENCE (reasoned, labelled in place):** which specific clone produced the v8 shard mass (player clone ranked #1, titan #2, dragon #3); the bind-pose-vs-animated explanation connecting batch 1 and batch 2; the oval-pod display's exact owning module (§5); the rings as mount harness (they are provably not in ZEROX.glb; their owner system was identified from the ride HUD, not from a torus in world-dragon-ride.js, which contains none).
