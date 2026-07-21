# Forge 3D Pipeline — image → procedural Three.js agent

Status: **bootstrapped 2026-07-21.** The toolkit is vendored and verified running in-repo. This is the engine behind the Forge's **Build** step (currently "coming soon" in the UI).

## What this is (and isn't)
`tools/object-sculptor/` is the **Three.js Object Sculptor** (MIT, vendored from the owner's Codex plugin). It is an **agent-guided procedural sculpting toolkit** — Python scripts + a skill that walk an AI (Claude) through turning a **reference image** into a **code-only Three.js model** with quality gates, comparison sheets, and AI-vision review.

It is **not**:
- a one-click / real-time "selfie → GLB in 60 seconds" service (its own FAQ confirms: no GLB by default, not photogrammetry),
- something that runs in a user's browser.

So there are **two tracks** to the Forge's "Build":
1. **Now (this toolkit):** *we* generate high-quality procedural 3D agent models from reference images at dev time. Output = a Three.js factory (`createSculptModel`) that becomes a **forge preset / marketplace asset**. No external API, no keys, no cost.
2. **Later (funds):** the live user-facing "prompt/selfie → agent in 60s" needs a hosted image→3D service (Meshy-class) + the `<agent-3d>` web component + x402 pay-per-chat. This toolkit's output seeds the preset library that ships before that lands.

## Verified
- Python 3.12 present. `python tools/object-sculptor/scripts/sculpt.py --help` works.
- `sculpt.py init "…" --complexity moderate --intended-use browser-prop --quality-profile balanced --out workspace/<spec>.json` → creates a v4 spec; `status` shows it.

## Workflow (dev-time, per agent model)
From `tools/object-sculptor/`:
```bash
# 1. init a spec from a reference image
python scripts/sculpt.py init "SHADDAI Agent — Neon Valkyrie" \
  --image ../../public/assets/agents/ZEROX-ref.png \
  --complexity moderate --intended-use browser-prop \
  --quality-profile balanced --out workspace/zerox-spec.json

# 2. register review views, then build modules (blockout → form → lookdev …)
python scripts/sculpt.py status workspace/zerox-spec.json
#    (module add / build / evaluate / review per README — AI vision is the gate)

# 3. generate the Three.js factory
python scripts/sculpt.py generate workspace/zerox-spec.json \
  --out ../../public/agents-3d/zerox.generated.ts \
  --wrapper-out ../../public/agents-3d/zerox.ts
```
Rendered output + `window.__THREEJS_SCULPT_CAPTURE_RUNTIME__()` screenshots feed `compare` + `review`. See `tools/object-sculptor/PLUGIN-README.md` for the full gated flow and the `skills/object-to-threejs-procedural/SKILL.md` for the agent methodology.

## How it feeds the Forge
- Generated factories land in `public/agents-3d/` → registered as **Forge presets** (the "Ready-made presets" row in `command-terminal.js renderForge()`), and later as **marketplace** listings (`/api/gallery` is already per-user + listable).
- When the live service track is funded, the same `<agent-3d>` component renders these models; earnings via x402 (03 Earn).

## Guardrails
- `tools/object-sculptor/workspace/` and any `.sculpt-cache/` are **gitignored** (spec/render churn).
- The toolkit is stdlib-Python + shell image tools — no keys, nothing to leak.
- AI vision review is the acceptance authority; don't ship a model that fails a critical-feature gate.
