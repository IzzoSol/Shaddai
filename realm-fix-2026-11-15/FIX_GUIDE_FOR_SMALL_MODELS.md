# FIX GUIDE FOR SMALL MODELS — Shaddai 3D Realm Fix Wave

**Who this is for:** a smaller model (GLM-5 / Beam via OpenCode) executing one fix at a time.
Every step is one action. Every code snippet in this guide was copied from the real files on
2026-11-15 and verified. If a snippet does not match what you find in the file, **STOP** —
the code has changed since this guide was written; do not improvise a replacement.

**Companion file:** [FIX_GUIDE_DEEP_RESEARCH.md](FIX_GUIDE_DEEP_RESEARCH.md) — asset inventory,
texture-pipeline research, city-builder deep-dive, performance budget, what's-missing inventory.
Read the deep-dive before attempting Fix 6 (city).

**Source diagnoses (read the one for your fix before starting):**
`ZEROX_AND_LOAD_DIAGNOSIS.md`, `BUTTONS_FOG_CITY_DIAGNOSIS.md`, `MOBILE_PASS2_PLAN.md`,
`VIDEO_ISSUES.md` — all in `~/workspace/realm-polish-2026-11-14/`. GitHub issue: IzzoSol/Shaddai #3.

---

## GLOBAL RULES — read before touching anything

1. **Repo:** `~/workspace/shaddai-repo`. The LIVE code (what players run, GitHub main `207d30a`)
   is branch **`realm-fix-for-main-2026-11-15`**. Line numbers in this guide are from that branch.
2. **Never edit `main`. Never edit branch `realm-fix-wave1-2026-11-15`** (another crew is working
   there). Create your own branch from the live branch, one per fix:
   `git checkout realm-fix-for-main-2026-11-15 && git checkout -b realm-fix-<shortname>-2026-11-15`
3. **Backup before every edit:**
   `mkdir -p ~/workspace/realm-polish-2026-11-14/BACKUP-guide && cp <file> ~/workspace/realm-polish-2026-11-14/BACKUP-guide/`
4. **After editing any `.js` file:** `node --check <file>` — it must print NOTHING. An error
   message means you broke the syntax; restore from backup and redo the step.
5. **After all edits in a fix are done, ALWAYS run the build** from the repo root:
   `node tools/build-dist.cjs` — this rebuilds the `public/dist/boot-*.js` bundles AND updates
   the `/world-main.js?v=<hash>` cache-bust inside `public/SHADDAI-WORLD-3D.html` automatically.
   Then run `node tools/build-dist.cjs --check` — it must print `dist up to date`.
   **NEVER edit anything inside `public/dist/` by hand.** If you skip the build, the live page
   keeps serving the OLD bundled code and your fix "does nothing" — this is the #1 trap.
   (First run may auto-install esbuild into `~/.cache/w3d-build-tools` via npm — that is normal.)
6. **No downgrades.** Never fix a problem by removing quality, shadows, features or content.
   If the only fix you can think of removes something, STOP and report instead.
7. **Mobile changes stay behind the flag.** Anything gated on `_MOBILE_LITE` must keep working
   exactly as before when the URL has `?mobilelite=0`. Desktop behaviour stays byte-identical
   unless the fix explicitly says otherwise.
8. **One fix = one branch = one commit series.** Do not bundle two fixes.
9. **Labels:** when you report results, mark claims LIVE (ran in the real page), SIM (ran in a
   test harness) or PROPOSAL (not run). Never claim an in-game result you did not see.

### Running the world locally for testing
```bash
cd ~/workspace/shaddai-repo
PORT=8930 node backend/server-production.js
```
(`package.json` `"start"` is `node backend/server-production.js`; the port is
`process.env.PORT || 3000` — server-production.js line 3517. Use 8930 to match the known local setup.)
Then open `http://localhost:8930/SHADDAI-WORLD-3D.html` in a browser **with a real GPU**
(the cloud/VM browser has no WebGL2 and can only show the graphics-paused screen — that is
expected there, not a bug). Server routes `/world` and `/world3d` also serve this same page.

Useful debug URL switches while testing: `?bundle=0` (loads the original un-bundled scripts —
use this if you suspect the dist build), `?perf=1` (FPS/quality HUD), `?texdiet=0`,
`?skinfix=0`, `?bug2guard=0`, `?agentfix=0` (each disables one named system so you can A/B).

### Off-switches that already exist (do not invent new ones where these suffice)
`?mobilelite=0` all mobile-lite fixes · `?fog=1` fog ON (it is off by default) · `?themefx=1`
theme-driven fog · `?skyclock=1` moving sky clock · `?skyfx=1` shader sky dome · `?shadows`
shadow pass ON (off by default) · `?precompile=0` 6 s warm-up cap · `?warmcap=<ms>` ·
`?tex=<px>` / `?texdiet=0` / `?bmdiet=1` texture diet · `?perfguard=0` · `?cityspread=0`
canon old dense city · `?fullcity=1` un-thinned grid fabric · `?map=v3` legacy terrain.

---

## FIX 1 — Skinned clones explode into a shard mass + the red error flood

**What you are fixing.** Some cloned rigged bodies have a mis-paired skeleton. They look fine
standing still and explode into giant white shards as soon as they animate, and a per-frame
raycast over the bad mesh floods the screen with
`TypeError: Cannot read properties of undefined (reading 'matrixWorld')`.
Three sub-fixes: 1A lets the perf-guard protect the council rigs again, 1B rejects bad clones
at clone time, 1C stops the error banner from stacking the same error hundreds of times.

**Blender needed? NO.** The council GLBs were verified clean offline (same 26-node skeleton,
max skin index ≤ 23 of 24 bones, weights sum to 1). The fault is runtime clone/guard code.

> **Research note [WEB + repo-verified]:** the canonical three.js clone path is
> `SkeletonUtils.clone()` — and the realm ALREADY uses it: world-main.js line 17 is
> `import { clone as _cloneSkinnedByName } from 'three/addons/utils/SkeletonUtils.js'`
> (verified in the repo; `SkeletonUtils.js` is vendored under
> `public/vendor/three/addons/utils/`). Do NOT replace the clone with a hand-rolled one.
> The remaining gaps versus the production `validateSkinned()` pattern [WEB: research report
> §1, `~/workspace/research_notes/threejs-realm-completion-research-20261115-1850/report.md`]
> are exactly what 1A/1B close: the realm's clone checked only for `undefined` bones, not for
> (a) out-of-range `skinIndex` values or (b) `boneInverses.length !== bones.length`. The
> report's cause list also matches the diagnosis: the `matrixWorld` error is an `undefined`
> entry in `skeleton.bones[]`, and it surfaces on the CPU path (raycast / bounding volumes),
> which is why bodies "explode later" instead of failing at load.

**Files:** `public/world-perf-guard.js`, `public/world-main.js`, `public/SHADDAI-WORLD-3D.html`

> ⚠️ **WAVE-1 GUARD:** another crew may have already landed 1A and 1B on branch
> `realm-fix-wave1-2026-11-15` (commit "wave1 fix 1: skinning guard…"). Before each sub-fix,
> run its STOP check. If the check says it is done, skip that sub-fix and say so in your report.

### Fix 1A — perf-guard exemption

1. Open `public/world-perf-guard.js`. Search for `__skinClean) return`.
   **STOP check:** if the `guardSkin` function's first line no longer mentions `__skinClean`,
   1A is already done — skip to 1C.
2. Find this exact text:
   ```js
   if (m.userData.__skinChecked || m.userData.__skinClean) return; m.userData.__skinChecked = true;   // __skinClean: verified council GLB (world-main SPIKE FIX)
   ```
   Replace it with:
   ```js
   if (m.userData.__skinChecked) return; m.userData.__skinChecked = true;   // FIX 1A: __skinClean no longer exempts a mesh — the guard reads skin indices per-component (getComponent), which is safe on the council rigs' interleaved attributes; the Nov-7 spike was caused by _repairSkins WRITING over interleaved data, not by this read-only check.
   ```
3. In the same file, search for `!this.userData.__skinClean`. Find this exact text:
   ```js
   if (sk && si && !this.userData.__skinClean) { for (var c = 0; c < 4; c++) { var bi = si.getComponent(index, c); if (bi >= sk.bones.length || !sk.bones[bi]) return target; } } return abt.call(this, index, target); };
   ```
   Replace it with:
   ```js
   if (sk && si) { for (var c = 0; c < 4; c++) { var bi = si.getComponent(index, c); if (bi >= sk.bones.length || !sk.bones[bi]) return target; } } return abt.call(this, index, target); };
   ```
4. Run `node --check public/world-perf-guard.js` — must print nothing.

**⛔ DO NOT touch `_repairSkins` in world-main.js, and do NOT remove its interleaved-attribute
early return** (`if(si.isInterleavedBufferAttribute || sw.isInterleavedBufferAttribute) return;`).
That guard is the Nov-7 spike fix. Removing it re-explodes the council bodies — the exact bug
you are fixing. The `__skinClean` *tagging* code in world-main.js also stays as-is.

### Fix 1B — clone-time skin-index rejection

1. Open `public/world-main.js`. Search for `skinIndex` within 40 lines below `function cloneSkinned`.
   **STOP check:** if `cloneSkinned` already reads `skinIndex`, 1B is already done — skip to 1C.
2. Find this exact text (the whole function):
   ```js
   function cloneSkinned(src){
     const c = _cloneSkinnedByName(src); let bad = false;
     c.traverse(function(o){ if(o.isSkinnedMesh && (!o.skeleton || o.skeleton.bones.some(function(b){ return !b; }))) bad = true; });
     if(!bad) return c;
   ```
   Replace it with:
   ```js
   function cloneSkinned(src){
     const c = _cloneSkinnedByName(src); let bad = false;
     c.traverse(function(o){ if(!o.isSkinnedMesh) return;
       if(!o.skeleton || o.skeleton.bones.some(function(b){ return !b; })){ bad = true; return; }
       if(o.skeleton.boneInverses.length !== o.skeleton.bones.length){ bad = true; return; }   // validateSkinned pattern [WEB]: inverses must pair 1:1 with bones
       const si = o.geometry && o.geometry.attributes && o.geometry.attributes.skinIndex, nb = o.skeleton.bones.length;
       if(si){ for(let v = 0; v < si.count && !bad; v++){ for(let j = 0; j < 4; j++){ const b = si.getComponent(v, j); if(b >= nb){ bad = true; break; } } } }
     });
     if(!bad) return c;
   ```
   (The rest of the function — the hierarchy-position fallback — stays untouched.)
3. Run `node --check public/world-main.js` — must print nothing.

### Fix 1C — error banner dedupe

1. Open `public/SHADDAI-WORLD-3D.html`. Search for `m.textContent+=(t+'`. Find this exact text:
   ```js
   var b=document.getElementById('errBox'),m=document.getElementById('errMsg');if(b&&m){b.style.display='block';m.textContent+=(t+'\n');}};
   ```
2. Replace it with:
   ```js
   var b=document.getElementById('errBox'),m=document.getElementById('errMsg');if(b&&m){b.style.display='block';var k=String(t).slice(0,120);window.__errSeen=window.__errSeen||{};if(window.__errSeen[k]){window.__errSeen[k]++;}else{window.__errSeen[k]=1;m.textContent+=(t+'\n');}}}};
   ```
   Count the closing braces in your replacement: the line must end with `}}}};` (four `}` then `;`).
   If it ends with anything else, the page's error handler is broken — restore and redo.
