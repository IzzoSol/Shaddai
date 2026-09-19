# Gotchas already paid for

Every entry below cost real money or real hours on 2026-09-17/18. Read the
matching symptom before you start debugging from scratch.

## Rigging (fal-ai/meshy/rigging)

**1. "Pose estimation failed… must be a humanoid character with clearly
defined limbs."** The reference image pose is wrong, not the model. Arms must
be dead-horizontal at shoulder height with visible background between each hand
and the torso. Killers: a held weapon, arms angled down, long sleeves swallowing
the hands, a cape across the legs. Fix: move props to a back-mount, use short
sleeves on robed characters, regenerate. `forge.mjs` bakes the surviving wording
in — don't paraphrase it.

**2. A timeout is not a pose failure.** `rigging timed out after Nms` just means
slow. Retry the same image. The timeout is already raised to 480s; raise it
further rather than rewriting a prompt that was fine.

**3. Rigging is humanoid-only.** Quadrupeds, mounts and vehicles will not rig.
Owner's standing call: keep them as full-detail static meshes rather than
warping the design into a biped.

**4. "Task is not rigged properly: model file not found"** — a timing race on
the mesh URL. Retry; it has succeeded on the second or third attempt every time.

## Sprite capture (capture-sprites.mjs / sprite-capture.html)

**5. Never set `action.paused = true`.** three.js forces deltaTime to 0 inside
`AnimationAction._update` for paused actions, so `mixer.setTime()` silently
freezes near frame 0 and every captured frame looks identical.

**6. Don't trust the skinned-mesh bounding box for framing.** Meshy's auto-rig
leaves a bind-pose/skin-matrix mismatch, so the CPU-side box doesn't match what
the GPU renders. The rig zooms way out to a safe frame and lets the Node-side
`sharp` trim find the real silhouette from rendered pixels.

**7. Heads getting cropped = `FRAME_HALF` too small.** Taller characters
overflow a frame calibrated for chibi. It is 5.0 now; raise it, don't re-rig.

**8. Crop per clip, not per frame.** Use the union of all frames' trim boxes or
the character jitters against the cell edges.

**9. Orthographic frustum is camera-relative.** left/right/top/bottom are
relative to the camera itself, so the frustum must be symmetric and the camera's
own `y` must equal the world-space vertical center of the shot.

## Weapons and attachment

**10. Compensate for bone scale when parenting.** Bones inherit skeleton scale;
without `compensate = 1 / rightHand.getWorldScale().x` applied to both scale and
offset, the weapon is microscopic or enormous.

**11. Thin blades often come back crumpled from image-to-3D.** A 3/4-angle retry
did not fix it. Procedural geometry (box blade + guard + cylinder grip),
normalized to a 1-unit bounding box, is the reliable path for thin props.

**12. A weapon parented at the hand bone sits *inside* the fist.** It needs a
deliberate outward offset, not just the bone transform.

## Tooling traps

**13. `#loading{display:flex}` beats `[hidden]{display:none}`** on ID
specificity, so `el.hidden = true` never hides the overlay and every screenshot
you take shows the loading screen instead of the bug. Write
`#loading:not([hidden])`.

**14. `git add` with a glob matching zero files aborts the whole call** and
stages nothing, silently. `*.glb`/`*.fbx` are gitignored repo-wide, so assets
need `git add -f`. Verify with `git show --stat HEAD | grep -c "\.glb"` — if it
prints 0, nothing shipped.

**15. A background job reporting "exit code 0" can be lying.** Read the log body
and check output file mtimes. `PIPELINE FAILED: fetch failed` has appeared under
a clean exit code more than once.
