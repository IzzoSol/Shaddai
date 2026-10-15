# Handoff for lighter models (Sonnet / Haiku) — SHADDAI 3D world (2026-09-26)

Opus 5.5 keeps the big, cross-cutting work: canon map steps 6–12, world systems integration, performance architecture, combat and dragons, and final verification.

You take the **bounded, checkable tasks** below. Work on **one task at a time.** When done, report what you did and how you verified it.

## HARD RULES (read first, no exceptions)
1. **NEVER delete anything** without the owner typing "yes, delete X". That covers files, folders, caches, git branches, and processes you didn't start.
   - A previous "free up disk space" pass deleted 330 tracked files (the RAG docs, an agent body, videos).
   - If disk is low, **report it and stop**.
2. **Repo and branch:**
   - Work in `C:\Users\Brittany\Shaddai-3d` (git worktree) on branch **`feat/world3d`**.
   - Never push `main`. Never `git stash`, `git reset --hard`, `git clean`, or `pull --rebase`.
3. **Commit only the files your task names**, using `git add <path>` explicitly.
   - `.glb` files are gitignored, so add them with **`git add -f`**.
   - End every commit message with `Co-Authored-By: <your model> <noreply@anthropic.com>`.
4. **Don't edit `public/SHADDAI-WORLD-3D.html`** (the host page; Opus owns it). Put your host integration in your task's doc as exact-anchor snippets; Opus applies them.
5. **The laptop is weak** (Intel HD 620, 8 GB RAM):
   - Run ONE heavy thing at a time (Blender, a headless browser, or a big conversion).
   - Check free RAM and disk first (`powershell (Get-PSDrive C).Free`).
6. **Scale law:**
   - 1 m = 7/1.8 = 3.889 game units. The player is 1.8 m tall.
   - Blender works in METRES: +X east, +Y north, Z up. glTF export (+Y up) matches the game once you scale by U.
7. **Futuristic tech-fusion only** (owner rule): no plain houses, barns or roads.
8. **Licenses:** record every downloaded asset's license in the manifest. If it's unknown, write `"unknown — owner to confirm"` and flag it. Never strip author credits.

## Tools you should reuse
- **Blender 5.2, headless:** `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python <script> -- <args>`. Never connect to port 9876, which is the owner's live Blender.
- **Old `.blend` files** (Blender 2.7x) are **gzip-compressed**, and Blender 5.2 opens them as EMPTY. Decompress first: `gzip -dc in.blend > .bl-cache/src/out.blend`.
- **Inspect a `.blend`:** `tools/blender/assets/inspect-blend.py` lists objects, armatures, bones, actions, triangle counts and images.
- **Export with animations:** `tools/blender/assets/export-dragon.py` is the pattern. It rebuilds pre-2.8 materials as Principled from packed images, exports ALL actions as clips, and can make a check render with `--render <frame>`.
- **Decode meshopt for Blender import:** `node tools/ual/decode-for-blender.mjs in.glb out.glb`.
- **Compress for the web:** `npx --yes @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024` (use `--simplify false` for skinned meshes).
- **LODs:** the same command with `--simplify true --simplify-ratio 0.12 --simplify-error 0.15 --texture-size 512` (lod1) or `0.02 / 0.5 / 128` (lod2).
- **Inspect and count:**
  - `node tools/ual/inspect-glb.mjs file.glb` shows animations, skins and textures.
  - `node tools/ual/count-tris.mjs file.glb` shows triangles.