3. There is no `node --check` for HTML. Instead extract and check: search the file for
   `__errSeen` — it must appear exactly 3 times, all on that one line.

**Verify (all of Fix 1):**
- `node tools/build-dist.cjs` then `node tools/build-dist.cjs --check` → `dist up to date`.
- In-game (GPU browser): load the world, press **H** several times to cycle heroes
  (SHADDAI → ZEROX → ORACLE → …), walk and jump with each. Expected: every body stays a
  coherent solid figure while moving; no shard explosion; the red banner, if it appears at
  all, shows each distinct error **once**.
- Console: `WorldPerfGuard.stats()` → `badSkins` lists any pinned bad skins by path
  (an entry here is the guard WORKING, not a failure).

**Why this works.** The explosion happens because a vertex follows a bone slot that is
`undefined` or out of range; at bind pose every offset is ~zero so the body looks fine, and
animation turns the bad slot into metre-long stretched triangles (the rig is centimetre-scale,
so errors amplify ~100×). 1A re-arms the two runtime nets (bounds pinning + the raycast
wrapper) that were disabled for exactly the four flagship rigs. 1B catches the other failure
shape — a skin index pointing past the bone array — at clone time and routes the clone into
the existing hierarchy-position fallback. 1C attacks the flood, not the bug: the banner
appended every repeat, so one per-frame error became hundreds of DOM lines and its own
performance problem.

**If you did it wrong, it looks like this:**
- Bodies explode WORSE / all four council agents explode at the plaza → you touched
  `_repairSkins` or its interleaved guard. Restore world-main.js from backup.
- Page shows the graphics-paused screen or a blank loader after the HTML edit → brace count
  wrong in 1C. Restore the HTML from backup and recount.
- Nothing changed in-game → you forgot `node tools/build-dist.cjs` (rule 5).

**Done when:** heroes cycle and animate without shards; a repeated error shows once in the banner.

---

## FIX 2A — ZEROX (and VILLAIN) texture re-pack: 8.7 MB PNG → WebP

**What you are fixing.** ZEROX.glb is 12.9 MB because its texture is an uncompressed-in-file
PNG (8,716,411 bytes, 2048×2048). Its siblings SHADDAI/TURTLE carry WebP textures of
238,916 / 277,362 bytes in 3.9–4.8 MB files. You are converting ZEROX's embedded texture to
WebP at the SAME 2048×2048 resolution and same art. VILLAIN.glb (4.4 MB, 2.6 MB PNG inside,
referenced by world-main.js and world-operatives.js) gets the same treatment.

**Blender needed? NO.** This is an image-format conversion inside the GLB container.
Tool: **glTF-Transform CLI** (the same toolchain that built these files — the GLB generator
string reads "glTF-Transform v4.5.0"). Do NOT use gltfpack for this task (it would also
re-quantize geometry). Do NOT open Blender.

**Files:** `public/assets/agents/ZEROX.glb`, `public/assets/agents/VILLAIN.glb` (binary assets)

### Steps
1. Back up:
   ```bash
   mkdir -p ~/workspace/realm-polish-2026-11-14/BACKUP-assets
   cp ~/workspace/shaddai-repo/public/assets/agents/ZEROX.glb ~/workspace/realm-polish-2026-11-14/BACKUP-assets/
   cp ~/workspace/shaddai-repo/public/assets/agents/VILLAIN.glb ~/workspace/realm-polish-2026-11-14/BACKUP-assets/
   ```
2. Check the CLI's exact syntax FIRST (versions differ — obey what YOUR install prints):
   ```bash
   cd ~/workspace/shaddai-repo
   npx -y @gltf-transform/cli@4 webp --help
   ```
   **STOP** if the command errors or `webp` is not listed. Report the error; do not substitute
   another tool.
3. Convert ZEROX to a NEW file (never overwrite in place yet):
   ```bash
   npx -y @gltf-transform/cli@4 webp public/assets/agents/ZEROX.glb /tmp/ZEROX-webp.glb
   ```
   (If `--help` showed a required slot/quality flag, add it for the baseColor/emissive slots
   exactly as the help describes.)
4. Prove the new file is the same model with a smaller texture:
   ```bash
   node tools/ual/inspect-glb.mjs /tmp/ZEROX-webp.glb
   node tools/ual/raw-skin-check.mjs /tmp/ZEROX-webp.glb
   ls -la /tmp/ZEROX-webp.glb public/assets/agents/ZEROX.glb
   ```
   Expected: same node count (26), same animation count (23), skin check clean, texture
   mimeType `image/webp`, and the new file is roughly **4–5 MB** (down from 12.9 MB).
   **STOP** if the animation count, node count or skin check differ — the conversion damaged
   the model; keep the original and report.
5. Only after step 4 passes: `cp /tmp/ZEROX-webp.glb public/assets/agents/ZEROX.glb`
6. Repeat steps 3–5 for VILLAIN (expected: 7 animations — VILLAIN legitimately has only 7
   clips; do not "fix" that).
7. Bump the agent cache version so returning browsers fetch the new files. In
   `public/world-main.js` search for `.glb?v=14` — there are two occurrences (the council
   loader and `_pcPreload`). Change both to `.glb?v=15`. Then
   `node --check public/world-main.js` and run the build (global rule 5).

> **Research note [WEB]:** WebP fixes DOWNLOAD size only — in VRAM the texture still decodes
> to full RGBA (`width × height × 4 × 1.33` with mipmaps; a 2048² texture = 21.3 MB). The
> format that also cuts VRAM 4–8× is KTX2/Basis — that is a separate, later migration
> (deep-research file §4), NOT part of this fix. Exact one-shot pipeline from the research
> report §2 for STATIC props only:
> `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 2048`
> — do NOT run `optimize` on the rigged council bodies: its join/flatten defaults can destroy
> named-node/armature structure [WEB]. gltfpack alternative: use the NATIVE binary (the npm
> build cannot compress textures), and `-kn` (keep named nodes) is mandatory in this
> codebase: `gltfpack -i in.glb -o out.glb -cc -tc -kn` [WEB].

**Verify:** in-game, stand at the ZEROX sector: the body loads noticeably sooner than before
and looks IDENTICAL (same colours, same art — WebP at same resolution). Network tab: the
ZEROX.glb request is ~4–5 MB, not 12.9 MB.

**Why this works.** The PNG inside the GLB is decoded to a full 2048×2048 RGBA bitmap
(16.8 MB, ≈22 MB with mipmaps) no matter what — the file format only changes download size
and decode cost. WebP gives the same pixels for ~1/30th of the bytes (the siblings prove the
exact ratio on this very rig family), so ZEROX stops being the last and heaviest body in the
sequential queue. Geometry, skeleton and clips are untouched by a texture-only conversion.

**If you did it wrong, it looks like this:**
- ZEROX appears with a flat black or missing texture → the conversion dropped the image or
  converted the wrong slot. Restore from BACKUP-assets.
- ZEROX has no animations / T-poses → step 4 counts differed and you copied anyway. Restore.
- File size barely changed → you converted a copy, or the CLI re-encoded to PNG. Check the
  mimeType in inspect-glb output: it must say `image/webp`.

**Done when:** ZEROX.glb ≤ ~5 MB with `image/webp` texture, 26 nodes / 23 clips / clean skin
check, and VILLAIN.glb likewise reduced (7 clips preserved).

---

## FIX 2B — Emissive blowout: your own body and the interior agents glow like ghosts

**What you are fixing.** A parse-time wrapper (`agentBodyFix`) forces every agent GLB's
`emissiveIntensity` to at least 3.0. The outdoor council path clamps it back to 0.3, but the
player-body path deliberately re-raises it to 3.0 with colour ×3, and `_loadHero` never
clamps at all — so as your own body (and in interior displays) an agent renders flat, pale
and bloom-blown: the "ghost". You are making the player paths use the council path's clamp.

**Blender needed? NO.** Pure material values in code. The GLB is OPAQUE and correctly textured.

**Files:** `public/world-main.js`

### Steps
1. Open `public/world-main.js`. Search for `bodies render black`. Find this exact text
   (it is one long line inside `setPlayerCharacter`):
   ```js
   if(hasTex && mm.emissive){ mm.emissive.setRGB(1,1,1); if(!mm.emissiveMap) mm.emissiveMap = mm.map; mm.emissiveIntensity = 3.0; mm.color.setRGB(3,3,3); }   // 2026-10-11 owner: bodies render black - the agent textures are very dark (mean ~50/255), so lift them x3 in both the lit and glow channels - the painted map drives the glow so lights/normals can never black them out
   ```
   Replace it with:
   ```js
   if(hasTex && mm.emissive){ mm.emissive.setRGB(1,1,1); if(!mm.emissiveMap) mm.emissiveMap = mm.map; mm.emissiveIntensity = 0.3; }   // FIX 2B: same 0.3 clamp as the council path (see _nextAgentBody) — the old x3 lift blew the texture past the bloom threshold and rendered the body a flat pale ghost
   ```
   Do NOT change the line directly above it
   (`if('emissiveIntensity' in mm) mm.emissiveIntensity = Math.min(...)`) — it already clamps
   to 0.3; the line you replaced was re-raising it afterwards.
2. Now the boot-default body. Search for `capsule avatar kept`. Scroll up a few lines and find
   this exact text inside `_loadHero`:
   ```js
   m.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.frustumCulled=false; } });
   ```
   Replace it with:
   ```js
   m.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.frustumCulled=false; const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach(function(mm){ if(mm && 'emissiveIntensity' in mm) mm.emissiveIntensity = Math.min(mm.emissiveIntensity != null ? mm.emissiveIntensity : 0, 0.3); }); } });   // FIX 2B: _loadHero previously applied NO material treatment, so the parse-time 3.0 emissive from agentBodyFix stood
   ```
3. Run `node --check public/world-main.js`, then the build (rule 5).

**Interior resident display [VERIFY]:** the pale figure inside the oval pod in agent
interiors is the same blowout on a third path. Its exact owning module was NOT pinned by the
diagnosis. Do this search task, do not guess-edit: in `public/world-interiors.js` and
`public/world-interiors-v3.js` (if present), search for where a council/agent GLB is loaded
for a room display (search `assets/agents/`). At that load's material traverse, apply the
same rule: after any other material edits, set
`emissiveIntensity = Math.min(current, 0.3)` per material. If you cannot find such a load,
report "interior display load not found" — do NOT edit the K14 staff bots
(`world-interior-agents.js`); they are a different, working system.

**Verify:** in-game, pick ZEROX at the spawn picker (or press H until "NOW PLAYING: ZEROX").
Expected: the body shows its real dark texture with shading and depth — same look as the
ZEROX standing at his plaza sector — not a flat pale silhouette. Compare side by side:
walk your body to the ZEROX sector; both should read the same.

**Why this works.** At emissiveIntensity 3.0 the material's own texture, multiplied by 3,
dominates the lighting calculation — surface shading disappears and bright texels cross the
bloom threshold (0.92), so the body reads as a glowing cut-out. The council path's 0.3 keeps
a slight self-glow (so the dark textures never go fully black — the original reason for the
lift) while letting lights and normals shape the body again. Nothing about the model changes.

**If you did it wrong, it looks like this:**
- Player body renders BLACK → you removed the emissive floor entirely (set 0 or deleted the
  emissiveMap assignment) instead of clamping to 0.3. The line must keep
  `mm.emissive.setRGB(1,1,1)` and the emissiveMap assignment.
