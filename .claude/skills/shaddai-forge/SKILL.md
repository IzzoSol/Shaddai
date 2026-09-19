---
name: shaddai-forge
description: Use when producing any SHADDAI world asset — characters, mounts, vehicles, buildings, sprites, realm art — or when wiring those assets into the 2D world, the 3D realm, or the SHADDAI games. Routes to the proven forge CLI, the SHADDAI MCP council/RAG tools, and AURA, instead of re-deriving inline fal polling loops.
---

# SHADDAI Forge

The asset pipeline for the SHADDAI world is already built and paid for. This
skill exists so you **call it** instead of rebuilding it. Re-deriving inline
`fetch`/poll loops, re-guessing T-pose wording, and re-discovering the same
rendering bugs is what burns money and tokens.

## The one rule

**Every 3D asset must ship its 2D sprites in the same pass.** The 2D world and
the 3D realm are the same world played two ways — this is a standing owner
requirement, not a nice-to-have. `forge.mjs character` does both by default;
never stop after the rig.

## Commands

All paths are relative to the repo root (`C:\Users\Brittany\Shaddai`).

```bash
# Full character: prompt -> image -> mesh -> rig -> walk/run/action -> 2D sprites
node fal-assets/forge.mjs character <name> --look "<who they are + what they wear>" \
     [--actions 89,178] [--proportions tall|chibi] [--style painted|voxel] [--go]

# Re-capture 2D sprites off an existing rig (FREE — no fal call)
node fal-assets/forge.mjs sprites <name> [frames]

# What exists for a character, including 2D/3D parity
node fal-assets/forge.mjs check <name>
```

`character` is **dry-run by default**: it prints the composed prompt and spends
nothing. Read that prompt, then re-run with `--go` (~$0.60–0.70). You supply
only the *look* — the T-pose wording is locked in the script because every
variation of it we tried failed Meshy's pose estimation and cost a paid mesh.

Non-character 2D art (props, tiles, backgrounds, realm concepts) goes through
the existing batch manifests instead:
`node fal-assets/generate.mjs <batch-name>` (dry-run) then `--go`.
Registers: `cinematic` · `pixel` · `skate` · `raw`.

## Before spending, ground the work

Cheaper than a bad generation:

- `mcp__shaddai__shaddai_turtle` — art direction, palettes, silhouette calls.
- `mcp__shaddai__shaddai_quill` — prompt and description wording.
- `mcp__shaddai__rag_search` / `mcp__shaddai__memory_search` — what this world
  already decided, before inventing a new answer.
- `mcp__aura__aura_ask` / `aura_compress` — pull prior context without
  re-reading whole files into the window; `aura_remember` to bank a finding.

Use these for *decisions*. Use `forge.mjs` for *production*. Don't route
generation through MCP image tools — the forge CLI is where the cost controls,
manifests, and parity checks live.

## Check your work with your eyes

After `--go`, Read one sprite PNG. The pipeline reports success on files that
exist, not on files that look right — a crumpled mesh, a cropped head, or an
off-model outfit all exit 0. One image Read is the cheapest QA in this repo.

## When something fails

Read `references/gotchas.md` **before** debugging. Thirteen failure modes in
there are already paid for, including the ones that look like something else:
rigging timeouts that aren't pose failures, background jobs that report exit 0
while the log says FAILED, and `git add` silently staging nothing.

Deeper background, if the gotchas don't cover it:
- `fal-assets/CHARACTER_WORKFLOW.md` — the long-form recipe.
- `docs/superpowers/specs/2026-09-18-realm-art-direction-neon-city-and-tech-fusion-regions-design.md`
  — which realm gets which theme, palette, mount, and vehicle.

## Scope guards

- **Never wire payment flows.** PayBox is real money rails; the owner
  authorizes it themselves via `/mcp`.
- **Confirm visual direction before building anything non-trivial.** The owner
  would rather approve a concept than pay for a finished thing they didn't want.
- Default to **tall, real proportions** (7–8 heads). Chibi is opt-in now.
