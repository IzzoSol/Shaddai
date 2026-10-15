# GLB/glTF Inventory — 551 files not yet in the build

Source list: `glb-missing.json` (551 GLB/glTF files found on the machine that are byte-different
from anything already in `Shaddai-3d`). Every file was surveyed by **header only** (JSON chunk /
accessor bounds / image dimensions peeked in 64 KB chunks) — no full file was ever loaded into
memory. Nothing was moved, copied, or deleted by this pass; see **Execution blocked** below.

## Execution blocked — plan only, not run

The task asked to physically **move** every loose personal file into a new
`OneDrive\3D-LIBRARY\` and **copy** a curated subset into the build. The sandbox's "auto mode"
safety classifier denied every script that performed (or even dry-ran) filesystem moves against
the 551 real paths, tagging it **"Irreversible Local Destruction"** — this held even for a
read-only planning script once it referenced the destination library path. Per the tool's own
instructions I did not try to route around that denial (different tool, different script framing,
etc.) — I stopped and produced the full plan instead, so a session with move permission enabled
(or the owner, manually) can execute it in one pass.

**What this means concretely:**
- No files were moved. Every one of the 551 originals is exactly where the input list found it.
- No files were copied into the build. `public/assets/manifest-downloads.json` is untouched.
- Everything below is the *proposed* categorization + destination, plus a machine-readable plan:
  **`docs/GLB-MOVE-PLAN.csv`** (551 rows: `orig_path, sizeMB, category, kind, note`). Grant Bash
  filesystem-move permission and re-run this task (or hand the CSV to a script) to execute it.

## Counts by class

| Class | Files | Tracked MB | Notes |
|---|---:|---:|---|
| **Already in a git repo** (left alone — real project repos + cloned tool repos) | 210 | 1,157.9 | See breakdown below |
| **Kit pieces** — Modular SciFi MegaKit[Standard] (whole folder) | 190 | 0.6 (glb only; folder also has fbx/textures not counted) | Never split — move as one folder |
| **Kit pieces** — loose individual modular pieces (Wall/Floor/Stairs/VIP/Temple/etc.) | 32 | 93.0 | Assembly components, not standalone |
| **Agents/characters** — Meshy biped bundles (7 distinct characters, 20 files) | 20 | 556.3 | Mesh + per-clip animation exports |
| **Agents/characters** — other single files (mech mascot, cosmic skater) | 2 | 192.7 | |
| **Agents/characters** — existing council-agent candidates (PIKADON/ZEROX/ORACLE/TURTLE/SHADDAI/NEXUS/QUILL/XEROX + katana backup) | 9 | ~54.9 | **See mismatch findings below — do not swap blindly** |
| **Terrain/nature** | 24 | 395.1 | Tree/grass/mountain/rock/ground-scape pieces |
| **Props** | 21 | 350.9 | Furniture, signage, emblem, hoodie wearable |
| **Vehicles** | 2 | 64.0 | "Arctic Voyager", "Slipstream Voyager" |
| **Buildings/landmarks** | 1 | 49.8 | "mythical carnival" |
| **Weapons** | 1 | 11.5 | "Emberblade" |
| **fal-outputs** (Dreamers-project singles + tidewater/superconductor reference bundle) | 9 | 263.9 | Not SHADDAI, or reference-only |
| **Tests/junk** — Meshy raw `base_basic_pbr/shaded.glb` pre-texture exports + empty terrain stubs | 15 | 740.0 | Safe deletion candidates once owner confirms |
| **Unknown** — ambiguous names, need a visual look | 24 | 585.2 | |
| **Total** | **551** | **~4,461** | |

(9 agent-candidate files counted above are a subset already implied by the "loose" totals; they
overlap with what would otherwise be bucketed "unknown" — called out separately because of the
finding below.)

### Repo breakdown (210 files, left untouched)

| Repo / location | Files |
|---|---:|
| `Shaddai` (main product, has fal-assets/ never merged to this branch) | 103 |
| `Shaddai-merge` | 14 |
| `shaddai-threejs-gamedev-master` | 9 |
| `skate-threejs-ref` | 3 |
| `Shaddai-city-backend` | 1 |
| `updog-site` | 1 |
| `Shaddai-Realms` | 1 |
| `Desktop\SHADDAI MASTER FINAL BUILD` (**has its own real `.git`** — the task's example list called this "non-repo," but it genuinely is a git repo; flagged here rather than moved) | 70 |
| `Documents\AI-Influencer\tools\{step1x-3d,hunyuan3d}\...` (example/test assets inside cloned third-party tool repos) | 8 |

`C:\Users\Brittany` itself has an accidental "home repo" `.git` (see commit "remove stray file
from home repo") — that is **not** a real project repo, so it was deliberately excluded from the
git-ancestor check; otherwise every file under Desktop/Documents/OneDrive would have been
wrongly flagged as "in a repo."

## Important findings

### 1. "ZEROX katana" is not a weapon prop — it's a full character body
`Desktop\ZEROX-katana-backup.glb` (7.34 MB, 28,187 tris, 24 joints, anims
`idle/walk/run/attack1/attack2/heavy/flip`) is **byte-size-identical and stat-identical** to
`Desktop\_render_repro\public\assets\agents\ZEROX.glb`. It is a rigged combat-ready ZEROX agent
body (presumably holding/wearing a katana), not an isolated weapon mesh. Copying it to
`public/assets/props/weapons/zerox-katana.glb` as originally suggested would mislabel a full
character as a prop. **Not copied — flagged for the owner to open in Blender and decide** whether
to extract just the katana mesh, or swap it in as a ZEROX body update.

### 2. Current build's ZEROX.glb / TURTLE.glb animation names look swapped
Surveying the *current* `public/assets/agents/*.glb` in the build:
- Build `ZEROX.glb` (4.8 MB, 28,501 tris) carries dance/combat mocap clip names — *Backflip_Sweep_Kick, Cardio_Dance, Denim_Pop_Dance, Hip_Hop_Dance_4, Kung_Fu_Punch*-style names — that match almost exactly the clip list found in `Desktop\_render_repro\public\assets\agents\TURTLE.glb` (same tri count 28,187 vs 28,501, same 24 joints).
- Build `TURTLE.glb` carries a different mocap set (`360_Power_Spin_Jump`, `Boxing_Practice`, etc.).
- `_render_repro`'s `ZEROX.glb` instead carries the simple `idle/walk/run/attack1/attack2/heavy/flip` set (matching `VILLAIN.glb` and the katana backup).

This suggests a mesh/animation-naming mixup happened at some point between ZEROX and TURTLE (or
`_render_repro` is a snapshot from before a rename). **Not touched — flagged as an open question**
rather than guessing which is "correct" and risking making it worse.

### 3. Meshy biped character bundles (7 distinct characters, ~556 MB)
Each is a full rigged humanoid exported from Meshy.ai, found as either a merged-animation glb
(`*_Meshy_Merged_Animations.glb`) plus a base `*_Character_output.glb`, or (for Crimson Sentinel)
**8 separate per-clip glbs that each re-embed the full mesh** (~9 MB × 8 ≈ 72 MB for one
character) — that one needs a Blender animation-merge pass before it's usable efficiently:

| Character | Location(s) | Tracked files | Notes |
|---|---|---:|---|
| Crimson Hammer Knight | SHADDAI WORLD only | 2 (87.6 MB) | merged-anim + base |
| Violet Arcana | split across 2 folders | 2 (84.6 MB) | one file per folder — check for the other half already in build |
| Emerald Enforcer | **duplicated** in both folders, identical 26.43 MB each | 2 (52.9 MB) | true duplicate — keep one |
| Neon Valkyrie | "FINAL UPDATED" folder + plain folder | 4 (154.9 MB) | **prefer FINAL UPDATED**; plain version → old-or-superseded |
| Crimson Sentinel | SHADDAI WORLD only | 8 (~72.9 MB) | 7 separate per-clip animation exports + base — needs merge-animations pass in Blender before use |

### 4. Not-SHADDAI content mixed in
Two of the huge single Meshy exports are explicitly named "Dreamers" (`Dreamers_Cereal_Clock`,
`Dreamers_Good_People`, ~260 MB combined) — these almost certainly belong to the separate
Dreamers-Ecosystem project, not this game. Routed to `fal-outputs`, not `unknown`.

### 5. Tests/junk — likely easiest space to reclaim
740 MB across 15 files are Meshy.ai's raw **pre-texture** base-mesh exports
(`base_basic_pbr.glb` / `base_basic_shaded.glb` / `base.glb`, repeated across ~6 different GUID
output folders) plus a couple of near-empty `Terrain.glb` test stubs. Every one of these is
superseded by a final, named, textured `*_texture.glb` sitting elsewhere in the same list — safe
deletion candidates once the owner confirms the finals are the ones they want to keep.

## Needs-compression table (nothing here was copied into the build)

Every file ≥ ~5 MB or with unknown/high tris needs `@gltf-transform/cli` before it could go in the
build. None were run (no npm installs allowed, and nothing was copied). Representative examples —
full list is `docs/GLB-MOVE-PLAN.csv` cross-referenced with the header survey:

| File | MB | Tris | Suggested command |
|---|---:|---:|---|
| Any Meshy biped `*_Character_output.glb` / `*_Merged_Animations.glb` (skinned, 24+ joints) | 26–58 | unknown (large) | `npx --yes @gltf-transform/cli optimize <in> <out> --compress meshopt --texture-compress webp --texture-size 1024 --simplify false` (skinned → never simplify) |
| Meshy single "hero" exports (Crystal Eden Rising, Storm Ladder Hoodie, Neon Covenant, etc., 60–185 MB) | 60–185 | unrigged (0 joints) | `npx --yes @gltf-transform/cli optimize <in> <out> --compress meshopt --texture-compress webp --texture-size 1024 --simplify 0.5` |
| `_render_repro`/backup agent glbs (once the mismatch above is resolved) | 3–8.5 | 16k–53k | usually just `--texture-compress webp --texture-size 1024` (already close to web-ready) |
| GROUND SCAPE mosaics (Prismatic/Chromatic/Kaleidoscopic) | 23–50 | unknown | `optimize --compress meshopt --texture-compress webp --texture-size 1024 --simplify 0.5` |

## Recommend adding to the build

**Nothing was copied.** After the katana finding (#1) and the ZEROX/TURTLE mismatch (#2), none of
the candidates the task named clear the "obviously fits, unambiguous" bar the owner set
("don't just add whatever"). Everything else in the 551 needs either compression, a Blender
merge/decimate pass, or a first-hand visual look before it's clearly a fit for a specific realm,
creature slot, or vehicle slot in the current build. Recommending a copy without that would be
exactly the "nickel-and-diming with guesses" the owner didn't want.

Best candidates for the owner to eyeball next (highest confidence, ranked):
1. **Neon Valkyrie (FINAL UPDATED)** biped — richest fully-merged animated humanoid in the set, one Blender/compression pass from being a usable NPC or boss.
2. **Crimson Sentinel** biped — same, but needs the 8-clip merge pass first.
3. **`_render_repro` agent glbs** — only useful once #2's mismatch is resolved; could be a genuine model/anim upgrade for ZEROX/TURTLE.
4. **Cosmic Skater** (single Meshy export, `agents-characters`) — possible fit for the SHADDAI-Arcade SKATE game per memory notes; not this repo though.
5. **Arctic Voyager / Slipstream Voyager** — vehicle-shaped, worth a look for the current vehicle roster.
6. **Emberblade** — weapon prop, smallest/cheapest of the "needs a look" pile (11.5 MB).

## Kit pieces (never split, move as folders)

- `Downloads/Modular SciFi MegaKit[Standard]/Modular SciFi MegaKit[Standard]/` — 190 tracked glb pieces (folder is double-nested, a zip-extract artifact; move the outer folder as one unit).
- 32 loose individual modular pieces (Wall_Module_*, Floor_Ring, Top_Beam, VIP_*, SciFi_Stairs_32, SciFi_Bridge, TempleFloor/Embelisher*, Stage_Structure_Backstage, Iron_Structure_01_Art, ElevatorTeleport01_Art, Floating_Island_01_Art, BlockChain_Tower/CodeBush_Art, Colony_Planet_Art, Path_0*_Art, Stairs.glb, Platform_03) sitting loose in `Downloads/` rather than inside a kit folder — likely fragments of the same or a companion Synty-style temple/sci-fi kit, exported individually. Full list in the CSV, `category=kits`.

## Duplicates / old-or-superseded (owner to decide, nothing deleted)

- Emerald Enforcer `*_Character_output.glb` — byte-identical-sized copy in both `New folder\Downloads` and `Desktop\Downloads\SHADDAI WORLD` (26.43 MB each) → keep one, ~26.4 MB reclaimable.
- Neon Valkyrie plain folder vs "FINAL UPDATED" folder → keep FINAL UPDATED, ~77.4 MB reclaimable if the plain one is deleted.
- 15 tests/junk files (740 MB, see finding #5) — Meshy raw pre-texture exports superseded by named finals.
- **Potential total reclaimable if the owner deletes old-or-superseded + tests/junk after review: ~843.8 MB** (77.4 + 26.4 + 740.0).

## Unknown — needs a visual look (24 files, 585.2 MB)

Ambiguous single-word/short Meshy names with no strong signal either way: Crystal Eden Rising,
Neon Covenant, Fortune Retriever, Violet Storm Core, plus `model.glb` / `model (1/2/3).glb`
(anonymous exports) and a couple of near-empty `Terrain.glb` test stubs. Full paths in the CSV,
`category=unknown`.

## Open questions for the owner

1. **Grant filesystem-move permission** (or run the CSV plan yourself / in a session where it's allowed) so the actual `OneDrive\3D-LIBRARY` reorg can happen — right now it's fully planned but not executed.
2. Is `Desktop\SHADDAI MASTER FINAL BUILD` (has its own `.git`, 70 files) an active repo we should treat as protected, or an old snapshot safe to fold into the library? Left alone pending your call.
3. Katana finding — do you want just the katana mesh extracted from `ZEROX-katana-backup.glb`, or is this actually meant to be a ZEROX body update?
4. ZEROX/TURTLE animation-name mismatch in the *current build* — was this intentional (a rename) or a real bug? Worth checking before any agent-model swap.
5. Violet Arcana — the two folders each have only one of the two expected files (anim vs base mesh). Are the missing halves already merged into the build under a different name, or should both full sets be tracked down?
6. OK to delete the 15 Meshy `base_basic_*` raw exports (740 MB) once you've confirmed the named/textured finals are the ones you want?

## Files

- Full 551-row plan: `docs/GLB-MOVE-PLAN.csv` (columns: `orig_path, sizeMB, category, kind, note`).
- No GLB/glTF files were moved or copied by this pass; `public/assets/manifest-downloads.json` is unchanged.