- Plaza council agents changed appearance → you edited the wrong traverse (the council one
  is inside `_nextAgentBody` and already says `0.3` — it needed no change).

**Done when:** the player body and the plaza body of the same agent look the same.

---

## FIX 3 — Loader hangs at 100% ("WARMING UP THE RENDERER") + dead 404 hero chain

**What you are fixing.** After the load bar hits 100%, the game waits on a whole-scene shader
compile raced against a 30 s cap; whatever misses the cap compiles synchronously on the first
in-world frame (a 21–31 s frozen frame — the hang in the videos). Separately, the boot hero
chain requests two files that do not exist (`hero-walk.glb`, `robot.glb` — `assets/player/`
contains only PNGs) before loading the real body. You lower the cap to the already-proven
6 s value and start the hero chain at the real body.

**Blender needed? NO.**

**Files:** `public/world-main.js`

### Steps
1. Search for `warmcap`. Find this exact text:
   ```js
   var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : (/[?&]precompile=0\b/.test(location.search) ? 6000 : 30000);   // ?warmcap=ms overrides the cap (measurement)
   ```
   Replace `30000` with `6000` (change nothing else on the line):
   ```js
   var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : (/[?&]precompile=0\b/.test(location.search) ? 6000 : 6000);   // ?warmcap=ms overrides the cap (measurement) // FIX 3: default cap 30 s -> 6 s (the proven ?precompile=0 value); the rest compiles lazily via bgCompile after entry instead of freezing the first in-world frame
   ```
2. Search for `safety net only`. Find this exact text:
   ```js
   setTimeout(function(){ if(!playerAvatar.children.length) _loadHero('hero-walk.glb'); }, 22000);   // safety net only: a picked operative normally sets the body first (saves 3 requests + 1.3 MB at boot)
   ```
   Replace it with:
   ```js
   setTimeout(function(){ if(!playerAvatar.children.length) _loadHero(window.WorldOperatives ? window.WorldOperatives.glbFor(window.WorldOperatives.defaultCode()) : '/assets/agents/SHADDAI.glb'); }, 22000);   // safety net only // FIX 3: start at the real body — hero-walk.glb/robot.glb do not exist in assets/player/ (only PNGs), so the old chain burned two 404 round-trips on every boot that reached this net
   ```
3. Search for `falling back to hero body`. Find this exact text:
   ```js
   if(gen===_playerRigGen && !playerAvatar.children.length) _loadHero('hero-walk.glb'); });
   ```
   Replace `_loadHero('hero-walk.glb')` with the same expression as step 2:
   ```js
   if(gen===_playerRigGen && !playerAvatar.children.length) _loadHero(window.WorldOperatives ? window.WorldOperatives.glbFor(window.WorldOperatives.defaultCode()) : '/assets/agents/SHADDAI.glb'); });
   ```
4. `node --check public/world-main.js`, then the build (rule 5).

**Verify:**
- Browser Network tab during a fresh load (cache disabled): NO requests for
  `hero-walk.glb` or `robot.glb`.
- The loader passes "Warming up the renderer" and enters within seconds, not minutes;
  console `window.__bootTimings` shows the `warm-programs` entry with `capMs: 6000`.
- In-world, the first seconds may show brief shader-compile hitches on newly-seen objects —
  that is the lazy `bgCompile` doing its job (it re-runs `compileAsync` every 2.5 s for
  90 s after entry). A multi-second frozen first frame is NOT expected anymore.

**Why this works.** The compile work itself does not shrink — it moves. `bgCompile` already
exists to finish compiling programs lazily after entry, when a hitch costs a frame instead
of the whole entry. The 6 s figure is not a guess: it is the value the `?precompile=0` path
has been using. The 404 fix removes two guaranteed-failed network round-trips (plus their
error handling) from every boot that reaches the fallback.

> **Research note [WEB]:** `compileAsync` compiles PROGRAMS only — it does not upload
> textures or geometry. The realm's warm-up already does the second half correctly: the two
> hidden composer renders behind the loading screen (`_introWarming`) are the real
> texture-upload step [WEB: research report §4]. That is why Mobile Cut 2 (below) may skip
> those renders on phones only as a peak-memory trade, never as a "they do nothing" cleanup.
> Also: `KHR_parallel_shader_compile` is NOT supported in Firefox [WEB: MDN via report §4],
> so on Firefox `compileAsync` degrades toward synchronous — the 6 s cap still bounds the
> loader's wait, and `bgCompile` still finishes the rest after entry.

**If you did it wrong, it looks like this:**
- Loader still hangs ~30 s → you edited the cap but skipped the build (rule 5), or you
  changed the `?warmcap` regex instead of the default.
- Player has NO body at all after 22 s with an empty picker → the `glbFor` expression is
  mistyped. Check the console for `[setPlayerCharacter]` / `_loadHero` errors and compare
  against the working pattern already inside `_loadHero`'s own error handler (it calls
  `window.WorldOperatives.glbFor(window.WorldOperatives.defaultCode())` the same way).

**Done when:** no hero 404s in the Network tab; entry follows 100% within seconds.

---

---

## FIX 4 — Navi freezes the page ("Page Unresponsive" when clicking buttons / scrolling)

**What you are fixing.** Opening the Navi drops the whole world to MEDIUM quality and closing
it restores the old tier — each switch reallocates every post-processing target and recreates
the shadow map, which is the visible freeze on open/close. Separately, every mouse-wheel tick
over the Navi triggers a full re-render of both plates. You remove the tier round-trip and
throttle the wheel. (The third cause — starting a city race synchronously rasterising the
318-building plan for 2–4 s — is Fix 4C, a design task: do NOT attempt it in this fix.)

**Blender needed? NO.** DOM/JavaScript only.

**Files:** `public/world-navi.js`

### Fix 4A — remove the quality-tier round-trip
1. Open `public/world-navi.js`. Search for `__setQualityTier(2, 1e6)`.
   **STOP check:** if that text is gone, 4A may already be done — search for `capped = ti`;
   if that is also gone, skip 4A entirely.
2. Find this exact text (inside the Navi `open` function):
   ```js
   if (ti > 2 && window.__setQualityTier) { capped = ti; window.__setQualityTier(2, 1e6); }
   ```
   Replace it with:
   ```js
   /* FIX 4A: no quality-tier change on Navi open. The old round-trip (drop to MEDIUM on open, restore on close) reallocated every composer target and recreated the shadow map per open/close — that reallocation WAS the Navi freeze. A UI overlay must not re-tier the renderer. */
   ```
3. Search for `__setQualityTier(capped, 6)`. Find this exact text (inside `close`):
   ```js
   if (capped != null && window.__setQualityTier) { window.__setQualityTier(capped, 6); capped = null; }
   ```
   Replace it with:
   ```js
   capped = null;   /* FIX 4A: nothing to restore — open() no longer changes the tier */
   ```
4. Leave the `var capped` declaration and the `ti` computation untouched (harmless).
5. `node --check public/world-navi.js` — must print nothing.

### Fix 4B — throttle the module wheel
1. Search for `addEventListener('wheel'`. Find this exact text (one line):
   ```js
   root.addEventListener('wheel', function (e) { if (e.target.closest && e.target.closest('.plate')) return; setModule(step(e.deltaY > 0 ? 1 : -1)); e.preventDefault(); }, { passive: false });
   ```
2. Replace it with:
   ```js
   var _wheelAt = 0;
   root.addEventListener('wheel', function (e) { if (e.target.closest && e.target.closest('.plate')) return; e.preventDefault(); var now = performance.now(); if (now - _wheelAt < 150) return; _wheelAt = now; setModule(step(e.deltaY > 0 ? 1 : -1)); }, { passive: false });   /* FIX 4B: one module switch per 150 ms max — every wheel tick used to full-render both plates (innerHTML rebuild + live state re-scan) */
   ```
3. `node --check public/world-navi.js`, then the build (rule 5).

### Fix 4C — city-race raster [DESIGN TASK — do not attempt as a small model]
`WorldCityHeights.build({ plan, U, cell: 2 })` is monolithic and synchronous (its own header
math; the in-code comment admits ~2–4 s). The correct fix is architectural: prebuild the
raster once at idle after entry (`requestIdleCallback`) when city circuits are available and
cache it, so a race click never pays it. Record it as a follow-up; 4A+4B are this fix.

**Verify:** open the world at HIGH quality (`?perf=1` shows the tier). Open and close the
Navi (Y key) ten times. Expected: no freeze, no "Page Unresponsive", and the quality tier in
the perf HUD NEVER changes while the Navi opens/closes. Scroll the wheel over the Navi
background: modules switch at a readable pace, not in a blur.

**Why this works.** `_applyQualityTier` is not a cheap setter: it disposes and recreates the
composer's render targets, toggles bloom, and disposes/recreates the shadow map. Doing that
twice per Navi open/close guaranteed a multi-hundred-ms (on weak GPUs, multi-second) stall
on the exact interaction the player uses most. The wheel fix works because a physical scroll
fires dozens of events per gesture; each one rebuilt two DOM plates from live world state —
throttling to one switch per 150 ms keeps the gesture's intent and drops ~95% of the rebuilds.

**If you did it wrong, it looks like this:**
- Navi opens but the world looks permanently softer/lower-res afterwards → you removed only
  the close() restore and left the open() drop. Both halves must go (steps 2 and 3).
- Wheel does nothing at all in the Navi → your throttle variable is declared AFTER the
  listener or shadows another `_wheelAt`. It must be declared immediately before the listener,
  exactly as written.
- Buttons still rebuild slowly when CLICKED → that is the separate full-`render()` cost
  (Fix 4C-class architectural work), not this fix. Do not try to "optimise render()" here.

**Done when:** Navi open/close is instant at any tier and the tier never changes.

---

## FIX 5 — White-out / split sky: give the sky ONE owner

**What you are fixing.** Two systems fight over the sky: the theme engine locks
`scene.background` to a flat colour (often near-white for pale themes) and blocks the sky
system from writing background/fog, while the sky system still runs the LIGHT rig at fixed
day strength over night-built art — the white-vs-black split and the "white fog" in the
videos (real fog density is already 0). Step 1 is a safe stopgap that returns background +
fog + lights to the sky system; the full palette reconciliation is a design task.

**Blender needed? NO.**

**Files:** `public/world-main.js` (stopgap), `public/world-sky-v4.js` + `public/world-themes.js`
(read-only for this fix)

### Step 1 (stopgap — do this)
1. Open `public/world-main.js`. Search for `buildWorldSkyV4({`. Find this exact text
   (three lines):
   ```js
    _v4Sky = window.buildWorldSkyV4({ THREE, scene, renderer, camera, sunLight: sun, hemiLight: hemi, ambientLight: ambient,
      fog: scene.fog, water: _v4Water, dayLengthMin: 24,
   ```
2. Replace the second line with:
   ```js
      fog: scene.fog, respectThemeLock: false, water: _v4Water, dayLengthMin: 24,   // FIX 5 (stopgap): sky-v4 owns background+fog+lights every frame; the theme engine's _themeLocked can no longer freeze the background at a flat colour while day-strength light plays over night art. Trade-off: ⚙ themes stop changing sky/fog/lighting until the full reconciliation (design task) lands.
   ```
3. `node --check public/world-main.js`, then the build (rule 5).

