# SHADDAI Agent Bodies — Build Spec (v2, "do it right")

Goal: a **phenomenal, consistent base roster** of rigged humanoid agents users pick from in the Forge.
All share the **same proportions, pose, and rig** so animations are interchangeable, the set reads as
one family, and each is portable (standard `.glb`, downloadable, editable in code, movable to any engine).

## Why the old ones failed
Meshy image→3D rebuilds geometry from ONE image. The old inputs were **A-pose with arms near the
body**, so the reconstruction **fused arms/hands to the torso** ("hands tied to body"), and the framing
let proportions drift ("short / misfigured"). Fix = the input image, not the tool.

## The fix — art direction (applied identically to every agent)
1. **Pose: clean symmetric T-pose** — arms straight out horizontally, palms forward, **fingers spread
   with clear gaps between arms and torso** (this is what makes auto-rigging clean — no fused limbs).
2. **Proportions: tall heroic athletic, ~8 heads tall, long legs**, anatomically correct, perfectly
   symmetric (kills "short / misfigured").
3. **Silhouette: fitted / form-hugging, NO loose cloth, capes, or flowing hair** (loose geometry fuses
   in reconstruction). Hair short or tied back.
4. **Camera: front orthographic, full body head-to-toe**, plain solid light-grey background, even studio
   light (consistent reconstruction + consistent family look).
5. **Same framing string for all 8** → "concurrent in build."

## Pipeline (per agent, automated)
HF FLUX (T-pose art, the prompt above) → Meshy **image→3D** (`should_remesh`, `enable_pbr`) →
Meshy **rigging** (`character_height: 1.8`) → **walk + run(sprint)** animation GLBs.
Then `gltf-transform` (resize textures 1024, weld) **without** simplify on rigged/animated meshes.

Output per agent: `<id>.glb` (rigged), `<id>-walk.glb`, `<id>-run.glb` → `public/assets/forge-models/`.

## Animations
- **Now:** idle (bind), **walk**, **run/sprint** (Meshy basic_animations).
- **Later:** jump, punch (needs a shared-skeleton retarget pass, e.g. Mixamo/manual — tracked, not now).

## The 8 base agents (distinct silhouette, identical proportions/pose/rig)
| id | name | build direction | color |
|---|---|---|---|
| vanguard | Vanguard | broad-shouldered armored guardian, heavy fitted plate, helm | cyan |
| ghost | Ghost | lean stealth operative, fitted hooded bodysuit, smooth mask | violet |
| artisan | Artisan | athletic engineer, fitted utility tech-suit, tool harness | teal |
| oracle | Oracle | tall seer in a **fitted** ceremonial bodysuit (no loose robe), circlet | purple |
| street-deity | Street Deity | urban hustler, fitted techwear + gold trim, sleek | gold |
| gaia-link | Gaia-Link | bio-warrior, fitted organic carapace armor, smooth | green |
| psionic | Psionic | psychic, sleek fitted suit with glowing channels | pink |
| harvester | Harvester | dark-ops reaper, fitted tactical armor, hood-down | red |

## Validation gate (credit-smart)
Generate **vanguard first**, review in `/forge-gallery.html` (check: separated arms, correct height,
clean rig, walk/run play). Only batch the other 7 once vanguard passes.
