# SHADDAI Character Workflow — reference art → rigged 3D + 2D sprites

Validated 2026-09-17 on the 5-character roster (Warrior/Mage/Explorer/Engineer/Scout).
Reuse this exact sequence for any new character, any size/shape/species.

## 1. Reference image (cents, `generate.mjs`)
Write a batch manifest in `fal-assets/batches/<name>-tpose.json`:
- `type: "text2img"`, `register: "cinematic"` (uses the locked SPINE_CINEMATIC palette)
- Prompt MUST force a literal scarecrow T-pose: "both arms locked completely
  straight out horizontally to the sides at shoulder height like a scarecrow,
  elbows straight, both open hands and all fingers clearly visible in empty
  air, nothing held, nothing overlapping the torso or limbs." This is a HARD
  requirement — a combat/weapon-in-hand pose WILL fail rigging (proven twice).
- Run dry (no flag) to sanity-check, then `--go` to spend.
- Visually verify arms are actually separated from the torso before spending
  on the 3D step — cheap regenerations here save an expensive rigging failure.

## 2. Mesh + rig + animation (~$0.50-0.65, `character-pipeline.mjs`)
```
node fal-assets/character-pipeline.mjs <name> fal-assets/spike/<name>-tpose.png [action_id]
```
- Step 1: `fal-ai/hunyuan3d/v2` (textured mesh) from the reference image.
- Step 2: `fal-ai/meshy/rigging` — auto-skeleton + free baked walk+run, plus
  ONE optional extra combat animation via `action_id` (Meshy's animation
  library, e.g. 97=melee slash, 125=spell cast, 224=archery shot, 89=combat
  stance — see https://docs.meshy.ai/en/api/animation-library). Only the
  singular `animation_action_id` param is confirmed working through fal's
  schema; the plural `action_ids` Meshy's own docs mention is unconfirmed.
- Output: `fal-assets/characters/<name>/` (mesh, rigged glb/fbx, walking,
  running, action glb/fbx).

## 3. 2D sprite sheets, free (`capture-sprites.mjs`)
```
node fal-assets/capture-sprites.mjs <name> [framesPerClip=8]
```
Requires the local static server on :8899 serving `fal-assets/` (any simple
Node http server pointed at the fal-assets directory root).
- Headless-renders `fal-assets/spike/sprite-capture.html` via puppeteer,
  scrubbing each clip's timeline and screenshotting frames.
- Pixel-based framing (not 3D math — see gotchas below): renders zoomed way
  out into a safe frame, then `sharp .trim()` finds the real silhouette per
  frame and union-crops across the whole clip so it doesn't jitter.
- Output: `fal-assets/characters/<name>/sprites/` — individual frame PNGs +
  one horizontal strip PNG per clip (walking/running/action).

## Voxel-block style variant (validated 2026-09-18, all 12 characters)
Same pipeline, different reference-art recipe for a chibi voxel-block/toy
look (matches `fal-assets/spike/style-voxel-blocky.png`, and the code-drawn
"voxel" kit in `public/pixel-people.js`: blockier proportions, hard-edged
flat shading, not soft gradients):
- Use `register: "pixel"` in `generate.mjs`, NOT `"cinematic"` — the
  cinematic spine's own strong style language ("museum-grade, volumetric
  god-rays...") overpowers any voxel/blocky wording every time and just
  produces a normal smooth cinematic render instead.
- Prompt language that actually works: "a chibi VOXEL-BLOCK toy figure...
  every part a flat rectangular block with hard 90-degree edges... bold
  thick black outline stroke around every edge and seam... flat
  hard-contrast shading (NOT soft gradients)." Say "toy figure" / "toy
  render" explicitly — it pulls the model away from painterly/cinematic
  defaults more reliably than "voxel" alone.
- Still needs the same strict T-pose forcing as the base recipe. The
  `pixel` register's own tendencies (isometric game-sprite training data)
  make it drift toward action/idle poses more than `cinematic` does —
  expect to need 2-3 pose-correction passes per character, same as before.
- Robed/hooded characters (mage, oracle) are the highest pose-failure risk
  in this style specifically: long sleeves read ambiguously to the pose
  estimator. Fix: explicitly prompt "SHORT sleeves that end well above the
  wrist, leaving the entire forearm/hand visible as its own separate block
  shape" if a hooded/robed voxel character fails rigging.

## Gotchas already paid for — don't rediscover these
1. **Rigging needs a truly clean T-pose.** Arms down, hidden in a cloak, or
   holding anything = high risk of "Pose estimation failed" or a broken skin.
2. **Orthographic camera `top/bottom/left/right` are relative to the camera's
   own position, not absolute world Y.** Center the camera's own Y on your
   subject, don't add world-space offsets to the frustum bounds.
3. **Never set `AnimationAction.paused = true`** when driving time manually
   via `mixer.setTime()` — three.js forces deltaTime to 0 for paused actions,
   silently freezing the pose near frame 0 no matter what time you request.
4. **Don't trust the CPU-side skinned-mesh bounding box** for precise framing
   on these auto-rigged meshes — it can disagree with where the GPU-posed
   mesh actually renders. Pixel-based (`sharp .trim()`) framing sidesteps
   this entirely and is what `capture-sprites.mjs` does.
5. `puppeteer` in this repo needed `npm install --no-save puppeteer-core@25.3.0`
   to actually launch (was present in package tree but broken/missing).
6. **A rigging-step timeout is NOT the same as a pose rejection.** The
   default poll timeout (200s) can be too short when fal's Meshy rigging
   queue is under load — this looks identical to a stuck job but the call
   eventually would have succeeded. Only trust an actual
   `{"msg":"...Pose estimation failed..."}` JSON error as a real pose
   problem; a plain `PIPELINE FAILED: rigging timed out after Xms` should
   just be retried (same image, no changes) before concluding the
   reference art needs fixing. The timeout was raised to 480000ms in
   `character-pipeline.mjs` after repeated false failures.
7. **`*.glb`/`*.fbx` are gitignored repo-wide.** A normal `git add` on
   `fal-assets/characters/` silently commits only the reference PNGs and
   sprite PNGs, not the actual paid 3D assets. Use
   `git add -f fal-assets/characters/**/*.glb fal-assets/characters/**/*.fbx`
   explicitly if these need to be committed. Also: with a wildcard glob like
   that, if ANY part of the glob matches zero files (e.g. no vehicle has an
   `.fbx` since mesh-only vehicles skip rigging), the WHOLE `git add` call
   can silently fail to stage anything, including the parts that did match
   -- always verify with `git show --stat HEAD | grep -c '\.glb'` after
   committing binaries, don't trust the "create mode" list alone.
8. **A background job reporting `[exited with code 0]` doesn't mean the
   pipeline actually succeeded.** A transient `fetch failed` mid-poll can
   kill the script after `PIPELINE FAILED: ...` prints, but the outer
   background-task wrapper still reports exit 0. Always check the actual
   log content for `PIPELINE FAILED` / `RIGGING FAILED`, and verify the
   output files' mtimes actually changed, before trusting a "completed"
   notification when re-running an existing character.

## Cost
~$0.50-0.65 per character for the 3D step (mesh+rig+animation combined,
one paid call each). The reference image and sprite capture are free/cents.
5 characters, full pipeline, came to roughly $3-4 total.