**STOP — do NOT do any of these tempting wrong fixes:** do not raise fog density (fog is
deliberately off; the white was never fog), do not unpause the sky clock
(`paused = !/[?&]skyclock=1/`), do not unhide either sky dome (`?skyfx=1` gate), do not edit
theme palette values. Each changes the look without fixing the ownership split.

### Step 2 (design task — specify, do not build)
Full reconciliation: the theme should contribute a PALETTE (bg/fog/hemi/sun colours) that
sky-v4 consumes, sky-v4 remains the only writer of `scene.background`, `scene.fog` and the
light rig, and `_themeLocked` goes away. Whoever builds it must handle the ⚙ panel's six
terrain buttons (`grid/snow/desert/void/neon/meadow` → `_TMAP` in world-main.js) and the
persisted `localStorage shaddai_world_theme`.

**Verify:** load the world twice: once plain, once with `?theme=snow` after setting the snow
theme in ⚙ on a previous visit (or append `?theme=snow` — the theme engine reads the URL).
Expected after the stopgap: BOTH loads show the sky system's gradient background and the same
coherent lighting; no flat white or flat black backdrop; the scene reads as one time of day.
Before the fix, the snow-theme load is the white-out from the videos.

**Why this works.** sky-v4's per-frame `apply()` already writes background, fog and the full
light rig from ONE palette — but it skips all three writes when the theme lock is set
(`var themed = respectTheme && root && root._themeLocked`). The theme engine sets that lock
~80 ms after boot for any persisted theme and then keeps re-writing only the background
colour, freezing the mismatch in place. `respectThemeLock: false` makes `themed` permanently
false, so the one coherent writer wins every frame. The clock stays paused at the fixed day
palette (0.46) — unchanged from today — so nothing else about the look moves.

**If you did it wrong, it looks like this:**
- Sky is now a flat colour of a DIFFERENT kind, or fog appears where none was → you edited
  sky-v4 or the themes file instead of the one call-site line. Restore and redo step 1 only.
