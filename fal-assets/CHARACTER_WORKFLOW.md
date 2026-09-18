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

## Cost
~$0.50-0.65 per character for the 3D step (mesh+rig+animation combined,
one paid call each). The reference image and sprite capture are free/cents.
5 characters, full pipeline, came to roughly $3-4 total.
