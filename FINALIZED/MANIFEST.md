# FINALIZED — Model Swap + Combat (cross-reference, do not lose anything)

Single source of truth for the 2026-07-07 agent-body/animation work. Everything below is
**committed to git `main` and in sync with origin** (verified `git rev-list left-right = 0 0`).
Copies of the deliverables are pooled in this FINALIZED/ folder.

## Agent → new body → source (locked mapping)
| Agent | Live file (public/assets/agents/) | Source Meshy model | Status |
|-------|-----------------------------------|--------------------|--------|
| ZEROX | ZEROX.glb (7.5MB) | Emerald Enforcer | ✅ committed, screenshot-verified |
| TURTLE | TURTLE.glb (7.2MB) | Neon Valkyrie | ✅ committed, screenshot-verified |
| ORACLE | ORACLE.glb (7.5MB) | Violet Arcana | ✅ committed |
| PIKADON | PIKADON.glb (8.8MB) | Crimson Hammer Knight | ✅ committed, screenshot-verified |
| VILLAIN | VILLAIN.glb (4.6MB) | Crimson Sentinel (playable, no boss AI) | ✅ committed |
| SHADDAI / NEXUS / QUILL | unchanged (static) | — | intentional (0-bone, VFX attacks only) |

Every body has 7 clips: idle / walk / run / attack1 / attack2 / heavy / flip.

## VFX props (public/assets/vfx/)
| File | Use | Source | Status |
|------|-----|--------|--------|
| oracle-glow.glb (5.3MB) | Oracle glow projectile | Violet Storm Core | ✅ committed |
| shaddai-blast.glb (4.7MB) | SHADDAI energy blast | Solar Tempest | ✅ committed |
| emberblade.glb (0.9MB) | thrown blade | Emberblade | ✅ committed |

## Action thumbnails (public/assets/agents/<CODE>-action.png) — HF FLUX
8 images (ZEROX/ORACLE/TURTLE/PIKADON/SHADDAI/NEXUS/QUILL/VILLAIN). ✅ committed.
Villain char-select uses VILLAIN-action.png. NOT yet wired into dashboard tiles (pending).

## World code changes (public/SHADDAI-WORLD-3D.html) — ✅ committed
- AnimationMixer per rigged body + reusable playAgentAction crossfade
- Player combat: LMB combo, R = signature special + VFX, Q = flip (tween fallback for static)
- Villain in character-select
- FIX: SkeletonUtils.clone + updateMatrixWorld (rigged agents were invisible when played)
- FIX: removed prune/weld (was deforming TURTLE/ZEROX)
- FIX: _spawnBusy scope crash; restored default body; no-cache meta; disabled ambient music

## Deploy assets fix — ✅ committed
- backend/data/forge-art/*.png (92 files) force-committed — was gitignored so Render showed
  emoji fallback on dashboard buttons; now the live site serves real art.

## Scripts (scripts/ + FINALIZED/scripts/)
build-agents.mjs (bake bodies) · build-props.mjs (vfx) · inspect-glb.mjs · gen-character-thumbs.cjs
(HF thumbnails) · check-html-js.mjs (syntax) · verify-world.mjs + deep-diag.mjs + shoot-glb.mjs
(headless verify/screenshot). Public diagnostic viewer: public/_glbcheck.html.

## VERIFIED (evidence, not claims)
- Headless Chrome on :3000: all 4 rigged bodies load with clips, player swap works, 0 errors.
- GLB screenshots: ZEROX/TURTLE/PIKADON clean + textured; SkeletonUtils-clone TURTLE renders.
- Live Render check: ZEROX.glb = 7517KB (new), /world HTML has new code. Render serves the new build.

## ⏳ PENDING (other terminals now done → dashboard is unblocked)
1. Dashboard agent ROOMS: bodies float white/no-texture — needs lights/material + optional idle anim. (index.html)
2. Dashboard: remove duplicate gold SHADDAI intro (codex→dashboard).
3. Wire the 8 -action.png thumbnails into dashboard tiles.
4. On-screen buttons to trigger each agent's attacks/animations.
5. World initial load-speed pass.
6. Codex walkable — Quill's Library + Observatory (SAVE FOR LAST per owner).
7. (Optional) regenerate/refresh HF images.

## ⚠️ Key lesson
Owner views the DEPLOYED Render site (shaddai-g81x.onrender.com), not localhost. Gitignored
assets (GLBs, forge-art) never reach Render → force-commit them. Old service worker cached
stale assets → replaced with kill-switch; clear site data / use incognito to see new builds.