- ⚙ theme buttons appear to "do nothing" for the sky → EXPECTED trade-off of the stopgap
  (say so in your report; it is the design task's job to restore themed skies properly).
- Everything is suddenly night/dark → you unpaused the sky clock or changed `startTime`.
  Restore.

**Done when:** every theme load shows one coherent sky + light rig owned by sky-v4.

---

## FIX 6 — The designed city is never built: new consumer for grid-city-v4.json

**What you are fixing.** The founder's layout — central circle, rings of plots, buildings,
pond, water round the edge — is encoded in data: the central circle EXISTS (Seed-of-Life
rings [60, 130, 200, 260] in world-layout.js, 7 towers at spawn), edge water EXISTS (v4 is a
round island; the ocean surrounds it), but the 318-building city in
`public/assets/world/grid-city-v4.json` is only ever read by a race height-raster. Nothing
instantiates it, so the centre is an empty plain. You write a NEW small module that builds
the plan with InstancedMesh (one draw call per part type) and wire it behind `?cityplan=1`.

**Blender needed? NO** for this fix — the plan JSON is complete and the geometry is
procedural boxes. (Blender is YES only for two OPTIONAL extras, neither in this fix:
re-exporting the missing `canon-consolidated-v1.glb` — the file does not exist on disk, the
`if (false)` block in world-canon-v4.js can never revive it — and carving a real central
pond into the heightmap; see the What's-Missing section.)

**Files:** NEW `public/world-city-build.js`; edit `public/world-main.js` (wiring only).
**Read first:** deep-research file §5 (schema, coordinates, draw-call math) and the header of
`public/world-city-heights.js` — your tier math MUST mirror it exactly (it is quoted in §5).

> ⛔ **Do NOT load or call `world-grid-city-v4.js`.** It is SUPERSEDED: its plan overlaps
> canon/clusters, and wiring it double-builds the city. Its instancing DESIGN is the
> reference; its module is not. ⛔ **Do NOT flip the `if (false)`** in world-canon-v4.js —
> the GLB it loads was never committed and does not exist.

### Steps
1. Create `public/world-city-build.js` with EXACTLY this content:
   ```js
   /* world-city-build.js — NEW consumer for grid-city-v4.json (the designed Grid).
    * Builds the plan as InstancedMesh unit boxes (one draw call per tier type) + plaza discs,
    * park pads, instanced trees and lamps, and registers building colliders.
    * NOT world-grid-city-v4.js (SUPERSEDED — wiring it would double-build over canon/clusters).
    * Tier transform math mirrors world-city-heights.js exactly:
    *   rho = rot_deg in rad; tier centre e = x_m + ox*cos - oy*sin, nth = y_m + ox*sin + oy*cos;
    *   world x = e*U, world z = -nth*U, rotation.y = rho.
    * API: window.buildWorldCityFromPlan({ THREE, scene, heightAt, plan, layout }) -> { group, stats, dispose }
    */
   (function (root) {
     'use strict';
     function build(o) {
       var THREE = o.THREE, scene = o.scene, heightAt = o.heightAt, plan = o.plan, layout = o.layout || root.WORLD_LAYOUT;
       var U = plan.units_per_m || (7 / 1.8);
       var group = new THREE.Group(); group.name = 'grid-city-plan';
       var per = { 0: [], 1: [], 2: [], 3: [], 4: [] }, plazas = [], parks = [], trees = [], lamps = [], i, k;
       var B = plan.buildings || [];
       for (i = 0; i < B.length; i++) {
         var b = B[i], rho = (b.rot_deg || 0) * Math.PI / 180, c = Math.cos(rho), s = Math.sin(rho);
         var tiers = (b.tiers && b.tiers.length) ? b.tiers : [[b.w_m, b.d_m, 0, b.h_m || 0, 0, 0, 0]];
         for (k = 0; k < tiers.length; k++) {
           var t = tiers[k], ox = t[4] || 0, oy = t[5] || 0;
           var e = b.x_m + ox * c - oy * s, nth = b.y_m + ox * s + oy * c;
           var wx = e * U, wz = -nth * U, gy = heightAt ? heightAt(wx, wz) : 0;
           per[t[6] || 0].push({ x: wx, y: gy + (t[2] + t[3] / 2) * U, z: wz, rot: rho, sx: t[0] * U, sy: Math.max(t[3] * U, 0.1), sz: t[1] * U, gold: b.accent === 'gold' });
         }
         if (layout && layout.realmColliders) {   // AABB of the rotated ground-tier footprint, rot:0 — the proven canon path; conservative (never smaller than the building)
           var t0 = tiers[0], hw = t0[0] * 0.5 * U, hd = t0[1] * 0.5 * U;
           var ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
           var bx = b.x_m * U, bz = -b.y_m * U;
           layout.realmColliders.push({ x: bx, z: bz, hx: ex, hz: ez, rot: 0, top: (heightAt ? heightAt(bx, bz) : 0) + (t0[2] + t0[3]) * U, label: 'cityplan-' + b.id });
         }
       }
       (plan.plazas || []).forEach(function (p) { plazas.push(p); });
       (plan.parks || []).forEach(function (p) {
         parks.push(p);
         var rho = (p.rot_deg || 0) * Math.PI / 180, c = Math.cos(rho), s = Math.sin(rho);
         (p.trees || []).forEach(function (tr) {   // tree coords are park-local metres [VERIFY against tools/grid-city/grid-city-plan.cjs if trees land wrong]
           var e = p.x_m + tr[0] * c - tr[1] * s, nth = p.y_m + tr[0] * s + tr[1] * c;
           trees.push({ x: e * U, z: -nth * U, r: (tr[2] || 1) * U });
         });
       });
       (plan.lamps || []).forEach(function (l) { lamps.push(l); });
       var M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), COL = new THREE.Color();
       function fill(mesh, list, place) {
         for (var j = 0; j < list.length; j++) { place(list[j], j); mesh.setMatrixAt(j, M); }
         mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; group.add(mesh); return mesh;
       }
       var stats = { tiers: 0, buildings: B.length, plazas: plazas.length, parks: parks.length, trees: trees.length, lamps: lamps.length, meshes: 0 };
       [0, 1, 2, 3, 4].forEach(function (type) {
         var list = per[type]; if (!list.length) return;
         var mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 });
         var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
         fill(mesh, list, function (it, j) {
           E.set(0, it.rot, 0); Q.setFromEuler(E); V.set(it.x, it.y, it.z); S.set(it.sx, it.sy, it.sz); M.compose(V, Q, S);
           mesh.setColorAt(j, COL.set(it.gold ? 0x8a6d2f : 0x5a6472)); stats.tiers++;
         });
         if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; stats.meshes++;
       });
       if (plazas.length) {
         var pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 20), new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0x3d4450 }), plazas.length);
         fill(pm, plazas, function (p) { var x = p.x_m * U, z = -p.y_m * U, r = Math.min(p.w_m, p.d_m) * 0.5 * U; E.set(0, 0, 0); Q.setFromEuler(E); V.set(x, (heightAt ? heightAt(x, z) : 0) + 0.15, z); S.set(r, 0.3, r); M.compose(V, Q, S); }); stats.meshes++;
       }
       if (parks.length) {
         var km = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 1, color: 0x2e4a2a }), parks.length);
         fill(km, parks, function (p) { var x = p.x_m * U, z = -p.y_m * U; E.set(0, (p.rot_deg || 0) * Math.PI / 180, 0); Q.setFromEuler(E); V.set(x, (heightAt ? heightAt(x, z) : 0) + 0.1, z); S.set(p.w_m * U, 0.2, p.d_m * U); M.compose(V, Q, S); }); stats.meshes++;
       }
       if (trees.length) {
         var tm = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 6), new THREE.MeshStandardMaterial({ roughness: 1, color: 0x2f6b33 }), trees.length);
         fill(tm, trees, function (tr) { E.set(0, 0, 0); Q.setFromEuler(E); V.set(tr.x, (heightAt ? heightAt(tr.x, tr.z) : 0) + tr.r * 1.2, tr.z); S.set(tr.r, tr.r, tr.r); M.compose(V, Q, S); }); stats.meshes++;
       }
       if (lamps.length) {
         var lm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, color: 0x222222, emissive: 0xffb84d, emissiveIntensity: 0.7 }), lamps.length);
         fill(lm, lamps, function (l) { var x = l.x_m * U, z = -l.y_m * U; E.set(0, 0, 0); Q.setFromEuler(E); V.set(x, (heightAt ? heightAt(x, z) : 0) + 3 * U * 0.5, z); S.set(0.35, 3 * U, 0.35); M.compose(V, Q, S); }); stats.meshes++;
       }
       scene.add(group);
       return { group: group, stats: stats, dispose: function () { scene.remove(group); } };
     }
     root.buildWorldCityFromPlan = build;
   })(typeof window !== 'undefined' ? window : this);
   ```
2. `node --check public/world-city-build.js` — must print nothing.
3. Wire it into the loader. Open `public/world-main.js`. Search for
   `plan: MAP_V4 ? ['terrain','realm-modules','buildings','canon','city-v3',` and in that
   array insert `'city-plan',` immediately after `'grid-fabric',`.
4. Search for the line `.then(_ldStep('city-v3', function(api){` and insert this new step
   IMMEDIATELY BEFORE that line:
   ```js
    .then(_ldStep('city-plan', function(api){   // GRID CITY FROM PLAN (world-city-build.js): the designed 318-building Grid from grid-city-v4.json, instanced — ?cityplan=1 opt-in until founder-verified, then flip the gate
      if(!api) return api;
      if(!/[?&]cityplan=1\b/.test(location.search)) return api;
      _loadScript('/world-city-build.js?v=1').then(function(){ return fetch('/assets/world/grid-city-v4.json'); }).then(function(r){ return r.json(); }).then(function(plan){
        window.__cityPlan = window.buildWorldCityFromPlan({ THREE: THREE, scene: scene, heightAt: api.heightAt, plan: plan, layout: window.WORLD_LAYOUT });
        if(window.buildWorldCollision && window.WORLD_LAYOUT) window.buildWorldCollision(window.WORLD_LAYOUT);   // same rebuild canon performs after pushing its colliders
        console.log('[city-plan] built', window.__cityPlan && window.__cityPlan.stats);
      }).catch(function(e){ console.warn('[city-plan] failed:', e && e.message); });
      return api;   // never block entry on the city
    }))
   ```
5. (Cosmetic, optional) Search for `'grid-fabric':'Filling the city blocks',` in the LABEL
   map and add `'city-plan':'Raising the Grid city',` after it.
6. `node --check public/world-main.js`, then the build (rule 5).

**Verify:**
- Load `http://localhost:8930/SHADDAI-WORLD-3D.html?cityplan=1`. Console must show
  `[city-plan] built` with stats near: buildings 318, tiers ~1,262, plazas 199, parks 302,
  trees ~5,137, lamps 1,301, meshes ≤ 9.
- In-game: from spawn, the plain inside the rings is now streets of towers/plazas/parks;
  the central 170 m core stays OPEN (the plan has no buildings inside it — first building
  sits at r ≈ 207 m). Walk into a new building: you stop at its wall (collider). If you pass
  through, the `buildWorldCollision` rebuild did not pick up the new records — report that,
  do not hack around it.
- FPS at spawn with `?perf=1`: the city added ≤ 9 draw calls; FPS should be within ~10% of
  the no-flag load. A collapse means something built per-building meshes — check stats.meshes.
- Load WITHOUT `?cityplan=1`: world must be byte-identical to before this fix.

**Why this works.** The plan was always complete — positions, footprints, tier stacks,
accents, plazas, parks, trees, lamps — it simply had no mesh consumer (its only reader
rasterises heights for races). Instancing is what makes 1,262 tiers + 5,137 trees + 1,301
lamps affordable: one unit box, one material, one draw call per tier type, with per-instance
matrix + colour; the whole city costs ≤ 9 draw calls instead of ~8,200 naive ones
(deep-research §5). The transform math is copied from the race raster that already flies
correctly over these same footprints, and colliders reuse canon's proven `rot: 0` AABB path
(expanded by the rotation, so they can be slightly generous but never too small).

**If you did it wrong, it looks like this:**
- City appears mirrored/rotated (buildings on the wrong side, streets crossing the plaza) →
  you flipped a sign: world z is `-y_m * U`, and tier offsets use
  `e = x + ox·c − oy·s`, `nth = y + ox·s + oy·c`. Compare against world-city-heights.js.
- Buildings float or sink → you forgot `heightAt` ground sampling or added tier `z0` twice
  (centre y = ground + (z0 + h/2)·U, exactly as written).
- Double city (two overlapping sets of towers) → you wired world-grid-city-v4.js as well, or
  left `?cityspread=1`-style canon unclipping on. Only ONE consumer may build the plan.
- Trees scattered across the whole map instead of inside parks → the park-local tree
  coordinates assumption is wrong; check `tools/grid-city/grid-city-plan.cjs` for how trees
  are emitted and adjust ONLY the tree transform.

**Done when:** `?cityplan=1` shows the full designed Grid at spawn with ≤ 9 added draw calls
and solid walls; the founder then approves flipping the gate to default-on (delete the
`?cityplan=1` test line) as a separate one-line change.

---

## FIX 7 — Dismount teleport: you reappear where you mounted

**What you are fixing.** The player controller keeps its own internal position. While you
ride, the controller is off, so its position freezes at the mount point. The pointer-locked
movement branch resyncs it when it diverges — but the unlocked (cursor-mode) branch never
does, so after a cursor-mode dismount it stamps the frozen mount-point position back into
`playerPos` every frame and you teleport back. All four dismount functions themselves are
correct; do not touch them.

**Blender needed? NO.**

**Files:** `public/world-main.js` (one spot). Do NOT edit world-mount-ride.js,
world-dragon-ride.js, world-hoverboard.js, world-actions.js for this fix.

### Steps
1. Open `public/world-main.js`. Search for `_pctlOn && _pctlWasOn`.
   **STOP check:** it appears in TWO places (locked branch ~L6035, unlocked branch ~L6112).
   If the SECOND occurrence's block already contains `_pctl.setPos(playerPos.x` BEFORE
   `_pctl.step(`, this fix is done — skip it.
2. Find this exact text (the unlocked branch — it is the occurrence NOT preceded within a
   few lines by `else { // pointer unlocked` … it IS the one inside that else; the locked
   branch's version already contains a `_pctl.setPos` resync — leave that one alone):
   ```js
   if (_pctlOn && _pctlWasOn) { _pctlOut = _pctl.step(dt, {}, Math.atan2(fwd.x, fwd.z)); playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z); _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z; }
   ```
   How to be sure you have the right one: search for the string `_pctlWasOn) { _pctlOut`
   — it occurs exactly once (the locked branch reads `_pctlWasOn) _pctl.setPos(...)` first).
3. Replace it with:
   ```js
   if (_pctlOn && _pctlWasOn) { const _cp2 = _pctl.getPos(); if (Math.abs(playerPos.x - _cp2.x) + Math.abs(playerPos.z - _cp2.z) > 1e-3) _pctl.setPos(playerPos.x, playerPos.y, playerPos.z); _pctlOut = _pctl.step(dt, {}, Math.atan2(fwd.x, fwd.z)); playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z); _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z; }   /* FIX 7: mirror the locked branch's divergence resync — without it, a cursor-mode dismount (or Navi MAP travel, or any unlocked teleport) leaves _pctl.pos frozen at the mount point and this line stamps it back into playerPos every frame */
   ```
4. `node --check public/world-main.js`, then the build (rule 5).

**Verify:** in-game WITHOUT pointer lock (cursor mode): mount the hoverboard or a mount,
ride at least 100 m, dismount. Expected: you stay where you dismounted and can walk away.
Repeat via dragon dismount. Also test Navi → MAP travel in cursor mode: you arrive and stay.

**Why this works.** There is exactly one stale variable (`_pctl`'s internal `pos`) and
exactly two branches that consume it. The locked branch already demonstrates the correct
pattern — compare positions, resync on divergence > 1e-3 before stepping. The fix copies
that proven guard into the branch that lacked it, so ANY external position change (dismount,
MAP travel, the U-key station teleport) is adopted by the controller on the next frame
instead of being overwritten by it.

**If you did it wrong, it looks like this:**
- Teleport still happens in cursor mode but pointer-lock play is fine → you edited the
  LOCKED branch (which already had the resync) and left the unlocked one. Diff against backup.
- Player vibrates/slides after every teleport → your threshold is 0 or you resync AFTER
  `step()` instead of before. Order matters: getPos → maybe setPos → step.

**Done when:** cursor-mode dismount and MAP travel leave you where you land.

---

## FIX 8 — Respawn in the sky (and the Bazaar spot that never resolves)

**What you are fixing.** Respawn spots store only `{x, z}` — no height exists anywhere in
the data model — and `respawn()` keeps whatever Y you died with, so dying at altitude drops
you over the respawn point still at altitude. Also the `bazaar()` spot lookup asks for a
station id `bazaar` that does not exist in world-layout.js, so it always falls back to a
hardcoded [-100, 100]. You sample the terrain height at respawn time and add the missing
station.

**Blender needed? NO.**

**Files:** `public/world-survival.js`, `public/world-layout.js`, `public/world-main.js`

### Steps
1. Open `public/world-survival.js`. Search for `if (s.y!= null) p.y = s.y;`. Find this exact
   text (inside `respawn()`):
   ```js
   var s = active(), p = pp(); if (!p) return; p.x = s.x; p.z = s.z; if (s.y!= null) p.y = s.y;
   ```
   Replace it with:
   ```js
   var s = active(), p = pp(); if (!p) return; p.x = s.x; p.z = s.z;
   var gy = null; try { var T = window.__w3dDebug && window.__w3dDebug.terrain; if (T && T.heightAt) gy = T.heightAt(s.x, s.z); } catch (e) { }
   if (s.y != null) p.y = s.y; else if (gy != null && isFinite(gy)) p.y = gy + 2;   /* FIX 8: spots carry no Y (data model is {id,kind,name,x,z}); sample the terrain so respawn lands ON the ground (+2 u ≈ 0.5 m, the controller's ground snap settles the rest) instead of keeping the death altitude */
   ```
2. `node --check public/world-survival.js`.
3. Open `public/world-layout.js`. Search for `id: 'central'`. Find this exact text:
   ```js
   { id: 'central',    name: 'Central Station',        pos: [0, 700],         realm: 'grid',       dragon: null },
   ```
   Add this line immediately AFTER it:
   ```js
   { id: 'bazaar',     name: 'Shaddai City Bazaar',    pos: [-100, 100],      realm: 'grid',       dragon: null },   // FIX 8: world-survival's bazaar() spot looks up id 'bazaar' — it never existed, so it always fell back to a hardcoded [-100, 100]; this is that same spot (BAZAAR.pos in world-main) as real data
   ```
4. `node --check public/world-layout.js`.
5. The dragon-death fallback in world-main.js has the same missing-Y bug. Search for
   `WORLD_LAYOUT.stations[0].pos`. Find this exact text:
   ```js
   const c = window.WORLD_LAYOUT.stations[0].pos; playerPos.x = c[0]; playerPos.z = c[1];
   ```
   Replace it with:
   ```js
   const c = window.WORLD_LAYOUT.stations[0].pos; playerPos.x = c[0]; playerPos.z = c[1]; if (worldTerrain && worldTerrain.heightAt) playerPos.y = worldTerrain.heightAt(c[0], c[1]) + 2;   /* FIX 8: same missing-Y bug as world-survival respawn() */
   ```
6. `node --check public/world-main.js`, then the build (rule 5).

**Verify:** in-game: fly up on a dragon or board, take fatal damage (or jump from height
with low HP). Expected: after the 1.8 s fade you respawn standing ON the plaza/spot ground —
not falling from the sky. Repeat after setting a custom respawn spot in Navi → Plots at a
hilly location: you land on that ground.

**Why this works.** The height information was never missing from the world — the terrain
heightfield is the single ground truth and is already exposed to this module's host
(`window.__w3dDebug.terrain.heightAt`, the same object `pp()` already reads `playerPos`
from). Sampling it at respawn time works for every spot — built-in, custom, and future —
without changing the saved-spot data format, so old saved spots in `localStorage shd_spots_v1`
keep working. The +2 u offset plus the controller's per-frame ground snap guarantees you
land on, never under, a slope.

**If you did it wrong, it looks like this:**
- Respawn now puts you UNDER the ground / falling through → your `heightAt` returned the
  water/void value because you sampled before terrain was ready or used `terrainV4` raw
  (which needs its `ready` promise). The `__w3dDebug.terrain` proxy handles readiness;
  the try/catch + `isFinite` guard must stay.
- Bazaar spot teleports somewhere new and wrong → you "fixed" the fallback coordinates
  instead of adding the station. The station pos must be [-100, 100] (x, z) — the place the
  fallback already sent people, now as data.

**Done when:** every death respawns you standing on the ground at the active spot.

---

## MOBILE CUT 1 — Move the dressing GLB wave behind spawn (phones)

**What you are fixing.** On phones, four realm-dressing builders (transit kit, realm kits,
townsfolk, realm dress) start during initial load and their GLBs are still parsing when the
warm-up step force-uploads ~75 MB of terrain textures — the superposition peak that kills
the Safari tab. On mobile only, you defer those four builders into the existing
post-spawn pass that already runs after entry.

**Blender needed? NO.**

**Files:** `public/world-main.js`

### Steps
1. Search for `__buildRealmModules`. Find these four exact lines (consecutive):
   ```js
   if (window.WorldTransitKit) window.WorldTransitKit.dress({ THREE, GLTFLoader, scene, layout: L, transit: T });
   if (window.WorldRealmKits) window.WorldRealmKits.build({ THREE, GLTFLoader, scene, layout: L, heightAt: _rmH });
   if (window.buildWorldTownsfolk) window.buildWorldTownsfolk({ THREE, GLTFLoader, scene, layout: L, heightAt: _rmH, cloneSkinned, agentBodyLoader });
   if (window.WorldRealmDress) window.WorldRealmDress.build({ THREE, GLTFLoader, scene, layout: L, transit: T });
   ```
2. Replace them with:
   ```js
   var _dress = function () {
     if (window.WorldTransitKit) window.WorldTransitKit.dress({ THREE, GLTFLoader, scene, layout: L, transit: T });
     if (window.WorldRealmKits) window.WorldRealmKits.build({ THREE, GLTFLoader, scene, layout: L, heightAt: _rmH });
     if (window.buildWorldTownsfolk) window.buildWorldTownsfolk({ THREE, GLTFLoader, scene, layout: L, heightAt: _rmH, cloneSkinned, agentBodyLoader });
     if (window.WorldRealmDress) window.WorldRealmDress.build({ THREE, GLTFLoader, scene, layout: L, transit: T });
   };
   if (_MOBILE_LITE) window.__mobileDress = _dress; else _dress();   /* MOBILE CUT 1: on phones the dressing GLB wave moves behind spawn (drained in _afterSpawn) so it stops overlapping the warm-up texture upload — the superposition peak that kills the tab. Desktop runs it here, unchanged. ?mobilelite=0 restores the old timing. */
   ```
3. Now drain it post-spawn. Search for `if(window.WorldBiomeScatter) window.WorldBiomeScatter.build({`
   (inside the `_afterSpawn` function). Insert this line IMMEDIATELY BEFORE it:
   ```js
   if (window.__mobileDress) { try { window.__mobileDress(); } catch (e) { console.warn('[mobile] deferred dressing failed:', e && e.message); } window.__mobileDress = null; }
   ```
4. `node --check public/world-main.js`, then the build (rule 5).

**Verify:**
- Phone (or desktop browser with a phone-sized viewport + touch emulation — note
  `_MOBILE_LITE` keys off the real mobile probe, so a real phone is the true test): the
  world ENTERS; station towns/NPCs/dressing pop in over the following seconds instead of
  blocking entry. Safari tab survives entry (the pass-1 crash was at this overlap).
- Desktop: dressing is present at entry exactly as before; `window.__mobileDress` is
  `undefined` in console.
- With `?mobilelite=0` on a phone: old timing restored (dressing during load).

**Why this works.** Nothing is removed — the same four builders run with the same arguments.
Only their START moves: on mobile they begin after the player is in-world (the `_afterSpawn`
pass already waits for avatar + heightmap readiness and runs ~1 s after spawn), so GLB
parsing no longer overlaps the warm-up's texture-upload peak. Peak memory is the sum of
simultaneous allocations; serialising the two biggest ones is what keeps the tab under the
kill line (the exact iOS limit is unpublished — see deep-research §6; treat it as a working
budget, not a spec [WEB]).

**If you did it wrong, it looks like this:**
- Station towns NEVER appear on phones → the drain line is missing, misplaced (it must be
  inside `_afterSpawn`, after its readiness gate), or `__mobileDress` was nulled before the
  call. Check console for `[mobile] deferred dressing failed`.
- Desktop lost its dressing → you replaced the four lines with the deferral unconditionally.
  The `else _dress();` half must exist.

**Done when:** phones enter with dressing streaming in after spawn; desktop unchanged.

---

## MOBILE CUT 2 — Mobile warm-up: 6 s cap + skip the two force-upload renders (+ water rider)

**What you are fixing.** The mobile warm-up still races `compileAsync` against a 30 s cap
and then does two full composer renders whose only job is force-uploading every texture —
on a phone that upload burst is the second half of the kill peak. On mobile only: cap the
compile at 6 s, skip the two renders (textures then upload lazily as things first appear —
the same lazy path `bgCompile` already covers for programs), and halve the ocean depth bake.

**Blender needed? NO.**

**Files:** `public/world-main.js`

> If Fix 3 already changed the default cap to 6000 for everyone, step 1 is a no-op — check
> the STOP guard and move to step 2.

### Steps
1. Search for `warmcap`. **STOP check:** if the line already contains `_MOBILE_LITE`, Cut 2
   step 1 is done. Otherwise find this exact text:
   ```js
   var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : (/[?&]precompile=0\b/.test(location.search) ? 6000 : 30000);   // ?warmcap=ms overrides the cap (measurement)
   ```
   Replace it with:
   ```js
   var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : ((/[?&]precompile=0\b/.test(location.search) || _MOBILE_LITE) ? 6000 : 30000);   // ?warmcap=ms overrides the cap (measurement) // MOBILE CUT 2: phones get the proven 6 s cap
   ```
2. Search for `_introWarming = true;`. Find this exact text:
   ```js
        _introWarming = true;   // animate() does quiet composer renders behind the screen (GPU uploads happen now, not on reveal)
   ```
   Insert this line IMMEDIATELY BEFORE it:
   ```js
        if (_MOBILE_LITE) { _ldEnd('warm'); set(100); try { if (window.__liteSlides) window.__liteSlides.stop(); } catch (_) { } setTimeout(function () { window.__loadPlayable = true; document.getElementById('enterBtn').click(); }, 350); return; }   /* MOBILE CUT 2: skip the two force-upload renders on phones — textures upload lazily on first sight instead of in one ~75 MB burst at the memory peak */
   ```
3. Rider — ocean depth bake. Search for `buildWorldWater({ THREE, scene, camera, renderer, sun, heightAt: api.heightAt, bodies })`.
   Find this exact text:
   ```js
   const wapi = window.buildWorldWater({ THREE, scene, camera, renderer, sun, heightAt: api.heightAt, bodies });
   ```
   Replace it with:
   ```js
   const wapi = window.buildWorldWater({ THREE, scene, camera, renderer, sun, heightAt: api.heightAt, bodies, depthRes: _MOBILE_LITE ? 512 : 1024 });   // MOBILE CUT 2 rider: ocean depth bake 1024 -> 512 on phones (world-water caps res at opts.depthRes); desktop value unchanged
   ```
4. `node --check public/world-main.js`, then the build (rule 5).

**Verify:**
- Phone: loader reaches 100% and enters within ~6–8 s of the warm step starting; tab
  survives. Brief texture pop-in during the first seconds in-world is EXPECTED (lazy upload)
  and far better than a dead tab.
- Desktop: warm-up behaviour byte-identical (30 s cap path, both renders run,
  `depthRes` resolves to 1024).
- `?mobilelite=0` on a phone: old behaviour fully restored.

**Why this works.** The two intro renders don't draw anything the player sees — they exist
to pay the texture-upload cost early, behind the loading screen (research: `compileAsync`
compiles programs but does NOT upload textures [WEB, report §4] — these renders are the
upload step). On desktop that pre-payment is good. On a phone it concentrates ~75 MB of
uploads into the same seconds as peak JS/GLB work; spreading the uploads across first-sight
frames trades a few pop-ins for a survivable peak. The 6 s cap is the value the
`?precompile=0` path already proved.

**If you did it wrong, it looks like this:**
- Phone enters but the world is permanently blurry/textureless → the `return` landed in the
  wrong promise branch and skipped the loader finish entirely, or `bgCompile` was disabled
  (`?bgcompile=0`). The inserted line must sit inside the `.then` right before
  `_introWarming = true;`, exactly as written.
- Desktop warm-up got faster/shorter too → you edited the shared default instead of the
  `_MOBILE_LITE` condition. Restore the ternary shape.

**Done when:** phones enter in seconds and survive; desktop warm-up unchanged.

---

## P1 TASKS (smaller, still foolproof — do after the P0s)

### P1-1 — Shop hangs on "Loading the shelves…"
**What:** the dashboard shop fills only after two API calls resolve; there is no timeout, so
a hung request hangs the shelf forever, even though an offline render branch already exists.
**Blender: NO.** **File:** `public/shd-hub.js`.
Steps:
1. Search for `Loading the shelves`. Find:
   ```js
   sc.appendChild(el('div', 'note', 'Loading the shelves…'));
   Promise.all([api('GET', '/api/economy/catalog'), api('GET', '/api/economy/balance?' + meQS())]).then(function (rs) { sc._items = rs[0].items || []; sc._bal = rs[1].balance; sc._offline = !rs[1].ok; render(); })
   ```
2. Replace the `Promise.all(...)` line's start so a 10 s timeout routes into the existing
   offline state: wrap as
   `Promise.race([Promise.all([...same calls...]), new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('shop-timeout')); }, 10000); })]).then(...same...).catch(function(){ sc._offline = true; sc._items = sc._items || []; render(); })`
   — copy the existing `.then` body verbatim; only the wrapper changes. [VERIFY the exact
   tail of the existing chain (`.catch` may already exist further right on the line) before
   replacing; if a `.catch` exists, add only the `Promise.race` wrapper.]
3. Verify: block `/api/economy/*` in devtools and open the shop → within 10 s it shows
   "The shop can't be reached right now." instead of spinning forever.

### P1-2 — Dead load: world-vehicles.js factory has no caller
**What:** world-main.js dynamically loads `world-vehicles.js`, but `buildWorldVehicles` has
no caller anywhere in the client (systems inventory, FACT) — pure dead load weight.
**Blender: NO.** **File:** `public/world-main.js`.
Steps: search for `world-vehicles` in world-main.js; [VERIFY the exact load line]; either
delete that load entry or leave it and report — do NOT invent a caller (the rideables system
already covers craft). Verify: world loads identically; one fewer script request.

### P1-3 — Sticky dragon boss bar
**What:** the boss HP bar (world-hud-v4.js, `.hv-boss` element) can stay visible after the
fight ends (video V14 tail). **Blender: NO.** **File:** `public/world-hud-v4.js`.
Steps: [VERIFY first] — search the file for `hv-boss` and for where the `on` class is
added/removed and what dragon-status source drives it; the fix is to ensure the bar's `on`
class is removed when the tracked dragon dies, despawns, or the player leaves its zone.
Do not restructure the HUD; change only the stale-clear path you actually found, and say in
your report which trigger was missing. Verify: kill or out-range a dragon → bar fades within
a second.

### P1-4 — Terrain black patches / slope stretch [DIAGNOSIS-FIRST, no blind edits]
**What:** videos show black patches and stretched textures on slopes. The splat shader is a
custom `onBeforeCompile` patch on MeshStandardMaterial in world-terrain-v4.js.
**Blender: NO.** Steps: (1) reproduce and screenshot; (2) in the shader patch, check the
layer-id/weight source for the black areas (a missing layer reads as black, not white — the
hole data texture defaults to grey (200,200,200), so black ≠ holes); (3) slope stretch is
the known absence of slope-aware/triplanar UVs — that is a shader feature, [WEB: canonical
pattern is an onBeforeCompile splat patch using the r180 `vMapUv` varying — NOT `vUv` — plus
a `customProgramCacheKey`, research report §7] — DESIGN TASK, do not attempt as a small
model. Report findings; change nothing without a named cause.

### P1-5 — Interiors render as black voids [DIAGNOSIS-FIRST]
**What:** the v1 council interiors (Library, Navigator Core) render as black rooms with
floating UI cards, while the hall GLB shells exist for all 7 agents
(`public/assets/kits/shaddai_hall_<code>_v01.glb` — verified on disk) and the K14 staff bots
load fine. **Blender: NO.** **Files:** `public/world-interiors.js` (3,631 lines — search,
don't read whole). Steps: (1) enter the Library with `?perf=1`; check console for interior
errors; (2) search world-interiors.js for the room light/environment setup and the hall GLB
load callback — determine whether the shell loads but lights/env don't, or the load itself
fails silently; (3) apply the Fix 2B emissive clamp to the resident display body once found
(see Fix 2B's [VERIFY] note); (4) report the named cause before changing lighting values.
Do NOT raise global ambient light to "fix" it — that washes out the whole world.

### P1-6 — Giant-scale models audit
**What:** a few props/creatures render at giant scale (videos). Every rig checked so far was
clean in-file; the explosions were clone/material bugs, so audit before touching any GLB.
**Blender: NO unless** a specific file's own armature scale proves wrong in
`tools/ual/inspect-glb.mjs` output — only then is it a re-export (Blender YES for that one
file). Steps: for each giant model in the videos, find its loader, check whether the path
applies a Box3 height fit (the pattern in world-interior-agents.js `fit()`:
measure → `grp.scale.setScalar(target / size.y)`); loaders WITHOUT a fit get one, copied
from that pattern. [VERIFY per loader — do not bulk-edit.]

### P1-7 — Location label overlap
**What:** zone labels stack on top of each other at district borders (V15). The label layer
is world-main.js's `labelLayer` (agent/place labels projected per frame). [VERIFY which
producer emits the overlapping zone labels before editing.] The safe pattern, once found:
in the projection loop, skip a label if another visible label is within ~40 px screen
distance, or offset by label index. **Blender: NO.**

### P1-8 — Vehicles and camera don't collide with buildings [DESIGN TASK]
On-foot collision exists (world-collision.js colliders + the controller's groundQuery).
Vehicles/boards/dragons pass through buildings (V12) and the camera clips into walls
(V7/V10/V15) — the inventory confirms no vehicle-collider or camera-collision code exists.
Vehicle fix pattern: sample the same collider set the controller uses for the vehicle's next
position and clamp/slide. Camera fix pattern: raycast from head to desired camera position
against colliders, pull the camera in. Both are new-system builds — spec them, don't
improvise them inside other fixes. **Blender: NO.**

---

## WHAT'S MISSING — the realm as one coherent world

Full evidence: `REALM_SYSTEMS_INVENTORY.md` (same folder) and
[FIX_GUIDE_DEEP_RESEARCH.md](FIX_GUIDE_DEEP_RESEARCH.md). Census headline: of 180
`world-*.js` modules, **156 LIVE / 11 PARTIAL / 7 ORPHANED / 6 SUPERSEDED** — the realm is
not short of systems; it is short of finish. The gaps that matter:

1. **City mesh builder** — Fix 6. The plan (318 buildings / 199 plazas / 302 parks / 1,301
   lamps) had exactly one consumer (a race raster). Sibling data `grid-commons-v4.json`
   (1,863 items) has ZERO client references at all — same new-consumer pattern applies
   (phase 2 of Fix 6, founder decision).
2. **Visible multiplayer co-presence** — backend half-built: `/api/mp` is a poll relay;
   world-navi-chat.js already POSTs your position every 2.5 s and the sync response RETURNS
   the other players' positions — but no client code renders another player (no avatar, no
   name tag, not even a map dot). Missing piece is one client renderer: per remote id, spawn
   a capsule/agent clone + name sprite, lerp toward the latest reported position. (If
   presence is ever rebuilt properly, the research report §6 [WEB] rates Colyseus rooms +
   schema sync as the best three.js fit — but the poll relay already works; render first.)
3. **Plots on the rings** — careful, two different features share the name (backend map
   §2.3): CITY DEED plots render client-side from the static `plots-v4.json` and their claim
   is NOT wired to any backend ("claim soon (MCP-only today)" — world-city-actions.js's own
   header; backend task G-7 in the Backend section below). PORTAL plots (`/api/portal-plots`)
   are server-backed but are a different feature. The city plots also sit ~1 km out with
   nothing standing on them; the founder layout wants rings around the plaza:
   re-seat/mirror plot rings onto the sacred radii [60, 130, 200, 260] — a data/layout
   task after Fix 6 decides the centre.
4. **The pond** — the ONE genuinely new build in the founder's layout. No pond exists in
   layout or terrain data (water today: 1 ocean + 4 rivers + 5 lakes, none central).
   **Blender: YES** (heightmap carve + terrain.json regen in the terrain pipeline), or a
   placed water body as an interim [INFERENCE — founder decides]. Not a small-model task.
5. **Persistence stops at the wallet — and the wallet evaporates** — server-side today:
   Sparks, deeds, portal-plot claims, academy. Everything else (inventory, gear, mounts,
   quests, farm, editor placements — 69+ localStorage keys) is per-browser, and there is
   NO position persistence: every session restarts at spawn. Worse (backend map G-14):
   `backend/data/` lives on Render free's EPHEMERAL filesystem — every balance, deed,
   listing and save REVERTS to the git-committed JSON on redeploy. Durable persistence is
   a LAUNCH BLOCKER and a founder infra decision (persistent disk / the already-coded
   Postgres path / Firestore mirror). See the Backend section.
6. **Audio is all synthesized** — zero audio files exist in the repo; ambience/SFX/music are
   Web Audio synthesis (works, gesture-gated, not a load cost). The gap is content: the
   Lounge's default playlist is 16 SoundHelix demo MP3s wearing fictional in-world titles —
   the founder's own music (IzzoSOL) is not wired into `/api/lounge/tracks`. Content task,
   no realm code.
7. **Orphaned finished systems** (all rules-complete, no consumer): world-weapons.js
   (7 procedural weapons, attach API ready — needs one visual bone check, then wire behind
   default-off flag), world-combat-core.js (deterministic combat — wire behind `?combat=1`),
   world-fishing.js (needs a rod/water interaction), world-castle-siege.js (needs an event
   driver), world-agent-gear.js (needs a loadout data source first). world-grid-city-v4.js
   and world-siege.js stay unwired permanently (superseded / 2D).
8. **A real map** — the Help Desk/Navi map draws only the 7 sectors. After Fix 6, the data
   to draw stations, districts, buildings and (once presence renders) other players all
   exists; the map layer is a small follow-on.
9. **Texture compression** — no KTX2 anywhere; every texture decodes to full RGBA in VRAM.
   The phased migration is deep-research §4 — deliberately LAST in the sequence.

**Founder layout scorecard** (his words, 2026-11-12): central circle ✅ exists ·
rings of plots 🟡 exist but ~1 km out, nothing built on them · buildings ❌ → Fix 6 ·
the pond ❌ genuinely new (Blender) · water round the edge ✅ exists (v4 island ocean).

---

## BRING-IT-TOGETHER SEQUENCE

Do these in order. Each step's verification depends on the ones before it.

1. **Bodies + load** — Fix 1 (skinning + dedupe), Fix 2A (ZEROX/VILLAIN WebP), Fix 2B
   (emissive clamp), Fix 3 (warm-up cap + 404 chain), Mobile Cuts 1+2. *Why first:* nothing
   else is testable while the player explodes, bodies glow, entry hangs, and phones die.
2. **Interaction correctness** — Fix 7 (dismount), Fix 8 (respawn Y), Fix 4A/4B (Navi),
   P1-1 (shop timeout). *Why:* cheap one-spot fixes with proven patterns; they make the
   world feel solid under the founder's re-test.
3. **Sky single owner** — Fix 5 stopgap now; full theme-palette reconciliation as the
   follow-on design task. *Why before the city:* you cannot judge any visual pass under a
   split sky.
4. **City on the founder's layout** — Fix 6 behind `?cityplan=1` → founder test → flip to
   default; then plots onto the rings, the Help Desk map data, and the grid-commons
   decision. *Why here:* it depends on the load budget (step 1) and the sky (step 3), and
   everything after collides with, navigates by, or stands in this city.
5. **Interiors** — P1-5 diagnosis → v1 room completion + resident-display clamp.
   *Why here:* needs bodies/materials (step 1) correct first.
6. **Collision + HUD hygiene** — P1-8 (vehicles, camera), P1-3 (boss bar), P1-7 (labels).
   *Why here:* polish layer — only meaningful once the geometry (step 4) exists to hit.
7. **Presence + persistence** — render remote players from the existing `/api/mp` relay;
   position persistence; server-backed inventory later. *Why here:* a shared world matters
   once the world is worth sharing.
8. **Orphans behind flags, one at a time with playtests** — weapons (`?weapons=1` visual
   bone check first) → agent-gear (after a loadout source exists) → combat-core
   (`?combat=1`) → fishing interaction → castle-siege driver. *Why last among features:*
   each is finished rules waiting for the finished world from steps 1–6.
9. **The pond + the music** — pond (Blender terrain task, founder-scheduled) and IzzoSOL
   into the Lounge feed. *Why:* the only genuinely new content; everything else was wiring.
10. **KTX2 texture migration** (deep-research §4, phased, fallbacks kept). *Why last:* it
    multiplies every earlier win but touches every loader — only safe once the load path is
    stable and proven.

*Guide compiled 2026-11-15 from the four diagnosis docs, the systems inventory, the
three.js r180 research report, and direct reads of the live branch
`realm-fix-for-main-2026-11-15` (= GitHub main 207d30a). Snippets marked [VERIFY] or [WEB]
were not re-verified against the repo in this pass — treat them accordingly.*

---

## BACKEND CONNECTION SECTION — the realm's other half

Full evidence: `BACKEND_CONNECTION_MAP.md` (same folder) + `audit-parts/ENDPOINT_CENSUS.md`,
`audit-parts/FRONTEND_CALL_MAP.md`, `audit-parts/DATA_AUTH_DEPLOY.md`. This section
summarises and turns the sized items into tasks; it does not duplicate the census.

**The one-paragraph truth:** the backend is mostly built and mostly mounted (~442 routes).
The realm feels disconnected for four precise reasons: (1) the frontend's money identity
defaults to the hardcoded string `'guest'` and is never merged with the real session;
(2) finished backend pieces are never called (`/api/world/saves`) or never mounted
(`home-routes.js`); (3) there are TWO currencies (Sparks vs SHAD-Credits) with a third,
incompatible writer colliding on the same ledger file, and the bridge is off; (4) nothing
persists across a Render redeploy.

> 🚨 **LAUNCH BLOCKER — G-14 (founder infra decision, NOT a coding task):**
> `backend/data/` sits on Render free's ephemeral filesystem. Every balance, deed,
> listing and save REVERTS to the git-committed JSON on redeploy. Options, in the map:
> (a) Render persistent disk (plan change — free tier has none), (b) the Postgres path
> economy-service already supports (`DATABASE_URL`, currently unset), (c) extend the
> Firestore mirror pattern achievements/battle-results already use. **Until the founder
> picks one, every item below is building on sand.** Flag it; do not choose for him.

> ⚠️ **ORDERING WARNING (money safety):** do G-5 (bazaar auth) BEFORE G-4 (currency
> unification), and NEVER set `X402_SPARKS_BRIDGE=true` before the identity fix (G-2/G-5)
> lands — the bridge would convert the SHAD-Credit spoof (bazaar charges any body-supplied
> `buyer`, and every new user string gets +100 free credits) into a direct Sparks drain.

> ⚠️ **DEAD CODE — DO NOT "FIX":** `backend/server-production.js:850` calls
> `economy-service.getInstance()` — that export does not exist (the module exports
> `getDefault`), so the call site is dead. It currently also neutralises a raw `x-user-id`
> spend path that would otherwise be unsafe. Leave it alone; note it in reports only.

### S tasks (one sitting each — do these first)

**G-2 — One identity for money (frontend, S).**
`window.SHADDAI_USER` is set to `'guest'` (SHADDAI-WORLD-3D.html bootstrap) and to `'owner'`
(world-main.js, ~L4551 per backend map §4.1); the HTML value wins, so EVERY visitor shares
the literal identity `'guest'` for bazaar/x402/games calls, while the real session id sits
unused in `localStorage shd_userid`.
Steps: (1) In `public/SHADDAI-WORLD-3D.html`, search for `SHADDAI_USER` and immediately
after the existing assignment add:
`window.SHADDAI_USER = localStorage.getItem('shd_userid') || window.SHADDAI_USER;`
(2) In `public/world-main.js`, search for the `'owner'` assignment to `SHADDAI_USER` and
replace the value with the same expression
(`localStorage.getItem('shd_userid') || window.SHADDAI_USER || 'guest'`).
(3) Build (rule 5). Verify: signed-in session → a bazaar buy's request body shows the real
uid, not `"guest"`; a guest session still works (local wallet mode).

**G-3 — Mount home-routes.js (backend, S — one line).**
`backend/home-routes.js` is complete and tested, but never mounted, so ALL of `/api/home/*`
is 404 and the city-actions home panel (which calls `GET /api/home/status`) is dead.
Steps: (1) Open `backend/home-service.test.js` (~L251) and confirm how the factory is
constructed there (`require('./home-routes')(svc)`). (2) In `backend/server-production.js`,
near the other realm mounts (~L2180, beside home-deeds), add the mount in the same style,
e.g. `app.use('/api/home', softAuth, require('./home-routes')());` — adjusting the factory
argument to match what the test showed. (3) `node --check backend/server-production.js`.
Verify: restart locally → `GET /api/home/status?user=<uid>` returns 200 JSON, not 404.

**G-12 — Games-score identity (backend, S).** `POST /api/games/score` grants 5 Sparks
units/day to any named body `user` — unauthenticated. Apply the G-5 rule: derive the user
from the session (softAuth), keep the daily cap, change no shapes. Verify: a forged-user
score post grants nothing.

**G-9 — Skate leaderboard (backend, S).** The frontend comment promises
`POST /api/skate/score`; no handler exists. Mirror the games-routes pattern:
`POST /api/skate/score {user, score, tier}` → append to `data/skate-scores.json`;
`GET /api/skate/leaderboard` → top 50 `{user, score, tier, ts}`. NO unauthenticated Sparks
grant attached. Verify: post a score → it appears in the leaderboard and survives a restart.

**G-10 — Lounge tracks (S).** `world-lounge.js` describes
`GET /api/lounge/tracks → [{title, artist, url}]`; no handler exists (the default playlist
is hardcoded SoundHelix demos). FIRST check whether the existing `/api/radio/*` catalog
shape fits; only if it doesn't, add `GET /api/lounge/tracks` reading
`data/lounge-tracks.json`, response exactly `[{title, artist, url}]`. Verify: lounge lists
endpoint tracks with the local fallback disabled. (This is also where the founder's own
IzzoSOL catalogue eventually lands — content, via the JSON, not code.)

**Cache headers (backend, S).** Static serving today (backend map §6): hashed dist bundles
are immutable for a year, but `assets/**` gets only `max-age=86400` (one day, explicitly
not immutable) and `.bin` (the 8 MB terrain heightmap) gets NO explicit policy — repeat
visits re-download the 584 MB tree's hot files. Because the realm already version-busts
with `?v=`, a long policy is safe. Steps: (1) In `backend/server-production.js`, find the
`express.static` `setHeaders` block (~L513–535) and READ it first [VERIFY the literal
code — the map quotes behaviour, not the text]. (2) Raise the asset-extension branch
(glb/webp/png/jpg/jpeg/avif) to `public, max-age=31536000` and give `.bin` the same.
(3) Do NOT touch the `.html`/`sw.js` no-cache branch or the dist immutable branch.
Verify: `curl -I` a versioned GLB URL → `max-age=31536000`; the HTML still returns no-cache.

**G-11 — Agent-brain config (S, config/docs only).** The brains are connected; the gap is
configuration. Env var NAMES the realm reads (values are NEVER printed or committed):
`GROQ_API_KEY` (primary provider), `OPENROUTER_API_KEY` (fallback), `FIREBASE_SERVICE_ACCOUNT`
(enables token verification + the paid Navi signals tier), `ADMIN_TOKEN`, plus
`HELIUS_API_KEY`/`HELIUS_RPC_URL` (signals), `STRIPE_SECRET_KEY`, `SUNO_API_KEY`, `FAL_KEY`
(optional features). With `REQUIRE_AUTH=false` and no Firebase configured, the paid Navi
tier can never verify anyone — a founder config decision that rides on G-2. No code task.

**G-13 — Settings sync (S, rides on G-1).** Fold `"prefs"` (theme/quality/HUD keys) into
G-1's save payload. No new endpoint. Verify: theme changed on one device appears on the
other after save.

### M tasks (scoped specs — a few files + tests each)

**G-1 — Wire `/api/world/saves` (frontend only, M).** The backend is DONE
(`agent-room-routes.js`: GET/PUT, softAuth, stores `data/world-saves/<uid>.json` as
`{uid, at, save:{…}}`); the frontend never calls it — only 2 test accounts have ever saved.
Build one small frontend module: on identity-ready, every 30 s, and on `beforeunload`,
`PUT /api/world/saves` (header `x-user-id: <shd_userid>` or Bearer `shd_token`) with body
`{save:{"hero":…,"navi":…,"inv":…,"snapshot":…,"prefs":…}}` sourced from the matching
localStorage keys; on load, GET first and hydrate localStorage BEFORE world-main reads it
(load order is the whole task — the module must run before the hero restore timer).
Verify: sign in, change hero, clear localStorage, reload → hero/inventory/prefs restored;
a new file appears in `backend/data/world-saves/`.

**G-5 — Bazaar auth + atomic store (backend, M — BEFORE G-4).** Bazaar routes have no
softAuth; buyer/seller come from the request body; `bazaar.json` is written with plain
non-atomic `writeFileSync`, no lock. Build: mount bazaar with `softAuth` (as home-deeds
is), derive buyer from `req.userId` when authenticated and reject body mismatch, move
writes onto the JsonStore atomic pattern home-deeds uses. Shapes unchanged:
`POST /api/bazaar/buy {id}`, `POST /api/bazaar/list-item {…}`, `DELETE /api/bazaar/:id`.
Verify: forged `buyer` → rejected/ignored; concurrent buys of the last unit → exactly one
succeeds and the file stays valid JSON.

**G-4 — Unify the money onto Sparks (backend, M — AFTER G-5).** Today the Bazaar settles
in SHAD-Credits (`x402-ledger.json`, floats, +100 free on first sight, no lock) while the
HUD wallet is Sparks (`economy.json`, integer units, hardened) — and `lib/x402-ledger.js`
writes an INCOMPATIBLE schema to the same `x402-ledger.json` filename. Build, in order:
(a) bazaar buy path calls economy-service spend/grant (Sparks) instead of paybox-settle,
frontend response shape unchanged; (b) rename `lib/x402-ledger.js`'s file to
`x402-agent-ledger.json` so one writer owns `x402-ledger.json`; (c) only then MAY the
founder consider `X402_SPARKS_BRIDGE=true` for legacy balances. Verify: buy a listing →
`GET /sparks/balance` drops by the price, seller rises by price − 5%, both entries appear
in `spark_transactions[]`, SHAD-Credit balance unchanged.

**G-6 — Render remote players (frontend only, M).** Same task as What's-Missing #2, from
the backend side: `POST /api/mp/sync` already returns
`{ok, online, players:[{id,name,agent,x,y}], chat:[…]}` (note: the client's `y` field
carries world Z) every 2.5 s, and world-navi-chat.js's response handler reads only
`d.chat` — `d.players` is discarded. Build `world-presence.js`: one lightweight avatar per
remote id (capsule + name sprite; hero GLBs are the L upgrade), lerp to the latest
(x, z), remove ids unseen for > 8 s (the server's presence TTL). No backend change.
Verify: two signed-in browsers see each other's avatars moving in the plaza within ~3 s;
closing one removes its avatar within ~10 s. (Later upgrade path [WEB]: the existing WS
relay or Colyseus rooms — spec only, not needed to finish.)

**G-7 — City-deed claim backend (M).** City plots render from static `plots-v4.json`;
claims have no backend at all (portal-plots is a different feature — do not reuse it).
Build `backend/city-deed-routes.js` + `data/city-deeds.json` (JsonStore, copy the
home-deeds pattern): `GET /api/city-deeds` → `{deeds:{<plotId>:{owner, price, at}}}`;
`POST /api/city-deeds/buy {plotId}` (softAuth; economy spend) → `{ok, plotId, owner,
balance}` or 402 `{error:'insufficient_sparks'}`. Frontend: the city-actions claim button
calls buy, then re-renders plot state from GET merged over plots-v4 geometry. Verify: buy
→ deed persists, second buyer gets a conflict error, Sparks drop matches the price.

**G-8 — Dynamic city state (L, DEFERRED).** Fold per-player city edits into G-1's save.
A shared public city state waits until Fix 6's city actually renders — do not spec against
a city that doesn't exist yet.

### Backend acceptance order (from the map, dependency-sorted)
1. **G-14 decision** (founder) — else nothing below survives a deploy.
2. **G-2 + G-3 + G-12** (the S afternoon) — identity real, home panel alive, score grant safe.
3. **G-1 (+ G-13)** — a player's world follows their login.
4. **G-5 → G-4** — auth before unification; never bridge first → one Sparks wallet everywhere.
5. **G-6** (visibly multiplayer), **G-7** (plots ownable), **G-9/G-10** (the two
   comment-promised hooks), **cache headers** any time.
6. **G-8 / G-11 config** when the city wave and identity rollout land.

*Backend section compiled 2026-11-15 from BACKEND_CONNECTION_MAP.md and its audit-parts
(handler-verified by that crew). Line references are that map's; re-check by search before
editing, exactly as with the frontend fixes.*
