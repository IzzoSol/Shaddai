# Shaddai World — Claude Code operating contract

Persistent 3D web world where humans and AI agents live, work, play, trade, learn and battle.
Stack (discovered 2026-10-15): vanilla JS + three@0.180 (ES modules, no bundler), Node 20 + Express + ws, JSON/JSONL file stores.
Start with `docs/MASTER-TRACKER.md` (owner order + status) and `docs/SHADDAI-WORLD-MANUAL-GAP-20261015.md` (this manual vs the repo).

## Hard rules
- Discover the real repo before proposing architecture. Measure before optimizing; no perf claim without before/after numbers.
- One change category and one branch per phase; tag before and after; never merge or push to main/beta without owner approval.
- Preserve gameplay, visuals and existing features. Ask before deleting files, changing art direction or rewriting core systems.
- Secrets stay server-side: no keys, tokens or wallet secrets in client code, logs, bundles or git.
- No paid services (fal, providers) or new production dependencies without approval. Dev-only tools (Playwright, stats, gltf-transform) are pre-approved.
- Agents are untrusted principals: they act only through server-side tools, via `gateway/pikadon-kernel.js`.
- The server is authoritative for economy, ownership, combat, items and world state. The client renders and requests.
- Ask one focused question when something is ambiguous. If a metric got worse, say so plainly.
- Money, wagering, minted assets, **token issuance**, custody or wallet movement: flag for human legal review, never build silently.
- Token policy (owner 2026-10-15): **no token staking; a token is OPTIONAL** and only if the owner decides to use one.

## Repo rules (owner)
- Futuristic only; owner approves visuals; one heavy job at a time (8 GB laptop); headless browser only, never visible.
- `*.glb` are gitignored (`git add -f`); bump `?v=` on edited script tags; ask before fal spend or any delete.
- Tick a tracker item only when wired into the game AND tested.

## Definition of done
build/typecheck/lint/tests pass · no new console warnings · no memory leak over repeated scene transitions · no perf regression beyond
threshold · visual diff within threshold · no secrets in bundle/history · every agent write permission-checked, schema-validated, audit-logged ·
docs updated · before/after metrics included.

## Workflow
Discover → Verify (official docs before any provider/pricing code) → Decide (2–3 options, wait for approval) → Plan (files, schema, tests,
rollback) → Implement small → Prove (tests, benchmark, red-team) → Report.

## End every task with
Summary · files changed · commands run · before/after metrics · tests + red-team results · risks/regressions · open questions · next best action.