- **Headless browser check:**
  - Use puppeteer with **`headless: 'shell'`**. The full Chrome build is missing `icudtl.dat`.
  - Set `NODE_PATH=C:/Users/Brittany/Shaddai/node_modules`, and the dev server is `http://localhost:8790/SHADDAI-WORLD-3D.html?peek=1&map=v4`.
  - Use `?perf=1` for the profiler HUD, and pass a named `userDataDir` (don't delete it after).

## TASKS (pick one, finish it, report)

### T1 — Convert the owner's downloads into game assets
Source folder: `C:\Users\Brittany\OneDrive\Desktop\New folder\Downloads`. Do **one asset per task.** Output goes to `public/assets/creatures/`, `public/assets/vehicles/` or `public/assets/props/`, plus an entry in `public/assets/manifest-downloads.json`:
`{id, file, lods[], source, license, real_size_m, tris, animations[], bones, notes}`.

| id | Source file(s) | What it becomes | Acceptance |
|---|---|---|---|
| `maglev-train` | `Superconductortrain_only_train.fbx` (or `Superconductortrain_4.blend`, gzip!) | The maglev train cars for the gold ring (they replace the white capsules in `world-transit.js`) | GLB ≤ 3 MB, one car ≈ 20 m long, pivot at the centre of the car floor, lod1, check render |
| `wolf` | `Wolf-Rigged-and-Game-Ready.zip` | An animal for the Darkforest/wilderness | Rigged GLB with idle/walk/run (/attack) clips, ≈ 1.6 m long, lod1, check render |
| `iguana` | `Iguana.zip` | An animal for the Sand Sea | Same as the wolf; ≈ 1.2 m |
| `tuna` | `TunaFish.fbx` / `Tuna.blend` | Fish for Crystal Sea schools | ≈ 1.5 m, swim loop if there is one (otherwise note it: code will animate), lod1 |
| `skeleton-enemy` | `skeleton_animated.FBX` | A night enemy | Rigged GLB with all clips, 1.8 m tall, lod1 |
| `insect-monster` | `monster+insects.obj` + `texures/` (PBR maps) | A night enemy (static; code animates it) | GLB with PBR (baseColor/normal/metal-rough), ≈ 2.5 m, lod1 |
| `underwater-props` | `Retro_UnderWaterAssets_Freebies_FBX.zip` | Crystal Sea seabed props (coral, rocks, wrecks) | One GLB per prop (real sizes), a manifest list |

For each: inspect → convert → **check render (PNG in `.bl-cache/renders/<id>-check.png`)** → compress → LOD → manifest → commit.

If you find a readme or license in the zip/folder, copy its text into `public/licenses/<id>.txt`.

### T2 — Health / stamina / boss HUD (`public/world-hud-v4.js`, new file)
- `window.buildHudV4({ getHP:()=>0..100, getStamina:()=>0..1, dragons: api|null })` creates DOM bars:
  - HP and stamina bars at bottom-left, small and clean, in obsidian `#06080b`, emerald `#00ff9c` and gold `#e8c45c`
  - a **boss bar** at the top-centre while a dragon engages: use `dragons.on('telegraph'|'hurt'|'defeated')` and `dragons.stats().attacker`, showing the dragon's name + HP
- No per-frame DOM thrash: update the bars at most 10×/s.
- Host snippet goes in the doc. The controller output exposes `stamina` (0..1) and the host has `window.__playerHP`.
- Acceptance: `node --check` passes, plus a small test page `public/hud-lab.html` with fake values.

### T3 — LODs for the remaining heavy models
- Generate `lod1`/`lod2` into `public/assets/models/lod/` for every model placed by `world-realmprops.js` and `world-falprops.js`. Get the list from `WORLD_LAYOUT.realmModels` urls + `window.WORLD_FAL_ITEMS`.
- Write `docs/LOD-TABLE.md` with triangle counts per level.
- **Code changes are Opus's** (the chunked-LOD pattern lives in `public/world-clusters-v4.js`); just produce the files and the table.

### T4 — License and asset audit of `Downloads\`
- List every model/texture pack there: name, what it is, license (read readme/licence files inside zips; `unzip -l` / `tar -tzf` for unitypackages), and a suggested realm/use.
- Output `docs/DOWNLOADS-AUDIT.md`. **Read-only task. Don't unzip into the repo.**

### T5 — Tests
- Add node tests for pure functions that don't have any yet. For example, `public/world-collision.js` OBB resolve (see the inline test in its commit message), and `tools/blender/realm-clusters-v4.py` determinism (run it twice and diff the JSON).
- Tests live in `tools/tests/*.test.cjs`.

## What Opus is doing (don't duplicate)
- Canon map steps 6–12:
  - 6 Suburbs megablocks + megatower
  - 7 Sand adobe cluster
  - 8 Darkforest paths
  - 9 Crystal harbour + glass tube
  - 10 Arctic shelf city + cloud-stair walkways
  - 11 Colosseum scale
  - 12 dragon lairs
- Wiring the rigged dragon, the HUD and the converted assets into the host.
- Performance passes (measured with `?perf=1`).
- Blender verify renders for owner approval.

## Where things are
- **World layout:**
  - `public/world-layout.js`: the `?map=v4` path reads `public/assets/terrain/terrain.json`.
  - `tools/blender/canon/world-layout.json`: the owner's canonical table.
- **Canon build:** `tools/blender/canon/build_canon.py`. It exports `public/assets/world/canon-v4.glb` + `canon-colliders-v4.json`.
- **Docs, one per system:**
  - `docs/PLAYER-CONTROLLER.md`
  - `docs/DRAGONS.md`
  - `docs/SKY-DAYNIGHT.md`
  - `docs/FILL-V4.md`
  - `docs/CANON-WORLD-LAYOUT.md`
  - `docs/FAL-NEEDS-PLAN.md`
  - `docs/REALM-FILL-PLAN.md`
  - `docs/VEHICLES-V2.md`
